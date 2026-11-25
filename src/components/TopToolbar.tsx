import React, { useRef, useState } from 'react';
import {
  Building2,
  ChevronDown,
  Download,
  Eraser,
  FileText,
  FolderOpen,
  Home,
  Layers,
  Lock,
  LogOut,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  User,
  Wifi,
} from 'lucide-react';
import type {
  AuthUser,
  CeilingMaterial,
  EnvironmentType,
  FloorData,
  ProjectData,
  SimulationMode,
  ToolType,
  WallMaterialRecord,
} from '../types/zignals.ts';

interface TopToolbarProps {
  project: ProjectData;
  activeFloor: FloorData;
  user: AuthUser | null;
  projectsList: ProjectData[];
  mode: SimulationMode;
  activeTool: ToolType;
  selectedWallMaterial: string;
  wallMaterials: WallMaterialRecord[];
  showHeatmap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onSelectProject: (projectId: number) => void;
  onCreateProject: () => void;
  onChangeMode: (mode: SimulationMode) => void;
  onUploadFloorplan: (dataUrl: string, width: number, height: number) => void;
  onSelectTool: (tool: ToolType) => void;
  onSelectWallMaterial: (slug: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleHeatmap: () => void;
  onOpenReport: () => void;
  onExportPng: () => void;
  onClearFloor: () => void;
  onSelectFloor: (floorId: number) => void;
  onAddFloor: () => void;
  onDeleteFloor: (floorId: number) => void;
  onChangeEnvironment: (env: EnvironmentType) => void;
  onChangeCeiling: (ceiling: CeilingMaterial) => void;
  onToggleMobileInspector: () => void;
  isDetectingWalls: boolean;
  cvMode: 'auto' | 'thick' | 'thin';
  onChangeCvMode: (mode: 'auto' | 'thick' | 'thin') => void;
  onRedetectWallsCv: () => void;
  onRefineWallsAi: () => void;
  activeWallColor: string;
  wallCount: number;
  onChangeActiveWallColor: (hex: string) => void;
  onApplyWallColorToAll: (hex: string) => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  project,
  activeFloor,
  user,
  projectsList,
  mode,
  activeTool,
  selectedWallMaterial,
  wallMaterials,
  showHeatmap,
  canUndo,
  canRedo,
  onOpenAuth,
  onSignOut,
  onSelectProject,
  onCreateProject,
  onChangeMode,
  onUploadFloorplan,
  onSelectTool,
  onSelectWallMaterial,
  onUndo,
  onRedo,
  onToggleHeatmap,
  onOpenReport,
  onExportPng,
  onClearFloor,
  onSelectFloor,
  onAddFloor,
  onDeleteFloor,
  onChangeEnvironment,
  onChangeCeiling,
  onToggleMobileInspector,
  isDetectingWalls,
  cvMode,
  onChangeCvMode,
  onRedetectWallsCv,
  onRefineWallsAi,
  activeWallColor,
  wallCount,
  onChangeActiveWallColor,
  onApplyWallColorToAll,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [floorMenuOpen, setFloorMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // Fit uploaded image into clean logical bounds while preserving aspect ratio
        const maxW = 760;
        const maxH = 680;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1.5);
        const w = Math.max(360, Math.round(img.width * scale));
        const h = Math.max(360, Math.round(img.height * scale));
        onUploadFloorplan(dataUrl, w, h);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <header className="bg-white border-b border-[#e5e7eb] select-none shrink-0 z-30 no-print">
      {/* Primary Toolbar Row */}
      <div className="px-3 lg:px-4 py-2 flex flex-wrap items-center gap-2 border-b border-[#f1f5f9]">
        {/* Brand + Auth + Mode + Upload + Drawing Tools + Test Client + Undo/Redo */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 pr-1 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#2563eb] flex items-center justify-center text-white shadow-xs">
              <Wifi className="w-4 h-4 stroke-[2.4]" />
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0f172a] whitespace-nowrap">
              Zignals
            </span>
          </div>

          {/* Auth / Account Pill */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] text-[#1e40af] text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span className="max-w-[130px] truncate">{user.name}</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-1.5 w-64 bg-white border border-[#e2e8f0] rounded-xl shadow-lg p-2 z-50">
                    <div className="px-2.5 py-2 border-b border-[#f1f5f9]">
                      <div className="text-[12px] font-semibold text-[#0f172a] truncate">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-[#64748b] truncate">{user.email}</div>
                    </div>

                    <div className="py-1.5">
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                        Saved Floorplans ({projectsList.length})
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {projectsList.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              onSelectProject(p.id);
                              setUserMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[12px] transition-colors cursor-pointer ${
                              p.id === project.id
                                ? 'bg-[#eff6ff] text-[#1d4ed8] font-semibold'
                                : 'text-[#334155] hover:bg-[#f8fafc]'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{p.title}</span>
                            </span>
                            <span className="text-[10px] uppercase text-[#94a3b8] shrink-0">
                              {p.mode}
                            </span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onCreateProject();
                          setUserMenuOpen(false);
                        }}
                        className="w-full mt-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[#2563eb] hover:bg-[#eff6ff] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New floorplan project
                      </button>
                    </div>

                    <div className="pt-1 border-t border-[#f1f5f9]">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onSignOut();
                        }}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[#dc2626] hover:bg-[#fef2f2] transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3 h-3 text-[#64748b]" />
              <span>Already bought? Sign in</span>
            </button>
          )}

          {/* MODE Dropdown */}
          <div className="flex items-center gap-2 border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 bg-white shrink-0">
            <span className="text-[10px] font-semibold tracking-wider text-[#64748b] uppercase">
              MODE
            </span>
            <select
              aria-label="Simulation Mode"
              value={mode}
              onChange={(e) => onChangeMode(e.target.value as SimulationMode)}
              className="text-[13px] font-semibold text-[#0f172a] bg-transparent focus:outline-none cursor-pointer pr-1"
            >
              <option value="zigbee">Zigbee</option>
              <option value="wifi">WiFi</option>
            </select>
          </div>

          {/* Upload floorplan */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 border border-[#e2e8f0] hover:bg-[#f8fafc] bg-white text-[#1e293b] text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#475569]" />
            <span>Upload floorplan</span>
          </button>

          {/* Segmented Tools: Select V | Wall W | Router A | Erase E */}
          <div className="flex items-center bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-0.5 gap-0.5 shrink-0">
            {(
              [
                { id: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
                { id: 'wall', label: 'Wall', key: 'W', icon: PenLine },
                { id: 'router', label: 'Router', key: 'A', icon: Wifi },
                { id: 'erase', label: 'Erase', key: 'E', icon: Eraser },
              ] as const
            ).map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onSelectTool(tool.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#0f172a] font-semibold shadow-xs border border-[#cbd5e1]'
                      : 'text-[#475569] hover:text-[#0f172a] font-medium border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tool.label}</span>
                  <kbd className="hidden sm:inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-semibold text-[#64748b] bg-[#f1f5f9] border border-[#e2e8f0] rounded">
                    {tool.key}
                  </kbd>
                </button>
              );
            })}
          </div>

          {/* Test Client */}
          <button
            type="button"
            onClick={() =>
              onSelectTool(activeTool === 'test-client' ? 'select' : 'test-client')
            }
            className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTool === 'test-client'
                ? 'bg-[#eff6ff] border-[#3b82f6] text-[#1d4ed8]'
                : 'bg-white border-[#e2e8f0] hover:bg-[#f8fafc] text-[#1e293b]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-[#475569]" />
            <span>Test client</span>
          </button>

          {/* Undo / Redo */}
          <div className="flex items-center border border-[#e2e8f0] rounded-lg bg-white divide-x divide-[#e2e8f0] shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-[#1e293b] hover:bg-[#f8fafc] disabled:text-[#cbd5e1] disabled:hover:bg-white rounded-l-lg transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium text-[#1e293b] hover:bg-[#f8fafc] disabled:text-[#cbd5e1] disabled:hover:bg-white rounded-r-lg transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>Redo</span>
            </button>
          </div>
        </div>

        {/* Right Side Controls: Heatmap Toggle, Client Report, Export PNG, Clear */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onToggleHeatmap}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#f8fafc] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                showHeatmap ? 'bg-[#2563eb]' : 'bg-[#cbd5e1]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  showHeatmap ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </span>
            <span className="text-[13px] font-semibold text-[#1e293b]">Heatmap</span>
          </button>

          <button
            type="button"
            onClick={onOpenReport}
            className="flex items-center gap-1.5 border border-[#e2e8f0] hover:bg-[#f8fafc] bg-white text-[#1e293b] text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-[#475569]" />
            <span>Client report</span>
          </button>

          <button
            type="button"
            onClick={onExportPng}
            className="flex items-center gap-1.5 bg-[#059669] hover:bg-[#047857] text-white text-[13px] font-semibold px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PNG</span>
          </button>

          <button
            type="button"
            onClick={onClearFloor}
            className="flex items-center gap-1.5 border border-[#e2e8f0] hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#dc2626] bg-white text-[#1e293b] text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Secondary Bar: Floor Tabs & Environment / Ceiling Controls */}
      <div className="px-3 lg:px-4 py-2 flex flex-wrap items-center justify-between gap-2 bg-white">
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Floor Dropdown Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFloorMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] text-[#1d4ed8] rounded-full px-3 py-1 text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{activeFloor.name}</span>
              <span className="opacity-60">·</span>
              <span className="tabular-nums font-medium">
                {activeFloor.routers.length}{' '}
                {activeFloor.routers.length === 1 ? 'router' : 'routers'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-80" />
            </button>

            {floorMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setFloorMenuOpen(false)}
                />
                <div className="absolute left-0 mt-1.5 w-60 bg-white border border-[#e2e8f0] rounded-xl shadow-lg p-1.5 z-50">
                  {project.floors.map((fl) => (
                    <div
                      key={fl.id}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] ${
                        fl.id === activeFloor.id
                          ? 'bg-[#eff6ff] text-[#1d4ed8] font-semibold'
                          : 'text-[#334155] hover:bg-[#f8fafc]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectFloor(fl.id);
                          setFloorMenuOpen(false);
                        }}
                        className="flex-1 text-left truncate cursor-pointer"
                      >
                        {fl.name} · {fl.routers.length} routers
                      </button>
                      {project.floors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteFloor(fl.id);
                            setFloorMenuOpen(false);
                          }}
                          title="Delete floor"
                          className="p-1 text-[#94a3b8] hover:text-[#dc2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* + Add floor Pill */}
          <button
            type="button"
            onClick={onAddFloor}
            className="flex items-center gap-1.5 bg-[#fefce8] hover:bg-[#fef9c3] border border-[#fde68a] text-[#92400e] rounded-full px-3 py-1 text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add floor</span>
          </button>

          {/* Computer Vision Wall Detection + Optional AI Material Classifier when image uploaded */}
          {activeFloor.backgroundImage && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-[#f0fdf4] border border-[#bbf7d0] rounded-full overflow-hidden text-[12px]">
                <button
                  type="button"
                  onClick={onRedetectWallsCv}
                  className="flex items-center gap-1.5 px-3 py-1 font-semibold text-[#15803d] hover:bg-[#dcfce7] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Detect walls (CV)</span>
                </button>
                <select
                  aria-label="CV Wall Sensitivity"
                  value={cvMode}
                  onChange={(e) => onChangeCvMode(e.target.value as 'auto' | 'thick' | 'thin')}
                  className="bg-transparent border-l border-[#bbf7d0] pl-2 pr-2 py-1 text-[11.5px] font-semibold text-[#166534] focus:outline-none cursor-pointer"
                >
                  <option value="auto">Auto</option>
                  <option value="thick">Solid walls</option>
                  <option value="thin">Thin CAD</option>
                </select>
              </div>

              <button
                type="button"
                onClick={onRefineWallsAi}
                disabled={isDetectingWalls}
                title="Classify concrete / drywall / glass / door materials via OpenAI-compatible Vision AI"
                className="flex items-center gap-1.5 bg-[#f0f9ff] hover:bg-[#e0f2fe] border border-[#bae6fd] text-[#0369a1] rounded-full px-3 py-1 text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isDetectingWalls ? 'animate-spin' : ''}`} />
                <span>{isDetectingWalls ? 'Classifying…' : 'AI Materials'}</span>
              </button>
            </div>
          )}

          {/* Active Wall Material Selector when Wall tool is selected */}
          {activeTool === 'wall' && wallMaterials.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-[#cbd5e1] rounded-full px-3 py-1 text-[12px]">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
                style={{
                  backgroundColor:
                    wallMaterials.find((m) => m.slug === selectedWallMaterial)?.colorHex ??
                    activeWallColor,
                }}
              />
              <span className="text-[#64748b] font-medium">Material:</span>
              <select
                value={selectedWallMaterial}
                onChange={(e) => onSelectWallMaterial(e.target.value)}
                className="font-semibold text-[#0f172a] bg-transparent focus:outline-none cursor-pointer"
              >
                {wallMaterials.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name} (-{m.attenuation24GhzDb} dB)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Wall Color Picker & Preset Swatches */}
          {(activeTool === 'wall' || wallCount > 0) && (
            <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-full px-2.5 py-1 text-[12px]">
              <span className="text-[#64748b] font-medium pl-0.5">Wall color</span>
              <label
                title="Pick custom wall color"
                className="relative w-5 h-5 rounded-full border border-[#cbd5e1] shadow-2xs cursor-pointer overflow-hidden shrink-0"
                style={{ backgroundColor: activeWallColor }}
              >
                <input
                  type="color"
                  aria-label="Pick wall color"
                  value={activeWallColor}
                  onChange={(e) => onChangeActiveWallColor(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </label>

              <div className="hidden sm:flex items-center gap-1 px-0.5">
                {['#7c3aed', '#ef4444', '#ea580c', '#0284c7', '#10b981', '#db2777'].map(
                  (swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => onChangeActiveWallColor(swatch)}
                      title={`Select color ${swatch}`}
                      style={{ backgroundColor: swatch }}
                      className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer ${
                        activeWallColor.toLowerCase() === swatch
                          ? 'ring-2 ring-offset-1 ring-[#0f172a] scale-110'
                          : 'opacity-80 hover:opacity-100 hover:scale-110'
                      }`}
                    />
                  )
                )}
              </div>

              {wallCount > 0 && (
                <button
                  type="button"
                  onClick={() => onApplyWallColorToAll(activeWallColor)}
                  title="Apply picked color to all walls on this floor"
                  className="ml-0.5 px-2 py-0.5 rounded-full bg-white hover:bg-[#eff6ff] border border-[#cbd5e1] text-[11px] font-semibold text-[#1e293b] hover:text-[#1d4ed8] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Apply all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Environment + Ceiling + Mobile Inspector Toggle */}
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 border border-[#e2e8f0] rounded-full px-3 py-1 bg-white text-[12px]">
            <Home className="w-3.5 h-3.5 text-[#3b82f6]" />
            <span className="text-[#64748b]">Environment</span>
            <select
              aria-label="Floor Environment"
              value={project.environment}
              onChange={(e) => onChangeEnvironment(e.target.value as EnvironmentType)}
              className="font-semibold text-[#0f172a] bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="Home">Home</option>
              <option value="Apartment">Apartment</option>
              <option value="Office">Office</option>
              <option value="Warehouse">Warehouse</option>
            </select>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-[#64748b]">
            <Building2 className="w-3.5 h-3.5 text-[#94a3b8]" />
            <span>Ceiling above {activeFloor.name}:</span>
            <select
              aria-label="Ceiling Material"
              value={activeFloor.ceilingMaterial}
              onChange={(e) => onChangeCeiling(e.target.value as CeilingMaterial)}
              className="font-semibold text-[#1e293b] bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="Concrete">Concrete</option>
              <option value="Brick">Brick</option>
              <option value="Wood">Wood</option>
              <option value="Drywall">Drywall</option>
              <option value="Open">Open</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onToggleMobileInspector}
            className="lg:hidden flex items-center gap-1.5 border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-[#0f172a] rounded-lg px-2.5 py-1 text-[12px] font-semibold cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Inspector</span>
          </button>
        </div>
      </div>
    </header>
  );
};
