// tests/admin-audit-export-skip.test.ts
//
// Task #59: prove that read-only audit-log download endpoints
// (`/api/admin/audit-log/export` and `/api/admin/audit-log/export.xlsx`)
// are excluded from the generic admin auditing middleware so that a
// nervous operator mashing "Download CSV" 50 times in a minute does not
// flood the very table they are trying to read.
//
// We mount the real `auditAdminRequest` middleware on a tiny Express app
// and assert that 10 successive export requests produce zero
// `storage.createAdminAuditEntry` calls, while a non-skipped admin
// endpoint (e.g. `backfill-reports`) still records exactly one row per
// request — the middleware itself is healthy, the skip set is what
// suppresses the export rows.

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createSpy = vi.fn(async () => undefined);

vi.mock("../server/storage", () => ({
  storage: {
    createAdminAuditEntry: createSpy,
  },
}));

const { auditAdminRequest } = await import("../server/auth");

function buildApp() {
  const app = express();
  app.use("/api/admin", auditAdminRequest);
  app.get("/api/admin/audit-log/export", (_req, res) => {
    res.type("text/csv").send("when,action\n");
  });
  app.get("/api/admin/audit-log/export.xlsx", (_req, res) => {
    res.type("application/vnd.openxmlformats").send("xlsx-bytes");
  });
  app.post("/api/admin/backfill-reports", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("auditAdminRequest — read-only export skip (task #59)", () => {
  beforeEach(() => {
    createSpy.mockClear();
  });

  it("does not record an audit row for a single CSV export", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/admin/audit-log/export?action=backfill-reports&status=failure",
    );
    expect(res.status).toBe(200);
    // res.on('finish') runs synchronously when the response ends in
    // supertest's in-process server, so by the time `await request(...)`
    // resolves the middleware has already decided whether to record.
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("does not record an audit row for a single Excel export", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/admin/audit-log/export.xlsx?action=backfill-reports",
    );
    expect(res.status).toBe(200);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("10 successive CSV downloads do not produce 10 audit rows", async () => {
    const app = buildApp();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get(
        `/api/admin/audit-log/export?action=backfill-reports&iter=${i}`,
      );
      expect(res.status).toBe(200);
    }
    // The whole point of the skip set: zero rows, not ten.
    expect(createSpy).toHaveBeenCalledTimes(0);
  });

  it("10 successive Excel downloads do not produce 10 audit rows", async () => {
    const app = buildApp();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get(
        `/api/admin/audit-log/export.xlsx?iter=${i}`,
      );
      expect(res.status).toBe(200);
    }
    expect(createSpy).toHaveBeenCalledTimes(0);
  });

  it("still records non-skipped admin endpoints (sanity check)", async () => {
    // Confirms the middleware itself is wired correctly — the skip set
    // is what suppresses export rows, not a broken on('finish') hook.
    const app = buildApp();
    await request(app).post("/api/admin/backfill-reports");
    await request(app).post("/api/admin/backfill-reports");
    expect(createSpy).toHaveBeenCalledTimes(2);
    const firstCall = createSpy.mock.calls[0][0] as { action: string };
    expect(firstCall.action).toBe("backfill-reports");
  });
});
