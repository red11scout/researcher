import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

function getDatabaseUrl(): string | null {
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
  
  // Priority 3: Allow running without database in development mode
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_DB === 'true') {
    console.log("WARNING: Running without database (SKIP_DB=true). Some features will be unavailable.");
    return null;
  }
  
  throw new Error(
    "Database URL not configured. Set NEON_DB_URL or DATABASE_URL, or set SKIP_DB=true for development.",
  );
}

const databaseUrl = getDatabaseUrl();

// Create a mock db object when no database is available
export const db = databaseUrl 
  ? drizzle({
      connection: databaseUrl,
      schema,
      ws: ws,
    })
  : null as any; // In development without DB, some routes will fail but CalcGraph will work

export const isDatabaseAvailable = !!databaseUrl;
