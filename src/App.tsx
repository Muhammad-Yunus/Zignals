import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopToolbar } from './components/TopToolbar.tsx';
import { FloorplanCanvas } from './components/FloorplanCanvas.tsx';
import { InspectorSidebar } from './components/InspectorSidebar.tsx';
import { AuthModal, ClientReportModal, MeasureModal } from './components/Modals.tsx';
import { exportFloorplanPng } from './lib/floorplanRenderer.ts';
import {
  detectWallsFromImageData,
  extractImageDataFromDataUrl,
} from './lib/wallVisionCv.ts';
import {
  buildMaterialMap,
  calculateNeededRouters,
  computeCoverageStats,
  optimiseRouterPlacement,
  type RouterProfileTemplate,
} from './lib/rfEngine.ts';
import type {
  AuthUser,
  BootstrapResponse,
  CanvasViewMode,
  CeilingMaterial,
  EnvironmentType,
  FloorData,
  ProjectData,
  RouterItem,
  RouterModelRecord,
  SimulationMode,
  ToolType,
  WallItem,
  WallMaterialRecord,
} from './types/zignals.ts';

function cloneFloor(floor: FloorData): FloorData {
  return {
    ...floor,
    furnitureJson: floor.furnitureJson.map((f) => ({ ...f })),
    walls: floor.walls.map((w) => ({ ...w })),
    routers: floor.routers.map((r) => ({ ...r })),
    testClients: floor.testClients.map((c) => ({ ...c })),
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auth state kept strictly in React memory (never localStorage/sessionStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [wallMaterials, setWallMaterials] = useState<WallMaterialRecord[]>([]);
  const [routerModels, setRouterModels] = useState<RouterModelRecord[]>([]);
  const [projectsList, setProjectsList] = useState<ProjectData[]>([]);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [activeFloorId, setActiveFloorId] = useState<number | null>(null);

  // Canvas & Inspector state matching mockup initial state
  const [activeTool, setActiveTool] = useState<ToolType>('router');
  const [selectedWallMaterial, setSelectedWallMaterial] = useState<string>('concrete');
  const [activeWallColor, setActiveWallColor] = useState<string>('#7c3aed');
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.85);
  const [viewMode, setViewMode] = useState<CanvasViewMode>('signal');
  const [selectedRouterId, setSelectedRouterId] = useState<string | number | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | number | null>(null);
  const [isolatedRouterId, setIsolatedRouterId] = useState<string | number | null>(null);

  const [undoStack, setUndoStack] = useState<FloorData[]>([]);
  const [redoStack, setRedoStack] = useState<FloorData[]>([]);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'unsaved'>('idle');
  const [isOptimising, setIsOptimising] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateModelSlug, setEstimateModelSlug] = useState<string>('sonoff-zbdongle-p');
  const [sizingResult, setSizingResult] = useState<{
    neededCount: number;
    achievedPct: number;
    avgRssiDbm: number;
    interiorOnly: boolean;
    recommendedRouters: RouterItem[];
    breakdown: { count: number; coveragePct: number }[];
  } | null>(null);

  // Modals & Responsive Drawer
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [measurePixels, setMeasurePixels] = useState<number | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [cvMode, setCvMode] = useState<'auto' | 'thick' | 'thin'>('auto');
  const [wallDetectionStatus, setWallDetectionStatus] = useState<{
    state: 'idle' | 'loading' | 'done' | 'error';
    message?: string;
  }>({ state: 'idle' });

  const saveTimerRef = useRef<number | null>(null);
  const statusClearTimerRef = useRef<number | null>(null);

  const loadBootstrap = useCallback(async (token: string | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/bootstrap', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = (await res.json()) as BootstrapResponse;

      setDbConfigured(data.dbConfigured);
      if (data.error && !data.templateProject && data.projects.length === 0) {
        setLoadError(data.error);
      }

      setWallMaterials(data.wallMaterials ?? []);
      setRouterModels(data.routerModels ?? []);

      const activeProj =
        data.projects && data.projects.length > 0
          ? data.projects[0]
          : data.templateProject;

      setProjectsList(data.projects ?? []);
      setProject(activeProj);

      if (activeProj && activeProj.floors.length > 0) {
        const fl = activeProj.floors[0];
        setActiveFloorId(fl.id);
        setSelectedRouterId(fl.routers[0]?.id ?? null);
      }
      setUndoStack([]);
      setRedoStack([]);
    } catch {
      setLoadError('Unable to connect to the Zignals backend server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBootstrap(null);
  }, [loadBootstrap]);

  const activeFloor = useMemo(() => {
    if (!project || project.floors.length === 0) return null;
    return project.floors.find((f) => f.id === activeFloorId) ?? project.floors[0];
  }, [project, activeFloorId]);

  const selectedWall = useMemo(() => {
    if (!activeFloor || selectedWallId === null) return null;
    return activeFloor.walls.find((w) => w.id === selectedWallId) ?? null;
  }, [activeFloor, selectedWallId]);

  const materialMap = useMemo(() => buildMaterialMap(wallMaterials), [wallMaterials]);

  // Keep estimateModelSlug valid when switching between Zigbee and WiFi or loading routerModels
  useEffect(() => {
    if (!project || routerModels.length === 0) return;
    const compatible = routerModels.filter(
      (m) => m.protocol === 'both' || m.protocol === project.mode
    );
    if (compatible.length === 0) return;
    const stillValid = compatible.some((m) => m.slug === estimateModelSlug);
    if (!stillValid) {
      const preferred =
        compatible.find((m) => m.slug !== 'custom') ?? compatible[0];
      setEstimateModelSlug(preferred.slug);
    }
  }, [project?.mode, routerModels, estimateModelSlug]);

  const coverageStats = useMemo(() => {
    if (!project || !activeFloor) {
      return { coveragePct: 0, avgRssiDbm: -105, excellentPct: 0, deadZonePct: 100 };
    }
    return computeCoverageStats(
      activeFloor,
      project.floors,
      project.environment,
      project.mode,
      materialMap,
      -85,
      isolatedRouterId
    );
  }, [project, activeFloor, materialMap, isolatedRouterId]);

  // Persist floor changes to PostgreSQL when authenticated
  const scheduleFloorSave = useCallback(
    (updatedFloor: FloorData) => {
      if (!authToken || !user || !project || project.isTemplate) return;
      setSavingState('saving');
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(async () => {
        try {
          const res = await fetch(`/api/floors/${updatedFloor.id}/state`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              name: updatedFloor.name,
              scalePxPerMeter: updatedFloor.scalePxPerMeter,
              ceilingMaterial: updatedFloor.ceilingMaterial,
              canvasWidth: updatedFloor.canvasWidth,
              canvasHeight: updatedFloor.canvasHeight,
              backgroundImage: updatedFloor.backgroundImage,
              furnitureJson: updatedFloor.furnitureJson,
              walls: updatedFloor.walls,
              routers: updatedFloor.routers,
              testClients: updatedFloor.testClients,
            }),
          });
          if (res.ok) {
            setSavingState('saved');
          } else {
            setSavingState('unsaved');
          }
        } catch {
          setSavingState('unsaved');
        }
      }, 450);
    },
    [authToken, user, project]
  );

  const mutateActiveFloor = useCallback(
    (updater: (fl: FloorData) => FloorData, options?: { skipHistory?: boolean; skipSave?: boolean }) => {
      setProject((prevProj) => {
        if (!prevProj) return prevProj;
        const targetId = activeFloorId ?? prevProj.floors[0]?.id;
        const currentFloor = prevProj.floors.find((f) => f.id === targetId);
        if (!currentFloor) return prevProj;

        if (!options?.skipHistory) {
          setUndoStack((u) => [...u.slice(-29), cloneFloor(currentFloor)]);
          setRedoStack([]);
        }

        const nextFloor = updater(cloneFloor(currentFloor));
        if (!options?.skipSave) {
          scheduleFloorSave(nextFloor);
        }
        setSizingResult(null);

        const nextProject = {
          ...prevProj,
          floors: prevProj.floors.map((f) => (f.id === targetId ? nextFloor : f)),
        };

        setProjectsList((list) =>
          list.map((p) => (p.id === nextProject.id ? nextProject : p))
        );
        return nextProject;
      });
    },
    [activeFloorId, scheduleFloorSave]
  );

  const handleUndo = useCallback(() => {
    if (!activeFloor || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, cloneFloor(activeFloor)]);
    setProject((prevProj) => {
      if (!prevProj) return prevProj;
      const next = {
        ...prevProj,
        floors: prevProj.floors.map((f) => (f.id === previous.id ? previous : f)),
      };
      scheduleFloorSave(previous);
      return next;
    });
  }, [activeFloor, undoStack, scheduleFloorSave]);

  const handleRedo = useCallback(() => {
    if (!activeFloor || redoStack.length === 0) return;
    const nextSnapshot = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, cloneFloor(activeFloor)]);
    setProject((prevProj) => {
      if (!prevProj) return prevProj;
      const next = {
        ...prevProj,
        floors: prevProj.floors.map((f) => (f.id === nextSnapshot.id ? nextSnapshot : f)),
      };
      scheduleFloorSave(nextSnapshot);
      return next;
    });
  }, [activeFloor, redoStack, scheduleFloorSave]);

  // Global keyboard shortcuts (V, W, A, E, Cmd/Ctrl+Z)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (e.key.toLowerCase() === 'v') setActiveTool('select');
      else if (e.key.toLowerCase() === 'w') setActiveTool('wall');
      else if (e.key.toLowerCase() === 'a') setActiveTool('router');
      else if (e.key.toLowerCase() === 'e') setActiveTool('erase');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const updateProjectMeta = async (patch: Partial<Pick<ProjectData, 'title' | 'mode' | 'environment'>>) => {
    if (!project) return;
    setProject((prev) => (prev ? { ...prev, ...patch } : prev));
    setProjectsList((list) =>
      list.map((p) => (p.id === project.id ? { ...p, ...patch } : p))
    );

    if (authToken && !project.isTemplate) {
      setSavingState('saving');
      try {
        const res = await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(patch),
        });
        setSavingState(res.ok ? 'saved' : 'unsaved');
      } catch {
        setSavingState('unsaved');
      }
    }
  };

  const handleChangeMode = (newMode: SimulationMode) => {
    if (!project) return;
    updateProjectMeta({ mode: newMode });
    // Adjust band on routers when switching into Zigbee (2.4 GHz only) or WiFi (5 GHz default)
    mutateActiveFloor((fl) => ({
      ...fl,
      routers: fl.routers.map((r) => ({
        ...r,
        band: newMode === 'zigbee' ? '2.4 GHz' : r.band,
        channel: newMode === 'zigbee' ? 15 : r.band === '2.4 GHz' ? 6 : 36,
      })),
    }));
  };

  const handleAddRouter = (x: number, y: number) => {
    if (!activeFloor || activeFloor.routers.length >= 12 || !project) return;
    const nextIndex = activeFloor.routers.length + 1;
    const newRouter: RouterItem = {
      id: `r-${Date.now()}-${nextIndex}`,
      name: `Router-${nextIndex}`,
      x,
      y,
      modelSlug: 'custom',
      txPowerDbm: project.mode === 'zigbee' ? 7 : 18,
      antennaGainDbi: 2.0,
      band: project.mode === 'zigbee' ? '2.4 GHz' : '5 GHz',
      channel: project.mode === 'zigbee' ? 15 : 36,
      role: 'router',
    };
    mutateActiveFloor((fl) => ({
      ...fl,
      routers: [...fl.routers, newRouter],
    }));
    setSelectedRouterId(newRouter.id);
  };

  const handleMoveRouter = (id: string | number, x: number, y: number, commit = true) => {
    mutateActiveFloor(
      (fl) => ({
        ...fl,
        routers: fl.routers.map((r) => (r.id === id ? { ...r, x, y } : r)),
      }),
      { skipHistory: !commit, skipSave: !commit }
    );
  };

  const handleDeleteRouter = (id: string | number) => {
    mutateActiveFloor((fl) => {
      const remaining = fl.routers.filter((r) => r.id !== id);
      if (selectedRouterId === id) {
        setSelectedRouterId(remaining[0]?.id ?? null);
      }
      if (isolatedRouterId === id) {
        setIsolatedRouterId(null);
      }
      return { ...fl, routers: remaining };
    });
  };

  const handleUpdateRouter = (id: string | number, patch: Partial<RouterItem>) => {
    mutateActiveFloor((fl) => ({
      ...fl,
      routers: fl.routers.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const handleAddWall = (wall: Omit<WallItem, 'id'>) => {
    const newId = `w-${Date.now()}`;
    mutateActiveFloor((fl) => ({
      ...fl,
      walls: [
        ...fl.walls,
        { ...wall, color: wall.color ?? activeWallColor, id: newId },
      ],
    }));
  };

  const handleUpdateWall = (id: string | number, patch: Partial<WallItem>) => {
    mutateActiveFloor((fl) => ({
      ...fl,
      walls: fl.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  };

  const handleDeleteWallById = (id: string | number) => {
    mutateActiveFloor((fl) => ({
      ...fl,
      walls: fl.walls.filter((w) => w.id !== id),
    }));
    if (selectedWallId === id) {
      setSelectedWallId(null);
    }
  };

  const handleApplyWallColorToAll = (hex: string) => {
    setActiveWallColor(hex);
    mutateActiveFloor((fl) => ({
      ...fl,
      walls: fl.walls.map((w) => ({ ...w, color: hex })),
    }));
  };

  const handleDeleteWallAt = (x: number, y: number) => {
    mutateActiveFloor((fl) => {
      let closestIdx = -1;
      let minDist = 12;
      fl.walls.forEach((w, idx) => {
        const d = distancePointToSegment(x, y, w.x1, w.y1, w.x2, w.y2);
        if (d < minDist) {
          minDist = d;
          closestIdx = idx;
        }
      });
      if (closestIdx < 0) return fl;
      const removed = fl.walls[closestIdx];
      if (removed && selectedWallId === removed.id) {
        setSelectedWallId(null);
      }
      return {
        ...fl,
        walls: fl.walls.filter((_, idx) => idx !== closestIdx),
      };
    });
  };

  const handleAddTestClient = (x: number, y: number) => {
    if (!activeFloor) return;
    const idx = activeFloor.testClients.length + 1;
    mutateActiveFloor((fl) => ({
      ...fl,
      testClients: [
        ...fl.testClients,
        {
          id: `c-${Date.now()}`,
          label: `Client-${idx}`,
          x,
          y,
          deviceType: 'smartphone',
        },
      ],
    }));
  };

  const handleDeleteTestClient = (id: string | number) => {
    mutateActiveFloor((fl) => ({
      ...fl,
      testClients: fl.testClients.filter((c) => c.id !== id),
    }));
  };

  const runCvWallDetection = useCallback(
    async (
      dataUrl: string,
      width: number,
      height: number,
      sensitivity: 'auto' | 'thick' | 'thin' = cvMode
    ) => {
      if (statusClearTimerRef.current) {
        window.clearTimeout(statusClearTimerRef.current);
      }
      setWallDetectionStatus({ state: 'loading', message: 'Extracting walls (CV)…' });
      try {
        const imageData = await extractImageDataFromDataUrl(dataUrl, width, height);
        const thicknessMap = new Map<string, number>();
        for (const m of wallMaterials) {
          thicknessMap.set(m.slug, m.thicknessPx);
        }
        const cvResult = detectWallsFromImageData(imageData, {
          materialThicknessMap: thicknessMap,
          sensitivity,
        });

        mutateActiveFloor((fl) => ({
          ...fl,
          walls: cvResult.walls.map((w, idx) => ({
            ...w,
            id: `cv-w-${Date.now()}-${idx}`,
          })),
        }));

        setWallDetectionStatus({
          state: 'done',
          message: `Detected ${cvResult.walls.length} walls (${cvResult.modeUsed === 'thin-cad' ? 'Thin CAD' : 'Solid CV'})`,
        });
        statusClearTimerRef.current = window.setTimeout(() => {
          setWallDetectionStatus({ state: 'idle' });
        }, 4500);
      } catch {
        setWallDetectionStatus({
          state: 'error',
          message: 'Failed to analyze floorplan image.',
        });
        statusClearTimerRef.current = window.setTimeout(() => {
          setWallDetectionStatus({ state: 'idle' });
        }, 5000);
      }
    },
    [cvMode, mutateActiveFloor, wallMaterials]
  );

  const runAiMaterialRefine = useCallback(async () => {
    if (!activeFloor?.backgroundImage) return;
    if (statusClearTimerRef.current) {
      window.clearTimeout(statusClearTimerRef.current);
    }
    setWallDetectionStatus({ state: 'loading', message: 'Classifying wall materials with AI…' });
    try {
      const res = await fetch('/api/floorplans/detect-walls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          imageDataUrl: activeFloor.backgroundImage,
          canvasWidth: activeFloor.canvasWidth,
          canvasHeight: activeFloor.canvasHeight,
          existingWalls: activeFloor.walls,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWallDetectionStatus({
          state: 'error',
          message: data.error || 'AI classification failed.',
        });
        statusClearTimerRef.current = window.setTimeout(() => {
          setWallDetectionStatus({ state: 'idle' });
        }, 5000);
        return;
      }

      const refined = Array.isArray(data.walls) ? (data.walls as Omit<WallItem, 'id'>[]) : [];
      mutateActiveFloor((fl) => ({
        ...fl,
        walls: refined.map((w, idx) => ({
          ...w,
          id: `ai-w-${Date.now()}-${idx}`,
        })),
      }));

      setWallDetectionStatus({
        state: 'done',
        message: `Classified ${refined.length} walls via AI`,
      });
      statusClearTimerRef.current = window.setTimeout(() => {
        setWallDetectionStatus({ state: 'idle' });
      }, 4500);
    } catch {
      setWallDetectionStatus({
        state: 'error',
        message: 'Unable to reach AI material classifier.',
      });
      statusClearTimerRef.current = window.setTimeout(() => {
        setWallDetectionStatus({ state: 'idle' });
      }, 5000);
    }
  }, [activeFloor, authToken, mutateActiveFloor]);

  const handleUploadFloorplan = (dataUrl: string, width: number, height: number) => {
    mutateActiveFloor((fl) => ({
      ...fl,
      backgroundImage: dataUrl,
      canvasWidth: width,
      canvasHeight: height,
      furnitureJson: [],
      walls: [],
    }));
    void runCvWallDetection(dataUrl, width, height, cvMode);
  };

  const handleClearFloor = () => {
    mutateActiveFloor((fl) => ({
      ...fl,
      walls: [],
      routers: [],
      testClients: [],
      furnitureJson: [],
      backgroundImage: null,
    }));
    setSelectedRouterId(null);
    setSelectedWallId(null);
    setIsolatedRouterId(null);
  };

  const handleAddFloor = async () => {
    if (!project) return;
    if (!authToken) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${project.id}/floors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.project) {
        setProject(data.project);
        setProjectsList((list) =>
          list.map((p) => (p.id === data.project.id ? data.project : p))
        );
        const newestFloor = data.project.floors[data.project.floors.length - 1];
        if (newestFloor) {
          setActiveFloorId(newestFloor.id);
          setSelectedRouterId(newestFloor.routers[0]?.id ?? null);
        }
      }
    } catch {
      // ignore transient error
    }
  };

  const handleDeleteFloor = async (floorId: number) => {
    if (!project || !authToken || project.floors.length <= 1) return;
    try {
      const res = await fetch(`/api/floors/${floorId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.project) {
        setProject(data.project);
        const nextFloor = data.project.floors[0];
        if (nextFloor) {
          setActiveFloorId(nextFloor.id);
          setSelectedRouterId(nextFloor.routers[0]?.id ?? null);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleCreateProject = async () => {
    if (!authToken) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: `Floorplan ${projectsList.length + 1}`,
          mode: project?.mode ?? 'zigbee',
          environment: project?.environment ?? 'Home',
          cloneStarter: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.project) {
        setProjectsList((prev) => [data.project, ...prev]);
        setProject(data.project);
        setActiveFloorId(data.project.floors[0]?.id ?? null);
        setSelectedRouterId(data.project.floors[0]?.routers[0]?.id ?? null);
      }
    } catch {
      // ignore
    }
  };

  const handleAuthSuccess = async (
    token: string,
    loggedUser: AuthUser,
    userProjects: ProjectData[]
  ) => {
    setAuthToken(token);
    setUser(loggedUser);
    setProjectsList(userProjects);
    if (userProjects.length > 0) {
      const first = userProjects[0];
      setProject(first);
      setActiveFloorId(first.floors[0]?.id ?? null);
      setSelectedRouterId(first.floors[0]?.routers[0]?.id ?? null);
      setUndoStack([]);
      setRedoStack([]);
      setSavingState('saved');
    }
  };

  const handleSignOut = () => {
    setAuthToken(null);
    setUser(null);
    setSavingState('idle');
    loadBootstrap(null);
  };

  const handleOptimisePlacement = () => {
    if (!project || !activeFloor || activeFloor.routers.length === 0) return;
    setIsOptimising(true);
    window.setTimeout(() => {
      const result = optimiseRouterPlacement(
        activeFloor,
        project.environment,
        project.mode,
        materialMap
      );
      mutateActiveFloor((fl) => ({
        ...fl,
        routers: result.routers,
      }));
      setIsOptimising(false);
    }, 30);
  };

  const buildEstimateProfile = useCallback(
    (modelSlug: string): RouterProfileTemplate | undefined => {
      if (!project) return undefined;
      const model = routerModels.find((m) => m.slug === modelSlug);
      if (!model) return undefined;
      if (model.slug === 'custom') {
        const firstRouter = activeFloor?.routers[0];
        if (firstRouter) {
          return {
            modelSlug: 'custom',
            txPowerDbm: firstRouter.txPowerDbm,
            antennaGainDbi: firstRouter.antennaGainDbi ?? 2,
            band: firstRouter.band,
            role: firstRouter.role,
          };
        }
        return {
          modelSlug: 'custom',
          txPowerDbm: project.mode === 'zigbee' ? 7 : 18,
          antennaGainDbi: 2,
          band: project.mode === 'zigbee' ? '2.4 GHz' : '5 GHz',
          role: 'router',
        };
      }
      return {
        modelSlug: model.slug,
        txPowerDbm: model.txPowerDbm,
        antennaGainDbi: model.antennaGainDbi,
        band:
          project.mode === 'zigbee'
            ? '2.4 GHz'
            : (model.defaultBand as RouterProfileTemplate['band']),
        role: model.role as RouterProfileTemplate['role'],
      };
    },
    [project, routerModels, activeFloor]
  );

  const runEstimationWithModel = useCallback(
    (modelSlug: string) => {
      if (!project || !activeFloor) return;
      setIsEstimating(true);
      window.setTimeout(() => {
        const profile = buildEstimateProfile(modelSlug);
        const res = calculateNeededRouters(
          activeFloor,
          project.environment,
          project.mode,
          materialMap,
          98,
          -85,
          profile
        );
        setSizingResult(res);
        setIsEstimating(false);
      }, 20);
    },
    [project, activeFloor, buildEstimateProfile, materialMap]
  );

  const handleCalculateNeededRouters = () => {
    runEstimationWithModel(estimateModelSlug);
  };

  const handleApplyEstimatedRouters = () => {
    if (!sizingResult || sizingResult.recommendedRouters.length === 0) return;
    const routersToApply = sizingResult.recommendedRouters.map((r, i) => ({
      ...r,
      id: `r-est-${Date.now()}-${i + 1}`,
    }));
    mutateActiveFloor((fl) => ({
      ...fl,
      routers: routersToApply,
    }));
    setSelectedRouterId(routersToApply[0]?.id ?? null);
    setSelectedWallId(null);
    setIsolatedRouterId(null);
  };

  const handleExportPng = () => {
    if (!project || !activeFloor) return;
    const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    void exportFloorplanPng(
      {
        floor: activeFloor,
        allFloors: project.floors,
        environment: project.environment,
        mode: project.mode,
        materialMap,
        showHeatmap,
        heatmapOpacity,
        viewMode,
        selectedRouterId,
        isolatedRouterId,
      },
      `zignals-${slug || 'floorplan'}.png`
    );
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#0d1424] flex flex-col items-center justify-center text-white gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#2563eb] animate-pulse" />
        <p className="text-[14px] font-medium text-[#cbd5e1]">
          Loading Zignals workspace from PostgreSQL…
        </p>
      </div>
    );
  }

  if (!dbConfigured || !project || !activeFloor) {
    return (
      <div className="min-h-screen bg-[#0d1424] text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#161f33] border border-[#2a3650] rounded-2xl p-6 space-y-4 shadow-2xl">
          <h1 className="text-[18px] font-bold">Database Connection Required</h1>
          <p className="text-[13px] text-[#cbd5e1] leading-relaxed">
            {loadError ||
              'Zignals loads all hardware profiles, wall attenuation tables, and floorplan projects directly from PostgreSQL.'}
          </p>
          <div className="bg-[#0d1424] border border-[#2a3650] rounded-xl p-3.5 text-[12px] text-[#94a3b8] space-y-1.5">
            <p className="font-semibold text-white">To connect your PostgreSQL database:</p>
            <p>1. Open AI Studio Settings → Secrets.</p>
            <p>
              2. Add <code className="text-[#38bdf8]">DB_HOST</code>,{' '}
              <code className="text-[#38bdf8]">DB_PORT</code>,{' '}
              <code className="text-[#38bdf8]">DB_NAME</code>,{' '}
              <code className="text-[#38bdf8]">DB_USER</code>,{' '}
              <code className="text-[#38bdf8]">DB_PASSWORD</code>, and{' '}
              <code className="text-[#38bdf8]">DB_SSL</code>.
            </p>
            <p>3. Reload this preview to initialize the workspace.</p>
          </div>
          <button
            type="button"
            onClick={() => loadBootstrap(authToken)}
            className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[13px] font-semibold rounded-lg cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      <TopToolbar
        project={project}
        activeFloor={activeFloor}
        user={user}
        projectsList={projectsList}
        mode={project.mode}
        activeTool={activeTool}
        selectedWallMaterial={selectedWallMaterial}
        wallMaterials={wallMaterials}
        showHeatmap={showHeatmap}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={handleSignOut}
        onSelectProject={(pid) => {
          const found = projectsList.find((p) => p.id === pid);
          if (found) {
            setProject(found);
            setActiveFloorId(found.floors[0]?.id ?? null);
            setSelectedRouterId(found.floors[0]?.routers[0]?.id ?? null);
            setSelectedWallId(null);
            setUndoStack([]);
            setRedoStack([]);
          }
        }}
        onCreateProject={handleCreateProject}
        onChangeMode={handleChangeMode}
        onUploadFloorplan={handleUploadFloorplan}
        onSelectTool={setActiveTool}
        onSelectWallMaterial={(slug) => {
          setSelectedWallMaterial(slug);
          const mat = wallMaterials.find((m) => m.slug === slug);
          if (mat?.colorHex) {
            setActiveWallColor(mat.colorHex);
          }
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onToggleHeatmap={() => setShowHeatmap((s) => !s)}
        onOpenReport={() => setReportModalOpen(true)}
        onExportPng={handleExportPng}
        onClearFloor={handleClearFloor}
        onSelectFloor={(fid) => {
          setActiveFloorId(fid);
          const fl = project.floors.find((f) => f.id === fid);
          setSelectedRouterId(fl?.routers[0]?.id ?? null);
          setSelectedWallId(null);
          setIsolatedRouterId(null);
          setUndoStack([]);
          setRedoStack([]);
        }}
        onAddFloor={handleAddFloor}
        onDeleteFloor={handleDeleteFloor}
        onChangeEnvironment={(env: EnvironmentType) => updateProjectMeta({ environment: env })}
        onChangeCeiling={(ceiling: CeilingMaterial) =>
          mutateActiveFloor((fl) => ({ ...fl, ceilingMaterial: ceiling }))
        }
        onToggleMobileInspector={() => setMobileInspectorOpen((o) => !o)}
        isDetectingWalls={wallDetectionStatus.state === 'loading'}
        cvMode={cvMode}
        onChangeCvMode={(newCvMode) => {
          setCvMode(newCvMode);
          if (activeFloor.backgroundImage) {
            void runCvWallDetection(
              activeFloor.backgroundImage,
              activeFloor.canvasWidth,
              activeFloor.canvasHeight,
              newCvMode
            );
          }
        }}
        onRedetectWallsCv={() => {
          if (activeFloor.backgroundImage) {
            void runCvWallDetection(
              activeFloor.backgroundImage,
              activeFloor.canvasWidth,
              activeFloor.canvasHeight,
              cvMode
            );
          }
        }}
        onRefineWallsAi={() => {
          void runAiMaterialRefine();
        }}
        activeWallColor={activeWallColor}
        wallCount={activeFloor.walls.length}
        onChangeActiveWallColor={(hex) => {
          setActiveWallColor(hex);
          if (selectedWallId !== null) {
            handleUpdateWall(selectedWallId, { color: hex });
          }
        }}
        onApplyWallColorToAll={handleApplyWallColorToAll}
      />

      <main className="flex-1 flex min-h-0 overflow-hidden no-print">
        <FloorplanCanvas
          floor={activeFloor}
          allFloors={project.floors}
          environment={project.environment}
          mode={project.mode}
          materialMap={materialMap}
          activeTool={activeTool}
          selectedWallMaterial={selectedWallMaterial}
          showHeatmap={showHeatmap}
          heatmapOpacity={heatmapOpacity}
          viewMode={viewMode}
          selectedRouterId={selectedRouterId}
          selectedWallId={selectedWallId}
          activeWallColor={activeWallColor}
          isolatedRouterId={isolatedRouterId}
          coveragePct={coverageStats.coveragePct}
          onChangeViewMode={setViewMode}
          onChangeHeatmapOpacity={setHeatmapOpacity}
          onToggleIsolateRouter={() =>
            setIsolatedRouterId((curr) =>
              curr !== null ? null : selectedRouterId
            )
          }
          onSelectRouter={(id) => {
            setSelectedRouterId(id);
            if (id !== null) setSelectedWallId(null);
          }}
          onSelectWall={(id) => {
            setSelectedWallId(id);
            if (id !== null) setSelectedRouterId(null);
          }}
          onMoveRouter={handleMoveRouter}
          onAddRouter={handleAddRouter}
          onDeleteRouter={handleDeleteRouter}
          onAddWall={handleAddWall}
          onDeleteWallAt={handleDeleteWallAt}
          onAddTestClient={handleAddTestClient}
          onDeleteTestClient={handleDeleteTestClient}
          onCompleteMeasure={(pxDist) => {
            setMeasurePixels(pxDist);
            setActiveTool('select');
          }}
          wallDetectionStatus={wallDetectionStatus}
        />

        <InspectorSidebar
          project={project}
          activeFloor={activeFloor}
          mode={project.mode}
          routerModels={routerModels}
          selectedRouterId={selectedRouterId}
          selectedWall={selectedWall}
          wallMaterials={wallMaterials}
          estimateModelSlug={estimateModelSlug}
          sizingResult={sizingResult}
          isOptimising={isOptimising}
          isEstimating={isEstimating}
          isMobileOpen={mobileInspectorOpen}
          savingState={savingState}
          onCloseMobile={() => setMobileInspectorOpen(false)}
          onRenameProject={(title) => updateProjectMeta({ title })}
          onChangeScale={(scalePxPerMeter) =>
            mutateActiveFloor((fl) => ({ ...fl, scalePxPerMeter }))
          }
          onStartMeasure={() => {
            setActiveTool('measure');
            setMobileInspectorOpen(false);
          }}
          onOptimisePlacement={handleOptimisePlacement}
          onChangeEstimateModel={(slug) => {
            setEstimateModelSlug(slug);
            if (sizingResult) {
              runEstimationWithModel(slug);
            }
          }}
          onCalculateNeededRouters={handleCalculateNeededRouters}
          onApplyEstimatedRouters={handleApplyEstimatedRouters}
          onSelectRouter={(id) => {
            setSelectedRouterId(id);
            setSelectedWallId(null);
          }}
          onUpdateRouter={handleUpdateRouter}
          onDeleteRouter={handleDeleteRouter}
          onUpdateWall={handleUpdateWall}
          onDeleteWall={handleDeleteWallById}
          onAddRouterCenter={() =>
            handleAddRouter(
              Math.round(activeFloor.canvasWidth / 2),
              Math.round(activeFloor.canvasHeight / 2)
            )
          }
        />
      </main>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      <MeasureModal
        pixelDistance={measurePixels}
        onCancel={() => setMeasurePixels(null)}
        onConfirm={(meters) => {
          if (measurePixels && meters > 0) {
            const newScale = Number((measurePixels / meters).toFixed(2));
            mutateActiveFloor((fl) => ({
              ...fl,
              scalePxPerMeter: Math.min(120, Math.max(0.5, newScale)),
            }));
          }
          setMeasurePixels(null);
        }}
      />

      <ClientReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        project={project}
        activeFloor={activeFloor}
        coverageStats={coverageStats}
        materialMap={materialMap}
        showHeatmap={showHeatmap}
        heatmapOpacity={heatmapOpacity}
        viewMode={viewMode}
        isolatedRouterId={isolatedRouterId}
      />
    </div>
  );
}
