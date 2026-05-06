import { describe, expect, it } from "vitest";
import { summarizeAuditEntries } from "@/pages/Admin";

function makeEntry(
  id: string,
  action: string,
  status: "success" | "failure",
) {
  return {
    id,
    action,
    status,
    statusCode: status === "failure" ? 401 : 200,
    actorIp: "10.0.0.1",
    actorUserAgent: null,
    path: null,
    params: null,
    outcome: null,
    errorMessage: status === "failure" ? "nope" : null,
    createdAt: "2026-04-29T12:00:00.000Z",
  };
}

describe("summarizeAuditEntries", () => {
  it("returns an empty array for no entries", () => {
    expect(summarizeAuditEntries([])).toEqual([]);
  });

  it("counts per action with failure subtotals", () => {
    const out = summarizeAuditEntries([
      makeEntry("a", "backfill-reports", "success"),
      makeEntry("b", "backfill-reports", "success"),
      makeEntry("c", "admin-login", "success"),
      makeEntry("d", "admin-login-failed", "failure"),
      makeEntry("e", "admin-login-failed", "failure"),
    ]);
    expect(out).toEqual([
      { action: "admin-login-failed", total: 2, failures: 2 },
      { action: "backfill-reports", total: 2, failures: 0 },
      { action: "admin-login", total: 1, failures: 0 },
    ]);
  });

  it("orders by total desc, then alphabetically by action code", () => {
    const out = summarizeAuditEntries([
      makeEntry("a", "zeta-action", "success"),
      makeEntry("b", "alpha-action", "success"),
      makeEntry("c", "middle-action", "success"),
      makeEntry("d", "middle-action", "success"),
    ]);
    expect(out.map((c) => c.action)).toEqual([
      "middle-action",
      "alpha-action",
      "zeta-action",
    ]);
  });
});
