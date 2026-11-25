import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Sparkles, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { renderFloorplanScene } from '../lib/floorplanRenderer.ts';
import { computePointSignal, type PointSignalReading } from '../lib/rfEngine.ts';
import type {
  CanvasViewMode,
  EnvironmentType,
  FloorData,
  RouterItem,
  SimulationMode,
  TestClientItem,
  ToolType,
  WallItem,
  WallMaterialRecord,
} from '../types/zignals.ts';

interface FloorplanCanvasProps {
  floor: FloorData;
  allFloors: FloorData[];
  environment: EnvironmentType;
  mode: SimulationMode;
  materialMap: Map<string, WallMaterialRecord>;
  activeTool: ToolType;
  selectedWallMaterial: string;
  showHeatmap: boolean;
  heatmapOpacity: number;
  viewMode: CanvasViewMode;
  selectedRouterId: string | number | null;
  selectedWallId: string | number | null;
  activeWallColor: string;
  isolatedRouterId: string | number | null;
  coveragePct: number;
  onChangeViewMode: (vm: CanvasViewMode) => void;
  onChangeHeatmapOpacity: (val: number) => void;
  onToggleIsolateRouter: () => void;
  onSelectRouter: (id: string | number | null) => void;
  onSelectWall: (id: string | number | null) => void;
  onMoveRouter: (id: string | number, x: number, y: number, commit?: boolean) => void;
  onAddRouter: (x: number, y: number) => void;
  onDeleteRouter: (id: string | number) => void;
  onAddWall: (wall: Omit<WallItem, 'id'>) => void;
  onDeleteWallAt: (x: number, y: number) => void;
  onAddTestClient: (x: number, y: number) => void;
  onDeleteTestClient: (id: string | number) => void;
  onCompleteMeasure: (pixelDistance: number) => void;
  wallDetectionStatus: {
    state: 'idle' | 'loading' | 'done' | 'error';
    message?: string;
  };
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export const FloorplanCanvas: React.FC<FloorplanCanvasProps> = ({
  floor,
  allFloors,
  environment,
  mode,
  materialMap,
  activeTool,
  selectedWallMaterial,
  showHeatmap,
  heatmapOpacity,
  viewMode,
  selectedRouterId,
  selectedWallId,
  activeWallColor,
  isolatedRouterId,
  coveragePct,
  onChangeViewMode,
  onChangeHeatmapOpacity,
  onToggleIsolateRouter,
  onSelectRouter,
  onSelectWall,
  onMoveRouter,
  onAddRouter,
  onDeleteRouter,
  onAddWall,
  onDeleteWallAt,
  onAddTestClient,
  onDeleteTestClient,
  onCompleteMeasure,
  wallDetectionStatus,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  const [draggingRouterId, setDraggingRouterId] = useState<string | number | null>(null);
  const [panningStart, setPanningStart] = useState<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [draftWall, setDraftWall] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number }[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; reading: PointSignalReading } | null>(null);
  const [loadedBgImage, setLoadedBgImage] = useState<HTMLImageElement | null>(null);

  // Load background uploaded floorplan image when floor.backgroundImage changes
  useEffect(() => {
    if (!floor.backgroundImage) {
      setLoadedBgImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLoadedBgImage(img);
    img.src = floor.backgroundImage;
  }, [floor.backgroundImage]);

  // Reset measure points if user switches away from measure tool
  useEffect(() => {
    if (activeTool !== 'measure') {
      setMeasurePoints([]);
    }
  }, [activeTool]);

  // Fit canvas neatly into container on initial mount or floor size change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const fitScale = Math.min(
        (rect.width - 64) / floor.canvasWidth,
        (rect.height - 28) / floor.canvasHeight,
        1.15
      );
      setZoom(Math.max(0.45, Math.min(1.25, Number(fitScale.toFixed(2)))));
      setPan({ x: 0, y: 0 });
    }
  }, [floor.id, floor.canvasWidth, floor.canvasHeight]);

  // Render floorplan + heatmap scene onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = floor.canvasWidth * dpr;
    canvas.height = floor.canvasHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderFloorplanScene(ctx, {
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
      draftWallColor: activeWallColor,
      measurePoints,
    });
  }, [
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
    activeWallColor,
    isolatedRouterId,
    loadedBgImage,
    draftWall,
    measurePoints,
  ]);

  const toLogicalCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * floor.canvasWidth;
    const y = ((clientY - rect.top) / rect.height) * floor.canvasHeight;
    return {
      x: Math.max(0, Math.min(floor.canvasWidth, x)),
      y: Math.max(0, Math.min(floor.canvasHeight, y)),
    };
  };

  const findRouterAt = (x: number, y: number): RouterItem | null => {
    for (let i = floor.routers.length - 1; i >= 0; i--) {
      const r = floor.routers[i];
      if (Math.hypot(r.x - x, r.y - y) <= 22) return r;
    }
    return null;
  };

  const findTestClientAt = (x: number, y: number): TestClientItem | null => {
    for (let i = floor.testClients.length - 1; i >= 0; i--) {
      const c = floor.testClients[i];
      if (Math.hypot(c.x - x, c.y - y) <= 16) return c;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      setPanningStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
      return;
    }

    const { x, y } = toLogicalCoords(e.clientX, e.clientY);

    if (activeTool === 'measure') {
      const next = [...measurePoints, { x, y }];
      if (next.length >= 2) {
        const dist = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
        setMeasurePoints(next);
        if (dist > 4) {
          onCompleteMeasure(dist);
        }
        setMeasurePoints([]);
      } else {
        setMeasurePoints(next);
      }
      return;
    }

    if (activeTool === 'erase') {
      const hitRouter = findRouterAt(x, y);
      if (hitRouter) {
        onDeleteRouter(hitRouter.id);
        return;
      }
      const hitClient = findTestClientAt(x, y);
      if (hitClient) {
        onDeleteTestClient(hitClient.id);
        return;
      }
      // Check walls near cursor
      const hitWall = floor.walls.some(
        (w) => distancePointToSegment(x, y, w.x1, w.y1, w.x2, w.y2) <= 10
      );
      if (hitWall) {
        onDeleteWallAt(x, y);
      }
      return;
    }

    if (activeTool === 'wall') {
      const snappedX = Math.round(x / 4) * 4;
      const snappedY = Math.round(y / 4) * 4;
      setDraftWall({ x1: snappedX, y1: snappedY, x2: snappedX, y2: snappedY });
      return;
    }

    if (activeTool === 'test-client') {
      onAddTestClient(Math.round(x), Math.round(y));
      return;
    }

    // Select or Router tool: check if user clicked an existing router to select/drag
    const hitRouter = findRouterAt(x, y);
    if (hitRouter) {
      onSelectRouter(hitRouter.id);
      onSelectWall(null);
      setDraggingRouterId(hitRouter.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === 'select') {
      let closestWall: WallItem | null = null;
      let minDist = 10;
      for (const w of floor.walls) {
        const d = distancePointToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
        if (d < minDist) {
          minDist = d;
          closestWall = w;
        }
      }
      if (closestWall) {
        onSelectWall(closestWall.id);
        onSelectRouter(null);
        return;
      }
      onSelectWall(null);
    }

    if (activeTool === 'router') {
      onAddRouter(Math.round(x), Math.round(y));
      return;
    }

    // In select mode on empty space, allow panning the canvas smoothly
    setPanningStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panningStart) {
      setPan({
        x: panningStart.px + (e.clientX - panningStart.mx),
        y: panningStart.py + (e.clientY - panningStart.my),
      });
      return;
    }

    const { x, y } = toLogicalCoords(e.clientX, e.clientY);

    if (draggingRouterId !== null) {
      onMoveRouter(draggingRouterId, Math.round(x), Math.round(y), false);
      return;
    }

    if (draftWall) {
      const snappedX = Math.round(x / 4) * 4;
      const snappedY = Math.round(y / 4) * 4;
      setDraftWall({ ...draftWall, x2: snappedX, y2: snappedY });
      return;
    }

    if (floor.routers.length > 0) {
      const reading = computePointSignal(
        x,
        y,
        floor,
        allFloors,
        environment,
        mode,
        materialMap,
        isolatedRouterId
      );
      setHoverInfo({ x: Math.round(x), y: Math.round(y), reading });
    }
  };

  const handlePointerUp = () => {
    if (panningStart) {
      setPanningStart(null);
    }
    if (draggingRouterId !== null) {
      const r = floor.routers.find((item) => item.id === draggingRouterId);
      if (r) {
        onMoveRouter(r.id, r.x, r.y, true);
      }
      setDraggingRouterId(null);
    }
    if (draftWall) {
      const len = Math.hypot(draftWall.x2 - draftWall.x1, draftWall.y2 - draftWall.y1);
      if (len >= 12) {
        const mat = materialMap.get(selectedWallMaterial);
        onAddWall({
          x1: draftWall.x1,
          y1: draftWall.y1,
          x2: draftWall.x2,
          y2: draftWall.y2,
          materialSlug: selectedWallMaterial,
          thickness: mat?.thicknessPx ?? 6,
          color: activeWallColor,
        });
      }
      setDraftWall(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((prev) => Math.max(0.4, Math.min(2.2, Number((prev + delta).toFixed(2)))));
    }
  };

  const cursorClass = useMemo(() => {
    if (panningStart) return 'cursor-grabbing';
    if (draggingRouterId !== null) return 'cursor-grabbing';
    if (activeTool === 'wall' || activeTool === 'measure') return 'cursor-crosshair';
    if (activeTool === 'router' || activeTool === 'test-client') return 'cursor-copy';
    if (activeTool === 'erase') return 'cursor-not-allowed';
    return 'cursor-default';
  }, [activeTool, draggingRouterId, panningStart]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative flex-1 canvas-dot-grid overflow-hidden flex items-center justify-center select-none"
    >
      {/* Top-left floating Signal / Serving router pill switch */}
      <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-2">
        <div className="bg-[#161f33]/95 border border-[#2a3650] rounded-full p-0.5 flex items-center shadow-lg">
          <button
            type="button"
            onClick={() => onChangeViewMode('signal')}
            className={`px-3 py-1 rounded-full text-[12px] transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'signal'
                ? 'bg-white text-[#0f172a] font-semibold shadow-xs'
                : 'text-[#94a3b8] hover:text-white font-medium'
            }`}
          >
            Signal
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('serving')}
            className={`px-3 py-1 rounded-full text-[12px] transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'serving'
                ? 'bg-white text-[#0f172a] font-semibold shadow-xs'
                : 'text-[#94a3b8] hover:text-white font-medium'
            }`}
          >
            Serving router
          </button>
        </div>

        {/* Live instruction banner for Measure / AI Wall Detection */}
        {activeTool === 'measure' && (
          <div className="bg-[#f59e0b] text-[#0f172a] text-[12px] font-semibold px-3 py-1 rounded-full shadow-lg">
            {measurePoints.length === 0
              ? 'Click start point on a known wall or door'
              : 'Click end point to calibrate px/m'}
          </div>
        )}

        {wallDetectionStatus.state === 'loading' && (
          <div className="flex items-center gap-1.5 bg-[#0284c7] text-white text-[12px] font-semibold px-3 py-1 rounded-full shadow-lg">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{wallDetectionStatus.message || 'Extracting walls…'}</span>
          </div>
        )}

        {wallDetectionStatus.state === 'done' && wallDetectionStatus.message && (
          <div className="flex items-center gap-1.5 bg-[#059669] text-white text-[12px] font-semibold px-3 py-1 rounded-full shadow-lg">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{wallDetectionStatus.message}</span>
          </div>
        )}

        {wallDetectionStatus.state === 'error' && wallDetectionStatus.message && (
          <div className="bg-[#dc2626] text-white text-[12px] font-medium px-3 py-1 rounded-full shadow-lg max-w-xs truncate">
            {wallDetectionStatus.message}
          </div>
        )}
      </div>

      {/* Top-right compact zoom controls & live probe readout */}
      <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-2">
        {hoverInfo && (
          <div className="hidden sm:flex items-center gap-2 bg-[#161f33]/92 border border-[#2a3650] text-white text-[11.5px] px-3 py-1.5 rounded-full shadow-lg font-mono-tabular">
            <span
              className={`w-2 h-2 rounded-full ${
                hoverInfo.reading.bestRssiDbm >= -74
                  ? 'bg-[#34d399]'
                  : hoverInfo.reading.bestRssiDbm >= -85
                    ? 'bg-[#fbbf24]'
                    : 'bg-[#f87171]'
              }`}
            />
            <span>{Math.round(hoverInfo.reading.bestRssiDbm)} dBm</span>
            {hoverInfo.reading.servingRouter && (
              <>
                <span className="text-[#64748b]">·</span>
                <span className="font-sans text-[#cbd5e1]">
                  {hoverInfo.reading.servingRouter.name}
                </span>
              </>
            )}
            <span className="text-[#64748b]">·</span>
            <span className="text-[#94a3b8]">
              {hoverInfo.reading.wallsCrossed}{' '}
              {hoverInfo.reading.wallsCrossed === 1 ? 'wall' : 'walls'}
            </span>
          </div>
        )}

        <div className="flex items-center bg-[#161f33]/92 border border-[#2a3650] rounded-lg text-[#cbd5e1] shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.1).toFixed(2))))}
            title="Zoom out"
            className="p-1.5 hover:bg-[#23304d] hover:text-white transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-[11px] font-mono-tabular text-[#94a3b8]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.1).toFixed(2))))}
            title="Zoom in"
            className="p-1.5 hover:bg-[#23304d] hover:text-white transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Reset view"
            className="p-1.5 border-l border-[#2a3650] hover:bg-[#23304d] hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Centered Floorplan Sheet */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
        className="transition-transform duration-75 ease-out"
      >
        <div className="p-[3px] rounded-xl border border-white/25 bg-[#0f172a]/50 shadow-[0_25px_70px_rgba(0,0,0,0.65)]">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              setHoverInfo(null);
              if (panningStart) setPanningStart(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: `${floor.canvasWidth}px`,
              height: `${floor.canvasHeight}px`,
            }}
            className={`block rounded-lg bg-white touch-none ${cursorClass}`}
          />
        </div>
      </div>

      {/* Bottom-Left Floating Coverage Legend Card */}
      <div className="absolute bottom-3.5 left-3.5 z-20 w-[216px] bg-[#161f33]/95 backdrop-blur-md border border-[#2a3650] rounded-xl p-3 text-white shadow-2xl">
        <button
          type="button"
          onClick={() => setLegendCollapsed((prev) => !prev)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[#94a3b8] uppercase">
            {legendCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            COVERAGE
          </span>
          <span className="flex items-baseline gap-1 tabular-nums">
            <span className="text-[14px] font-bold text-white">{coveragePct}%</span>
            <span className="text-[11px] text-[#94a3b8]">≥ -85 dBm</span>
          </span>
        </button>

        {!legendCollapsed && (
          <div className="mt-2.5 space-y-2.5">
            <div>
              <div
                className="h-2 w-full rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, #f43f5e 0%, #fb923c 30%, #facc15 50%, #34d399 72%, #06b6d4 88%, #2563eb 100%)',
                }}
              />
              <div className="mt-1 flex items-center justify-between text-[10.5px] font-mono-tabular text-[#94a3b8]">
                <span>-95</span>
                <span>-85</span>
                <span>-55</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-0.5">
              <span className="text-[11px] text-[#cbd5e1] shrink-0">Opacity</span>
              <input
                type="range"
                aria-label="Heatmap Opacity"
                min={0.1}
                max={1}
                step={0.05}
                value={heatmapOpacity}
                onChange={(e) => onChangeHeatmapOpacity(Number(e.target.value))}
                className="w-full h-1.5 accent-[#3b82f6] cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom-Right Isolate Router Pill */}
      <div className="absolute bottom-3.5 right-3.5 z-20">
        <button
          type="button"
          onClick={onToggleIsolateRouter}
          disabled={selectedRouterId === null}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium shadow-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isolatedRouterId !== null
              ? 'bg-[#0284c7] text-white'
              : 'bg-white/95 hover:bg-white text-[#0f172a]'
          }`}
        >
          {isolatedRouterId !== null ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          <span>{isolatedRouterId !== null ? 'Showing isolated router' : 'Isolate router'}</span>
        </button>
      </div>
    </div>
  );
};
