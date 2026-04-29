import { Request, Response, NextFunction } from "express";
import session from "express-session";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

function actorContext(req: Request) {
  const ua = req.headers["user-agent"];
  return {
    actorIp: req.ip ?? null,
    actorUserAgent: typeof ua === "string" ? ua.slice(0, 500) : null,
    path: req.originalUrl || req.path || null,
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminAuditRecorded?: boolean;
    }
  }
}

export function recordAdminAudit(
  req: Request,
  entry: {
    action: string;
    status: "success" | "failure";
    statusCode: number;
    params?: JsonValue;
    outcome?: JsonValue;
    errorMessage?: string;
  },
): void {
  req.adminAuditRecorded = true;
  void storage.createAdminAuditEntry({
    action: entry.action,
    status: entry.status,
    statusCode: entry.statusCode,
    params: entry.params ?? null,
    outcome: entry.outcome ?? null,
    errorMessage: entry.errorMessage ?? null,
    ...actorContext(req),
  });
}

// Action label is derived from the FULL URL (req.baseUrl + req.path)
// because mounted routers strip the mount prefix from req.path. For an
// /api/admin-mounted middleware, req.path is "/backfill-reports" while
// req.baseUrl is "/api/admin" — we need both to recover the action name.
const ADMIN_PREFIX = "/api/admin/";
function deriveAdminAction(req: Request): string {
  const full = `${req.baseUrl ?? ""}${req.path ?? ""}`.split("?")[0];
  if (full.startsWith(ADMIN_PREFIX)) {
    return full.slice(ADMIN_PREFIX.length) || "admin-root";
  }
  const original = (req.originalUrl ?? "").split("?")[0];
  if (original.startsWith(ADMIN_PREFIX)) {
    return original.slice(ADMIN_PREFIX.length) || "admin-root";
  }
  return "admin-unknown";
}

// Read-only admin endpoints we suppress from the generic audit hook so
// the activity panel doesn't fill with self-noise from its own polling.
// `last-backfill` is the singleton snapshot the Admin page hydrates from
// on every load — auditing each one would dwarf the actual upgrade
// actions operators care about, same reason `audit-log` is skipped.
const ADMIN_AUDIT_SKIP_ACTIONS = new Set(["audit-log", "last-backfill"]);

export function auditAdminRequest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.on("finish", () => {
    if (req.adminAuditRecorded) return;
    const action = deriveAdminAction(req);
    if (ADMIN_AUDIT_SKIP_ACTIONS.has(action)) return;
    const statusCode = res.statusCode;
    const status: "success" | "failure" =
      statusCode < 400 ? "success" : "failure";
    const queryKeys = Object.keys(req.query ?? {});
    const params: JsonValue =
      queryKeys.length === 0 ? null : (req.query as JsonValue);
    void storage.createAdminAuditEntry({
      action,
      status,
      statusCode,
      params,
      outcome: null,
      errorMessage: null,
      ...actorContext(req),
    });
  });
  next();
}

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
    // Log unauthenticated hits on /api/admin/* — typically caught earlier by
    // authMiddleware, but worth recording the rare case it slips through so
    // a brute-forcer probing admin paths leaves a trail.
    recordAdminAudit(req, {
      action: "admin-access-denied",
      status: "failure",
      statusCode: 401,
      errorMessage: "Authentication required",
    });
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!req.session?.isAdmin) {
    // Logged-in but not elevated — record so we can spot regular users
    // trying to hit admin endpoints.
    recordAdminAudit(req, {
      action: "admin-access-denied",
      status: "failure",
      statusCode: 403,
      errorMessage: "Admin access required for this operation.",
    });
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

  // Elevate an authenticated session to admin via ADMIN_PASSWORD.
  app.post("/api/auth/admin-login", loginRateLimiter, (req: Request, res: Response) => {
    if (!req.session?.authenticated) {
      recordAdminAudit(req, {
        action: "admin-login-failed",
        status: "failure",
        statusCode: 401,
        errorMessage: "Not authenticated",
      });
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!adminPassword) {
      recordAdminAudit(req, {
        action: "admin-login-failed",
        status: "failure",
        statusCode: 503,
        errorMessage: "ADMIN_PASSWORD not configured",
      });
      return res.status(503).json({
        message: "Admin access is not configured. Set ADMIN_PASSWORD in environment.",
      });
    }

    const { password } = req.body ?? {};
    if (typeof password !== "string" || password.length === 0) {
      recordAdminAudit(req, {
        action: "admin-login-failed",
        status: "failure",
        statusCode: 400,
        errorMessage: "Password missing",
      });
      return res.status(400).json({ message: "Password is required" });
    }

    if (password !== adminPassword) {
      recordAdminAudit(req, {
        action: "admin-login-failed",
        status: "failure",
        statusCode: 401,
        errorMessage: "Invalid admin password",
      });
      return res.status(401).json({ message: "Invalid admin password" });
    }

    req.session.isAdmin = true;
    return req.session.save((err) => {
      if (err) {
        recordAdminAudit(req, {
          action: "admin-login",
          status: "failure",
          statusCode: 500,
          errorMessage: "Session save error",
        });
        return res.status(500).json({ message: "Session error" });
      }
      recordAdminAudit(req, {
        action: "admin-login",
        status: "success",
        statusCode: 200,
      });
      return res.json({ success: true });
    });
  });

  // Drop admin privileges without ending the underlying session.
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
  // Gate every /api/admin/* route, then install the finish-time audit hook
  // so every admin endpoint leaves at least a baseline row.
  app.use("/api/admin", requireAdmin);
  app.use("/api/admin", auditAdminRequest);
}
