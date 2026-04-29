import { Request, Response, NextFunction } from "express";
import session from "express-session";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    isAdmin?: boolean;
  }
}

const PUBLIC_API_ROUTES = [
  /^\/api\/auth\//,
  /^\/api\/share\//,
  /^\/api\/shared\//,
  /^\/api\/health$/,
  /^\/api\/version$/,
  /^\/api\/progress\//,
  /^\/api\/analyze\/status\//,
];

export function isPublicRoute(path: string): boolean {
  return PUBLIC_API_ROUTES.some((pattern) => pattern.test(path));
}

const AUTH_ENABLED = true;

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_ENABLED) {
    return next();
  }

  if (!req.path.startsWith("/api/")) {
    return next();
  }

  if (isPublicRoute(req.path)) {
    return next();
  }

  if (req.session?.authenticated) {
    return next();
  }

  return res.status(401).json({ message: "Authentication required" });
}

// Gate the destructive admin endpoints. Mounted at `/api/admin` from
// setupAuth so it runs after authMiddleware (which guarantees the session is
// authenticated) but before any admin route handler.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.authenticated) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!req.session?.isAdmin) {
    return res
      .status(403)
      .json({ message: "Admin access required for this operation." });
  }
  return next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

export function corsRestrictions(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (req.path.startsWith("/api/") && !isPublicRoute(req.path)) {
    if (origin) {
      const host = req.headers.host || "";
      const originUrl = (() => { try { return new URL(origin); } catch { return null; } })();
      const isAllowed = originUrl && (
        originUrl.hostname === host.split(":")[0] ||
        originUrl.hostname === "localhost" ||
        originUrl.hostname === "127.0.0.1" ||
        originUrl.hostname.endsWith(".replit.dev") ||
        originUrl.hostname.endsWith(".replit.app")
      );
      if (!isAllowed) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  next();
}

export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const shareRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export function setupAuth(app: import("express").Express) {
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(corsRestrictions);

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    })
  );

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    console.error("FATAL: APP_PASSWORD environment variable is not set. Login will be disabled until it is configured.");
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn(
      "ADMIN_PASSWORD is not set — destructive admin endpoints (e.g. /api/admin/backfill-reports) will be inaccessible until it is configured.",
    );
  }
  if (adminPassword && appPassword && adminPassword === appPassword) {
    console.warn(
      "ADMIN_PASSWORD matches APP_PASSWORD — admin elevation provides no extra protection. Set them to distinct values.",
    );
  }

  app.post("/api/auth/login", loginRateLimiter, (req: Request, res: Response) => {
    if (!appPassword) {
      return res.status(503).json({ message: "Authentication is not configured. Set APP_PASSWORD in environment." });
    }

    const { password } = req.body;

    if (password === appPassword) {
      req.session.authenticated = true;
      return req.session.save((err) => {
        if (err) {
          return res.status(500).json({ message: "Session error" });
        }
        return res.json({ success: true });
      });
    }

    return res.status(401).json({ message: "Invalid password" });
  });

  app.get("/api/auth/status", (req: Request, res: Response) => {
    res.json({
      authenticated: !!req.session?.authenticated,
      isAdmin: !!req.session?.isAdmin,
      adminAvailable: !!adminPassword,
    });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout error" });
      }
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });

  // Elevate an already-authenticated session to admin by supplying
  // ADMIN_PASSWORD. Reuses the login rate limiter so this can't be brute
  // forced from the same IP either.
  app.post("/api/auth/admin-login", loginRateLimiter, (req: Request, res: Response) => {
    if (!req.session?.authenticated) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!adminPassword) {
      return res.status(503).json({
        message: "Admin access is not configured. Set ADMIN_PASSWORD in environment.",
      });
    }

    const { password } = req.body ?? {};
    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (password !== adminPassword) {
      return res.status(401).json({ message: "Invalid admin password" });
    }

    req.session.isAdmin = true;
    return req.session.save((err) => {
      if (err) {
        return res.status(500).json({ message: "Session error" });
      }
      return res.json({ success: true });
    });
  });

  // Drop admin privileges without ending the underlying session — useful for
  // operators who want to step down to plain user mode after a destructive
  // action.
  app.post("/api/auth/admin-logout", (req: Request, res: Response) => {
    if (!req.session) {
      return res.json({ success: true });
    }
    req.session.isAdmin = false;
    return req.session.save((err) => {
      if (err) {
        return res.status(500).json({ message: "Session error" });
      }
      return res.json({ success: true });
    });
  });

  app.use("/api/share", shareRateLimiter);

  app.use(authMiddleware);
  // Layer the admin gate on top of the base auth check for every /api/admin/*
  // route. Mounted here (after authMiddleware) so it runs before any admin
  // handler registered later in registerRoutes().
  app.use("/api/admin", requireAdmin);
}
