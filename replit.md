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

## Pointers
- **Shadcn/ui Documentation:** [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
- **Drizzle ORM Documentation:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **HyperFormula Documentation:** _Populate as you build_
- **Tailwind CSS Documentation:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Anthropic Claude API Documentation:** _Populate as you build_