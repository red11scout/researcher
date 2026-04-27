// shared/vrm-v2.ts
// Value-Readiness Matrix v2.0 — Single source of truth for the upgraded methodology.
// All weights, sector presets, sub-components, rubric anchors, and quadrant logic
// live here so that the calculation engine, AI prompts, dashboard mapper,
// matrix chart, and HTML report generators stay in lock-step.

export const VRM_SCHEMA_VERSION = "2.0";
export const VRM_RUBRIC_VERSION = "2.0";

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
