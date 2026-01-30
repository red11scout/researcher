# Formula Library (v2) - SPEC COMPLIANT

This library defines **deterministic** formulas used by the calculation engine.  
All monetary outputs must store a **trace**: formula + resolved inputs + intermediate steps.

Follows Section 3.2 and 3.3 of the Researcher App v2 Build Prompt.

## Global Multipliers (Section 3.3 Required Assumptions)

| Assumption | Default | Description |
|------------|---------|-------------|
| `loadedHourlyRate` | 150 | Fully burdened hourly cost (wages + benefits + overhead) |
| `efficiencyMultiplier` | 0.85 | Efficiency gain factor (0-1) |
| `adoptionMultiplier` | 0.70 | Expected user adoption rate (0-1) |
| `dataMaturityMultiplier` | 0.75 | Data readiness factor (0-1) |
| `costRealizationMultiplier` | 0.90 | Probability-weighted cost benefit adjustment |
| `revenueRealizationMultiplier` | 0.95 | Probability-weighted revenue benefit adjustment |
| `cashFlowRealizationMultiplier` | 0.85 | Probability-weighted cash flow benefit adjustment |
| `riskRealizationMultiplier` | 0.80 | Probability-weighted risk benefit adjustment |
| `inputTokenPricePerM` | 3.00 | Claude 3.5 Sonnet input token price per million |
| `outputTokenPricePerM` | 15.00 | Claude 3.5 Sonnet output token price per million |
| `probabilityOfSuccess` | 1.0 | Per use case probability (optional) |

## Cost Benefit (Section 3.2)

**SPEC FORMULA:**
```
CostBenefit = HoursSaved × LoadedRate × Efficiency × Adoption × DataMaturity
```

**Inputs:**
- `HoursSaved` - Annual hours saved by automation
- `LoadedRate` - Fully burdened hourly cost
- `Efficiency` - Efficiency multiplier (default 0.85)
- `Adoption` - Adoption multiplier (default 0.70)
- `DataMaturity` - Data maturity multiplier (default 0.75)

**Rounding:** DOWN to nearest $100K

## Revenue Benefit (Section 3.2)

**SPEC FORMULA:**
```
RevenueBenefit = UpliftPct × BaselineRevenueAtRisk × MarginPct × Realization × DataMaturity
```

**Inputs:**
- `UpliftPct` - Revenue improvement percentage (e.g., 0.05 = 5%)
- `BaselineRevenueAtRisk` - Revenue at risk (churn, pipeline, opportunity cost)
- `MarginPct` - Gross margin percentage (default 1.0)
- `Realization` - Revenue realization multiplier (default 0.95)
- `DataMaturity` - Data maturity multiplier (default 0.75)

**Rounding:** DOWN to nearest $100K

## Cash Flow Benefit (Section 3.2)

**SPEC FORMULA:**
```
CashFlowBenefit = DaysImprovement × DailyRevenue × WorkingCapitalPct × Realization × DataMaturity
```

**Inputs:**
- `DaysImprovement` - Days of DSO/DPO improvement
- `DailyRevenue` - Annual revenue / 365
- `WorkingCapitalPct` - Working capital percentage (default 1.0)
- `Realization` - Cash flow realization multiplier (default 0.85)
- `DataMaturity` - Data maturity multiplier (default 0.75)

**Rounding:** DOWN to nearest $100K

## Risk Benefit (Section 3.2)

**SPEC FORMULA:**
```
RiskBenefit = (ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × Realization × DataMaturity
```

**Inputs:**
- `ProbBefore` - Risk probability before AI (e.g., 0.15 = 15%)
- `ImpactBefore` - Risk impact before AI ($)
- `ProbAfter` - Risk probability after AI (e.g., 0.05 = 5%)
- `ImpactAfter` - Risk impact after AI ($)
- `Realization` - Risk realization multiplier (default 0.80)
- `DataMaturity` - Data maturity multiplier (default 0.75)

**Rounding:** DOWN to nearest $100K

## Token Costs (Section 3.2)

**SPEC FORMULA:**
```
MonthlyInputTokens = RunsPerMonth × InputTokensPerRun
MonthlyOutputTokens = RunsPerMonth × OutputTokensPerRun
AnnualTokenCost = 12 × ((MonthlyInputTokens/1e6 × InputPricePerM) + (MonthlyOutputTokens/1e6 × OutputPricePerM))
```

**Inputs:**
- `RunsPerMonth` - Number of AI invocations per month
- `InputTokensPerRun` - Average input tokens per run
- `OutputTokensPerRun` - Average output tokens per run
- `InputPricePerM` - Input token price per million (default $3.00)
- `OutputPricePerM` - Output token price per million (default $15.00)

## Total Annual Value (Section 3.2)

**SPEC FORMULA:**
```
TotalAnnualValue = (CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) × ProbabilityOfSuccess
```

**Rounding:** DOWN to nearest $100K

## Value per 1M Tokens

**SPEC FORMULA:**
```
ValuePerMillionTokens = TotalAnnualValue / (TotalMonthlyTokens / 1e6)
```

## Priority Scoring (Section 3.2)

**All component scores normalized to 0-100 range:**

### ValueScore (0-100)
- Linear scale: $10M+ = 100
- Formula: `min(100, (TotalAnnualValue / 10,000,000) × 100)`

### TTVScore (0-100)
- 3 months = 100
- 12+ months = 0
- Linear interpolation between

### EffortScore (0-100)
Accounts for factor direction:
- `dataReadiness` (1-5): 5 = HIGH readiness = EASY (better)
- `integrationComplexity` (1-5): 1 = LOW complexity = EASY (better)
- `changeMgmt` (1-5): 1 = LOW change = EASY (better)

Calculation:
```
easeFromData = ((dataReadiness - 1) / 4) × 100
easeFromIntegration = ((5 - integrationComplexity) / 4) × 100
easeFromChange = ((5 - changeMgmt) / 4) × 100
EffortScore = (easeFromData + easeFromIntegration + easeFromChange) / 3
```

### PriorityScore (0-100)

**SPEC FORMULA:**
```
PriorityScore = 0.4 × ValueScore + 0.3 × TTVScore + 0.3 × EffortScore
```

### Priority Tiers
| Score | Tier |
|-------|------|
| >= 80 | Critical |
| >= 60 | High |
| >= 40 | Medium |
| < 40 | Low |

### Recommended Phase
| Condition | Phase |
|-----------|-------|
| Score >= 80 AND TTV <= 6 months | Q1 |
| Score >= 60 AND TTV <= 9 months | Q2 |
| Score >= 40 | Q3 |
| Otherwise | Q4 |

## Rounding Rules

1. **Benefits:** Round DOWN to nearest $100K
2. **Timelines:** Round UP to nearest month
3. **Percentages:** Display with appropriate decimal places
4. **Token costs:** Round to 2 decimal places

## Friction Point Cost (Step 3)

**SPEC FORMULA:**
```
FrictionCost = AnnualHours × LoadedHourlyRate
```

**Alternative calculation (from headcount):**
```
FrictionCost = Headcount × HoursPerFTE × FrictionPercentage × LoadedHourlyRate
```

**Inputs:**
- `AnnualHours` - Hours spent annually dealing with this friction point
- `LoadedHourlyRate` - Fully burdened hourly cost (default $150)
- `Headcount` - Number of FTEs affected (alternative input)
- `HoursPerFTE` - Annual hours per FTE (default 2080)
- `FrictionPercentage` - Percentage of time spent on friction (0-1)

**Rounding:** DOWN to nearest $10K

**Severity Thresholds:**
| Annual Cost | Severity |
|-------------|----------|
| >= $5M or affects revenue/compliance | Critical |
| >= $1M or customer-facing | High |
| >= $250K | Medium |
| < $250K | Low |

**Display Format:**
Each friction point should show:
- Annual Hours (labeled)
- Hourly Rate (labeled)
- Formula with × symbols
- Calculated annual cost

Example: `12,500 hours × $150/hr = $1,875,000 → $1.8M`

## Traceability Requirements

For every computed number, store:
1. `formula` - Human-readable formula string
2. `inputs` - All resolved input values
3. `intermediates` - Intermediate calculation steps (optional)
4. `output` - Raw computed value (before rounding)

Expose traces in UI as "How computed" drawer/modal per metric.
