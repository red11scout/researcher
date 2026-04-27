# REPLIT IMPLEMENTATION PROMPT — Value-Readiness Matrix v2.0

> Paste this entire document into Replit Agent as a single brief. The agent should treat each numbered Change as a discrete unit of work, complete it fully, and verify acceptance criteria before moving to the next.

---

## MISSION

You are upgrading an existing AI use-case prioritization application that produces **Value-Readiness Matrix** outputs for Fortune 500 consulting engagements. The current methodology has three known defects we are fixing in this release:

1. The four readiness component weights are stale and overweight infrastructure.
2. The 1–10 scoring scale has no behavioral anchors, so assessors cannot reliably distinguish a 3 from a 6.
3. The quadrant cut lines are rigid, which produces zero prototyping candidates on weak-portfolio engagements.

This upgrade introduces:
- **Reweighted components** with documented sub-components and sector adjustments.
- **Behaviorally anchored rating scales (BARS)** for all four readiness components, with anchors at 1, 3, 5, 7, 10.
- **A three-layer hybrid quadrant methodology** with hard floors, default absolute cuts, and Conditional Champion promotion for weak portfolios.

All changes must propagate through the data model, scoring logic, JSON outputs, and report rendering. Do not break backward compatibility for existing engagements without migration.

---

## DISCOVERY — DO THIS FIRST

Before making any code changes, scan the repo and produce a short discovery report covering:

1. **Stack and framework.** Identify language(s), framework(s), state management, styling approach, and persistence layer (DB, files, in-memory, etc.).
2. **Data model.** Locate the type/schema definitions for: use case, engagement/client, readiness scores, value scores, quadrant assignment.
3. **Scoring logic.** Locate the function(s) that compute Readiness Score, Value Score, Priority Score, and quadrant assignment.
4. **JSON output.** Locate the file(s) or function(s) that emit JSON for reports/exports.
5. **Report rendering.** Locate report templates or React components that render the matrix, scores, and quadrant labels.
6. **Existing tests.** Locate any test files covering scoring or quadrant logic.

Pause and confirm the discovery report before implementing. If any of the six items above cannot be found, flag explicitly and propose where to add them.

---

## CHANGE 1 — REWEIGHTED COMPONENTS WITH SECTOR ADJUSTMENTS

### Replace the current weights

| Component | Old weight | New baseline weight |
|---|---|---|
| Organizational Capacity | 30% | **35%** |
| Data Availability & Quality | 30% | **30%** (unchanged) |
| AI-Specific Governance | 20% | **20%** |
| Technical Infrastructure | 20% | **15%** |

### Add documented sub-components

Each component now has internal sub-weights. These do not change the top-level weight; they exist for diagnostic granularity and must be captured in the data model and rendered in reports.

```
Organizational Capacity (35%)
  - Executive sponsorship & strategy:    15%
  - Talent & skills:                     10%
  - Change management & workflow redesign: 10%

Data Availability & Quality (30%)
  - Data quality:                        12%
  - Accessibility & integration:         10%
  - Governance, lineage, labeling:        8%

AI-Specific Governance (20%)
  - Regulatory compliance:               10%
  - Model risk management:                6%
  - Responsible AI (bias, explainability, oversight): 4%

Technical Infrastructure (15%)
  - MLOps & deployment:                   7%
  - Cloud/compute & integration:          5%
  - Security & observability:             3%
```

Note: sub-component percentages are absolute weights of the total, not percentages of the parent. They sum to the parent's top-level weight (35 + 30 + 20 + 15 = 100).

### Sector adjustments

Add a sector-adjustment selector at the engagement level. Adjustments override the baseline weights for the entire engagement. Implement these three presets plus a "Baseline" default:

```
Baseline:        Org 35% / Data 30% / Gov 20% / Infra 15%
Regulated:       Org 35% / Data 30% / Gov 25% / Infra 10%   (financial services, healthcare, public sector, employment, critical infrastructure)
Heavy-Regulated: Org 35% / Data 30% / Gov 30% / Infra  5%   (pharma, defense, EU AI Act high-risk)
Internal-Productivity: Org 40% / Data 25% / Gov 15% / Infra 20%   (creative, internal copilots, low-stakes automation)
RAG-or-FineTune-Heavy: Org 30% / Data 35% / Gov 20% / Infra 15%   (knowledge management, doc Q&A, fine-tuned models)
```

Each engagement record must store the selected sector preset so reports can label the methodology used.

### Implementation notes

- Define weights as a typed constant or DB-config table — never as magic numbers in scoring functions.
- The engagement record stores `sectorPreset: 'baseline' | 'regulated' | 'heavy_regulated' | 'internal_productivity' | 'rag_finetune_heavy'`.
- The scoring engine reads the engagement's `sectorPreset`, looks up the weight set, and applies it.
- Sub-component weights are constants (not adjustable per engagement) — they sum to the parent's adjusted weight after the preset is applied. Recompute sub-weights as `parentAdjustedWeight × (subWeight / parentBaselineWeight)`.

### Acceptance criteria

- [ ] All four top-level weights are read from a single config source.
- [ ] Sector preset is selectable at the engagement level and persists.
- [ ] Reports display both the preset name and the resulting weight set.
- [ ] Existing engagements created before this change default to `baseline` via migration.

---

## CHANGE 2 — ANCHORED 1–10 RUBRIC

Replace the current free-form 1–10 scoring with a Behaviorally Anchored Rating Scale (BARS). Each component has anchors at 1, 3, 5, 7, 10. Scores of 2, 4, 6, 8, 9 are interpolated between anchors. The assessor must see the anchor descriptions inline while scoring.

### Data model

Add the rubric as a structured data resource (JSON file, DB seed, or TS constant). Schema:

```typescript
type RubricAnchor = {
  level: 1 | 3 | 5 | 7 | 10;
  label: string;            // e.g., "AI-naive", "Pilot-driven, hero mode"
  description: string;      // 2-5 sentences, behaviorally specific
};

type ComponentRubric = {
  componentId: 'org_capacity' | 'data_readiness' | 'tech_infrastructure' | 'governance';
  componentName: string;
  anchors: RubricAnchor[];          // exactly 5 entries: levels 1, 3, 5, 7, 10
  threeVsSixGuidance: string;       // sharpened distinction text
};
```

### Full rubric content — embed verbatim

#### Component A — Organizational Capacity

**Level 1 — AI-naive.**
No AI strategy. No executive sponsor. No AI budget line. Staff use consumer ChatGPT on personal accounts. Zero or one isolated data scientist in a non-AI function.

**Level 3 — Pilot-driven, hero mode.**
One or two business units fund their own pilots. A small data science team of three to ten sits under analytics or IT. Executive interest is verbal. No board-approved AI strategy. Brown-bags exist; structured training reaches under 10% of relevant staff. No Center of Excellence. Talent is recruited ad hoc.

**Level 5 — Programmed but federated.**
A named C-level AI sponsor owns a multi-year strategy approved at ExCo with a dedicated budget. A formal AI/ML Center of Excellence is staffed at 20–50 FTE with data scientists, ML engineers, and at least one AI product manager. An enterprise learning license is in active use; at least 30% of relevant technical staff have completed role-based AI training. Basic AI literacy has rolled out to all employees.

**Level 7 — Embedded and scaling.**
AI strategy is integrated into enterprise strategy and reviewed quarterly with the Board. Embedded ML and AI engineers report into product teams. The CoE has shifted from delivery to platform mode. Defined career ladders exist for data scientists, ML engineers, MLOps engineers, AI PMs, and AI engineers. At least 60% of knowledge workers complete annual AI literacy refreshers. ML engineer to data scientist ratio is at least 1:1.

**Level 10 — AI-native operating model.**
Cross-functional pods include AI/ML talent by default. Compensation and hiring frameworks assess AI-augmented productivity. The org is a net importer of senior AI talent and publishes externally — papers, OSS, model cards. New product launches presume AI; "no-AI" requires justification.

**3 versus 6 — sharpened.**
At 3 there is talent in pockets and verbal sponsorship. At 6 there is a named C-level AI owner, an approved multi-year strategy with budget, a staffed CoE, and enterprise-licensed training in active use. The line is between project and function.

#### Component B — Data Readiness

**Level 1 — Siloed and opaque.**
Data lives in disconnected ERP, CRM, file shares, spreadsheets. No catalog. No lineage. Quality is unmeasured. No labeled training data. Unstructured documents are unindexed for semantic retrieval.

**Level 3 — Centralized but raw.**
A lakehouse or warehouse exists — Snowflake, Databricks, BigQuery, Redshift — and ingests most structured sources. A catalog is deployed but coverage is under 50% with sparse descriptions. Lineage is partial. Quality monitoring runs on a few critical tables. One or two ad hoc labeled datasets exist. RAG experiments use a single vector store with naive fixed-size chunking; retrieval accuracy is unmeasured.

**Level 5 — Governed and domain-owned.**
Data is organized by domain with named data product owners. At least 70% of high-value tables carry business-readable metadata, certified ownership, and downstream lineage. Data quality SLAs are continuously monitored on Tier-1 datasets with paged alerts via Monte Carlo, Great Expectations, or Soda. Data contracts govern at least one critical producer–consumer interface. PII classification and RBAC with column or row-level controls are enforced. RAG infrastructure is standardized: a sanctioned vector DB, a documented chunking strategy, versioned embedding models, and metadata prefixed onto chunks before embedding.

**Level 7 — Mesh-mature and RAG-industrialized.**
Federated data mesh with self-service data products, contracts on every cross-domain interface, an enterprise feature store powering at least three production ML systems with point-in-time correctness. Embeddings flow through a versioned pipeline with measured retrieval quality — recall@k, MRR, faithfulness. Curated labeled corpora carry provenance and refresh cadence. Multimodal data is supported. Synthetic data and human-in-the-loop labeling are in place.

**Level 10 — AI-optimized data platform.**
Production observability spans structured and unstructured data, embeddings, and prompt traces. Drift detection runs on input distributions and embedding spaces. Data products self-report fitness for specific AI use cases. End-to-end lineage from input to feature to model to output to user feedback. Privacy-enhancing techniques — differential privacy, federated learning, prompt tokenization — are productionized. A new RAG application launches on any sanctioned domain in days.

**3 versus 6 — sharpened.**
At 3 there is a centralized warehouse with pilot-grade RAG. At 6 there are named data product owners, monitored DQ SLAs on Tier-1 data, enforced data contracts on at least one critical pipeline, RBAC with PII classification, and a standardized embedding-and-chunking pipeline with measured retrieval quality.

#### Component C — Technical Infrastructure (AI/ML)

**Level 1 — Notebook on a laptop.**
Models built in personal Jupyter. No experiment tracking. No GPU access except via personal cloud. No model registry. Deployment is a pickled file emailed to engineering. Personal OpenAI keys. No vector DB. No monitoring.

**Level 3 — Pilot stack, manual glue.**
An experiment tracker is in use — MLflow, W&B, or Neptune. A managed ML platform is provisioned — SageMaker, Vertex AI, Azure ML, or Databricks. At least one foundation model API is procured with central billing. One or two models in production deployed manually as containerized REST APIs. CI for code; no CD for models. A vector DB exists for one RAG pilot.

**Level 5 — Standardized MLOps.**
A model registry is the single source of truth for production models with promotion gates — staging to prod with approvals. CI/CD pipelines automate training, validation, deployment; canary or shadow deployments are supported. A feature store serves at least one production model. Drift detection — PSI or KS on top features and predictions — runs continuously with paged alerts. Foundation model usage is centralized through an AI gateway for cost, rate-limiting, and data leakage prevention. LLMOps tooling — Langfuse, LangSmith, or Arize Phoenix — traces every prompt and response in at least one GenAI app, captures cost, latency, and tokens, and supports prompt versioning.

**Level 7 — Production-grade MLOps and LLMOps.**
Continuous training: retraining is triggered by drift or schedule. A champion-challenger framework runs in production. Multi-region deployment with blue/green and traffic mirroring. Inference meets defined latency and cost SLOs. Foundation models are fine-tuned in production with monitoring — LoRA, PEFT, or full fine-tunes — gated by eval suites. Eval pipelines run on every prompt or model change with golden datasets, LLM-as-judge, regression suites, and red-team probes. Vector DB is enterprise-tier with hybrid search and re-ranking. Agent framework with tool-use monitoring is in place.

**Level 10 — AI-native platform.**
Internal self-service: any team stands up a governed model or RAG app from a templated landing zone in hours. Multi-cluster GPU orchestration with right-sizing. Inference cost continuously optimized through batching, KV-cache reuse, model routing, and distillation. Mature agent infrastructure: tool registries, sandboxed execution, end-to-end traces, automated multi-turn evals. One-click rollback across the stack. Custom or fine-tuned models compete with vendor APIs on cost and quality and are routed dynamically.

**3 versus 6 — sharpened.**
At 3 there is a managed ML platform and a model deployed manually. At 6 there is a centrally enforced model registry with promotion gates, automated CI/CD for models, a feature store powering at least one production model, drift monitoring with alerts, a centralized AI gateway, and LLMOps tracing on at least one GenAI app. The line is between tools and a paved road.

#### Component D — AI Governance

**Level 1 — Unaware.**
No AI policy. No inventory of AI systems. Shadow AI is rampant. No model risk function. No bias testing. No incident response plan for AI. Procurement contracts do not address AI. EU AI Act, NIST AI RMF, and SR 11-7 are unfamiliar.

**Level 3 — Policy on paper.**
A Responsible AI policy is published, often by Legal or Risk, listing principles. An informal ethics committee meets occasionally. A nascent AI inventory spreadsheet exists but misses shadow AI and embedded vendor AI. High-risk use cases are reviewed case by case, often after build. Some models have ad hoc fairness checks. Vendor AI is procured without standard AI clauses.

**Level 5 — Active governance function.**
A standing AI governance committee meets at least monthly with cross-functional membership — Legal, Risk, Privacy, Security, Product, Data Science — and an ExCo-approved charter. A mandatory pre-build intake exists with documented risk classification aligned to EU AI Act tiers. The AI inventory is centralized and includes vendor and embedded AI, updated at procurement and change-management gates. Model risk tiering on a materiality and complexity matrix drives validation depth, in the SR 11-7 tradition. Model cards and datasheets for datasets are produced for production models. Bias testing runs on a defined cadence. An AI incident response runbook exists; one tabletop has been completed.

**Level 7 — Operationalized and auditable.**
Independent model validation reviews high-risk models pre-production and on a tiered cycle thereafter. NIST AI RMF Govern, Map, Measure, Manage practices are mapped to internal controls with automated evidence collection. EU AI Act conformity assessment is implemented for high-risk systems — technical documentation, FRIA where applicable, post-market monitoring, EU database registration. Bias pipelines run on every model release with disparate-impact thresholds. System cards are required for compound AI systems. Incidents are logged in a tracked register. Vendor AI undergoes standardized AI due diligence. Internal Audit performs continuous controls testing.

**Level 10 — Embedded and adaptive.**
Governance is shifted left: every AI workflow has policy-as-code controls enforced at the platform — a model cannot be promoted without passing fairness, robustness, privacy, and documentation gates emitting machine-readable evidence. Real-time monitoring detects bias drift, hallucination rates, jailbreaks, prompt injection, and exfiltration with auto-rollback. The org contributes to standards — ISO/IEC 42001, NIST, sector regs — and publishes transparency reports. Agentic systems carry capability cards and continuous policy attestation.

**3 versus 6 — sharpened.**
At 3 there is a written policy and an informal committee. At 6 there is a chartered standing committee with monthly cadence, a mandatory pre-build intake with risk classification, a centralized inventory covering vendor and embedded AI, model risk tiering driving validation depth, model cards and datasheets for production models, fairness testing on a defined cadence, and a tested AI incident response playbook. The line is between aspirational and operational.

### UI behavior

- Wherever an assessor enters a 1–10 score, render the level-1, 3, 5, 7, 10 anchors inline (collapsible accordion or tooltip on each integer).
- Always render the **3 versus 6** guidance prominently — this is the most common assessor-disagreement boundary.
- The score input must be an integer 1–10. No decimals.

### Acceptance criteria

- [ ] Rubric data is structured, queryable, and editable without code changes.
- [ ] Every score-input UI element shows the relevant anchors.
- [ ] The "3 vs 6" guidance is visible at score time, not just in documentation.
- [ ] Reports cite the rubric version used for the engagement.

---

## CHANGE 3 — THREE-LAYER HYBRID QUADRANT METHODOLOGY

Replace the current quadrant assignment with the three-layer logic below. Implement as a single function that takes a use-case scoring object and a portfolio context, and returns a quadrant label plus diagnostic metadata.

### Layer 1 — Hard floors (knock-out criteria)

A use case is **Foundation** regardless of its scores if it fails any of:

```
- Value Score < 6.0
- Data does not exist OR cannot be assembled within the engagement timeline   (boolean: dataAvailableForEngagement)
- No named business sponsor accountable for adoption                          (boolean: hasNamedSponsor)
- Time-to-pilot > 12 weeks                                                    (number: timeToPilotWeeks)
```

Add these four fields to the use-case data model. The first is computed; the other three are assessor-captured at intake.

### Layer 2 — Default absolute quadrants

For use cases that pass Layer 1:

```
Champions:    Value >= 7.5 AND Readiness >= 7.5
Strategic:    Value >= 7.5 AND 6.0 <= Readiness < 7.5
Quick Wins:   6.0 <= Value < 7.5 AND Readiness >= 7.5
Foundation:   anything else above the floor (i.e., passed Layer 1 but didn't qualify above)
```

The floor for Quick Wins / Strategic on the off-axis is **6.0**, not 5.0. A 5.x readiness is Foundation.

### Layer 3 — Conditional Champion promotion

**Activate only if Layer 2 produced zero Champions and zero Quick Wins** across the entire engagement portfolio.

When activated:
1. Take all use cases that passed Layer 1.
2. Rank by composite score: `0.5 × Value + 0.5 × Readiness`.
3. Promote the top **2** to **Conditional Champion**.
4. Each Conditional Champion record must capture:
   - The specific gap(s) preventing unconditional Champion status (e.g., "Data Readiness 5 → needs 7", "Org Capacity 4 → needs 6").
   - The proposed readiness-uplift sprint (4–6 weeks default).
   - Reclassification criteria — the specific score thresholds that will move it to unconditional Champion.

### Pseudocode

```typescript
type Quadrant =
  | 'champion'
  | 'conditional_champion'
  | 'strategic'
  | 'quick_win'
  | 'foundation';

type UseCaseScoring = {
  id: string;
  valueScore: number;          // 1.0–10.0, normalized
  readinessScore: number;      // 1.0–10.0, weighted composite
  componentScores: { org: number; data: number; tech: number; gov: number };
  hasNamedSponsor: boolean;
  dataAvailableForEngagement: boolean;
  timeToPilotWeeks: number;
};

type QuadrantAssignment = {
  quadrant: Quadrant;
  layer: 1 | 2 | 3;
  rationale: string;
  conditionalChampionMeta?: {
    gaps: Array<{ component: string; current: number; required: number }>;
    proposedSprintWeeks: number;
    reclassificationCriteria: string;
  };
};

function assignQuadrant(
  uc: UseCaseScoring,
  portfolio: UseCaseScoring[]
): QuadrantAssignment {
  // Layer 1 — hard floors
  const failsFloor =
    uc.valueScore < 6.0 ||
    !uc.dataAvailableForEngagement ||
    !uc.hasNamedSponsor ||
    uc.timeToPilotWeeks > 12;

  if (failsFloor) {
    return { quadrant: 'foundation', layer: 1, rationale: floorFailureReason(uc) };
  }

  // Layer 2 — default absolute quadrants
  const v = uc.valueScore;
  const r = uc.readinessScore;

  if (v >= 7.5 && r >= 7.5) return { quadrant: 'champion', layer: 2, rationale: '...' };
  if (v >= 7.5 && r >= 6.0) return { quadrant: 'strategic', layer: 2, rationale: '...' };
  if (v >= 6.0 && r >= 7.5) return { quadrant: 'quick_win', layer: 2, rationale: '...' };

  const layer2Foundation: QuadrantAssignment = {
    quadrant: 'foundation',
    layer: 2,
    rationale: 'Above floor but below Champion/Strategic/Quick Win thresholds',
  };

  // Layer 3 — Conditional Champion promotion
  // Only activates if portfolio has zero champions AND zero quick wins under Layer 2
  const portfolioHasChampions = portfolio.some(p =>
    p.valueScore >= 7.5 && p.readinessScore >= 7.5 && passesFloor(p)
  );
  const portfolioHasQuickWins = portfolio.some(p =>
    p.valueScore >= 6.0 && p.valueScore < 7.5 && p.readinessScore >= 7.5 && passesFloor(p)
  );

  if (portfolioHasChampions || portfolioHasQuickWins) {
    return layer2Foundation;
  }

  // Portfolio is weak — promote top 2 by composite score
  const eligible = portfolio.filter(passesFloor);
  const ranked = [...eligible].sort(
    (a, b) => composite(b) - composite(a)
  );
  const top2Ids = ranked.slice(0, 2).map(p => p.id);

  if (top2Ids.includes(uc.id)) {
    return {
      quadrant: 'conditional_champion',
      layer: 3,
      rationale: 'Top composite score in a weak portfolio; promoted with named gaps',
      conditionalChampionMeta: buildGapMeta(uc),
    };
  }

  return layer2Foundation;
}

function composite(uc: UseCaseScoring): number {
  return 0.5 * uc.valueScore + 0.5 * uc.readinessScore;
}
```

### Edge case handling

- **Strong portfolio (many Champions).** Add a secondary sort: Layer-2 Champions ranked by composite score; top 30% labeled `Wave 1` and the rest `Wave 2`. This is a label, not a separate quadrant.
- **Tie at the cut-off.** Round component scores to 1 decimal. Tiebreak in favor of higher Value first, then higher Readiness, then earlier `createdAt`.
- **Empty portfolio.** Return an empty assignment list and surface a UI warning.
- **Single-use-case portfolio.** Layer 3 still applies but only promotes 1 use case if it passes Layer 1.

### Acceptance criteria

- [ ] `assignQuadrant` is unit-tested with at least these scenarios:
  - Healthy portfolio with multiple champions.
  - Weak portfolio (Layer 3 activates, top 2 promoted to Conditional Champion).
  - Mixed portfolio (Layer 2 produces some champions; Layer 3 stays inactive).
  - Use case fails knock-out (Value < 6, no sponsor, timeToPilot > 12, data unavailable) — each tested independently.
  - Tie at the 7.5 boundary.
- [ ] Conditional Champion assignments always carry `conditionalChampionMeta` with non-empty gaps array.
- [ ] No use case is ever assigned `champion` if it fails Layer 1.

---

## CHANGE 4 — JSON OUTPUT SCHEMA

Update the JSON schema emitted for reports and exports. Bump schema version to `2.0`.

### New top-level engagement fields

```json
{
  "schemaVersion": "2.0",
  "engagement": {
    "id": "...",
    "client": "...",
    "sectorPreset": "regulated",
    "weights": {
      "orgCapacity": 0.35,
      "dataReadiness": 0.30,
      "governance": 0.25,
      "techInfrastructure": 0.10
    },
    "rubricVersion": "2.0"
  }
}
```

### Updated use-case object

```json
{
  "id": "uc_001",
  "title": "...",
  "valueScore": 8.2,
  "readinessScore": 6.7,
  "componentScores": {
    "orgCapacity": { "score": 7, "subComponents": { "sponsorship": 8, "talent": 6, "changeManagement": 7 } },
    "dataReadiness": { "score": 6, "subComponents": { "quality": 7, "accessibility": 6, "governance": 5 } },
    "governance": { "score": 7, "subComponents": { "regulatory": 8, "modelRisk": 6, "responsibleAI": 7 } },
    "techInfrastructure": { "score": 6, "subComponents": { "mlops": 6, "cloud": 7, "security": 5 } }
  },
  "knockOutCriteria": {
    "hasNamedSponsor": true,
    "dataAvailableForEngagement": true,
    "timeToPilotWeeks": 8
  },
  "compositeScore": 7.45,
  "quadrant": "conditional_champion",
  "quadrantLayer": 3,
  "quadrantRationale": "Top composite score in a weak portfolio",
  "conditionalChampionMeta": {
    "gaps": [
      { "component": "dataReadiness", "current": 6, "required": 7 }
    ],
    "proposedSprintWeeks": 5,
    "reclassificationCriteria": "Data Readiness must reach 7.0+ via DQ SLA + data contract on customer table"
  }
}
```

### Backward compatibility

- Keep the old schema readable. If a request specifies `schemaVersion: "1.0"`, emit the old shape (best effort) for legacy report consumers.
- All new exports default to `2.0`.

### Acceptance criteria

- [ ] Schema is documented (e.g., a `SCHEMA.md` or JSON Schema file in repo).
- [ ] All exports include `schemaVersion`, `sectorPreset`, `weights`, and `rubricVersion`.
- [ ] Conditional Champion exports always include `conditionalChampionMeta`.

---

## CHANGE 5 — REPORT RENDERING

Update report templates and matrix-rendering components to:

1. **Display the methodology header.** On every report, show `Sector Preset: {name}` and the resulting weight set as a small table or pill row.
2. **Render five quadrants, not four.** The matrix visual must show: Champion, Conditional Champion, Strategic, Quick Win, Foundation. Conditional Champion is rendered with a distinct visual treatment (e.g., dashed border, badge, "Pending Readiness Sprint" label).
3. **Show the floor failure reason.** For any use case in Foundation due to Layer 1, render the specific failure (e.g., "No named sponsor" or "Time-to-pilot 16 weeks").
4. **Show gaps and sprint plan for Conditional Champions.** A dedicated section per Conditional Champion: gaps table, proposed sprint weeks, reclassification criteria.
5. **Add a methodology appendix.** Brief rubric summary (one paragraph per component) and citation that the framework is Value-Readiness Matrix v2.0.
6. **Sub-component drill-down.** Where the original report showed only top-level Readiness (composite), add an expandable section showing all 12 sub-component scores.

### Acceptance criteria

- [ ] Every report PDF/HTML includes the methodology header.
- [ ] Conditional Champions are visually distinct and carry their gap/sprint metadata.
- [ ] Foundation use cases that failed Layer 1 surface the specific reason.
- [ ] Methodology appendix is generated automatically from rubric data, not hard-coded.

---

## CHANGE 6 — DATA MIGRATION

Existing engagements and use cases must continue to function after this release.

### Strategy

1. **Engagement records** without `sectorPreset` → set to `baseline`.
2. **Use case records** without knock-out fields → set defaults:
   - `hasNamedSponsor`: `null` (forces re-capture; treat null as "fails Layer 1" until reviewed)
   - `dataAvailableForEngagement`: `null` (same behavior)
   - `timeToPilotWeeks`: `null` (treat as failing if null)
3. **Re-run scoring** on all existing use cases under v2 weights and Layer 1/2/3 logic. Persist new quadrant assignments in a new `quadrant_v2` field. Keep the original `quadrant` field for one release as `quadrant_v1` for audit trail.
4. **Flag impacted engagements** in an admin dashboard so consultants can review use cases that shifted quadrants.

### Acceptance criteria

- [ ] Migration script runs idempotently.
- [ ] No data loss; v1 quadrant assignments preserved as `quadrant_v1`.
- [ ] An admin report lists every use case whose quadrant changed under v2.

---

## CHANGE 7 — TESTS

Add or update tests covering:

1. Weight resolution under each sector preset.
2. Sub-component weight summation (must equal parent).
3. Rubric data integrity (every component has exactly 5 anchors at levels 1, 3, 5, 7, 10).
4. `assignQuadrant` against the full scenario matrix in Change 3.
5. JSON schema validation against fixtures for each quadrant outcome.
6. Migration script idempotency.

### Acceptance criteria

- [ ] All tests pass in CI.
- [ ] Test coverage on `assignQuadrant` is 100% branch coverage.
- [ ] Snapshot tests exist for at least three report fixtures (healthy portfolio, weak portfolio, regulated-sector portfolio).

---

## OUT OF SCOPE — DO NOT TOUCH

- Value Score normalization logic (the `Expected Value × P(success) / Friction Cost` calculation and min-max normalization). It is correct and stays.
- Authentication, authorization, or multi-tenant isolation.
- Any agentic or LLM features unrelated to scoring/reporting.
- Any UI redesign beyond what is required for the rubric anchors and the Conditional Champion quadrant.

---

## DELIVERABLES CHECKLIST

When complete, the agent should produce:

1. A summary diff describing every file touched.
2. The discovery report from the top of this document.
3. Migration log: count of engagements migrated, count of use cases re-scored, count of quadrant changes.
4. Test results.
5. A short release note draft suitable for the engagement-leads channel.

Do not mark the task complete until all acceptance criteria across Changes 1–7 are checked off explicitly.

---

## NOTES FOR THE AGENT

- The four readiness components are the same as before — only weights, sub-components, and anchored scoring change. Do not rename the components.
- The methodology version `2.0` is meaningful. Surface it everywhere the framework is named.
- The most common implementation mistake will be applying Layer 3 when Layer 2 already produced champions. Read the Layer 3 activation condition carefully.
- The second most common mistake will be forgetting to round to 1 decimal when comparing against the 7.5 / 6.0 thresholds, producing flaky boundary behavior. Always round before comparison.
- If the existing app stores scores as strings or has loose typing, tighten types as part of this work.
