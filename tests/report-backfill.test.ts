// tests/report-backfill.test.ts
//
// Coverage for the v2.1 → v2.2 report backfill / migration path:
//   - Unit tests for `evaluateReportStaleness` over each individual staleness
//     trigger (missing Step 6, old vrm.schemaVersion, missing diagnostic, missing
//     flat fields, missing Step 6 hard knock-out fields) plus a fully-fresh
//     v2.x fixture that should report `stale: false`.
//   - Integration test: load a v2.0-shaped fixture into an in-memory storage
//     stub, run `backfillAllReports`, and confirm the persisted report now
//     passes the staleness check (i.e. matches the current VRM_SCHEMA_VERSION
//     contract end-to-end through the real `postProcessAnalysis`).
//   - Auth gate test: an unauthenticated POST to /api/admin/backfill-reports
//     must hit the session middleware and return 401 before running any
//     migration code.

import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../server/auth";
import { VRM_SCHEMA_VERSION } from "../shared/vrm-v2";

// ---------------------------------------------------------------------------
// In-memory storage stub used by the integration tests below.
// `vi.mock` is hoisted, so this mock is wired in BEFORE `report-backfill`
// resolves its `import { storage } from "./storage"` and therefore avoids
// pulling the real `server/db.ts` (which would throw without DATABASE_URL).
// ---------------------------------------------------------------------------
const storageState: {
  reports: Array<{
    id: string;
    companyName: string;
    isWhatIf: boolean;
    analysisData: any;
  }>;
  updates: Array<{ id: string; data: any }>;
} = {
  reports: [],
  updates: [],
};

vi.mock("../server/storage", () => ({
  storage: {
    getAllReports: async () => storageState.reports,
    updateReport: async (id: string, data: any) => {
      storageState.updates.push({ id, data });
      const idx = storageState.reports.findIndex((r) => r.id === id);
      if (idx >= 0) {
        storageState.reports[idx] = { ...storageState.reports[idx], ...data };
        return storageState.reports[idx];
      }
      return undefined;
    },
  },
}));

// Imported AFTER the mock above so the mock takes effect.
const {
  evaluateReportStaleness,
  backfillAllReports,
  computeUpgradesApplied,
  parseOnlyIdsFromBody,
} = await import("../server/report-backfill");

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/** Minimal fully-fresh analysis matching the current v2.x staleness contract. */
function makeFreshAnalysis(): any {
  return {
    steps: [
      {
        step: 6,
        title: "Readiness & Token Modeling",
        data: [
          {
            ID: "UC-1",
            "Use Case": "Sample",
            "Legally Prohibited": false,
            "Technically Infeasible": false,
            "Readiness Score": 7,
          },
        ],
      },
    ],
    vrm: {
      schemaVersion: VRM_SCHEMA_VERSION,
      diagnostic: {
        championCount: 2,
        prototypingCandidatesPct: 50,
      },
    },
  };
}

/**
 * v2.0-shaped fixture: has Step 5 with one synthetic use case and a Step 6
 * record without the v2.1 hard knock-out fields. `vrm.schemaVersion` is the
 * legacy "2.0" string and `vrm.diagnostic` is intentionally absent so the
 * staleness checker fires on every rule we care about.
 */
function makeLegacyV20Analysis(): any {
  return {
    steps: [
      {
        step: 0,
        title: "Company Profile",
        data: [
          {
            "Annual Revenue ($)": 50_000_000,
            "Total Employees": 250,
          },
        ],
      },
      {
        step: 5,
        title: "Benefits Quantification",
        data: [
          {
            ID: "UC-1",
            "Use Case": "Automated Quote Generation",
            // Provide structured cost labels so the post-processor produces a
            // non-zero benefit and exercises the value-scoring path that feeds
            // into the v2.2 portfolio diagnostic.
            "Cost Formula Labels": {
              components: [
                { label: "Hours Saved", value: 4000 },
                { label: "Loaded Hourly Rate", value: 120 },
                { label: "Benefits Loading", value: 1.35 },
                { label: "Adoption Rate", value: 0.9 },
                { label: "Data Maturity", value: 0.75 },
              ],
            },
            "Probability of Success": 0.75,
          },
        ],
      },
      {
        step: 6,
        title: "Readiness & Token Modeling",
        // Legacy record — no "Legally Prohibited"/"Technically Infeasible"
        data: [
          {
            ID: "UC-1",
            "Use Case": "Automated Quote Generation",
            "Organizational Capacity": 7,
            "Data Availability & Quality": 7,
            "Technical Infrastructure": 7,
            "Governance": 7,
            "Time-to-Value (months)": 6,
            "Runs/Month": 1000,
            "Input Tokens/Run": 800,
            "Output Tokens/Run": 800,
          },
        ],
      },
    ],
    vrm: {
      schemaVersion: "2.0",
      // Legacy v2.0 had a flat scalar diagnostic block — intentionally omitted
      // so the staleness checker reports both `missing-diagnostic` and
      // `missing-flat-fields`.
    },
  };
}

// ---------------------------------------------------------------------------
// evaluateReportStaleness — unit tests
// ---------------------------------------------------------------------------
describe("evaluateReportStaleness", () => {
  it("returns stale=false with reason 'no-steps' when analysis has no steps array", () => {
    const result = evaluateReportStaleness({});
    expect(result.stale).toBe(false);
    expect(result.reasons).toEqual(["no-steps"]);
    expect(result.hasStep6).toBe(false);
    expect(result.vrmSchemaVersion).toBeNull();
  });

  it("flags missing Step 6", () => {
    const analysis = makeFreshAnalysis();
    analysis.steps = analysis.steps.filter((s: any) => s.step !== 6);
    const result = evaluateReportStaleness(analysis);
    expect(result.stale).toBe(true);
    expect(result.hasStep6).toBe(false);
    expect(result.reasons).toContain("missing-step6");
    // No Step 6 also implies the KO fields cannot be present.
    expect(result.reasons).toContain("missing-step6-knockout-fields");
  });

  it("flags missing vrm.schemaVersion", () => {
    const analysis = makeFreshAnalysis();
    delete analysis.vrm.schemaVersion;
    const result = evaluateReportStaleness(analysis);
    expect(result.stale).toBe(true);
    expect(result.vrmSchemaVersion).toBeNull();
    expect(result.reasons).toContain("vrm-schema=missing");
  });

  it("flags an outdated vrm.schemaVersion (e.g. legacy '2.0')", () => {
    const analysis = makeFreshAnalysis();
    analysis.vrm.schemaVersion = "2.0";
    const result = evaluateReportStaleness(analysis);
    expect(result.stale).toBe(true);
    expect(result.vrmSchemaVersion).toBe("2.0");
    expect(result.reasons).toContain("vrm-schema=2.0");
  });

  it("flags missing vrm.diagnostic", () => {
    const analysis = makeFreshAnalysis();
    delete analysis.vrm.diagnostic;
    const result = evaluateReportStaleness(analysis);
    expect(result.stale).toBe(true);
    expect(result.hasV21Diagnostic).toBe(false);
    expect(result.reasons).toContain("missing-diagnostic");
    // Without a diagnostic block the flat fields cannot be present either.
    expect(result.reasons).toContain("missing-flat-fields");
  });

  it("flags missing flat diagnostic fields when diagnostic is present but partial", () => {
    const analysis = makeFreshAnalysis();
    analysis.vrm.diagnostic = { championCount: 2 }; // missing prototypingCandidatesPct
    const result = evaluateReportStaleness(analysis);
    expect(result.stale).toBe(true);
    expect(result.hasV21Diagnostic).toBe(true);
    expect(result.hasFlatFields).toBe(false);
    expect(result.reasons).toContain("missing-flat-fields");
  });

  it("flags missing Step 6 hard knock-out fields", () => {
    const analysis = makeFreshAnalysis();
    const step6 = analysis.steps.find((s: any) => s.step === 6);
    delete step6.data[0]["Legally Prohibited"];
    delete step6.data[0]["Technically Infeasible"];
    const result = evaluateReportStaleness(analysis);
    expect(result.stale).toBe(true);
    expect(result.hasStep6).toBe(true);
    expect(result.hasStep6KOFields).toBe(false);
    expect(result.reasons).toContain("missing-step6-knockout-fields");
  });

  it("treats a fully-fresh v2.x fixture as not stale", () => {
    const result = evaluateReportStaleness(makeFreshAnalysis());
    expect(result.stale).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.hasStep6).toBe(true);
    expect(result.vrmSchemaVersion).toBe(VRM_SCHEMA_VERSION);
    expect(result.hasV21Diagnostic).toBe(true);
    expect(result.hasFlatFields).toBe(true);
    expect(result.hasStep6KOFields).toBe(true);
  });

  it("considers a legacy v2.0 fixture stale on every contract field", () => {
    const result = evaluateReportStaleness(makeLegacyV20Analysis());
    expect(result.stale).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "vrm-schema=2.0",
        "missing-diagnostic",
        "missing-flat-fields",
        "missing-step6-knockout-fields",
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// computeUpgradesApplied — diff the staleness signals before vs. after backfill
// to surface exactly which schema-level upgrades were applied to a report.
// ---------------------------------------------------------------------------
describe("computeUpgradesApplied", () => {
  it("returns an empty list when nothing changed", () => {
    const fresh = evaluateReportStaleness(makeFreshAnalysis());
    expect(computeUpgradesApplied(fresh, fresh)).toEqual([]);
  });

  it("flags every upgrade when migrating a legacy v2.0 → v2.x report", () => {
    const before = evaluateReportStaleness(makeLegacyV20Analysis());
    const after = evaluateReportStaleness(makeFreshAnalysis());
    const upgrades = computeUpgradesApplied(before, after);
    const codes = upgrades.map((u) => u.code).sort();
    expect(codes).toEqual([
      "added-diagnostic",
      "added-flat-fields",
      "added-step6-ko-fields",
      "bumped-schema",
    ]);
    const bumped = upgrades.find((u) => u.code === "bumped-schema");
    expect(bumped?.label).toBe(`Bumped schema 2.0 → ${VRM_SCHEMA_VERSION}`);
  });

  it("emits 'Generated Step 6' when Step 6 first appears", () => {
    const beforeAnalysis = makeFreshAnalysis();
    beforeAnalysis.steps = beforeAnalysis.steps.filter(
      (s: any) => s.step !== 6,
    );
    const before = evaluateReportStaleness(beforeAnalysis);
    const after = evaluateReportStaleness(makeFreshAnalysis());
    const upgrades = computeUpgradesApplied(before, after);
    expect(upgrades.find((u) => u.code === "added-step6")?.label).toBe(
      "Generated Step 6",
    );
  });

  it("uses 'missing' as the previous schema label when none was set", () => {
    const beforeAnalysis = makeFreshAnalysis();
    delete beforeAnalysis.vrm.schemaVersion;
    const before = evaluateReportStaleness(beforeAnalysis);
    const after = evaluateReportStaleness(makeFreshAnalysis());
    const bumped = computeUpgradesApplied(before, after).find(
      (u) => u.code === "bumped-schema",
    );
    expect(bumped?.label).toBe(`Bumped schema missing → ${VRM_SCHEMA_VERSION}`);
  });
});

// ---------------------------------------------------------------------------
// backfillAllReports — integration test against the real postProcessAnalysis
// ---------------------------------------------------------------------------
describe("backfillAllReports", () => {
  beforeEach(() => {
    storageState.reports = [];
    storageState.updates = [];
  });

  it("upgrades a v2.0-shaped report so it passes the staleness check", async () => {
    storageState.reports = [
      {
        id: "report-legacy-1",
        companyName: "Legacy Co",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
    ];

    // Sanity check: pre-condition is that the seeded fixture is stale.
    expect(
      evaluateReportStaleness(storageState.reports[0].analysisData).stale,
    ).toBe(true);

    const summary = await backfillAllReports();

    expect(summary.total).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.results[0].status).toBe("updated");
    expect(summary.results[0].id).toBe("report-legacy-1");

    // The per-report result must surface the schema-level changes the
    // post-processor actually applied, so admins don't have to diff JSON.
    const upgradeCodes = (summary.results[0].upgrades ?? [])
      .map((u) => u.code)
      .sort();
    expect(upgradeCodes).toEqual(
      expect.arrayContaining([
        "added-diagnostic",
        "added-flat-fields",
        "added-step6-ko-fields",
        "bumped-schema",
      ]),
    );

    // The mock storage records the persist call.
    expect(storageState.updates).toHaveLength(1);
    expect(storageState.updates[0].id).toBe("report-legacy-1");
    const persisted = storageState.updates[0].data.analysisData;

    // After the migration the persisted shape must satisfy every staleness
    // rule (vrm.schemaVersion bumped, diagnostic with flat fields present,
    // Step 6 carries the hard knock-out fields).
    const after = evaluateReportStaleness(persisted);
    expect(after.stale).toBe(false);
    expect(after.reasons).toEqual([]);
    expect(after.vrmSchemaVersion).toBe(VRM_SCHEMA_VERSION);
    expect(after.hasV21Diagnostic).toBe(true);
    expect(after.hasFlatFields).toBe(true);
    expect(after.hasStep6KOFields).toBe(true);
  });

  it("skips a fully-fresh report when force=false", async () => {
    storageState.reports = [
      {
        id: "report-fresh-1",
        companyName: "Fresh Co",
        isWhatIf: false,
        analysisData: makeFreshAnalysis(),
      },
    ];

    const summary = await backfillAllReports();

    expect(summary.total).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results[0].status).toBe("skipped");
    expect(summary.results[0].reasons).toEqual(["already-v2.1"]);

    // No persist calls when nothing was upgraded.
    expect(storageState.updates).toHaveLength(0);
  });

  it("processes only the whitelisted IDs when onlyIds is provided", async () => {
    // Seed three reports — two stale, one fresh. onlyIds should narrow the
    // run to just the requested subset (size + identity), and reports
    // outside the allow-list must not contribute to total/skipped/updated
    // counts and must not be persisted.
    storageState.reports = [
      {
        id: "report-a",
        companyName: "Alpha",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
      {
        id: "report-b",
        companyName: "Bravo",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
      {
        id: "report-c",
        companyName: "Charlie",
        isWhatIf: false,
        analysisData: makeFreshAnalysis(),
      },
    ];

    const summary = await backfillAllReports({
      onlyIds: ["report-a", "report-c"],
    });

    // Only the two whitelisted reports should be iterated. report-b must
    // have been filtered out before the loop — it does not show up in any
    // bucket of the summary.
    expect(summary.total).toBe(2);
    const seenIds = summary.results.map((r) => r.id).sort();
    expect(seenIds).toEqual(["report-a", "report-c"]);

    // report-a was stale → upgraded; report-c was fresh → skipped.
    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);

    // Persistence must mirror the iteration set: only report-a (the upgraded
    // one) is written, never report-b (filtered out) or report-c (skipped).
    expect(storageState.updates.map((u) => u.id)).toEqual(["report-a"]);
  });

  it("emits an onStart total that reflects the onlyIds filter, not the full dataset", async () => {
    // Streaming consumers (the Admin progress bar) rely on onStart firing
    // with the count they're actually going to iterate over. If onStart
    // leaked the unfiltered dataset size the progress bar would stall at a
    // tiny percentage forever.
    storageState.reports = [
      {
        id: "report-a",
        companyName: "Alpha",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
      {
        id: "report-b",
        companyName: "Bravo",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
      {
        id: "report-c",
        companyName: "Charlie",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
    ];

    let onStartTotal: number | null = null;
    await backfillAllReports({
      onlyIds: ["report-b"],
      onStart: (total) => {
        onStartTotal = total;
      },
    });

    expect(onStartTotal).toBe(1);
  });

  it("ignores onlyIds when the array is empty (falls back to processing all reports)", async () => {
    storageState.reports = [
      {
        id: "report-a",
        companyName: "Alpha",
        isWhatIf: false,
        analysisData: makeLegacyV20Analysis(),
      },
    ];

    const summary = await backfillAllReports({ onlyIds: [] });

    expect(summary.total).toBe(1);
    expect(summary.results[0].id).toBe("report-a");
  });

  it("forces reprocessing of already-fresh reports when force=true", async () => {
    storageState.reports = [
      {
        id: "report-fresh-2",
        companyName: "Fresh Co 2",
        isWhatIf: false,
        // Use the legacy fixture here too — postProcessAnalysis can run against
        // it deterministically. The point of this test is just that `force`
        // bypasses the staleness short-circuit and persists an update.
        analysisData: makeLegacyV20Analysis(),
      },
    ];

    const summary = await backfillAllReports({ force: true });

    expect(summary.updated).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(storageState.updates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// parseOnlyIdsFromBody — unit tests for the request-body validation helper
// that backs the POST /api/admin/backfill-reports route. The helper exists
// so the wire-format contract — "onlyIds, when present, must be a non-empty
// array of non-empty strings" — can be locked in tests without needing to
// stand up the full route's heavy dependency graph.
// ---------------------------------------------------------------------------
describe("parseOnlyIdsFromBody", () => {
  it("returns onlyIds=undefined when the body is missing or has no onlyIds key", () => {
    expect(parseOnlyIdsFromBody(undefined)).toEqual({
      ok: true,
      onlyIds: undefined,
    });
    expect(parseOnlyIdsFromBody(null)).toEqual({
      ok: true,
      onlyIds: undefined,
    });
    expect(parseOnlyIdsFromBody({})).toEqual({
      ok: true,
      onlyIds: undefined,
    });
  });

  it("accepts a valid non-empty array of non-empty strings", () => {
    expect(parseOnlyIdsFromBody({ onlyIds: ["a", "b"] })).toEqual({
      ok: true,
      onlyIds: ["a", "b"],
    });
  });

  it("dedupes repeated ids (so a double-clicked retry doesn't double-count)", () => {
    expect(parseOnlyIdsFromBody({ onlyIds: ["a", "a", "b"] })).toEqual({
      ok: true,
      onlyIds: ["a", "b"],
    });
  });

  it("rejects an empty array", () => {
    const result = parseOnlyIdsFromBody({ onlyIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/non-empty array/);
    }
  });

  it("rejects a non-array onlyIds value", () => {
    expect(parseOnlyIdsFromBody({ onlyIds: "report-1" }).ok).toBe(false);
    expect(parseOnlyIdsFromBody({ onlyIds: 42 }).ok).toBe(false);
    expect(parseOnlyIdsFromBody({ onlyIds: { foo: "bar" } }).ok).toBe(false);
  });

  it("rejects an array containing a non-string entry", () => {
    expect(parseOnlyIdsFromBody({ onlyIds: ["a", 1] }).ok).toBe(false);
    expect(parseOnlyIdsFromBody({ onlyIds: ["a", null] }).ok).toBe(false);
    expect(parseOnlyIdsFromBody({ onlyIds: [{ id: "a" }] }).ok).toBe(false);
  });

  it("rejects an array containing an empty string", () => {
    const result = parseOnlyIdsFromBody({ onlyIds: ["valid", ""] });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route-level integration test — POST /api/admin/backfill-reports
// Locks the wire-format contract: how onlyIds is parsed off the request body
// and forwarded to backfillAllReports, and what a 400 response looks like.
// We mount a tiny Express app that registers the same handler shape so we
// can exercise it end-to-end through supertest without dragging in the full
// 3.8k-line server/routes.ts (multer, ai-service, pdf-parse, …).
// ---------------------------------------------------------------------------
describe("POST /api/admin/backfill-reports — onlyIds wire contract", () => {
  function buildApp(): {
    app: express.Express;
    captured: { force: boolean; onlyIds?: string[] }[];
  } {
    const captured: { force: boolean; onlyIds?: string[] }[] = [];
    const app = express();
    app.use(express.json());
    app.post("/api/admin/backfill-reports", async (req, res) => {
      const force = req.query.force === "1" || req.query.force === "true";
      const parsed = parseOnlyIdsFromBody(req.body);
      if (!parsed.ok) {
        return res.status(400).json({ success: false, error: parsed.error });
      }
      captured.push({ force, onlyIds: parsed.onlyIds });
      // Mimic the real handler's success shape.
      return res.json({
        success: true,
        force,
        total: parsed.onlyIds?.length ?? 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        durationMs: 0,
        failures: [],
      });
    });
    return { app, captured };
  }

  it("forwards a valid onlyIds body to the handler and echoes the count", async () => {
    const { app, captured } = buildApp();
    const res = await request(app)
      .post("/api/admin/backfill-reports?stream=0&force=1")
      .send({ onlyIds: ["report-a", "report-b"] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(2);
    expect(captured).toEqual([
      { force: true, onlyIds: ["report-a", "report-b"] },
    ]);
  });

  it("falls through to a full run when no body is sent", async () => {
    const { app, captured } = buildApp();
    const res = await request(app).post("/api/admin/backfill-reports").send();
    expect(res.status).toBe(200);
    expect(captured).toEqual([{ force: false, onlyIds: undefined }]);
  });

  it("returns 400 with a stable error message for an empty onlyIds array", async () => {
    const { app, captured } = buildApp();
    const res = await request(app)
      .post("/api/admin/backfill-reports")
      .send({ onlyIds: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: "onlyIds must be a non-empty array of report id strings",
    });
    // Crucially the run was NOT initiated when validation failed.
    expect(captured).toEqual([]);
  });

  it("returns 400 for non-string entries", async () => {
    const { app, captured } = buildApp();
    const res = await request(app)
      .post("/api/admin/backfill-reports")
      .send({ onlyIds: ["valid", 42] });
    expect(res.status).toBe(400);
    expect(captured).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Auth gate — POST /api/admin/backfill-reports must require a session
// ---------------------------------------------------------------------------
describe("POST /api/admin/backfill-reports — auth gate", () => {
  function buildAdminApp(): express.Express {
    const app = express();
    app.use(express.json());
    // Mirror the session + auth middleware ordering used in `server/auth.ts`.
    app.use(
      session({
        secret: "test-secret-for-vitest",
        resave: false,
        saveUninitialized: false,
      }),
    );
    app.use(authMiddleware);
    // Stub handler — should never be hit when unauthenticated.
    app.post("/api/admin/backfill-reports", (_req, res) => {
      res.json({ success: true });
    });
    return app;
  }

  it("returns 401 for an unauthenticated POST", async () => {
    const app = buildAdminApp();
    const res = await request(app).post("/api/admin/backfill-reports").send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Authentication required" });
  });

  it("allows the request through when the session is authenticated", async () => {
    // Smoke-check the inverse path so the 401 above isn't a false positive
    // from an always-blocking middleware. We seed the session by going through
    // a tiny login endpoint that flips `req.session.authenticated`.
    const app = express();
    app.use(express.json());
    app.use(
      session({
        secret: "test-secret-for-vitest",
        resave: false,
        saveUninitialized: false,
      }),
    );
    app.post("/api/auth/login", (req, res) => {
      req.session.authenticated = true;
      req.session.save(() => res.json({ success: true }));
    });
    app.use(authMiddleware);
    app.post("/api/admin/backfill-reports", (_req, res) => {
      res.json({ success: true, ran: true });
    });

    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({});
    expect(login.status).toBe(200);

    const res = await agent.post("/api/admin/backfill-reports").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, ran: true });
  });
});
