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
// "settings" covers GET /api/admin/settings — the Admin page polls it on
// every load, so auditing each one would dwarf the actual settings
// changes. PUT /api/admin/settings still records via the explicit
// `recordAdminAudit` call in the route handler (which sets
// `adminAuditRecorded = true`, so the generic skip below doesn't apply).
//
// `audit-log/export` and `audit-log/export.xlsx` (task #59) are read-only
// CSV/Excel downloads of the audit log. A nervous operator who mashes
// "Download CSV" 50 times in a minute would otherwise write 50 export
// rows back into the same table, each carrying the full filter query
// string in `params`, diluting the signal in the activity panel and
// slowing the export query itself. Same rule of thumb as the read
// endpoints above: read-only admin GETs that are safe to call repeatedly
// belong in this skip set; any new mutating endpoint must NOT be added
// here and should record explicitly via `recordAdminAudit` instead.
const ADMIN_AUDIT_SKIP_ACTIONS = new Set([
  "audit-log",
  "audit-log/export",
  "audit-log/export.xlsx",
  "last-backfill",
  "last-audit-cleanup",
  "settings",
]);

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

// Public PAGE routes — direct browser navigation must work without a session.
const PUBLIC_PAGE_ROUTES = [
  /^\/login\/?$/,
  /^\/shared\/[^/]+\/?$/, // /shared/:shareId — public share landing page
];

// Static asset & framework paths the browser fetches alongside the SPA.
// These cannot be auth-gated or the login page itself can't load.
const STATIC_ASSET_EXT = /\.(?:js|mjs|cjs|css|map|json|txt|xml|webmanifest|ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|otf|eot|pdf|mp3|mp4|webm|wav|ogg)$/i;
const STATIC_ASSET_PREFIXES = [
  "/assets/",          // Vite production build output
  "/attached_assets/", // express.static mount in server/index.ts
  "/static/",
  "/favicon",
  "/robots.txt",
  "/manifest",
  // Vite dev-server internals
  "/@vite/",
  "/@id/",
  "/@fs/",
  "/@react-refresh",
  "/node_modules/",
  "/src/",
  "/__vite",
];

function isPublicPageOrAsset(path: string): boolean {
  if (PUBLIC_PAGE_ROUTES.some((re) => re.test(path))) return true;
  if (STATIC_ASSET_EXT.test(path)) return true;
  for (const p of STATIC_ASSET_PREFIXES) {
    if (path === p || path.startsWith(p)) return true;
  }
  return false;
}

const AUTH_ENABLED = true;

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_ENABLED) {
    return next();
  }

  // ----- API requests -----
  if (req.path.startsWith("/api/")) {
    if (isPublicRoute(req.path)) {
      return next();
    }
    if (req.session?.authenticated) {
      return next();
    }
    return res.status(401).json({ message: "Authentication required" });
  }

  // ----- Page requests -----
  // The previous implementation short-circuited every non-API path, so direct
  // navigation to /dashboard/:id, /reports/:id, /admin etc. served the SPA
  // without a session and relied entirely on the client-side ProtectedRoute
  // for redirection. That gives no defense against scripted clients that
  // bypass JS, and races the SPA bundle. Now we redirect server-side.
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next(); // mutating verbs on non-API paths shouldn't exist; let them 404 normally
  }
  if (isPublicPageOrAsset(req.path)) {
    return next();
  }
  if (req.session?.authenticated) {
    return next();
  }
  const target = req.originalUrl || req.path;
  const returnTo = encodeURIComponent(target);
  return res.redirect(302, `/login?returnTo=${returnTo}`);
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
  // securityHeaders is mounted globally in server/index.ts (before the
  // /attached_assets static handler) so every response is covered. We do
  // NOT re-mount it here to avoid running the same Set-Header pass twice.
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
    // In production, sharing the secret means /api/auth/admin-login will
    // accept APP_PASSWORD and elevate any logged-in user to admin —
    // turning the "admin" tier into security theater. Refuse to start so
    // the misconfiguration is caught at deploy time, not after a destructive
    // /api/admin/backfill-reports call from an ordinary session.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "FATAL: ADMIN_PASSWORD matches APP_PASSWORD in production — admin elevation provides no extra protection. Set them to distinct values and redeploy.",
      );
      process.exit(1);
    }
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

  // Share endpoints serve unauthenticated public report viewers; rate-limit
  // both naming variants so a future /api/shared/:id route is covered too.
  app.use("/api/share", shareRateLimiter);
  app.use("/api/shared", shareRateLimiter);

  app.use(authMiddleware);
  // Gate every /api/admin/* route, then install the finish-time audit hook
  // so every admin endpoint leaves at least a baseline row.
  app.use("/api/admin", requireAdmin);
  app.use("/api/admin", auditAdminRequest);
}
