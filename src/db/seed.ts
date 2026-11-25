import { eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured } from './index.ts';
import {
  wallMaterials,
  routerModels,
  projects,
  floors,
} from './schema.ts';

const INITIAL_WALL_MATERIALS = [
  {
    slug: 'concrete',
    name: 'Concrete / Load-bearing',
    attenuation24GhzDb: 12.0,
    attenuation5GhzDb: 16.0,
    attenuation6GhzDb: 20.0,
    thicknessPx: 8,
    colorHex: '#7c3aed',
  },
  {
    slug: 'brick',
    name: 'Brick / Masonry',
    attenuation24GhzDb: 8.0,
    attenuation5GhzDb: 11.0,
    attenuation6GhzDb: 14.0,
    thicknessPx: 6,
    colorHex: '#ea580c',
  },
  {
    slug: 'drywall',
    name: 'Drywall / Plaster',
    attenuation24GhzDb: 3.5,
    attenuation5GhzDb: 5.0,
    attenuation6GhzDb: 6.5,
    thicknessPx: 4,
    colorHex: '#0284c7',
  },
  {
    slug: 'wood',
    name: 'Wood / Partition',
    attenuation24GhzDb: 4.0,
    attenuation5GhzDb: 6.0,
    attenuation6GhzDb: 7.5,
    thicknessPx: 4,
    colorHex: '#d97706',
  },
  {
    slug: 'glass',
    name: 'Glass / Window',
    attenuation24GhzDb: 2.5,
    attenuation5GhzDb: 4.0,
    attenuation6GhzDb: 5.5,
    thicknessPx: 3,
    colorHex: '#06b6d4',
  },
  {
    slug: 'metal',
    name: 'Metal / Elevator Shaft',
    attenuation24GhzDb: 18.0,
    attenuation5GhzDb: 22.0,
    attenuation6GhzDb: 26.0,
    thicknessPx: 7,
    colorHex: '#db2777',
  },
  {
    slug: 'door',
    name: 'Interior Door',
    attenuation24GhzDb: 2.0,
    attenuation5GhzDb: 3.0,
    attenuation6GhzDb: 4.0,
    thicknessPx: 3,
    colorHex: '#10b981',
  },
];

const INITIAL_ROUTER_MODELS = [
  {
    slug: 'custom',
    name: 'Custom — set manually',
    protocol: 'both',
    txPowerDbm: 7,
    antennaGainDbi: 2.0,
    defaultBand: '2.4 GHz',
    role: 'router',
  },
  {
    slug: 'sonoff-zbdongle-p',
    name: 'SONOFF ZBDongle-P (CC2652P)',
    protocol: 'zigbee',
    txPowerDbm: 20,
    antennaGainDbi: 3.0,
    defaultBand: '2.4 GHz',
    role: 'coordinator',
  },
  {
    slug: 'smlight-slzb06',
    name: 'SMLIGHT SLZB-06 PoE Coordinator',
    protocol: 'zigbee',
    txPowerDbm: 20,
    antennaGainDbi: 5.0,
    defaultBand: '2.4 GHz',
    role: 'coordinator',
  },
  {
    slug: 'ha-connect-zbt1',
    name: 'Home Assistant Connect ZBT-1',
    protocol: 'zigbee',
    txPowerDbm: 10,
    antennaGainDbi: 2.0,
    defaultBand: '2.4 GHz',
    role: 'coordinator',
  },
  {
    slug: 'ikea-tradfri-rep',
    name: 'IKEA TRÅDFRI Signal Repeater',
    protocol: 'zigbee',
    txPowerDbm: 7,
    antennaGainDbi: 1.5,
    defaultBand: '2.4 GHz',
    role: 'router',
  },
  {
    slug: 'philips-hue-bridge',
    name: 'Philips Hue Bridge v2',
    protocol: 'zigbee',
    txPowerDbm: 8,
    antennaGainDbi: 2.0,
    defaultBand: '2.4 GHz',
    role: 'coordinator',
  },
  {
    slug: 'unifi-u6-pro',
    name: 'Ubiquiti UniFi U6 Pro',
    protocol: 'wifi',
    txPowerDbm: 22,
    antennaGainDbi: 4.0,
    defaultBand: '5 GHz',
    role: 'router',
  },
  {
    slug: 'unifi-u7-pro',
    name: 'Ubiquiti UniFi U7 Pro',
    protocol: 'wifi',
    txPowerDbm: 23,
    antennaGainDbi: 5.0,
    defaultBand: '6 GHz',
    role: 'router',
  },
  {
    slug: 'tplink-deco-xe75',
    name: 'TP-Link Deco XE75 Mesh',
    protocol: 'wifi',
    txPowerDbm: 20,
    antennaGainDbi: 3.0,
    defaultBand: '5 GHz',
    role: 'mesh',
  },
  {
    slug: 'asus-zenwifi-xt8',
    name: 'ASUS ZenWiFi XT8',
    protocol: 'wifi',
    txPowerDbm: 21,
    antennaGainDbi: 3.5,
    defaultBand: '5 GHz',
    role: 'mesh',
  },
  {
    slug: 'eero-pro-6e',
    name: 'Amazon eero Pro 6E',
    protocol: 'wifi',
    txPowerDbm: 20,
    antennaGainDbi: 3.0,
    defaultBand: '5 GHz',
    role: 'mesh',
  },
];

let seedDone = false;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (!isDatabaseConfigured() || seedDone) return;
  const db = getDb();

  // Upsert wall materials with distinct visual colors
  for (const mat of INITIAL_WALL_MATERIALS) {
    await db
      .insert(wallMaterials)
      .values(mat)
      .onConflictDoUpdate({
        target: wallMaterials.slug,
        set: { colorHex: mat.colorHex },
      });
  }

  // Upsert router models
  for (const model of INITIAL_ROUTER_MODELS) {
    await db
      .insert(routerModels)
      .values(model)
      .onConflictDoNothing({ target: routerModels.slug });
  }

  // Ensure default blank starter template project exists
  const existingTemplates = await db
    .select()
    .from(projects)
    .where(eq(projects.isTemplate, true));

  if (existingTemplates.length === 0) {
    await db.transaction(async (tx) => {
      const [createdProject] = await tx
        .insert(projects)
        .values({
          userId: null,
          isTemplate: true,
          title: 'My floorplan',
          mode: 'zigbee',
          environment: 'Home',
        })
        .returning();

      await tx.insert(floors).values({
        projectId: createdProject.id,
        name: 'Ground floor',
        floorOrder: 0,
        scalePxPerMeter: 2,
        ceilingMaterial: 'Concrete',
        canvasWidth: 580,
        canvasHeight: 640,
        backgroundImage: null,
        furnitureJson: [],
      });
    });
  }

  seedDone = true;
}

// Allow direct CLI execution via: tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts')) {
  ensureDatabaseSeeded()
    .then(() => {
      console.log('Zignals PostgreSQL database seeded successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to seed Zignals database:', err);
      process.exit(1);
    });
}
