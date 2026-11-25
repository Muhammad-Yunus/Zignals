import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import type { FurnitureItem } from '../types/zignals.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  planTier: varchar('plan_tier', { length: 32 }).notNull().default('pro'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const wallMaterials = pgTable('wall_materials', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 64 }).notNull(),
  attenuation24GhzDb: real('attenuation_24ghz_db').notNull(),
  attenuation5GhzDb: real('attenuation_5ghz_db').notNull(),
  attenuation6GhzDb: real('attenuation_6ghz_db').notNull(),
  thicknessPx: integer('thickness_px').notNull(),
  colorHex: varchar('color_hex', { length: 16 }).notNull(),
});

export const routerModels = pgTable('router_models', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  protocol: varchar('protocol', { length: 24 }).notNull(),
  txPowerDbm: integer('tx_power_dbm').notNull(),
  antennaGainDbi: real('antenna_gain_dbi').notNull().default(2.0),
  defaultBand: varchar('default_band', { length: 24 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().default('router'),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  isTemplate: boolean('is_template').notNull().default(false),
  title: varchar('title', { length: 160 }).notNull(),
  mode: varchar('mode', { length: 24 }).notNull().default('zigbee'),
  environment: varchar('environment', { length: 32 }).notNull().default('Home'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const floors = pgTable('floors', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  floorOrder: integer('floor_order').notNull().default(0),
  scalePxPerMeter: real('scale_px_per_meter').notNull().default(2),
  ceilingMaterial: varchar('ceiling_material', { length: 32 }).notNull().default('Concrete'),
  canvasWidth: integer('canvas_width').notNull().default(580),
  canvasHeight: integer('canvas_height').notNull().default(640),
  backgroundImage: text('background_image'),
  furnitureJson: jsonb('furniture_json').$type<FurnitureItem[]>().notNull().default([]),
});

export const walls = pgTable('walls', {
  id: serial('id').primaryKey(),
  floorId: integer('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),
  x1: real('x1').notNull(),
  y1: real('y1').notNull(),
  x2: real('x2').notNull(),
  y2: real('y2').notNull(),
  materialSlug: varchar('material_slug', { length: 32 }).notNull().default('concrete'),
  thickness: real('thickness').notNull().default(6),
  color: varchar('color', { length: 16 }),
});

export const routers = pgTable('routers', {
  id: serial('id').primaryKey(),
  floorId: integer('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  modelSlug: varchar('model_slug', { length: 64 }).notNull().default('custom'),
  txPowerDbm: real('tx_power_dbm').notNull().default(7),
  antennaGainDbi: real('antenna_gain_dbi').notNull().default(2),
  band: varchar('band', { length: 24 }).notNull().default('2.4 GHz'),
  channel: integer('channel').notNull().default(15),
  role: varchar('role', { length: 32 }).notNull().default('router'),
});

export const testClients = pgTable('test_clients', {
  id: serial('id').primaryKey(),
  floorId: integer('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 80 }).notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  deviceType: varchar('device_type', { length: 32 }).notNull().default('smartphone'),
});
