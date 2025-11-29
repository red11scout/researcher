# BlueAlly Insight - Enterprise Research Platform

## Overview

BlueAlly Insight is an enterprise research and analysis platform that generates comprehensive AI opportunity assessments for companies. The application uses Claude AI (Anthropic) to analyze companies and produce detailed reports covering revenue opportunities, cost reduction, cash flow improvements, and risk mitigation through AI transformation. Users can generate reports by entering a company name, view saved analyses, and export results in multiple formats (PDF, Excel, Word).

The platform features a modern, professional interface with interactive data visualization, real-time analysis progress tracking, industry benchmarking capabilities, and comprehensive What-If Analysis with full scenario modeling.

## Recent Changes (November 2025)

**Phase 2 - Interactive Report Shell (Complete)**:
- Embedded Assumption Panel drawer with inline editing and live recalculation
- Persistent sidebar navigation (desktop-only) with section anchors for all 8 report steps
- Comprehensive tooltip system for Executive Dashboard metrics and all step sections
- Step-specific guidance with contextual descriptions for each analysis section

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using functional components and hooks throughout.

**Routing**: Wouter for client-side routing, providing a lightweight alternative to React Router. Main routes include home (`/`), report generation (`/report`), saved reports (`/saved`), and benchmarks (`/benchmarks`).

**State Management**: TanStack Query (React Query) for server state management with custom query client configuration. No global state management library - local state handled via React hooks.

**UI Framework**: Shadcn/ui component library built on Radix UI primitives, providing accessible, customizable components. Uses the "new-york" style variant with Tailwind CSS for styling.

**Styling Approach**: Tailwind CSS v4 with custom design tokens for colors, spacing, and typography. CSS variables define theme colors supporting both light and dark modes. Custom utility classes for hover effects (`hover-elevate`, `active-elevate-2`).

**Animation**: Framer Motion for page transitions and interactive elements on the landing page.

**Data Visualization**: Recharts library for rendering charts and graphs in the benchmarks and report pages.

**Build Tool**: Vite with custom plugins including runtime error overlay, meta image updates for OpenGraph tags, and Replit-specific development tools (cartographer, dev banner).

**Document Generation**: Client-side export functionality using:
- jsPDF with autoTable for PDF generation
- XLSX for Excel spreadsheet export
- Docx for Microsoft Word document creation
- FileSaver for download handling

### Backend Architecture

**Runtime**: Node.js with TypeScript, using ES modules throughout.

**Web Framework**: Express.js for HTTP server with middleware for JSON parsing and request logging. Custom logging function formats timestamps and tracks request duration.

**API Design**: RESTful API with a single primary endpoint (`POST /api/analyze`) that handles both new analysis generation and retrieval of existing reports. Returns cached results when available to avoid redundant AI calls.

**AI Integration**: Anthropic Claude 3.5 Sonnet via the official `@anthropic-ai/sdk`. The AI service implements a detailed prompting framework that analyzes companies across business functions, applying conservative financial estimates and structuring output into steps with executive dashboards.

**Development Server**: Custom Vite integration for hot module replacement during development, with middleware mode for serving the React application alongside the Express API.

**Production Build**: esbuild bundles the server code with selective dependency bundling (allowlist approach) to reduce cold start times. Client built separately with Vite and served as static files.

### Data Storage

**Database**: PostgreSQL via Neon serverless with WebSocket support for edge compatibility.

**ORM**: Drizzle ORM with type-safe schema definitions and query building. Schema uses UUID primary keys and JSONB for storing complex analysis results.

**Schema Design**: Single `reports` table storing:
- Company name
- Complete analysis data (JSONB containing steps, summary, and executive dashboard)
- Created/updated timestamps

**Migration Strategy**: Drizzle Kit for schema migrations with configurations in `drizzle.config.ts`.

**Storage Layer**: Abstracted through an `IStorage` interface with a `DatabaseStorage` implementation, allowing for potential storage backend swaps without changing business logic.

### External Dependencies

**AI Service**: Anthropic Claude API accessed via environment variables:
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` for authentication
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` for custom endpoints (likely Replit AI integration)

**Database**: Neon PostgreSQL serverless database via `DATABASE_URL` environment variable.

**Third-Party Libraries**:
- UI Components: Extensive Radix UI component collection (@radix-ui/react-*)
- Form Handling: React Hook Form with Zod resolvers for validation
- Date Manipulation: date-fns
- Icons: Lucide React
- Styling: Tailwind CSS with class-variance-authority for variant management
- Charts: Recharts for data visualization
- Document Export: jsPDF, xlsx, docx, file-saver

**Development Tools**:
- Replit-specific Vite plugins for development experience
- TypeScript for type safety across the stack
- ESBuild and Vite for bundling and building

**Deployment**: Configured for Replit deployment with custom meta image plugin that updates OpenGraph tags based on deployment URL.