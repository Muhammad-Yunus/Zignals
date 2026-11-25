import type { WallItem } from '../types/zignals.ts';

interface RawRun {
  pos: number; // y for horizontal, x for vertical
  start: number; // x1 for horizontal, y1 for vertical
  end: number; // x2 for horizontal, y2 for vertical
}

interface SegmentCluster {
  orientation: 'h' | 'v';
  positions: number[];
  starts: number[];
  ends: number[];
  minPos: number;
  maxPos: number;
}

const DEFAULT_THICKNESS: Record<string, number> = {
  concrete: 8,
  brick: 6,
  drywall: 4,
  wood: 4,
  glass: 3,
  metal: 7,
  door: 3,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function clusterAxisRuns(runs: RawRun[], orientation: 'h' | 'v', maxPosGap = 2): SegmentCluster[] {
  const clusters: SegmentCluster[] = [];

  for (const run of runs) {
    let bestCluster: SegmentCluster | null = null;
    let bestOverlap = 0;

    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i];
      if (run.pos - c.maxPos > maxPosGap) {
        // Since runs are ordered by pos, older clusters won't match
        if (run.pos - c.maxPos > 6) break;
        continue;
      }

      const cStart = c.starts[c.starts.length - 1];
      const cEnd = c.ends[c.ends.length - 1];
      const overlap = Math.min(run.end, cEnd) - Math.max(run.start, cStart);
      const minLen = Math.min(run.end - run.start, cEnd - cStart);

      if (overlap >= Math.max(6, minLen * 0.45) && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCluster = c;
      }
    }

    if (bestCluster) {
      bestCluster.positions.push(run.pos);
      bestCluster.starts.push(run.start);
      bestCluster.ends.push(run.end);
      bestCluster.maxPos = Math.max(bestCluster.maxPos, run.pos);
    } else {
      clusters.push({
        orientation,
        positions: [run.pos],
        starts: [run.start],
        ends: [run.end],
        minPos: run.pos,
        maxPos: run.pos,
      });
    }
  }

  return clusters;
}

function pointToSegmentDist(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { dist: number; projX: number; projY: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - x1, py - y1), projX: x1, projY: y1, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { dist: Math.hypot(px - projX, py - projY), projX, projY, t };
}

export interface CvDetectionOptions {
  materialThicknessMap?: Map<string, number>;
  sensitivity?: 'auto' | 'thick' | 'thin';
}

export interface CvDetectionOutput {
  walls: Omit<WallItem, 'id'>[];
  modeUsed: 'thick-wall' | 'thin-cad';
}

/**
 * Deterministic 2D Computer Vision architectural wall extractor:
 * 1. Adaptive histogram background estimation + binarization
 * 2. 3x3 & 5x5 morphological stroke-width filtering (rejects 1px furniture & text)
 *    with automatic thin-CAD long-run fallback when drawings use hollow/thin walls
 * 3. Directional run clustering for exact horizontal & vertical centerlines
 * 4. Hough line transform on residual pixels for diagonal walls
 * 5. Collinear segment merging & L/T-corner endpoint snapping (prevents RF leakage)
 */
export function detectWallsFromImageData(
  imageData: ImageData,
  options: CvDetectionOptions = {}
): CvDetectionOutput {
  const W = imageData.width;
  const H = imageData.height;
  const rgba = imageData.data;
  const totalPixels = W * H;

  // 1. Grayscale & luminance histogram
  const gray = new Uint8Array(totalPixels);
  const alphaOk = new Uint8Array(totalPixels);
  const hist = new Uint32Array(256);
  let validCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const a = rgba[idx + 3];
    if (a < 64) {
      gray[i] = 255;
      alphaOk[i] = 0;
      continue;
    }
    alphaOk[i] = 1;
    const l = Math.round(0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]);
    gray[i] = l;
    hist[l]++;
    validCount++;
  }

  // Estimate dominant bright background luminance (80th percentile)
  let bgLum = 248;
  if (validCount > 0) {
    const target80 = validCount * 0.8;
    let cum = 0;
    for (let b = 0; b < 256; b++) {
      cum += hist[b];
      if (cum >= target80) {
        bgLum = b;
        break;
      }
    }
  }

  const darkThresh = Math.min(175, Math.max(75, Math.round(bgLum * 0.64)));
  const dark = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    if (alphaOk[i] && gray[i] < darkThresh) {
      dark[i] = 1;
    }
  }

  // 2. Morphological stroke-width mask (keeps >= 2.5px solid walls, suppresses 1px furniture/text)
  const thickMask = new Uint8Array(totalPixels);
  let thickCount = 0;

  for (let y = 2; y < H - 2; y++) {
    const rowOff = y * W;
    for (let x = 2; x < W - 2; x++) {
      const idx = rowOff + x;
      if (!dark[idx]) continue;

      let c3 = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const r = (y + dy) * W;
        c3 += dark[r + x - 1] + dark[r + x] + dark[r + x + 1];
      }
      if (c3 < 6) continue;

      let c5 = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const r = (y + dy) * W;
        c5 +=
          dark[r + x - 2] +
          dark[r + x - 1] +
          dark[r + x] +
          dark[r + x + 1] +
          dark[r + x + 2];
      }

      if (c5 >= 11) {
        thickMask[idx] = 1;
        thickCount++;
      }
    }
  }

  // Decide between thick-wall mask and thin-CAD long-run mode
  const thickRatio = thickCount / Math.max(1, totalPixels);
  const useThinMode =
    options.sensitivity === 'thin' ||
    (options.sensitivity !== 'thick' && thickRatio < 0.0045);

  const workMask = useThinMode ? dark : thickMask;
  const minRunLen = useThinMode ? 28 : 16;
  const minClusterRows = useThinMode ? 1 : 2;
  const maxBridgeGap = 2;

  // 3a. Horizontal run extraction
  const hRuns: RawRun[] = [];
  for (let y = 1; y < H - 1; y++) {
    const rowOff = y * W;
    let x = 1;
    while (x < W - 1) {
      if (!workMask[rowOff + x]) {
        x++;
        continue;
      }
      const start = x;
      let end = x;
      let gap = 0;
      x++;
      while (x < W - 1) {
        if (workMask[rowOff + x]) {
          end = x;
          gap = 0;
        } else {
          gap++;
          if (gap > maxBridgeGap) break;
        }
        x++;
      }
      if (end - start + 1 >= minRunLen) {
        hRuns.push({ pos: y, start, end });
      }
    }
  }

  // 3b. Vertical run extraction
  const vRuns: RawRun[] = [];
  for (let x = 1; x < W - 1; x++) {
    let y = 1;
    while (y < H - 1) {
      if (!workMask[y * W + x]) {
        y++;
        continue;
      }
      const start = y;
      let end = y;
      let gap = 0;
      y++;
      while (y < H - 1) {
        if (workMask[y * W + x]) {
          end = y;
          gap = 0;
        } else {
          gap++;
          if (gap > maxBridgeGap) break;
        }
        y++;
      }
      if (end - start + 1 >= minRunLen) {
        vRuns.push({ pos: x, start, end });
      }
    }
  }

  const hClusters = clusterAxisRuns(hRuns, 'h', 2);
  const vClusters = clusterAxisRuns(vRuns, 'v', 2);

  interface ExtractedSeg {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    strokePx: number;
    axis: 'h' | 'v' | 'd';
  }

  const rawSegs: ExtractedSeg[] = [];

  for (const c of hClusters) {
    const uniqueRows = c.maxPos - c.minPos + 1;
    if (uniqueRows < minClusterRows && !useThinMode) continue;
    // Skip gigantic solid black blocks (e.g. dark photo margins > 32px thick)
    if (uniqueRows > 32) continue;

    const yCenter = Math.round(
      c.positions.reduce((acc, v) => acc + v, 0) / c.positions.length
    );
    const x1 = Math.round(median(c.starts));
    const x2 = Math.round(median(c.ends));
    if (x2 - x1 >= minRunLen) {
      rawSegs.push({
        x1,
        y1: yCenter,
        x2,
        y2: yCenter,
        strokePx: uniqueRows,
        axis: 'h',
      });
    }
  }

  for (const c of vClusters) {
    const uniqueCols = c.maxPos - c.minPos + 1;
    if (uniqueCols < minClusterRows && !useThinMode) continue;
    if (uniqueCols > 32) continue;

    const xCenter = Math.round(
      c.positions.reduce((acc, v) => acc + v, 0) / c.positions.length
    );
    const y1 = Math.round(median(c.starts));
    const y2 = Math.round(median(c.ends));
    if (y2 - y1 >= minRunLen) {
      rawSegs.push({
        x1: xCenter,
        y1,
        x2: xCenter,
        y2,
        strokePx: uniqueCols,
        axis: 'v',
      });
    }
  }

  // 4. Residual Hough transform for diagonal walls (angled rooms/bay windows)
  const residualPoints: { x: number; y: number }[] = [];
  for (let y = 2; y < H - 2; y += 2) {
    const rowOff = y * W;
    for (let x = 2; x < W - 2; x += 2) {
      if (!workMask[rowOff + x]) continue;
      let covered = false;
      for (let i = 0; i < rawSegs.length; i++) {
        const s = rawSegs[i];
        if (
          x >= Math.min(s.x1, s.x2) - 8 &&
          x <= Math.max(s.x1, s.x2) + 8 &&
          y >= Math.min(s.y1, s.y2) - 8 &&
          y <= Math.max(s.y1, s.y2) + 8
        ) {
          if (pointToSegmentDist(x, y, s.x1, s.y1, s.x2, s.y2).dist <= 7) {
            covered = true;
            break;
          }
        }
      }
      if (!covered) {
        residualPoints.push({ x, y });
      }
    }
  }

  if (residualPoints.length >= 35 && residualPoints.length < 15000) {
    const anglesDeg: number[] = [];
    for (let deg = 9; deg <= 81; deg += 3) anglesDeg.push(deg);
    for (let deg = 99; deg <= 171; deg += 3) anglesDeg.push(deg);

    const maxRho = Math.ceil(Math.hypot(W, H));
    const rhoBins = maxRho * 2 + 1;
    const cosTable = anglesDeg.map((d) => Math.cos((d * Math.PI) / 180));
    const sinTable = anglesDeg.map((d) => Math.sin((d * Math.PI) / 180));

    const active = new Uint8Array(residualPoints.length);
    active.fill(1);

    for (let peakIter = 0; peakIter < 8; peakIter++) {
      const acc = new Uint16Array(anglesDeg.length * rhoBins);
      let bestVotes = 0;
      let bestA = -1;
      let bestR = -1;

      for (let p = 0; p < residualPoints.length; p++) {
        if (!active[p]) continue;
        const { x, y } = residualPoints[p];
        for (let a = 0; a < anglesDeg.length; a++) {
          const r = Math.round(x * cosTable[a] + y * sinTable[a]) + maxRho;
          if (r >= 0 && r < rhoBins) {
            const idx = a * rhoBins + r;
            const v = ++acc[idx];
            if (v > bestVotes) {
              bestVotes = v;
              bestA = a;
              bestR = r;
            }
          }
        }
      }

      if (bestVotes < 16 || bestA < 0) break;

      const cosA = cosTable[bestA];
      const sinA = sinTable[bestA];
      const rhoVal = bestR - maxRho;
      const dirX = -sinA;
      const dirY = cosA;

      const projected: { t: number; idx: number }[] = [];
      for (let p = 0; p < residualPoints.length; p++) {
        if (!active[p]) continue;
        const { x, y } = residualPoints[p];
        const dist = Math.abs(x * cosA + y * sinA - rhoVal);
        if (dist <= 3.5) {
          projected.push({ t: x * dirX + y * dirY, idx: p });
        }
      }

      projected.sort((a, b) => a.t - b.t);
      let runStart = 0;
      for (let i = 1; i <= projected.length; i++) {
        const isBreak =
          i === projected.length || projected[i].t - projected[i - 1].t > 9;
        if (isBreak) {
          const span = projected[i - 1].t - projected[runStart].t;
          if (span >= 28 && i - runStart >= 10) {
            const t0 = projected[runStart].t;
            const t1 = projected[i - 1].t;
            const x1 = Math.round(rhoVal * cosA + t0 * dirX);
            const y1 = Math.round(rhoVal * sinA + t0 * dirY);
            const x2 = Math.round(rhoVal * cosA + t1 * dirX);
            const y2 = Math.round(rhoVal * sinA + t1 * dirY);
            rawSegs.push({
              x1: Math.max(0, Math.min(W, x1)),
              y1: Math.max(0, Math.min(H, y1)),
              x2: Math.max(0, Math.min(W, x2)),
              y2: Math.max(0, Math.min(H, y2)),
              strokePx: 5,
              axis: 'd',
            });
            for (let k = runStart; k < i; k++) {
              active[projected[k].idx] = 0;
            }
          }
          runStart = i;
        }
      }
    }
  }

  // 5. Merge collinear horizontal & vertical segments with small gaps
  const mergedH: ExtractedSeg[] = [];
  const hSegs = rawSegs
    .filter((s) => s.axis === 'h')
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

  for (const seg of hSegs) {
    let didMerge = false;
    for (let i = mergedH.length - 1; i >= 0; i--) {
      const m = mergedH[i];
      if (Math.abs(seg.y1 - m.y1) <= 5) {
        const overlapOrClose = seg.x1 <= m.x2 + 8 && seg.x2 >= m.x1 - 8;
        if (overlapOrClose) {
          m.x1 = Math.min(m.x1, seg.x1);
          m.x2 = Math.max(m.x2, seg.x2);
          m.y1 = Math.round((m.y1 + seg.y1) / 2);
          m.y2 = m.y1;
          m.strokePx = Math.max(m.strokePx, seg.strokePx);
          didMerge = true;
          break;
        }
      }
    }
    if (!didMerge) mergedH.push({ ...seg });
  }

  const mergedV: ExtractedSeg[] = [];
  const vSegs = rawSegs
    .filter((s) => s.axis === 'v')
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

  for (const seg of vSegs) {
    let didMerge = false;
    for (let i = mergedV.length - 1; i >= 0; i--) {
      const m = mergedV[i];
      if (Math.abs(seg.x1 - m.x1) <= 5) {
        const overlapOrClose = seg.y1 <= m.y2 + 8 && seg.y2 >= m.y1 - 8;
        if (overlapOrClose) {
          m.y1 = Math.min(m.y1, seg.y1);
          m.y2 = Math.max(m.y2, seg.y2);
          m.x1 = Math.round((m.x1 + seg.x1) / 2);
          m.x2 = m.x1;
          m.strokePx = Math.max(m.strokePx, seg.strokePx);
          didMerge = true;
          break;
        }
      }
    }
    if (!didMerge) mergedV.push({ ...seg });
  }

  // Merge parallel double-line hollow CAD walls (3..11px apart with strong overlap)
  const collapseDoubleLines = (segs: ExtractedSeg[], axis: 'h' | 'v'): ExtractedSeg[] => {
    if (!useThinMode) return segs;
    const used = new Uint8Array(segs.length);
    const out: ExtractedSeg[] = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      const a = segs[i];
      let partnerIdx = -1;
      for (let j = i + 1; j < segs.length; j++) {
        if (used[j]) continue;
        const b = segs[j];
        const perpDist = axis === 'h' ? Math.abs(a.y1 - b.y1) : Math.abs(a.x1 - b.x1);
        if (perpDist < 3 || perpDist > 12) continue;
        const aMin = axis === 'h' ? a.x1 : a.y1;
        const aMax = axis === 'h' ? a.x2 : a.y2;
        const bMin = axis === 'h' ? b.x1 : b.y1;
        const bMax = axis === 'h' ? b.x2 : b.y2;
        const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
        const minLen = Math.min(aMax - aMin, bMax - bMin);
        if (overlap >= minLen * 0.55) {
          partnerIdx = j;
          break;
        }
      }
      if (partnerIdx >= 0) {
        used[partnerIdx] = 1;
        const b = segs[partnerIdx];
        if (axis === 'h') {
          const cy = Math.round((a.y1 + b.y1) / 2);
          out.push({
            x1: Math.min(a.x1, b.x1),
            y1: cy,
            x2: Math.max(a.x2, b.x2),
            y2: cy,
            strokePx: Math.max(4, Math.abs(a.y1 - b.y1)),
            axis: 'h',
          });
        } else {
          const cx = Math.round((a.x1 + b.x1) / 2);
          out.push({
            x1: cx,
            y1: Math.min(a.y1, b.y1),
            x2: cx,
            y2: Math.max(a.y2, b.y2),
            strokePx: Math.max(4, Math.abs(a.x1 - b.x1)),
            axis: 'v',
          });
        }
      } else {
        out.push(a);
      }
    }
    return out;
  };

  const finalH = collapseDoubleLines(mergedH, 'h');
  const finalV = collapseDoubleLines(mergedV, 'v');

  const combined: ExtractedSeg[] = [
    ...finalH,
    ...finalV,
    ...rawSegs.filter((s) => s.axis === 'd'),
  ];

  // 6. Snap nearby endpoints to form sealed L/T corners (prevents RF leakage)
  const snapRadius = 10;
  for (let i = 0; i < combined.length; i++) {
    const a = combined[i];
    const endpoints: Array<'p1' | 'p2'> = ['p1', 'p2'];

    for (const ep of endpoints) {
      const px = ep === 'p1' ? a.x1 : a.x2;
      const py = ep === 'p1' ? a.y1 : a.y2;

      let bestDist = snapRadius;
      let targetX = px;
      let targetY = py;

      for (let j = 0; j < combined.length; j++) {
        if (i === j) continue;
        const b = combined[j];
        const d1 = Math.hypot(px - b.x1, py - b.y1);
        if (d1 < bestDist) {
          bestDist = d1;
          targetX = b.x1;
          targetY = b.y1;
        }
        const d2 = Math.hypot(px - b.x2, py - b.y2);
        if (d2 < bestDist) {
          bestDist = d2;
          targetX = b.x2;
          targetY = b.y2;
        }
        const proj = pointToSegmentDist(px, py, b.x1, b.y1, b.x2, b.y2);
        if (proj.dist < bestDist) {
          bestDist = proj.dist;
          targetX = Math.round(proj.projX);
          targetY = Math.round(proj.projY);
        }
      }

      if (bestDist < snapRadius) {
        if (ep === 'p1') {
          if (a.axis === 'h') {
            a.x1 = targetX;
          } else if (a.axis === 'v') {
            a.y1 = targetY;
          } else {
            a.x1 = targetX;
            a.y1 = targetY;
          }
        } else {
          if (a.axis === 'h') {
            a.x2 = targetX;
          } else if (a.axis === 'v') {
            a.y2 = targetY;
          } else {
            a.x2 = targetX;
            a.y2 = targetY;
          }
        }
      }
    }
  }

  // Filter out tiny artifacts and classify material by wall thickness
  const finalWalls: Omit<WallItem, 'id'>[] = [];
  for (const s of combined) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (len < 16) continue;

    let materialSlug = 'concrete';
    if (useThinMode) {
      materialSlug = len > Math.min(W, H) * 0.35 ? 'concrete' : 'brick';
    } else if (s.strokePx >= 6) {
      materialSlug = 'concrete';
    } else if (s.strokePx >= 4) {
      materialSlug = 'brick';
    } else {
      materialSlug = 'drywall';
    }

    const thickness =
      options.materialThicknessMap?.get(materialSlug) ??
      DEFAULT_THICKNESS[materialSlug] ??
      6;

    finalWalls.push({
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      materialSlug,
      thickness,
    });
  }

  return {
    walls: finalWalls.slice(0, 300),
    modeUsed: useThinMode ? 'thin-cad' : 'thick-wall',
  };
}

/**
 * Helper to extract ImageData at exact canvas dimensions from an image data URL in the browser.
 */
export function extractImageDataFromDataUrl(
  dataUrl: string,
  width: number,
  height: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not initialize 2D canvas context.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = () => reject(new Error('Failed to decode floorplan image.'));
    img.src = dataUrl;
  });
}
