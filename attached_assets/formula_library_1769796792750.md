# Formula Library (v2)

This library defines **deterministic** formulas used by the calculation engine.  
All monetary outputs must store a **trace**: formula + resolved inputs + intermediate steps.

## Global Multipliers (defaults)
- `costRealization` (e.g., 0.90)
- `revenueRealization` (e.g., 0.95)
- `cashFlowRealization` (e.g., 0.85)
- `riskRealization` (e.g., 0.80)
- `dataMaturity` (e.g., 0.75)
- `probabilityOfSuccess` (optional, per use case)

## Cost Benefit
`CostBenefit = HoursSaved * LoadedHourlyRate * costRealization * dataMaturity`

Optionally include adoption separately if you prefer:
`CostBenefit = HoursSaved * LoadedHourlyRate * efficiency * adoption * dataMaturity`

## Revenue Benefit
`RevenueBenefit = UpliftPct * Baseline * MarginPct * revenueRealization * dataMaturity`

Examples of Baseline:
- churn-at-risk revenue
- pipeline value
- opportunity cost/day * days reduced (converted to revenue proxy)

## Cash Flow Benefit
`CashFlowBenefit = DaysImprovement * DailyRevenue * WorkingCapitalPct * cashFlowRealization * dataMaturity`

## Risk Benefit
`RiskBenefit = (ProbBefore*ImpactBefore - ProbAfter*ImpactAfter) * riskRealization * dataMaturity`

## Token Costs
Monthly totals:
- `MonthlyInputTokens = RunsPerMonth * InputTokensPerRun`
- `MonthlyOutputTokens = RunsPerMonth * OutputTokensPerRun`

Annual:
`AnnualTokenCost = 12 * ((MonthlyInputTokens/1e6)*InputPricePerM + (MonthlyOutputTokens/1e6)*OutputPricePerM)`

## Total Annual Value (per use case)
`TotalAnnualValue = (CostBenefit + RevenueBenefit + CashFlowBenefit + RiskBenefit) * ProbabilityOfSuccess`

## Value per 1M Tokens (report total)
`ValuePerMillionTokens = TotalAnnualValue / (TotalMonthlyTokens/1e6)`

## Priority Scoring
You must make the scoring mapping explicit and unit-tested.

Suggested:
- `ValueScore (0–40)`: linear scale where >= $9M => 40
- `TTVScore (0–30)`: 3 months => 30, 12 months => 5 (piecewise)
- `EffortScore (0–30)`: inverse of complexity (data readiness + integration + change mgmt)

`PriorityScore = 0.4*ValueScore + 0.3*TTVScore + 0.3*EffortScore`
