// Risk source-of-truth (Stage B2).
//
// Each risk benefit must declare:
//   - lossCategory ∈ {markdown, stockout, working_capital, fines,
//                     churn, fraud, security_breach}
//   - kpiAnchorId    referencing a Step-2 KPI ID
//
// Until the LLM contract is updated, anchors will be missing on every record;
// in that case we emit advisory warnings. Once the contract lands, missing
// anchors become a hard reject (riskBenefit → 0).

export const VALID_LOSS_CATEGORIES = [
  "markdown",
  "stockout",
  "working_capital",
  "fines",
  "churn",
  "fraud",
  "security_breach",
] as const;
export type LossCategory = (typeof VALID_LOSS_CATEGORIES)[number];

export interface RiskAnchorInput {
  useCaseId: string;
  riskBenefit: number;
  lossCategory?: string | null;
  kpiAnchorId?: string | null;
  step2KpiIds: Set<string>; // canonical set of KPI IDs from Step 2
  // When true, missing anchors are HARD-rejected (used once LLM contract ships).
  hardReject?: boolean;
}

export interface RiskAnchorResult {
  adjustedRiskBenefit: number;
  warnings: Array<{
    code: "RISK_NOT_ANCHORED" | "RISK_BAD_LOSS_CATEGORY" | "RISK_KPI_NOT_FOUND";
    severity: "info" | "warning" | "critical";
    message: string;
    recommendedAction: string;
    rejected: boolean;
  }>;
}

export function validateRiskAnchoring(input: RiskAnchorInput): RiskAnchorResult {
  const out: RiskAnchorResult = {
    adjustedRiskBenefit: input.riskBenefit,
    warnings: [],
  };
  if (input.riskBenefit <= 0) return out; // nothing to anchor

  const hard = !!input.hardReject;
  const missingCategory = !input.lossCategory;
  const missingAnchor = !input.kpiAnchorId;

  if (missingCategory || missingAnchor) {
    out.warnings.push({
      code: "RISK_NOT_ANCHORED",
      severity: hard ? "critical" : "warning",
      message: `${input.useCaseId}: risk benefit lacks ${missingCategory ? "lossCategory" : ""}${missingCategory && missingAnchor ? " and " : ""}${missingAnchor ? "kpiAnchorId" : ""}.${hard ? " Rejected." : " Advisory only — update the AI contract to require both fields."}`,
      recommendedAction:
        "Each risk pillar must cite both a lossCategory (markdown / stockout / working_capital / fines / churn / fraud / security_breach) and a Step-2 KPI ID so reviewers can trace the exposure.",
      rejected: hard,
    });
    if (hard) {
      out.adjustedRiskBenefit = 0;
      return out;
    }
  }

  if (
    input.lossCategory &&
    !VALID_LOSS_CATEGORIES.includes(input.lossCategory.trim().toLowerCase() as LossCategory)
  ) {
    out.warnings.push({
      code: "RISK_BAD_LOSS_CATEGORY",
      severity: hard ? "critical" : "warning",
      message: `${input.useCaseId}: lossCategory "${input.lossCategory}" is not in the canonical taxonomy.`,
      recommendedAction: `Use one of: ${VALID_LOSS_CATEGORIES.join(", ")}.`,
      rejected: hard,
    });
    if (hard) {
      out.adjustedRiskBenefit = 0;
      return out;
    }
  }

  // Normalize KPI IDs (trim + lowercase) on both sides to avoid false
  // RISK_KPI_NOT_FOUND warnings from formatting variance.
  const normaliseKpi = (s: string) => s.trim().toLowerCase();
  const normalisedStep2 = new Set(
    Array.from(input.step2KpiIds).map(normaliseKpi),
  );
  if (input.kpiAnchorId && !normalisedStep2.has(normaliseKpi(input.kpiAnchorId))) {
    out.warnings.push({
      code: "RISK_KPI_NOT_FOUND",
      severity: hard ? "critical" : "warning",
      message: `${input.useCaseId}: kpiAnchorId "${input.kpiAnchorId}" does not match any Step-2 KPI.`,
      recommendedAction:
        "Ensure the kpiAnchorId references a KPI emitted in Step 2 of the same analysis.",
      rejected: hard,
    });
    if (hard) {
      out.adjustedRiskBenefit = 0;
    }
  }

  return out;
}

// Read anchor fields from a Step 5 record (LLM-supplied or label-derived).
export function readRiskAnchorFromRecord(record: any): {
  lossCategory?: string;
  kpiAnchorId?: string;
} {
  const labels = record?.["Risk Formula Labels"] || {};
  const lossCategory =
    record?.["Loss Category"] ?? record?.lossCategory ?? labels?.lossCategory;
  const kpiAnchorId =
    record?.["KPI Anchor ID"] ?? record?.kpiAnchorId ?? labels?.kpiAnchorId;
  return {
    lossCategory: lossCategory ? String(lossCategory) : undefined,
    kpiAnchorId: kpiAnchorId ? String(kpiAnchorId) : undefined,
  };
}
