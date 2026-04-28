# REPLIT IMPLEMENTATION PROMPT — Value-Readiness Matrix v2.2

> Paste this entire document into Replit Agent as a single brief. This is the third corrective release on top of v2.0 and v2.1. The geometry, color system, prototyping minimum, and Executive Board Report all need to change. The framework math from v2.1 stays — only the application of it changes.

---

## MISSION

The v2.1 release fixed value normalization and Layer 3 activation. The matrix output is still unusable. Looking at the live engagement screenshot:

- **All 10 use cases are bunched in the lower-left** at Readiness 2–4, Value 5–6
- **Quadrants are not visually equal** — Champions occupies ~25% of the chart, Foundation ~50%, Strategic ~25%, Quick Wins is invisible against the Foundation area
- **The "Conditional Champion zone" is an empty dashed box in the upper-right** while the actual Conditional Champion use cases are plotted in the lower-left where their scores place them
- **Methodology Integrity says "No warnings"** for a portfolio where every score is bunched at the low end — the diagnostic is silent when it should be loud
- **Color treatment is muddy** — multiple greys, weird teals, dashed orange overlay, no semantic meaning to the colors
- **0 Champions and 0 Quick Wins** — the only reason any prototyping candidate exists is because Layer 3 promoted 2 to Conditional Champion

The root cause is the quadrant cut at 7.5 on both axes. With cuts at 7.5, the Champions zone is the top-right 6.25% of the chart area. A portfolio with Readiness scores topping out at 5.9 cannot, mathematically, produce a single Champion. The framework is geometrically rigged against the consultant.

This release fixes six things:

1. **Quadrant cuts move to 5.5 / 5.5** — four visually equal boxes
2. **A clean four-color semantic palette** with distinct, accessible fills
3. **A guaranteed-minimum-3 prototyping candidates rule** with explicit safety-net logic
4. **Conditional Champions plotted at their actual scores** with dashed borders, no overlay zones
5. **Methodology Integrity warnings retuned** for the new geometry, no more "all clear" on bunched portfolios
6. **An Executive Board Report section** that explains the four readiness components and their 1–10 anchors in a polished, client-ready format

---

## CHANGES — IMPLEMENT IN ORDER

### CHANGE 1 — Replace 7.5 / 7.5 quadrant cuts with 5.5 / 5.5

The single most important change. With quadrant boundaries at the midpoint of the 1–10 scale, the four quadrants become visually equal and a normal portfolio populates all four.

#### New quadrant definitions

```typescript
const QUADRANT_CUT = 5.5;  // single source of truth, both axes

type Quadrant = 'champion' | 'quick_win' | 'strategic' | 'foundation';

function classifyQuadrant(valueScore: number, readinessScore: number): Quadrant {
  const v = valueScore;
  const r = readinessScore;
  
  if (v >= QUADRANT_CUT && r >= QUADRANT_CUT) return 'champion';
  if (v >= QUADRANT_CUT && r <  QUADRANT_CUT) return 'strategic';
  if (v <  QUADRANT_CUT && r >= QUADRANT_CUT) return 'quick_win';
  return 'foundation';
}
```

#### Quadrant labels and definitions for reports

| Quadrant | Position | Definition | Strategic guidance |
|---|---|---|---|
| **Champions** | Top-right | Value ≥ 5.5 AND Readiness ≥ 5.5 | Deploy now. Wave 1 prototyping candidates. |
| **Quick Wins** | Bottom-right | Value < 5.5 AND Readiness ≥ 5.5 | Fast prototyping. Lower business impact, but the path is clear. |
| **Strategic Bets** | Top-left | Value ≥ 5.5 AND Readiness < 5.5 | High value pending readiness uplift. Plan a 4–8 week preparation sprint. |
| **Foundation** | Bottom-left | Value < 5.5 AND Readiness < 5.5 | Park. Revisit after readiness program matures. |

#### Important — keep but rename a tier concept

The 7.5 threshold from v2.0 was not wrong as a *tier* concept, only as a *quadrant boundary*. Keep it as a **secondary tier label** inside Champions:

- **Lead Champions** = Value ≥ 7.5 AND Readiness ≥ 7.5 (top-tier within the Champions quadrant)
- **Champions** = everything else in the Champions quadrant

Lead Champions render as larger or more saturated bubbles in the matrix and surface first in the prototyping wave plan. The same applies to Quick Wins:

- **Lead Quick Wins** = Value ≥ 5.5 AND Readiness ≥ 7.5 (notably high readiness)

This way you preserve the calibration value of the 7.5 line without using it as the quadrant boundary.

#### Acceptance criteria

- [ ] All four quadrant boxes render at exactly equal size on the matrix (1–5.5 and 5.5–10 on each axis).
- [ ] A use case at Value 5.6, Readiness 5.6 is classified as Champion.
- [ ] A use case at Value 8.0, Readiness 8.0 is classified as Lead Champion.
- [ ] Configuration is read from a single constant `QUADRANT_CUT` and a single constant `LEAD_TIER_CUT = 7.5`. No magic numbers anywhere else.

---

### CHANGE 2 — Apply a clean four-color semantic palette

The current matrix uses overlapping translucent fills, dashed orange overlays, and muted greys that create visual confusion. Replace with the palette below. The colors are picked for semantic meaning, accessibility (WCAG AA contrast), and screen-projector legibility.

#### Quadrant fills (matrix background)

| Quadrant | Background fill | Border | Label color |
|---|---|---|---|
| **Champions** (top-right) | `#10b98114` (emerald @ 8% opacity) | `#10b98166` | `#059669` |
| **Quick Wins** (bottom-right) | `#06b6d414` (cyan @ 8% opacity) | `#06b6d466` | `#0891b2` |
| **Strategic Bets** (top-left) | `#6366f114` (indigo @ 8% opacity) | `#6366f166` | `#4f46e5` |
| **Foundation** (bottom-left) | `#64748b14` (slate @ 8% opacity) | `#64748b66` | `#475569` |

The fills should be solid colors at low opacity, not gradients or hatching. The cut lines between quadrants are 1px solid in the border color of either neighbor.

#### Use case bubble colors

Bubbles take their color from the quadrant they fall in:

| Classification | Fill | Border | Border style |
|---|---|---|---|
| Lead Champion | `#10b981` (emerald 500) | `#047857` | solid 2px |
| Champion | `#34d399` (emerald 400) | `#059669` | solid 2px |
| Lead Quick Win | `#06b6d4` (cyan 500) | `#0e7490` | solid 2px |
| Quick Win | `#22d3ee` (cyan 400) | `#0891b2` | solid 2px |
| Strategic Bet | `#818cf8` (indigo 400) | `#4f46e5` | solid 2px |
| Foundation | `#94a3b8` (slate 400) | `#475569` | solid 2px |
| **Conditional (any tier)** | inherits its target classification color | same | **dashed 2px, 4-2 dasharray** |
| Hard-floor failure | `#ef4444` (red 500) at 40% opacity | `#dc2626` | solid 2px |

#### Bubble size encoding

Replace the current "larger = faster time-to-value" with **smaller = faster time-to-value**, which matches user intuition (smaller dot = lighter lift). Map:

```
TTV ≤ 4 weeks  → 8 px radius
TTV 5–8 weeks  → 12 px radius
TTV 9–12 weeks → 16 px radius
TTV 13–16 weeks → 20 px radius
TTV > 16 weeks → 24 px radius
```

Update the legend to read: **"Smaller bubble = faster time-to-value."**

#### Remove the "Conditional Champion zone" overlay

Delete the dashed orange box currently rendered in the upper-right. Conditional Champions are plotted at their actual (Readiness, Value) coordinates with a dashed border. The dashed border is the only visual signal of "Conditional" status. There is no separate zone.

#### Acceptance criteria

- [ ] All four quadrant fills are visible and visually distinct on screen and in printed reports.
- [ ] A blind test (consultant who hasn't seen the framework) can name which quadrant is "deploy now" by color alone.
- [ ] No dashed overlay zones exist anywhere on the matrix.
- [ ] Bubble size legend reads "smaller = faster" not "larger = faster".

---

### CHANGE 3 — Guarantee minimum 3 prototyping candidates with safety-net promotion

The framework must produce at least 3 prototyping candidates per engagement. Otherwise the engagement cannot move to prototyping and the deliverable has failed its purpose.

Define:

```
PrototypingCandidate = use case classified as
  Champion, Lead Champion, Quick Win, Lead Quick Win,
  OR Conditional Champion / Conditional Quick Win (Layer 3 promotions)
```

#### New three-layer logic (revised)

```typescript
const MIN_PROTOTYPING_CANDIDATES = 3;

function assignClassifications(
  portfolio: UseCaseScoring[],
  cfg: EngagementConfig
): ClassifiedUseCase[] {
  // Step 1 — evaluate hard floors
  const evaluated = portfolio.map(uc => ({
    uc,
    floor: evaluateFloors(uc, cfg)  // from v2.1
  }));
  
  // Step 2 — initial classification using 5.5 / 5.5 cuts
  const classified = evaluated.map(({ uc, floor }) => {
    if (floor.hardFailures.length > 0) {
      return { uc, classification: 'foundation_hard_fail', floor };
    }
    const q = classifyQuadrant(uc.valueScore, uc.readinessScore);
    const tier = (uc.valueScore >= LEAD_TIER_CUT && uc.readinessScore >= LEAD_TIER_CUT)
      ? 'lead' : 'standard';
    return { uc, classification: q, tier, floor };
  });
  
  // Step 3 — count natural prototyping candidates
  const naturalCandidates = classified.filter(c =>
    c.classification === 'champion' || c.classification === 'quick_win'
  );
  
  if (naturalCandidates.length >= MIN_PROTOTYPING_CANDIDATES) {
    return classified;  // no promotion needed
  }
  
  // Step 4 — safety-net promotion
  // Promote enough use cases to reach MIN_PROTOTYPING_CANDIDATES.
  // Eligible for promotion: Strategic or Foundation use cases that
  // (a) passed hard floors, and (b) have the highest composite scores.
  const needed = MIN_PROTOTYPING_CANDIDATES - naturalCandidates.length;
  
  const promotionCandidates = classified
    .filter(c =>
      (c.classification === 'strategic' || c.classification === 'foundation')
      && c.floor.hardFailures.length === 0
    )
    .sort((a, b) => composite(b.uc) - composite(a.uc))
    .slice(0, needed);
  
  for (const pc of promotionCandidates) {
    // Determine target quadrant: the one closer to in score-distance
    const distToChampion = euclid(pc.uc, { value: 5.5, readiness: 5.5 });
    pc.classification = pc.uc.readinessScore >= pc.uc.valueScore
      ? 'conditional_quick_win'
      : 'conditional_champion';
    pc.isConditional = true;
    pc.conditionalGap = computeGap(pc.uc);
  }
  
  return classified;
}

function composite(uc: UseCaseScoring): number {
  return 0.5 * uc.valueScore + 0.5 * uc.readinessScore;
}
```

#### Edge cases

- **Fewer than 3 use cases pass hard floors.** Render an explicit critical warning: "Only N use cases passed hard floors. Prototyping requires a minimum of 3. Review intake assumptions before proceeding." Do not promote hard-failed cases.
- **All use cases naturally Champions.** Apply Wave 1 / Wave 2 sequencing as in v2.1 — top 30% by composite become Wave 1.
- **Tie at the cut line.** Round both scores to one decimal. Tiebreak in favor of higher Value, then higher Readiness, then earlier `createdAt`.

#### Acceptance criteria

- [ ] Test fixture (see Diagnostic Test Case below) produces ≥ 3 prototyping candidates.
- [ ] Natural Champions and Quick Wins are not displaced by Conditional promotions — Conditionals only fill the gap.
- [ ] Conditional Champions and Conditional Quick Wins are plotted at their actual (Readiness, Value) coordinates with dashed borders, not at promoted positions.
- [ ] When fewer than 3 use cases pass hard floors, the critical warning fires and no Conditional promotion happens.

---

### CHANGE 4 — Retune Methodology Integrity warnings for the new geometry

The diagnostic panel went silent on a clearly broken portfolio in v2.1. Retune the warning rules for the 5.5 cut geometry.

#### Updated warning rules

| Code | Condition | Severity | Message | Recommended action |
|---|---|---|---|---|
| `EMPTY_MATRIX` | Champions + Quick Wins + Conditionals = 0 | critical | "No prototyping candidates produced. Engagement cannot proceed to prototyping." | Review value and readiness intake. Confirm scoring against rubrics. |
| `BELOW_MIN_CANDIDATES` | Natural (non-conditional) Champions + Quick Wins < 3 | warning | "Portfolio produced N natural prototyping candidates. Safety-net promotion applied." | Validate Conditional Champions with sponsor before prototyping commits. |
| `READINESS_BUNCHED_LOW` | Median Readiness < 5.0 across portfolio | warning | "Readiness scores are bunched at the low end. The portfolio likely needs a Wave 0 readiness program before prototyping." | Propose 6–8 week readiness uplift sprint. |
| `READINESS_BUNCHED_HIGH` | Median Readiness > 8.0 AND Quick Wins > Champions | info | "Readiness is uniformly high; differentiation is in Value." | Focus client conversations on business impact. |
| `VALUE_DISTRIBUTION_SKEWED` | Median Value < 4.0 OR > 8.0 | warning | "Value normalization may not be capturing portfolio shape well." | Verify EV inputs, friction baselines, and probability assumptions. |
| `INTAKE_INCOMPLETE` | More than 30% of use cases have null sponsor or null data availability | warning | "Intake fields incomplete — sponsor and data fields must be confirmed before prototyping." | Schedule a 30-minute intake completion session. |
| `HARD_FLOOR_DOMINANT` | More than 40% of use cases hard-failed Layer 1 | warning | "Many use cases below absolute value floor. Re-examine friction baselines." | Sanity-check the EV / Friction ratios. |
| `STRONG_PORTFOLIO` | Lead Champions > 3 | info | "Strong portfolio. Wave 1 / Wave 2 sequencing applied." | Sequence by capacity, not score. |

The panel must render at least one warning whenever any one of these fires. The "all clear" message is reserved for portfolios with ≥ 3 natural Champions or Quick Wins, balanced distributions, and no soft blockers above the 30% threshold.

#### Acceptance criteria

- [ ] On the diagnostic test fixture (see below), at least `BELOW_MIN_CANDIDATES` and `READINESS_BUNCHED_LOW` fire.
- [ ] An "all clear" message only appears when no warning rules trigger.
- [ ] Critical warnings render in red at the top of the report. Warnings render in amber. Info renders in blue, deprioritized.

---

### CHANGE 5 — Add a "How We Score Readiness" section to the Executive Board Report

The report must teach the client how the four readiness components are scored. Currently the report shows scores without explaining the scale, which leaves clients unable to validate their own assessments.

Add a section titled **"How We Score Readiness"** between the Executive Summary and the Use Case Detail sections. It is **never** in an appendix — executives will not find it there. The section presents the four components in a polished, board-ready format.

#### Section structure

A short introductory paragraph followed by four component cards. Each card has the same structure for visual consistency. Use the rubric content from v2.0 verbatim — do not paraphrase. Format as styled component cards with consistent typography and spacing.

#### Introductory paragraph (use verbatim)

> Readiness is a weighted composite of four components, each scored from 1 to 10 against behaviorally anchored descriptions. The anchors are intentionally specific — they describe observed states with named artifacts, not aspirations. The 3-versus-6 boundary, where most assessor disagreements occur, is sharpened in each component below. A use case becomes a prototyping candidate only when the readiness composite is meaningful, which is why the rubrics matter.

#### Component card template

For each of the four components, render a card with these elements:

```
┌─────────────────────────────────────────────────────┐
│  [Component Name]               Weight: [N%]         │
│  [One-sentence definition]                           │
│                                                      │
│  Scoring anchors                                     │
│  ┌───┬──────────────────────────────────────────┐   │
│  │ 1 │ [Level 1 label] — [Level 1 description]  │   │
│  │ 3 │ [Level 3 label] — [Level 3 description]  │   │
│  │ 5 │ [Level 5 label] — [Level 5 description]  │   │
│  │ 7 │ [Level 7 label] — [Level 7 description]  │   │
│  │ 10│ [Level 10 label] — [Level 10 description]│   │
│  └───┴──────────────────────────────────────────┘   │
│                                                      │
│  3 vs 6 — where assessors most often disagree        │
│  [3 vs 6 sharpening text]                            │
└─────────────────────────────────────────────────────┘
```

#### Component A — Organizational Capacity (Weight: 35%)

**Definition:** Whether the organization has the executive sponsorship, talent, and change-management capability to absorb an AI deployment.

**Scoring anchors:**

- **1 — AI-naive.** No AI strategy, no executive sponsor, no AI budget line, staff use consumer ChatGPT on personal accounts, zero or one isolated data scientist in a non-AI function.
- **3 — Pilot-driven, hero mode.** One or two business units fund their own pilots, a small data science team of three to ten sits under analytics or IT, executive interest is verbal, no board-approved AI strategy, brown-bags exist but structured training reaches under 10% of relevant staff, no Center of Excellence, talent is recruited ad hoc.
- **5 — Programmed but federated.** A named C-level AI sponsor owns a multi-year strategy approved at ExCo with a dedicated budget, a formal AI/ML Center of Excellence is staffed at 20–50 FTE with data scientists and ML engineers, an enterprise learning license is in active use with at least 30% of relevant technical staff completing role-based AI training, basic AI literacy has rolled out to all employees.
- **7 — Embedded and scaling.** AI strategy is integrated into enterprise strategy and reviewed quarterly with the Board, embedded ML and AI engineers report into product teams, the CoE has shifted from delivery to platform mode, defined career ladders exist for data scientists and ML engineers, at least 60% of knowledge workers complete annual AI literacy refreshers.
- **10 — AI-native operating model.** Cross-functional pods include AI/ML talent by default, compensation frameworks assess AI-augmented productivity, the org is a net importer of senior AI talent and publishes externally, new product launches presume AI and "no-AI" requires justification.

**3 vs 6:** At 3, talent exists in pockets and sponsorship is verbal. At 6, there is a named C-level AI owner, an approved multi-year strategy with budget, a staffed Center of Excellence, and enterprise-licensed training in active use. The line is between project and function.

#### Component B — Data Availability & Quality (Weight: 30%)

**Definition:** Whether the data needed for the use case exists, is accessible, is governed, and is fit for AI consumption.

**Scoring anchors:**

- **1 — Siloed and opaque.** Data lives in disconnected ERP, CRM, file shares, spreadsheets, with no catalog, no lineage, unmeasured quality, no labeled training data, and unstructured documents unindexed for semantic retrieval.
- **3 — Centralized but raw.** A lakehouse or warehouse exists and ingests most structured sources, a catalog is deployed but coverage is under 50% with sparse descriptions, lineage is partial, quality monitoring runs on a few critical tables, RAG experiments use a single vector store with naive fixed-size chunking and unmeasured retrieval accuracy.
- **5 — Governed and domain-owned.** Data is organized by domain with named data product owners, at least 70% of high-value tables carry business-readable metadata and certified ownership, data quality SLAs are continuously monitored on Tier-1 datasets with paged alerts, data contracts govern at least one critical producer–consumer interface, RAG infrastructure is standardized with a sanctioned vector DB and documented chunking strategy.
- **7 — Mesh-mature and RAG-industrialized.** Federated data mesh with self-service data products, contracts on every cross-domain interface, an enterprise feature store powering at least three production ML systems, embeddings flow through a versioned pipeline with measured retrieval quality, curated labeled corpora carry provenance and refresh cadence.
- **10 — AI-optimized data platform.** Production observability spans structured and unstructured data, embeddings, and prompt traces, drift detection runs on input distributions and embedding spaces, end-to-end lineage from input to feature to model to output to user feedback, privacy-enhancing techniques are productionized.

**3 vs 6:** At 3, there is a centralized warehouse with pilot-grade RAG. At 6, there are named data product owners, monitored DQ SLAs on Tier-1 data, enforced data contracts on at least one critical pipeline, RBAC with PII classification, and a standardized embedding-and-chunking pipeline with measured retrieval quality.

#### Component C — AI-Specific Governance (Weight: 20%)

**Definition:** Whether the organization has the policies, committees, model risk management, and regulatory readiness required to deploy AI safely and compliantly.

**Scoring anchors:**

- **1 — Unaware.** No AI policy, no inventory of AI systems, shadow AI is rampant, no model risk function, no bias testing, no incident response plan for AI, procurement contracts do not address AI, EU AI Act and NIST AI RMF are unfamiliar.
- **3 — Policy on paper.** A Responsible AI policy is published listing principles, an informal ethics committee meets occasionally, a nascent AI inventory spreadsheet exists but misses shadow AI and embedded vendor AI, high-risk use cases are reviewed case by case often after build, some models have ad hoc fairness checks, vendor AI is procured without standard AI clauses.
- **5 — Active governance function.** A standing AI governance committee meets at least monthly with cross-functional membership and an ExCo-approved charter, a mandatory pre-build intake exists with documented risk classification aligned to EU AI Act tiers, the AI inventory is centralized including vendor and embedded AI, model risk tiering drives validation depth, model cards are produced for production models, bias testing runs on a defined cadence, an AI incident response runbook exists with one tabletop completed.
- **7 — Operationalized and auditable.** Independent model validation reviews high-risk models pre-production, NIST AI RMF practices are mapped to internal controls with automated evidence collection, EU AI Act conformity assessment is implemented for high-risk systems, bias pipelines run on every model release, system cards are required for compound AI systems, vendor AI undergoes standardized AI due diligence.
- **10 — Embedded and adaptive.** Governance is shifted left with policy-as-code controls enforced at the platform — a model cannot be promoted without passing fairness, robustness, privacy, and documentation gates emitting machine-readable evidence, real-time monitoring detects bias drift and prompt injection with auto-rollback, the org contributes to standards.

**3 vs 6:** At 3 there is a written policy and an informal committee. At 6 there is a chartered standing committee with monthly cadence, a mandatory pre-build intake with risk classification, a centralized inventory covering vendor and embedded AI, model risk tiering driving validation depth, model cards for production models, fairness testing on a defined cadence, and a tested AI incident response playbook. The line is between aspirational and operational.

#### Component D — Technical Infrastructure (Weight: 15%)

**Definition:** Whether the MLOps, LLMOps, compute, and inference infrastructure required to deploy and operate AI is in place.

**Scoring anchors:**

- **1 — Notebook on a laptop.** Models built in personal Jupyter, no experiment tracking, no GPU access except via personal cloud, no model registry, deployment is a pickled file emailed to engineering, personal foundation-model API keys, no vector DB, no monitoring.
- **3 — Pilot stack, manual glue.** An experiment tracker is in use, a managed ML platform is provisioned, at least one foundation model API is procured with central billing, one or two models in production deployed manually as containerized REST APIs, CI for code but no CD for models, a vector DB exists for one RAG pilot.
- **5 — Standardized MLOps.** A model registry is the single source of truth for production models with promotion gates, CI/CD pipelines automate training and deployment, a feature store serves at least one production model, drift detection runs continuously with paged alerts, foundation model usage is centralized through an AI gateway, LLMOps tooling traces every prompt and response in at least one GenAI app.
- **7 — Production-grade MLOps and LLMOps.** Continuous training is triggered by drift or schedule, a champion-challenger framework runs in production, multi-region deployment with blue/green and traffic mirroring, foundation models are fine-tuned in production with monitoring, eval pipelines run on every prompt or model change with golden datasets and red-team probes, vector DB is enterprise-tier with hybrid search.
- **10 — AI-native platform.** Internal self-service: any team stands up a governed model or RAG app from a templated landing zone in hours, multi-cluster GPU orchestration with right-sizing, inference cost continuously optimized, mature agent infrastructure with tool registries and sandboxed execution, custom or fine-tuned models compete with vendor APIs on cost and quality.

**3 vs 6:** At 3 there is a managed ML platform and a model deployed manually. At 6 there is a centrally enforced model registry with promotion gates, automated CI/CD for models, a feature store powering at least one production model, drift monitoring with alerts, a centralized AI gateway, and LLMOps tracing on at least one GenAI app. The line is between tools and a paved road.

#### Acceptance criteria

- [ ] The "How We Score Readiness" section appears between Executive Summary and Use Case Detail in every Executive Board Report.
- [ ] All four component cards render with consistent styling — same card height, same anchor table layout, same 3-vs-6 callout treatment.
- [ ] The rubric content is sourced from a single data file or constant, not duplicated in code.
- [ ] In the printed/PDF version of the report, each component card fits on one page and the section breaks cleanly between cards.
- [ ] The report version of the rubric matches the in-app scoring tooltip rubric character-for-character.

---

### CHANGE 6 — Matrix layout polish

A handful of visual fixes that do not require new logic but make the matrix readable.

1. **Axis ranges fixed at 1–10 on both axes.** No auto-scaling. The cuts at 5.5 should always sit at the visual midpoint.
2. **Quadrant labels positioned at the inner corners**, not the outer corners. Champions label at the lower-left corner of its quadrant (i.e., at coordinates around 6, 6). Quick Wins label at upper-left of its quadrant. Strategic Bets label at lower-right of its quadrant. Foundation label at upper-right of its quadrant. This puts the labels close to the cut lines and away from where bubbles cluster.
3. **Use case bubble labels** render to the right of the bubble at 8px offset, with text shadow or background fill to prevent overlap with quadrant labels and grid lines. If two bubbles overlap, label the higher-value one above and the lower-value one below.
4. **Cut lines** render as 1px dashed `#94a3b8` lines at the 5.5 mark on each axis. Label them `Cut: 5.5` in the margin.
5. **Grid lines** at every integer in light grey at 20% opacity. Labels at every integer.
6. **Lead-tier markers.** Render the 7.5 line on each axis as a 1px solid `#10b981` line at 30% opacity. Do not label in the margin — show in legend as "Lead-tier threshold (7.5)."
7. **Empty-quadrant message.** When a quadrant has zero use cases, render its name and a one-line message centered: *"No use cases qualified for [Quadrant]. See Methodology Integrity panel."*

#### Acceptance criteria

- [ ] Axes fixed at 1–10. No auto-scaling under any input distribution.
- [ ] Quadrant labels never overlap with use case bubble labels.
- [ ] An empty quadrant displays its name and the diagnostic message clearly.
- [ ] The 5.5 cut lines and 7.5 lead-tier lines are visually distinguishable.

---

## DIAGNOSTIC TEST CASE

The same synthetic 10-use-case portfolio from v2.1, scored under v2.2 logic, must produce a usable matrix.

### Expected output (post v2.2 fixes)

- **Median Value Score:** 4.5–6.5 (unchanged from v2.1)
- **Median Readiness Score:** 5.0 ± 0.5
- **Quadrant cuts:** at 5.5, 5.5
- **Natural Champions:** likely 0–1 given the readiness ceiling at ~6.0
- **Natural Quick Wins:** 1–3 — use cases with R ≥ 5.5 and V < 5.5
- **Natural Strategic Bets:** 1–3 — use cases with V ≥ 5.5 and R < 5.5
- **Foundation:** the remainder
- **Conditional promotions:** if natural Champions + Quick Wins < 3, top-N by composite are promoted to Conditional status until the count hits 3
- **Methodology Integrity:** at minimum `BELOW_MIN_CANDIDATES` and `READINESS_BUNCHED_LOW` warnings fire
- **Total prototyping candidates:** ≥ 3
- **Visual:** four equal quadrants, four distinct colors, no overlay zones, conditionals plotted at actual coordinates with dashed borders

If the test produces a matrix where Champions ∪ Quick Wins ∪ Conditionals < 3, the implementation is wrong.

---

## OUT OF SCOPE — DO NOT TOUCH

- The four readiness components and their weights (35% / 30% / 20% / 15%). Correct in v2.0.
- The behaviorally anchored 1–10 rubric content. Correct in v2.0 — copied verbatim into the report in Change 5.
- The log-transformed value normalization from v2.1. Correct.
- The hard floor / soft blocker distinction from v2.1. Correct.
- The Layer 3 activation condition from v2.1. Generalized in Change 3 to handle the minimum-3 rule.
- Sector presets. Correct in v2.0.

---

## DELIVERABLES CHECKLIST

When complete:

1. **Diagnostic run** of the v2.1 test fixture under v2.2 logic, with screenshot of the new matrix and screenshot of the new "How We Score Readiness" section.
2. **Visual diff** of an old matrix versus a new matrix from the same data.
3. **Migration:** re-run scoring and classification on all v2.1 engagements under v2.2. Preserve v2.1 quadrants as `quadrantV21`. Surface engagements where the prototyping candidate set changed.
4. **Schema bump** to `2.2`. Backward compatible with v2.1 consumers.
5. **Updated unit tests** covering: 5.5 cut classification, lead-tier classification, safety-net promotion at varying portfolio sizes, all warning rules, and the empty-quadrant rendering case.
6. **Release note** for engagement leads, written for consultants — one paragraph explaining what changed in the matrix and what changed in the report.

Do not mark the task complete until the diagnostic test fixture produces a matrix with at least 3 prototyping candidates and four visually equal, distinctly colored quadrants.

---

## NOTES FOR THE AGENT

- The single largest lift in this release is the "How We Score Readiness" section. Treat it as a first-class report component, not an afterthought. Style it with the same care as the Executive Summary.
- The Conditional Champion overlay zone in the upper-right of the v2.1 matrix is a bug, not a feature. Delete it. Conditionals plot at their actual coordinates.
- The 5.5 cut is not arbitrary — it is the midpoint of the 1–10 scale and produces four visually equal quadrants. This is the consultant's request and the right design for the matrix to read at a glance.
- The 7.5 line is preserved as a *lead-tier* indicator inside Champions and Quick Wins. It is no longer a quadrant boundary.
- The minimum-3 rule is non-negotiable. If the implementation produces fewer than 3 prototyping candidates on any non-degenerate portfolio, the implementation has failed.
- Color accessibility matters. Test the palette under colorblindness simulation. Emerald and cyan are the two prototyping colors; if they look too similar to a deuteranope, adjust saturation, not hue.
- Read the Conditional rendering rule one more time: actual coordinates, dashed border, target classification color. No promoted positions. No overlay zones.
