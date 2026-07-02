import { describe, it, expect } from "vitest";
import { resolveDisplayName, updateReportDisplayNameSchema } from "@shared/schema";
import { formatReportAsJson, formatReportAsMarkdown } from "../server/export-formatters";

describe("resolveDisplayName", () => {
  it("falls back to companyName when displayName is null/undefined/blank", () => {
    expect(resolveDisplayName({ companyName: "Acme Corp" })).toBe("Acme Corp");
    expect(resolveDisplayName({ companyName: "Acme Corp", displayName: null })).toBe("Acme Corp");
    expect(resolveDisplayName({ companyName: "Acme Corp", displayName: "" })).toBe("Acme Corp");
    expect(resolveDisplayName({ companyName: "Acme Corp", displayName: "   " })).toBe("Acme Corp");
  });

  it("returns trimmed displayName when set", () => {
    expect(resolveDisplayName({ companyName: "acme-corp", displayName: "Acme Corp, LLC" })).toBe("Acme Corp, LLC");
    expect(resolveDisplayName({ companyName: "x", displayName: "  A+E Networks  " })).toBe("A+E Networks");
  });
});

describe("updateReportDisplayNameSchema", () => {
  it("accepts a string under 200 chars", () => {
    const r = updateReportDisplayNameSchema.parse({ displayName: "A+E Networks, LLC" });
    expect(r.displayName).toBe("A+E Networks, LLC");
  });

  it("accepts null to clear the override", () => {
    const r = updateReportDisplayNameSchema.parse({ displayName: null });
    expect(r.displayName === null || r.displayName === undefined).toBe(true);
  });

  it("accepts empty body / omitted field", () => {
    const r = updateReportDisplayNameSchema.parse({});
    expect(r.displayName === null || r.displayName === undefined).toBe(true);
  });

  it("rejects strings over 200 characters", () => {
    const tooLong = "a".repeat(201);
    expect(() => updateReportDisplayNameSchema.parse({ displayName: tooLong })).toThrow();
  });
});

describe("export-formatters displayName round-trip", () => {
  const ctx = { reportType: "test", exportedAt: "2026-01-01T00:00:00Z" };

  it("JSON export emits a top-level `displayName` field (override)", () => {
    const out = formatReportAsJson(
      { id: "1", companyName: "acme-corp", displayName: "Acme Corp, LLC", analysisData: { steps: [] } },
      ctx,
    );
    expect(out.company).toBe("acme-corp"); // canonical/research name preserved
    expect(out.displayName).toBe("Acme Corp, LLC");
  });

  it("JSON export emits `displayName: null` when no override is set (back-compat)", () => {
    const out = formatReportAsJson(
      { id: "1", companyName: "Acme Corp", analysisData: {} },
      ctx,
    );
    expect(out.company).toBe("Acme Corp");
    expect(out.displayName).toBeNull();
  });

  it("Markdown export header uses the resolved display name when overridden", () => {
    const md = formatReportAsMarkdown(
      { id: "1", companyName: "acme-corp", displayName: "Acme Corp, LLC", analysisData: { summary: "x", steps: [] } },
      ctx,
    );
    expect(md).toContain("Acme Corp, LLC");
  });

  it("Markdown export header falls back to companyName when no override", () => {
    const md = formatReportAsMarkdown(
      { id: "1", companyName: "Acme Corp", analysisData: { summary: "x", steps: [] } },
      ctx,
    );
    expect(md).toContain("Acme Corp");
  });
});
