# BlueAlly Insight - Enterprise Research Platform

## Overview
BlueAlly Insight is an enterprise research and analysis platform designed to generate comprehensive AI opportunity assessments for companies. It leverages Claude AI to produce detailed reports on revenue opportunities, cost reduction, cash flow improvements, and risk mitigation through AI transformation. Users can generate reports by entering a company name, view saved analyses, and export results in various formats (PDF, Excel, Word, HTML). The platform features an intuitive interface with interactive data visualization, real-time analysis progress tracking, industry benchmarking, and advanced What-If Analysis capabilities.

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
- **No artificial rounding**: BENEFIT_PRECISION = 1 (exact deterministic values, no $100K floor rounding)
- **No per-driver or per-use-case caps**: All benefit values reflect the raw deterministic formula result
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