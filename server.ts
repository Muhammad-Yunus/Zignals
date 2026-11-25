import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq, asc } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import { getDb, isDatabaseConfigured } from './src/db/index.ts';
import {
  users,
  wallMaterials,
  routerModels,
  projects,
  floors,
  walls,
  routers,
  testClients,
} from './src/db/schema.ts';
import { ensureDatabaseSeeded } from './src/db/seed.ts';
import {
  extractBearerToken,
  hashPassword,
  requireAuthMiddleware,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import {
  createProjectForUser,
  findUserById,
  getOwnedProject,
  getTemplateProject,
  getUserProjects,
} from './src/server/projectsRepo.ts';
import {
  detectWallsWithAi,
  isAiWallDetectorConfigured,
} from './src/server/wallDetector.ts';
import type {
  BandType,
  CeilingMaterial,
  EnvironmentType,
  FloorData,
  RouterRole,
  SimulationMode,
} from './src/types/zignals.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_MODES = new Set<SimulationMode>(['zigbee', 'wifi']);
const VALID_ENVS = new Set<EnvironmentType>(['Home', 'Apartment', 'Office', 'Warehouse']);
const VALID_BANDS = new Set<BandType>(['2.4 GHz', '5 GHz', '6 GHz']);
const VALID_CEILINGS = new Set<CeilingMaterial>(['Concrete', 'Brick', 'Wood', 'Drywall', 'Open']);
const VALID_ROLES = new Set<RouterRole>(['coordinator', 'router', 'mesh']);

function isSafeImageDataUrl(val: unknown): val is string | null {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string') return false;
  if (val.length > 6_000_000) return false;
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(val);
}

function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= -2000 && n <= 10000;
}

function sanitizeHexColor(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  const requireAuth = requireAuthMiddleware(findUserById);

  if (isDatabaseConfigured()) {
    try {
      await ensureDatabaseSeeded();
    } catch (err) {
      console.error('Database seed check failed at startup:', err);
    }
  }

  // Health endpoint
  app.get('/api/health', async (_req, res) => {
    const dbConfigured = isDatabaseConfigured();
    if (!dbConfigured) {
      res.json({ ok: true, dbConfigured: false });
      return;
    }
    try {
      const db = getDb();
      await db.select().from(wallMaterials).limit(1);
      res.json({ ok: true, dbConfigured: true, dbConnected: true });
    } catch (err) {
      res.status(503).json({
        ok: false,
        dbConfigured: true,
        dbConnected: false,
        error: err instanceof Error ? err.message : 'Database connection error',
      });
    }
  });

  // Bootstrap endpoint: loads hardware catalog, wall attenuation profiles, template or user projects from PostgreSQL
  app.get('/api/bootstrap', async (req, res) => {
    if (!isDatabaseConfigured()) {
      res.json({
        dbConfigured: false,
        user: null,
        wallMaterials: [],
        routerModels: [],
        projects: [],
        templateProject: null,
        error:
          'Database credentials (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) are not configured in environment Secrets.',
      });
      return;
    }

    try {
      await ensureDatabaseSeeded();
      const db = getDb();

      const [materialsList, modelsList, templateProject] = await Promise.all([
        db.select().from(wallMaterials).orderBy(asc(wallMaterials.id)),
        db.select().from(routerModels).orderBy(asc(routerModels.id)),
        getTemplateProject(),
      ]);

      let authUser = null;
      let userProjects = [] as Awaited<ReturnType<typeof getUserProjects>>;

      const token = extractBearerToken(req);
      if (token) {
        const payload = verifyAuthToken(token);
        if (payload) {
          authUser = await findUserById(payload.userId);
          if (authUser) {
            userProjects = await getUserProjects(authUser.id);
          }
        }
      }

      res.json({
        dbConfigured: true,
        user: authUser,
        wallMaterials: materialsList,
        routerModels: modelsList,
        projects: userProjects,
        templateProject,
      });
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.status(500).json({
        dbConfigured: true,
        user: null,
        wallMaterials: [],
        routerModels: [],
        projects: [],
        templateProject: null,
        error: 'Failed to load data from PostgreSQL.',
      });
    }
  });

  // Auth: Register
  app.post('/api/auth/register', async (req, res) => {
    if (!isDatabaseConfigured()) {
      res.status(503).json({ error: 'Database is not configured.' });
      return;
    }
    try {
      const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (nameRaw.length < 2 || nameRaw.length > 100) {
        res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
        return;
      }
      if (passwordRaw.length < 8 || passwordRaw.length > 128) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' });
        return;
      }

      const db = getDb();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, emailRaw)).limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const passwordHash = await hashPassword(passwordRaw);
      const [createdUser] = await db
        .insert(users)
        .values({
          email: emailRaw,
          name: nameRaw,
          passwordHash,
          planTier: 'pro',
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          planTier: users.planTier,
        });

      const starterProject = await createProjectForUser(createdUser.id, {
        title: 'My floorplan',
        cloneStarter: true,
      });

      const token = signAuthToken(createdUser);
      res.status(201).json({
        token,
        user: createdUser,
        projects: [starterProject],
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed.' });
    }
  });

  // Auth: Login
  app.post('/api/auth/login', async (req, res) => {
    if (!isDatabaseConfigured()) {
      res.status(503).json({ error: 'Database is not configured.' });
      return;
    }
    try {
      const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!emailRaw || !passwordRaw) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const db = getDb();
      const [found] = await db.select().from(users).where(eq(users.email, emailRaw)).limit(1);
      if (!found) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const valid = await verifyPassword(passwordRaw, found.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const authUser = {
        id: found.id,
        email: found.email,
        name: found.name,
        planTier: found.planTier,
      };
      let userProjects = await getUserProjects(authUser.id);
      if (userProjects.length === 0) {
        const cloned = await createProjectForUser(authUser.id, { cloneStarter: true });
        userProjects = [cloned];
      }

      const token = signAuthToken(authUser);
      res.json({
        token,
        user: authUser,
        projects: userProjects,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Sign in failed.' });
    }
  });

  // Auth: Me
  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  // Projects: List
  app.get('/api/projects', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const list = await getUserProjects(req.authUser!.id);
      res.json({ projects: list });
    } catch (err) {
      console.error('List projects error:', err);
      res.status(500).json({ error: 'Failed to fetch projects.' });
    }
  });

  // Projects: Create (optionally saving guest workspace state)
  app.post('/api/projects', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : 'My floorplan';
      const mode: SimulationMode = VALID_MODES.has(req.body?.mode) ? req.body.mode : 'zigbee';
      const environment: EnvironmentType = VALID_ENVS.has(req.body?.environment)
        ? req.body.environment
        : 'Home';
      const cloneStarter = req.body?.cloneStarter !== false;

      const created = await createProjectForUser(req.authUser!.id, {
        title: title || 'My floorplan',
        mode,
        environment,
        cloneStarter,
      });

      // If client passed custom floors snapshot (e.g. saving guest edits right after login)
      if (Array.isArray(req.body?.floors) && req.body.floors.length > 0 && created.floors[0]) {
        const incomingFloor = req.body.floors[0] as FloorData;
        const targetFloorId = created.floors[0].id;
        const db = getDb();

        await db.transaction(async (tx) => {
          await tx
            .update(floors)
            .set({
              name: typeof incomingFloor.name === 'string' ? incomingFloor.name.slice(0, 80) : 'Ground floor',
              scalePxPerMeter:
                typeof incomingFloor.scalePxPerMeter === 'number' && incomingFloor.scalePxPerMeter > 0
                  ? Math.min(200, Math.max(0.1, incomingFloor.scalePxPerMeter))
                  : 2,
              ceilingMaterial: VALID_CEILINGS.has(incomingFloor.ceilingMaterial)
                ? incomingFloor.ceilingMaterial
                : 'Concrete',
              canvasWidth:
                typeof incomingFloor.canvasWidth === 'number'
                  ? Math.min(2000, Math.max(200, incomingFloor.canvasWidth))
                  : 580,
              canvasHeight:
                typeof incomingFloor.canvasHeight === 'number'
                  ? Math.min(2000, Math.max(200, incomingFloor.canvasHeight))
                  : 640,
              backgroundImage: isSafeImageDataUrl(incomingFloor.backgroundImage)
                ? incomingFloor.backgroundImage ?? null
                : null,
              furnitureJson: Array.isArray(incomingFloor.furnitureJson)
                ? incomingFloor.furnitureJson.slice(0, 200)
                : [],
            })
            .where(eq(floors.id, targetFloorId));

          await tx.delete(walls).where(eq(walls.floorId, targetFloorId));
          await tx.delete(routers).where(eq(routers.floorId, targetFloorId));
          await tx.delete(testClients).where(eq(testClients.floorId, targetFloorId));

          if (Array.isArray(incomingFloor.walls) && incomingFloor.walls.length > 0) {
            const validWalls = incomingFloor.walls
              .filter(
                (w) => isFiniteCoord(w.x1) && isFiniteCoord(w.y1) && isFiniteCoord(w.x2) && isFiniteCoord(w.y2)
              )
              .slice(0, 500);
            if (validWalls.length > 0) {
              await tx.insert(walls).values(
                validWalls.map((w) => ({
                  floorId: targetFloorId,
                  x1: w.x1,
                  y1: w.y1,
                  x2: w.x2,
                  y2: w.y2,
                  materialSlug: typeof w.materialSlug === 'string' ? w.materialSlug.slice(0, 32) : 'concrete',
                  thickness: typeof w.thickness === 'number' ? Math.min(24, Math.max(1, w.thickness)) : 6,
                  color: sanitizeHexColor(w.color),
                }))
              );
            }
          }

          if (Array.isArray(incomingFloor.routers) && incomingFloor.routers.length > 0) {
            const validRouters = incomingFloor.routers
              .filter((r) => isFiniteCoord(r.x) && isFiniteCoord(r.y))
              .slice(0, 30);
            if (validRouters.length > 0) {
              await tx.insert(routers).values(
                validRouters.map((r, idx) => ({
                  floorId: targetFloorId,
                  name: typeof r.name === 'string' ? r.name.slice(0, 60) : `Router-${idx + 1}`,
                  x: r.x,
                  y: r.y,
                  modelSlug: typeof r.modelSlug === 'string' ? r.modelSlug.slice(0, 60) : 'custom',
                  txPowerDbm: typeof r.txPowerDbm === 'number' ? Math.min(36, Math.max(-10, r.txPowerDbm)) : 7,
                  antennaGainDbi:
                    typeof r.antennaGainDbi === 'number' ? Math.min(18, Math.max(-5, r.antennaGainDbi)) : 2,
                  band: VALID_BANDS.has(r.band) ? r.band : '2.4 GHz',
                  channel: typeof r.channel === 'number' ? Math.min(165, Math.max(1, r.channel)) : 15,
                  role: VALID_ROLES.has(r.role) ? r.role : 'router',
                }))
              );
            }
          }
        });
      }

      const refreshed = await getOwnedProject(created.id, req.authUser!.id);
      res.status(201).json({ project: refreshed });
    } catch (err) {
      console.error('Create project error:', err);
      res.status(500).json({ error: 'Failed to create project.' });
    }
  });

  // Projects: Update metadata (title, mode, environment)
  app.patch('/api/projects/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        res.status(400).json({ error: 'Invalid project ID.' });
        return;
      }

      const existing = await getOwnedProject(projectId, req.authUser!.id);
      if (!existing) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const updates: Partial<typeof projects.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (typeof req.body?.title === 'string' && req.body.title.trim().length > 0) {
        updates.title = req.body.title.trim().slice(0, 120);
      }
      if (VALID_MODES.has(req.body?.mode)) {
        updates.mode = req.body.mode;
      }
      if (VALID_ENVS.has(req.body?.environment)) {
        updates.environment = req.body.environment;
      }

      const db = getDb();
      await db.update(projects).set(updates).where(eq(projects.id, projectId));
      const updated = await getOwnedProject(projectId, req.authUser!.id);
      res.json({ project: updated });
    } catch (err) {
      console.error('Update project error:', err);
      res.status(500).json({ error: 'Failed to update project.' });
    }
  });

  // Projects: Delete
  app.delete('/api/projects/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        res.status(400).json({ error: 'Invalid project ID.' });
        return;
      }
      const existing = await getOwnedProject(projectId, req.authUser!.id);
      if (!existing) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      const db = getDb();
      await db.delete(projects).where(eq(projects.id, projectId));
      res.json({ deleted: true });
    } catch (err) {
      console.error('Delete project error:', err);
      res.status(500).json({ error: 'Failed to delete project.' });
    }
  });

  // Floors: Add a floor to an owned project
  app.post('/api/projects/:id/floors', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = Number(req.params.id);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        res.status(400).json({ error: 'Invalid project ID.' });
        return;
      }
      const existing = await getOwnedProject(projectId, req.authUser!.id);
      if (!existing) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const nextOrder = existing.floors.length;
      const floorLabel =
        typeof req.body?.name === 'string' && req.body.name.trim().length > 0
          ? req.body.name.trim().slice(0, 80)
          : nextOrder === 1
            ? 'First floor'
            : `Floor ${nextOrder + 1}`;

      const baseFloor = existing.floors[0];
      const db = getDb();
      await db.transaction(async (tx) => {
        const [newFloor] = await tx
          .insert(floors)
          .values({
            projectId,
            name: floorLabel,
            floorOrder: nextOrder,
            scalePxPerMeter: baseFloor?.scalePxPerMeter ?? 2,
            ceilingMaterial: 'Concrete',
            canvasWidth: baseFloor?.canvasWidth ?? 580,
            canvasHeight: baseFloor?.canvasHeight ?? 640,
            backgroundImage: null,
            furnitureJson: [],
          })
          .returning();

        // Copy outer perimeter walls so the new floor matches building footprint
        if (baseFloor && baseFloor.walls.length > 0) {
          await tx.insert(walls).values(
            baseFloor.walls.slice(0, 5).map((w) => ({
              floorId: newFloor.id,
              x1: w.x1,
              y1: w.y1,
              x2: w.x2,
              y2: w.y2,
              materialSlug: w.materialSlug,
              thickness: w.thickness,
              color: sanitizeHexColor(w.color),
            }))
          );
        }

        await tx
          .update(projects)
          .set({ updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      });

      const updated = await getOwnedProject(projectId, req.authUser!.id);
      res.status(201).json({ project: updated });
    } catch (err) {
      console.error('Add floor error:', err);
      res.status(500).json({ error: 'Failed to add floor.' });
    }
  });

  // Floors: Atomically sync full floor geometry & simulation entities
  app.put('/api/floors/:floorId/state', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const floorId = Number(req.params.floorId);
      if (!Number.isInteger(floorId) || floorId <= 0) {
        res.status(400).json({ error: 'Invalid floor ID.' });
        return;
      }

      const db = getDb();
      const [floorRow] = await db.select().from(floors).where(eq(floors.id, floorId)).limit(1);
      if (!floorRow) {
        res.status(404).json({ error: 'Floor not found.' });
        return;
      }

      const ownedProject = await getOwnedProject(floorRow.projectId, req.authUser!.id);
      if (!ownedProject) {
        res.status(403).json({ error: 'You do not have permission to edit this floor.' });
        return;
      }

      if (!isSafeImageDataUrl(req.body?.backgroundImage)) {
        res.status(400).json({ error: 'Unsupported or oversized floorplan image format.' });
        return;
      }

      const scalePxPerMeter =
        typeof req.body?.scalePxPerMeter === 'number' && Number.isFinite(req.body.scalePxPerMeter)
          ? Math.min(200, Math.max(0.2, req.body.scalePxPerMeter))
          : floorRow.scalePxPerMeter;

      const ceilingMaterial: CeilingMaterial = VALID_CEILINGS.has(req.body?.ceilingMaterial)
        ? req.body.ceilingMaterial
        : (floorRow.ceilingMaterial as CeilingMaterial);

      const floorName =
        typeof req.body?.name === 'string' && req.body.name.trim().length > 0
          ? req.body.name.trim().slice(0, 80)
          : floorRow.name;

      const canvasWidth =
        typeof req.body?.canvasWidth === 'number' && Number.isFinite(req.body.canvasWidth)
          ? Math.min(2400, Math.max(240, Math.round(req.body.canvasWidth)))
          : floorRow.canvasWidth;

      const canvasHeight =
        typeof req.body?.canvasHeight === 'number' && Number.isFinite(req.body.canvasHeight)
          ? Math.min(2400, Math.max(240, Math.round(req.body.canvasHeight)))
          : floorRow.canvasHeight;

      const incomingWalls = Array.isArray(req.body?.walls) ? req.body.walls : [];
      const incomingRouters = Array.isArray(req.body?.routers) ? req.body.routers : [];
      const incomingClients = Array.isArray(req.body?.testClients) ? req.body.testClients : [];
      const incomingFurniture = Array.isArray(req.body?.furnitureJson)
        ? req.body.furnitureJson.slice(0, 200)
        : floorRow.furnitureJson;

      await db.transaction(async (tx) => {
        await tx
          .update(floors)
          .set({
            name: floorName,
            scalePxPerMeter,
            ceilingMaterial,
            canvasWidth,
            canvasHeight,
            backgroundImage:
              req.body?.backgroundImage === undefined
                ? floorRow.backgroundImage
                : req.body.backgroundImage || null,
            furnitureJson: incomingFurniture,
          })
          .where(eq(floors.id, floorId));

        await tx.delete(walls).where(eq(walls.floorId, floorId));
        await tx.delete(routers).where(eq(routers.floorId, floorId));
        await tx.delete(testClients).where(eq(testClients.floorId, floorId));

        const validWalls = incomingWalls
          .filter(
            (w: any) =>
              w && isFiniteCoord(w.x1) && isFiniteCoord(w.y1) && isFiniteCoord(w.x2) && isFiniteCoord(w.y2)
          )
          .slice(0, 500);

        if (validWalls.length > 0) {
          await tx.insert(walls).values(
            validWalls.map((w: any) => ({
              floorId,
              x1: w.x1,
              y1: w.y1,
              x2: w.x2,
              y2: w.y2,
              materialSlug: typeof w.materialSlug === 'string' ? w.materialSlug.slice(0, 32) : 'concrete',
              thickness:
                typeof w.thickness === 'number' && Number.isFinite(w.thickness)
                  ? Math.min(24, Math.max(1, w.thickness))
                  : 6,
              color: sanitizeHexColor(w.color),
            }))
          );
        }

        const validRouters = incomingRouters
          .filter((r: any) => r && isFiniteCoord(r.x) && isFiniteCoord(r.y))
          .slice(0, 30);

        if (validRouters.length > 0) {
          await tx.insert(routers).values(
            validRouters.map((r: any, idx: number) => ({
              floorId,
              name: typeof r.name === 'string' ? r.name.slice(0, 60) : `Router-${idx + 1}`,
              x: r.x,
              y: r.y,
              modelSlug: typeof r.modelSlug === 'string' ? r.modelSlug.slice(0, 60) : 'custom',
              txPowerDbm:
                typeof r.txPowerDbm === 'number' && Number.isFinite(r.txPowerDbm)
                  ? Math.min(36, Math.max(-10, r.txPowerDbm))
                  : 7,
              antennaGainDbi:
                typeof r.antennaGainDbi === 'number' && Number.isFinite(r.antennaGainDbi)
                  ? Math.min(18, Math.max(-5, r.antennaGainDbi))
                  : 2,
              band: VALID_BANDS.has(r.band) ? r.band : '2.4 GHz',
              channel:
                typeof r.channel === 'number' && Number.isFinite(r.channel)
                  ? Math.min(165, Math.max(1, Math.round(r.channel)))
                  : 15,
              role: VALID_ROLES.has(r.role) ? r.role : 'router',
            }))
          );
        }

        const validClients = incomingClients
          .filter((c: any) => c && isFiniteCoord(c.x) && isFiniteCoord(c.y))
          .slice(0, 30);

        if (validClients.length > 0) {
          await tx.insert(testClients).values(
            validClients.map((c: any, idx: number) => ({
              floorId,
              label: typeof c.label === 'string' ? c.label.slice(0, 60) : `Client-${idx + 1}`,
              x: c.x,
              y: c.y,
              deviceType:
                c.deviceType === 'laptop' || c.deviceType === 'sensor' ? c.deviceType : 'smartphone',
            }))
          );
        }

        await tx
          .update(projects)
          .set({ updatedAt: new Date() })
          .where(eq(projects.id, ownedProject.id));
      });

      const updated = await getOwnedProject(ownedProject.id, req.authUser!.id);
      res.json({ project: updated });
    } catch (err) {
      console.error('Update floor state error:', err);
      res.status(500).json({ error: 'Failed to save floorplan changes.' });
    }
  });

  // Floors: Delete secondary floor
  app.delete('/api/floors/:floorId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const floorId = Number(req.params.floorId);
      if (!Number.isInteger(floorId) || floorId <= 0) {
        res.status(400).json({ error: 'Invalid floor ID.' });
        return;
      }
      const db = getDb();
      const [floorRow] = await db.select().from(floors).where(eq(floors.id, floorId)).limit(1);
      if (!floorRow) {
        res.status(404).json({ error: 'Floor not found.' });
        return;
      }
      const ownedProject = await getOwnedProject(floorRow.projectId, req.authUser!.id);
      if (!ownedProject) {
        res.status(403).json({ error: 'Forbidden.' });
        return;
      }
      if (ownedProject.floors.length <= 1) {
        res.status(400).json({ error: 'Cannot delete the only floor in a project.' });
        return;
      }

      await db.delete(floors).where(eq(floors.id, floorId));
      const updated = await getOwnedProject(ownedProject.id, req.authUser!.id);
      res.json({ project: updated });
    } catch (err) {
      console.error('Delete floor error:', err);
      res.status(500).json({ error: 'Failed to delete floor.' });
    }
  });

  // Floorplans: Auto-detect architectural walls from uploaded floorplan via OpenAI-compatible Vision AI
  app.post('/api/floorplans/detect-walls', async (req, res) => {
    if (!isAiWallDetectorConfigured()) {
      res.status(503).json({
        configured: false,
        error: 'AI_BASE_URL, AI_KEY, and AI_MODEL are not configured in Secrets.',
      });
      return;
    }

    try {
      const imageDataUrl = req.body?.imageDataUrl;
      const canvasWidth = Number(req.body?.canvasWidth);
      const canvasHeight = Number(req.body?.canvasHeight);

      if (
        typeof imageDataUrl !== 'string' ||
        !imageDataUrl.startsWith('data:image/') ||
        !isSafeImageDataUrl(imageDataUrl)
      ) {
        res.status(400).json({ error: 'Invalid or oversized floorplan image.' });
        return;
      }

      if (
        !Number.isFinite(canvasWidth) ||
        !Number.isFinite(canvasHeight) ||
        canvasWidth < 200 ||
        canvasWidth > 2400 ||
        canvasHeight < 200 ||
        canvasHeight > 2400
      ) {
        res.status(400).json({ error: 'Invalid canvas dimensions.' });
        return;
      }

      const materialThicknessMap = new Map<string, number>();
      if (isDatabaseConfigured()) {
        const db = getDb();
        const mats = await db.select().from(wallMaterials);
        for (const m of mats) {
          materialThicknessMap.set(m.slug, m.thicknessPx);
        }
      }

      const incomingExisting = Array.isArray(req.body?.existingWalls)
        ? req.body.existingWalls
            .filter(
              (w: any) =>
                w &&
                isFiniteCoord(w.x1) &&
                isFiniteCoord(w.y1) &&
                isFiniteCoord(w.x2) &&
                isFiniteCoord(w.y2)
            )
            .slice(0, 300)
            .map((w: any) => ({
              x1: Number(w.x1),
              y1: Number(w.y1),
              x2: Number(w.x2),
              y2: Number(w.y2),
              materialSlug: typeof w.materialSlug === 'string' ? w.materialSlug : 'concrete',
              thickness: typeof w.thickness === 'number' ? w.thickness : 6,
            }))
        : undefined;

      const result = await detectWallsWithAi({
        imageDataUrl,
        canvasWidth,
        canvasHeight,
        existingWalls: incomingExisting,
        materialThicknessMap,
      });

      res.json({
        configured: true,
        walls: result.walls,
        modelUsed: result.modelUsed,
      });
    } catch (err) {
      console.error('AI wall detection error:', err);
      res.status(502).json({
        configured: true,
        error: err instanceof Error ? err.message : 'Failed to detect walls via AI service.',
      });
    }
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Zignals server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Zignals server:', err);
  process.exit(1);
});
