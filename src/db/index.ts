import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

function hasDiscreteDbConfig(): boolean {
  return Boolean(
    process.env.DB_HOST?.trim() &&
      process.env.DB_USER?.trim() &&
      process.env.DB_PASSWORD !== undefined &&
      process.env.DB_PASSWORD.length > 0 &&
      process.env.DB_NAME?.trim()
  );
}

export function isDatabaseConfigured(): boolean {
  return hasDiscreteDbConfig() || Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      'Database configuration missing: set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD.'
    );
  }

  if (!dbInstance) {
    if (hasDiscreteDbConfig()) {
      const host = process.env.DB_HOST!.trim();
      const port = Number(process.env.DB_PORT) || 5432;
      const database = process.env.DB_NAME!.trim();
      const username = process.env.DB_USER!.trim();
      const password = process.env.DB_PASSWORD!;
      const sslEnabled =
        process.env.DB_SSL === 'true' ||
        host.includes('supabase.com') ||
        process.env.NODE_ENV === 'production';

      client = postgres({
        host,
        port,
        database,
        username,
        password,
        prepare: false,
        max: 10,
        idle_timeout: 20,
        connect_timeout: 15,
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      const connectionString = process.env.DATABASE_URL!;
      const useSsl =
        connectionString.includes('supabase.com') ||
        connectionString.includes('sslmode=require') ||
        process.env.NODE_ENV === 'production';

      client = postgres(connectionString, {
        prepare: false,
        max: 10,
        idle_timeout: 20,
        connect_timeout: 15,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      });
    }

    dbInstance = drizzle(client, { schema });
  }

  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    dbInstance = null;
  }
}
