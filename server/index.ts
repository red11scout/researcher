// NOTE: Do NOT disable proxy settings globally - it breaks database connections
// Instead, we bypass proxy per-request only for Anthropic API calls in ai-service.ts

import express, { type Request, Response, NextFunction } from "express";
import cookieParser from 'cookie-parser';
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import fs from "fs";

function validateEnvironment() {
  const hasAnthropicKey = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
  const hasDbUrl = !!process.env.DATABASE_URL;
  
  const missing: string[] = [];
  if (!hasAnthropicKey) missing.push('ANTHROPIC_API_KEY');
  if (!hasDbUrl) missing.push('DATABASE_URL');
  
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please configure these in your Replit secrets.');
    // Don't throw - just warn. The app should still start for configuration.
  } else {
    console.log('All required environment variables present');
  }
}

validateEnvironment();

const app = express();
const httpServer = createServer(app);

// Serve attached_assets folder for PDF downloads (before other routes)
const attachedAssetsPath = path.resolve(process.cwd(), "attached_assets");
if (fs.existsSync(attachedAssetsPath)) {
  app.use("/attached_assets", express.static(attachedAssetsPath));
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

setupAuth(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.timeout = 960000;
  httpServer.keepAliveTimeout = 720000;
  httpServer.headersTimeout = 725000;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
