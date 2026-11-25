import { defineConfig } from 'drizzle-kit';

const host = process.env.DB_HOST ?? '';
const port = Number(process.env.DB_PORT) || 5432;
const user = process.env.DB_USER ?? '';
const password = process.env.DB_PASSWORD ?? '';
const database = process.env.DB_NAME ?? 'postgres';
const sslEnabled =
  process.env.DB_SSL === 'true' || host.includes('supabase.com');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host,
        port,
        user,
        password,
        database,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      },
});
