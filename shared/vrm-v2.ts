// shared/vrm-v2.ts
// Value-Readiness Matrix v2.1 — Single source of truth for the upgraded methodology.
// All weights, sector presets, sub-components, rubric anchors, and quadrant logic
// live here so that the calculation engine, AI prompts, dashboard mapper,
// matrix chart, and HTML report generators stay in lock-step.
//
// v2.1 corrective release adds: log-transformed value normalization, dual
// (normalized + absolute) value floor, hard/soft floor distinction, broader
// Layer-3 activation, dynamic Conditional-Champion sprint sizing, and a
// portfolio diagnostic with structured warnings.

export const VRM_SCHEMA_VERSION = "2.2";
export const VRM_RUBRIC_VERSION = "2.0";
// Earlier wire formats we still need to round-trip for backward-compatible consumers.
export const VRM_PRIOR_SCHEMA_VERSION = "2.0";
export const VRM_PRIOR_SCHEMA_VERSION_V21 = "2.1";

// ---------------------------------------------------------------------------
// SECTOR PRESETS — top-level component weights per engagement
// ---------------------------------------------------------------------------
export type SectorPreset =
  | "baseline"
  | "regulated"
  | "heavy_regulated"
  | "internal_productivity"
  | "rag_finetune_heavy";

export interface ComponentWeights {
  orgCapacity: number;        // Organizational Capacity
  dataReadiness: number;      // Data Availability & Quality
  governance: number;         // AI-Specific Governance
  techInfrastructure: number; // Technical Infrastructure
}

export const BASELINE_WEIGHTS: ComponentWeights = {
  orgCapacity: 0.35,
  dataReadiness: 0.30,
  governance: 0.20,
  techInfrastructure: 0.15,
};

export const SECTOR_PRESETS: Record<SectorPreset, {
  label: string;
  description: string;
  weights: ComponentWeights;
}> = {
  baseline: {
    label: "Baseline",
    description: "Default weighting for most engagements.",
    weights: { orgCapacity: 0.35, dataReadiness: 0.30, governance: 0.20, techInfrastructure: 0.15 },
  },
  regulated: {
    label: "Regulated",
    description: "Financial services, healthcare, public sector, employment, critical infrastructure.",
    weights: { orgCapacity: 0.35, dataReadiness: 0.30, governance: 0.25, techInfrastructure: 0.10 },
  },
  heavy_regulated: {
    label: "Heavy-Regulated",
    description: "Pharma, defense, EU AI Act high-risk systems.",
    weights: { orgCapacity: 0.35, dataReadiness: 0.30, governance: 0.30, techInfrastructure: 0.05 },
  },
  internal_productivity: {
    label: "Internal Productivity",
    description: "Creative work, internal copilots, low-stakes automation.",
    weights: { orgCapacity: 0.40, dataReadiness: 0.25, governance: 0.15, techInfrastructure: 0.20 },
  },
  rag_finetune_heavy: {
    label: "RAG / Fine-tune Heavy",
    description: "Knowledge management, document Q&A, fine-tuned models.",
    weights: { orgCapacity: 0.30, dataReadiness: 0.35, governance: 0.20, techInfrastructure: 0.15 },
  },
};

export function getWeightsForPreset(preset: SectorPreset | undefined | null): ComponentWeights {
  if (!preset || !(preset in SECTOR_PRESETS)) return BASELINE_WEIGHTS;
  return SECTOR_PRESETS[preset].weights;
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS — diagnostic granularity, expressed as absolute weights of total
// They sum to the parent's BASELINE weight. When a non-baseline preset is in
// play, sub-weights are recomputed proportionally.
// ---------------------------------------------------------------------------
export const SUB_COMPONENT_WEIGHTS = {
  orgCapacity: {
    sponsorship: 0.15,
    talent: 0.10,
    changeManagement: 0.10,
  },
  dataReadiness: {
    quality: 0.12,
    accessibility: 0.10,
    governance: 0.08,
  },
  governance: {
    regulatory: 0.10,
    modelRisk: 0.06,
    responsibleAI: 0.04,
  },
  techInfrastructure: {
    mlops: 0.07,
    cloud: 0.05,
    security: 0.03,
  },
} as const;

export const SUB_COMPONENT_LABELS = {
  orgCapacity: {
    sponsorship: "Executive sponsorship & strategy",
    talent: "Talent & skills",
    changeManagement: "Change management & workflow redesign",
  },
  dataReadiness: {
    quality: "Data quality",
    accessibility: "Accessibility & integration",
    governance: "Governance, lineage, labeling",
  },
  governance: {
    regulatory: "Regulatory compliance",
    modelRisk: "Model risk management",
    responsibleAI: "Responsible AI (bias, explainability, oversight)",
  },
  techInfrastructure: {
    mlops: "MLOps & deployment",
    cloud: "Cloud / compute & integration",
    security: "Security & observability",
  },
} as const;

export type ComponentKey = keyof typeof SUB_COMPONENT_WEIGHTS;
export type SubComponentScores = {
  [K in ComponentKey]?: { [S in keyof typeof SUB_COMPONENT_WEIGHTS[K]]?: number };
};

// Recompute sub-weights so they sum to a non-baseline preset's parent weight.
// Returns the same shape as SUB_COMPONENT_WEIGHTS but scaled.
export function getAdjustedSubWeights(preset: SectorPreset): typeof SUB_COMPONENT_WEIGHTS {
  const adjusted = getWeightsForPreset(preset);
  const out: any = {};
  (Object.keys(SUB_COMPONENT_WEIGHTS) as ComponentKey[]).forEach((parent) => {
    const parentBaseline = BASELINE_WEIGHTS[parent];
    const parentAdjusted = adjusted[parent];
    const factor = parentBaseline === 0 ? 0 : parentAdjusted / parentBaseline;
    const subs: any = {};
    Object.entries(SUB_COMPONENT_WEIGHTS[parent]).forEach(([sub, w]) => {
      subs[sub] = w * factor;
    });
    out[parent] = subs;
  });
  return out;
}

// ---------------------------------------------------------------------------
// READINESS SCORING — weighted composite using the active preset's weights
// ---------------------------------------------------------------------------
export interface ReadinessComponentScores {
  orgCapacity: number;
  dataReadiness: number;
  governance: number;
  techInfrastructure: number;
}

export function computeWeightedReadiness(
  scores: ReadinessComponentScores,
  preset: SectorPreset = "baseline",
): number {
  const w = getWeightsForPreset(preset);
  const raw =
    scores.orgCapacity * w.orgCapacity +
    scores.dataReadiness * w.dataReadiness +
    scores.governance * w.governance +
    scores.techInfrastructure * w.techInfrastructure;
  return Math.round(raw * 10) / 10; // round to 1 decimal
}

// Compute a parent component score from sub-component scores (1-10).
// Returns parent score on 1-10 scale.
export function computeComponentFromSubs(
  parent: ComponentKey,
  subs: { [k: string]: number } | undefined,
  preset: SectorPreset = "baseline",
): number | null {
  if (!subs || Object.keys(subs).length === 0) return null;
  const adjusted = getAdjustedSubWeights(preset);
  const parentSubs = adjusted[parent] as Record<string, number>;
  const parentBase = BASELINE_WEIGHTS[parent];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [sub, weight] of Object.entries(parentSubs)) {
    const score = subs[sub];
    if (typeof score !== "number" || isNaN(score)) continue;
    // Scale weight up to a fraction of the parent so sum-of-subs = parent score
    const subShare = weight / parentBase;
    weightedSum += score * subShare;
    weightTotal += subShare;
  }
  if (weightTotal === 0) return null;
  return Math.round((weightedSum / weightTotal) * 10) / 10;
}

// ---------------------------------------------------------------------------
// QUADRANT METHODOLOGY — three-layer hybrid
// ---------------------------------------------------------------------------
export type Quadrant =
  | "champion"
  | "conditional_champion"
  | "strategic"
  | "quick_win"
  | "foundation";

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  champion: "Champion",
  conditional_champion: "Conditional Champion",
  strategic: "Strategic",
  quick_win: "Quick Win",
  foundation: "Foundation",
};

export interface KnockOutCriteria {
  hasNamedSponsor: boolean | null;
  dataAvailableForEngagement: boolean | null;
  timeToPilotWeeks: number | null;
}

export interface UseCaseScoring {
  id: string;
  valueScore: number;
  readinessScore: number;
  componentScores: ReadinessComponentScores;
  hasNamedSponsor: boolean | null;
  dataAvailableForEngagement: boolean | null;
  timeToPilotWeeks: number | null;
  createdAt?: string;
}

export interface QuadrantAssignment {
  quadrant: Quadrant;
  layer: 1 | 2 | 3;
  rationale: string;
  floorFailureReasons?: string[];
  conditionalChampionMeta?: {
    gaps: Array<{ component: string; current: number; required: number }>;
    proposedSprintWeeks: number;
    reclassificationCriteria: string;
  };
  wave?: "Wave 1" | "Wave 2";
}

const FLOOR_VALUE = 6.0;
const CHAMPION_THRESHOLD = 7.5;
const QUICK_STRATEGIC_THRESHOLD = 6.0;
const MAX_TIME_TO_PILOT_WEEKS = 12;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function passesFloor(uc: UseCaseScoring): boolean {
  return getFloorFailures(uc).length === 0;
}

export function getFloorFailures(uc: UseCaseScoring): string[] {
  const reasons: string[] = [];
  if (round1(uc.valueScore) < FLOOR_VALUE) {
    reasons.push(`Value Score ${round1(uc.valueScore)} below floor ${FLOOR_VALUE}`);
  }
  if (uc.dataAvailableForEngagement === false || uc.dataAvailableForEngagement === null) {
    reasons.push(uc.dataAvailableForEngagement === null
      ? "Data availability unconfirmed"
      : "Data not available within engagement timeline");
  }
  if (uc.hasNamedSponsor === false || uc.hasNamedSponsor === null) {
    reasons.push(uc.hasNamedSponsor === null ? "No named business sponsor confirmed" : "No named business sponsor");
  }
  if (uc.timeToPilotWeeks === null) {
    reasons.push("Time-to-pilot unconfirmed");
  } else if (uc.timeToPilotWeeks > MAX_TIME_TO_PILOT_WEEKS) {
    reasons.push(`Time-to-pilot ${uc.timeToPilotWeeks} weeks exceeds ${MAX_TIME_TO_PILOT_WEEKS}-week ceiling`);
  }
  return reasons;
}

export function compositeScore(uc: UseCaseScoring): number {
  return round1(0.5 * uc.valueScore + 0.5 * uc.readinessScore);
}

function buildGapMeta(uc: UseCaseScoring): NonNullable<QuadrantAssignment["conditionalChampionMeta"]> {
  const gaps: Array<{ component: string; current: number; required: number }> = [];
  const componentLabels: Record<keyof ReadinessComponentScores, string> = {
    orgCapacity: "Organizational Capacity",
    dataReadiness: "Data Availability & Quality",
    governance: "AI-Specific Governance",
    techInfrastructure: "Technical Infrastructure",
  };
  const required = 7;
  (Object.keys(componentLabels) as Array<keyof ReadinessComponentScores>).forEach((k) => {
    const current = uc.componentScores[k];
    if (typeof current === "number" && current < required) {
      gaps.push({ component: componentLabels[k], current: round1(current), required });
    }
  });
  // Always include at least the lowest component if no gaps qualified
  if (gaps.length === 0) {
    let lowestKey: keyof ReadinessComponentScores = "orgCapacity";
    let lowest = Infinity;
    (Object.keys(componentLabels) as Array<keyof ReadinessComponentScores>).forEach((k) => {
      if (uc.componentScores[k] < lowest) { lowest = uc.componentScores[k]; lowestKey = k; }
    });
    gaps.push({ component: componentLabels[lowestKey], current: round1(lowest), required });
  }

  const reclass = `Promote to unconditional Champion when ${gaps.map(g => `${g.component} reaches ${g.required}.0+`).join(" and ")}.`;

  return {
    gaps,
    proposedSprintWeeks: 5,
    reclassificationCriteria: reclass,
  };
}

export function assignQuadrant(
  uc: UseCaseScoring,
  portfolio: UseCaseScoring[],
): QuadrantAssignment {
  // Layer 1 — hard floors
  const floorReasons = getFloorFailures(uc);
  if (floorReasons.length > 0) {
    return {
      quadrant: "foundation",
      layer: 1,
      rationale: `Failed Layer 1 floor: ${floorReasons.join("; ")}`,
      floorFailureReasons: floorReasons,
    };
  }

  const v = round1(uc.valueScore);
  const r = round1(uc.readinessScore);

  // Layer 2 — default absolute quadrants
  if (v >= CHAMPION_THRESHOLD && r >= CHAMPION_THRESHOLD) {
    return { quadrant: "champion", layer: 2, rationale: `Value ${v} and Readiness ${r} both meet Champion threshold (≥${CHAMPION_THRESHOLD}).` };
  }
  if (v >= CHAMPION_THRESHOLD && r >= QUICK_STRATEGIC_THRESHOLD) {
    return { quadrant: "strategic", layer: 2, rationale: `Value ${v} ≥ ${CHAMPION_THRESHOLD} but Readiness ${r} below Champion threshold; classified Strategic.` };
  }
  if (v >= QUICK_STRATEGIC_THRESHOLD && r >= CHAMPION_THRESHOLD) {
    return { quadrant: "quick_win", layer: 2, rationale: `Readiness ${r} ≥ ${CHAMPION_THRESHOLD} with moderate Value ${v}; classified Quick Win.` };
  }

  const layer2Foundation: QuadrantAssignment = {
    quadrant: "foundation",
    layer: 2,
    rationale: `Above floor but below Champion / Strategic / Quick Win thresholds (Value ${v}, Readiness ${r}).`,
  };

  // Layer 3 — Conditional Champion promotion (only on weak portfolios)
  const portfolioHasChampions = portfolio.some(p => {
    if (!passesFloor(p)) return false;
    const pv = round1(p.valueScore);
    const pr = round1(p.readinessScore);
    return pv >= CHAMPION_THRESHOLD && pr >= CHAMPION_THRESHOLD;
  });
  const portfolioHasQuickWins = portfolio.some(p => {
    if (!passesFloor(p)) return false;
    const pv = round1(p.valueScore);
    const pr = round1(p.readinessScore);
    return pv >= QUICK_STRATEGIC_THRESHOLD && pv < CHAMPION_THRESHOLD && pr >= CHAMPION_THRESHOLD;
  });

  if (portfolioHasChampions || portfolioHasQuickWins) {
    return layer2Foundation;
  }

  const eligible = portfolio.filter(passesFloor);
  if (eligible.length === 0) return layer2Foundation;

  const ranked = [...eligible].sort((a, b) => {
    const ca = compositeScore(a);
    const cb = compositeScore(b);
    if (cb !== ca) return cb - ca;
    if (round1(b.valueScore) !== round1(a.valueScore)) return round1(b.valueScore) - round1(a.valueScore);
    if (round1(b.readinessScore) !== round1(a.readinessScore)) return round1(b.readinessScore) - round1(a.readinessScore);
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  const promoteCount = Math.min(2, ranked.length);
  const promotedIds = new Set(ranked.slice(0, promoteCount).map(p => p.id));

  if (promotedIds.has(uc.id)) {
    return {
      quadrant: "conditional_champion",
      layer: 3,
      rationale: "Top composite score in a weak portfolio; promoted with named readiness gaps.",
      conditionalChampionMeta: buildGapMeta(uc),
    };
  }

  return layer2Foundation;
}

// Run quadrant assignment across an entire portfolio. Returns ID -> assignment.
// Also tags Champions with Wave 1 / Wave 2 labels (top 30% = Wave 1).
export function assignPortfolioQuadrants(
  portfolio: UseCaseScoring[],
): Map<string, QuadrantAssignment> {
  const result = new Map<string, QuadrantAssignment>();
  for (const uc of portfolio) {
    result.set(uc.id, assignQuadrant(uc, portfolio));
  }
  // Wave assignment for Layer 2 Champions
  const champions = portfolio
    .filter(uc => result.get(uc.id)?.quadrant === "champion")
    .sort((a, b) => compositeScore(b) - compositeScore(a));
  if (champions.length >= 2) {
    const cutoff = Math.max(1, Math.ceil(champions.length * 0.3));
    champions.forEach((uc, idx) => {
      const a = result.get(uc.id);
      if (a) a.wave = idx < cutoff ? "Wave 1" : "Wave 2";
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// BARS RUBRIC — Behaviorally Anchored Rating Scale
// ---------------------------------------------------------------------------
export type RubricLevel = 1 | 3 | 5 | 7 | 10;

export interface RubricAnchor {
  level: RubricLevel;
  label: string;
  description: string;
}

export interface ComponentRubric {
  componentId: ComponentKey;
  componentName: string;
  anchors: RubricAnchor[];
  threeVsSixGuidance: string;
}

export const COMPONENT_NAMES: Record<ComponentKey, string> = {
  orgCapacity: "Organizational Capacity",
  dataReadiness: "Data Availability & Quality",
  governance: "AI-Specific Governance",
  techInfrastructure: "Technical Infrastructure",
};

export const RUBRIC: Record<ComponentKey, ComponentRubric> = {
  orgCapacity: {
    componentId: "orgCapacity",
    componentName: COMPONENT_NAMES.orgCapacity,
    threeVsSixGuidance:
      "At 3 there is talent in pockets and verbal sponsorship. At 6 there is a named C-level AI owner, an approved multi-year strategy with budget, a staffed CoE, and enterprise-licensed training in active use. The line is between project and function.",
    anchors: [
      { level: 1, label: "AI-naive", description: "No AI strategy. No executive sponsor. No AI budget line. Staff use consumer ChatGPT on personal accounts. Zero or one isolated data scientist in a non-AI function." },
      { level: 3, label: "Pilot-driven, hero mode", description: "One or two business units fund their own pilots. A small data science team of three to ten sits under analytics or IT. Executive interest is verbal. No board-approved AI strategy. Brown-bags exist; structured training reaches under 10% of relevant staff. No Center of Excellence. Talent is recruited ad hoc." },
      { level: 5, label: "Programmed but federated", description: "A named C-level AI sponsor owns a multi-year strategy approved at ExCo with a dedicated budget. A formal AI/ML CoE is staffed at 20–50 FTE. An enterprise learning license is in active use; at least 30% of relevant technical staff have completed role-based AI training. Basic AI literacy has rolled out to all employees." },
      { level: 7, label: "Embedded and scaling", description: "AI strategy is integrated into enterprise strategy and reviewed quarterly with the Board. Embedded ML and AI engineers report into product teams. The CoE has shifted from delivery to platform mode. Defined career ladders exist for data scientists, ML engineers, MLOps engineers, AI PMs, and AI engineers. ML engineer to data scientist ratio ≥ 1:1." },
      { level: 10, label: "AI-native operating model", description: "Cross-functional pods include AI/ML talent by default. Compensation and hiring frameworks assess AI-augmented productivity. The org is a net importer of senior AI talent and publishes externally. New product launches presume AI; no-AI requires justification." },
    ],
  },
  dataReadiness: {
    componentId: "dataReadiness",
    componentName: COMPONENT_NAMES.dataReadiness,
    threeVsSixGuidance:
      "At 3 there is a centralized warehouse with pilot-grade RAG. At 6 there are named data product owners, monitored DQ SLAs on Tier-1 data, enforced data contracts on at least one critical pipeline, RBAC with PII classification, and a standardized embedding-and-chunking pipeline with measured retrieval quality.",
    anchors: [
      { level: 1, label: "Siloed and opaque", description: "Data lives in disconnected ERP, CRM, file shares, spreadsheets. No catalog. No lineage. Quality is unmeasured. No labeled training data. Unstructured documents are unindexed for semantic retrieval." },
      { level: 3, label: "Centralized but raw", description: "A lakehouse or warehouse exists and ingests most structured sources. A catalog is deployed but coverage is under 50%. Lineage is partial. Quality monitoring runs on a few critical tables. RAG experiments use a single vector store with naive fixed-size chunking; retrieval accuracy is unmeasured." },
      { level: 5, label: "Governed and domain-owned", description: "Data is organized by domain with named data product owners. ≥70% of high-value tables carry business-readable metadata, certified ownership, and lineage. DQ SLAs are continuously monitored on Tier-1 datasets with paged alerts. Data contracts govern at least one critical interface. PII classification and RBAC with column or row-level controls are enforced. RAG infrastructure is standardized." },
      { level: 7, label: "Mesh-mature and RAG-industrialized", description: "Federated data mesh with self-service data products, contracts on every cross-domain interface, an enterprise feature store powering ≥3 production ML systems with point-in-time correctness. Embeddings flow through a versioned pipeline with measured retrieval quality. Multimodal data is supported. Synthetic data and human-in-the-loop labeling are in place." },
      { level: 10, label: "AI-optimized data platform", description: "Production observability spans structured + unstructured data, embeddings, and prompt traces. Drift detection runs on input distributions and embedding spaces. End-to-end lineage from input to feature to model to output to user feedback. PETs (DP, federated learning, prompt tokenization) are productionized." },
    ],
  },
  techInfrastructure: {
    componentId: "techInfrastructure",
    componentName: COMPONENT_NAMES.techInfrastructure,
    threeVsSixGuidance:
      "At 3 there is a managed ML platform and a model deployed manually. At 6 there is a centrally enforced model registry with promotion gates, automated CI/CD for models, a feature store powering at least one production model, drift monitoring with alerts, a centralized AI gateway, and LLMOps tracing on at least one GenAI app.",
    anchors: [
      { level: 1, label: "Notebook on a laptop", description: "Models built in personal Jupyter. No experiment tracking. No GPU access except via personal cloud. No model registry. Deployment is a pickled file emailed to engineering. Personal OpenAI keys. No vector DB. No monitoring." },
      { level: 3, label: "Pilot stack, manual glue", description: "An experiment tracker is in use (MLflow, W&B, Neptune). A managed ML platform is provisioned. At least one foundation model API is procured with central billing. One or two models in production deployed manually. CI for code; no CD for models. A vector DB exists for one RAG pilot." },
      { level: 5, label: "Standardized MLOps", description: "Model registry is the single source of truth with promotion gates. CI/CD pipelines automate training, validation, deployment; canary or shadow deployments are supported. A feature store serves ≥1 production model. Drift detection runs continuously with paged alerts. FM usage is centralized through an AI gateway." },
      { level: 7, label: "Production-grade MLOps and LLMOps", description: "Continuous training; champion-challenger in production. Multi-region deployment with blue/green and traffic mirroring. Inference meets latency/cost SLOs. FMs fine-tuned in production with monitoring. Eval pipelines run on every prompt or model change. Vector DB is enterprise-tier with hybrid search and re-ranking." },
      { level: 10, label: "AI-native platform", description: "Internal self-service: any team stands up a governed model or RAG app from a templated landing zone in hours. Multi-cluster GPU orchestration with right-sizing. Inference cost continuously optimized. Mature agent infrastructure: tool registries, sandboxed execution, end-to-end traces, automated multi-turn evals." },
    ],
  },
  governance: {
    componentId: "governance",
    componentName: COMPONENT_NAMES.governance,
    threeVsSixGuidance:
      "At 3 there is a written policy and an informal committee. At 6 there is a chartered standing committee with monthly cadence, a mandatory pre-build intake with risk classification, a centralized inventory covering vendor and embedded AI, model risk tiering driving validation depth, model cards and datasheets for production models, fairness testing on a defined cadence, and a tested AI incident response playbook.",
    anchors: [
      { level: 1, label: "Unaware", description: "No AI policy. No inventory of AI systems. Shadow AI is rampant. No model risk function. No bias testing. No incident response plan. Procurement contracts do not address AI. EU AI Act, NIST AI RMF, SR 11-7 are unfamiliar." },
      { level: 3, label: "Policy on paper", description: "A Responsible AI policy is published, often by Legal or Risk. An informal ethics committee meets occasionally. A nascent AI inventory spreadsheet exists but misses shadow AI and embedded vendor AI. High-risk use cases are reviewed case by case, often after build." },
      { level: 5, label: "Active governance function", description: "A standing AI governance committee meets ≥monthly with cross-functional membership and ExCo-approved charter. Mandatory pre-build intake with documented risk classification aligned to EU AI Act tiers. AI inventory is centralized and includes vendor and embedded AI. Model risk tiering drives validation depth. Model cards and datasheets produced for production models." },
      { level: 7, label: "Operationalized and auditable", description: "Independent model validation reviews high-risk models pre-production and on a tiered cycle thereafter. NIST AI RMF mapped to internal controls with automated evidence collection. EU AI Act conformity assessment implemented for high-risk systems. Bias pipelines run on every model release. Vendor AI undergoes standardized AI due diligence." },
      { level: 10, label: "Embedded and adaptive", description: "Governance is shifted left: every AI workflow has policy-as-code controls enforced at the platform. Real-time monitoring detects bias drift, hallucination rates, jailbreaks, prompt injection with auto-rollback. The org contributes to standards and publishes transparency reports. Agentic systems carry capability cards and continuous policy attestation." },
    ],
  },
};

// Compact rubric summary (one paragraph per component) for the methodology appendix.
export function rubricSummaryMarkdown(): string {
  const parts: string[] = [];
  parts.push(`### Methodology — Value-Readiness Matrix v${VRM_RUBRIC_VERSION}`);
  parts.push("");
  parts.push("Each readiness component is scored 1–10 against a behaviorally anchored rubric (BARS) with anchors at levels 1, 3, 5, 7, and 10.");
  parts.push("");
  for (const key of Object.keys(RUBRIC) as ComponentKey[]) {
    const r = RUBRIC[key];
    parts.push(`**${r.componentName}** — ${r.threeVsSixGuidance}`);
    parts.push("");
  }
  return parts.join("\n");
}

// AI prompt-friendly anchor block to be embedded in the readiness scoring prompt.
export function rubricForPrompt(): string {
  const lines: string[] = [];
  lines.push("BARS RUBRIC v2.0 — Use these behavioral anchors when assigning 1–10 scores. Levels 1, 3, 5, 7, 10 are anchored; intermediate values (2, 4, 6, 8, 9) are interpolated.");
  for (const key of Object.keys(RUBRIC) as ComponentKey[]) {
    const r = RUBRIC[key];
    lines.push(`\n${r.componentName}:`);
    for (const a of r.anchors) {
      lines.push(`  ${a.level} — ${a.label}: ${a.description}`);
    }
    lines.push(`  3 vs 6: ${r.threeVsSixGuidance}`);
  }
  return lines.join("\n");
}

// ===========================================================================
// v2.1 EXTENSIONS — corrective release
// ---------------------------------------------------------------------------
// All v2.1 logic is additive. v2.0 functions (assignQuadrant /
// assignPortfolioQuadrants / getFloorFailures / passesFloor) remain
// unchanged so existing JSON consumers can still read the v2.0 shape from the
// `quadrantV20` shadow field emitted by the postprocessor.
// ===========================================================================

export interface ValueFloorConfig {
  /** Use case fails the value floor only when BOTH conditions are true. */
  minNormalizedScore: number;       // default 4.0
  minAbsoluteAnnualValue: number;   // default 500_000
}

export interface EngagementConfig {
  valueFloor: ValueFloorConfig;
  championMin: number;              // default 7.5
  quickStrategicMin: number;        // default 6.0
  maxTimeToPilotWeeks: number;      // default 16
  dataAccessSprintWeeks: number;    // default 6 — surfaces in remediation guidance
}

export const DEFAULT_ENGAGEMENT_CONFIG: EngagementConfig = {
  valueFloor: { minNormalizedScore: 4.0, minAbsoluteAnnualValue: 500_000 },
  championMin: 7.5,
  quickStrategicMin: 6.0,
  maxTimeToPilotWeeks: 16,
  dataAccessSprintWeeks: 6,
};

export function resolveEngagementConfig(overrides?: Partial<EngagementConfig>): EngagementConfig {
  if (!overrides) return { ...DEFAULT_ENGAGEMENT_CONFIG, valueFloor: { ...DEFAULT_ENGAGEMENT_CONFIG.valueFloor } };
  return {
    ...DEFAULT_ENGAGEMENT_CONFIG,
    ...overrides,
    valueFloor: {
      ...DEFAULT_ENGAGEMENT_CONFIG.valueFloor,
      ...(overrides.valueFloor || {}),
    },
  };
}

// ---------------------------------------------------------------------------
// CHANGE 1 — Log-transformed value normalization
// ---------------------------------------------------------------------------
/**
 * Tag stamped onto every analysis the postprocessor emits so the staleness
 * checker can detect reports that were normalized with an older formula and
 * needs a re-run. Bumped with every behaviour change to `normalizeValueScores`.
 *
 *  - "v1" — the original log10 min-max (April 2026 v2.2). One large outlier
 *           crushes every other use case to ~1, producing the "all bubbles
 *           on the bottom row" failure mode reported in the screenshot.
 *  - "v2" — winsorized percentile normalization (April 2026, mid-month). Robust to
 *           a single big outlier, but still pinned every sub-1 EV/Friction ratio
 *           to value=1 because the calculation took log10(max(r, 1)) — every
 *           ratio less than 1 collapsed to log=0. In real portfolios most use
 *           cases have EV/Friction in (0, 1) (friction often dominates first-year
 *           projections), so the chart still showed all-but-one bubble pinned to
 *           the floor when the portfolio contained one big champion.
 *  - "v3" — sub-1 ratios are now allowed to take negative log values (with a
 *           floor of log10(0.01) = -2 for zero / unmeasured ratios), so the
 *           percentile spread actually distinguishes "barely underwater"
 *           (ratio ≈ 0.9) from "deeply underwater" (ratio ≈ 0.1). Combined
 *           with v2's percentile band this finally separates the bottom-row
 *           bubbles in the matrix.
 */
export const VALUE_NORMALIZATION_VERSION = "v3" as const;

/**
 * Floor for non-finite / zero / negative ratios. log10(0.01) = -2.
 *
 * Sentinel-policy choice: a finite measured ratio below 0.01 (log < -2) will
 * sort *below* the sentinel. This is intentional. A measured ratio of 0.001
 * means "EV is 0.1% of friction" — that's a real, terrible value bet that
 * should be at the very bottom of the matrix. A ratio of 0 from
 * `frictionCost === 0` means "we couldn't compute a ratio at all" — those
 * are not actually known to be worse than 0.001, so they sit at the
 * sentinel above. In practice EV/Friction ratios below 0.01 are vanishingly
 * rare in real reports (we'd need EV ~ $1k against Friction ~ $100k+),
 * so this ordering only matters for adversarial inputs / tests.
 */
const VALUE_NORMALIZATION_LOG_FLOOR = -2;

/**
 * Lower / upper percentile cutoffs used for winsorization (in [0, 1]).
 * 0.10 / 0.90 is the standard "10/90 trim" for robust statistics.
 */
const VALUE_NORMALIZATION_LOWER_PCT = 0.10;
const VALUE_NORMALIZATION_UPPER_PCT = 0.90;

/**
 * Below this portfolio size, percentile estimates become unreliable
 * (with 4 points the 90th percentile is essentially the max anyway).
 * For tiny portfolios we keep the original log min-max so tests and small
 * pilots behave as before.
 */
const VALUE_NORMALIZATION_PERCENTILE_MIN_N = 5;

/**
 * Linear-interpolated percentile (Type-7, the R / Excel default), so a 10/90
 * percentile on a 5-element sample is well-defined.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Map raw EV/Friction ratios to a 1–10 Value Score using winsorized,
 * log-transformed percentile normalization. Smooths heavy-tailed
 * distributions that produced the v2.0 "everything bunches at the
 * low end" failure mode and the v2 "all sub-1 ratios pinned to value=1"
 * failure mode.
 *
 * Behaviour (v3):
 *  - Empty input → []
 *  - Single use case → [5.5] (neutral)
 *  - All ratios identical → 5.5 across the portfolio
 *  - Finite positive ratio → real log10(r). A ratio of 0.5 produces log=-0.3,
 *    a ratio of 0.001 produces log=-3, etc. This means a sub-1 ratio
 *    correctly gets a low score (because EV < Friction) without being
 *    indistinguishable from every other sub-1 ratio (the v2 bug).
 *  - Non-finite / zero / negative ratio → sentinel floor of -2
 *    (= log10(0.01)). Treats "unmeasurable" as a single bucket. NOTE:
 *    a measured ratio below 0.01 (log < -2) will sort *below* the
 *    sentinel — see VALUE_NORMALIZATION_LOG_FLOOR's comment for why
 *    that's intentional (a ratio of 0.001 really IS worse than "we
 *    couldn't compute a ratio").
 *  - For ≥ 5 use cases: anchor 1↔10 band to the 10th/90th percentile of the
 *    log10 ratios; ratios above the 90th pct clamp to 10, ratios below the
 *    10th pct clamp to 1. This makes the spread robust to a single outlier
 *    (e.g. one $50M opportunity and ten $200K ones no longer pin the small
 *    ones to 1).
 *  - For 2–4 use cases: use plain log min-max, since percentile estimates
 *    aren't meaningful at that sample size.
 *  - Output range is clamped to [1, 10] to be defensive against rounding.
 */
export function normalizeValueScores(rawRatios: number[]): number[] {
  if (rawRatios.length === 0) return [];
  if (rawRatios.length === 1) return [5.5];

  // v3: don't floor sub-1 ratios to log=0 — that pinned every "EV < Friction"
  // use case to value=1 in the chart and made bottom-row bunching unfixable
  // by any normalization. Allow negative log values; only zero / non-finite
  // ratios fall back to a sentinel floor.
  const logRatios = rawRatios.map((r) => {
    if (!Number.isFinite(r) || r <= 0) return VALUE_NORMALIZATION_LOG_FLOOR;
    return Math.log10(r);
  });

  // Pick the anchor band: percentile-based for big portfolios, min-max for tiny ones.
  let lo: number;
  let hi: number;
  if (rawRatios.length >= VALUE_NORMALIZATION_PERCENTILE_MIN_N) {
    const sorted = [...logRatios].sort((a, b) => a - b);
    lo = percentile(sorted, VALUE_NORMALIZATION_LOWER_PCT);
    hi = percentile(sorted, VALUE_NORMALIZATION_UPPER_PCT);
    // Guard: if winsorized lo===hi (e.g., bottom 10% are zero AND top 10% are zero),
    // fall back to true min/max so we still get a usable spread.
    if (hi === lo) {
      lo = Math.min(...logRatios);
      hi = Math.max(...logRatios);
    }
  } else {
    lo = Math.min(...logRatios);
    hi = Math.max(...logRatios);
  }

  if (hi === lo) return rawRatios.map(() => 5.5);

  return logRatios.map((lr) => {
    const v = 1 + 9 * ((lr - lo) / (hi - lo));
    return Math.max(1, Math.min(10, Math.round(v * 100) / 100));
  });
}

// ---------------------------------------------------------------------------
// CHANGE 2 + 3 — Floor evaluation: hard knock-outs vs soft blockers
// ---------------------------------------------------------------------------
export interface UseCaseScoringV21 extends UseCaseScoring {
  /** Raw EV × P / Friction ratio, preserved for reports. */
  valueScoreRaw?: number;
  /** Annual projected value (= TotalAnnualValue × ProbabilityOfSuccess) in dollars. */
  absoluteAnnualValue?: number;
  /** Hard knock-outs (always send to Foundation). */
  legallyProhibited?: boolean;
  technicallyInfeasible?: boolean;
}

export interface FloorEvaluation {
  hardFailures: string[];
  softBlockers: string[];
}

export function evaluateFloors(
  uc: UseCaseScoringV21,
  cfg: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
): FloorEvaluation {
  const hard: string[] = [];
  const soft: string[] = [];

  // --- Hard knock-outs --------------------------------------------------
  if (uc.legallyProhibited === true) {
    hard.push("Legally prohibited in client jurisdiction");
  }
  if (uc.technicallyInfeasible === true) {
    hard.push("Beyond current technical capability");
  }
  const v = round1(uc.valueScore);
  const abs = uc.absoluteAnnualValue ?? 0;
  const failsNorm = v < cfg.valueFloor.minNormalizedScore;
  const failsAbs = abs < cfg.valueFloor.minAbsoluteAnnualValue;
  if (failsNorm && failsAbs) {
    const absK = Math.round(abs / 1000);
    hard.push(
      `Value below floor (${v.toFixed(1)} normalized, $${absK}K absolute — both below thresholds ${cfg.valueFloor.minNormalizedScore} / $${Math.round(cfg.valueFloor.minAbsoluteAnnualValue / 1000)}K)`,
    );
  }

  // --- Soft blockers (do NOT relegate to Foundation) --------------------
  if (uc.hasNamedSponsor === false) {
    soft.push("No named business sponsor — confirm at intake");
  } else if (uc.hasNamedSponsor === null || uc.hasNamedSponsor === undefined) {
    soft.push("Sponsor field not captured — intake incomplete");
  }
  if (uc.dataAvailableForEngagement === false) {
    soft.push(`Data access sprint required (${cfg.dataAccessSprintWeeks} weeks default)`);
  } else if (uc.dataAvailableForEngagement === null || uc.dataAvailableForEngagement === undefined) {
    soft.push("Data availability not confirmed — intake incomplete");
  }
  if (typeof uc.timeToPilotWeeks === "number" && uc.timeToPilotWeeks > cfg.maxTimeToPilotWeeks) {
    soft.push(
      `Time-to-pilot ${uc.timeToPilotWeeks} weeks exceeds ${cfg.maxTimeToPilotWeeks}-week target — sequencing concern`,
    );
  }

  return { hardFailures: hard, softBlockers: soft };
}

// ---------------------------------------------------------------------------
// v2.1 quadrant assignment with hard/soft separation + broader Layer 3
// ---------------------------------------------------------------------------
export interface QuadrantAssignmentV21 extends QuadrantAssignment {
  hardFailures?: string[];
  softBlockers?: string[];
  conditionalChampionMeta?: {
    gaps: Array<{ component: string; current: number; required: number }>;
    softBlockers: string[];
    proposedSprintWeeks: number;
    reclassificationCriteria: string;
  };
}

function buildGapMetaV21(
  uc: UseCaseScoringV21,
  softBlockers: string[],
  cfg: EngagementConfig,
): NonNullable<QuadrantAssignmentV21["conditionalChampionMeta"]> {
  const gaps: Array<{ component: string; current: number; required: number }> = [];
  const componentLabels: Record<keyof ReadinessComponentScores, string> = {
    orgCapacity: "Organizational Capacity",
    dataReadiness: "Data Availability & Quality",
    governance: "AI-Specific Governance",
    techInfrastructure: "Technical Infrastructure",
  };
  const required = 7;
  const componentKey: Record<keyof ReadinessComponentScores, string> = {
    orgCapacity: "orgCapacity",
    dataReadiness: "dataReadiness",
    governance: "governance",
    techInfrastructure: "techInfrastructure",
  };
  (Object.keys(componentLabels) as Array<keyof ReadinessComponentScores>).forEach((k) => {
    const current = uc.componentScores[k];
    if (typeof current === "number" && current < required) {
      gaps.push({ component: componentKey[k], current: round1(current), required });
    }
  });
  if (gaps.length === 0) {
    let lowestKey: keyof ReadinessComponentScores = "orgCapacity";
    let lowest = Infinity;
    (Object.keys(componentLabels) as Array<keyof ReadinessComponentScores>).forEach((k) => {
      if (uc.componentScores[k] < lowest) {
        lowest = uc.componentScores[k];
        lowestKey = k;
      }
    });
    gaps.push({ component: componentKey[lowestKey], current: round1(lowest), required });
  }

  const proposedSprintWeeks = proposeSprintWeeks({ scoreGaps: gaps, softBlockers });

  const gapDescriptors = gaps.map((g) => {
    const label = componentLabels[g.component as keyof ReadinessComponentScores] ?? g.component;
    return `${label} reaches ${g.required}.0+`;
  });
  const reclassParts: string[] = [...gapDescriptors];
  if (softBlockers.some((b) => b.toLowerCase().includes("sponsor"))) reclassParts.push("named sponsor confirmed");
  if (softBlockers.some((b) => b.toLowerCase().includes("data access"))) reclassParts.push("data access secured");
  const reclassificationCriteria = `Promote to unconditional Champion when ${reclassParts.join(" AND ")}.`;

  return {
    gaps: gaps.map((g) => ({
      component: componentLabels[g.component as keyof ReadinessComponentScores] ?? g.component,
      current: g.current,
      required: g.required,
    })),
    softBlockers,
    proposedSprintWeeks,
    reclassificationCriteria,
  };
}

// CHANGE 5 — dynamic sprint sizing, hard ceiling 12
export function proposeSprintWeeks(meta: {
  scoreGaps: Array<{ component: string; current: number; required: number }>;
  softBlockers: string[];
}): number {
  let weeks = 4; // base
  if (meta.scoreGaps.some((g) => g.component === "dataReadiness" && g.required - g.current >= 2)) weeks += 4;
  if (meta.softBlockers.some((b) => b.toLowerCase().includes("data access"))) weeks += 4;
  if (meta.softBlockers.some((b) => b.toLowerCase().includes("sponsor"))) weeks += 1;
  if (meta.scoreGaps.some((g) => g.component === "orgCapacity" && g.required - g.current >= 2)) weeks += 2;
  return Math.min(weeks, 12);
}

export function assignQuadrantV21(
  uc: UseCaseScoringV21,
  portfolio: UseCaseScoringV21[],
  cfg: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
): QuadrantAssignmentV21 {
  const evalRes = evaluateFloors(uc, cfg);

  // Layer 1 — only HARD failures send to Foundation
  if (evalRes.hardFailures.length > 0) {
    return {
      quadrant: "foundation",
      layer: 1,
      rationale: `Hard floor failure: ${evalRes.hardFailures.join("; ")}`,
      hardFailures: evalRes.hardFailures,
      softBlockers: evalRes.softBlockers,
      floorFailureReasons: evalRes.hardFailures,
    };
  }

  const v = round1(uc.valueScore);
  const r = round1(uc.readinessScore);

  // Layer 2 — default absolute quadrants
  if (v >= cfg.championMin && r >= cfg.championMin) {
    return {
      quadrant: "champion",
      layer: 2,
      rationale: `Value ${v} and Readiness ${r} both meet Champion threshold (≥${cfg.championMin}).`,
      softBlockers: evalRes.softBlockers,
    };
  }
  if (v >= cfg.championMin && r >= cfg.quickStrategicMin) {
    return {
      quadrant: "strategic",
      layer: 2,
      rationale: `Value ${v} ≥ ${cfg.championMin} but Readiness ${r} below Champion threshold; classified Strategic.`,
      softBlockers: evalRes.softBlockers,
    };
  }
  if (v >= cfg.quickStrategicMin && r >= cfg.championMin) {
    return {
      quadrant: "quick_win",
      layer: 2,
      rationale: `Readiness ${r} ≥ ${cfg.championMin} with moderate Value ${v}; classified Quick Win.`,
      softBlockers: evalRes.softBlockers,
    };
  }

  const layer2Foundation: QuadrantAssignmentV21 = {
    quadrant: "foundation",
    layer: 2,
    rationale: `Above floor but below Champion / Strategic / Quick Win thresholds (Value ${v}, Readiness ${r}).`,
    softBlockers: evalRes.softBlockers,
  };

  // CHANGE 4 — Layer 3 fires only when the portfolio has zero of all three above-floor quadrants.
  const portfolioHasChampion = portfolio.some((p) => {
    const e = evaluateFloors(p, cfg);
    if (e.hardFailures.length > 0) return false;
    return round1(p.valueScore) >= cfg.championMin && round1(p.readinessScore) >= cfg.championMin;
  });
  const portfolioHasQuickWin = portfolio.some((p) => {
    const e = evaluateFloors(p, cfg);
    if (e.hardFailures.length > 0) return false;
    const pv = round1(p.valueScore);
    const pr = round1(p.readinessScore);
    return pv >= cfg.quickStrategicMin && pv < cfg.championMin && pr >= cfg.championMin;
  });
  const portfolioHasStrategic = portfolio.some((p) => {
    const e = evaluateFloors(p, cfg);
    if (e.hardFailures.length > 0) return false;
    const pv = round1(p.valueScore);
    const pr = round1(p.readinessScore);
    return pv >= cfg.championMin && pr >= cfg.quickStrategicMin && pr < cfg.championMin;
  });

  if (portfolioHasChampion || portfolioHasQuickWin || portfolioHasStrategic) {
    return layer2Foundation;
  }

  // No above-floor quadrants populated anywhere — promote top 2 by composite (subject to hard floor).
  const eligible = portfolio.filter((p) => evaluateFloors(p, cfg).hardFailures.length === 0);
  if (eligible.length === 0) return layer2Foundation;

  const ranked = [...eligible].sort((a, b) => {
    const ca = compositeScore(a);
    const cb = compositeScore(b);
    if (cb !== ca) return cb - ca;
    if (round1(b.valueScore) !== round1(a.valueScore)) return round1(b.valueScore) - round1(a.valueScore);
    if (round1(b.readinessScore) !== round1(a.readinessScore)) return round1(b.readinessScore) - round1(a.readinessScore);
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });
  const promoteCount = Math.min(2, ranked.length);
  const promotedIds = new Set(ranked.slice(0, promoteCount).map((p) => p.id));

  if (promotedIds.has(uc.id)) {
    return {
      quadrant: "conditional_champion",
      layer: 3,
      rationale:
        "Top composite score in a portfolio with no above-floor candidates; promoted with named readiness gaps and remediation plan.",
      softBlockers: evalRes.softBlockers,
      conditionalChampionMeta: buildGapMetaV21(uc, evalRes.softBlockers, cfg),
    };
  }
  return layer2Foundation;
}

export function assignPortfolioQuadrantsV21(
  portfolio: UseCaseScoringV21[],
  cfg: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
): Map<string, QuadrantAssignmentV21> {
  const result = new Map<string, QuadrantAssignmentV21>();
  for (const uc of portfolio) {
    result.set(uc.id, assignQuadrantV21(uc, portfolio, cfg));
  }
  // Wave assignment for Layer 2 Champions (top 30% = Wave 1)
  const champions = portfolio
    .filter((uc) => result.get(uc.id)?.quadrant === "champion")
    .sort((a, b) => compositeScore(b) - compositeScore(a));
  if (champions.length >= 2) {
    const cutoff = Math.max(1, Math.ceil(champions.length * 0.3));
    champions.forEach((uc, idx) => {
      const a = result.get(uc.id);
      if (a) a.wave = idx < cutoff ? "Wave 1" : "Wave 2";
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// CHANGE 6 — Portfolio diagnostic
// ---------------------------------------------------------------------------
export type WarningSeverity = "info" | "warning" | "critical";

export interface PortfolioWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
  recommendedAction: string;
}

export interface PortfolioDiagnostic {
  totalUseCases: number;
  byQuadrant: Record<Quadrant, number>;
  prototypingCandidatesCount: number;
  medianValueScore: number;
  medianReadinessScore: number;
  hardFloorFailureRate: number;
  intakeIncompletionRate: number;
  warnings: PortfolioWarning[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return round1((sorted[mid - 1] + sorted[mid]) / 2);
  return round1(sorted[mid]);
}

export function computePortfolioDiagnostic(
  portfolio: UseCaseScoringV21[],
  assignments: Map<string, QuadrantAssignmentV21>,
  cfg: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
): PortfolioDiagnostic {
  const total = portfolio.length;
  const byQuadrant: Record<Quadrant, number> = {
    champion: 0,
    conditional_champion: 0,
    strategic: 0,
    quick_win: 0,
    foundation: 0,
  };
  let prototypingCandidates = 0;
  let hardFails = 0;
  let intakeIncomplete = 0;

  for (const uc of portfolio) {
    const a = assignments.get(uc.id);
    if (!a) continue;
    byQuadrant[a.quadrant] = (byQuadrant[a.quadrant] || 0) + 1;
    if (
      a.quadrant === "champion" ||
      a.quadrant === "conditional_champion" ||
      a.quadrant === "quick_win"
    ) {
      prototypingCandidates += 1;
    }
    if ((a.hardFailures && a.hardFailures.length > 0) || (a.layer === 1 && a.floorFailureReasons && a.floorFailureReasons.length > 0)) {
      hardFails += 1;
    }
    if (uc.hasNamedSponsor === null || uc.hasNamedSponsor === undefined ||
        uc.dataAvailableForEngagement === null || uc.dataAvailableForEngagement === undefined) {
      intakeIncomplete += 1;
    }
  }

  const medV = median(portfolio.map((p) => p.valueScore));
  const medR = median(portfolio.map((p) => p.readinessScore));
  const hardRate = total > 0 ? hardFails / total : 0;
  const intakeRate = total > 0 ? intakeIncomplete / total : 0;

  const warnings: PortfolioWarning[] = [];

  if (prototypingCandidates === 0) {
    warnings.push({
      severity: "critical",
      code: "EMPTY_MATRIX",
      message: "No prototyping candidates produced.",
      recommendedAction: "Review value assumptions and intake data; verify EV/Friction ratios are realistic and rerun scoring.",
    });
  }
  if (medV < cfg.valueFloor.minNormalizedScore) {
    warnings.push({
      severity: "warning",
      code: "VALUE_DISTRIBUTION_SKEWED",
      message: `Median normalized Value Score ${medV.toFixed(1)} is below the ${cfg.valueFloor.minNormalizedScore} floor.`,
      recommendedAction: "Verify EV and Friction values were captured correctly. Consider whether friction baselines include realistic loaded labor rates.",
    });
  }
  if (medR < 5.0 && byQuadrant.conditional_champion === 0) {
    warnings.push({
      severity: "warning",
      code: "READINESS_BUNCHED_LOW",
      message: `Median Readiness ${medR.toFixed(1)} is low across the portfolio with no Conditional Champions promoted.`,
      recommendedAction: "Consider proposing a Readiness Uplift roadmap as Wave 0 before any prototyping wave.",
    });
  }
  if (intakeRate > 0.30) {
    warnings.push({
      severity: "warning",
      code: "INTAKE_INCOMPLETE",
      message: `${Math.round(intakeRate * 100)}% of use cases have unconfirmed sponsor or data availability.`,
      recommendedAction: "Sponsor and data availability must be confirmed during intake before prototyping.",
    });
  }
  if (hardRate > 0.50) {
    warnings.push({
      severity: "warning",
      code: "HARD_FLOOR_DOMINANT",
      message: `${Math.round(hardRate * 100)}% of use cases hard-failed Layer 1.`,
      recommendedAction: "Check if friction baselines are realistic and whether absolute-value floors match the engagement scale.",
    });
  }
  if (byQuadrant.champion > 5) {
    warnings.push({
      severity: "info",
      code: "STRONG_PORTFOLIO",
      message: `Strong portfolio: ${byQuadrant.champion} unconditional Champions detected.`,
      recommendedAction: "Apply Wave 1 / Wave 2 sequencing — the top 30% by composite become Wave 1.",
    });
  }

  return {
    totalUseCases: total,
    byQuadrant,
    prototypingCandidatesCount: prototypingCandidates,
    medianValueScore: medV,
    medianReadinessScore: medR,
    hardFloorFailureRate: round1(hardRate * 100) / 100,
    intakeIncompletionRate: round1(intakeRate * 100) / 100,
    warnings,
  };
}

// ===========================================================================
// VRM v2.2 — Third Corrective Release
// ---------------------------------------------------------------------------
// Geometry change: quadrant cut moves from 7.5 to 5.5 to keep the matrix
// usable for typical mid-market portfolios where most use cases score 4-7.
// The 7.5 line is preserved as a *lead-tier* indicator inside Champions
// and Quick Wins. A safety-net guarantees ≥3 prototyping candidates.
// All v2.0/v2.1 functions remain exported for back-compat — postprocessor
// runs both pipelines and emits shadow columns.
// ===========================================================================

export const QUADRANT_CUT = 5.5;
export const LEAD_TIER_CUT = 7.5;
export const MIN_PROTOTYPING_CANDIDATES = 3;

export type QuadrantV22 = "champion" | "quick_win" | "strategic" | "foundation";
export type TierV22 = "lead" | "standard";

export const QUADRANT_LABELS_V22: Record<QuadrantV22, string> = {
  champion: "Champion",
  quick_win: "Quick Win",
  strategic: "Strategic",
  foundation: "Foundation",
};

export interface ConditionalGapV22 {
  fromQuadrant: QuadrantV22;
  /** How far the use case is from crossing the QUADRANT_CUT on each axis. */
  gapToChampion: { v: number; r: number };
}

export interface ClassificationV22 {
  quadrant: QuadrantV22;
  tier: TierV22;
  /** True when the use case was promoted as a prototyping candidate by the
   * MIN_PROTOTYPING_CANDIDATES safety net. Renders with dashed border at
   * actual coordinates. */
  isConditional: boolean;
  conditionalGap?: ConditionalGapV22;
  hardFailures?: string[];
  softBlockers?: string[];
  rationale: string;
}

export interface ClassifiedUseCaseV22 extends ClassificationV22 {
  id: string;
  valueScore: number;
  readinessScore: number;
}

/** Pure quadrant function — operates on already-rounded scores. */
export function classifyQuadrantV22(v: number, r: number): QuadrantV22 {
  if (v >= QUADRANT_CUT && r >= QUADRANT_CUT) return "champion";
  if (v < QUADRANT_CUT && r >= QUADRANT_CUT) return "quick_win";
  if (v >= QUADRANT_CUT && r < QUADRANT_CUT) return "strategic";
  return "foundation";
}

/** Lead-tier flag — only meaningful inside Champions and Quick Wins.
 * Champion: needs both V≥7.5 AND R≥7.5.
 * Quick Win: needs R≥7.5 (V is by definition < 5.5 in this quadrant).
 * Strategic / Foundation: never lead.
 */
export function leadTierV22(quadrant: QuadrantV22, v: number, r: number): TierV22 {
  if (quadrant === "champion" && v >= LEAD_TIER_CUT && r >= LEAD_TIER_CUT) return "lead";
  if (quadrant === "quick_win" && r >= LEAD_TIER_CUT) return "lead";
  return "standard";
}

/** Distance from the QUADRANT_CUT for safety-net promotion ranking.
 *  Smaller distance = closer to crossing into Champion/Quick Win/Strategic.
 *  v2.2 spec ranks promotable items by *nearest-to-cut* (not composite score)
 *  so that the items most plausibly upgradable are preferred. */
function distanceToQuadrantCutV22(uc: UseCaseScoringV21): number {
  const v = round1(uc.valueScore);
  const r = round1(uc.readinessScore);
  const dv = Math.max(0, QUADRANT_CUT - v);
  const dr = Math.max(0, QUADRANT_CUT - r);
  return dv + dr;
}

/**
 * v2.2 portfolio classification.
 * - Hard floor failures → foundation (with full failure list).
 * - Otherwise classify by 5.5 cut, then assign lead-tier flag at 7.5.
 * - If natural prototyping candidates (champion + quick_win) < MIN, promote
 *   the next best foundation/strategic items (by composite score) to
 *   isConditional=true so the portfolio always surfaces ≥ MIN candidates.
 *   Promoted items keep their natural quadrant for plotting; the chart
 *   renders them with a dashed border at actual coordinates.
 */
export function assignClassificationsV22(
  portfolio: UseCaseScoringV21[],
  cfg: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
): Map<string, ClassificationV22> {
  const out = new Map<string, ClassificationV22>();

  for (const uc of portfolio) {
    const evalRes = evaluateFloors(uc, cfg);
    const v = round1(uc.valueScore);
    const r = round1(uc.readinessScore);

    if (evalRes.hardFailures.length > 0) {
      out.set(uc.id, {
        quadrant: "foundation",
        tier: "standard",
        isConditional: false,
        hardFailures: evalRes.hardFailures,
        softBlockers: evalRes.softBlockers,
        rationale: `Hard floor failure: ${evalRes.hardFailures.join("; ")}`,
      });
      continue;
    }

    const q = classifyQuadrantV22(v, r);
    const tier = leadTierV22(q, v, r);
    const baseRationale =
      tier === "lead"
        ? `Lead ${QUADRANT_LABELS_V22[q]} — V ${v}, R ${r} (above lead-tier ${LEAD_TIER_CUT})`
        : `${QUADRANT_LABELS_V22[q]} — V ${v}, R ${r}`;

    out.set(uc.id, {
      quadrant: q,
      tier,
      isConditional: false,
      softBlockers: evalRes.softBlockers,
      rationale: baseRationale,
    });
  }

  // Phase 2: Safety-net promotion to MIN_PROTOTYPING_CANDIDATES.
  const naturalCandidates = portfolio.filter((uc) => {
    const c = out.get(uc.id);
    return c && (c.quadrant === "champion" || c.quadrant === "quick_win");
  });

  if (naturalCandidates.length < MIN_PROTOTYPING_CANDIDATES) {
    const needed = MIN_PROTOTYPING_CANDIDATES - naturalCandidates.length;
    const promotable = portfolio
      .filter((uc) => {
        const c = out.get(uc.id);
        if (!c) return false;
        if ((c.hardFailures ?? []).length > 0) return false;
        return c.quadrant === "strategic" || c.quadrant === "foundation";
      })
      .sort((a, b) => {
        // Nearest-to-cut first (smallest distance wins).
        const da = distanceToQuadrantCutV22(a);
        const db = distanceToQuadrantCutV22(b);
        if (da !== db) return da - db;
        // Tie-break: higher V then higher R then stable id order.
        const va = round1(a.valueScore);
        const vb = round1(b.valueScore);
        if (vb !== va) return vb - va;
        const ra = round1(a.readinessScore);
        const rb = round1(b.readinessScore);
        if (rb !== ra) return rb - ra;
        return (a.id || "").localeCompare(b.id || "");
      })
      .slice(0, needed);

    for (const uc of promotable) {
      const c = out.get(uc.id)!;
      const v = round1(uc.valueScore);
      const r = round1(uc.readinessScore);
      c.isConditional = true;
      c.conditionalGap = {
        fromQuadrant: c.quadrant,
        gapToChampion: {
          v: round1(Math.max(0, QUADRANT_CUT - v)),
          r: round1(Math.max(0, QUADRANT_CUT - r)),
        },
      };
      c.rationale = `Conditional ${QUADRANT_LABELS_V22.champion} (safety-net promotion) — natural ${QUADRANT_LABELS_V22[c.quadrant]} at V ${v}, R ${r}; portfolio had only ${naturalCandidates.length} natural candidate${naturalCandidates.length !== 1 ? "s" : ""} so promoted to meet the minimum-${MIN_PROTOTYPING_CANDIDATES} prototyping rule.`;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// VRM v2.2 — Portfolio diagnostic with retuned warning rules
// ---------------------------------------------------------------------------

export interface PortfolioDiagnosticV22 {
  schemaVersion: string;
  totalUseCases: number;
  prototypingCandidatesCount: number;
  prototypingCandidatesPct: number;
  championCount: number;
  leadChampionCount: number;
  quickWinCount: number;
  leadQuickWinCount: number;
  strategicCount: number;
  foundationCount: number;
  foundationHardCount: number;
  foundationSoftCount: number;
  conditionalCount: number;
  medianValueScore: number;
  medianReadinessScore: number;
  hardFloorFailureRate: number;
  intakeIncompletionRate: number;
  warnings: PortfolioWarning[];
}

function medianV22(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round1((sorted[mid - 1] + sorted[mid]) / 2)
    : round1(sorted[mid]);
}

export function computePortfolioDiagnosticV22(
  portfolio: UseCaseScoringV21[],
  classifications: Map<string, ClassificationV22>,
): PortfolioDiagnosticV22 {
  const total = portfolio.length;
  const warnings: PortfolioWarning[] = [];

  const classified = portfolio.map((uc) => ({ uc, c: classifications.get(uc.id)! }));

  let championCount = 0;
  let leadChampionCount = 0;
  let quickWinCount = 0;
  let leadQuickWinCount = 0;
  let strategicCount = 0;
  let foundationCount = 0;
  let foundationHardCount = 0;
  let foundationSoftCount = 0;
  let conditionalCount = 0;
  let intakeMissing = 0;
  let hardFails = 0;

  for (const { uc, c } of classified) {
    if (c.quadrant === "champion") {
      championCount += 1;
      if (c.tier === "lead") leadChampionCount += 1;
    } else if (c.quadrant === "quick_win") {
      quickWinCount += 1;
      if (c.tier === "lead") leadQuickWinCount += 1;
    } else if (c.quadrant === "strategic") {
      strategicCount += 1;
    } else {
      foundationCount += 1;
      if ((c.hardFailures ?? []).length > 0) {
        foundationHardCount += 1;
        hardFails += 1;
      } else {
        foundationSoftCount += 1;
      }
    }
    if (c.isConditional) conditionalCount += 1;
    if (uc.hasNamedSponsor === null || uc.dataAvailableForEngagement === null) {
      intakeMissing += 1;
    }
  }

  // Prototyping candidates = natural champions + natural quick_wins + conditionals
  const prototypingCandidatesCount = championCount + quickWinCount + conditionalCount;
  const prototypingCandidatesPct =
    total === 0 ? 0 : Math.round((prototypingCandidatesCount / total) * 100);

  const medianValueScore = medianV22(portfolio.map((uc) => round1(uc.valueScore)));
  const medianReadinessScore = medianV22(portfolio.map((uc) => round1(uc.readinessScore)));
  const hardFloorFailureRate = total === 0 ? 0 : hardFails / total;
  const intakeIncompletionRate = total === 0 ? 0 : intakeMissing / total;

  // -------- Warning rules (v2.2 retuned for 5.5 geometry) --------

  // EMPTY_MATRIX (critical) — portfolio is empty, or all use cases land in Foundation.
  if (total === 0) {
    warnings.push({
      code: "EMPTY_MATRIX",
      severity: "critical",
      message: "No use cases supplied — the matrix is empty.",
      remediation: "Capture at least one use case at intake before generating the Value-Readiness Matrix.",
    });
  } else if (championCount + quickWinCount + strategicCount === 0 && foundationCount === total) {
    warnings.push({
      code: "EMPTY_MATRIX",
      severity: "critical",
      message: "All use cases land in Foundation. The matrix has no Champions, Quick Wins, or Strategic items.",
      remediation: "Re-examine intake quality and floor criteria; consider whether any use cases were over-penalized by hard floors that could be relaxed for this engagement.",
    });
  }

  // BELOW_MIN_CANDIDATES (warning) — even after safety-net promotion, fewer
  // than MIN_PROTOTYPING_CANDIDATES exist (only possible when portfolio < 3
  // or all non-champion items hard-failed).
  if (total > 0 && prototypingCandidatesCount < MIN_PROTOTYPING_CANDIDATES) {
    warnings.push({
      code: "BELOW_MIN_CANDIDATES",
      severity: "warning",
      message: `Portfolio surfaces only ${prototypingCandidatesCount} prototyping candidate${prototypingCandidatesCount !== 1 ? "s" : ""} (target: ${MIN_PROTOTYPING_CANDIDATES}). Hard-floor failures may be excluding viable items.`,
      remediation: "Review hard-floor failure reasons; if 'technically infeasible' or 'legally prohibited' flags are over-applied, revisit intake to confirm.",
    });
  }

  // READINESS_BUNCHED_LOW — most readiness scores cluster below the 5.0 threshold (v2.2 retune).
  if (total > 0 && medianReadinessScore < 5.0 && championCount === 0) {
    warnings.push({
      code: "READINESS_BUNCHED_LOW",
      severity: "warning",
      message: `Median readiness is ${medianReadinessScore.toFixed(1)} with zero Champions. The portfolio's readiness distribution skews low and may not yet support production-ready bets.`,
      remediation: "Invest in the four BARS components (Org Capacity, Data, Governance, Tech Infra) before launching pilots; consider a readiness-uplift sprint.",
    });
  }

  // READINESS_BUNCHED_HIGH — most readiness scores cluster high but value isn't there.
  if (total > 0 && medianReadinessScore > 8.0 && quickWinCount > championCount) {
    warnings.push({
      code: "READINESS_BUNCHED_HIGH",
      severity: "info",
      message: `Median readiness is ${medianReadinessScore.toFixed(1)} but Quick Wins (${quickWinCount}) outnumber Champions (${championCount}). The portfolio is technically ready but value-light.`,
      remediation: "Re-scope use cases toward higher-value workflows, or pursue a portfolio expansion that targets larger friction pools.",
    });
  }

  // VALUE_DISTRIBUTION_SKEWED — median normalized value is at the extremes.
  if (total > 0 && (medianValueScore < 4.0 || medianValueScore > 8.0)) {
    warnings.push({
      code: "VALUE_DISTRIBUTION_SKEWED",
      severity: "warning",
      message: `Median normalized Value Score is ${medianValueScore.toFixed(1)}, outside the typical 4-8 band. Min-max normalization may be over- or under-spreading the portfolio.`,
      remediation: "Sanity-check friction-cost denominators and EV inputs; consider whether one or two outlier use cases are compressing the rest of the distribution.",
    });
  }

  // INTAKE_INCOMPLETE — > 30% of use cases have null sponsor or null data flags.
  if (total > 0 && intakeIncompletionRate > 0.30) {
    warnings.push({
      code: "INTAKE_INCOMPLETE",
      severity: "warning",
      message: `${Math.round(intakeIncompletionRate * 100)}% of use cases are missing sponsor and/or data-availability information.`,
      remediation: "Complete intake fields before relying on quadrant placement; missing data is treated as 'unknown', not 'unavailable'.",
    });
  }

  // HARD_FLOOR_DOMINANT — > 40% of use cases hard-failed (down from 50% in v2.1).
  if (total > 0 && hardFloorFailureRate > 0.40) {
    warnings.push({
      code: "HARD_FLOOR_DOMINANT",
      severity: "warning",
      message: `${Math.round(hardFloorFailureRate * 100)}% of use cases were hard-floor-failed (legal/technical/de-minimis). The portfolio is dominated by Foundation items.`,
      remediation: "Review hard-floor failure reasons in detail. If 'technically infeasible' is over-applied, re-evaluate against current AI capability frontier.",
    });
  }

  // STRONG_PORTFOLIO — Lead Champions ≥ 3 (positive signal).
  if (leadChampionCount >= 3) {
    warnings.push({
      code: "STRONG_PORTFOLIO",
      severity: "info",
      message: `${leadChampionCount} Lead Champions identified (V≥${LEAD_TIER_CUT} AND R≥${LEAD_TIER_CUT}). Portfolio is positioned for an aggressive multi-track rollout.`,
      remediation: "Consider parallelizing top Lead Champions across two pilot pods to compress time-to-value.",
    });
  }

  return {
    schemaVersion: VRM_SCHEMA_VERSION,
    totalUseCases: total,
    prototypingCandidatesCount,
    prototypingCandidatesPct,
    championCount,
    leadChampionCount,
    quickWinCount,
    leadQuickWinCount,
    strategicCount,
    foundationCount,
    foundationHardCount,
    foundationSoftCount,
    conditionalCount,
    medianValueScore,
    medianReadinessScore,
    hardFloorFailureRate: round1(hardFloorFailureRate * 100) / 100,
    intakeIncompletionRate: round1(intakeIncompletionRate * 100) / 100,
    warnings,
  };
}

/** Convenience helper used by the postprocessor and UI: derives the human
 * label that combines quadrant + lead/conditional flags. */
export function classificationLabelV22(c: ClassificationV22): string {
  const base = QUADRANT_LABELS_V22[c.quadrant];
  if (c.isConditional) return `${QUADRANT_LABELS_V22.champion} (Conditional)`;
  if (c.tier === "lead" && (c.quadrant === "champion" || c.quadrant === "quick_win")) {
    return `${base} (Lead)`;
  }
  return base;
}
