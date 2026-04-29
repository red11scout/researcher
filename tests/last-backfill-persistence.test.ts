// tests/last-backfill-persistence.test.ts
//
// Coverage for the persisted "last admin backfill run" hydration path that
// lets the Admin page rebuild the post-run summary, failures table, and
// "Retry these" button after a refresh. Three layers are exercised:
//
//   1. Storage round-trip — `DatabaseStorage.saveLastBackfillSummary` /
//      `getLastBackfillSummary` against an in-memory `@db` shim, including
//      that a second save upserts and replaces the previous singleton row.
//   2. HTTP route — `POST /api/admin/backfill-reports` (both the streaming
//      and non-streaming branches) followed by `GET /api/admin/last-backfill`
//      returning the just-completed summary with `completedAt` set. Routes
//      are mounted via the real `registerRoutes` from `server/routes.ts`
//      so a regression in the actual handler (e.g. forgetting to persist
//      in the streaming branch) fails this suite.
//   3. Baseline — `GET /api/admin/last-backfill` returns `{ summary: null }`
//      when no run has ever completed against the DB.

import express from "express";
import { createServer } from "http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BackfillReportResult,
  BackfillSummary,
  PersistedBackfillSummary,
} from "../server/report-backfill";

// ---------------------------------------------------------------------------
// In-memory `@db` shim used by the storage round-trip tests below.
//
// `vi.mock` is hoisted, so this mock is wired BEFORE `server/storage`
// resolves its `import { db } from "@db"` and therefore avoids pulling the
// real `server/db.ts` (which would throw without DATABASE_URL or hit a
// real Postgres). We simulate just enough of drizzle's chained query
// builder to service `saveLastBackfillSummary` and `getLastBackfillSummary`:
//
//   db.insert(table).values(v).onConflictDoUpdate({ set })
//   db.select().from(table).where(cond).limit(n)
//
// Other call shapes are not exercised by the methods under test so we do
// not implement them here.
// ---------------------------------------------------------------------------
type SingletonRow = {
  id: string;
  summary: unknown;
  updatedReports: unknown;
  completedAt: Date;
};

const dbState: { row: SingletonRow | null } = { row: null };

vi.mock("@db", () => {
  const insert = (_table: unknown) => ({
    values: (val: { id: string; summary: unknown; updatedReports: unknown }) => ({
      onConflictDoUpdate: async ({
        set,
      }: {
        set: { summary: unknown; updatedReports: unknown; completedAt?: Date };
      }) => {
        if (dbState.row) {
          // Upsert path: replace the existing singleton with the new shape.
          // Mirrors `onConflictDoUpdate(target=id, set=...)` in storage.ts
          // where `completedAt` is bumped on every overwrite.
          dbState.row = {
            id: dbState.row.id,
            summary: set.summary,
            updatedReports: set.updatedReports,
            completedAt: set.completedAt ?? new Date(),
          };
        } else {
          // First-write path: take the inserted values straight through and
          // stamp `completedAt` to "now" the same way the schema's
          // `defaultNow()` would.
          dbState.row = {
            id: val.id,
            summary: val.summary,
            updatedReports: val.updatedReports,
            completedAt: new Date(),
          };
        }
      },
    }),
  });
  const select = () => ({
    from: (_table: unknown) => ({
      where: (_cond: unknown) => ({
        limit: async (_n: number) => (dbState.row ? [dbState.row] : []),
      }),
    }),
  });
  return { db: { insert, select } };
});

// ---------------------------------------------------------------------------
// Heavy server-side dependencies that `server/routes.ts` pulls in at
// module load. We stub them out so the route module can be imported
// without standing up Anthropic, ExcelJS, Dub, multer's PDF parser, or
// the formula engine. These services are not invoked by the two
// /api/admin/last-backfill / /api/admin/backfill-reports handlers under
// test, so empty stubs are sufficient.
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
// `recordAdminAudit` writes to the audit log via `storage.createAdminAuditEntry`
// — which our fake storage does not implement. Stub it to a no-op so the
// admin route's audit-side-effect doesn't blow up the test.
vi.mock("../server/auth", () => ({
  recordAdminAudit: vi.fn(),
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  setupAuth: () => {},
}));

// ---------------------------------------------------------------------------
// Fake storage + fake backfill engine. These let us drive the real
// `registerRoutes` handlers with controlled inputs while still observing
// the persistence side-effect on the storage layer.
//
// `vi.mock("../server/storage")` swaps the `storage` singleton that BOTH
// `server/routes.ts` and `server/report-backfill.ts` import. We only
// implement the subset of `IStorage` the routes under test actually call.
// ---------------------------------------------------------------------------
type FakeStorageState = {
  row: {
    summary: PersistedBackfillSummary;
    updatedReports: BackfillReportResult[];
    completedAt: Date;
  } | null;
};
const fakeStorageState: FakeStorageState = { row: null };

// Partial mock: keep the real `DatabaseStorage` class export (so the
// storage round-trip tests below can exercise it directly against the
// mocked `@db`) but swap the `storage` singleton — the one the route
// handlers and the audit helper import — for an in-memory fake whose
// state we can observe and reset between tests.
vi.mock("../server/storage", async () => {
  const actual =
    await vi.importActual<typeof import("../server/storage")>(
      "../server/storage",
    );
  return {
    ...actual,
    storage: {
      saveLastBackfillSummary: async (
        summary: PersistedBackfillSummary,
        updatedReports: BackfillReportResult[],
      ) => {
        fakeStorageState.row = {
          summary,
          updatedReports,
          completedAt: new Date(),
        };
      },
      getLastBackfillSummary: async () => fakeStorageState.row,
      // Touched by `recordAdminAudit` (which we mock to a no-op anyway)
      // and by report-backfill — supply harmless no-op shapes so the
      // route handlers don't trip over an undefined method.
      createAdminAuditEntry: async () => undefined,
      getAllReports: async () => [],
      updateReport: async () => undefined,
    },
  };
});

// `report-backfill.parseOnlyIdsFromBody` is required by the real route
// handler for body validation. We keep the real implementation but swap
// `backfillAllReports` for a programmable fake so the test owns what each
// run produces.
let nextBackfillSummary: BackfillSummary = {
  total: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  durationMs: 0,
  results: [],
};
const backfillCalls: { force: boolean; onlyIds?: string[] }[] = [];
vi.mock("../server/report-backfill", async () => {
  const actual = await vi.importActual<
    typeof import("../server/report-backfill")
  >("../server/report-backfill");
  return {
    ...actual,
    backfillAllReports: async (opts: {
      force?: boolean;
      onlyIds?: string[];
      onStart?: (n: number) => void;
      onProgress?: (
        i: number,
        n: number,
        r: BackfillReportResult,
      ) => void;
    } = {}) => {
      backfillCalls.push({ force: !!opts.force, onlyIds: opts.onlyIds });
      const summary = nextBackfillSummary;
      // Mirror the streaming consumer contract so the real route's
      // streaming branch sees the same lifecycle a real run would emit.
      opts.onStart?.(summary.total);
      summary.results.forEach((r, i) =>
        opts.onProgress?.(i + 1, summary.total, r),
      );
      return summary;
    },
  };
});

// Imported AFTER the mocks above so they take effect.
const { DatabaseStorage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");

// ---------------------------------------------------------------------------
// Fixture: a representative `PersistedBackfillSummary` + `updatedReports`
// list shaped exactly like the `complete` event the streaming route emits.
// Includes both failures (so the rehydrated "Retry these" button has IDs to
// chew on) and updated rows (so the UpgradesAppliedPanel has data to group).
// ---------------------------------------------------------------------------
function makeSummaryFixture(): {
  summary: PersistedBackfillSummary;
  updatedReports: BackfillReportResult[];
} {
  const updatedReports: BackfillReportResult[] = [
    {
      id: "report-updated-1",
      companyName: "Acme Co",
      isWhatIf: false,
      status: "updated",
      durationMs: 42,
      upgrades: [
        { code: "bumped-schema", label: "Bumped schema 2.0 → 2.2" },
        { code: "added-flat-fields", label: "Added flat diagnostic fields" },
      ],
      metricDeltas: [
        {
          code: "total-annual-value",
          label: "Total value $1.0M → $1.2M (+$200K)",
          unit: "money",
          before: 1_000_000,
          after: 1_200_000,
          delta: 200_000,
        },
      ],
    },
  ];
  const failures: BackfillReportResult[] = [
    {
      id: "report-failed-1",
      companyName: "Broken Inc",
      isWhatIf: false,
      status: "failed",
      error: "post-processor threw on UC-9",
      durationMs: 17,
    },
  ];
  const summary: PersistedBackfillSummary = {
    success: true,
    force: false,
    total: 2,
    updated: 1,
    skipped: 0,
    failed: 1,
    durationMs: 1234,
    failures,
  };
  return { summary, updatedReports };
}

// ---------------------------------------------------------------------------
// 1. Storage round-trip — DatabaseStorage.saveLastBackfillSummary +
//    DatabaseStorage.getLastBackfillSummary
// ---------------------------------------------------------------------------
describe("DatabaseStorage last-backfill singleton round-trip", () => {
  beforeEach(() => {
    dbState.row = null;
  });

  it("returns null when no run has ever been persisted", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getLastBackfillSummary();
    expect(out).toBeNull();
  });

  it("round-trips a representative summary + failures + updatedReports", async () => {
    const storage = new DatabaseStorage();
    const { summary, updatedReports } = makeSummaryFixture();

    await storage.saveLastBackfillSummary(summary, updatedReports);

    const out = await storage.getLastBackfillSummary();
    expect(out).not.toBeNull();
    // Use deep equality on the JSONB-shaped fields so a regression that
    // drops e.g. `upgrades` or `metricDeltas` from the persisted shape is
    // caught here even before the route layer notices.
    expect(out!.summary).toEqual(summary);
    expect(out!.updatedReports).toEqual(updatedReports);
    expect(out!.completedAt).toBeInstanceOf(Date);

    // The failures array survives the round-trip — this is the data the
    // Admin page's "Retry these" button reads to rebuild its ID list.
    expect(out!.summary.failures).toHaveLength(1);
    expect(out!.summary.failures[0].id).toBe("report-failed-1");
    expect(out!.summary.failures[0].status).toBe("failed");
    expect(out!.summary.failures[0].error).toBe(
      "post-processor threw on UC-9",
    );

    // The updatedReports array survives too, including the per-row
    // `upgrades` and `metricDeltas` the UpgradesAppliedPanel groups by.
    expect(out!.updatedReports[0].upgrades?.[0].code).toBe("bumped-schema");
    expect(out!.updatedReports[0].metricDeltas?.[0].code).toBe(
      "total-annual-value",
    );
  });

  it("upserts: a second save replaces the previous singleton row", async () => {
    const storage = new DatabaseStorage();
    const { summary: first, updatedReports: firstUpdated } =
      makeSummaryFixture();

    await storage.saveLastBackfillSummary(first, firstUpdated);
    const before = await storage.getLastBackfillSummary();
    expect(before!.summary.updated).toBe(1);
    expect(before!.summary.failed).toBe(1);

    // Build a clearly distinct second snapshot — different counts, no
    // failures, a different updated report ID — so the assertions below
    // can't accidentally match the first row.
    const second: PersistedBackfillSummary = {
      success: true,
      force: true,
      total: 5,
      updated: 5,
      skipped: 0,
      failed: 0,
      durationMs: 9_876,
      failures: [],
    };
    const secondUpdated: BackfillReportResult[] = [
      {
        id: "report-updated-2",
        companyName: "Second Co",
        isWhatIf: false,
        status: "updated",
        durationMs: 11,
        upgrades: [{ code: "added-step6", label: "Generated Step 6" }],
        metricDeltas: [],
      },
    ];

    await storage.saveLastBackfillSummary(second, secondUpdated);

    const after = await storage.getLastBackfillSummary();
    expect(after).not.toBeNull();
    // The previous row's stats are gone — this is a singleton, not a log.
    expect(after!.summary.failed).toBe(0);
    expect(after!.summary.updated).toBe(5);
    expect(after!.summary.force).toBe(true);
    expect(after!.summary.failures).toEqual([]);
    expect(after!.updatedReports).toHaveLength(1);
    expect(after!.updatedReports[0].id).toBe("report-updated-2");
    expect(after!.updatedReports[0].id).not.toBe("report-updated-1");
  });
});

// ---------------------------------------------------------------------------
// 2. HTTP route — POST /api/admin/backfill-reports → GET /api/admin/last-backfill
//
// We mount the actual `registerRoutes` from `server/routes.ts` so the real
// handlers are exercised end-to-end. This catches regressions that a
// mirrored handler would miss (e.g. swapping streaming/non-streaming
// persistence, changing the GET response shape, dropping `completedAt`,
// or wiring `force` into the audit row but not the persisted summary).
// ---------------------------------------------------------------------------
async function buildRealApp(): Promise<express.Express> {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

function makeBackfillSummaryWithFailureAndUpdate(): BackfillSummary {
  const results: BackfillReportResult[] = [
    {
      id: "report-updated-A",
      companyName: "Updated Co",
      isWhatIf: false,
      status: "updated",
      durationMs: 5,
      upgrades: [{ code: "bumped-schema", label: "Bumped schema 2.0 → 2.2" }],
      metricDeltas: [],
    },
    {
      id: "report-failed-B",
      companyName: "Failed Co",
      isWhatIf: false,
      status: "failed",
      error: "boom",
      durationMs: 3,
    },
    {
      id: "report-skipped-C",
      companyName: "Skipped Co",
      isWhatIf: false,
      status: "skipped",
      reasons: ["already-v2.1"],
      durationMs: 1,
    },
  ];
  return {
    total: 3,
    updated: 1,
    skipped: 1,
    failed: 1,
    durationMs: 250,
    results,
  };
}

describe("GET /api/admin/last-backfill — baseline (no run yet)", () => {
  beforeEach(() => {
    fakeStorageState.row = null;
    backfillCalls.length = 0;
  });

  it("returns { summary: null } when nothing has been persisted", async () => {
    const app = await buildRealApp();
    const res = await request(app).get("/api/admin/last-backfill");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: null });
    // No backfill should have been triggered as a side-effect of GET.
    expect(backfillCalls).toEqual([]);
  });
});

describe("POST /api/admin/backfill-reports → GET /api/admin/last-backfill (non-streaming)", () => {
  beforeEach(() => {
    fakeStorageState.row = null;
    backfillCalls.length = 0;
    nextBackfillSummary = makeBackfillSummaryWithFailureAndUpdate();
  });

  it("persists the completed run and serves it back via GET", async () => {
    const app = await buildRealApp();

    const post = await request(app)
      .post("/api/admin/backfill-reports")
      .send({});
    expect(post.status).toBe(200);
    expect(post.body.success).toBe(true);
    expect(post.body.total).toBe(3);

    // The singleton was written by the real route handler.
    expect(fakeStorageState.row).not.toBeNull();
    expect(fakeStorageState.row!.summary.failed).toBe(1);
    expect(fakeStorageState.row!.updatedReports).toHaveLength(1);

    // GET surfaces the same shape, with completedAt populated.
    const get = await request(app).get("/api/admin/last-backfill");
    expect(get.status).toBe(200);
    expect(get.body.summary).toBeDefined();
    expect(get.body.summary.success).toBe(true);
    expect(get.body.summary.total).toBe(3);
    expect(get.body.summary.updated).toBe(1);
    expect(get.body.summary.failed).toBe(1);
    expect(get.body.summary.skipped).toBe(1);
    // Failures are surfaced with the same id/error pair the streaming
    // `complete` event uses, so the UI's "Retry these" button can rebuild
    // its ID list straight off the persisted record.
    expect(get.body.summary.failures).toHaveLength(1);
    expect(get.body.summary.failures[0].id).toBe("report-failed-B");
    expect(get.body.summary.failures[0].error).toBe("boom");
    // Updated reports survive too, with their `upgrades` chips intact.
    expect(get.body.updatedReports).toHaveLength(1);
    expect(get.body.updatedReports[0].id).toBe("report-updated-A");
    expect(get.body.updatedReports[0].upgrades[0].code).toBe("bumped-schema");
    // completedAt is wire-encoded as an ISO date string by Express's JSON
    // serializer; just assert it parses back to a real Date.
    expect(typeof get.body.completedAt).toBe("string");
    expect(Number.isNaN(Date.parse(get.body.completedAt))).toBe(false);
  });

  it("forwards force=1 into the persisted summary", async () => {
    const app = await buildRealApp();

    const res = await request(app)
      .post("/api/admin/backfill-reports?force=1")
      .send({});
    expect(res.status).toBe(200);
    // The mock backfill saw the force flag from the route's query parser.
    expect(backfillCalls.at(-1)?.force).toBe(true);

    const get = await request(app).get("/api/admin/last-backfill");
    expect(get.body.summary.force).toBe(true);
  });
});

describe("POST /api/admin/backfill-reports → GET /api/admin/last-backfill (streaming)", () => {
  beforeEach(() => {
    fakeStorageState.row = null;
    backfillCalls.length = 0;
    nextBackfillSummary = makeBackfillSummaryWithFailureAndUpdate();
  });

  it("persists the completed run after the stream finishes", async () => {
    const app = await buildRealApp();

    const post = await request(app)
      .post("/api/admin/backfill-reports?stream=1")
      .send({});
    expect(post.status).toBe(200);
    expect(post.headers["content-type"]).toMatch(/x-ndjson/);
    // ndjson body: parse the last non-empty line as the `complete` event.
    const lines = post.text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.type).toBe("complete");
    expect(last.success).toBe(true);
    expect(last.failed).toBe(1);

    // The streaming branch must persist the same snapshot the non-streaming
    // branch does — otherwise refreshing /admin after a streamed run would
    // hydrate stale (or empty) state.
    expect(fakeStorageState.row).not.toBeNull();
    expect(fakeStorageState.row!.updatedReports).toHaveLength(1);
    expect(fakeStorageState.row!.summary.failures[0].id).toBe(
      "report-failed-B",
    );

    const get = await request(app).get("/api/admin/last-backfill");
    expect(get.status).toBe(200);
    expect(get.body.summary.total).toBe(3);
    expect(get.body.summary.failures[0].id).toBe("report-failed-B");
    expect(get.body.updatedReports[0].id).toBe("report-updated-A");
    // `completedAt` must round-trip through the streaming branch too — the
    // Admin page's "ran X minutes ago" chip reads it directly off this
    // response regardless of which branch wrote the singleton row.
    expect(typeof get.body.completedAt).toBe("string");
    expect(Number.isNaN(Date.parse(get.body.completedAt))).toBe(false);
  });

  it("a second streamed run replaces the first persisted summary", async () => {
    // Two back-to-back runs against the same storage must leave only the
    // second one's summary visible to GET /api/admin/last-backfill — the
    // route handler relies on storage's upsert semantics for this.
    const app = await buildRealApp();

    nextBackfillSummary = {
      total: 1,
      updated: 0,
      skipped: 0,
      failed: 1,
      durationMs: 100,
      results: [
        {
          id: "report-failed-OLD",
          companyName: "Old Co",
          isWhatIf: false,
          status: "failed",
          error: "old failure",
          durationMs: 10,
        },
      ],
    };
    await request(app).post("/api/admin/backfill-reports?stream=1").send({});

    nextBackfillSummary = {
      total: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
      durationMs: 200,
      results: [
        {
          id: "report-updated-NEW",
          companyName: "New Co",
          isWhatIf: false,
          status: "updated",
          durationMs: 20,
          upgrades: [],
          metricDeltas: [],
        },
      ],
    };
    await request(app).post("/api/admin/backfill-reports?stream=1").send({});

    const get = await request(app).get("/api/admin/last-backfill");
    expect(get.status).toBe(200);
    expect(get.body.summary.failed).toBe(0);
    expect(get.body.summary.updated).toBe(1);
    expect(get.body.summary.failures).toEqual([]);
    expect(get.body.updatedReports).toHaveLength(1);
    expect(get.body.updatedReports[0].id).toBe("report-updated-NEW");
  });
});
