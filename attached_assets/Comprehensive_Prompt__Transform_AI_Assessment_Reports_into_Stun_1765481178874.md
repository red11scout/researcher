# Comprehensive Prompt: Transform AI Assessment Reports into Stunning, Shareable Assets

## How to Use This Universal Prompt

This document is a universal template for instructing a Replit agent to redesign and enhance AI assessment reports for any company. To use it, you must replace the placeholders (e.g., `{{COMPANY_NAME}}`) with the specific details of the company and report you are working on.

**Placeholders to Replace:**

*   `{{COMPANY_NAME}}`: The name of the company for the report.
*   `{{TECH_STACK}}`: The technology stack of the project.
*   `{{CURRENT_REPORT_URL}}`: A URL to the current, pre-enhancement report (if available).
*   And all other placeholders within the branding and implementation sections.

---

## Your Role

You are an elite UI/UX designer and senior full-stack developer specializing in data visualization, executive-level business intelligence dashboards, and high-impact report design. Your expertise spans modern web technologies (React, TypeScript, Tailwind CSS), advanced charting libraries (Recharts, Chart.js), and PDF generation frameworks. You have a proven track record of creating reports that not only inform but inspire action and compel sharing among C-suite executives.

---

## Mission Statement

Transform the existing {{COMPANY_NAME}} AI Assessment reports (HTML and PDF) from functional but visually basic documents into **stunning, modern, executive-grade assets** that wow decision-makers, compel them to share with colleagues, and drive them to book meetings and AI Workshops. The redesigned reports must maintain all existing data and analysis while presenting it in a visually breathtaking format that perfectly aligns with the company's brand identity and incorporates industry-leading design principles.

---

## Critical Success Criteria

The redesigned reports must achieve the following:

1.  **Immediate Visual Impact**: The first page must grab attention within 3 seconds with bold visuals, compelling metrics, and professional polish.
2.  **Shareability**: The design must be so impressive that recipients feel compelled to forward it to colleagues and superiors.
3.  **Brand Alignment**: Perfect adherence to the company's color palette, typography, and design language.
4.  **Data Clarity**: Complex information must be presented through intuitive visualizations that tell a clear story.
5.  **Executive Polish**: The quality must match or exceed reports from top-tier consulting firms (McKinsey, BCG, Deloitte).
6.  **Mobile Responsiveness**: The HTML report must be fully responsive and stunning on all devices.
7.  **Actionability**: The design should guide readers toward the next step (booking a meeting/workshop).

---

## Application Context

### Project Information

*   **Tech Stack**: {{TECH_STACK}}
*   **Current Report URL**: [{{CURRENT_REPORT_URL}}]({{CURRENT_REPORT_URL}}) *(if available)*

### Key Files to Modify

| File | Purpose | Current State |
|------|---------|---------------|
| `client/src/pages/ReportViewer.tsx` | Renders HTML version of reports | Basic layout with minimal styling |
| `client/src/pages/Report.tsx` | Generates PDF exports using jsPDF | Simple table-based PDF output |
| `tailwind.config.ts` | Tailwind CSS configuration | Limited custom colors |
| `client/src/index.css` | Global styles | Minimal custom styling |

### Report Structure (8-Step Framework)

The reports follow this consistent structure:

1.  **Executive Dashboard**: High-level KPIs and value metrics
2.  **Executive Summary**: Strategic narrative and key findings
3.  **Step 0 - Company Overview**: Background and context
4.  **Step 1 - Strategic Anchoring**: Business drivers and strategic themes
5.  **Step 2 - Business Function Inventory**: KPI baselines across functions
6.  **Step 3 - Friction Point Mapping**: Operational bottlenecks
7.  **Step 4 - AI Use Case Generation**: Specific AI opportunities
8.  **Step 5 - Benefits Quantification**: Financial impact by driver
9.  **Step 6 - Effort & Token Modeling**: Implementation costs and token usage
10. **Step 7 - Priority Roadmap**: Scored and tiered use cases

---

## {{COMPANY_NAME}} Branding Guidelines

### Color Palette (Hex Codes)

**Primary Colors:**
*   **Primary 1 (e.g., Dark Blue)**: `{{PRIMARY_COLOR_1}}` - Main backgrounds, headers, primary text
*   **Primary 2 (e.g., Royal Blue)**: `{{PRIMARY_COLOR_2}}` - Table headers, section dividers, emphasis
*   **Primary 3 (e.g., Bright Blue/Cyan)**: `{{PRIMARY_COLOR_3}}` - Accent lines, highlights, interactive elements

**Secondary Colors:**
*   **Secondary 1 (e.g., Green)**: `{{SECONDARY_COLOR_1}}` - Positive metrics, revenue growth
*   **Secondary 2 (e.g., Light Green)**: `{{SECONDARY_COLOR_2}}` - Gradient effects, value highlights
*   **Secondary 3 (e.g., Orange)**: `{{SECONDARY_COLOR_3}}` - Risk mitigation, warnings, secondary emphasis
*   **Secondary 4 (e.g., Light Blue)**: `{{SECONDARY_COLOR_4}}` - Callout boxes, subtle backgrounds

**Neutral Colors:**
*   **Neutral 1 (e.g., Off-White/Cream)**: `{{NEUTRAL_COLOR_1}}` - Main content backgrounds
*   **Neutral 2 (e.g., Light Gray)**: `{{NEUTRAL_COLOR_2}}` - Subtle backgrounds, borders
*   **Neutral 3 (e.g., Dark Text)**: `{{NEUTRAL_COLOR_3}}` - Body text, readable content
*   **Neutral 4 (e.g., White)**: `{{NEUTRAL_COLOR_4}}` - Cards, contrast elements

### Typography

**Font Family**: `{{FONT_FAMILY}}` (e.g., modern sans-serif fonts like Helvetica, Inter, or system fonts)

**Heading Hierarchy:**
*   **H1 (Page Titles)**: `{{H1_STYLE}}` (e.g., 2.5rem (40px), bold, primary color or white on dark backgrounds)
*   **H2 (Section Titles)**: `{{H2_STYLE}}` (e.g., 2rem (32px), bold, primary color, with accent color underline)
*   **H3 (Subsections)**: `{{H3_STYLE}}` (e.g., 1.5rem (24px), semi-bold, secondary color)
*   **Body Text**: `{{BODY_TEXT_STYLE}}` (e.g., 1rem (16px), regular, dark text color, line-height 1.6)

### Layout Principles

1.  **Generous White Space**: Avoid cramped designs; let content breathe.
2.  **Visual Hierarchy**: Clear distinction between primary, secondary, and tertiary information.
3.  **Color Coding**: Consistent use of colors for different data types.
4.  **Card-Based Design**: Use rounded cards with subtle shadows for content sections.
5.  **Accent Lines**: Use accent colors for horizontal lines under section titles.
6.  **Gradient Effects**: Subtle gradients on metric cards and key highlights.

### Brand Voice

*   **Professional and Strategic**: Executive-level language
*   **Data-Driven**: Emphasize quantified metrics and evidence
*   **Clear and Direct**: Avoid jargon; make complex concepts accessible
*   **Action-Oriented**: Guide readers toward next steps

---

## Industry Best Practices: "Wow Factor" Report Design

This section provides general best practices and does not need to be modified.

### Visual Clarity and Storytelling

Modern reports that command attention employ a **narrative-driven design** where each section builds upon the previous one, guiding the reader through a compelling story. The reports should follow this pattern: establish the opportunity (Executive Dashboard), provide context (Company Overview), identify challenges (Friction Points), present solutions (AI Use Cases), and quantify impact (Benefits & Roadmap).

Key techniques include using **visual anchors** (large numbers, bold charts) to draw the eye, creating **breathing space** with generous margins and padding, and establishing a **clear visual hierarchy** through size, color, and positioning. The best reports balance text with visuals at a 40:60 ratio, ensuring that data visualizations carry the primary message while text provides supporting context.

### Data Visualization Excellence

Replace basic tables with **modern, interactive charts** that tell stories at a glance. For the reports, this means:

**Executive Dashboard Metrics**: Transform the current text-based metrics into **large, visually striking stat cards** with:
*   Gradient backgrounds
*   Large, bold numbers (3-4rem font size)
*   Icons representing each metric type
*   Subtle shadows and rounded corners
*   Micro-animations on hover (for HTML)

**Value Distribution Chart**: Create a **horizontal bar chart** showing the breakdown by business driver using:
*   Brand-specific colors for each driver
*   Percentage labels on bars
*   Clean, modern styling
*   Interactive tooltips showing exact values

**Top Priority Use Cases Table**: Redesign as a **modern data table** with:
*   A prominent header row
*   Alternating row colors for readability
*   Priority score badges with color coding
*   Sortable columns (for HTML)
*   Clean typography and spacing

**Additional Visualizations to Add**:
*   **Donut chart** for value distribution by driver
*   **Timeline/Gantt chart** for implementation roadmap
*   **Scatter plot** for priority scoring (value vs. effort)
*   **Stacked bar charts** for benefits quantification
*   **Heatmap** for friction point severity across functions

### Interactive Elements (HTML Only)

Enhance engagement with:
*   **Hover effects**: Subtle scale transforms, color changes, shadow depth increases
*   **Tooltips**: Contextual information on hover for metrics and chart elements
*   **Expandable sections**: Accordion-style details for lengthy content
*   **Smooth scrolling**: Animated navigation between sections
*   **Sticky navigation**: Sidebar that follows the user as they scroll
*   **Print optimization**: CSS that ensures clean printing/PDF generation from browser

### Executive Polish and Sophistication

The redesigned reports must match the quality of **top-tier consulting firm deliverables**. This requires:

1.  **Attention to Detail**: Pixel-perfect alignment, consistent spacing, professional color choices
2.  **High-Quality Assets**: Use of professional icons (e.g., Lucide React)
3.  **Sophisticated Color Usage**: Subtle gradients, proper contrast ratios, strategic use of accent colors
4.  **Typography Mastery**: Proper font weights, sizes, and spacing for optimal readability
5.  **Print-Ready Quality**: Both HTML and PDF versions must look stunning in print

---

## Step-by-Step Implementation Guide

### Phase 1: Setup and Configuration

**1.1 Update Tailwind Configuration**

Modify `tailwind.config.ts` to include the complete company color palette:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          primary1: '{{PRIMARY_COLOR_1}}',
          primary2: '{{PRIMARY_COLOR_2}}',
          primary3: '{{PRIMARY_COLOR_3}}',
          secondary1: '{{SECONDARY_COLOR_1}}',
          secondary2: '{{SECONDARY_COLOR_2}}',
          secondary3: '{{SECONDARY_COLOR_3}}',
          secondary4: '{{SECONDARY_COLOR_4}}',
          neutral1: '{{NEUTRAL_COLOR_1}}',
          neutral2: '{{NEUTRAL_COLOR_2}}',
          neutral3: '{{NEUTRAL_COLOR_3}}',
          neutral4: '{{NEUTRAL_COLOR_4}}',
        },
      },
      fontFamily: {
        sans: ['{{FONT_FAMILY}}', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
}
```

**1.2 Install Required Dependencies**

Add these packages to `package.json`:

```bash
npm install recharts @react-pdf/renderer html-to-image react-to-print
npm install -D @types/react-to-print
```

### Phase 2: HTML Report Redesign (`ReportViewer.tsx`)

This phase involves a complete visual and structural overhaul of the main report component. The goal is to move from a simple, linear document to a dynamic, engaging, and visually rich experience.

*   **Implement a modern layout**: Use CSS Grid or Flexbox to create a multi-column, responsive layout. Consider a main content area with a sticky sidebar for navigation or key metrics.
*   **Create reusable components**: Break down the report into smaller, manageable React components (e.g., `StatCard`, `HorizontalBarChart`, `ModernTable`).
*   **Integrate new visualizations**: Use `recharts` to implement the new charts (donut, scatter plot, etc.).
*   **Apply branding**: Ensure all new components and layouts strictly adhere to the defined branding guidelines.

### Phase 3: PDF Generation Enhancement (`Report.tsx`)

This is one of the most critical and challenging phases. The goal is to generate a PDF that is a near-perfect replica of the stunning HTML report, not a simplified version.

*   **Use `@react-pdf/renderer`**: This library allows you to create PDFs using React components. You will need to create a separate set of React components that are compatible with this library.
*   **Replicate the design**: Translate the HTML/CSS design into the styling system of `@react-pdf/renderer`.
*   **Handle dynamic data**: Ensure that all data from the report is correctly passed to the PDF generation components.

---

## Quality Checklist

Before submitting your code, ensure:

- [ ] All brand colors are correctly implemented
- [ ] Typography hierarchy is clear and consistent
- [ ] All data visualizations are functional and beautiful
- [ ] HTML report is fully responsive (mobile, tablet, desktop)
- [ ] PDF report matches the HTML design quality
- [ ] All existing data and information is preserved
- [ ] Code is clean, commented, and maintainable
- [ ] No console errors or warnings
- [ ] Performance is acceptable (< 3s initial load, < 5s PDF generation)
- [ ] Accessibility standards are met (WCAG AA)
- [ ] The report is genuinely "wow-worthy" and shareable

---

## Final Notes

This is a high-stakes project. The redesigned reports will be shown to C-suite executives and decision-makers across various industries. They must be **flawless, stunning, and compelling**. The goal is not just to inform but to **inspire action** and **drive business outcomes** (meetings, workshops, contracts).

Approach this with the mindset of a top-tier design agency delivering a flagship project. Pay attention to every detail, from pixel-perfect alignment to smooth animations. The result should be a report that recipients are **proud to share** and **excited to act upon**.

If you have questions or need clarification on any aspect of this prompt, ask before proceeding. Otherwise, begin your research, design, and implementation work, and deliver code that transforms the AI Assessment into a true masterpiece.
