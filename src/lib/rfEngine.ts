import type {
  BandType,
  CeilingMaterial,
  EnvironmentType,
  FloorData,
  RouterItem,
  SimulationMode,
  WallItem,
  WallMaterialRecord,
} from '../types/zignals.ts';

export const ENVIRONMENT_PATH_LOSS: Record<EnvironmentType, number> = {
  Home: 2.65,
  Apartment: 2.95,
  Office: 2.5,
  Warehouse: 2.15,
};

export const CEILING_ATTENUATION_DB: Record<CeilingMaterial, number> = {
  Concrete: 16,
  Brick: 12,
  Wood: 6,
  Drywall: 4,
  Open: 0,
};

export const BAND_REF_LOSS_1M: Record<BandType, number> = {
  '2.4 GHz': 40.05,
  '5 GHz': 46.42,
  '6 GHz': 48.0,
};

export const ROUTER_ZONE_COLORS: [number, number, number][] = [
  [2, 132, 199],   // Sky blue (Router-1)
  [16, 185, 129],  // Emerald (Router-2)
  [139, 92, 246],  // Violet (Router-3)
  [245, 158, 11],  // Amber (Router-4)
  [236, 72, 153],  // Rose (Router-5)
  [20, 184, 166],  // Teal (Router-6)
  [99, 102, 241],  // Indigo
  [234, 88, 12],   // Orange
];

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const cdx = dx - cx;
  const cdy = dy - cy;

  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) < 1e-9) return false;

  const acx = cx - ax;
  const acy = cy - ay;
  const t = (acx * cdy - acy * cdx) / denom;
  if (t <= 0 || t >= 1) return false;

  const u = (acx * aby - acy * abx) / denom;
  return u > 0 && u < 1;
}

export function getWallAttenuationDb(
  materialSlug: string,
  band: BandType,
  materialMap: Map<string, WallMaterialRecord>
): number {
  const mat = materialMap.get(materialSlug);
  if (!mat) return 6;
  if (band === '5 GHz') return mat.attenuation5GhzDb;
  if (band === '6 GHz') return mat.attenuation6GhzDb;
  return mat.attenuation24GhzDb;
}

export interface PointSignalReading {
  bestRssiDbm: number;
  servingRouterIndex: number;
  servingRouter: RouterItem | null;
  distanceMeters: number;
  wallsCrossed: number;
  wallLossDb: number;
  snrDb: number;
  qualityLabel: 'Excellent' | 'Good' | 'Fair' | 'Weak' | 'Dead zone';
}

export function buildMaterialMap(materials: WallMaterialRecord[]): Map<string, WallMaterialRecord> {
  const map = new Map<string, WallMaterialRecord>();
  for (const m of materials) {
    map.set(m.slug, m);
  }
  return map;
}

export function computePointSignal(
  px: number,
  py: number,
  activeFloor: FloorData,
  allFloors: FloorData[],
  environment: EnvironmentType,
  mode: SimulationMode,
  materialMap: Map<string, WallMaterialRecord>,
  isolatedRouterId?: string | number | null
): PointSignalReading {
  const scale = Math.max(0.2, activeFloor.scalePxPerMeter);
  const pathLossExp = ENVIRONMENT_PATH_LOSS[environment] ?? 2.65;
  const noiseFloorDbm = mode === 'zigbee' ? -98 : -95;

  let bestRssi = -120;
  let bestIdx = -1;
  let bestRouter: RouterItem | null = null;
  let bestDistMeters = 0;
  let bestWallsCrossed = 0;
  let bestWallLoss = 0;

  // Include active floor routers, plus adjacent floor bleed-through if not isolating
  const candidateRouters: {
    router: RouterItem;
    index: number;
    floorDelta: number;
    ceilingLossDb: number;
  }[] = [];

  activeFloor.routers.forEach((r, idx) => {
    if (isolatedRouterId !== null && isolatedRouterId !== undefined && r.id !== isolatedRouterId) {
      return;
    }
    candidateRouters.push({
      router: r,
      index: idx,
      floorDelta: 0,
      ceilingLossDb: 0,
    });
  });

  if (isolatedRouterId === null || isolatedRouterId === undefined) {
    for (const otherFloor of allFloors) {
      if (otherFloor.id === activeFloor.id) continue;
      const floorDelta = Math.abs(otherFloor.floorOrder - activeFloor.floorOrder);
      if (floorDelta > 1) continue;
      const lowerFloor =
        otherFloor.floorOrder < activeFloor.floorOrder ? otherFloor : activeFloor;
      const ceilingLoss = CEILING_ATTENUATION_DB[lowerFloor.ceilingMaterial] ?? 16;

      otherFloor.routers.forEach((r) => {
        candidateRouters.push({
          router: r,
          index: -1,
          floorDelta,
          ceilingLossDb: ceilingLoss,
        });
      });
    }
  }

  for (const cand of candidateRouters) {
    const r = cand.router;
    const dxPx = px - r.x;
    const dyPx = py - r.y;
    const dist2dMeters = Math.hypot(dxPx, dyPx) / scale;
    const dist3dMeters = Math.max(0.8, Math.hypot(dist2dMeters, cand.floorDelta * 3.0));

    const refLoss = BAND_REF_LOSS_1M[r.band] ?? 40.05;
    const freeSpaceLoss = refLoss + 10 * pathLossExp * Math.log10(dist3dMeters);

    let wallLoss = cand.ceilingLossDb;
    let wallsCrossed = 0;

    // Only intersect walls on the active floor for 2D horizontal propagation
    if (cand.floorDelta === 0) {
      const minX = Math.min(px, r.x);
      const maxX = Math.max(px, r.x);
      const minY = Math.min(py, r.y);
      const maxY = Math.max(py, r.y);

      for (let i = 0; i < activeFloor.walls.length; i++) {
        const w = activeFloor.walls[i];
        if (
          Math.max(w.x1, w.x2) < minX ||
          Math.min(w.x1, w.x2) > maxX ||
          Math.max(w.y1, w.y2) < minY ||
          Math.min(w.y1, w.y2) > maxY
        ) {
          continue;
        }
        if (segmentsIntersect(r.x, r.y, px, py, w.x1, w.y1, w.x2, w.y2)) {
          wallsCrossed++;
          wallLoss += getWallAttenuationDb(w.materialSlug, r.band, materialMap);
        }
      }
    }

    const eirp = r.txPowerDbm + (r.antennaGainDbi ?? 2);
    const rssi = eirp - freeSpaceLoss - wallLoss;

    if (rssi > bestRssi) {
      bestRssi = rssi;
      bestIdx = cand.index;
      bestRouter = r;
      bestDistMeters = dist3dMeters;
      bestWallsCrossed = wallsCrossed;
      bestWallLoss = wallLoss;
    }
  }

  const snrDb = Math.max(0, Math.round(bestRssi - noiseFloorDbm));
  let qualityLabel: PointSignalReading['qualityLabel'] = 'Dead zone';
  if (bestRssi >= -62) qualityLabel = 'Excellent';
  else if (bestRssi >= -74) qualityLabel = 'Good';
  else if (bestRssi >= -85) qualityLabel = 'Fair';
  else if (bestRssi >= -93) qualityLabel = 'Weak';

  return {
    bestRssiDbm: bestRssi,
    servingRouterIndex: bestIdx,
    servingRouter: bestRouter,
    distanceMeters: bestDistMeters,
    wallsCrossed: bestWallsCrossed,
    wallLossDb: bestWallLoss,
    snrDb,
    qualityLabel,
  };
}

// Smooth perceptual heatmap color ramp matching the mockup (-95 dBm rose/red -> -85 dBm orange/yellow -> -70 dBm mint green -> -55 dBm deep cyan/blue)
export function rssiToRgba(rssiDbm: number): [number, number, number, number] {
  if (rssiDbm <= -96) return [255, 255, 255, 0];

  // Clamp into [-96, -50]
  const t = Math.max(0, Math.min(1, (rssiDbm - -96) / (-50 - -96)));

  const stops: [number, number, number, number, number][] = [
    [0.0, 255, 235, 238, 0],     // Transparent fade edge
    [0.14, 248, 165, 178, 145],  // Soft coral/rose (-90)
    [0.28, 251, 146, 128, 175],  // Warm salmon/orange (-83)
    [0.45, 253, 210, 102, 185],  // Golden yellow (-75)
    [0.64, 152, 230, 158, 192],  // Mint green (-67)
    [0.82, 56, 206, 200, 205],   // Bright cyan (-58)
    [1.0, 29, 125, 224, 220],    // Rich signal blue (-50)
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const f = (t - a[0]) / (b[0] - a[0]);
      return [
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
        Math.round(a[4] + (b[4] - a[4]) * f),
      ];
    }
  }
  return [29, 125, 224, 220];
}

export interface FloorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getFloorInteriorBounds(floor: FloorData): FloorBounds {
  if (floor.walls.length >= 3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const w of floor.walls) {
      minX = Math.min(minX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      maxX = Math.max(maxX, w.x1, w.x2);
      maxY = Math.max(maxY, w.y1, w.y2);
    }
    if (maxX - minX > 40 && maxY - minY > 40) {
      return { minX, minY, maxX, maxY };
    }
  }
  return {
    minX: 10,
    minY: 10,
    maxX: floor.canvasWidth - 10,
    maxY: floor.canvasHeight - 10,
  };
}

function distPointToSegInfo(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { dist: number; projX: number; projY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return { dist: Math.hypot(px - x1, py - y1), projX: x1, projY: y1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { dist: Math.hypot(px - projX, py - projY), projX, projY };
}

function distPointToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return distPointToSegInfo(px, py, x1, y1, x2, y2).dist;
}

/**
 * Extracts evaluation points & candidate router positions strictly INSIDE enclosed rooms.
 * Uses a padded gap-bridged wall raster + exterior flood-fill (with 16-ray enclosure fallback)
 * so L-shaped notches, exterior margins, and empty canvas areas around the building are excluded.
 */
export function getFloorInteriorSamples(floor: FloorData): {
  bounds: FloorBounds;
  evalPoints: { x: number; y: number }[];
  candPositions: { x: number; y: number }[];
  isRoomMasked: boolean;
} {
  const bounds = getFloorInteriorBounds(floor);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;

  const fallbackGrid = (): {
    bounds: FloorBounds;
    evalPoints: { x: number; y: number }[];
    candPositions: { x: number; y: number }[];
    isRoomMasked: boolean;
  } => {
    const evalPoints: { x: number; y: number }[] = [];
    const eCols = 24;
    const eRows = 24;
    for (let r = 0; r < eRows; r++) {
      const y = bounds.minY + ((r + 0.5) / eRows) * spanY;
      for (let c = 0; c < eCols; c++) {
        const x = bounds.minX + ((c + 0.5) / eCols) * spanX;
        evalPoints.push({ x, y });
      }
    }
    const padX = Math.min(24, spanX * 0.06);
    const padY = Math.min(24, spanY * 0.06);
    const candPositions: { x: number; y: number }[] = [];
    for (let r = 0; r < 9; r++) {
      const y = bounds.minY + padY + (r / 8) * (spanY - 2 * padY);
      for (let c = 0; c < 9; c++) {
        const x = bounds.minX + padX + (c / 8) * (spanX - 2 * padX);
        candPositions.push({ x: Math.round(x), y: Math.round(y) });
      }
    }
    return { bounds, evalPoints, candPositions, isRoomMasked: false };
  };

  if (floor.walls.length < 3 || spanX < 40 || spanY < 40) {
    return fallbackGrid();
  }

  const cellSize = 6;
  const cols = Math.ceil(floor.canvasWidth / cellSize) + 2;
  const rows = Math.ceil(floor.canvasHeight / cellSize) + 2;
  const totalCells = cols * rows;

  const rawWallGrid = new Uint8Array(totalCells);
  const sealedWallGrid = new Uint8Array(totalCells);

  const rasterizeSegment = (
    target: Uint8Array,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(len / 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const gx = Math.max(1, Math.min(cols - 2, Math.floor(px / cellSize) + 1));
      const gy = Math.max(1, Math.min(rows - 2, Math.floor(py / cellSize) + 1));
      target[gy * cols + gx] = 1;
    }
  };

  for (const w of floor.walls) {
    rasterizeSegment(rawWallGrid, w.x1, w.y1, w.x2, w.y2);
    rasterizeSegment(sealedWallGrid, w.x1, w.y1, w.x2, w.y2);
  }

  // Bridge typical doorway / CV gaps (<= 42px) between wall endpoints and nearby walls
  // ONLY inside sealedWallGrid so exterior flood-fill doesn't leak through doorways.
  const endpoints: { x: number; y: number; wallIdx: number }[] = [];
  floor.walls.forEach((w, wallIdx) => {
    endpoints.push({ x: w.x1, y: w.y1, wallIdx });
    endpoints.push({ x: w.x2, y: w.y2, wallIdx });
  });

  for (const ep of endpoints) {
    let minOtherDist = 42;
    let targetPt: { x: number; y: number } | null = null;
    for (let wi = 0; wi < floor.walls.length; wi++) {
      if (wi === ep.wallIdx) continue;
      const w = floor.walls[wi];
      const info = distPointToSegInfo(ep.x, ep.y, w.x1, w.y1, w.x2, w.y2);
      if (info.dist < minOtherDist) {
        minOtherDist = info.dist;
        targetPt = { x: info.projX, y: info.projY };
      }
    }
    if (targetPt && minOtherDist > 2) {
      rasterizeSegment(sealedWallGrid, ep.x, ep.y, targetPt.x, targetPt.y);
    }
  }

  // Flood-fill exterior starting from padded outer ring (0,0)
  const exterior = new Uint8Array(totalCells);
  const queue = new Int32Array(totalCells);
  let head = 0;
  let tail = 0;
  exterior[0] = 1;
  queue[tail++] = 0;

  while (head < tail) {
    const idx = queue[head++];
    const gx = idx % cols;
    const gy = (idx - gx) / cols;

    if (gx > 0) {
      const n = idx - 1;
      if (!exterior[n] && !sealedWallGrid[n]) {
        exterior[n] = 1;
        queue[tail++] = n;
      }
    }
    if (gx + 1 < cols) {
      const n = idx + 1;
      if (!exterior[n] && !sealedWallGrid[n]) {
        exterior[n] = 1;
        queue[tail++] = n;
      }
    }
    if (gy > 0) {
      const n = idx - cols;
      if (!exterior[n] && !sealedWallGrid[n]) {
        exterior[n] = 1;
        queue[tail++] = n;
      }
    }
    if (gy + 1 < rows) {
      const n = idx + cols;
      if (!exterior[n] && !sealedWallGrid[n]) {
        exterior[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  // Collect all interior cells within bounds
  const minGx = Math.max(1, Math.floor(bounds.minX / cellSize) + 1);
  const maxGx = Math.min(cols - 2, Math.floor(bounds.maxX / cellSize) + 1);
  const minGy = Math.max(1, Math.floor(bounds.minY / cellSize) + 1);
  const maxGy = Math.min(rows - 2, Math.floor(bounds.maxY / cellSize) + 1);

  const interiorCells: { x: number; y: number; gx: number; gy: number }[] = [];
  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      const idx = gy * cols + gx;
      if (!exterior[idx] && !rawWallGrid[idx]) {
        const px = (gx - 0.5) * cellSize;
        const py = (gy - 0.5) * cellSize;
        if (px >= bounds.minX && px <= bounds.maxX && py >= bounds.minY && py <= bounds.maxY) {
          interiorCells.push({ x: px, y: py, gx, gy });
        }
      }
    }
  }

  // If perimeter has giant open gaps (>42px) so flood-fill couldn't seal rooms,
  // use 16-ray wall enclosure check (>= 10/16 rays hit a wall) as interior room mask.
  let finalInterior = interiorCells;
  if (finalInterior.length < 25) {
    const rayAngles = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);
    const rayMax = Math.max(floor.canvasWidth, floor.canvasHeight) * 1.5;
    const enclosed: { x: number; y: number; gx: number; gy: number }[] = [];

    for (let gy = minGy; gy <= maxGy; gy += 2) {
      for (let gx = minGx; gx <= maxGx; gx += 2) {
        const px = (gx - 0.5) * cellSize;
        const py = (gy - 0.5) * cellSize;
        let hits = 0;
        for (const ang of rayAngles) {
          const rx = px + Math.cos(ang) * rayMax;
          const ry = py + Math.sin(ang) * rayMax;
          for (let wi = 0; wi < floor.walls.length; wi++) {
            const w = floor.walls[wi];
            if (segmentsIntersect(px, py, rx, ry, w.x1, w.y1, w.x2, w.y2)) {
              hits++;
              break;
            }
          }
        }
        if (hits >= 10) {
          enclosed.push({ x: px, y: py, gx, gy });
        }
      }
    }
    if (enclosed.length >= 16) {
      finalInterior = enclosed;
    } else {
      return fallbackGrid();
    }
  }

  // Subsample interior cells deterministically to ~450 eval points
  const stride = Math.max(1, Math.floor(Math.sqrt(finalInterior.length / 420)));
  const evalPoints: { x: number; y: number }[] = [];
  for (const c of finalInterior) {
    if (c.gx % stride === 0 && c.gy % stride === 0) {
      evalPoints.push({ x: c.x, y: c.y });
    }
  }
  if (evalPoints.length < 24) {
    for (let i = 0; i < finalInterior.length; i++) {
      evalPoints.push({ x: finalInterior[i].x, y: finalInterior[i].y });
    }
  }

  // Build candidate router positions strictly inside rooms with wall clearance >= 8px
  const candStride = Math.max(2, Math.round(42 / cellSize)); // ~42px spacing
  const rawCands: { x: number; y: number }[] = [];
  for (const c of finalInterior) {
    if (c.gx % candStride === 0 && c.gy % candStride === 0) {
      rawCands.push({ x: Math.round(c.x), y: Math.round(c.y) });
    }
  }
  const clearCands = rawCands.filter((pt) =>
    floor.walls.every((w) => distPointToSeg(pt.x, pt.y, w.x1, w.y1, w.x2, w.y2) >= 8)
  );
  const candPositions =
    clearCands.length >= 8
      ? clearCands
      : rawCands.length >= 8
        ? rawCands
        : evalPoints
            .filter((_, idx) => idx % Math.max(1, Math.floor(evalPoints.length / 40)) === 0)
            .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

  return { bounds, evalPoints, candPositions, isRoomMasked: true };
}

export function computeCoverageStats(
  activeFloor: FloorData,
  allFloors: FloorData[],
  environment: EnvironmentType,
  mode: SimulationMode,
  materialMap: Map<string, WallMaterialRecord>,
  thresholdDbm = -85,
  isolatedRouterId?: string | number | null
): {
  coveragePct: number;
  avgRssiDbm: number;
  excellentPct: number;
  deadZonePct: number;
  sampleCount: number;
} {
  const { evalPoints } = getFloorInteriorSamples(activeFloor);

  let covered = 0;
  let excellent = 0;
  let dead = 0;
  let sumRssi = 0;
  let total = 0;

  for (let i = 0; i < evalPoints.length; i++) {
    const pt = evalPoints[i];
    const reading = computePointSignal(
      pt.x,
      pt.y,
      activeFloor,
      allFloors,
      environment,
      mode,
      materialMap,
      isolatedRouterId
    );
    total++;
    const clampedRssi = Math.max(-105, reading.bestRssiDbm);
    sumRssi += clampedRssi;
    if (reading.bestRssiDbm >= thresholdDbm) covered++;
    if (reading.bestRssiDbm >= -65) excellent++;
    if (reading.bestRssiDbm < -92) dead++;
  }

  return {
    coveragePct: total > 0 ? Math.round((covered / total) * 100) : 0,
    avgRssiDbm: total > 0 ? Math.round(sumRssi / total) : -105,
    excellentPct: total > 0 ? Math.round((excellent / total) * 100) : 0,
    deadZonePct: total > 0 ? Math.round((dead / total) * 100) : 100,
    sampleCount: total,
  };
}

interface PrecomputedWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  attenDb: number;
}

function buildPrecomputedSearchSpace(
  activeFloor: FloorData,
  environment: EnvironmentType,
  refRouter: RouterItem,
  materialMap: Map<string, WallMaterialRecord>
) {
  const { bounds, evalPoints, candPositions, isRoomMasked } =
    getFloorInteriorSamples(activeFloor);

  const scale = Math.max(0.2, activeFloor.scalePxPerMeter);
  const pathLossExp = ENVIRONMENT_PATH_LOSS[environment] ?? 2.65;
  const refLoss = BAND_REF_LOSS_1M[refRouter.band] ?? 40.05;
  const eirp = refRouter.txPowerDbm + (refRouter.antennaGainDbi ?? 2);

  const preWalls: PrecomputedWall[] = activeFloor.walls.map((w) => ({
    x1: w.x1,
    y1: w.y1,
    x2: w.x2,
    y2: w.y2,
    minX: Math.min(w.x1, w.x2),
    maxX: Math.max(w.x1, w.x2),
    minY: Math.min(w.y1, w.y2),
    maxY: Math.max(w.y1, w.y2),
    attenDb: getWallAttenuationDb(w.materialSlug, refRouter.band, materialMap),
  }));

  const evalLen = evalPoints.length;
  const candLen = candPositions.length;
  const rssiMatrix = new Float32Array(candLen * evalLen);

  for (let ci = 0; ci < candLen; ci++) {
    const cx = candPositions[ci].x;
    const cy = candPositions[ci].y;
    const rowOffset = ci * evalLen;

    for (let ei = 0; ei < evalLen; ei++) {
      const ex = evalPoints[ei].x;
      const ey = evalPoints[ei].y;
      const distMeters = Math.max(0.8, Math.hypot(ex - cx, ey - cy) / scale);
      const freeSpaceLoss = refLoss + 10 * pathLossExp * Math.log10(distMeters);

      const minX = Math.min(cx, ex);
      const maxX = Math.max(cx, ex);
      const minY = Math.min(cy, ey);
      const maxY = Math.max(cy, ey);

      let wallLoss = 0;
      for (let wi = 0; wi < preWalls.length; wi++) {
        const w = preWalls[wi];
        if (w.maxX < minX || w.minX > maxX || w.maxY < minY || w.minY > maxY) continue;
        if (segmentsIntersect(cx, cy, ex, ey, w.x1, w.y1, w.x2, w.y2)) {
          wallLoss += w.attenDb;
        }
      }

      rssiMatrix[rowOffset + ei] = eirp - freeSpaceLoss - wallLoss;
    }
  }

  return { bounds, evalPoints, candPositions, rssiMatrix, isRoomMasked };
}

function solveKPlacementFromMatrix(
  count: number,
  candPositions: { x: number; y: number }[],
  evalCount: number,
  rssiMatrix: Float32Array,
  thresholdDbm: number
): number[] {
  const candLen = candPositions.length;
  const selected: number[] = [];
  const currentBest = new Float32Array(evalCount).fill(-120);

  const scoreWithCandidate = (baseBest: Float32Array, candIdx: number): number => {
    const offset = candIdx * evalCount;
    let covered = 0;
    let good = 0;
    let sumRssi = 0;
    for (let e = 0; e < evalCount; e++) {
      const v = Math.max(baseBest[e], rssiMatrix[offset + e]);
      if (v >= thresholdDbm) covered++;
      if (v >= -74) good++;
      sumRssi += v < -100 ? -100 : v > -45 ? -45 : v;
    }
    return covered * 10000 + good * 40 + sumRssi / evalCount;
  };

  // 1. Greedy initialization maximizing marginal interior coverage + quality + mean RSSI
  for (let k = 0; k < count; k++) {
    let bestCand = 0;
    let bestScore = -Infinity;

    for (let ci = 0; ci < candLen; ci++) {
      const cPos = candPositions[ci];
      const tooClose = selected.some(
        (si) => Math.hypot(candPositions[si].x - cPos.x, candPositions[si].y - cPos.y) < 30
      );
      if (tooClose) continue;

      const sc = scoreWithCandidate(currentBest, ci);
      if (sc > bestScore) {
        bestScore = sc;
        bestCand = ci;
      }
    }

    selected.push(bestCand);
    const off = bestCand * evalCount;
    for (let e = 0; e < evalCount; e++) {
      if (rssiMatrix[off + e] > currentBest[e]) {
        currentBest[e] = rssiMatrix[off + e];
      }
    }
  }

  // 2. Multi-pass 1-opt swap refinement so earlier routers reposition when k > 1
  if (selected.length > 1) {
    const tempBest = new Float32Array(evalCount);
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let slot = 0; slot < selected.length; slot++) {
        tempBest.fill(-120);
        for (let other = 0; other < selected.length; other++) {
          if (other === slot) continue;
          const off = selected[other] * evalCount;
          for (let e = 0; e < evalCount; e++) {
            if (rssiMatrix[off + e] > tempBest[e]) {
              tempBest[e] = rssiMatrix[off + e];
            }
          }
        }

        let bestCand = selected[slot];
        let bestScore = scoreWithCandidate(tempBest, bestCand);

        for (let ci = 0; ci < candLen; ci++) {
          if (ci === selected[slot]) continue;
          const cPos = candPositions[ci];
          const tooClose = selected.some(
            (si, idx) =>
              idx !== slot &&
              Math.hypot(candPositions[si].x - cPos.x, candPositions[si].y - cPos.y) < 30
          );
          if (tooClose) continue;

          const sc = scoreWithCandidate(tempBest, ci);
          if (sc > bestScore + 1e-4) {
            bestScore = sc;
            bestCand = ci;
          }
        }

        if (bestCand !== selected[slot]) {
          selected[slot] = bestCand;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  return selected;
}

// Deterministic placement optimizer using precomputed interior RSSI matrix + swap refinement
export function optimiseRouterPlacement(
  activeFloor: FloorData,
  environment: EnvironmentType,
  mode: SimulationMode,
  materialMap: Map<string, WallMaterialRecord>,
  thresholdDbm = -85
): { routers: RouterItem[]; newCoveragePct: number } {
  if (activeFloor.routers.length === 0) {
    return { routers: [], newCoveragePct: 0 };
  }

  const refRouter = activeFloor.routers[0];
  const allSameProfile = activeFloor.routers.every(
    (r) =>
      r.txPowerDbm === refRouter.txPowerDbm &&
      r.band === refRouter.band &&
      (r.antennaGainDbi ?? 2) === (refRouter.antennaGainDbi ?? 2)
  );

  let workingRouters: RouterItem[];

  if (allSameProfile) {
    const space = buildPrecomputedSearchSpace(activeFloor, environment, refRouter, materialMap);
    const chosenIndices = solveKPlacementFromMatrix(
      activeFloor.routers.length,
      space.candPositions,
      space.evalPoints.length,
      space.rssiMatrix,
      thresholdDbm
    );
    workingRouters = activeFloor.routers.map((r, i) => {
      const pos = space.candPositions[chosenIndices[i]] ?? { x: r.x, y: r.y };
      return { ...r, x: pos.x, y: pos.y };
    });
  } else {
    const space = buildPrecomputedSearchSpace(activeFloor, environment, refRouter, materialMap);
    const scorePlacement = (placed: RouterItem[]): number => {
      const tempFloor: FloorData = { ...activeFloor, routers: placed };
      let covered = 0;
      let good = 0;
      let totalRssi = 0;
      for (let i = 0; i < space.evalPoints.length; i++) {
        const p = space.evalPoints[i];
        const reading = computePointSignal(
          p.x,
          p.y,
          tempFloor,
          [tempFloor],
          environment,
          mode,
          materialMap
        );
        if (reading.bestRssiDbm >= thresholdDbm) covered += 1;
        if (reading.bestRssiDbm >= -74) good += 1;
        totalRssi += Math.max(-100, Math.min(-45, reading.bestRssiDbm));
      }
      return covered * 10000 + good * 40 + totalRssi / space.evalPoints.length;
    };

    workingRouters = [];
    for (let idx = 0; idx < activeFloor.routers.length; idx++) {
      const base = activeFloor.routers[idx];
      let bestPos = { x: base.x, y: base.y };
      let bestScore = -Infinity;

      for (const cand of space.candPositions) {
        const tooClose = workingRouters.some(
          (wr) => Math.hypot(wr.x - cand.x, wr.y - cand.y) < 30
        );
        if (tooClose) continue;

        const sc = scorePlacement([...workingRouters, { ...base, x: cand.x, y: cand.y }]);
        if (sc > bestScore) {
          bestScore = sc;
          bestPos = cand;
        }
      }
      workingRouters.push({ ...base, x: bestPos.x, y: bestPos.y });
    }
  }

  const finalFloor: FloorData = { ...activeFloor, routers: workingRouters };
  const stats = computeCoverageStats(
    finalFloor,
    [finalFloor],
    environment,
    mode,
    materialMap,
    thresholdDbm
  );

  return {
    routers: workingRouters,
    newCoveragePct: stats.coveragePct,
  };
}

export interface RouterProfileTemplate {
  modelSlug: string;
  txPowerDbm: number;
  antennaGainDbi: number;
  band: BandType;
  role: RouterItem['role'];
}

export function calculateNeededRouters(
  activeFloor: FloorData,
  environment: EnvironmentType,
  mode: SimulationMode,
  materialMap: Map<string, WallMaterialRecord>,
  targetPct = 98,
  thresholdDbm = -85,
  profileTemplate?: RouterProfileTemplate
): {
  neededCount: number;
  achievedPct: number;
  avgRssiDbm: number;
  interiorOnly: boolean;
  recommendedRouters: RouterItem[];
  breakdown: { count: number; coveragePct: number }[];
} {
  const baseDefault: RouterItem = activeFloor.routers[0] ?? {
    id: 'sim-1',
    name: 'Router-1',
    x: Math.round(activeFloor.canvasWidth / 2),
    y: Math.round(activeFloor.canvasHeight / 2),
    modelSlug: 'custom',
    txPowerDbm: mode === 'zigbee' ? 7 : 18,
    antennaGainDbi: 2,
    band: mode === 'zigbee' ? '2.4 GHz' : '5 GHz',
    channel: mode === 'zigbee' ? 15 : 36,
    role: 'router',
  };

  const refRouter: RouterItem = profileTemplate
    ? {
        ...baseDefault,
        modelSlug: profileTemplate.modelSlug,
        txPowerDbm: profileTemplate.txPowerDbm,
        antennaGainDbi: profileTemplate.antennaGainDbi,
        band: mode === 'zigbee' ? '2.4 GHz' : profileTemplate.band,
        channel:
          mode === 'zigbee'
            ? 15
            : profileTemplate.band === '2.4 GHz'
              ? 6
              : 36,
        role: profileTemplate.role,
      }
    : baseDefault;

  const space = buildPrecomputedSearchSpace(activeFloor, environment, refRouter, materialMap);

  const breakdown: { count: number; coveragePct: number }[] = [];
  let bestCount = 1;
  let bestPct = -1;
  let bestAvgRssi = -105;
  let bestRouters: RouterItem[] = [];

  for (let count = 1; count <= 12; count++) {
    const chosenIndices = solveKPlacementFromMatrix(
      count,
      space.candPositions,
      space.evalPoints.length,
      space.rssiMatrix,
      thresholdDbm
    );

    const placedRouters: RouterItem[] = chosenIndices.map((ci, i) => {
      const pos = space.candPositions[ci];
      return {
        ...refRouter,
        id: `est-${Date.now()}-${i + 1}`,
        name: i === 0 && refRouter.role === 'coordinator' ? 'Coordinator-1' : `Router-${i + 1}`,
        x: pos.x,
        y: pos.y,
        role: i === 0 ? refRouter.role : refRouter.role === 'coordinator' ? 'router' : refRouter.role,
      };
    });

    const simFloor: FloorData = { ...activeFloor, routers: placedRouters };
    const stats = computeCoverageStats(
      simFloor,
      [simFloor],
      environment,
      mode,
      materialMap,
      thresholdDbm
    );

    breakdown.push({ count, coveragePct: stats.coveragePct });

    // Record only when coverage strictly improves so minimum count is always preserved
    if (stats.coveragePct > bestPct) {
      bestPct = stats.coveragePct;
      bestAvgRssi = stats.avgRssiDbm;
      bestCount = count;
      bestRouters = placedRouters;
    }

    // Stop as soon as full interior coverage target is reached (minimum router count achieved)
    if (stats.coveragePct >= targetPct) {
      break;
    }

    // Stop if adding 2 consecutive routers yields 0% improvement (physical max reached)
    if (
      breakdown.length >= 3 &&
      breakdown[breakdown.length - 1].coveragePct <= breakdown[breakdown.length - 3].coveragePct
    ) {
      break;
    }
  }

  return {
    neededCount: bestCount,
    achievedPct: bestPct,
    avgRssiDbm: bestAvgRssi,
    interiorOnly: space.isRoomMasked,
    recommendedRouters: bestRouters,
    breakdown,
  };
}
