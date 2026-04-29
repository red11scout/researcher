# BlueAlly Insight - Enterprise Research Platform

## Overview
BlueAlly Insight is an enterprise research and analysis platform designed to generate comprehensive AI opportunity assessments for companies. It leverages Claude AI to produce detailed reports on revenue opportunities, cost reduction, cash flow improvements, and risk mitigation through AI transformation. Users can generate reports by entering a company name, view saved analyses, and export results in various formats (PDF, Excel, Word, HTML). The platform features an intuitive interface with interactive data visualization, real-time analysis progress tracking, industry benchmarking, and advanced What-If Analysis capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing functional components and hooks. Wouter handles client-side routing. TanStack Query manages server state, while local state uses React hooks. The UI is constructed with Shadcn/ui (based on Radix UI primitives), styled using Tailwind CSS v4 with custom design tokens. Framer Motion is used for animations, and Recharts handles data visualization. Vite serves as the build tool. Client-side document generation uses jsPDF, XLSX, and Docx libraries for various export formats.

### Backend Architecture
The backend is a Node.js Express.js application written in TypeScript, using ES modules. It provides a RESTful API for generating or retrieving analyses, leveraging caching. AI integration is managed via the Anthropic Claude 3.5 Sonnet SDK, employing a detailed prompting framework for comprehensive company analysis and structured output. A custom Vite integration provides hot module replacement for development. Production builds are optimized with esbuild for server code and Vite for static client assets.

### Data Storage
PostgreSQL, specifically Neon serverless, is used for data storage. Drizzle ORM provides type-safe schema definitions and query building. The schema includes a `reports` table storing company names, complete analysis data in JSONB format, and timestamps. Drizzle Kit manages schema migrations. A storage abstraction layer (`IStorage` with `DatabaseStorage` implementation) allows for flexible backend swaps.

### Calculation Engine
All monetary calculations use HyperFormula (spreadsheet-grade deterministic engine). The engine provides specific formulas for cost, revenue, cash flow, and risk benefits, as well as friction cost and token cost calculations. The post-processor prioritizes structured formula labels from the AI over formula string parsing. Key design decisions include exact deterministic values (no artificial rounding), defaulting to a 'moderate' scenario (1.0 multiplier), and capping `upliftPct` at 5%.

### Value-Readiness Matrix (VRM)
The VRM (v2.2) classifies benefits into quadrants (Champion, Quick Win, Strategic, Foundation) based on value and readiness, with specific cut-off points. It includes a safety-net rule to promote prototyping candidates if fewer than three are identified naturally. Diagnostic warnings are provided for various portfolio health indicators. Chart visuals represent these classifications with semantic colors and bubble sizes indicating Time to Value (TTV).

### Authentication & Security
The platform uses password-based authentication with `express-session`. Authentication is managed by a React context (`AuthProvider`) and protected routes (`ProtectedRoute`). Public routes include `/login` and shared dashboards (`/shared/:shareId`). The admin page (`/admin`) allows operators to manage reports and view an audit log of administrative activities. Security features include rate limiting on login attempts and security headers on all responses.

### EPOCH Framework
The MIT EPOCH Framework (Empathy, Presence, Opinion, Creativity, Hope) is integrated into every LLM system prompt via a constant `EPOCH_FRAMEWORK_DEFINITION` to guide AI behavior and prevent hallucination.

## External Dependencies
- **AI Service**: Anthropic Claude API (`@anthropic-ai/sdk`)
- **Database**: Neon PostgreSQL serverless database
- **Calculation Engine**: HyperFormula (`hyperformula`)
- **UI Components**: Radix UI (`@radix-ui/react-*`), Shadcn/ui
- **Form Handling**: React Hook Form, Zod
- **Date Manipulation**: `date-fns`
- **Icons**: `Lucide React`
- **Styling**: Tailwind CSS, `class-variance-authority`
- **Charts**: `Recharts`
- **Document Export**: `jsPDF`, `xlsx`, `docx`, `file-saver`