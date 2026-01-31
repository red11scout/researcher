# BlueAlly Insight - Enterprise Research Platform

## Overview
BlueAlly Insight is an enterprise research and analysis platform designed to generate comprehensive AI opportunity assessments for companies. It leverages Claude AI to produce detailed reports on revenue opportunities, cost reduction, cash flow improvements, and risk mitigation through AI transformation. Users can generate reports by entering a company name, view saved analyses, and export results in various formats (PDF, Excel, Word). The platform features an intuitive interface with interactive data visualization, real-time analysis progress tracking, industry benchmarking, and advanced What-If Analysis capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing functional components and hooks. Wouter handles client-side routing, providing a lightweight solution. TanStack Query manages server state, while local state uses React hooks. The UI is constructed with Shadcn/ui, based on Radix UI primitives, styled using Tailwind CSS v4 with custom design tokens for a consistent look. Framer Motion is used for animations, and Recharts handles data visualization. Vite serves as the build tool, configured with custom plugins for development. Client-side document generation uses jsPDF, XLSX, and Docx libraries for various export formats.

### Backend Architecture
The backend is a Node.js Express.js application written in TypeScript, using ES modules. It provides a RESTful API, with a primary endpoint (`POST /api/analyze`) for generating or retrieving analyses, leveraging caching for efficiency. AI integration is managed via the Anthropic Claude 3.5 Sonnet SDK, employing a detailed prompting framework for comprehensive company analysis and structured output. A custom Vite integration provides hot module replacement for development. Production builds are optimized with esbuild for server code and Vite for static client assets.

### Data Storage
PostgreSQL, specifically Neon serverless, is used for data storage. Drizzle ORM provides type-safe schema definitions and query building. The schema includes a `reports` table storing company names, complete analysis data in JSONB format, and timestamps. Drizzle Kit manages schema migrations. A storage abstraction layer (`IStorage` with `DatabaseStorage` implementation) allows for flexible backend swaps.

### External Dependencies
- **AI Service**: Anthropic Claude API (`@anthropic-ai/sdk`), configured with `AI_INTEGRATIONS_ANTHROPIC_API_KEY` and `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`.
- **Database**: Neon PostgreSQL serverless database via `DATABASE_URL`.
- **Third-Party Libraries**:
    - UI Components: Radix UI (`@radix-ui/react-*`)
    - Form Handling: React Hook Form with Zod for validation
    - Date Manipulation: `date-fns`
    - Icons: `Lucide React`
    - Styling: Tailwind CSS, `class-variance-authority`
    - Charts: `Recharts`
    - Document Export: `jsPDF`, `xlsx`, `docx`, `file-saver`