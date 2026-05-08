# BlueAlly Insight
An enterprise research and analysis platform that generates comprehensive AI opportunity assessments for companies using Claude AI.

## Run & Operate
- **Run Development:** `npm run dev`
- **Build Client:** `npm run build:client`
- **Build Server:** `npm run build:server`
- **Typecheck:** `npm run typecheck`
- **Codegen:** `npm run codegen` (for Drizzle ORM)
- **DB Push:** `npm run db:push` (for Drizzle migrations)
- **Environment Variables:** `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_AUDIT_RETENTION_DAYS` (optional, defaults to 90), `SHARE_SESSION_SECRET` (for public dashboards).

## Stack
- **Frontend:** React 18, TypeScript, Wouter, TanStack Query, Shadcn/ui, Tailwind CSS v4, Framer Motion, Recharts
- **Backend:** Node.js (ES modules), Express.js, TypeScript, Anthropic Claude SDK
- **Database:** PostgreSQL (Neon serverless), Drizzle ORM
- **Validation:** Zod
- **Build Tool:** Vite (frontend), esbuild (backend production)
- **Calculation Engine:** HyperFormula

## Where things live
- **Client Source:** `client/src/`
- **Server Source:** `server/src/`
- **Shared Utilities/Types:** `shared/src/`
- **Database Schema:** `db/schema.ts`
- **API Routes:** `server/src/routes/`
- **Calculation Logic (Source of Truth):** `src/calc/hyperformulaEngine.ts`, `server/src/calculation-postprocessor.ts`, `src/calc/formulas.ts`
- **Value-Readiness Matrix Logic:** `shared/src/vrm-v2.ts`
- **UI Components:** `client/src/components/ui/` (Shadcn/ui)
- **Tailwind Config:** `tailwind.config.ts`

## Architecture decisions
- **Single Canonical Calculation Path:** All calculations flow through `src/calc/hyperformulaEngine.ts` and `server/src/calculation-postprocessor.ts` to ensure consistency. No parallel calculation engines.
- **Winsorized Log10 Percentile Normalization for VRM:** Value scores in the Value-Readiness Matrix use a specific normalization strategy (v3) to handle outliers and sub-1 ratios effectively, preventing score bunching.
- **Deterministic Calculation QA Gates:** Two dedicated Vitest suites (`tests/calculation-quality-assurance.test.ts` and `tests/output-realism.test.ts`) act as the sole quality gate for calculation logic, ensuring correctness, purity, and CFO-credibility.
- **Export Consistency:** Export formats (JSON, Markdown) are dumb pass-throughs of the canonical post-processed analysis payload, preventing recomputation or rounding errors downstream.
- **EPOCH Framework Integration:** Every LLM system prompt integrates the MIT EPOCH Framework to guide AI behavior and reduce hallucination.

## Product
- Generate AI opportunity assessments for companies using Claude AI.
- Comprehensive reports covering revenue, cost reduction, cash flow, and risk mitigation.
- View and manage saved analyses.
- Export reports to PDF, Excel, Word, and HTML.
- Interactive data visualization and real-time analysis progress.
- Industry benchmarking and What-If Analysis capabilities.
- Admin panel for report management and audit logs.

## User preferences
Preferred communication style: Simple, everyday language.

## Gotchas
- **Calculation Engine Modifications:** Any changes to `src/calc/`, `shared/vrm-v2.ts`, or `server/src/calculation-postprocessor.ts` *must* pass the `tests/calculation-quality-assurance.test.ts` and `tests/output-realism.test.ts` suites.
- **IRR Calculation:** `calculateIRR` in `src/calc/formulas.ts` enforces a `|rate| < 10` guard; rates outside this range are returned as `null`.
- **Admin Audit Log Export:** Exports are capped at `10,000` rows; check `X-Audit-Export-Truncated` header for truncated results.
- **Client-Side Calculation Fallbacks:** Do not re-introduce client-side re-computation of post-processor totals; if canonical data is missing, render "Unavailable".
- **Audit `formulaText` Reconciliation:** The printed Cost/Revenue/Cash Flow/Risk Formula strings *must* evaluate to the printed dollar result. Use `formatPctForAudit` (adaptive precision, never collapses sub-1% to "0%") for percentages and `formatExactMoneyForAudit` (full precision, e.g. "$23,500,000,000") for dollar inputs. Only the result side may use abbreviated `formatMoney`. Locked in by `tests/formula-text-reconciles.test.ts`.
- **CFO Reality Check — Independent Verification (Task #107 follow-up):** `src/calc/cfoRealityCheck.ts` is a **pure, dependency-free** module that re-validates the post-processor's output against industry-typical year-1 AI program ranges (`CFO_REALITY_THRESHOLDS`: moderate scenario midline ~0.75% of revenue; cash-flow pillar ≤ 25% of total; per-UC ≤ 0.4% of revenue). It exists deliberately outside the main calculation chain so a CFO can audit "are these numbers believable?" without inheriting any of the engine's assumptions. Findings flow into `integrityWarnings` (IMPLAUSIBLE → critical, STRETCH → warning) and the full result is exposed at `result.cfoRealityCheck`. **When the moderate scenario is IMPLAUSIBLE, all four pillars are uniformly rescaled per-UC** to land on the believable midline; each rescaled formula gets a `× scale (CFO reality check) → $X` annotation so audit reconciliation still holds. Locked in by `tests/cfo-reality-check.test.ts` and the e2e CFO_REALITY_RESCALE coverage in the post-process suite.
- **Headline override is now ONE-WAY:** `HEADLINE_RECONCILIATION_OVERRIDE` only rewrites the executive-summary headline when the **LLM exaggerated UPWARD** vs canonical (LLM > canonical by > 10%). When the LLM is more conservative than canonical, the post-processor no longer replaces the headline (that direction usually means canonical is the inflated figure, not the LLM); instead it emits a `HEADLINE_LLM_MORE_CONSERVATIVE` warning. This was the root cause of the Constellation Energy regression where a credible $82M headline was being inflated to $236M by the override.
- **Portfolio CFO-Credibility Guardrails (Task #107) — TIGHTENED in follow-up:** Five gates in `server/calculation-postprocessor.ts` (after the per-UC Step 5 loop) protect against per-UC-credible / portfolio-implausible reports. `PORTFOLIO_BOUNDS` (in `src/calc/formulas.ts`) holds the thresholds — kept separate from `INPUT_BOUNDS` because these are aggregate/portfolio-level rules, not per-input clamps. Every cap that scales also appends its prorate term to the affected formula strings so audit reconciliation (printed math = printed dollar) is preserved.
  1. **Cumulative days cap (`PORTFOLIO_CASHFLOW_DAYS_CAP` + per-UC `…_UC`):** Enforces `PORTFOLIO_BOUNDS.cumulativeDaysImprovement.max` (= **15 days**, tightened from 30) across the SUM of per-UC `daysImprovement`. Two weeks of working capital is the realistic ceiling for an AI program in year one.
  2. **Cash-flow share cap (`PORTFOLIO_CASHFLOW_SHARE` + per-UC `…_UC`):** Hard cap (not advisory). When cash flow > **20%** of total annual value (tightened from 35%), prorates every UC's cash flow so the share lands at exactly the cap.
  3. **Total-value-vs-revenue cap (`PORTFOLIO_TOTAL_VS_REVENUE_CAP`):** When total annual value > **2.5%** of company revenue (tightened from 5%), scales ALL four pillars uniformly. McKinsey/Bain/BCG year-one ranges sit between 0.5–2.5% of revenue.
  4. **IRR / payback display clamps (`IRR_DISPLAY_CLAMPED`, `PAYBACK_DISPLAY_CLAMPED`):** IRR > 200% displays as `"200%+"`, payback < 6 months as `"<6 mo"`. Raw values preserved at `multiYearProjection.irrRaw` and `multiYearProjection.paybackMonthsRaw` for audit. **Note:** downstream consumers of `multiYearProjection.paybackMonths` should treat it as `number | string` now (was `number`).
  5. **Headline reconciliation override (`HEADLINE_RECONCILIATION_OVERRIDE`):** Parses dollar figures from `executiveSummary.headline`; when the LLM's first-year value diverges > 10% from canonical `totalAnnualValue` (the post-cap rollup), the headline is rewritten and the LLM's original is preserved at `executiveSummary.headlineLLMOriginal`.
  - Locked in by `tests/output-realism.test.ts` (pure guardrail unit tests) and `tests/post-process-analysis.test.ts` (e2e regressions for every gate, both positive and negative paths).
- **`ADMIN_PASSWORD` in production:** Must differ from `APP_PASSWORD`. `setupAuth` in `server/auth.ts` refuses to start (`process.exit(1)`) when they match and `NODE_ENV=production`; in dev the same condition is a `console.warn`. Sharing the secret would let any logged-in user elevate to admin via `/api/auth/admin-login`.

## Pointers
- **Shadcn/ui Documentation:** [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
- **Drizzle ORM Documentation:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **HyperFormula Documentation:** _Populate as you build_
- **Tailwind CSS Documentation:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Anthropic Claude API Documentation:** _Populate as you build_