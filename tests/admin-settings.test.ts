// tests/admin-settings.test.ts
//
// Coverage for task #43 (Let admins set how long audit history is kept).
//
// Three layers are exercised:
//
//   1. `resolveRetentionDays` in `server/admin-audit-retention.ts`
//      precedence — persisted override wins over the env var, which
//      wins over the hard-coded default. A storage failure must fall
//      back without disabling retention.
//
//   2. `runAdminAuditRetentionOnce` re-resolves on every run, so an
//      admin who shortens the window from the UI sees the new value
//      take effect on the next sweep — without a server restart.
//
//   3. `GET /api/admin/settings` and `PUT /api/admin/settings` route
//      validation: invalid payloads (zero, negative, non-numeric,
//      too-large) are rejected with a clear 400 and never reach the
//      storage layer; valid payloads round-trip and `effective`
//      reflects the new override.
//
// The route layer is exercised against an in-memory storage fake so
// the tests don't depend on Postgres availability — same pattern used
// by tests/last-backfill-persistence.test.ts and
// tests/admin-audit-log.test.ts.

import express from "express";
import { createServer } from "http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// In-memory state for the fake storage. Lives at module scope so the
// `vi.mock("../server/storage")` factory below can read/write it from
// inside the route handlers without re-creating the storage on each test.
// ---------------------------------------------------------------------------
type StoredSettings = {
  auditRetentionDays: number | null;
  updatedAt: Date;
} | null;

const fakeStorageState: {
  settings: StoredSettings;
  pruneCalls: { cutoff: Date }[];
  recordCalls: {
    status: "success" | "failure";
    retentionDays: number;
    removedCount: number;
  }[];
  getSettingsThrows: Error | null;
} = {
  settings: null,
  pruneCalls: [],
  recordCalls: [],
  getSettingsThrows: null,
};

// ---------------------------------------------------------------------------
// Mock the heavy server-side modules `registerRoutes` pulls in at load
// time. None are exercised by the settings handler.
// ---------------------------------------------------------------------------
vi.mock("../server/ai-service", () => ({
  generateCompanyAnalysis: vi.fn(),
  generateWhatIfSuggestion: vi.fn(),
  checkProductionConfig: vi.fn(() => ({ ok: true, message: "ok" })),
  executePipelineCall: vi.fn(),
}));
vi.mock("../server/formula-service", () => ({
  validateFormula: vi.fn(),
  evaluateFormula: vi.fn(),
  previewFormula: vi.fn(),
  getInputsByCategory: vi.fn(() => ({})),
  AVAILABLE_INPUTS: {},
}));
vi.mock("../server/dub-service", () => ({ dubService: {} }));
vi.mock("../server/assumption-export", () => ({
  buildAssumptionExcelWorkbook: vi.fn(),
  buildAssumptionJSON: vi.fn(() => ({})),
}));
vi.mock("../server/auth", () => ({
  recordAdminAudit: vi.fn(),
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  setupAuth: () => {},
}));

// Storage fake — implements just the methods the settings + retention
// code paths touch. Returns sane defaults for everything else so the
// route module can be imported without crashing.
vi.mock("../server/storage", async () => {
  const actual =
    await vi.importActual<typeof import("../server/storage")>(
      "../server/storage",
    );
  return {
    ...actual,
    storage: {
      getAdminSettings: async () => {
        if (fakeStorageState.getSettingsThrows) {
          throw fakeStorageState.getSettingsThrows;
        }
        if (!fakeStorageState.settings) return null;
        return {
          id: "singleton",
          auditRetentionDays: fakeStorageState.settings.auditRetentionDays,
          updatedAt: fakeStorageState.settings.updatedAt,
        };
      },
      updateAdminSettings: async (next: { auditRetentionDays?: number | null }) => {
        const current = fakeStorageState.settings ?? {
          auditRetentionDays: null,
          updatedAt: new Date(),
        };
        const merged = {
          auditRetentionDays: Object.prototype.hasOwnProperty.call(
            next,
            "auditRetentionDays",
          )
            ? (next.auditRetentionDays ?? null)
            : current.auditRetentionDays,
          updatedAt: new Date(),
        };
        fakeStorageState.settings = merged;
        return {
          id: "singleton",
          auditRetentionDays: merged.auditRetentionDays,
          updatedAt: merged.updatedAt,
        };
      },
      pruneOldAdminAuditEntries: async (cutoff: Date) => {
        fakeStorageState.pruneCalls.push({ cutoff });
        return 0;
      },
      recordAdminAuditCleanup: async (record: {
        status: "success" | "failure";
        retentionDays: number;
        removedCount: number;
      }) => {
        fakeStorageState.recordCalls.push(record);
      },
      // Stubs for unrelated routes that load alongside.
      getRecentAdminAuditEntries: async () => ({ entries: [], total: 0 }),
      exportAdminAuditEntries: async () => ({
        entries: [],
        total: 0,
        truncated: false,
      }),
      createAdminAuditEntry: async () => undefined,
      getAllReports: async () => [],
      getLastBackfillSummary: async () => null,
      saveLastBackfillSummary: async () => {},
      getLastAdminAuditCleanup: async () => null,
    },
  };
});

// Imported AFTER mocks above so they take effect.
const { registerRoutes } = await import("../server/routes");
const { resolveRetentionDays, runAdminAuditRetentionOnce, DEFAULT_RETENTION_DAYS } =
  await import("../server/admin-audit-retention");

// ---------------------------------------------------------------------------
// Per-test reset. We also clear ADMIN_AUDIT_RETENTION_DAYS in case a
// prior test left it set, since the env var participates in the
// resolution chain.
// ---------------------------------------------------------------------------
const originalEnv = process.env.ADMIN_AUDIT_RETENTION_DAYS;
beforeEach(() => {
  fakeStorageState.settings = null;
  fakeStorageState.pruneCalls = [];
  fakeStorageState.recordCalls = [];
  fakeStorageState.getSettingsThrows = null;
  delete process.env.ADMIN_AUDIT_RETENTION_DAYS;
});
afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.ADMIN_AUDIT_RETENTION_DAYS;
  } else {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = originalEnv;
  }
});

// ===========================================================================
// 1. resolveRetentionDays precedence
// ===========================================================================
describe("resolveRetentionDays — precedence", () => {
  it("returns the persisted override when one is stored", async () => {
    fakeStorageState.settings = {
      auditRetentionDays: 30,
      updatedAt: new Date(),
    };
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "120"; // should be ignored
    expect(await resolveRetentionDays()).toBe(30);
  });

  it("falls back to ADMIN_AUDIT_RETENTION_DAYS when no override is stored", async () => {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "45";
    expect(await resolveRetentionDays()).toBe(45);
  });

  it("falls back to the default when no override is stored and the env var is unset", async () => {
    expect(await resolveRetentionDays()).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("ignores an invalid env var (zero) and falls back to the default", async () => {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "0";
    expect(await resolveRetentionDays()).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("ignores an invalid env var (negative) and falls back to the default", async () => {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "-7";
    expect(await resolveRetentionDays()).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("ignores an invalid env var (non-numeric) and falls back to the default", async () => {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "forever";
    expect(await resolveRetentionDays()).toBe(DEFAULT_RETENTION_DAYS);
  });

  it("treats a stored null as 'no override' and consults the env var", async () => {
    fakeStorageState.settings = {
      auditRetentionDays: null,
      updatedAt: new Date(),
    };
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "60";
    expect(await resolveRetentionDays()).toBe(60);
  });

  it("falls back without disabling retention when storage throws", async () => {
    fakeStorageState.getSettingsThrows = new Error("db unavailable");
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "21";
    expect(await resolveRetentionDays()).toBe(21);
  });

  it("falls back to the default when storage throws and no env override is set", async () => {
    fakeStorageState.getSettingsThrows = new Error("db unavailable");
    expect(await resolveRetentionDays()).toBe(DEFAULT_RETENTION_DAYS);
  });
});

// ===========================================================================
// 2. runAdminAuditRetentionOnce re-resolves per call
// ===========================================================================
describe("runAdminAuditRetentionOnce — per-run resolution", () => {
  it("uses the persisted override when computing the cutoff", async () => {
    fakeStorageState.settings = {
      auditRetentionDays: 10,
      updatedAt: new Date(),
    };
    const before = Date.now();
    await runAdminAuditRetentionOnce();
    expect(fakeStorageState.pruneCalls).toHaveLength(1);
    const cutoffMs = fakeStorageState.pruneCalls[0].cutoff.getTime();
    const expectedMs = before - 10 * 24 * 60 * 60 * 1000;
    // Allow a few ms slack for the time the call took.
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(1_000);
    expect(fakeStorageState.recordCalls[0].retentionDays).toBe(10);
  });

  it("picks up an updated override on the next run without restart", async () => {
    fakeStorageState.settings = {
      auditRetentionDays: 90,
      updatedAt: new Date(),
    };
    await runAdminAuditRetentionOnce();
    expect(fakeStorageState.recordCalls[0].retentionDays).toBe(90);

    // Simulate the admin shortening the window via the UI.
    fakeStorageState.settings = {
      auditRetentionDays: 7,
      updatedAt: new Date(),
    };
    await runAdminAuditRetentionOnce();
    expect(fakeStorageState.recordCalls[1].retentionDays).toBe(7);
  });

  it("honours an explicit retentionDays argument (test/ad-hoc path)", async () => {
    fakeStorageState.settings = {
      auditRetentionDays: 30,
      updatedAt: new Date(),
    };
    await runAdminAuditRetentionOnce(180);
    expect(fakeStorageState.recordCalls[0].retentionDays).toBe(180);
  });
});

// ===========================================================================
// 3. /api/admin/settings HTTP routes
// ===========================================================================
async function buildApp() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

describe("GET /api/admin/settings", () => {
  it("returns null override + the env-derived effective value when nothing is stored", async () => {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "45";
    const app = await buildApp();
    const res = await request(app).get("/api/admin/settings");
    expect(res.status).toBe(200);
    expect(res.body.settings.auditRetentionDays).toBeNull();
    expect(res.body.effective.auditRetentionDays).toBe(45);
  });

  it("returns the persisted override when one is stored", async () => {
    fakeStorageState.settings = {
      auditRetentionDays: 14,
      updatedAt: new Date("2026-04-30T12:00:00Z"),
    };
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "200";
    const app = await buildApp();
    const res = await request(app).get("/api/admin/settings");
    expect(res.status).toBe(200);
    expect(res.body.settings.auditRetentionDays).toBe(14);
    // `effective` reflects the override, not the env var.
    expect(res.body.effective.auditRetentionDays).toBe(14);
  });
});

describe("PUT /api/admin/settings — validation", () => {
  // Each of the invalid-payload cases must (a) return 400 with a
  // human-readable error, and (b) leave fakeStorageState.settings
  // untouched — invalid input must never reach the storage layer
  // (where it could disable retention).
  const cases: Array<{ name: string; body: unknown }> = [
    { name: "zero", body: { auditRetentionDays: 0 } },
    { name: "negative", body: { auditRetentionDays: -5 } },
    { name: "fractional", body: { auditRetentionDays: 1.5 } },
    { name: "string", body: { auditRetentionDays: "thirty" } },
    { name: "boolean", body: { auditRetentionDays: true } },
    { name: "too large (10001)", body: { auditRetentionDays: 10001 } },
    // (NaN can't be tested through HTTP — JSON serializes NaN to null,
    // which is the well-formed "clear override" payload.)
  ];

  for (const tc of cases) {
    it(`rejects ${tc.name} with 400 and does not persist`, async () => {
      const app = await buildApp();
      const res = await request(app)
        .put("/api/admin/settings")
        .send(tc.body)
        .set("Content-Type", "application/json");
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe("string");
      expect(res.body.error.length).toBeGreaterThan(0);
      expect(fakeStorageState.settings).toBeNull();
    });
  }

  it("accepts a positive integer and round-trips it through GET", async () => {
    const app = await buildApp();
    const put = await request(app)
      .put("/api/admin/settings")
      .send({ auditRetentionDays: 30 })
      .set("Content-Type", "application/json");
    expect(put.status).toBe(200);
    expect(put.body.settings.auditRetentionDays).toBe(30);
    expect(put.body.effective.auditRetentionDays).toBe(30);

    const get = await request(app).get("/api/admin/settings");
    expect(get.body.settings.auditRetentionDays).toBe(30);
    expect(get.body.effective.auditRetentionDays).toBe(30);
  });

  it("accepts null to clear the override and falls back to the env var", async () => {
    process.env.ADMIN_AUDIT_RETENTION_DAYS = "60";
    fakeStorageState.settings = {
      auditRetentionDays: 14,
      updatedAt: new Date(),
    };
    const app = await buildApp();
    const put = await request(app)
      .put("/api/admin/settings")
      .send({ auditRetentionDays: null })
      .set("Content-Type", "application/json");
    expect(put.status).toBe(200);
    expect(put.body.settings.auditRetentionDays).toBeNull();
    // With the override cleared, `effective` follows the env var.
    expect(put.body.effective.auditRetentionDays).toBe(60);
  });

  it("accepts the upper bound (3650 days)", async () => {
    const app = await buildApp();
    const res = await request(app)
      .put("/api/admin/settings")
      .send({ auditRetentionDays: 3650 })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body.settings.auditRetentionDays).toBe(3650);
  });

  it("rejects 3651 (one past the upper bound)", async () => {
    const app = await buildApp();
    const res = await request(app)
      .put("/api/admin/settings")
      .send({ auditRetentionDays: 3651 })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(fakeStorageState.settings).toBeNull();
  });
});
