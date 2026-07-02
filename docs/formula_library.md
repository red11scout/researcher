# Formula Library (v2.1)

This library documents the **deterministic** formulas implemented by the calculation engine. The canonical implementations live in:

- `src/calc/formulas.ts` — pure TypeScript reference implementations
- `src/calc/hyperformulaEngine.ts` — the same formulas evaluated through HyperFormula (the engine that actually drives production numbers)
- `tests/calc.test.ts` — the source of truth for default scenario, rounding precision, and the `upliftPct` cap

Every monetary output stores a **trace**: the formula string, all resolved inputs, and intermediate steps (used by the "How computed" UI).

> **Note on the legacy spec.** Earlier versions of this document described a 3-component priority score, an "efficiency × adoption" cost formula, and `$100K`-floor rounding. Those have been intentionally superseded by the implementation described below. See the *Calculation Engine* section in `replit.md` for the design rationale.

---

## Scenario Multipliers

`SCENARIO_MULTIPLIERS` in `src/calc/formulas.ts`. The default scenario for every benefit formula is **`moderate`** (multiplier `1.00`). Conservative and aggressive are reserved for what-if analysis.

| Scenario | Multiplier |
|----------|------------|
| `conservative` | 0.60 |
| `moderate` (default) | 1.00 |
| `aggressive` | 1.30 |

`ADOPTION_CURVES` (used by multi-year projections):

| Scenario | Year 1 | Year 2 | Year 3+ |
|----------|--------|--------|---------|
| `conservative` | 0.25 | 0.50 | 0.70 |
| `moderate` | 0.40 | 0.65 | 0.85 |
| `aggressive` | 0.55 | 0.80 | 0.95 |

---

## Default Multipliers (`DEFAULT_MULTIPLIERS`)

| Key | Default | Description |
|-----|---------|-------------|
| `loadedHourlyRate` | `150` | Fully burdened hourly cost (used when no role-based rate is provided) |
| `benefitsLoading` | `1.35` | Adds 35% for employer costs (taxes, benefits, space). Set to `1.0` when using standardized roles whose rate is already fully loaded. |
| `dataMaturityMultiplier` | `0.75` | Level 2 default (see Data Maturity Levels below) |
| `revenueRealizationMultiplier` | `0.95` | Confidence in revenue benefits |
| `costRealizationMultiplier` | `0.90` | Confidence in cost benefits |
| `cashFlowRealizationMultiplier` | `0.85` | Confidence in working-capital benefits |
| `riskRealizationMultiplier` | `0.80` | Confidence in risk benefits |
| `defaultCostOfCapital` | `0.08` | WACC proxy used by the cash flow formula |
| `inputTokenPricePerM` | `3.00` | Claude 3.5 Sonnet input price per million tokens |
| `outputTokenPricePerM` | `15.00` | Claude 3.5 Sonnet output price per million tokens |
| `benefitsCapPct` | `0.03` | Total benefits capped at 3% of annual revenue |
| `riskReductionCapPct` | `0.08` | Per-use-case risk reduction capped at 8% of current exposure |

### Data Maturity Levels (`DATA_MATURITY_LEVELS`)

| Level | Label | Multiplier |
|-------|-------|------------|
| 1 | Ad-hoc | 0.60 |
| 2 | Repeatable (default) | 0.75 |
| 3 | Defined | 0.85 |
| 4 | Managed | 0.95 |
| 5 | Optimizing | 1.00 |

---

## Input Bounds (`INPUT_BOUNDS`)

The "safe" wrappers (`calculateCostBenefitSafe`, etc.) clamp inputs to these ranges before calculating. The non-safe variants enforce only the per-formula caps noted below.

| Input | Min | Max |
|-------|-----|-----|
| `hoursSaved` | 0 | 500,000 |
| `loadedHourlyRate` | 35 | 500 |
| `upliftPct` | 0 | **0.05 (5%)** |
| `baselineRevenueAtRisk` | 0 | 500,000,000,000 |
| `daysImprovement` | 0 | 90 |
| `annualRevenue` | 0 | 500,000,000,000 |
| `costOfCapital` | 0.01 | 0.25 |
| `probBefore` / `probAfter` | 0 | 1.0 |
| `impactBefore` / `impactAfter` | 0 | 10,000,000,000 |
| `runsPerMonth` | 0 | 10,000,000 |
| `annualHours` | 0 | 500,000 |
| `riskExposure` | 0 | 5,000,000,000 |
| `riskReductionPct` | 0 | 0.50 |
| `probabilityOfSuccess` | 0.40 | 0.85 |

---

## Rounding (`ROUNDING`)

| Constant | Value | Applies to |
|----------|-------|------------|
| `BENEFIT_PRECISION` | **1** | Cost / Revenue / CashFlow / Risk / Total Annual Value — no artificial rounding, exact deterministic values. |
| `FRICTION_PRECISION` | 10,000 | Friction cost rounded DOWN to nearest $10K. |
| `TOKEN_DECIMALS` | 2 | Token costs rounded to 2 decimal places. |

> **Why no $100K rounding?** Tests in `tests/calc.test.ts` (`returns exact deterministic value (BENEFIT_PRECISION = 1, no rounding)`) lock this in. The previous "$100K floor" rule was removed so that the HyperFormula `FLOOR(..., 1)` step matches the TypeScript implementation exactly.

Timelines are rounded UP to the nearest month via `roundTimelineUp(months)`.

---

## Cost Benefit

`calculateCostBenefit` and `hfCalculateCostBenefit`.

```
CostBenefit = HoursSaved × LoadedRate × BenefitsLoading × CostRealization × DataMaturity × Scenario
```

HyperFormula form: `=FLOOR(A1*B1*C1*D1*E1*F1, 1)`

**Inputs:**
- `hoursSaved` — Annual hours saved
- `loadedHourlyRate` — defaults to `150`
- `benefitsLoading` — defaults to `1.35`
- `costRealizationMultiplier` — defaults to `0.90`
- `dataMaturityMultiplier` — defaults to `0.75`
- `scenario` — defaults to `'moderate'` (1.00)

---

## Revenue Benefit

`calculateRevenueBenefit` and `hfCalculateRevenueBenefit`.

```
RevenueBenefit = min(UpliftPct, 0.05) × BaselineRevenueAtRisk × MarginPct × RevenueRealization × DataMaturity × Scenario
```

HyperFormula form: `=FLOOR(MIN(A1,0.5)*B1*C1*D1*E1*F1, 1)`. The `MIN(..., 0.5)` inside the HyperFormula expression is only a 50% safety bound — it does **not** apply the 5% cap on its own. The canonical 5% cap is enforced in two places:

1. **`calculateRevenueBenefit` (TypeScript)** clamps via `Math.min(upliftPct, INPUT_BOUNDS.upliftPct.max)` and records the clamped value in the trace.
2. **`calculateRevenueBenefitSafe` and the post-processor (`server/calculation-postprocessor.ts`)** clamp inputs against `INPUT_BOUNDS` before passing them to either engine, so callers of `hfCalculateRevenueBenefit` are responsible for ensuring `upliftPct ≤ 0.05`.

This behavior is verified by `tests/calc.test.ts` ("caps upliftPct to INPUT_BOUNDS.upliftPct.max").

**Inputs:**
- `upliftPct` — Revenue uplift (0–0.05)
- `baselineRevenueAtRisk` — Revenue exposed (churn, pipeline, opportunity cost)
- `marginPct` — defaults to `1.0`
- `revenueRealizationMultiplier` — defaults to `0.95`
- `dataMaturityMultiplier` — defaults to `0.75`
- `scenario` — defaults to `'moderate'`

---

## Cash Flow Benefit (corrected formula)

`calculateCashFlowBenefit` and `hfCalculateCashFlowBenefit`.

```
WorkingCapitalFreed   = AnnualRevenue × (DaysImprovement / 365)
AnnualFinancingSaved  = WorkingCapitalFreed × CostOfCapital
CashFlowBenefit       = AnnualFinancingSaved × CashFlowRealization × DataMaturity × Scenario
```

HyperFormula form: `=FLOOR(A1*(B1/365)*C1*D1*E1*F1, 1)`

> The previous documentation showed `DaysImprovement × DailyRevenue × WorkingCapitalPct × Realization × DataMaturity`, which treated DSO improvement as direct revenue and inflated results 100–200×. The current implementation correctly computes the **financing cost saved** by releasing working capital. Example: $365M revenue, 15 days DSO improvement, 8% WACC ⇒ working capital freed = $15M ⇒ benefit = $15M × 8% = $1.2M before realization/data/scenario factors.

**Inputs:**
- `daysImprovement` — DSO/DPO days improvement (0–90)
- `annualRevenue` — Annual revenue (legacy `dailyRevenue` is auto-converted via `× 365`)
- `costOfCapital` — defaults to `DEFAULT_MULTIPLIERS.defaultCostOfCapital` (0.08)
- `cashFlowRealizationMultiplier` — defaults to `0.85`
- `dataMaturityMultiplier` — defaults to `0.75`
- `scenario` — defaults to `'moderate'`

---

## Risk Benefit

Both engines (`calculateRiskBenefit` in `src/calc/formulas.ts` and `hfCalculateRiskBenefit` in `src/calc/hyperformulaEngine.ts`) implement the same canonical formula and apply the same per-use-case `riskReductionCapPct = 8%` cap. They differ only in their input shape — the HyperFormula path takes a pre-resolved `(riskReductionPct, riskExposure)` pair, while the JS path computes those from before/after probability and impact.

```
RiskBefore        = ProbBefore × ImpactBefore                  (= RiskExposure)
RiskAfter         = ProbAfter  × ImpactAfter
RiskReduction     = RiskBefore − RiskAfter                     (= RiskReductionPct × RiskExposure)
MaxReduction      = RiskBefore × riskReductionCapPct           (cap = 8% of current exposure)
CappedReduction   = min(RiskReduction, MaxReduction)
RiskBenefit       = CappedReduction × RiskRealization × DataMaturity × Scenario
```

The `riskReductionCapPct` (8%) prevents any single use case from claiming more than 8% of current exposure as a benefit. In the HyperFormula path the cap is enforced inside the cell formula as `MIN(riskReductionPct, 0.08)` — equivalent to capping the dollar reduction because `min(p, c) × E = min(p × E, c × E)`.

HyperFormula form: `=FLOOR(MIN(A1, 0.08)*B1*C1*D1*E1, 1)` where `A1 = riskReductionPct`, `B1 = riskExposure`.

**Defaults shared by both:** `riskRealizationMultiplier = 0.80`, `dataMaturityMultiplier = 0.75`, `scenario = 'moderate'`.

**Note on `INPUT_BOUNDS.riskReductionPct.max = 0.50`:** this is an absolute input-sanity bound (rejects nonsense inputs like 200%). The 8% per-use-case cap is the binding constraint on the result.

---

## Total Annual Value (with revenue cap)

`calculateTotalAnnualValue`.

```
SumBenefits       = CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit
CapAmount         = AnnualRevenue × benefitsCapPct                  (only if AnnualRevenue > 0)
TotalAnnualValue  = min(SumBenefits, CapAmount)
```

`benefitsCapPct` defaults to **0.03 (3% of annual revenue)** — the CFO-credible cap. When the cap binds, `isCapped = true` and the trace formula is rewritten to `min(Sum of Drivers, 3% of Revenue) — CAPPED`. If `annualRevenue` is `0` or omitted, the cap is `Infinity` (no cap applied).

`crossValidateUseCases` is **advisory only** — it warns when the portfolio total exceeds the cap or when revenue benefits exceed 30% of revenue, but does not scale values down.

---

## Token Costs

`calculateTokenCost` and `hfCalculateTokenCost`.

```
MonthlyInputTokens   = RunsPerMonth × InputTokensPerRun
MonthlyOutputTokens  = RunsPerMonth × OutputTokensPerRun
AnnualTokenCost      = 12 × ((MonthlyInputTokens / 1e6) × InputPricePerM
                            + (MonthlyOutputTokens / 1e6) × OutputPricePerM)
```

HyperFormula form: `=ROUND(12*((A1*B1/1000000)*D1+(A1*C1/1000000)*E1), 2)`

Default prices come from `DEFAULT_MULTIPLIERS.inputTokenPricePerM` / `outputTokenPricePerM`.

`calculateValuePerMillionTokens(totalAnnualValue, totalMonthlyTokens)` returns `TotalAnnualValue / (TotalMonthlyTokens / 1e6)`, rounded to the nearest dollar.

---

## Friction Point Cost

`calculateFrictionCost` and `hfCalculateFrictionCost`.

Primary form (when `annualHours` is provided):
```
FrictionCost = AnnualHours × LoadedHourlyRate
```

Alternate forms used when `annualHours` is missing:
```
FrictionCost = Headcount × HoursPerFTE × FrictionPercentage × LoadedHourlyRate
FrictionCost = Headcount × HoursPerFTE × LoadedHourlyRate
```

`hoursPerFTE` defaults to `2080`. The result is rounded **DOWN to the nearest $10K** (`ROUNDING.FRICTION_PRECISION`). `calculatedHours` is also clamped to `INPUT_BOUNDS.annualHours.max` (500,000).

### Severity (`calculateFrictionSeverity`)

| Condition | Severity |
|-----------|----------|
| Affects revenue OR compliance OR `annualCost ≥ $5M` | Critical |
| `annualCost ≥ $1M` OR customer-facing | High |
| `annualCost ≥ $250K` | Medium |
| Otherwise | Low |

### Friction → Use Case Recovery

`calculateFrictionRecovery(frictionCost, useCaseBenefit)` returns:
```
recoveryAmount = min(useCaseBenefit, frictionCost)
recoveryPct    = recoveryAmount / frictionCost
```

---

## Readiness Score (current 4-component model)

`calculateReadinessScore`. Output is on a 1–10 scale.

```
ReadinessScore = (OrgCapacity × 0.30)
               + (DataQuality × 0.30)
               + (TechInfra   × 0.20)
               + (Governance  × 0.20)
```

`READINESS_WEIGHTS` in `src/calc/formulas.ts`. Each component input is clamped to 1–10. Result is rounded to two decimals.

---

## Value Score (from friction)

`calculateValueScoreFromFriction(expectedValue, frictionCost, allRatios)`:

```
RawRatio = ExpectedValue / FrictionCost                         (0 if FrictionCost ≤ 0)
ValueScore = 1 + ((RawRatio − min(allRatios)) / (max − min)) × 9
```

Result is on a 1–10 scale (5.5 if all ratios are equal). `normalizeValuesToScale(values)` provides the same 1–10 min-max normalization for arbitrary dollar arrays.

---

## TTV Bubble Score

`calculateTTVBubbleScore(ttvMonths) = max(0, 1 − min(ttvMonths / 12, 1))`. Used purely for matrix bubble sizing (3 mo ⇒ 0.75, 10 mo ⇒ 0.167, 12+ mo ⇒ 0).

---

## Priority Scoring (current 50/50 model)

`calculateNewPriorityScore`. Output is on a 1–10 scale.

```
PriorityScore = (ReadinessScore × 0.5) + (NormalizedValue × 0.5)
```

Both inputs are clamped to 1–10.

### Tiers (`getNewPriorityTier`)

Tiers depend on the priority score *and* the underlying readiness/value coordinates:

| Condition | Tier |
|-----------|------|
| `priorityScore ≥ 7.5` | Tier 1 — Champions |
| `normalizedValue < 5.5` AND `readinessScore ≥ 5.5` | Tier 2 — Quick Wins |
| `normalizedValue ≥ 5.5` AND `readinessScore < 5.5` | Tier 3 — Strategic |
| Otherwise | Tier 4 — Foundation |

### Recommended Phase (`getNewRecommendedPhase`)

| Condition | Phase |
|-----------|-------|
| `priorityScore ≥ 7.5` AND `readinessScore ≥ 6` | Q1 |
| `priorityScore ≥ 6.0` AND `readinessScore ≥ 5` | Q2 |
| `priorityScore ≥ 4.5` | Q3 |
| Otherwise | Q4 |

### Legacy 5-criterion priority score (deprecated)

Still exported as `calculatePriorityScore` / `getPriorityTier` / `getRecommendedPhase` for back-compat. Operates on a 0–100 scale with weights from `PRIORITY_WEIGHTS`:

| Component | Weight |
|-----------|--------|
| `strategicAlignment` | 0.25 |
| `financialImpact` | 0.25 |
| `implementationComplexity` | 0.20 |
| `dataReadiness` | 0.15 |
| `timeToValue` | 0.15 |

Sub-score formulas:
```
StrategicScore        = ((strategicAlignment − 1) / 4) × 100              (default strategicAlignment = 3)
FinancialScore        = min(100, (TotalAnnualValue / 10,000,000) × 100)
AvgComplexity         = (integrationComplexity + changeMgmt) / 2
ComplexityScore       = ((5 − AvgComplexity) / 4) × 100
DataReadinessScore    = ((dataReadiness − 1) / 4) × 100
TTVScore              = 100             if timeToValueMonths ≤ 3   (TTV_THRESHOLDS.PERFECT_MONTHS)
                      = 0               if timeToValueMonths ≥ 18  (TTV_THRESHOLDS.ZERO_MONTHS)
                      = 100 − ((m − 3) / 15) × 100  otherwise
PriorityScore         = Σ (weight × sub-score), capped at 100
```

Legacy tier thresholds (`PRIORITY_TIERS`):

| Score | Tier |
|-------|------|
| ≥ 80 | Tier 1 — Quick Win |
| ≥ 60 | Tier 2 — Strategic |
| ≥ 40 | Tier 3 — Foundation |
| < 40 | Tier 4 — Horizon |

Legacy phase recommendation (`getRecommendedPhase`):

| Condition | Phase |
|-----------|-------|
| `score ≥ 80` AND `TTV ≤ 6` | Q1 |
| `score ≥ 60` AND `TTV ≤ 9` | Q2 |
| `score ≥ 40` | Q3 |
| Otherwise | Q4 |

> The 50/50 model above is the production scoring path: `server/calculation-postprocessor.ts` calls `calculateNewPriorityScore` when finalizing reports. The 5-criterion version is still imported by `server/routes.ts` (legacy callers) and the What-If page, and is marked `@deprecated` in `src/calc/formulas.ts`.

---

## Multi-Year Projections, NPV, IRR

`calculateMultiYearProjection({ annualBenefit, implementationCost, discountRate = 0.10, scenario = 'moderate', years = 5 })` produces, for each year:

- `adoptionRate` — pulled from `ADOPTION_CURVES` (Y1, Y2, Y3+)
- `adjustedBenefit = annualBenefit × adoptionRate`
- `implementationCost` spread as 60% / 30% / 10% across Y1/Y2/Y3 (zero thereafter)
- `discountFactor = 1 / (1 + discountRate)^year`
- `presentValue = netBenefit × discountFactor`

Aggregate outputs:
- `npv` — sum of present values, rounded to nearest dollar
- `paybackMonths` — month at which cumulative net benefit turns positive
- `irr` — Newton-Raphson iterative solve on the cash-flow stream (returns `null` if it doesn't converge or the result is unreasonable)
- `totalBenefitOverPeriod` — sum of `adjustedBenefit` across years

`generateThreeScenarioSummary` runs the projection for all three scenarios and returns a headline string built from the conservative number (the executive-facing figure).

---

## Formatters

| Function | Behavior |
|----------|----------|
| `formatMoney(value)` | `$X` < $1K, `$XK` ≥ $1K, `$X.XM` ≥ $1M, `$X.XB` ≥ $1B (whole numbers drop the decimal) |
| `formatPercentage(value, decimals = 0)` | `(value × 100).toFixed(decimals) + '%'` |
| `formatHours(hours, includeLabel = true)` | Locale-formatted, switching to `XM hours` above 1,000,000 |
| `roundTimelineUp(months)` | `Math.ceil(months)` |
| `roundBenefitDown(value)` | `Math.floor(value / BENEFIT_PRECISION) × BENEFIT_PRECISION` (no-op while `BENEFIT_PRECISION = 1`) |

---

## Traceability Requirements

For every computed monetary number, `CalculationResult.trace` stores:

1. `formula` — Human-readable formula string
2. `inputs` — All resolved inputs (post-cap, post-clamp)
3. `intermediates` — Optional intermediate steps (raw value, working capital freed, etc.)
4. `output` — Raw computed value before any rounding

Traces drive the "How computed" drawer in the UI and are the contract between the AI post-processor and the front end.
