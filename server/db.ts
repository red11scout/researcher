import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

function getDatabaseUrl(): string {
  // Priority 1: Use NEON_DB_URL if available (external Neon database - works in both dev and production)
  if (process.env.NEON_DB_URL) {
    const url = process.env.NEON_DB_URL.trim();
    if (url.startsWith("postgresql://") || url.startsWith("postgres://")) {
      console.log("Using NEON_DB_URL (external Neon database)");
      console.log("Database host:", url.split("@")[1]?.split("/")[0] || "unknown");
      return url;
    }
  }
  
  // Priority 2: Fall back to DATABASE_URL (Replit's internal database - dev only)
  if (process.env.DATABASE_URL) {
    console.log("Using DATABASE_URL from environment variable");
    return process.env.DATABASE_URL;
  }
  
  throw new Error(
    "Database URL not configured. Set NEON_DB_URL or DATABASE_URL.",
  );
}

const databaseUrl = getDatabaseUrl();

export const db = drizzle({
  connection: databaseUrl,
  schema,
  ws: ws,
});
