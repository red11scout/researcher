# BlueAlly Insight - Enterprise Research Platform

## Overview
BlueAlly Insight is an enterprise research and analysis platform designed to generate comprehensive AI opportunity assessments for companies. It leverages Claude AI to produce detailed reports on revenue opportunities, cost reduction, cash flow improvements, and risk mitigation through AI transformation. Users can generate reports by entering a company name, view saved analyses, and export results in various formats (PDF, Excel, Word, HTML). The platform features an intuitive interface with interactive data visualization, real-time analysis progress tracking, industry benchmarking, and advanced What-If Analysis capabilities.

### Value-Readiness Matrix v2.2 (third corrective release)
v2.2 is **additive** — the v2.0 (`assignQuadrantV2`) and v2.1 (`assignQuadrantV21`, `computePortfolioDiagnostic`) functions in `shared/vrm-v2.ts` are preserved. The postprocessor emits a `Quadrant v2.2`, `Tier v2.2`, and `Is Conditional v2.2` column on every benefit alongside the v2.0 / v2.1 shadow columns, then overrides the primary `Priority Tier` and `Quadrant v2` values with the v2.2 result. `vrm.schemaVersion` is `"2.2"`; the v2.1 diagnostic is preserved at `vrm.diagnosticV21` for traceability.

Key constants (all in `shared/vrm-v2.ts`):
- `QUADRANT_CUT = 5.5` — Champion / Quick Win / Strategic / Foundation cut on both axes.
- `LEAD_TIER_CUT = 7.5` — Sub-classifies Champions (V≥7.5 AND R≥7.5 → "Lead Champion") and Quick Wins (R≥7.5 → "Lead Quick Win"). Strategic and Foundation are always `standard` tier.
- `MIN_PROTOTYPING_CANDIDATES = 3` — Safety-net rule. If fewer than 3 use cases land in Champion or Quick Win naturally, `assignClassificationsV22` promotes the foundation/strategic items **nearest to QUADRANT_CUT** (smallest combined `max(0, 5.5−V) + max(0, 5.5−R)` distance) by setting `isConditional = true`. Promoted items keep their natural quadrant for plotting and render at their actual coordinates with a dashed border in the same color as the target quadrant.

Diagnostic warnings (`computePortfolioDiagnosticV22`):
- `EMPTY_MATRIX` (critical) — empty portfolio or all items in Foundation.
- `BELOW_MIN_CANDIDATES` (warning) — < 3 prototyping candidates even after safety-net.
- `READINESS_BUNCHED_LOW` (warning) — median R < 5.0 with zero Champions.
- `READINESS_BUNCHED_HIGH` (info) — median R > 8.0 and Quick Wins outnumber Champions.
- `VALUE_DISTRIBUTION_SKEWED` (warning) — median V outside 4–8 band.
- `INTAKE_INCOMPLETE` (warning) — > 30% missing sponsor / data flags.
- `HARD_FLOOR_DOMINANT` (warning) — > 40% hard-floor failures (lowered from 50% in v2.1).
- `STRONG_PORTFOLIO` (info) — ≥ 3 Lead Champions.

Chart visuals (`client/src/components/dashboard/quadrant-bubble-chart.tsx`):
- 5.5 quadrant dividers, 7.5 lead-tier emerald lines (1px solid @ 30% opacity).
- 4-color semantic palette at 8% opacity: emerald (Champion), cyan (Quick Win), indigo (Strategic), slate (Foundation).
- Bubble size **flipped**: smaller = faster TTV (5 buckets at 8/12/16/20/24 px via `ttvBubbleRadiusV22`).
- Conditional bubbles render with a dashed border in the same color as their natural quadrant; the dashed-orange Conditional Champion overlay zone from v2.1 was deleted.
- Empty-quadrant text appears when a quadrant has no use cases (counted against v2.2 fields, with v2.1 / v2.0 fallbacks for legacy reports).

"How We Score Readiness" (`client/src/components/dashboard/how-we-score-readiness.tsx`):
- 4-card grid rendered verbatim from the `RUBRIC[]` array.
- Mounted in `client/src/components/Dashboard.tsx` between `<ExecutiveSummary />` and `<PriorityMatrix />`.
- Mounted in `client/src/pages/Report.tsx` after the diagnostic block on Step 7.
- Rendered as HTML by `renderHowWeScoreReadinessHTML()` in `client/src/lib/htmlReportGenerator.ts`, injected into both `generateProfessionalHTMLReport` (Boardroom) and `generateEditorialHTMLReport` (Editorial) reports.

Tests: `tests/vrm-v2.test.ts` carries 68 tests including the v2.2 acceptance suite — schema constants, `classifyQuadrantV22`, `leadTierV22`, safety-net promotion (with `absoluteAnnualValue` fixture so floors don't reject low-score test cases), and all eight diagnostic warning rules.

### HTML Export — Dual Format
Two client-side HTML report generators are exported from `client/src/lib/htmlReportGenerator.ts`:
- **`generateProfessionalHTMLReport`** — "Boardroom" design: dark navy cover, data-dense KPI cards, full 12-section analysis, tier badges, EPOCH flags, multi-year projections
- **`generateEditorialHTMLReport`** — "Editorial" design: white cover with navy left sidebar, narrative-led executive summary, pillar breakdown bars, top-5 recommendation cards, 3-column financial scenario table, numbered next steps

Both open in a new tab as a Blob URL. The StickyHeader exposes a dropdown ("Export Report") with both options. The CTASection exposes two distinct CTA buttons (Boardroom / Editorial) plus the Workshop PDF download. All three call sites (DashboardPage, SharedDashboard) pass both handlers to Dashboard.

### Authentication & Security
Password-based authentication using `express-session`. Configured in `server/auth.ts` with `setupAuth()` called from `server/index.ts`.
- **AuthProvider** (`client/src/contexts/AuthContext.tsx`): React context wrapping the app, checks `/api/auth/status` on mount, exposes `isAuthenticated`, `login()`, `logout()`.
- **ProtectedRoute** (in `client/src/App.tsx`): Client-side route guard redirecting unauthenticated users to `/login?returnTo=<path>`.
- **Public routes**: `/login`, `/shared/:shareId` — no auth required. Shared dashboards have isolated layout with no navigation to protected routes.
- **Login page** (`client/src/pages/Login.tsx`): Password input with 5-attempt cooldown (60s), error display, `returnTo` redirect after success.
- **Logout**: Button in Layout header and mobile menu, posts to `/api/auth/logout`.
- **Admin page** (`client/src/pages/Admin.tsx`, route `/admin`): Operator-only UI exposing the `POST /api/admin/backfill-reports` endpoint as a one-click "Upgrade all reports" button. Includes a `force=1` toggle, confirmation dialog, summary stats (total / updated / skipped / failed / duration), and a per-failure table for any reports that failed to upgrade. Also renders a "Recent admin activity" panel showing the last 25 entries from the admin audit log.
- **Admin audit log** (`shared/schema.ts` → `adminAuditLog` table, `server/storage.ts` → `createAdminAuditEntry` / `getRecentAdminAuditEntries`): Append-only trail of admin endpoint usage. Every admin action writes one row with timestamp, action name (e.g. `backfill-reports`, `admin-login`, `admin-login-failed`, `admin-access-denied`), `status` (success/failure), HTTP `statusCode`, actor IP + user-agent, request `params` (jsonb), outcome counts (jsonb — total/updated/skipped/failed/durationMs for backfill), and an optional `errorMessage`. Failed admin logins (wrong ADMIN_PASSWORD) and 403 denials from `requireAdmin` are also logged so brute-force probing leaves a visible trail. The audit write is fire-and-forget and swallows DB errors so it can never break a real admin request. Read via `GET /api/admin/audit-log?limit=N` (clamped 1–200, default 25); the helper lives in `server/auth.ts` (`recordAdminAudit`).
- **Rate limiting**: `express-rate-limit` — 10 req/min on `/api/auth/login`, 30 req/min on `/api/share/*`.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` on all responses.
- **Environment variables**: `APP_PASSWORD` (default: BlueAlly45), `SESSION_SECRET` (auto-generated if missing).

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing functional components and hooks. Wouter handles client-side routing, providing a lightweight solution. TanStack Query manages server state, while local state uses React hooks. The UI is constructed with Shadcn/ui, based on Radix UI primitives, styled using Tailwind CSS v4 with custom design tokens for a consistent look. Framer Motion is used for animations, and Recharts handles data visualization. Vite serves as the build tool, configured with custom plugins for development. Client-side document generation uses jsPDF, XLSX, and Docx libraries for various export formats.

### Backend Architecture
The backend is a Node.js Express.js application written in TypeScript, using ES modules. It provides a RESTful API, with a primary endpoint (`POST /api/analyze`) for generating or retrieving analyses, leveraging caching for efficiency. AI integration is managed via the Anthropic Claude 3.5 Sonnet SDK, employing a detailed prompting framework for comprehensive company analysis and structured output. A custom Vite integration provides hot module replacement for development. Production builds are optimized with esbuild for server code and Vite for static client assets.

### Data Storage
PostgreSQL, specifically Neon serverless, is used for data storage. Drizzle ORM provides type-safe schema definitions and query building. The schema includes a `reports` table storing company names, complete analysis data in JSONB format, and timestamps. Drizzle Kit manages schema migrations. A storage abstraction layer (`IStorage` with `DatabaseStorage` implementation) allows for flexible backend swaps.

### Calculation Engine
All monetary calculations use **HyperFormula** (spreadsheet-grade deterministic engine) via `src/calc/hyperformulaEngine.ts`. No probabilistic AI calculations are allowed. The engine provides:
- `hfCalculateCostBenefit`: Hours × Rate × BenefitsLoading × Realization × DataMaturity × Scenario
- `hfCalculateRevenueBenefit`: UpliftPct × BaselineRevenue × Margin × Realization × DataMaturity × Scenario
- `hfCalculateCashFlowBenefit`: AnnualRevenue × (Days/365) × CostOfCapital × Realization × DataMaturity × Scenario
- `hfCalculateRiskBenefit`: ReductionPct × Exposure × Realization × DataMaturity × Scenario
- `hfCalculateFrictionCost`: AnnualHours × LoadedHourlyRate (rounded to $10K)
- `hfCalculateTokenCost`: Monthly runs × token pricing × 12

Base formulas use **moderate** scenario (1.0 multiplier). Conservative (0.60) and aggressive (1.30) are for what-if analysis only. The post-processor (`server/calculation-postprocessor.ts`) prioritizes **structured formula labels** from the AI over formula string parsing, and derives missing Revenue/CashFlow/Risk benefits from Step 3 friction data when the AI returns $0.

**Key calculation design decisions:**
- **No artificial rounding**: BENEFIT_PRECISION = 1 (exact deterministic values, no $100K floor rounding). The legacy spec in `docs/formula_library.md` mentions "round down to nearest $100K"; that is intentionally superseded by the exact-value approach.
- **Default scenario is `moderate`**: every benefit formula in `src/calc/formulas.ts` and `src/calc/hyperformulaEngine.ts` defaults `scenario` to `'moderate'` (multiplier 1.0). Conservative/aggressive are reserved for what-if analysis only.
- **`upliftPct` is capped at `INPUT_BOUNDS.upliftPct.max` (0.05 = 5%) on both calculation paths**: `calculateRevenueBenefit` (JS reference) clamps via `Math.min(upliftPct, INPUT_BOUNDS.upliftPct.max)`, and `hfCalculateRevenueBenefit` (production HyperFormula) enforces the same cap inside its cell formula via `MIN(A1, INPUT_BOUNDS.upliftPct.max)`. Both engines record the *clamped* value in the trace so audit text never overstates uplift.
- **`tests/calc.test.ts` is the source of truth for these decisions**: the v2.1 cleanup (April 2026) realigned the three pre-existing failing fixtures (default scenario, $100K rounding, uplift cap) with the intentional behavior above so `npx vitest run` stays green.
- **No per-driver or per-use-case caps** beyond the documented input bounds: all benefit values reflect the raw deterministic formula result.
- **Portfolio-level validation is advisory only**: crossValidateUseCases warns but does not scale down values
- **Label matching uses longest-match-first**: `extractFromStructuredLabels` sorts label map entries by key length descending to prevent greedy short-key matches (e.g., 'rate' catching 'Adoption Rate')
- **Formula labels include result field**: Each benefit's labels object includes a `result` field with the formatted calculated value for UI display
- **INPUT_BOUNDS are relaxed**: daysImprovement max=90, probabilityOfSuccess max=0.85, riskReductionPct max=0.50, hoursSaved max=500K

### EPOCH Framework
The MIT EPOCH Framework (Empathy, Presence, Opinion, Creativity, Hope) is anchored at the top of every LLM system prompt via `EPOCH_FRAMEWORK_DEFINITION` constant in `server/ai-service.ts`. This block is front-loaded before all other instructions in all four pipeline calls (`buildCall1-4SystemPrompt`) and the What-If suggestion prompt to prevent hallucination of wrong letter meanings. The EPOCH Flags field in Step 4 use cases uses a JSON object format: `{ "E": true, "P": false, ... }`.

### External Dependencies
- **AI Service**: Anthropic Claude API (`@anthropic-ai/sdk`), configured with `AI_INTEGRATIONS_ANTHROPIC_API_KEY` and `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`.
- **Database**: Neon PostgreSQL serverless database via `DATABASE_URL`.
- **Calculation Engine**: HyperFormula (`hyperformula`) for deterministic spreadsheet-grade calculations.
- **Third-Party Libraries**:
    - UI Components: Radix UI (`@radix-ui/react-*`)
    - Form Handling: React Hook Form with Zod for validation
    - Date Manipulation: `date-fns`
    - Icons: `Lucide React`
    - Styling: Tailwind CSS, `class-variance-authority`
    - Charts: `Recharts`
    - Document Export: `jsPDF`, `xlsx`, `docx`, `file-saver`