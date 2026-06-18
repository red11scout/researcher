import { describe, it, expect, afterEach } from "vitest";
import {
  buildCall1SystemPrompt,
  buildBenchmarkWebSearchTool,
  getBenchmarkWebSearchMaxUses,
} from "../server/ai-service";

// Call 1 (Steps 0-2) is the only call that sources benchmark URLs, and web
// search is enabled exclusively for it. These tests lock in that the 5
// anti-hallucination URL-sourcing rules are present in the prompt and that the
// web-search tool is configured correctly.
describe("Call 1 STRICT URL SOURCING RULES (anti-hallucination)", () => {
  const prompt = buildCall1SystemPrompt();

  it("declares web search is enabled for this step", () => {
    expect(prompt).toMatch(/web search is ENABLED/i);
  });

  it("Rule 1 — ZERO URL HALLUCINATION (never from memory)", () => {
    expect(prompt).toMatch(/ZERO URL HALLUCINATION/);
    expect(prompt).toMatch(/training data or memory/i);
  });

  it("Rule 2 — SEARCH-GROUNDED ONLY (only live search results this session)", () => {
    expect(prompt).toMatch(/SEARCH-GROUNDED ONLY/);
    expect(prompt).toMatch(/live web search result during THIS session/i);
  });

  it("Rule 3 — SPEED/TIME-BOXING (max two searches per KPI)", () => {
    expect(prompt).toMatch(/TIME-BOXING/);
    expect(prompt).toMatch(/at most TWO web searches per KPI/i);
  });

  it("Rule 4 — EXPLICIT FALLBACK with the exact fallback string", () => {
    expect(prompt).toMatch(/EXPLICIT FALLBACK/);
    expect(prompt).toContain(
      "Source found via search, but direct URL unavailable.",
    );
  });

  it("Rule 5 — DOMAIN FILTERING (reputable domains, specific page not homepage)", () => {
    expect(prompt).toMatch(/DOMAIN FILTERING/);
    expect(prompt).toMatch(/NEVER a generic homepage/i);
  });

  it("instructs the model to output ONLY JSON after searching", () => {
    expect(prompt).toMatch(/After you have completed all web searches/i);
    expect(prompt).toMatch(/output ONLY the JSON object/i);
  });
});

describe("benchmark web-search tool configuration", () => {
  const ORIGINAL = process.env.BENCHMARK_WEB_SEARCH_MAX_USES;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BENCHMARK_WEB_SEARCH_MAX_USES;
    else process.env.BENCHMARK_WEB_SEARCH_MAX_USES = ORIGINAL;
  });

  it("uses the Anthropic web_search_20250305 server tool", () => {
    delete process.env.BENCHMARK_WEB_SEARCH_MAX_USES;
    const tool = buildBenchmarkWebSearchTool();
    expect(tool.type).toBe("web_search_20250305");
    expect(tool.name).toBe("web_search");
  });

  it("defaults max_uses to 15 as a per-report search backstop", () => {
    delete process.env.BENCHMARK_WEB_SEARCH_MAX_USES;
    expect(getBenchmarkWebSearchMaxUses()).toBe(15);
    expect(buildBenchmarkWebSearchTool().max_uses).toBe(15);
  });

  it("honors BENCHMARK_WEB_SEARCH_MAX_USES override", () => {
    process.env.BENCHMARK_WEB_SEARCH_MAX_USES = "7";
    expect(getBenchmarkWebSearchMaxUses()).toBe(7);
    expect(buildBenchmarkWebSearchTool().max_uses).toBe(7);
  });

  it("ignores invalid overrides and falls back to the default", () => {
    process.env.BENCHMARK_WEB_SEARCH_MAX_USES = "not-a-number";
    expect(getBenchmarkWebSearchMaxUses()).toBe(15);
    process.env.BENCHMARK_WEB_SEARCH_MAX_USES = "-3";
    expect(getBenchmarkWebSearchMaxUses()).toBe(15);
  });
});
