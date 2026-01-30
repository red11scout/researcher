# Replit Agent Build Prompt — Researcher App v2 (Accurate Calculations + Editable Assumptions)

**Date:** 2026-01-30  
**Goal:** Upgrade the existing app (repo: `red11scout/researcher`) into a **world‑class, accurate, auditable** company research/report generator with:
- A **single source of truth** for facts, KPIs, friction points, use cases, assumptions
- A **transparent assumptions table** (editable in UI) with scenario support
- A **deterministic calculation engine** (HyperFormula-backed) for all numeric outputs
- **LLM-generated narrative** that *never invents numbers* (numbers come from data/calcs)
- **Multiple report templates/views** (Full Report, Executive Dashboard, Use Case Brief)
- **Persistence** (DB) + versioning/audit logs
- **Validation + automated tests** so math stays correct

---

## 0) Hard Requirements (Do Not Ignore)
1. **Numbers must be deterministic.** No “LLM math.” LLM can propose inputs or explain results, but **all computed values come from the calc engine**.
2. **Every dollar value displayed must have a trace:** inputs + formula + intermediate outputs.
3. **Editable assumptions** must re-run calculations and update all affected views.
4. **Report narrative must not include invented numbers.** It should reference numbers via placeholders/structured insertions from computed fields.
5. **Schema-driven data model:** KPIs, friction points, use cases, assumptions, and results are normalized entities.
6. **Unit tests** cover formulas and key calculations (cost/revenue/cash-flow/risk, scoring).
7. **Seed data** includes at least one full example report dataset (use the provided `seed_onetrust.json` below).
8. **Clean UX:** Users trust accuracy because they can inspect “how computed” for every number.

---

## 1) Recommended Tech Stack (Simple + Robust)
- **Next.js (App Router) + TypeScript** (single repo fullstack)
- **PostgreSQL** (Neon/Supabase) in prod, **SQLite** for local dev if needed
- **Prisma ORM**
- **Zod** for schema validation
- **HyperFormula** for spreadsheet-style formulas (deterministic calculation engine)
- **React Table** (TanStack Table) for assumptions/KPI/friction tables
- **Markdown** for rich text with optional editor (e.g., `react-markdown` + `textarea`, or TipTap if time)
- **Auth:** optional (can be simple “single-user” to start). If skipping auth, still structure DB accordingly.

> If the repo already uses a different stack, keep as much as possible, but still enforce the hard requirements.

---

## 2) Data Model (Single Source of Truth)
Implement these core entities (Prisma models or equivalent):

### 2.1 Company
- id, name, industry, description, metadata (JSON)
- createdAt, updatedAt

### 2.2 Report (an analysis instance per company)
- id, companyId, title, status (`draft|generated|reviewed`), createdAt
- `reportType` / `templateVersion`
- `llmModel` metadata (optional)

### 2.3 Assumption (editable inputs)
- id, reportId, scope (`global|kpi|friction|usecase`)
- key (string), label, description
- valueNumber (float nullable), valueText (string nullable), unit (string)
- defaultValueNumber/defaultValueText
- min/max (optional), category (e.g., `Cost`, `Revenue`, `CashFlow`, `Risk`, `Tokens`)
- source (string: “default”, “user”, “benchmark”, “LLM-proposed”)
- updatedAt

### 2.4 KPI
- id, reportId, function, subFunction
- name, direction (`up|down`), timeframe
- baselineValue (string/number), targetValue (string/number), benchmarkValue (string/number)
- measurementMethod (text)

### 2.5 FrictionPoint
- id, reportId, function, subFunction
- severity (`Critical|High|Medium|Low`)
- description (rich text / markdown)
- primaryDriver (`Grow Revenue|Reduce Cost|Increase Cash Flow|Reduce Risk`)
- annualHours (float nullable)
- annualCost (float nullable) — *computed or input*; store both `inputAnnualCost` and `computedAnnualCost` if needed

### 2.6 UseCase
- id, reportId, code (e.g., `UC-01`)
- function, subFunction
- name
- description (rich text / markdown)
- aiPrimitives (string)
- targetFrictionId (FK)
- humanCheckpoint (text)
- runsPerMonth, inputTokensPerRun, outputTokensPerRun (numbers)
- dataReadiness (1–5), integrationComplexity (1–5), changeMgmt (1–5)

### 2.7 CalculationResult (per use case and totals)
- id, reportId, useCaseId (nullable for totals)
- costBenefit, revenueBenefit, cashFlowBenefit, riskBenefit (numbers)
- totalAnnualValue (number)
- monthlyTokens, annualTokenCost, valuePerMillionTokens
- priorityScore, effortScore, ttvScore, valueScore
- **formulaTrace** (JSON): store formulas + resolved inputs + intermediate outputs

### 2.8 NarrativeSection (LLM-written, data-grounded)
- id, reportId, sectionKey (e.g. `executiveSummary`, `step3_frictionNarrative`)
- markdown (text)
- lastGeneratedAt
- **renderedMarkdown** optional (after inserting computed values)
- **validationFlags** JSON (e.g., number mismatch detection if any)

### 2.9 AuditLog (optional but recommended)
- id, reportId, actor (“user”)
- action (`assumption.update`, `report.generate`, etc.)
- before/after JSON

---

## 3) Calculation Engine (HyperFormula) — Deterministic & Auditable
### 3.1 Principle
- Build a *workbook in memory* per report scenario.
- Bind each assumption and each base numeric field to a **named cell / named expression**.
- Compute outputs via formulas that reference named inputs.
- Store both computed values and traces.

### 3.2 Formulas (standard library)
Implement a formula registry in JSON or TS, e.g. `src/calc/formulas.ts`:

**Cost Benefit**  
`CostBenefit = HoursSaved * LoadedRate * Efficiency * Adoption * DataMaturity`

**Revenue Benefit** (example style)  
`RevenueBenefit = UpliftPct * BaselineRevenueAtRisk * MarginPct * Realization * DataMaturity`

**Cash Flow Benefit**  
`CashFlowBenefit = DaysImprovement * DailyRevenue * WorkingCapitalPct * Realization * DataMaturity`

**Risk Benefit**  
`RiskBenefit = (ProbBefore*ImpactBefore - ProbAfter*ImpactAfter) * Realization * DataMaturity`

**Token Cost**
`AnnualTokenCost = 12 * (MonthlyInputTokens/1e6*InputPrice + MonthlyOutputTokens/1e6*OutputPrice)`

**Priority Score** (example)
- `ValueScore` = map(total value) to 0–40
- `TTVScore` = map(months) to 0–30
- `EffortScore` = inverse of (data readiness + integration + change mgmt) to 0–30
- `PriorityScore = 0.4*ValueScore + 0.3*TTVScore + 0.3*EffortScore`

> Keep the scoring functions explicit and unit-tested.

### 3.3 Required Assumptions (minimum)
Global assumptions must exist (editable):
- loadedHourlyRate
- efficiencyMultiplier
- adoptionMultiplier
- dataMaturityMultiplier
- revenueRealizationMultiplier
- costRealizationMultiplier
- cashFlowRealizationMultiplier
- riskRealizationMultiplier
- inputTokenPricePerM
- outputTokenPricePerM

Per use case assumptions may exist:
- hoursSaved
- revenueUpliftPct
- marginPct
- baselineRevenueAtRisk
- daysImprovement
- dailyRevenue
- workingCapitalPct
- riskProbBefore / riskImpactBefore / riskProbAfter / riskImpactAfter
- probabilityOfSuccess (optional multiplier applied to total)

### 3.4 Traceability
For every computed number, store:
- formula string
- inputs (resolved values)
- output
- any intermediate steps

Expose traces in UI as:
- “How computed” drawer/modal per metric.

---

## 4) LLM Generation Strategy (No invented numbers)
### 4.1 Golden Rule
LLM produces:
- prose, explanations, framing, structure
LLM must NOT produce:
- numeric facts, totals, dollar figures, KPI baselines, tokens, etc.

### 4.2 Implementation Pattern
- Generate narrative in **templated markdown** with placeholders, e.g.:
  - `Total Annual AI Value Opportunity: {totals.totalAnnualValue | money}`
- LLM output should reference placeholders, not raw numbers.
- After generation, server renders markdown by replacing placeholders from DB/computed values.

### 4.3 Prompting
Use a strict system prompt for narrative generation:
- “Do not output any digits (0-9). Use placeholders like `{kpi.customerSuccess.retention.baseline}`.”
- Provide a placeholder dictionary in prompt context.

### 4.4 Validation
Add a validator that scans LLM markdown for digits; if found:
- block save or auto-redact and re-prompt
- record validation flag

---

## 5) UX Requirements
### 5.1 Core Screens
1. **Company List / Create**
2. **Report Workspace**
   - Tabs: `Dashboard | Full Report | Data | Assumptions | Use Cases | KPIs | Friction`
3. **Assumptions Table**
   - search/filter
   - inline edit
   - “Reset to default”
   - scenario selector (Base / Conservative / Aggressive)
4. **Computed Results**
   - always show “ⓘ How computed” for each major metric
5. **Regenerate Narrative**
   - button to regenerate only narrative sections, not calculations

### 5.2 Guardrails
- If user edits an assumption: recompute immediately (or on “Recalculate”).
- UI must display any validation errors (e.g. missing required assumptions).

---

## 6) API Contracts (Minimal)
Implement REST endpoints (or Next Server Actions) like:

- `POST /api/companies`
- `POST /api/reports` (create report for company)
- `GET /api/reports/:id` (full hydrated data)
- `PUT /api/reports/:id/assumptions/:assumptionId` (update)
- `POST /api/reports/:id/recalculate` (run calc engine)
- `POST /api/reports/:id/generate-narrative` (LLM narrative)
- `GET /api/reports/:id/render` (rendered markdown/html)

Return types should be validated with Zod.

---

## 7) Testing (Non-negotiable)
### 7.1 Unit Tests
- cost benefit formula correctness
- revenue benefit formula correctness
- token cost correctness
- priority scoring correctness
- value-per-million-tokens correctness

### 7.2 Integration Tests
- update assumption -> recompute -> results change
- narrative generation contains no digits

---

## 8) Seed Dataset
Use `seed_onetrust.json` (provided in `/supporting/seed_onetrust.json`) to seed:
- company
- report
- assumptions
- kpis
- friction points
- use cases

This dataset mirrors the report structure in the example, but correctness must be ensured by deterministic calculations, not by trusting the existing numbers.

---

## 9) Deliverables (You Must Create These Files)
Create/modify the repo with at least:

- `prisma/schema.prisma`
- `src/calc/engine.ts` (HyperFormula workbook builder + evaluator)
- `src/calc/formulas.ts` (formula registry)
- `src/lib/validators.ts` (LLM digit scan, schema checks)
- `src/app/(pages)/reports/[id]/...` (UI pages)
- `src/app/api/...` (API routes)
- `supporting/seed_onetrust.json`
- `supporting/formula_library.md`
- `supporting/api_contracts_openapi.yaml`
- `tests/calc.test.ts`
- `tests/narrative.test.ts`

---

## 10) Acceptance Checklist
A build is considered complete when:
- Editing any assumption updates computed values correctly (and consistently) across all views.
- Every major metric has a trace view showing formula + inputs.
- Narrative contains **no raw digits**; all numbers are inserted from computed values.
- Tests pass and cover key formulas.
- Seed report renders without missing fields.

---

## 11) Implementation Notes / Common Pitfalls
- Do NOT parse numbers from narrative text.
- Do NOT let the LLM invent KPI baselines or friction costs.
- Always store numeric base inputs as numeric fields, not embedded in prose.
- Keep formatting (money, percent) in one formatter utility to avoid rounding inconsistencies.
- Use DB transactions when updating assumptions + recomputing results.

---

## 12) Start Here
1. Add Prisma schema + migrate DB
2. Implement calc engine
3. Build assumptions UI + recalc endpoint
4. Render dashboard & report views from computed outputs
5. Add narrative generation with placeholder-only output
6. Add tests + seed

**Proceed to implement now.**
