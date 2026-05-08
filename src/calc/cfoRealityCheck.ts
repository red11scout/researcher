/**
 * CFO Reality Check — Independent verification layer (Task #107 follow-up).
 *
 * This module is a deliberately INDEPENDENT believability check that runs
 * AFTER the canonical post-processor has finished all of its calculation,
 * cap, and prorate logic. It does not share assumptions with the calculation
 * engine; instead, it asks one CFO-grade question per scenario:
 *
 *   "If I showed this number to a CFO of a public-company-scale enterprise,
 *    would they believe it could be delivered in year one?"
 *
 * The check is informed by published benchmarks of year-one enterprise AI
 * program returns (McKinsey, BCG, Gartner, MIT Sloan):
 *
 *   - Conservative (high-confidence floor): ~0.25% of revenue
 *   - Moderate / realistic mid-case:        ~0.75% of revenue
 *   - Aggressive / stretch ceiling:         ~1.50% of revenue
 *
 * Plus pillar-mix sanity bands (% of total annual value):
 *   - Cost ≤ 55%   (labor productivity is the dominant year-1 lever)
 *   - Revenue ≤ 45%
 *   - Cash flow ≤ 25% (working-capital releases shouldn't dominate a
 *                       multi-driver AI portfolio)
 *   - Risk ≤ 20%   (loss-avoidance is hard to bank)
 *
 * Plus a per-use-case ceiling so no single UC eats the headline:
 *   - Per-UC ≤ 0.4% of revenue
 *
 * The module is PURE — given the same inputs it always returns the same
 * verdict — and exports its thresholds as named constants so the gates are
 * inspectable, testable, and adjustable from one place.
 */

export const CFO_REALITY_THRESHOLDS = {
  scenarioShareOfRevenue: {
    conservative: 0.0025, // 0.25%
    moderate:     0.0075, // 0.75%
    aggressive:   0.0150, // 1.50%
  },
  pillarShareOfTotal: {
    cost:     0.55,
    revenue:  0.45,
    cashFlow: 0.25,
    risk:     0.20,
  },
  perUseCaseShareOfRevenue: 0.004, // 0.4% — no single UC eats the headline
} as const;

export type RealityVerdict = "BELIEVABLE" | "STRETCH" | "IMPLAUSIBLE";

export interface CfoRealityFinding {
  code: string;
  scope: "scenario" | "pillar" | "useCase";
  scenario?: "conservative" | "moderate" | "aggressive";
  pillar?: "cost" | "revenue" | "cashFlow" | "risk";
  useCaseId?: string;
  observed: number; // observed share (0-1) or dollars
  threshold: number;
  verdict: RealityVerdict;
  message: string;
  recommendedAction: string;
}

export interface CfoRealityCheckInput {
  totalAnnualValue: number;
  totalCostBenefit: number;
  totalRevenueBenefit: number;
  totalCashFlowBenefit: number;
  totalRiskBenefit: number;
  companyAnnualRevenue: number;
  scenarios: {
    conservative: number; // first-year benefit dollars
    moderate: number;
    aggressive: number;
  };
  perUseCase: Array<{ id: string; totalAnnualValue: number }>;
}

export interface CfoRealityCheckResult {
  overall: RealityVerdict;
  findings: CfoRealityFinding[];
  recommendedScale: number; // 1.0 if no scaling needed; <1 to land moderate at the believable midline
  scenarioVerdicts: Record<"conservative" | "moderate" | "aggressive", RealityVerdict>;
  thresholdsUsed: typeof CFO_REALITY_THRESHOLDS;
}

function classify(observed: number, threshold: number): RealityVerdict {
  // BELIEVABLE: ≤ threshold; STRETCH: ≤ 1.5× threshold; IMPLAUSIBLE: > 1.5×
  if (observed <= threshold) return "BELIEVABLE";
  if (observed <= threshold * 1.5) return "STRETCH";
  return "IMPLAUSIBLE";
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

const verdictRank: Record<RealityVerdict, number> = {
  BELIEVABLE: 0,
  STRETCH: 1,
  IMPLAUSIBLE: 2,
};

function worse(a: RealityVerdict, b: RealityVerdict): RealityVerdict {
  return verdictRank[b] > verdictRank[a] ? b : a;
}

export function runCfoRealityCheck(input: CfoRealityCheckInput): CfoRealityCheckResult {
  const findings: CfoRealityFinding[] = [];
  let overall: RealityVerdict = "BELIEVABLE";
  const scenarioVerdicts: Record<"conservative" | "moderate" | "aggressive", RealityVerdict> = {
    conservative: "BELIEVABLE",
    moderate: "BELIEVABLE",
    aggressive: "BELIEVABLE",
  };
  let recommendedScale = 1.0;

  const rev = input.companyAnnualRevenue;

  // 1) Scenario share-of-revenue checks (only when revenue is known).
  if (rev > 0) {
    for (const scenario of ["conservative", "moderate", "aggressive"] as const) {
      const dollars = input.scenarios[scenario];
      const share = dollars / rev;
      const threshold = CFO_REALITY_THRESHOLDS.scenarioShareOfRevenue[scenario];
      const verdict = classify(share, threshold);
      scenarioVerdicts[scenario] = verdict;
      overall = worse(overall, verdict);
      if (verdict !== "BELIEVABLE") {
        findings.push({
          code: `CFO_REALITY_${scenario.toUpperCase()}`,
          scope: "scenario",
          scenario,
          observed: share,
          threshold,
          verdict,
          message:
            `${scenario[0].toUpperCase() + scenario.slice(1)} scenario at ` +
            `${fmtMoney(dollars)} = ${fmtPct(share)} of revenue (${fmtMoney(rev)}); ` +
            `CFO believability ceiling for this scenario is ${fmtPct(threshold)}. Verdict: ${verdict}.`,
          recommendedAction:
            verdict === "IMPLAUSIBLE"
              ? `Rebase ${scenario} scenario to ≤ ${fmtMoney(rev * threshold)} (${fmtPct(threshold)} of revenue). ` +
                `At this magnitude the executive will dismiss the report on slide 1.`
              : `Add explicit CFO talking points justifying ${scenario} above ${fmtPct(threshold)} of revenue ` +
                `— industry benchmark, comparable program, or signed implementation contract.`,
        });
      }
    }

    // Recommended scale targets the moderate scenario at exactly its
    // believability midline so the canonical totals re-normalize around a
    // CFO-defensible center. Only suggested when moderate is IMPLAUSIBLE.
    if (scenarioVerdicts.moderate === "IMPLAUSIBLE") {
      const moderateTarget = rev * CFO_REALITY_THRESHOLDS.scenarioShareOfRevenue.moderate;
      if (input.scenarios.moderate > 0) {
        recommendedScale = Math.max(
          0,
          Math.min(1, moderateTarget / input.scenarios.moderate),
        );
      }
    }
  }

  // 2) Pillar-mix checks (always, against total annual value).
  const total = input.totalAnnualValue;
  if (total > 0) {
    const pillars: Array<{
      pillar: "cost" | "revenue" | "cashFlow" | "risk";
      value: number;
    }> = [
      { pillar: "cost", value: input.totalCostBenefit },
      { pillar: "revenue", value: input.totalRevenueBenefit },
      { pillar: "cashFlow", value: input.totalCashFlowBenefit },
      { pillar: "risk", value: input.totalRiskBenefit },
    ];
    for (const { pillar, value } of pillars) {
      const share = value / total;
      const threshold = CFO_REALITY_THRESHOLDS.pillarShareOfTotal[pillar];
      const verdict = classify(share, threshold);
      overall = worse(overall, verdict);
      if (verdict !== "BELIEVABLE") {
        findings.push({
          code: `CFO_REALITY_PILLAR_${pillar.toUpperCase()}`,
          scope: "pillar",
          pillar,
          observed: share,
          threshold,
          verdict,
          message:
            `${pillar} pillar is ${fmtPct(share)} of total annual value (${fmtMoney(value)} of ` +
            `${fmtMoney(total)}); CFO believability ceiling for this pillar is ${fmtPct(threshold)}. Verdict: ${verdict}.`,
          recommendedAction:
            pillar === "cashFlow"
              ? "Cash-flow concentrations above 25% of total value typically indicate the same working-capital pool is being counted across multiple use cases. Audit each cash-flow UC for distinct DSO/DPO/inventory denominators."
              : `Re-balance the ${pillar} pillar against the other three benefit drivers — single-pillar dominance is a CFO red flag.`,
        });
      }
    }
  }

  // 3) Per-UC ceiling check (only when revenue is known).
  if (rev > 0) {
    const perUCThreshold = CFO_REALITY_THRESHOLDS.perUseCaseShareOfRevenue;
    for (const uc of input.perUseCase) {
      const share = uc.totalAnnualValue / rev;
      const verdict = classify(share, perUCThreshold);
      if (verdict !== "BELIEVABLE") {
        overall = worse(overall, verdict);
        findings.push({
          code: "CFO_REALITY_PER_UC",
          scope: "useCase",
          useCaseId: uc.id,
          observed: share,
          threshold: perUCThreshold,
          verdict,
          message:
            `${uc.id} alone is ${fmtMoney(uc.totalAnnualValue)} = ${fmtPct(share)} of revenue; ` +
            `single-UC believability ceiling is ${fmtPct(perUCThreshold)}. Verdict: ${verdict}.`,
          recommendedAction:
            "Single use cases that exceed 0.4% of revenue almost always require their own business case and steering committee. Either split the UC into stages with phased benefits, or document why the magnitude is defensible.",
        });
      }
    }
  }

  return {
    overall,
    findings,
    recommendedScale,
    scenarioVerdicts,
    thresholdsUsed: CFO_REALITY_THRESHOLDS,
  };
}
