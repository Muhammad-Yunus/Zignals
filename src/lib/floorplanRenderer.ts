import {
  BAND_REF_LOSS_1M,
  ENVIRONMENT_PATH_LOSS,
  ROUTER_ZONE_COLORS,
  computePointSignal,
  getFloorInteriorBounds,
  rssiToRgba,
} from './rfEngine.ts';
import type {
  CanvasViewMode,
  EnvironmentType,
  FloorData,
  FurnitureItem,
  RouterItem,
  SimulationMode,
  WallMaterialRecord,
} from '../types/zignals.ts';

function drawFurnitureItem(ctx: CanvasRenderingContext2D, item: FurnitureItem) {
  ctx.save();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';

  if (item.kind === 'door-arc' && item.doorSweep) {
    const { cx, cy, r, startAngle, endAngle } = item.doorSweep;
    ctx.beginPath();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.0;
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.stroke();

    // Door leaf line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(startAngle) * r, cy + Math.sin(startAngle) * r);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const { x, y, w, h } = item;

  switch (item.kind) {
    case 'dining-table': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'chair': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'plant': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) * 0.45;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(r * 0.55, 0, r * 0.42, r * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'bathtub': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 18, y + h / 2, 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'sink': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.32, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.72, 2.2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'toilet': {
      // Tank
      ctx.strokeRect(x, y + h - 14, w, 14);
      // Bowl
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 15, w * 0.42, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + 14, w * 0.24, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'bed': {
      ctx.strokeRect(x, y, w, h);
      // Pillows on right side
      ctx.strokeRect(x + w - 26, y + 10, 18, h * 0.34);
      ctx.strokeRect(x + w - 26, y + h - 10 - h * 0.34, 18, h * 0.34);
      // Blanket fold line
      ctx.beginPath();
      ctx.moveTo(x + w - 42, y);
      ctx.lineTo(x + w - 42, y + h);
      ctx.stroke();
      break;
    }
    case 'stool': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'bookshelf': {
      ctx.strokeRect(x, y, w, h);
      const horizontal = w > h;
      if (horizontal) {
        const count = Math.max(4, Math.floor(w / 7));
        for (let i = 1; i < count; i++) {
          const sx = x + (i * w) / count;
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx, y + h - 3);
          ctx.stroke();
        }
      } else {
        const count = Math.max(4, Math.floor(h / 7));
        for (let i = 1; i < count; i++) {
          const sy = y + (i * h) / count;
          ctx.beginPath();
          ctx.moveTo(x, sy);
          ctx.lineTo(x + w - 3, sy);
          ctx.stroke();
        }
      }
      break;
    }
    case 'sofa': {
      ctx.strokeRect(x, y, w, h);
      if (h > w) {
        // Vertical sofa
        ctx.strokeRect(x, y, 14, h);
        ctx.strokeRect(x + 14, y, w - 14, 12);
        ctx.strokeRect(x + 14, y + h - 12, w - 14, 12);
        ctx.beginPath();
        ctx.moveTo(x + 14, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();
      } else {
        // Horizontal sofa
        ctx.strokeRect(x, y, w, 14);
        ctx.strokeRect(x, y + 14, 12, h - 14);
        ctx.strokeRect(x + w - 12, y + 14, 12, h - 14);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + 14);
        ctx.lineTo(x + w / 2, y + h);
        ctx.stroke();
      }
      break;
    }
    case 'armchair': {
      ctx.strokeRect(x, y, w, h);
      ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
      break;
    }
    case 'coffee-table': {
      ctx.strokeRect(x, y, w, h);
      ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      break;
    }
    case 'tv-console': {
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 6);
      ctx.lineTo(x + w / 2, y + h - 6);
      ctx.stroke();
      break;
    }
    case 'desk': {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w * 0.45, y + h);
      ctx.lineTo(x + w * 0.25, y + h * 0.55);
      ctx.lineTo(x, y + h * 0.55);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    default: {
      ctx.strokeRect(x, y, w, h);
      break;
    }
  }

  ctx.restore();
}

export interface RenderFloorplanOptions {
  floor: FloorData;
  allFloors: FloorData[];
  environment: EnvironmentType;
  mode: SimulationMode;
  materialMap: Map<string, WallMaterialRecord>;
  showHeatmap: boolean;
  heatmapOpacity: number;
  viewMode: CanvasViewMode;
  selectedRouterId: string | number | null;
  selectedWallId?: string | number | null;
  isolatedRouterId: string | number | null;
  loadedBgImage?: HTMLImageElement | null;
  draftWall?: { x1: number; y1: number; x2: number; y2: number } | null;
  draftWallColor?: string;
  measurePoints?: { x: number; y: number }[];
  hoverPoint?: { x: number; y: number } | null;
}

export function renderFloorplanScene(
  ctx: CanvasRenderingContext2D,
  options: RenderFloorplanOptions
): void {
  const {
    floor,
    allFloors,
    environment,
    mode,
    materialMap,
    showHeatmap,
    heatmapOpacity,
    viewMode,
    selectedRouterId,
    selectedWallId,
    isolatedRouterId,
    loadedBgImage,
    draftWall,
    draftWallColor,
    measurePoints,
  } = options;

  const width = floor.canvasWidth;
  const height = floor.canvasHeight;

  // 1. Crisp white paper floorplan sheet
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural grid texture inside sheet
  if (!loadedBgImage) {
    ctx.save();
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let gx = 40; gx < width; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 40; gy < height; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    if (
      floor.walls.length === 0 &&
      floor.routers.length === 0 &&
      floor.furnitureJson.length === 0
    ) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Blank floorplan', width / 2, height / 2 - 14);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(
        'Upload a floorplan image, draw walls (W), or click to place a router (A)',
        width / 2,
        height / 2 + 12
      );
    }
    ctx.restore();
  } else {
    ctx.drawImage(loadedBgImage, 0, 0, width, height);
  }

  // 2. Architectural furniture vectors (below heatmap so signal overlays cleanly like mockup)
  for (const item of floor.furnitureJson) {
    drawFurnitureItem(ctx, item);
  }

  // 3. RF Signal Heatmap or Serving Router Overlay
  if (showHeatmap && floor.routers.length > 0 && heatmapOpacity > 0.01) {
    const sampleStep = 4; // 4px grid -> fast & ultra smooth when upscaled
    const gridW = Math.ceil(width / sampleStep);
    const gridH = Math.ceil(height / sampleStep);
    const offscreen = document.createElement('canvas');
    offscreen.width = gridW;
    offscreen.height = gridH;
    const octx = offscreen.getContext('2d');

    if (octx) {
      const imgData = octx.createImageData(gridW, gridH);
      const data = imgData.data;

      for (let gy = 0; gy < gridH; gy++) {
        const py = (gy + 0.5) * sampleStep;
        for (let gx = 0; gx < gridW; gx++) {
          const px = (gx + 0.5) * sampleStep;
          const reading = computePointSignal(
            px,
            py,
            floor,
            allFloors,
            environment,
            mode,
            materialMap,
            isolatedRouterId
          );

          const offset = (gy * gridW + gx) * 4;
          if (viewMode === 'serving') {
            if (reading.bestRssiDbm < -94 || reading.servingRouterIndex < 0) {
              data[offset + 3] = 0;
            } else {
              const col =
                ROUTER_ZONE_COLORS[reading.servingRouterIndex % ROUTER_ZONE_COLORS.length];
              const strengthAlpha = Math.max(
                40,
                Math.min(185, Math.round(((reading.bestRssiDbm - -94) / 42) * 185))
              );
              data[offset] = col[0];
              data[offset + 1] = col[1];
              data[offset + 2] = col[2];
              data[offset + 3] = strengthAlpha;
            }
          } else {
            const [r, g, b, a] = rssiToRgba(reading.bestRssiDbm);
            data[offset] = r;
            data[offset + 1] = g;
            data[offset + 2] = b;
            data[offset + 3] = a;
          }
        }
      }

      octx.putImageData(imgData, 0, 0);
      ctx.save();
      ctx.globalAlpha = heatmapOpacity;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen, 0, 0, width, height);
      ctx.restore();
    }
  }

  // 4. Re-stroke architectural furniture lightly on top so line art remains legible through heatmap just like mockup
  ctx.save();
  ctx.globalAlpha = 0.72;
  for (const item of floor.furnitureJson) {
    drawFurnitureItem(ctx, item);
  }
  ctx.restore();

  // 5. Structural & interior walls
  for (const w of floor.walls) {
    const mat = materialMap.get(w.materialSlug);
    const wallColor = w.color || mat?.colorHex || '#7c3aed';
    const lineW = w.thickness || mat?.thicknessPx || 6;
    const isWallSelected = w.id === selectedWallId;

    ctx.save();
    ctx.lineCap = 'square';
    if (w.materialSlug === 'door') {
      ctx.setLineDash([4, 3]);
    }

    // Selection halo when clicked
    if (isWallSelected) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
      ctx.lineWidth = lineW + 8;
      ctx.stroke();
    }

    // Subtle light contrast casing so colored walls stand out over B&W floorplan lines & heatmaps
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = lineW + 2.5;
    ctx.stroke();

    // Primary colored wall stroke
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.strokeStyle = wallColor;
    ctx.lineWidth = lineW;
    ctx.stroke();

    if (isWallSelected) {
      ctx.setLineDash([]);
      for (const [px, py] of [
        [w.x1, w.y1],
        [w.x2, w.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = wallColor;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 6. Concentric signal range contour rings around routers (matching mockup's white-halo dashed/solid circles!)
  const pathLossExp = ENVIRONMENT_PATH_LOSS[environment] ?? 2.65;
  const scale = Math.max(0.2, floor.scalePxPerMeter);

  const visibleRouters =
    isolatedRouterId !== null && isolatedRouterId !== undefined
      ? floor.routers.filter((r) => r.id === isolatedRouterId)
      : floor.routers;

  for (const r of visibleRouters) {
    const eirp = r.txPowerDbm + (r.antennaGainDbi ?? 2);
    const refLoss = BAND_REF_LOSS_1M[r.band] ?? 40.05;
    // Inner contour (-75 dBm free space) & Outer contour (-83 dBm free space)
    const innerDistM = Math.pow(10, (eirp - -75 - refLoss) / (10 * pathLossExp));
    const outerDistM = Math.pow(10, (eirp - -83 - refLoss) / (10 * pathLossExp));
    const innerR = Math.max(42, Math.min(180, innerDistM * scale));
    const outerR = Math.max(76, Math.min(280, outerDistM * scale));

    const isSelected = r.id === selectedRouterId;

    for (const [radius, dashed] of [
      [innerR, !isSelected],
      [outerR, true],
    ] as [number, boolean][]) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      if (dashed) ctx.setLineDash([7, 5]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      if (dashed) ctx.setLineDash([7, 5]);
      ctx.strokeStyle = isSelected ? 'rgba(51, 65, 85, 0.72)' : 'rgba(100, 116, 139, 0.58)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 7. Router nodes & labels
  for (const r of floor.routers) {
    const isSelected = r.id === selectedRouterId;
    const isDimmed =
      isolatedRouterId !== null && isolatedRouterId !== undefined && r.id !== isolatedRouterId;

    ctx.save();
    if (isDimmed) ctx.globalAlpha = 0.25;

    // Outer halo
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fill();
    }

    // Router circular badge
    ctx.beginPath();
    ctx.arc(r.x, r.y, isSelected ? 15 : 13, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#0284c7' : 'rgba(56, 132, 168, 0.78)';
    ctx.fill();
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Wi-Fi / Radio waves icon inside circle
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const iconY = r.y + 4;
    ctx.beginPath();
    ctx.arc(r.x, iconY, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r.x, iconY, 4.5, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r.x, iconY, 8.0, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();

    // Label pill below router
    ctx.font = '600 10.5px "Plus Jakarta Sans", sans-serif';
    const textWidth = ctx.measureText(r.name).width;
    const pillW = textWidth + 14;
    const pillH = 18;
    const pillX = r.x - pillW / 2;
    const pillY = r.y + (isSelected ? 19 : 16);

    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 9);
    ctx.fillStyle = isSelected ? '#0284c7' : 'rgba(255, 255, 255, 0.78)';
    ctx.fill();
    if (!isSelected) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = isSelected ? '#ffffff' : '#334155';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name, r.x, pillY + pillH / 2 + 0.5);
    ctx.restore();
  }

  // 8. Test Clients (with live RSSI link line to serving router)
  for (const client of floor.testClients) {
    const reading = computePointSignal(
      client.x,
      client.y,
      floor,
      allFloors,
      environment,
      mode,
      materialMap,
      isolatedRouterId
    );

    ctx.save();
    if (reading.servingRouter) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(client.x, client.y);
      ctx.lineTo(reading.servingRouter.x, reading.servingRouter.y);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Client pin circle
    ctx.beginPath();
    ctx.arc(client.x, client.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(client.x, client.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = reading.bestRssiDbm >= -75 ? '#34d399' : reading.bestRssiDbm >= -85 ? '#fbbf24' : '#f87171';
    ctx.fill();

    // Badge showing RSSI
    const badgeText = `${client.label} · ${Math.round(reading.bestRssiDbm)} dBm`;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    const bw = ctx.measureText(badgeText).width + 12;
    ctx.beginPath();
    ctx.roundRect(client.x - bw / 2, client.y - 29, bw, 17, 6);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, client.x, client.y - 20.5);
    ctx.restore();
  }

  // 9. Draft Wall preview
  if (draftWall) {
    const previewColor = draftWallColor || '#7c3aed';
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(draftWall.x1, draftWall.y1);
    ctx.lineTo(draftWall.x2, draftWall.y2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 6.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(draftWall.x1, draftWall.y1);
    ctx.lineTo(draftWall.x2, draftWall.y2);
    ctx.strokeStyle = previewColor;
    ctx.lineWidth = 4.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();

    const lenM = (Math.hypot(draftWall.x2 - draftWall.x1, draftWall.y2 - draftWall.y1) / scale).toFixed(1);
    const mx = (draftWall.x1 + draftWall.x2) / 2;
    const my = (draftWall.y1 + draftWall.y2) / 2;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    const lw = ctx.measureText(`${lenM} m`).width + 12;
    ctx.beginPath();
    ctx.roundRect(mx - lw / 2, my - 22, lw, 18, 6);
    ctx.fillStyle = previewColor;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${lenM} m`, mx, my - 13);
    ctx.restore();
  }

  // 10. Scale measurement preview
  if (measurePoints && measurePoints.length > 0) {
    ctx.save();
    for (const pt of measurePoints) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    if (measurePoints.length === 2) {
      const [p1, p2] = measurePoints;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ensure bounds calculation works cleanly even when unused
  void getFloorInteriorBounds;
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function renderFloorplanToDataUrl(
  options: RenderFloorplanOptions,
  exportScale = 2
): Promise<string | null> {
  const { floor } = options;
  let loadedBgImage = options.loadedBgImage ?? null;
  if (!loadedBgImage && floor.backgroundImage) {
    loadedBgImage = await loadImageFromDataUrl(floor.backgroundImage);
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = floor.canvasWidth * exportScale;
  exportCanvas.height = floor.canvasHeight * exportScale;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(exportScale, exportScale);
  renderFloorplanScene(ctx, { ...options, loadedBgImage });

  // Subtle Zignals watermark corner in export
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(14, floor.canvasHeight - 32, 196, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Zignals · ${floor.name} · ${options.mode.toUpperCase()}`,
    22,
    floor.canvasHeight - 22
  );

  return exportCanvas.toDataURL('image/png');
}

export async function exportFloorplanPng(
  options: RenderFloorplanOptions,
  filename: string
): Promise<void> {
  const dataUrl = await renderFloorplanToDataUrl(options, 2);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
