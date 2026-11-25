import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import {
  projects,
  floors,
  walls,
  routers,
  testClients,
  users,
} from '../db/schema.ts';
import type {
  AuthUser,
  BandType,
  CeilingMaterial,
  EnvironmentType,
  FloorData,
  ProjectData,
  RouterRole,
  SimulationMode,
} from '../types/zignals.ts';

export async function findUserById(id: number): Promise<AuthUser | null> {
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      planTier: users.planTier,
    })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
}

async function hydrateProjects(projectRows: (typeof projects.$inferSelect)[]): Promise<ProjectData[]> {
  if (projectRows.length === 0) return [];
  const db = getDb();
  const projectIds = projectRows.map((p) => p.id);

  const floorRows = await db
    .select()
    .from(floors)
    .where(inArray(floors.projectId, projectIds))
    .orderBy(asc(floors.floorOrder), asc(floors.id));

  const floorIds = floorRows.map((f) => f.id);

  const [wallRows, routerRows, clientRows] =
    floorIds.length > 0
      ? await Promise.all([
          db.select().from(walls).where(inArray(walls.floorId, floorIds)).orderBy(asc(walls.id)),
          db.select().from(routers).where(inArray(routers.floorId, floorIds)).orderBy(asc(routers.id)),
          db
            .select()
            .from(testClients)
            .where(inArray(testClients.floorId, floorIds))
            .orderBy(asc(testClients.id)),
        ])
      : [[], [], []];

  const wallsByFloor = new Map<number, typeof wallRows>();
  for (const w of wallRows) {
    const arr = wallsByFloor.get(w.floorId) ?? [];
    arr.push(w);
    wallsByFloor.set(w.floorId, arr);
  }

  const routersByFloor = new Map<number, typeof routerRows>();
  for (const r of routerRows) {
    const arr = routersByFloor.get(r.floorId) ?? [];
    arr.push(r);
    routersByFloor.set(r.floorId, arr);
  }

  const clientsByFloor = new Map<number, typeof clientRows>();
  for (const c of clientRows) {
    const arr = clientsByFloor.get(c.floorId) ?? [];
    arr.push(c);
    clientsByFloor.set(c.floorId, arr);
  }

  const floorsByProject = new Map<number, FloorData[]>();
  for (const f of floorRows) {
    const mappedFloor: FloorData = {
      id: f.id,
      projectId: f.projectId,
      name: f.name,
      floorOrder: f.floorOrder,
      scalePxPerMeter: f.scalePxPerMeter,
      ceilingMaterial: f.ceilingMaterial as CeilingMaterial,
      canvasWidth: f.canvasWidth,
      canvasHeight: f.canvasHeight,
      backgroundImage: f.backgroundImage,
      furnitureJson: f.furnitureJson ?? [],
      walls: (wallsByFloor.get(f.id) ?? []).map((w) => ({
        id: w.id,
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        materialSlug: w.materialSlug,
        thickness: w.thickness,
        color: w.color ?? undefined,
      })),
      routers: (routersByFloor.get(f.id) ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        x: r.x,
        y: r.y,
        modelSlug: r.modelSlug,
        txPowerDbm: r.txPowerDbm,
        antennaGainDbi: r.antennaGainDbi,
        band: r.band as BandType,
        channel: r.channel,
        role: r.role as RouterRole,
      })),
      testClients: (clientsByFloor.get(f.id) ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        x: c.x,
        y: c.y,
        deviceType: c.deviceType as 'smartphone' | 'laptop' | 'sensor',
      })),
    };

    const arr = floorsByProject.get(f.projectId) ?? [];
    arr.push(mappedFloor);
    floorsByProject.set(f.projectId, arr);
  }

  return projectRows.map((p) => ({
    id: p.id,
    userId: p.userId,
    isTemplate: p.isTemplate,
    title: p.title,
    mode: p.mode as SimulationMode,
    environment: p.environment as EnvironmentType,
    updatedAt: p.updatedAt.toISOString(),
    floors: floorsByProject.get(p.id) ?? [],
  }));
}

export async function getTemplateProject(): Promise<ProjectData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.isTemplate, true))
    .limit(1);
  const hydrated = await hydrateProjects(rows);
  return hydrated[0] ?? null;
}

export async function getUserProjects(userId: number): Promise<ProjectData[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.id));
  return hydrateProjects(rows);
}

export async function getOwnedProject(projectId: number, userId: number): Promise<ProjectData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (rows.length === 0 || rows[0].userId !== userId) {
    return null;
  }

  const hydrated = await hydrateProjects(rows);
  return hydrated[0] ?? null;
}

export async function createProjectForUser(
  userId: number,
  options: {
    title?: string;
    mode?: SimulationMode;
    environment?: EnvironmentType;
    cloneStarter?: boolean;
  }
): Promise<ProjectData> {
  const db = getDb();
  const template = options.cloneStarter !== false ? await getTemplateProject() : null;

  const createdId = await db.transaction(async (tx) => {
    const [proj] = await tx
      .insert(projects)
      .values({
        userId,
        isTemplate: false,
        title: options.title?.trim() || 'My floorplan',
        mode: options.mode ?? template?.mode ?? 'zigbee',
        environment: options.environment ?? template?.environment ?? 'Home',
      })
      .returning();

    if (template && template.floors.length > 0) {
      for (const fl of template.floors) {
        const [newFloor] = await tx
          .insert(floors)
          .values({
            projectId: proj.id,
            name: fl.name,
            floorOrder: fl.floorOrder,
            scalePxPerMeter: fl.scalePxPerMeter,
            ceilingMaterial: fl.ceilingMaterial,
            canvasWidth: fl.canvasWidth,
            canvasHeight: fl.canvasHeight,
            backgroundImage: fl.backgroundImage,
            furnitureJson: fl.furnitureJson,
          })
          .returning();

        if (fl.walls.length > 0) {
          await tx.insert(walls).values(
            fl.walls.map((w) => ({
              floorId: newFloor.id,
              x1: w.x1,
              y1: w.y1,
              x2: w.x2,
              y2: w.y2,
              materialSlug: w.materialSlug,
              thickness: w.thickness,
            }))
          );
        }

        if (fl.routers.length > 0) {
          await tx.insert(routers).values(
            fl.routers.map((r) => ({
              floorId: newFloor.id,
              name: r.name,
              x: r.x,
              y: r.y,
              modelSlug: r.modelSlug,
              txPowerDbm: r.txPowerDbm,
              antennaGainDbi: r.antennaGainDbi,
              band: r.band,
              channel: r.channel,
              role: r.role,
            }))
          );
        }

        if (fl.testClients.length > 0) {
          await tx.insert(testClients).values(
            fl.testClients.map((c) => ({
              floorId: newFloor.id,
              label: c.label,
              x: c.x,
              y: c.y,
              deviceType: c.deviceType,
            }))
          );
        }
      }
    } else {
      await tx.insert(floors).values({
        projectId: proj.id,
        name: 'Ground floor',
        floorOrder: 0,
        scalePxPerMeter: 2,
        ceilingMaterial: 'Concrete',
        canvasWidth: 580,
        canvasHeight: 640,
        backgroundImage: null,
        furnitureJson: [],
      });
    }

    return proj.id;
  });

  const hydrated = await getOwnedProject(createdId, userId);
  if (!hydrated) {
    throw new Error('Failed to load newly created project.');
  }
  return hydrated;
}
