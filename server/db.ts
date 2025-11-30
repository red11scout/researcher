import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import * as fs from "fs";

function getDatabaseUrl(): string {
  // In production deployments, Replit stores the database URL in a file
  const replitDbPath = "/tmp/replitdb";
  
  // First, try to read from the file (production deployment)
  try {
    if (fs.existsSync(replitDbPath)) {
      const dbUrl = fs.readFileSync(replitDbPath, "utf-8").trim();
      if (dbUrl && dbUrl.startsWith("postgresql://")) {
        console.log("Using DATABASE_URL from /tmp/replitdb file");
        return dbUrl;
      }
    }
  } catch (error) {
    console.log("Could not read /tmp/replitdb, falling back to env var");
  }
  
  // Fall back to environment variable (development)
  if (process.env.DATABASE_URL) {
    console.log("Using DATABASE_URL from environment variable");
    return process.env.DATABASE_URL;
  }
  
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = getDatabaseUrl();

export const db = drizzle({
  connection: databaseUrl,
  schema,
  ws: ws,
});
