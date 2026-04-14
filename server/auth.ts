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
      const isAllowed = origin.includes(host) || origin.includes("localhost") || origin.includes("replit");
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
