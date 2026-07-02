import { describe, it, expect } from "vitest";
import {
  estimateTokensPerRun,
  estimateFromUseCaseRecord,
  TOKEN_ESTIMATOR_DEFAULTS,
} from "../src/calc/tokenEstimator";

describe("tokenEstimator", () => {
  it("returns the base estimate for empty inputs", () => {
    const e = estimateTokensPerRun();
    // base 5000 + 0 hops + 0 docs + no tools = 5000 × 1.5 (medium) = 7500
    expect(e.inputTokens).toBe(7500);
    expect(e.outputTokens).toBe(2250);
  });

  it("respects complexity multiplier", () => {
    expect(estimateTokensPerRun({ complexity: "low" }).inputTokens).toBe(5000);
    expect(estimateTokensPerRun({ complexity: "medium" }).inputTokens).toBe(7500);
    expect(estimateTokensPerRun({ complexity: "high" }).inputTokens).toBe(12500);
  });

  it("scales with agent hops", () => {
    const single = estimateTokensPerRun({ agentHops: 1, complexity: "low" });
    const multi = estimateTokensPerRun({ agentHops: 4, complexity: "low" });
    // single: 5000 + 1*3000 = 8000
    // multi:  5000 + 4*3000 = 17000
    expect(single.inputTokens).toBe(8000);
    expect(multi.inputTokens).toBe(17000);
  });

  it("adds RAG and tool overhead", () => {
    const e = estimateTokensPerRun({
      agentHops: 2,
      retrievedDocs: 5,
      hasToolSchemas: true,
      complexity: "high",
    });
    // (5000 + 2*3000 + 5*2000 + 1500) × 2.5 = 22500 × 2.5 = 56250
    expect(e.inputTokens).toBe(56250);
  });

  it("infers multi-agent + RAG + high complexity from a forecasting use case", () => {
    const record = {
      "Use Case": "Multi-agent demand forecasting orchestrator with RAG over 3 years of POS data",
      "Description":
        "Orchestrator-Workers pattern: pattern recognition agent + outlier detection agent + forecast synthesis agent with tool use over inventory APIs",
    };
    const e = estimateFromUseCaseRecord(record);
    // multi-agent (4 hops), RAG (5 docs), tools (yes), high complexity
    expect(e.inputTokens).toBeGreaterThanOrEqual(15000);
    expect(e.inputTokens).toBeLessThanOrEqual(80000);
  });

  it("never returns less than the legacy 800/800 default", () => {
    const minimal = estimateFromUseCaseRecord({});
    expect(minimal.inputTokens).toBeGreaterThan(800);
    expect(minimal.outputTokens).toBeGreaterThan(800);
  });

  it("exposes documented defaults", () => {
    expect(TOKEN_ESTIMATOR_DEFAULTS.baseInput).toBe(5000);
    expect(TOKEN_ESTIMATOR_DEFAULTS.baseOutput).toBe(1500);
  });
});
