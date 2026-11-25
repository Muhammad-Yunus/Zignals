import React, { useState } from 'react';
import {
  Calculator,
  Check,
  Info,
  Pencil,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BandType,
  FloorData,
  ProjectData,
  RouterItem,
  RouterModelRecord,
  RouterRole,
  SimulationMode,
  WallItem,
  WallMaterialRecord,
} from '../types/zignals.ts';

interface InspectorSidebarProps {
  project: ProjectData;
  activeFloor: FloorData;
  mode: SimulationMode;
  routerModels: RouterModelRecord[];
  selectedRouterId: string | number | null;
  selectedWall: WallItem | null;
  wallMaterials: WallMaterialRecord[];
  estimateModelSlug: string;
  sizingResult: {
    neededCount: number;
    achievedPct: number;
    avgRssiDbm: number;
    interiorOnly: boolean;
    recommendedRouters: RouterItem[];
    breakdown: { count: number; coveragePct: number }[];
  } | null;
  isOptimising: boolean;
  isEstimating: boolean;
  isMobileOpen: boolean;
  savingState: 'idle' | 'saving' | 'saved' | 'unsaved';
  onCloseMobile: () => void;
  onRenameProject: (newTitle: string) => void;
  onChangeScale: (pxPerMeter: number) => void;
  onStartMeasure: () => void;
  onOptimisePlacement: () => void;
  onChangeEstimateModel: (slug: string) => void;
  onCalculateNeededRouters: () => void;
  onApplyEstimatedRouters: () => void;
  onSelectRouter: (id: string | number) => void;
  onUpdateRouter: (id: string | number, patch: Partial<RouterItem>) => void;
  onDeleteRouter: (id: string | number) => void;
  onUpdateWall: (id: string | number, patch: Partial<WallItem>) => void;
  onDeleteWall: (id: string | number) => void;
  onAddRouterCenter: () => void;
}

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  project,
  activeFloor,
  mode,
  routerModels,
  selectedRouterId,
  selectedWall,
  wallMaterials,
  estimateModelSlug,
  sizingResult,
  isOptimising,
  isEstimating,
  isMobileOpen,
  savingState,
  onCloseMobile,
  onRenameProject,
  onChangeScale,
  onStartMeasure,
  onOptimisePlacement,
  onChangeEstimateModel,
  onCalculateNeededRouters,
  onApplyEstimatedRouters,
  onSelectRouter,
  onUpdateRouter,
  onDeleteRouter,
  onUpdateWall,
  onDeleteWall,
  onAddRouterCenter,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);

  const filteredModels = routerModels.filter(
    (m) => m.protocol === 'both' || m.protocol === mode
  );

  const handleModelChange = (router: RouterItem, modelSlug: string) => {
    const model = routerModels.find((m) => m.slug === modelSlug);
    if (!model || model.slug === 'custom') {
      onUpdateRouter(router.id, { modelSlug: 'custom' });
      return;
    }
    onUpdateRouter(router.id, {
      modelSlug: model.slug,
      txPowerDbm: model.txPowerDbm,
      antennaGainDbi: model.antennaGainDbi,
      band: (mode === 'zigbee' ? '2.4 GHz' : model.defaultBand) as BandType,
      role: model.role as RouterRole,
    });
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== project.title) {
      onRenameProject(trimmed);
    } else {
      setTitleDraft(project.title);
    }
  };

  const content = (
    <div className="h-full flex flex-col bg-[#f8fafc] border-l border-[#e2e8f0] text-[#0f172a]">
      <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-4">
        {/* Studio Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-[#94a3b8] uppercase">
                STUDIO
              </span>
              {savingState === 'saving' && (
                <span className="text-[11px] text-[#64748b]">Saving…</span>
              )}
              {savingState === 'saved' && (
                <span className="text-[11px] text-[#059669] flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>

            {editingTitle ? (
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle();
                    if (e.key === 'Escape') {
                      setTitleDraft(project.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full text-[18px] font-bold text-[#0f172a] bg-white border border-[#3b82f6] rounded-md px-2 py-0.5 focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(project.title);
                  setEditingTitle(true);
                }}
                title="Click to rename floorplan"
                className="group mt-0.5 flex items-center gap-1.5 text-left cursor-pointer"
              >
                <h1 className="text-[20px] font-bold text-[#0f172a] tracking-tight truncate">
                  {project.title}
                </h1>
                <Pencil className="w-3.5 h-3.5 text-[#94a3b8] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}

            <p className="mt-0.5 text-[13px] text-[#64748b] tabular-nums">
              {activeFloor.routers.length}{' '}
              {activeFloor.routers.length === 1 ? 'router' : 'routers'} · scale{' '}
              {Number(activeFloor.scalePxPerMeter.toFixed(1))} px/m
            </p>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-[#64748b] hover:bg-[#e2e8f0]/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SCALE Card */}
        <section className="bg-white border border-[#e2e8f0] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#64748b] uppercase">
              SCALE
            </span>
            <span className="text-[12px] text-[#94a3b8]">pixels per metre</span>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex-1 flex items-center justify-between border border-[#e2e8f0] focus-within:border-[#3b82f6] rounded-lg px-3 py-1.5 bg-white">
              <input
                type="number"
                aria-label="Pixels per metre"
                min={0.5}
                max={120}
                step={0.5}
                value={activeFloor.scalePxPerMeter}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (Number.isFinite(val) && val > 0) {
                    onChangeScale(Math.min(120, Math.max(0.5, val)));
                  }
                }}
                className="w-full text-[14px] font-semibold text-[#0f172a] font-mono-tabular focus:outline-none"
              />
              <span className="text-[12px] text-[#94a3b8] whitespace-nowrap ml-2">
                px / m
              </span>
            </div>

            <button
              type="button"
              onClick={onStartMeasure}
              className="flex items-center gap-1.5 border border-[#e2e8f0] hover:bg-[#f8fafc] bg-white text-[#1e293b] text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Ruler className="w-3.5 h-3.5 text-[#475569]" />
              <span>Measure</span>
            </button>
          </div>

          <p className="mt-2.5 text-[12px] text-[#64748b] leading-relaxed">
            Measure along a wall or door you know the length of. An interior door is about 0.8 m wide.
          </p>
        </section>

        {/* SELECTED WALL Inspector Card */}
        {selectedWall && (() => {
          const wallMat = wallMaterials.find((m) => m.slug === selectedWall.materialSlug);
          const effectiveColor = selectedWall.color || wallMat?.colorHex || '#7c3aed';
          const lengthM = (
            Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1) /
            Math.max(0.2, activeFloor.scalePxPerMeter)
          ).toFixed(2);

          return (
            <section className="bg-white border-2 border-[#7c3aed] rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0"
                    style={{ backgroundColor: effectiveColor }}
                  />
                  <span className="text-[14px] font-semibold text-[#0f172a]">
                    Selected Wall
                  </span>
                  <span className="text-[11.5px] text-[#64748b] font-mono-tabular">
                    {lengthM} m
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteWall(selectedWall.id)}
                  title="Delete wall"
                  className="p-1 text-[#94a3b8] hover:text-[#dc2626] rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold tracking-wider text-[#64748b] uppercase">
                    WALL COLOR
                  </label>
                  {selectedWall.color && (
                    <button
                      type="button"
                      onClick={() => onUpdateWall(selectedWall.id, { color: undefined })}
                      className="text-[11px] font-medium text-[#2563eb] hover:underline cursor-pointer"
                    >
                      Use material color
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label
                    title="Pick wall color"
                    className="relative w-8 h-8 rounded-lg border border-[#cbd5e1] cursor-pointer overflow-hidden shrink-0"
                    style={{ backgroundColor: effectiveColor }}
                  >
                    <input
                      type="color"
                      aria-label="Selected wall color"
                      value={effectiveColor}
                      onChange={(e) =>
                        onUpdateWall(selectedWall.id, { color: e.target.value })
                      }
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </label>
                  <span className="text-[12px] font-mono-tabular text-[#334155] uppercase">
                    {effectiveColor}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {['#7c3aed', '#ef4444', '#ea580c', '#0284c7', '#10b981', '#db2777'].map(
                      (swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          onClick={() => onUpdateWall(selectedWall.id, { color: swatch })}
                          style={{ backgroundColor: swatch }}
                          className={`w-4 h-4 rounded-full cursor-pointer ${
                            effectiveColor.toLowerCase() === swatch
                              ? 'ring-2 ring-offset-1 ring-[#0f172a]'
                              : 'opacity-85 hover:opacity-100'
                          }`}
                        />
                      )
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-wider text-[#64748b] uppercase mb-1.5">
                  MATERIAL
                </label>
                <select
                  aria-label="Selected wall material"
                  value={selectedWall.materialSlug}
                  onChange={(e) => {
                    const slug = e.target.value;
                    const mat = wallMaterials.find((m) => m.slug === slug);
                    onUpdateWall(selectedWall.id, {
                      materialSlug: slug,
                      thickness: mat?.thicknessPx ?? selectedWall.thickness,
                    });
                  }}
                  className="w-full border border-[#e2e8f0] focus:border-[#7c3aed] rounded-lg px-3 py-2 text-[13px] font-medium text-[#0f172a] bg-white focus:outline-none cursor-pointer"
                >
                  {wallMaterials.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name} (-{m.attenuation24GhzDb} dB)
                    </option>
                  ))}
                </select>
              </div>
            </section>
          );
        })()}

        {/* COORDINATOR & ROUTERS Header */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-semibold tracking-wider text-[#64748b] uppercase">
            {mode === 'zigbee' ? 'COORDINATOR & ROUTERS' : 'ACCESS POINTS & ROUTERS'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#e2e8f0]/70 text-[#475569] tabular-nums">
              {activeFloor.routers.length} / 12
            </span>
            {activeFloor.routers.length < 12 && (
              <button
                type="button"
                onClick={onAddRouterCenter}
                title="Add router"
                className="p-1 rounded-md text-[#2563eb] hover:bg-[#eff6ff] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Protocol Channel Info Banner */}
        <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-xl p-3.5 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#0284c7] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#334155] leading-relaxed">
            {mode === 'zigbee'
              ? 'Zigbee shares 2.4 GHz with WiFi. Channels 15, 20, 25 or 26 avoid WiFi channels 1/6/11 — set it on your coordinator, not per device.'
              : 'Use non-overlapping 2.4 GHz channels (1, 6, 11) and 5/6 GHz DFS or UNII-3 channels across neighboring APs to minimize co-channel interference.'}
          </p>
        </div>

        {/* Placement Optimisation Card */}
        <section className="bg-white border border-[#e2e8f0] rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Placement</h2>
              <p className="text-[12px] text-[#64748b]">
                Move {activeFloor.routers.length}{' '}
                {activeFloor.routers.length === 1 ? 'router' : 'routers'} for the best coverage
              </p>
            </div>
            <button
              type="button"
              onClick={onOptimisePlacement}
              disabled={isOptimising || activeFloor.routers.length === 0}
              className="flex items-center gap-1.5 border border-[#bfdbfe] bg-[#eff6ff] hover:bg-[#dbeafe] text-[#1d4ed8] text-[12px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isOptimising ? 'Optimising…' : 'Optimise'}</span>
            </button>
          </div>

          <p className="mt-2.5 text-[12px] text-[#64748b] leading-relaxed">
            Uses your wall materials and the floor&apos;s environment, the same physics as the heatmap. Deterministic: the same plan always gives the same answer. Undo restores your own placement.
          </p>

          <div className="mt-3 pt-3 border-t border-[#f1f5f9] space-y-2">
            <div>
              <label className="block text-[10.5px] font-semibold tracking-wider text-[#64748b] uppercase mb-1">
                {mode === 'zigbee' ? 'ROUTER / COORDINATOR MODEL' : 'AP / ROUTER MODEL'}
              </label>
              <select
                aria-label="Estimate Router or Coordinator Model"
                value={estimateModelSlug}
                onChange={(e) => onChangeEstimateModel(e.target.value)}
                className="w-full border border-[#e2e8f0] focus:border-[#3b82f6] rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#0f172a] bg-white focus:outline-none cursor-pointer"
              >
                {filteredModels.map((m) => {
                  const roleLabel =
                    m.role === 'coordinator'
                      ? 'Coordinator'
                      : m.role === 'mesh'
                        ? 'Mesh'
                        : 'Router';
                  const displayBand = mode === 'zigbee' ? '2.4 GHz' : m.defaultBand;
                  return (
                    <option key={m.slug} value={m.slug}>
                      {m.name} ({m.txPowerDbm} dBm · {roleLabel} · {displayBand})
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="button"
              onClick={onCalculateNeededRouters}
              disabled={isEstimating}
              className="w-full border border-[#cbd5e1] hover:border-[#3b82f6] hover:bg-[#eff6ff] bg-white text-[#0f172a] hover:text-[#1d4ed8] text-[12.5px] font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>
                {isEstimating
                  ? 'Estimating minimum routers…'
                  : 'Estimate min routers (Full cover)'}
              </span>
            </button>
          </div>

          {sizingResult ? (
            <div className="mt-2.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-3 text-[12px] text-[#166534] space-y-2 tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span>
                  Minimum: <strong className="text-[13px]">{sizingResult.neededCount}</strong>{' '}
                  {sizingResult.neededCount === 1 ? 'router' : 'routers'}
                </span>
                <span className="font-semibold text-[#15803d]">
                  {sizingResult.achievedPct}% cover · {sizingResult.avgRssiDbm} dBm avg
                </span>
              </div>

              <div className="text-[11px] text-[#15803d]/85">
                {sizingResult.interiorOnly
                  ? 'Evaluated strictly inside enclosed rooms (excluding exterior space).'
                  : 'Evaluated across floor sheet (add ≥3 outer walls to mask rooms).'}
              </div>

              {sizingResult.breakdown.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#15803d]/90 font-mono-tabular">
                  {sizingResult.breakdown.map((step) => (
                    <span
                      key={step.count}
                      className={`px-1.5 py-0.5 rounded border ${
                        step.count === sizingResult.neededCount
                          ? 'bg-[#dcfce7] border-[#86efac] font-semibold text-[#14532d]'
                          : 'bg-white/70 border-[#bbf7d0]'
                      }`}
                    >
                      {step.count}R→{step.coveragePct}%
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={onApplyEstimatedRouters}
                className="w-full bg-[#059669] hover:bg-[#047857] text-white text-[12px] font-semibold py-1.5 px-3 rounded-md transition-colors cursor-pointer shadow-2xs"
              >
                Apply {sizingResult.neededCount}{' '}
                {sizingResult.neededCount === 1 ? 'router' : 'routers'} to floorplan
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#94a3b8] leading-snug">
              Calculates the fewest nodes needed inside rooms for full-floor coverage (≥ -85 dBm) using your chosen model &amp; walls.
            </p>
          )}
        </section>

        {/* Router Cards List */}
        <div className="space-y-2.5 pb-4">
          {activeFloor.routers.length === 0 && (
            <div className="bg-white border border-dashed border-[#cbd5e1] rounded-xl p-4 text-center space-y-2">
              <p className="text-[12.5px] font-medium text-[#475569]">
                No routers placed on this floor yet.
              </p>
              <p className="text-[11.5px] text-[#94a3b8]">
                Click anywhere on the floorplan with the Router tool (A) or add one at the center.
              </p>
              <button
                type="button"
                onClick={onAddRouterCenter}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#eff6ff] hover:bg-[#dbeafe] text-[#1d4ed8] text-[12px] font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Router-1</span>
              </button>
            </div>
          )}
          {activeFloor.routers.map((router, idx) => {
            const isSelected = router.id === selectedRouterId;

            if (!isSelected) {
              return (
                <button
                  key={router.id}
                  type="button"
                  onClick={() => onSelectRouter(router.id)}
                  className="w-full bg-white hover:bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-[#e2e8f0] text-[#475569] text-[12px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-[14px] text-[#0f172a] truncate">
                      {router.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#64748b] font-mono-tabular shrink-0">
                    <span>{router.txPowerDbm} dBm</span>
                    <span>·</span>
                    <span>{router.band}</span>
                  </div>
                </button>
              );
            }

            return (
              <div
                key={router.id}
                className="bg-white border-2 border-[#0284c7] rounded-xl p-4 shadow-sm space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-[#0284c7] text-white text-[12px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      aria-label="Router name"
                      value={router.name}
                      onChange={(e) => onUpdateRouter(router.id, { name: e.target.value })}
                      className="font-semibold text-[15px] text-[#0f172a] bg-transparent border-b border-transparent focus:border-[#0284c7] focus:outline-none w-32 truncate"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[12px] text-[#64748b] tabular-nums">
                      {router.band}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteRouter(router.id)}
                      title="Delete router"
                      className="p-1 text-[#94a3b8] hover:text-[#dc2626] rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-wider text-[#64748b] uppercase mb-1.5">
                    MODEL
                  </label>
                  <select
                    aria-label="Router Hardware Model"
                    value={router.modelSlug}
                    onChange={(e) => handleModelChange(router, e.target.value)}
                    className="w-full border border-[#e2e8f0] focus:border-[#0284c7] rounded-lg px-3 py-2 text-[13px] font-medium text-[#0f172a] bg-white focus:outline-none cursor-pointer"
                  >
                    {filteredModels.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold tracking-wider text-[#64748b] uppercase mb-1.5">
                      TX POWER
                    </label>
                    <div className="flex items-center justify-between border border-[#e2e8f0] focus-within:border-[#0284c7] rounded-lg px-3 py-2 bg-white">
                      <input
                        type="number"
                        aria-label="TX Power dBm"
                        min={-10}
                        max={30}
                        step={1}
                        value={router.txPowerDbm}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (Number.isFinite(val)) {
                            onUpdateRouter(router.id, {
                              txPowerDbm: Math.min(30, Math.max(-10, val)),
                              modelSlug: 'custom',
                            });
                          }
                        }}
                        className="w-full text-[13px] font-semibold text-[#0f172a] font-mono-tabular focus:outline-none"
                      />
                      <span className="text-[12px] text-[#94a3b8] ml-1.5">dBm</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold tracking-wider text-[#64748b] uppercase mb-1.5">
                      BAND
                    </label>
                    <select
                      aria-label="Frequency Band"
                      value={router.band}
                      onChange={(e) =>
                        onUpdateRouter(router.id, {
                          band: e.target.value as BandType,
                          modelSlug: 'custom',
                        })
                      }
                      className="w-full border border-[#e2e8f0] focus:border-[#0284c7] rounded-lg px-2.5 py-2 text-[13px] font-medium text-[#0f172a] bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="2.4 GHz">2.4 GHz</option>
                      {mode === 'wifi' && <option value="5 GHz">5 GHz</option>}
                      {mode === 'wifi' && <option value="6 GHz">6 GHz</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold tracking-wider text-[#64748b] uppercase mb-1.5">
                      ROLE
                    </label>
                    <select
                      aria-label="Router Role"
                      value={router.role}
                      onChange={(e) =>
                        onUpdateRouter(router.id, { role: e.target.value as RouterRole })
                      }
                      className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#334155] bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="coordinator">Coordinator</option>
                      <option value="router">Router / Repeater</option>
                      {mode === 'wifi' && <option value="mesh">Mesh Node</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold tracking-wider text-[#64748b] uppercase mb-1.5">
                      CHANNEL
                    </label>
                    <select
                      aria-label="Radio Channel"
                      value={router.channel}
                      onChange={(e) =>
                        onUpdateRouter(router.id, { channel: Number(e.target.value) })
                      }
                      className="w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#334155] bg-white focus:outline-none cursor-pointer font-mono-tabular"
                    >
                      {mode === 'zigbee' ? (
                        <>
                          <option value={11}>Ch 11</option>
                          <option value={15}>Ch 15 (Safe)</option>
                          <option value={20}>Ch 20 (Safe)</option>
                          <option value={25}>Ch 25 (Safe)</option>
                          <option value={26}>Ch 26 (Safe)</option>
                        </>
                      ) : router.band === '2.4 GHz' ? (
                        <>
                          <option value={1}>Ch 1</option>
                          <option value={6}>Ch 6</option>
                          <option value={11}>Ch 11</option>
                        </>
                      ) : (
                        <>
                          <option value={36}>Ch 36</option>
                          <option value={44}>Ch 44</option>
                          <option value={149}>Ch 149</option>
                          <option value={157}>Ch 157</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <aside className="hidden lg:block w-[356px] shrink-0 h-full overflow-hidden">
        {content}
      </aside>

      {/* Mobile / Tablet Slide-over Drawer */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative w-full max-w-[360px] h-full z-10 shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
