export type SimulationMode = 'zigbee' | 'wifi';
export type EnvironmentType = 'Home' | 'Apartment' | 'Office' | 'Warehouse';
export type BandType = '2.4 GHz' | '5 GHz' | '6 GHz';
export type CeilingMaterial = 'Concrete' | 'Brick' | 'Wood' | 'Drywall' | 'Open';
export type RouterRole = 'coordinator' | 'router' | 'mesh';
export type ToolType = 'select' | 'wall' | 'router' | 'erase' | 'test-client' | 'measure';
export type CanvasViewMode = 'signal' | 'serving';

export type FurnitureKind =
  | 'dining-table'
  | 'chair'
  | 'plant'
  | 'bathtub'
  | 'sink'
  | 'toilet'
  | 'bed'
  | 'nightstand'
  | 'bookshelf'
  | 'sofa'
  | 'armchair'
  | 'coffee-table'
  | 'tv-console'
  | 'desk'
  | 'door-arc'
  | 'stool';

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  doorSweep?: {
    cx: number;
    cy: number;
    r: number;
    startAngle: number;
    endAngle: number;
  };
}

export interface WallMaterialRecord {
  id: number;
  slug: string;
  name: string;
  attenuation24GhzDb: number;
  attenuation5GhzDb: number;
  attenuation6GhzDb: number;
  thicknessPx: number;
  colorHex: string;
}

export interface RouterModelRecord {
  id: number;
  slug: string;
  name: string;
  protocol: string;
  txPowerDbm: number;
  antennaGainDbi: number;
  defaultBand: string;
  role: string;
}

export interface WallItem {
  id: string | number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  materialSlug: string;
  thickness: number;
  color?: string;
}

export interface RouterItem {
  id: string | number;
  name: string;
  x: number;
  y: number;
  modelSlug: string;
  txPowerDbm: number;
  antennaGainDbi: number;
  band: BandType;
  channel: number;
  role: RouterRole;
}

export interface TestClientItem {
  id: string | number;
  label: string;
  x: number;
  y: number;
  deviceType: 'smartphone' | 'laptop' | 'sensor';
}

export interface FloorData {
  id: number;
  projectId: number;
  name: string;
  floorOrder: number;
  scalePxPerMeter: number;
  ceilingMaterial: CeilingMaterial;
  canvasWidth: number;
  canvasHeight: number;
  backgroundImage: string | null;
  furnitureJson: FurnitureItem[];
  walls: WallItem[];
  routers: RouterItem[];
  testClients: TestClientItem[];
}

export interface ProjectData {
  id: number;
  userId: number | null;
  isTemplate: boolean;
  title: string;
  mode: SimulationMode;
  environment: EnvironmentType;
  updatedAt: string;
  floors: FloorData[];
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  planTier: string;
}

export interface BootstrapResponse {
  dbConfigured: boolean;
  user: AuthUser | null;
  wallMaterials: WallMaterialRecord[];
  routerModels: RouterModelRecord[];
  projects: ProjectData[];
  templateProject: ProjectData | null;
  error?: string;
}
