import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    console.log("Using Replit DATABASE_URL");
    return process.env.DATABASE_URL;
  }

  if (process.env.EXTERNAL_DATABASE_URL) {
    const url = process.env.EXTERNAL_DATABASE_URL.trim();
    if (url.startsWith("postgresql://") || url.startsWith("postgres://")) {
      console.log("Using EXTERNAL_DATABASE_URL (external Neon database)");
      return url;
    }
  }

  throw new Error(
    "Database URL not configured. Set DATABASE_URL or EXTERNAL_DATABASE_URL.",
  );
}

const databaseUrl = getDatabaseUrl();

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool, { schema });
