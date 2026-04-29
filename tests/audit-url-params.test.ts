import { describe, expect, it } from "vitest";
import {
  EMPTY_AUDIT_FILTERS,
  buildAuditSearchString,
  buildAuditUrlParams,
  parseAuditUrlParams,
} from "../client/src/lib/auditUrlParams";

describe("parseAuditUrlParams", () => {
  it("returns empty defaults for an empty search string", () => {
    expect(parseAuditUrlParams("")).toEqual({
      filters: EMPTY_AUDIT_FILTERS,
      offset: 0,
    });
  });

  it("accepts a leading '?' on the search string", () => {
    const { filters, offset } = parseAuditUrlParams(
      "?action=admin-login-failed&offset=25",
    );
    expect(filters.action).toBe("admin-login-failed");
    expect(offset).toBe(25);
  });

  it("parses every filter field plus offset", () => {
    const { filters, offset } = parseAuditUrlParams(
      "action=backfill-reports&status=failure&since=2026-04-01&until=2026-04-29&ip=10.0.0.1&offset=50",
    );
    expect(filters).toEqual({
      action: "backfill-reports",
      status: "failure",
      since: "2026-04-01",
      until: "2026-04-29",
      ip: "10.0.0.1",
    });
    expect(offset).toBe(50);
  });

  it("rejects malformed dates so the date pickers don't get poisoned", () => {
    const { filters } = parseAuditUrlParams(
      "since=2026-04-29T00:00:00.000Z&until=not-a-date",
    );
    expect(filters.since).toBe("");
    expect(filters.until).toBe("");
  });

  it("ignores a negative or non-numeric offset", () => {
    expect(parseAuditUrlParams("offset=-3").offset).toBe(0);
    expect(parseAuditUrlParams("offset=abc").offset).toBe(0);
  });

  it("floors a fractional offset rather than rounding", () => {
    expect(parseAuditUrlParams("offset=25.9").offset).toBe(25);
  });
});

describe("buildAuditUrlParams", () => {
  it("omits default / empty values to keep the canonical URL clean", () => {
    expect(buildAuditUrlParams(EMPTY_AUDIT_FILTERS, 0).toString()).toBe("");
  });

  it("only emits non-default filters and a positive offset", () => {
    const sp = buildAuditUrlParams(
      {
        action: "admin-login-failed",
        status: "all",
        since: "",
        until: "",
        ip: "  10.0.0.1  ",
      },
      25,
    );
    expect(sp.get("action")).toBe("admin-login-failed");
    expect(sp.get("status")).toBeNull();
    // IP should be trimmed before being persisted.
    expect(sp.get("ip")).toBe("10.0.0.1");
    expect(sp.get("offset")).toBe("25");
  });

  it("treats whitespace-only IP as empty", () => {
    const sp = buildAuditUrlParams(
      { ...EMPTY_AUDIT_FILTERS, ip: "   " },
      0,
    );
    expect(sp.get("ip")).toBeNull();
  });
});

describe("buildAuditSearchString", () => {
  it("yields an empty string for default state (no '?' noise)", () => {
    expect(buildAuditSearchString(EMPTY_AUDIT_FILTERS, 0)).toBe("");
  });

  it("prefixes a '?' when at least one param is set", () => {
    const s = buildAuditSearchString(
      { ...EMPTY_AUDIT_FILTERS, action: "admin-login" },
      0,
    );
    expect(s.startsWith("?")).toBe(true);
    expect(s).toContain("action=admin-login");
  });
});

describe("round-trip parse/build", () => {
  it("survives a round trip through build → parse", () => {
    const filters = {
      action: "backfill-reports",
      status: "failure",
      since: "2026-04-01",
      until: "2026-04-29",
      ip: "192.168.1.1",
    };
    const offset = 75;
    const search = buildAuditSearchString(filters, offset);
    const parsed = parseAuditUrlParams(search);
    expect(parsed.filters).toEqual(filters);
    expect(parsed.offset).toBe(offset);
  });
});
