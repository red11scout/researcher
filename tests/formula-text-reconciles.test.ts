import { describe, it, expect } from "vitest";
import { postProcessAnalysis } from "../server/calculation-postprocessor";

/**
 * App-wide regression: the printed `formulaText` for every Step 5 use case
 * must evaluate (within rounding) to the printed dollar result.
 *
 * The original formatters used `.toFixed(0)` for percentages and abbreviated
 * dollar inputs through `formatMoney` (e.g. "$23.5B"). On portfolios where
 * the AI proposed a sub-1% revenue uplift on a multi-billion base, the
 * printed formula collapsed to "0% × $23.5B × 0.95 × 0.75 = $25.1M" — a
 * statement no director could reconcile, even though the engine result was
 * correct. Cash-flow / risk / cost suffered smaller (3–4%) drift from the
 * same rounding pattern.
 *
 * This file parses the four formula strings each use case emits and asserts
 * that pct% × input × m1 × m2 (× m3) ≈ printed-result. Tolerance is the
 * rounding granularity of `formatMoney` on the result side (~$50K on M-scale,
 * ~$0.1B on B-scale).
 */

interface ParsedFormula {
  factors: number[];
  printedResult: number;
}

function parseDollarToken(token: string): number {
  // "$23,500,000,000" → 23500000000
  // "$25.1M" → 25_100_000
  // "$6.6M" → 6_600_000
  // "$1.1M" → 1_100_000
  // "$10K" → 10_000
  // "$23.5B" → 23_500_000_000
  const t = token.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = t.match(/^([\d.]+)([BMK])?$/i);
  if (!m) throw new Error(`Cannot parse dollar token "${token}"`);
  const n = parseFloat(m[1]);
  const suffix = m[2]?.toUpperCase();
  if (suffix === "B") return n * 1_000_000_000;
  if (suffix === "M") return n * 1_000_000;
  if (suffix === "K") return n * 1_000;
  return n;
}

function parsePctToken(token: string): number {
  // "0.15%" → 0.0015, "5%" → 0.05, "3.25%" → 0.0325
  const t = token.trim().replace(/%$/, "");
  return parseFloat(t) / 100;
}

/**
 * Parse a formula text like:
 *   "0.15% × $23,500,000,000 × 0.95 × 0.75 = $25.1M → $25.1M [HF/labels]"
 *   "$23,500,000,000 × (2/365) × 0.08 × 0.85 × 0.75 = $6.6M → $6.6M [HF/labels]"
 *   "38,000 hours × $150/hr × 1.35 × 0.90 × 0.75 = $5.2M → $5.2M [HF/labels]"
 */
function parseFormulaText(formula: string): ParsedFormula | null {
  // Strip annotations: "(capped from X%)", "[HF/labels]", "[derived from ...]"
  let body = formula.replace(/\(capped from [^)]+\)/g, "").replace(/\[[^\]]+\]/g, "").trim();

  // Split on " = " — left is the expression, right is "result → result"
  const eqIdx = body.indexOf(" = ");
  if (eqIdx < 0) return null;
  const lhs = body.slice(0, eqIdx).trim();
  const rhsRaw = body.slice(eqIdx + 3).trim();

  // Right side: take the first dollar token (printed result)
  const resultMatch = rhsRaw.match(/\$[\d.,]+[BMK]?/);
  if (!resultMatch) return null;
  const printedResult = parseDollarToken(resultMatch[0]);

  // Tokenize LHS by " × "
  const tokens = lhs.split(/\s*×\s*/);
  const factors: number[] = [];
  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;
    if (/^[\d.]+%$/.test(t)) {
      factors.push(parsePctToken(t));
    } else if (/^\$[\d.,]+[BMK]?$/.test(t)) {
      factors.push(parseDollarToken(t));
    } else if (/^\(\s*[\d.]+\s*\/\s*365\s*\)$/.test(t)) {
      // "(2/365)" → 2/365
      const inner = t.replace(/[()\s]/g, "");
      const [a, b] = inner.split("/").map(parseFloat);
      factors.push(a / b);
    } else if (/hours?$/i.test(t)) {
      // "38,000 hours"
      factors.push(parseFloat(t.replace(/[^0-9.]/g, "")));
    } else if (/^\$[\d.]+\/(?:hr|hour)$/i.test(t)) {
      // "$150/hr"
      factors.push(parseFloat(t.replace(/[^0-9.]/g, "")));
    } else if (/^[\d.]+$/.test(t)) {
      factors.push(parseFloat(t));
    } else {
      // Unknown token shape — bail rather than silently mis-evaluate.
      return null;
    }
  }

  return { factors, printedResult };
}

function evaluate(parsed: ParsedFormula): number {
  return parsed.factors.reduce((acc, f) => acc * f, 1);
}

/**
 * Tolerance: the result-side `formatMoney` rounds to 1 decimal in M/B and
 * whole-K below. On a $25.1M printed result the true value can be anywhere
 * in [$25.05M, $25.15M] — i.e. ±$50K. We use 1% relative or $50K absolute,
 * whichever is larger, to absorb display rounding.
 */
function withinTolerance(printed: number, evaluated: number): boolean {
  const absDiff = Math.abs(printed - evaluated);
  const relDiff = absDiff / Math.max(Math.abs(printed), 1);
  return absDiff <= 50_000 || relDiff <= 0.01;
}

const learFixture = {
  companyName: "Lear Corporation",
  steps: [
    { step: 0, title: "Company Overview", content: "Lear Corporation generates $23.5B in annual revenue.", data: null },
    {
      step: 5,
      title: "Use Cases",
      data: [
        {
          ID: "UC-01",
          "Use Case": "Multi-Site Engineering Coordination",
          "Cost Formula Labels": {
            result: "$5.2M",
            components: [
              { label: "Hours Saved", value: 38000 },
              { label: "Loaded Hourly Rate", value: 150 },
              { label: "Benefits Loading", value: 1.35 },
              { label: "Adoption Rate", value: 0.9 },
              { label: "Data Maturity", value: 0.75 },
            ],
          },
          "Revenue Formula Labels": {
            result: "$25.1M",
            components: [
              { label: "Revenue Uplift %", value: 0.0015 },
              { label: "Revenue at Risk", value: 23_500_000_000 },
              { label: "Realization Factor", value: 0.95 },
              { label: "Data Maturity", value: 0.75 },
            ],
          },
          "Cash Flow Formula Labels": {
            result: "$6.6M",
            components: [
              { label: "Annual Revenue", value: 23_500_000_000 },
              { label: "Days Improved", value: 2 },
              { label: "Cost of Capital", value: 0.08 },
              { label: "Realization Factor", value: 0.85 },
              { label: "Data Maturity", value: 0.75 },
            ],
          },
          "Risk Formula Labels": {
            result: "$1.1M",
            components: [
              { label: "Risk Reduction %", value: 0.0325 },
              { label: "Risk Exposure", value: 58_800_000 },
              { label: "Realization Factor", value: 0.8 },
              { label: "Data Maturity", value: 0.75 },
            ],
          },
        },
      ],
    },
  ],
};

describe("formulaText reconciles with printed dollar result (app-wide regression)", () => {
  it("revenue formula with sub-1% uplift evaluates to the printed result", () => {
    const result: any = postProcessAnalysis(learFixture as any);
    const uc = result.steps.find((s: any) => s.step === 5).data[0];
    const formula = uc["Revenue Formula"];

    // The printed formula must NOT collapse the sub-1% uplift to "0%" — that
    // was the app-wide bug. It must start with a non-zero rate.
    expect(formula.startsWith("0% ")).toBe(false);
    expect(formula).toMatch(/^0\.\d+%/);

    const parsed = parseFormulaText(formula);
    expect(parsed).not.toBeNull();
    const evaluated = evaluate(parsed!);
    expect(withinTolerance(parsed!.printedResult, evaluated)).toBe(true);
  });

  it("cash flow formula evaluates to the printed result with full-precision revenue", () => {
    const result: any = postProcessAnalysis(learFixture as any);
    const uc = result.steps.find((s: any) => s.step === 5).data[0];
    const formula = uc["Cash Flow Formula"];

    // Must NOT use the abbreviated "$23.5B" form for the input — readers
    // need full precision to reconcile.
    expect(formula).toContain("$23,500,000,000");

    const parsed = parseFormulaText(formula);
    expect(parsed).not.toBeNull();
    const evaluated = evaluate(parsed!);
    expect(withinTolerance(parsed!.printedResult, evaluated)).toBe(true);
  });

  it("risk formula with fractional reduction % evaluates to the printed result", () => {
    const result: any = postProcessAnalysis(learFixture as any);
    const uc = result.steps.find((s: any) => s.step === 5).data[0];
    const formula = uc["Risk Formula"];

    // 3.25% must NOT round to "3%" — that was the source of the 3-4% drift
    // on UC-01/03/09/10.
    expect(formula).toMatch(/^3\.25%/);

    const parsed = parseFormulaText(formula);
    expect(parsed).not.toBeNull();
    const evaluated = evaluate(parsed!);
    expect(withinTolerance(parsed!.printedResult, evaluated)).toBe(true);
  });

  it("cost formula evaluates to the printed result", () => {
    const result: any = postProcessAnalysis(learFixture as any);
    const uc = result.steps.find((s: any) => s.step === 5).data[0];
    const formula = uc["Cost Formula"];

    const parsed = parseFormulaText(formula);
    expect(parsed).not.toBeNull();
    const evaluated = evaluate(parsed!);
    expect(withinTolerance(parsed!.printedResult, evaluated)).toBe(true);
  });
});

describe("formatPctForAudit precision tiers (parser-level)", () => {
  // Parsing-only checks: feed crafted formula strings through the parser to
  // pin the precision contract independent of postProcessAnalysis. Mirrors
  // the cases that broke in the Lear export.
  const cases: Array<{ name: string; pct: string; expected: number }> = [
    { name: "5% (whole)", pct: "5%", expected: 0.05 },
    { name: "8% (whole)", pct: "8%", expected: 0.08 },
    { name: "20% (whole)", pct: "20%", expected: 0.2 },
    { name: "0.15% (sub-1%)", pct: "0.15%", expected: 0.0015 },
    { name: "3.25% (fractional)", pct: "3.25%", expected: 0.0325 },
  ];
  for (const c of cases) {
    it(`parses "${c.name}" and round-trips`, () => {
      expect(parsePctToken(c.pct)).toBeCloseTo(c.expected, 10);
    });
  }
});
