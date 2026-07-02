// Aggregate realism gates.
//
// The post-processor previously emitted IRR / NPV / payback / total annual
// value with no plausibility check. CFO-killer numbers (IRR 346%, payback
// under 1 month, total annual value > 5% of revenue from a one-year AI
// program) silently flowed into the executive dashboard. These gates do not
// modify the underlying numbers — they raise structured warnings so the UI
// and downstream reviewers can see "this looks too good to be true" before
// the report reaches a CFO.

export type RealismSeverity = "warn" | "critical";

export interface RealismFlag {
  code:
    | "IRR_IMPLAUSIBLE"
    | "PAYBACK_IMPLAUSIBLE"
    | "VALUE_VS_REVENUE"
    | "VALUE_VS_NET_INCOME";
  severity: RealismSeverity;
  message: string;
  remediation: string;
}

export interface RealismInputs {
  totalAnnualValue: number;
  companyRevenue?: number; // optional — skip revenue ratios if missing
  netIncome?: number;      // optional — skip net-income ratio if missing
  irr: number | null;      // 0.10 = 10%; null = not calculable
  paybackMonths: number;   // -1 sentinel = never; otherwise non-negative
}

export const REALISM_THRESHOLDS = {
  irrWarn: 1.0,         // > 100% IRR → warn
  irrCritical: 3.0,     // > 300% IRR → critical
  paybackWarn: 3,       // < 3 months → warn
  paybackCritical: 1,   // < 1 month → critical
  valueVsRevWarn: 0.02, // > 2% of company revenue → warn
  valueVsRevCrit: 0.05, // > 5% of company revenue → critical
  valueVsNI: 0.20,      // > 20% of net income → warn
} as const;

export function computeRealismFlags(inputs: RealismInputs): RealismFlag[] {
  const flags: RealismFlag[] = [];
  const { totalAnnualValue, companyRevenue, netIncome, irr, paybackMonths } = inputs;
  const T = REALISM_THRESHOLDS;

  if (irr !== null && Number.isFinite(irr)) {
    if (irr > T.irrCritical) {
      flags.push({
        code: "IRR_IMPLAUSIBLE",
        severity: "critical",
        message: `IRR of ${(irr * 100).toFixed(0)}% is implausibly high. A CFO will dismiss the entire model.`,
        remediation:
          "An IRR over 300% almost always indicates underestimated implementation cost or overestimated benefit. Re-examine the cost basis and apply portfolio-level realization haircuts.",
      });
    } else if (irr > T.irrWarn) {
      flags.push({
        code: "IRR_IMPLAUSIBLE",
        severity: "warn",
        message: `IRR of ${(irr * 100).toFixed(0)}% exceeds 100% — verify the implementation cost basis.`,
        remediation:
          "IRR > 100% is rare in enterprise software programs. Confirm the cost basis is fully loaded (people, process, technology, change management).",
      });
    }
  }

  if (paybackMonths >= 0) {
    if (paybackMonths < T.paybackCritical) {
      flags.push({
        code: "PAYBACK_IMPLAUSIBLE",
        severity: "critical",
        message: `Payback under 1 month implies near-zero implementation cost — likely a calculation error.`,
        remediation:
          "Confirm implementation cost includes change management, integration, and ongoing operational overhead, not just licensing or tooling.",
      });
    } else if (paybackMonths < T.paybackWarn) {
      flags.push({
        code: "PAYBACK_IMPLAUSIBLE",
        severity: "warn",
        message: `Payback of ${paybackMonths} months is unusually fast for an enterprise AI program.`,
        remediation:
          "Enterprise AI programs typically pay back in 6-18 months. Verify implementation cost reflects total program cost.",
      });
    }
  }

  if (companyRevenue && companyRevenue > 0) {
    const valuePct = totalAnnualValue / companyRevenue;
    if (valuePct > T.valueVsRevCrit) {
      flags.push({
        code: "VALUE_VS_REVENUE",
        severity: "critical",
        message: `Total annual value is ${(valuePct * 100).toFixed(1)}% of company revenue — exceptional and rarely defensible from a one-year program.`,
        remediation:
          "Look for double-counting between use cases or insufficient probability weighting. Apply a portfolio realization haircut before presenting to a CFO.",
      });
    } else if (valuePct > T.valueVsRevWarn) {
      flags.push({
        code: "VALUE_VS_REVENUE",
        severity: "warn",
        message: `Total annual value is ${(valuePct * 100).toFixed(1)}% of company revenue. Values above 2% in year one warrant scrutiny.`,
        remediation:
          "Confirm probability weighting and data-maturity haircuts are applied consistently per use case.",
      });
    }
  }

  if (netIncome && netIncome > 0) {
    const valueVsNI = totalAnnualValue / netIncome;
    if (valueVsNI > T.valueVsNI) {
      flags.push({
        code: "VALUE_VS_NET_INCOME",
        severity: "warn",
        message: `Total annual value is ${(valueVsNI * 100).toFixed(0)}% of net income — verify benefits are incremental, not recapturing existing margin.`,
        remediation:
          "Cross-check against margin expansion guidance the company has publicly issued.",
      });
    }
  }

  return flags;
}
