# REPLIT IMPLEMENTATION PROMPT — Value-Readiness Matrix v2.1

> Paste this entire document into Replit Agent as a single brief. This is a corrective release on top of the v2.0 work the agent already shipped. Do not re-do v2.0. Do the seven changes below and verify against the diagnostic case at the end.

---

## MISSION

The v2.0 release shipped, but real engagements are producing matrices where **every use case lands in Foundation**. That is the failure mode the framework was supposed to prevent. Looking at one live engagement output:

- 10 use cases scored
- Readiness scores: min 3.5, max 5.9, average 5.0
- Value scores (post min-max normalization): min 1.0, max 10.0, average 3.4
- Use cases above the Value floor (6.0): **1 of 10**
- Use cases above the Readiness floor (6.0): **0 of 10**
- Use cases in Champions, Quick Wins, or Strategic: **0**
- Layer 3 (Conditional Champion) never activated

The matrix is empty of prototyping candidates. The deliverable is unusable. Diagnosis follows. Then seven fixes.

---

## DIAGNOSIS — WHAT IS ACTUALLY HAPPENING

### Bug 1 — Min-max normalization on Value is producing counterintuitive scores

The raw Expected Value figures across the example portfolio span $11M to $63M — a 6x range. After min-max normalization to 1–10, the distribution is heavily bunched at the low end, with one outlier at 10. This happens because the normalization is operating on the EV-divided-by-friction ratio across a portfolio with highly variable friction denominators. A use case with massive expected value AND massive friction cost can normalize lower than a use case with modest value but tiny friction. The math is doing what min-max always does — anchoring the best at 10 and the worst at 1 with a linear stretch in between — but the resulting scale is no longer interpretable as "this use case is or is not worth pursuing."

A log-transform of the EV/Friction ratio before min-max normalization smooths this. On the example portfolio, log-transformed normalization moved the median from 3.4 to 5.5 and produced a far more reasonable spread.

### Bug 2 — The Value floor at 6.0 is a top-quintile filter, not a goodness filter

The v2 spec set a hard floor at Value ≥ 6.0 to prevent low-value use cases from being prototyped. In theory, this is correct. In practice, after min-max normalization, **6.0 means roughly "top 30–40% of this portfolio"** — a relative position, not an absolute one. Combined with Bug 1, only 1 of 10 use cases cleared the floor in the example case. Even a strong portfolio with everything between $20M and $80M of expected value would see 60–70% of use cases knocked out of contention by this floor alone.

### Bug 3 — Layer 3 activation is too narrow

The current logic activates Layer 3 only when "Layer 2 produced zero Champions and zero Quick Wins." But in the example, Layer 1 wiped out everyone before Layer 2 ran. Layer 3 also did not consider that **zero Strategic** is just as bad — the whole point is to surface prototyping candidates, and an empty Strategic quadrant means the framework has failed the engagement. The activation condition should be: **whenever the Champion, Quick Win, AND Strategic quadrants are all empty**.

### Bug 4 — Layer 1 floors are too binary

Three of the four hard floors in Layer 1 are remediable inside the engagement timeline: data availability, named sponsor, time-to-pilot. The current code treats all four floor failures as terminal — straight to Foundation. But in real engagements, "no named sponsor" is often an intake omission, not an actual blocker. "Data not available" usually means "not yet available" — solvable in a 4–6 week sprint. "Time-to-pilot 14 weeks" is a sequencing concern, not a kill criterion.

The framework needs to distinguish **hard knock-outs** (legal prohibition, ethical violation, technical impossibility) from **soft blockers** (sponsor missing, data delayed, pilot timeline tight). Hard knock-outs go to Foundation. Soft blockers flag as remediation items but do not knock the use case out of contention.

---

## CHANGES — IMPLEMENT IN ORDER

### CHANGE 1 — Replace min-max value normalization with log-transformed normalization

The `Expected Value × Probability of Success ÷ Friction Annual Cost` ratio spans orders of magnitude across a typical portfolio. Apply a log transform before normalizing.

**New normalization logic:**

```typescript
function normalizeValueScores(rawRatios: number[]): number[] {
  // rawRatios[i] = EV_i × P_i / FrictionCost_i, for each use case
  
  // 1. Log-transform (base 10), with floor at 1 to avoid log(0)
  const logRatios = rawRatios.map(r => Math.log10(Math.max(r, 1)));
  
  // 2. Standard min-max on log values to produce 1–10 range
  const lo = Math.min(...logRatios);
  const hi = Math.max(...logRatios);
  
  if (hi === lo) {
    // All use cases identical — score everyone at 5.5 (neutral)
    return rawRatios.map(() => 5.5);
  }
  
  return logRatios.map(lr => 1 + 9 * (lr - lo) / (hi - lo));
}
```

**Important:** The Value Score in JSON output and reports should still be 1–10. Only the math underneath changes. Document the change in the methodology appendix as "log-transformed min-max normalization" and explain it briefly to the consultant audience.

**Preserve the raw ratio in the data model.** Add a field `valueScoreRaw` (the EV/Friction ratio in raw form) alongside `valueScore` (the normalized 1–10). Reports can reference either.

#### Acceptance criteria

- [ ] On a portfolio with raw EV/Friction ratios spanning 10x or more, the resulting normalized Value Scores have median between 4.0 and 6.5, not below 4.0.
- [ ] When all use cases have identical raw ratios, all receive a Value Score of 5.5.
- [ ] `valueScoreRaw` is preserved in the data model and exported in JSON.
- [ ] Methodology appendix in reports explains the log transform.

---

### CHANGE 2 — Replace the Value-floor knock-out with absolute-value bands

The 6.0 floor on the normalized scale is brittle. Replace with a band approach that is portfolio-independent.

**New rule:** A use case fails the Value floor only if **both** of the following are true:

1. Normalized Value Score < 4.0
2. Raw projected annual value (Total Annual Value × Probability of Success) < $500K

Either condition alone is insufficient to knock out. A use case with low normalized score but high absolute value (e.g., bottom-ranked in a strong portfolio but still worth $10M) should NOT be knocked out. A use case with decent normalized score but tiny absolute value (e.g., top of a weak portfolio worth $200K) should NOT be a Champion.

**Make these thresholds configurable per engagement** with sensible defaults:

```typescript
type ValueFloorConfig = {
  minNormalizedScore: number;   // default 4.0
  minAbsoluteAnnualValue: number; // default 500_000
};
```

#### Acceptance criteria

- [ ] A use case with $5M expected value but normalized score 3.5 passes the Value floor.
- [ ] A use case with $200K expected value and normalized score 8.5 passes the Value floor (absolute value alone is not enough to fail; only failing both fails).
- [ ] Wait — read carefully: only **both** failing fails. The agent should test: $200K + score 3.5 = FAIL. $200K + score 8.5 = PASS. $5M + score 3.5 = PASS.
- [ ] Thresholds are read from engagement config, not hardcoded.

---

### CHANGE 3 — Distinguish hard knock-outs from soft blockers in Layer 1

The current Layer 1 has four floor checks. Reclassify them:

**Hard knock-outs (always send to Foundation):**
- Legal/regulatory prohibition (use case is illegal or banned by sector regulator)
- Technical infeasibility (state-of-the-art cannot deliver the use case)
- Value floor failure (per Change 2 above)

**Soft blockers (flag, do not auto-relegate):**
- `hasNamedSponsor === false` → flag, surface in deliverable as "Sponsor Confirmation Required"
- `dataAvailableForEngagement === false` → flag, surface as "Data Access Sprint Required"
- `timeToPilotWeeks > maxTimeToPilotWeeks` → flag, surface as "Sequencing Concern"

**New Layer 1 behavior:**

```typescript
type FloorEvaluation = {
  hardFailures: string[];   // empty = passes Layer 1
  softBlockers: string[];   // remediation items, not knock-outs
};

function evaluateFloors(uc: UseCase, cfg: EngagementConfig): FloorEvaluation {
  const hard: string[] = [];
  const soft: string[] = [];
  
  // Hard floors
  if (uc.legallyProhibited) hard.push('Legally prohibited in client jurisdiction');
  if (uc.technicallyInfeasible) hard.push('Beyond current technical capability');
  if (uc.valueScore < cfg.valueFloor.minNormalizedScore && 
      uc.absoluteAnnualValue < cfg.valueFloor.minAbsoluteAnnualValue) {
    hard.push(`Value below floor (${uc.valueScore.toFixed(1)} normalized, $${(uc.absoluteAnnualValue/1000).toFixed(0)}K absolute)`);
  }
  
  // Soft blockers
  if (uc.hasNamedSponsor === false) soft.push('No named business sponsor — confirm at intake');
  if (uc.hasNamedSponsor === null) soft.push('Sponsor field not captured — intake incomplete');
  if (uc.dataAvailableForEngagement === false) soft.push(`Data access sprint required (${cfg.dataAccessSprintWeeks} weeks default)`);
  if (uc.timeToPilotWeeks > cfg.maxTimeToPilotWeeks) {
    soft.push(`Time-to-pilot ${uc.timeToPilotWeeks} weeks exceeds ${cfg.maxTimeToPilotWeeks}-week target — sequencing concern`);
  }
  
  return { hardFailures: hard, softBlockers: soft };
}
```

**The crucial inversion:** Use cases with soft blockers no longer skip to Foundation. They proceed to Layer 2 quadrant assignment. The blockers are tracked in metadata and surface in reports as **action items required before prototyping**, not as knock-outs.

**New default for `maxTimeToPilotWeeks`:** raise from 12 to **16 weeks** to better match real engagement timelines. Make it configurable per engagement.

**Add new config field `dataAccessSprintWeeks`:** default 6 weeks, surface in remediation guidance for any use case with `dataAvailableForEngagement === false`.

#### Acceptance criteria

- [ ] A use case with a soft blocker but otherwise high scores can land in Champions (with blocker flagged), not Foundation.
- [ ] Hard knock-out reasons and soft blocker reasons are tracked separately in the data model.
- [ ] Reports render soft blockers as remediation items in a distinct visual treatment from hard failures.
- [ ] When `hasNamedSponsor` is `null` (intake gap), the blocker reads "Sponsor field not captured — intake incomplete" so the consultant can act on it.

---

### CHANGE 4 — Broaden Layer 3 activation

The current Layer 3 activation condition is "zero Champions AND zero Quick Wins." Broaden to: **zero Champions AND zero Quick Wins AND zero Strategic**.

If even the Strategic quadrant has at least one use case, the framework has produced something the consultant can recommend (a high-value use case requiring preparation). Layer 3 stays dormant.

If all three "above-floor" quadrants are empty, Layer 3 fires and promotes the top 2 by composite score.

```typescript
// inside the quadrant assignment routine
const portfolioHasAboveFloor = portfolio.some(p => {
  const eval = evaluateFloors(p, cfg);
  if (eval.hardFailures.length > 0) return false;  // hard-failed; doesn't count
  // would qualify for Champion, Strategic, or Quick Win under Layer 2?
  return (p.valueScore >= cfg.championMin && p.readinessScore >= cfg.championMin) ||
         (p.valueScore >= cfg.championMin && p.readinessScore >= cfg.quickStrategicMin) ||
         (p.valueScore >= cfg.quickStrategicMin && p.readinessScore >= cfg.championMin);
});

if (!portfolioHasAboveFloor) {
  // Layer 3 fires — promote top 2 by composite that passed hard floors
  // ...
}
```

#### Acceptance criteria

- [ ] If a portfolio has 1 Strategic, 0 Champions, 0 Quick Wins → Layer 3 stays dormant (Strategic counts as a recommendable outcome).
- [ ] If a portfolio has 0 of all three → Layer 3 activates and promotes top 2 (subject to hard floor).
- [ ] If hard-floor failures eliminate all use cases (no candidates eligible for promotion) → render an explicit engagement-level warning (see Change 6).

---

### CHANGE 5 — Conditional Champion gap descriptions must include soft-blocker remediation

When Layer 3 promotes a use case to Conditional Champion, the gap description must now include both:

1. **Score gaps** (existing behavior) — e.g., "Readiness 5.5 → needs 7.5"
2. **Soft-blocker remediation** (new) — e.g., "Confirm Vice President of Operations as sponsor (currently unconfirmed)"

```typescript
type ConditionalChampionMeta = {
  scoreGaps: Array<{ component: string; current: number; required: number }>;
  softBlockers: string[];   // copied from Layer 1 evaluation
  proposedSprintWeeks: number;
  reclassificationCriteria: string;
};
```

The proposed sprint length should auto-calculate based on the gaps:

```typescript
function proposeSprintWeeks(meta: { scoreGaps; softBlockers }): number {
  let weeks = 4;  // base
  if (meta.scoreGaps.some(g => g.component === 'dataReadiness' && g.required - g.current >= 2)) weeks += 4;
  if (meta.softBlockers.some(b => b.includes('Data access'))) weeks += 4;
  if (meta.softBlockers.some(b => b.includes('Sponsor'))) weeks += 1;  // confirmation, not buildout
  if (meta.scoreGaps.some(g => g.component === 'orgCapacity' && g.required - g.current >= 2)) weeks += 2;
  return Math.min(weeks, 12);  // hard ceiling at 12-week readiness sprint
}
```

#### Acceptance criteria

- [ ] Conditional Champion records include both score gaps and soft-blocker text.
- [ ] Proposed sprint weeks scale with the size of the gap, not a fixed 4–6 weeks.
- [ ] Reclassification criteria explicitly reference both: "Data Readiness reaches 7.0 AND named sponsor confirmed."

---

### CHANGE 6 — Portfolio-level diagnostic and warnings

Add an engagement-level diagnostic that runs after all use cases are scored and assigned. It surfaces in the report header and in JSON output.

**Compute and surface these signals:**

```typescript
type PortfolioDiagnostic = {
  totalUseCases: number;
  byQuadrant: Record<Quadrant, number>;
  prototypingCandidatesCount: number;  // Champion + Conditional Champion + Quick Win
  warnings: PortfolioWarning[];
};

type PortfolioWarning = {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
  recommendedAction: string;
};
```

**Warning rules to implement:**

| Code | Condition | Severity | Message |
|---|---|---|---|
| `EMPTY_MATRIX` | prototypingCandidatesCount === 0 | critical | "No prototyping candidates produced. Review value assumptions and intake data." |
| `VALUE_DISTRIBUTION_SKEWED` | Median normalized Value Score < 4.0 | warning | "Value scores skewed low. Verify EV/Friction ratios were captured correctly." |
| `READINESS_BUNCHED_LOW` | Median Readiness Score < 5.0 AND no Conditional Champions promoted | warning | "Portfolio readiness is low across the board. Consider a Readiness Uplift roadmap as Wave 0." |
| `INTAKE_INCOMPLETE` | More than 30% of use cases have null sponsor or null data availability | warning | "Intake fields incomplete. Sponsor and data availability must be confirmed before prototyping." |
| `HARD_FLOOR_DOMINANT` | More than 50% of use cases hard-failed Layer 1 | warning | "Most use cases below absolute value floor. Check if friction baselines are realistic." |
| `STRONG_PORTFOLIO` | More than 5 Champions in Layer 2 | info | "Strong portfolio — applying Wave 1 / Wave 2 sequencing." |

These warnings render in the report header as a methodology integrity panel, not buried in an appendix.

#### Acceptance criteria

- [ ] Diagnostic runs as a post-scoring step, not inline in the scoring loop.
- [ ] Warnings appear in JSON under `analysis.vrm.diagnostic`.
- [ ] Report header renders critical warnings prominently (red banner) and warnings as yellow.
- [ ] At least one snapshot test exists per warning code.

---

### CHANGE 7 — Visual treatment for the matrix and report

Update the matrix visualization and report rendering to make the framework legible even when the portfolio is weak.

**Matrix changes:**

1. **Sub-segment Foundation visually.** Foundation use cases that hard-failed should render in dark grey with a "blocked" icon. Foundation use cases that simply fall below the cut should render in lighter grey.
2. **Render Conditional Champions in the Champions zone with a dashed border** and a "Conditional" badge. They should NOT be rendered in Foundation.
3. **Show all four quadrant cut lines clearly** even when one is empty, so the consultant can explain the geometry to the client.
4. **Add a "Ghost zone" treatment** for empty quadrants — instead of showing them as bare expanses, render a subtle pattern with the label: "No use cases qualified — see methodology integrity panel."

**Report changes:**

1. **Methodology Integrity Panel** at the top, rendering the diagnostic warnings from Change 6.
2. **Soft Blockers section** in each use case card — list of remediation items distinct from score gaps.
3. **For Conditional Champions:** dedicated full-page treatment with the gap table, soft-blocker remediation, proposed sprint plan, and reclassification criteria. This is where the consultant earns the engagement extension.
4. **Bubble size legend correction.** Current legend says "larger bubble = faster time-to-value." This is counterintuitive and inverted from convention. Change to: smaller bubble = faster time-to-value, OR replace bubble size with bubble color (green = fast, amber = medium, red = slow). The agent should pick one and apply consistently.

#### Acceptance criteria

- [ ] Matrix renders five quadrants (Champion, Conditional Champion overlay, Strategic, Quick Win, Foundation), with Foundation visually sub-segmented.
- [ ] Empty quadrants render with a clear "no qualifying use cases" message, not as bare space.
- [ ] Conditional Champions appear in the upper-right with a dashed border, never in Foundation.
- [ ] Methodology Integrity Panel appears above the matrix on every report.
- [ ] Bubble size or color encoding for time-to-value is intuitive (faster = visually "lighter" treatment).

---

## DIAGNOSTIC TEST CASE

Before declaring this release done, the agent must run the scoring engine against the diagnostic input below and verify the expected output. This is a synthetic portfolio with realistic shape — heavy-tailed values, mid-range readiness, mixed intake completeness.

### Synthetic input — 10 use cases

```json
[
  { "id": "TC-01", "totalAnnualValue": 70400000, "probabilityOfSuccess": 0.65, "frictionAnnualCost": 41600000, "readinessComponents": {"orgCapacity": 6, "dataReadiness": 6, "techInfrastructure": 5, "governance": 4}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 10 },
  { "id": "TC-02", "totalAnnualValue": 53300000, "probabilityOfSuccess": 0.60, "frictionAnnualCost": 9100000, "readinessComponents": {"orgCapacity": 5, "dataReadiness": 5, "techInfrastructure": 4, "governance": 5}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 12 },
  { "id": "TC-03", "totalAnnualValue": 20600000, "probabilityOfSuccess": 0.70, "frictionAnnualCost": 9700000, "readinessComponents": {"orgCapacity": 6, "dataReadiness": 7, "techInfrastructure": 6, "governance": 4}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 6 },
  { "id": "TC-04", "totalAnnualValue": 33600000, "probabilityOfSuccess": 0.60, "frictionAnnualCost": 5300000, "readinessComponents": {"orgCapacity": 6, "dataReadiness": 6, "techInfrastructure": 5, "governance": 5}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 11 },
  { "id": "TC-05", "totalAnnualValue": 43200000, "probabilityOfSuccess": 0.65, "frictionAnnualCost": 8900000, "readinessComponents": {"orgCapacity": 4, "dataReadiness": 4, "techInfrastructure": 4, "governance": 4}, "hasNamedSponsor": true, "dataAvailableForEngagement": false, "timeToPilotWeeks": 16 },
  { "id": "TC-06", "totalAnnualValue": 44200000, "probabilityOfSuccess": 0.70, "frictionAnnualCost": 6700000, "readinessComponents": {"orgCapacity": 5, "dataReadiness": 5, "techInfrastructure": 5, "governance": 5}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 8 },
  { "id": "TC-07", "totalAnnualValue": 20400000, "probabilityOfSuccess": 0.55, "frictionAnnualCost": 2100000, "readinessComponents": {"orgCapacity": 5, "dataReadiness": 6, "techInfrastructure": 5, "governance": 5}, "hasNamedSponsor": null, "dataAvailableForEngagement": true, "timeToPilotWeeks": 14 },
  { "id": "TC-08", "totalAnnualValue": 34200000, "probabilityOfSuccess": 0.65, "frictionAnnualCost": 22300000, "readinessComponents": {"orgCapacity": 6, "dataReadiness": 6, "techInfrastructure": 6, "governance": 5}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 9 },
  { "id": "TC-09", "totalAnnualValue": 105400000, "probabilityOfSuccess": 0.60, "frictionAnnualCost": 15400000, "readinessComponents": {"orgCapacity": 5, "dataReadiness": 5, "techInfrastructure": 4, "governance": 5}, "hasNamedSponsor": true, "dataAvailableForEngagement": true, "timeToPilotWeeks": 11 },
  { "id": "TC-10", "totalAnnualValue": 120500000, "probabilityOfSuccess": 0.50, "frictionAnnualCost": 6000000, "readinessComponents": {"orgCapacity": 4, "dataReadiness": 3, "techInfrastructure": 3, "governance": 4}, "hasNamedSponsor": false, "dataAvailableForEngagement": false, "timeToPilotWeeks": 18 }
]
```

### Expected output (post v2.1 fixes)

After running the v2.1 scoring engine on this input under the **Baseline** sector preset:

- **Median normalized Value Score should be between 4.5 and 6.5** (not below 4.0 like v2.0 produced)
- **At least 2 use cases should land outside Foundation** (Champion, Quick Win, Strategic, or Conditional Champion)
- **TC-10 should be classified as Foundation hard-failure** because of the combined no-sponsor + no-data + 18-week TTP plus low readiness — but the report should articulate why precisely
- **TC-07 should carry a soft blocker** ("Sponsor field not captured") and surface for assessor follow-up, not be auto-relegated
- **At least one Conditional Champion should appear** if no unconditional Champions emerge — that is the whole point of Layer 3
- **The Methodology Integrity Panel should render** at minimum a `READINESS_BUNCHED_LOW` warning for this portfolio

If the engine produces a matrix where all 10 land in Foundation again, the implementation is wrong. Re-read the changes.

---

## OUT OF SCOPE — DO NOT TOUCH

- The four readiness components and their weights (orgCapacity 35%, dataReadiness 30%, governance 20%, techInfrastructure 15%). These were corrected in v2.0 and are right.
- The behaviorally anchored 1–10 rubrics. Those were correct in v2.0.
- The sector presets (Baseline, Regulated, Heavy-Regulated, Internal-Productivity, RAG-or-FineTune-Heavy). Correct in v2.0.
- The basic data model for engagement, use case, scoring. Extend it; do not restructure it.
- Anything not directly related to value normalization, floor logic, Layer 3 activation, diagnostics, or visualization.

---

## DELIVERABLES CHECKLIST

When complete, the agent should produce:

1. **Diagnostic run** of the test case above with before/after comparison.
2. **Migration note** for existing engagements: re-run scoring on all v2.0 engagements under v2.1 logic, preserve v2.0 quadrants as `quadrantV20`, write new v2.1 quadrants. Surface a list of engagements where the matrix shape changed materially.
3. **Updated unit tests** with the test case above as a fixture, plus tests for each warning code.
4. **Schema bump** to `2.1` in JSON output, with backward-compatibility for `2.0` consumers.
5. **One-paragraph release note** for engagement leads explaining what changed and why — written for consultants, not for engineers.

Do not mark complete until the diagnostic test case produces a matrix with at least 2 prototyping candidates (Champion, Conditional Champion, or Quick Win combined).

---

## NOTES FOR THE AGENT

- The most common implementation mistake on this release will be applying the log transform incorrectly, producing scores outside the 1–10 range. Test with edge cases: identical ratios, zero ratios, single use case in portfolio.
- The second most common mistake will be moving soft blockers into Foundation by accident. Soft blockers proceed to Layer 2 quadrant assignment. Only hard floors send to Foundation.
- The third most common mistake will be activating Layer 3 too aggressively or too rarely. Re-read the activation condition in Change 4: zero Champions AND zero Quick Wins AND zero Strategic.
- If the report renderer was tightly coupled to four quadrants, expect to refactor it to five (Champion, Conditional Champion as overlay, Strategic, Quick Win, Foundation with two visual sub-states).
- The schema bump from 2.0 to 2.1 is a minor version. Do not break existing JSON consumers; add fields, do not remove or rename.
