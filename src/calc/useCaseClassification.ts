// Use-case classification & class-aware benefit gating (Stage B1).
//
// Replaces the cap-warning band-aid (#2 + #7) with a class contract:
// every use case declares which benefit pillars it can actually move.
// If the LLM emits a revenue uplift on a non-revenue-bearing use case,
// the post-processor REJECTS (zeros) it instead of silently capping.
//
// Until the LLM contract is updated, the explicit `Use Case Class` field
// will not be present. In that case we infer the class heuristically and
// emit advisory warnings only. Once the LLM contract lands, the same code
// path becomes a hard reject — see `gateBenefitsByClass`.

export type UseCaseClass = "revenue_bearing" | "cost_bearing" | "risk_bearing";

export interface ClassInferenceInput {
  useCaseId: string;
  declaredClasses?: UseCaseClass[]; // present once LLM contract is updated
  revenueBenefit: number;
  costBenefit: number;
  riskBenefit: number;
  cashFlowBenefit: number;
}

export interface ClassGateResult {
  finalClasses: UseCaseClass[];
  classesWereDeclared: boolean;
  // Adjusted benefits — zeros applied when a hard reject fires.
  adjusted: {
    revenue: number;
    cost: number;
    risk: number;
    cashFlow: number;
  };
  warnings: Array<{
    code: "CLASS_MISMATCH_REVENUE" | "CLASS_MISMATCH_COST" | "CLASS_MISMATCH_RISK" | "CLASS_INFERRED_NO_DECLARATION";
    severity: "info" | "warning" | "critical";
    message: string;
    recommendedAction: string;
    rejected: boolean; // true when the benefit was zeroed
  }>;
}

const REVENUE_FLOOR = 1; // any positive revenue benefit triggers the gate

export function inferUseCaseClasses(input: ClassInferenceInput): UseCaseClass[] {
  const inferred = new Set<UseCaseClass>();
  if (input.revenueBenefit >= REVENUE_FLOOR) inferred.add("revenue_bearing");
  if (input.costBenefit >= REVENUE_FLOOR) inferred.add("cost_bearing");
  if (input.riskBenefit >= REVENUE_FLOOR) inferred.add("risk_bearing");
  // Cash flow rolls up under cost OR revenue depending on driver — default to cost.
  if (input.cashFlowBenefit >= REVENUE_FLOOR && inferred.size === 0) {
    inferred.add("cost_bearing");
  }
  // Empty fallback: assume cost_bearing (safest — purely operational use case).
  if (inferred.size === 0) inferred.add("cost_bearing");
  return Array.from(inferred);
}

export function gateBenefitsByClass(input: ClassInferenceInput): ClassGateResult {
  const declared = input.declaredClasses && input.declaredClasses.length > 0;
  const finalClasses = declared ? input.declaredClasses! : inferUseCaseClasses(input);

  const result: ClassGateResult = {
    finalClasses,
    classesWereDeclared: !!declared,
    adjusted: {
      revenue: input.revenueBenefit,
      cost: input.costBenefit,
      risk: input.riskBenefit,
      cashFlow: input.cashFlowBenefit,
    },
    warnings: [],
  };

  if (!declared) {
    // Advisory only — no reject — until the LLM contract is updated.
    result.warnings.push({
      code: "CLASS_INFERRED_NO_DECLARATION",
      severity: "info",
      message: `${input.useCaseId}: Use Case Class was not declared by the model. Inferred ${finalClasses.join(" + ")} from emitted benefit pillars; class-aware gating is in advisory mode for this use case.`,
      recommendedAction:
        "Update the AI contract to require an explicit 'Use Case Class' field per use case so revenue claims on non-revenue-bearing use cases can be hard-rejected.",
      rejected: false,
    });
    return result;
  }

  // Hard reject path — only fires when the LLM declared the class explicitly.
  if (input.revenueBenefit >= REVENUE_FLOOR && !finalClasses.includes("revenue_bearing")) {
    result.warnings.push({
      code: "CLASS_MISMATCH_REVENUE",
      severity: "critical",
      message: `${input.useCaseId}: Declared classes ${finalClasses.join(" + ")} do not include revenue_bearing, but the model emitted a revenue benefit. Rejected.`,
      recommendedAction:
        "Either reclassify the use case as revenue_bearing with a defensible uplift mechanism, or remove the revenue benefit and retain only cost / risk pillars.",
      rejected: true,
    });
    result.adjusted.revenue = 0;
  }
  if (input.costBenefit >= REVENUE_FLOOR && !finalClasses.includes("cost_bearing")) {
    result.warnings.push({
      code: "CLASS_MISMATCH_COST",
      severity: "critical",
      message: `${input.useCaseId}: Declared classes ${finalClasses.join(" + ")} do not include cost_bearing, but the model emitted a cost benefit. Rejected.`,
      recommendedAction:
        "Either reclassify the use case as cost_bearing with a defensible cost-take-out mechanism, or remove the cost benefit.",
      rejected: true,
    });
    result.adjusted.cost = 0;
    // Cash flow is downstream of cost — also reject if cost was rejected.
    result.adjusted.cashFlow = 0;
  }
  if (input.riskBenefit >= REVENUE_FLOOR && !finalClasses.includes("risk_bearing")) {
    result.warnings.push({
      code: "CLASS_MISMATCH_RISK",
      severity: "critical",
      message: `${input.useCaseId}: Declared classes ${finalClasses.join(" + ")} do not include risk_bearing, but the model emitted a risk benefit. Rejected.`,
      recommendedAction:
        "Either reclassify the use case as risk_bearing with a defensible loss-avoidance mechanism, or remove the risk benefit.",
      rejected: true,
    });
    result.adjusted.risk = 0;
  }

  return result;
}

// Read declared classes from a Step 5 record. Returns undefined if the field
// is absent (LLM contract not yet updated). Tolerates string / array / CSV.
export function readDeclaredClasses(record: any): UseCaseClass[] | undefined {
  const raw = record?.["Use Case Class"] ?? record?.useCaseClass ?? record?.useCaseClasses;
  if (!raw) return undefined;
  const tokens: string[] = Array.isArray(raw)
    ? raw.map(String)
    : String(raw).split(/[,;|]/);
  const valid: UseCaseClass[] = [];
  for (const t of tokens) {
    const norm = t.trim().toLowerCase().replace(/[\s-]/g, "_");
    if (norm === "revenue_bearing" || norm === "cost_bearing" || norm === "risk_bearing") {
      if (!valid.includes(norm as UseCaseClass)) valid.push(norm as UseCaseClass);
    }
  }
  return valid.length > 0 ? valid : undefined;
}
