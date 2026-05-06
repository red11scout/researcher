import { describe, it, expect, beforeAll } from "vitest";
import express, { Request, Response } from "express";
import session from "express-session";
import request from "supertest";
import {
  authMiddleware,
  isPublicRoute,
} from "../server/auth";

function buildApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, sameSite: "lax" },
    }),
  );

  app.post("/api/auth/login", (req: Request, res: Response) => {
    req.session.authenticated = true;
    req.session.save(() => res.json({ success: true }));
  });

  app.use(authMiddleware);

  // Stub SPA + API handlers
  app.get("/api/secret", (_req, res) => res.json({ ok: true }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/share/:id", (_req, res) => res.json({ ok: true }));
  app.get("*", (_req, res) => res.status(200).type("html").send("<html>SPA</html>"));
  return app;
}

describe("authMiddleware — page gating", () => {
  let app: ReturnType<typeof buildApp>;
  beforeAll(() => {
    app = buildApp();
  });

  it("isPublicRoute matches existing API allowlist", () => {
    expect(isPublicRoute("/api/auth/login")).toBe(true);
    expect(isPublicRoute("/api/share/abc")).toBe(true);
    expect(isPublicRoute("/api/health")).toBe(true);
    expect(isPublicRoute("/api/admin/foo")).toBe(false);
  });

  it("redirects unauthenticated GET /dashboard/:id to /login with returnTo", async () => {
    const r = await request(app).get("/dashboard/abc-123?tab=cost");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe(
      `/login?returnTo=${encodeURIComponent("/dashboard/abc-123?tab=cost")}`,
    );
  });

  it("redirects unauthenticated GET /admin", async () => {
    const r = await request(app).get("/admin");
    expect(r.status).toBe(302);
    expect(r.headers.location).toContain("/login?returnTo=");
  });

  it("serves /login without auth", async () => {
    const r = await request(app).get("/login");
    expect(r.status).toBe(200);
  });

  it("serves /shared/:shareId without auth", async () => {
    const r = await request(app).get("/shared/share-xyz");
    expect(r.status).toBe(200);
  });

  it("serves static asset paths without auth (extension + Vite dev prefixes)", async () => {
    for (const p of [
      "/assets/main.js",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/static/logo.svg",
      "/@vite/client",
      "/@react-refresh",
      "/src/main.tsx",
      "/node_modules/.vite/deps/react.js",
      "/attached_assets/cover.png",
    ]) {
      const r = await request(app).get(p);
      expect(r.status, `expected 200 for ${p}, got ${r.status}`).toBe(200);
    }
  });

  it("returns 401 JSON (not redirect) for unauthenticated protected API call", async () => {
    const r = await request(app).get("/api/secret");
    expect(r.status).toBe(401);
    expect(r.body.message).toBe("Authentication required");
  });

  it("public API routes pass through without auth", async () => {
    const a = await request(app).get("/api/health");
    expect(a.status).toBe(200);
    const b = await request(app).get("/api/share/abc");
    expect(b.status).toBe(200);
  });

  it("authenticated session reaches protected pages and APIs", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({});

    const page = await agent.get("/dashboard/xyz");
    expect(page.status).toBe(200);

    const api = await agent.get("/api/secret");
    expect(api.status).toBe(200);
  });
});
