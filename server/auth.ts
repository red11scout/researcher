import { Request, Response, NextFunction } from "express";
import session from "express-session";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
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

const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json|webp|avif)$/i;

const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/shared",
  "/api/",
  "/@",
  "/node_modules",
  "/__",
  "/src/",
  "/assets/",
  "/attached_assets/",
  "/public/",
  "/static/",
  "/favicon",
  "/robots.txt",
  "/manifest",
];

export function isPublicRoute(path: string): boolean {
  return PUBLIC_API_ROUTES.some((pattern) => pattern.test(path));
}

function isPublicPagePath(path: string): boolean {
  if (STATIC_EXTENSIONS.test(path)) return true;
  return PUBLIC_PAGE_PREFIXES.some((prefix) => path.startsWith(prefix));
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

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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

  if (!process.env.APP_PASSWORD) {
    console.warn("WARNING: APP_PASSWORD environment variable is not set. Using default password. Set APP_PASSWORD in secrets for production.");
  }

  app.post("/api/auth/login", loginRateLimiter, (req: Request, res: Response) => {
    const { password } = req.body;
    const appPassword = process.env.APP_PASSWORD || "BlueAlly45";

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
    res.json({ authenticated: !!req.session?.authenticated });
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

  app.use("/api/share", shareRateLimiter);

  app.use(authMiddleware);
}
