import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  analysisData: jsonb("analysis_data").notNull(),
  isWhatIf: boolean("is_what_if").default(false).notNull(),
  parentReportId: varchar("parent_report_id"),
  whatIfVersion: integer("what_if_version").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// Parent categories for hierarchical organization (per document Section 3)
export const PARENT_CATEGORIES = [
  "financial_operational",   // Company financial & operational assumptions
  "ai_technology",           // AI model & technology assumptions
  "industry_benchmark",      // Industry benchmark assumptions
  "performance_operational"  // Operational & performance assumptions
] as const;

export type ParentCategory = typeof PARENT_CATEGORIES[number];

// Parent category display names and descriptions
export const PARENT_CATEGORY_META: Record<ParentCategory, { label: string; description: string }> = {
  financial_operational: {
    label: "Company Financial & Operational",
    description: "Revenue, margins, employees, labor costs, CAC, LTV, and compliance metrics"
  },
  ai_technology: {
    label: "AI Model & Technology",
    description: "LLM models, token costs, context windows, adoption rates, and confidence multipliers"
  },
  industry_benchmark: {
    label: "Industry Benchmarks",
    description: "Revenue multiples, WACC, market volatility, and sector-specific metrics"
  },
  performance_operational: {
    label: "Operational & Performance",
    description: "Baseline KPIs, target KPIs, process metrics, and improvement uplift assumptions"
  }
};

// Subcategories (mapped to parent categories) - expanded for holistic coverage
export const ASSUMPTION_CATEGORIES = [
  "company_financials",
  "labor_statistics", 
  "customer_metrics",
  "compliance_risk",
  "industry_benchmarks",
  "macroeconomic",
  "ai_modeling",
  "ai_adoption",
  "operational_metrics",
  "kpi_baselines",
  "kpi_targets",
  "improvement_uplifts",
  "risk_factors"
] as const;

export type AssumptionCategory = typeof ASSUMPTION_CATEGORIES[number];

// Mapping subcategories to parent categories
export const CATEGORY_TO_PARENT: Record<AssumptionCategory, ParentCategory> = {
  company_financials: "financial_operational",
  labor_statistics: "financial_operational",
  customer_metrics: "financial_operational",
  compliance_risk: "financial_operational",
  industry_benchmarks: "industry_benchmark",
  macroeconomic: "industry_benchmark",
  ai_modeling: "ai_technology",
  ai_adoption: "ai_technology",
  operational_metrics: "performance_operational",
  kpi_baselines: "performance_operational",
  kpi_targets: "performance_operational",
  improvement_uplifts: "performance_operational",
  risk_factors: "ai_technology"
};

// Subcategory display names
export const CATEGORY_LABELS: Record<AssumptionCategory, string> = {
  company_financials: "Company Financials",
  labor_statistics: "Labor Statistics",
  customer_metrics: "Customer Metrics",
  compliance_risk: "Compliance & Risk",
  industry_benchmarks: "Industry Benchmarks",
  macroeconomic: "Macroeconomic Indicators",
  ai_modeling: "AI Model Costs",
  ai_adoption: "AI Adoption & Confidence",
  operational_metrics: "Operational Metrics",
  kpi_baselines: "Baseline KPIs",
  kpi_targets: "Target KPIs",
  improvement_uplifts: "Improvement Uplifts",
  risk_factors: "Risk & Weighting Factors"
};

// Data Sources
export const ASSUMPTION_SOURCES = [
  "Client Provided",
  "Industry Benchmark",
  "API - External",
  "Analyst Estimate",
  "System Default"
] as const;

export type AssumptionSource = typeof ASSUMPTION_SOURCES[number];

// Assumption Sets (Scenarios)
export const assumptionSets = pgTable("assumption_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(false).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAssumptionSetSchema = createInsertSchema(assumptionSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAssumptionSet = z.infer<typeof insertAssumptionSetSchema>;
export type AssumptionSet = typeof assumptionSets.$inferSelect;

// Assumption Fields (Individual Values) - Enhanced with traceability and auto-refresh
export const assumptionFields = pgTable("assumption_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull(),
  category: text("category").notNull(),
  fieldName: text("field_name").notNull(),
  displayName: text("display_name").notNull(),
  value: text("value").notNull(),
  valueType: text("value_type").notNull().default("text"),
  unit: text("unit"),
  source: text("source").notNull().default("System Default"),
  sourceUrl: text("source_url"),
  description: text("description"),
  usedInSteps: text("used_in_steps").array(),
  autoRefresh: boolean("auto_refresh").default(false).notNull(),
  refreshFrequency: text("refresh_frequency"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  isLocked: boolean("is_locked").default(false).notNull(),
  isCustom: boolean("is_custom").default(false).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAssumptionFieldSchema = createInsertSchema(assumptionFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAssumptionField = z.infer<typeof insertAssumptionFieldSchema>;
export type AssumptionField = typeof assumptionFields.$inferSelect;

// Refresh frequencies for auto-updating fields
export const REFRESH_FREQUENCIES = [
  "daily",
  "weekly", 
  "monthly",
  "quarterly",
  "annually",
  "manual"
] as const;

export type RefreshFrequency = typeof REFRESH_FREQUENCIES[number];

// Default Assumption Templates by Category - comprehensive and modular (per document Section 3)
export const DEFAULT_ASSUMPTIONS: Record<AssumptionCategory, Array<{
  fieldName: string;
  displayName: string;
  defaultValue: string;
  valueType: string;
  unit?: string;
  description: string;
  sourceUrl?: string;
  autoRefresh?: boolean;
  refreshFrequency?: RefreshFrequency;
  usedInSteps?: string[];
}>> = {
  // Section 3.1 - Company Financial & Operational Assumptions
  company_financials: [
    { fieldName: "company_name", displayName: "Company Name", defaultValue: "", valueType: "text", description: "Company being analyzed", usedInSteps: ["0", "summary"] },
    { fieldName: "industry", displayName: "Industry / Sector", defaultValue: "", valueType: "text", description: "Primary industry classification (NAICS/SIC)", usedInSteps: ["0", "1"] },
    { fieldName: "annual_revenue", displayName: "Annual Revenue", defaultValue: "0", valueType: "currency", unit: "$", description: "Latest fiscal-year total revenue - underpins total AI value calculations", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["0", "3", "5"] },
    { fieldName: "revenue_growth_rate", displayName: "Revenue Growth Rate", defaultValue: "8", valueType: "percentage", unit: "%", description: "Year-over-year revenue growth - needed to forecast future benefits", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["1", "5"] },
    { fieldName: "gross_margin", displayName: "Gross Margin", defaultValue: "40", valueType: "percentage", unit: "%", description: "Gross profit / Revenue - indicates profitability and cost-benefit potential", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "operating_margin", displayName: "Operating Margin", defaultValue: "15", valueType: "percentage", unit: "%", description: "Operating income / Revenue - provides context for cost-saving potential", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "net_income", displayName: "Net Income", defaultValue: "0", valueType: "currency", unit: "$", description: "Annual net income after taxes", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "total_assets", displayName: "Total Assets", defaultValue: "0", valueType: "currency", unit: "$", description: "Total assets from balance sheet", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "fiscal_year_end", displayName: "Fiscal Year End", defaultValue: "December", valueType: "text", description: "Month when fiscal year ends", usedInSteps: ["0"] },
  ],
  labor_statistics: [
    { fieldName: "total_employees", displayName: "Total Employees", defaultValue: "1000", valueType: "number", description: "Total headcount - drives adoption assumptions and productivity calculations", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["0", "3", "6"] },
    { fieldName: "customer_facing_reps", displayName: "Customer-Facing Representatives", defaultValue: "200", valueType: "number", description: "Number of customer-facing staff (sales, support, service)", usedInSteps: ["3", "5"] },
    { fieldName: "avg_revenue_per_rep", displayName: "Avg Revenue per Representative", defaultValue: "500000", valueType: "currency", unit: "$", description: "Annual revenue / number of representatives - quantifies productivity improvements", usedInSteps: ["3", "5"] },
    { fieldName: "avg_salary", displayName: "Average Salary", defaultValue: "65000", valueType: "currency", unit: "$", description: "Average base compensation per employee", usedInSteps: ["3", "5"] },
    { fieldName: "avg_hourly_wage", displayName: "Average Hourly Wage", defaultValue: "32.07", valueType: "currency", unit: "$/hr", description: "BLS private-sector average wage (Jun 2025)", sourceUrl: "https://www.bls.gov/news.release/ecec.toc.htm", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["3", "5", "6"] },
    { fieldName: "avg_hourly_benefits", displayName: "Average Hourly Benefits", defaultValue: "13.58", valueType: "currency", unit: "$/hr", description: "BLS employer benefit costs (29.8% of total comp)", sourceUrl: "https://www.bls.gov/news.release/ecec.toc.htm", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["3", "5"] },
    { fieldName: "fully_burdened_rate", displayName: "Fully Burdened Hourly Cost", defaultValue: "45.65", valueType: "currency", unit: "$/hr", description: "Total employer cost per hour including wages, taxes, benefits, paid leave", sourceUrl: "BLS ECEC", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["3", "5", "6"] },
    { fieldName: "burden_multiplier", displayName: "Burden Multiplier", defaultValue: "1.40", valueType: "number", description: "Total cost / base salary (typically 1.25-1.5x per SBA - may add up to 50% beyond base pay)", sourceUrl: "SBA Guidelines", usedInSteps: ["3", "5"] },
    { fieldName: "work_hours_year", displayName: "Annual Work Hours", defaultValue: "2080", valueType: "number", unit: "hrs", description: "Standard annual work hours (40 hrs × 52 weeks)", usedInSteps: ["3", "5", "6"] },
    { fieldName: "it_staff_count", displayName: "IT Staff Count", defaultValue: "50", valueType: "number", description: "Technology and IT department headcount", usedInSteps: ["6"] },
    { fieldName: "sales_staff_count", displayName: "Sales Staff Count", defaultValue: "100", valueType: "number", description: "Sales and business development headcount", usedInSteps: ["3", "5"] },
  ],
  customer_metrics: [
    { fieldName: "cac", displayName: "Customer Acquisition Cost (CAC)", defaultValue: "500", valueType: "currency", unit: "$", description: "Cost to acquire a new customer - used to quantify conversion rate improvements", usedInSteps: ["3", "5"] },
    { fieldName: "ltv", displayName: "Customer Lifetime Value (LTV)", defaultValue: "5000", valueType: "currency", unit: "$", description: "Present value of profits from a customer over the relationship - estimates revenue uplift from retention", usedInSteps: ["3", "5"] },
    { fieldName: "ltv_cac_ratio", displayName: "LTV:CAC Ratio", defaultValue: "10", valueType: "number", unit: "x", description: "Lifetime value divided by acquisition cost - healthy ratio is 3:1+", usedInSteps: ["1", "5"] },
    { fieldName: "retention_rate", displayName: "Annual Retention Rate", defaultValue: "85", valueType: "percentage", unit: "%", description: "Percentage of customers retained annually - drives revenue benefit calculations", usedInSteps: ["2", "3", "5"] },
    { fieldName: "churn_rate", displayName: "Annual Churn Rate", defaultValue: "15", valueType: "percentage", unit: "%", description: "Percentage of customers lost annually (100% - retention rate)", usedInSteps: ["2", "3", "5"] },
    { fieldName: "arpu", displayName: "Avg Revenue per User (ARPU)", defaultValue: "1200", valueType: "currency", unit: "$/year", description: "Average annual revenue per customer", usedInSteps: ["3", "5"] },
    { fieldName: "nps_score", displayName: "Net Promoter Score (NPS)", defaultValue: "35", valueType: "number", description: "Customer satisfaction score (-100 to +100)", usedInSteps: ["2", "7"] },
  ],
  compliance_risk: [
    { fieldName: "compliance_cost", displayName: "Annual Compliance Cost", defaultValue: "500000", valueType: "currency", unit: "$", description: "Annual spending on regulatory compliance (auditing, call monitoring) - baseline for risk-reduction benefits", usedInSteps: ["3", "5"] },
    { fieldName: "audit_failure_rate", displayName: "Audit Failure Rate", defaultValue: "5", valueType: "percentage", unit: "%", description: "Current rate of compliance failures or audit exceptions - used in risk modeling", usedInSteps: ["3", "5"] },
    { fieldName: "regulatory_fines_annual", displayName: "Annual Regulatory Fines", defaultValue: "50000", valueType: "currency", unit: "$", description: "Average annual regulatory penalties and fines", usedInSteps: ["3", "5"] },
    { fieldName: "data_breach_probability", displayName: "Data Breach Probability", defaultValue: "3", valueType: "percentage", unit: "%", description: "Estimated annual probability of data breach incident", usedInSteps: ["5", "7"] },
    { fieldName: "avg_breach_cost", displayName: "Avg Data Breach Cost", defaultValue: "4450000", valueType: "currency", unit: "$", description: "Average cost per data breach (IBM 2024 report)", sourceUrl: "IBM Cost of Data Breach Report", autoRefresh: true, refreshFrequency: "annually", usedInSteps: ["5"] },
  ],
  // Section 3.3 - Industry Benchmark Assumptions
  industry_benchmarks: [
    { fieldName: "revenue_multiple", displayName: "Revenue Multiple (EV/Rev)", defaultValue: "3.5", valueType: "number", unit: "x", description: "Enterprise value / Revenue for sector (SaaS avg ~14x in 2024)", sourceUrl: "Damodaran Data Library", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "wacc", displayName: "WACC", defaultValue: "10.5", valueType: "percentage", unit: "%", description: "Weighted average cost of capital - reflects proportional cost of debt and equity", sourceUrl: "Kroll Cost of Capital", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "discount_rate", displayName: "Discount Rate", defaultValue: "10.5", valueType: "percentage", unit: "%", description: "Rate used to discount future cash flows - often set equal to WACC", usedInSteps: ["5"] },
    { fieldName: "cost_of_capital", displayName: "Cost of Capital", defaultValue: "4.2", valueType: "percentage", unit: "%", description: "Current interest rate or corporate bond yield", sourceUrl: "Kroll/NYU Data", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "industry_growth_rate", displayName: "Industry Growth Rate", defaultValue: "5.2", valueType: "percentage", unit: "%", description: "Annual sector growth rate", sourceUrl: "IBISWorld", autoRefresh: true, refreshFrequency: "annually", usedInSteps: ["1", "5"] },
    { fieldName: "peer_ai_adoption", displayName: "Peer AI Adoption Rate", defaultValue: "35", valueType: "percentage", unit: "%", description: "Percentage of peers with AI initiatives", usedInSteps: ["1", "7"] },
    { fieldName: "avg_dso", displayName: "Industry Avg DSO", defaultValue: "45", valueType: "number", unit: "days", description: "Average days sales outstanding in sector", usedInSteps: ["2", "3"] },
    { fieldName: "avg_inventory_turns", displayName: "Industry Avg Inventory Turns", defaultValue: "6", valueType: "number", unit: "x/year", description: "Average inventory turnover for sector", usedInSteps: ["2", "3"] },
    { fieldName: "analyst_sentiment", displayName: "Analyst Sentiment", defaultValue: "Neutral", valueType: "text", description: "Qualitative indicator (Bullish/Neutral/Bearish) summarizing market expectations", usedInSteps: ["7"] },
  ],
  macroeconomic: [
    { fieldName: "inflation_rate", displayName: "CPI Inflation Rate", defaultValue: "3.0", valueType: "percentage", unit: "%", description: "Annual CPI all-items inflation (Sep 2025: 3%)", sourceUrl: "https://www.bls.gov/cpi/", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["5"] },
    { fieldName: "unemployment_rate", displayName: "Unemployment Rate", defaultValue: "4.4", valueType: "percentage", unit: "%", description: "National unemployment rate (Sep 2025: 4.4%, 7.6M unemployed)", sourceUrl: "https://www.bls.gov/cps/", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["3"] },
    { fieldName: "gdp_growth", displayName: "GDP Growth Rate", defaultValue: "2.1", valueType: "percentage", unit: "%", description: "Annual real GDP growth rate - influences revenue forecasts", sourceUrl: "https://fred.stlouisfed.org/series/GDP", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["1", "5"] },
    { fieldName: "fed_funds_rate", displayName: "Fed Funds Rate", defaultValue: "5.25", valueType: "percentage", unit: "%", description: "Federal Reserve target rate - affects discount rates and borrowing costs", sourceUrl: "https://fred.stlouisfed.org/series/FEDFUNDS", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["5"] },
    { fieldName: "ten_year_treasury", displayName: "10-Year Treasury Yield", defaultValue: "4.5", valueType: "percentage", unit: "%", description: "10-year Treasury benchmark rate", sourceUrl: "https://fred.stlouisfed.org/series/DGS10", autoRefresh: true, refreshFrequency: "daily", usedInSteps: ["5"] },
    { fieldName: "vix_index", displayName: "VIX Volatility Index", defaultValue: "18", valueType: "number", description: "CBOE market volatility index value", sourceUrl: "CBOE VIX", autoRefresh: true, refreshFrequency: "daily", usedInSteps: ["7"] },
    { fieldName: "market_volatility_tier", displayName: "Market Volatility Tier", defaultValue: "Normal", valueType: "text", description: "VIX tier: Low (<15), Normal (15-25), High (25-30), Very High (>30) - provides context for risk assumptions", usedInSteps: ["7"] },
    { fieldName: "corporate_tax_rate", displayName: "Corporate Tax Rate", defaultValue: "21", valueType: "percentage", unit: "%", description: "Federal corporate income tax rate", usedInSteps: ["5"] },
  ],
  // Section 3.2 - AI Model & Technology Assumptions
  ai_modeling: [
    { fieldName: "llm_model", displayName: "Primary LLM Model", defaultValue: "Claude 3.5 Sonnet", valueType: "text", description: "AI model used - identifies token costs and capabilities", usedInSteps: ["4", "6"] },
    { fieldName: "input_token_cost", displayName: "Input Token Cost (per 1M)", defaultValue: "3.00", valueType: "currency", unit: "$", description: "Price per million input tokens (Claude 3.5 Sonnet: $3/1M)", sourceUrl: "https://www.anthropic.com/pricing", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["6"] },
    { fieldName: "output_token_cost", displayName: "Output Token Cost (per 1M)", defaultValue: "15.00", valueType: "currency", unit: "$", description: "Price per million output tokens (Claude 3.5 Sonnet: $15/1M)", sourceUrl: "https://www.anthropic.com/pricing", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["6"] },
    { fieldName: "model_context_window", displayName: "Model Context Window", defaultValue: "200000", valueType: "number", unit: "tokens", description: "Maximum tokens per request (Claude 3.5 Sonnet: 200K) - affects prompt design and caching", usedInSteps: ["4", "6"] },
    { fieldName: "prompt_caching_discount", displayName: "Prompt Caching Discount", defaultValue: "90", valueType: "percentage", unit: "%", description: "Cost reduction for cached prompts", sourceUrl: "https://www.anthropic.com/pricing", usedInSteps: ["6"] },
    { fieldName: "caching_effectiveness", displayName: "Caching Effectiveness", defaultValue: "40", valueType: "percentage", unit: "%", description: "Percentage of queries using cached prompts", usedInSteps: ["6"] },
    { fieldName: "avg_input_tokens", displayName: "Avg Input Tokens per Run", defaultValue: "500", valueType: "number", description: "Estimated tokens consumed per use-case run (from Step 6)", usedInSteps: ["6"] },
    { fieldName: "avg_output_tokens", displayName: "Avg Output Tokens per Run", defaultValue: "300", valueType: "number", description: "Estimated output tokens per use-case run", usedInSteps: ["6"] },
  ],
  ai_adoption: [
    { fieldName: "user_adoption_rate", displayName: "User Adoption Rate", defaultValue: "65", valueType: "percentage", unit: "%", description: "Expected percentage of employees using AI solution - scales token usage and cost estimates", usedInSteps: ["5", "6", "7"] },
    { fieldName: "confidence_multiplier", displayName: "Confidence Multiplier", defaultValue: "70", valueType: "percentage", unit: "%", description: "Probability-weighted adjustment factor for benefits (e.g., 70% confidence)", usedInSteps: ["5", "7"] },
    { fieldName: "ramp_time_months", displayName: "Ramp-Up Time", defaultValue: "3", valueType: "number", unit: "months", description: "Time to reach full adoption levels", usedInSteps: ["6", "7"] },
    { fieldName: "training_hours_per_user", displayName: "Training Hours per User", defaultValue: "8", valueType: "number", unit: "hrs", description: "Estimated training time per user for AI tools", usedInSteps: ["6"] },
  ],
  // Section 3.4 - Operational & Performance Assumptions
  operational_metrics: [
    { fieldName: "avg_ticket_volume", displayName: "Monthly Support Tickets", defaultValue: "5000", valueType: "number", description: "Average monthly customer support tickets", usedInSteps: ["3", "4", "6"] },
    { fieldName: "avg_resolution_time", displayName: "Avg Resolution Time", defaultValue: "24", valueType: "number", unit: "hrs", description: "Average time to resolve support tickets", usedInSteps: ["2", "3"] },
    { fieldName: "process_automation_rate", displayName: "Current Automation Rate", defaultValue: "25", valueType: "percentage", unit: "%", description: "Percentage of processes currently automated", usedInSteps: ["3", "4"] },
    { fieldName: "manual_data_entry_hrs", displayName: "Manual Data Entry Hours", defaultValue: "500", valueType: "number", unit: "hrs/month", description: "Monthly hours spent on manual data entry", usedInSteps: ["3", "5"] },
    { fieldName: "document_processing_volume", displayName: "Monthly Document Volume", defaultValue: "10000", valueType: "number", description: "Documents processed per month", usedInSteps: ["4", "6"] },
    { fieldName: "avg_approval_cycle", displayName: "Avg Approval Cycle Time", defaultValue: "5", valueType: "number", unit: "days", description: "Average time for approval workflows", usedInSteps: ["3", "4"] },
    { fieldName: "error_rate", displayName: "Manual Process Error Rate", defaultValue: "3", valueType: "percentage", unit: "%", description: "Error rate in manual processes", usedInSteps: ["3", "5"] },
  ],
  kpi_baselines: [
    { fieldName: "baseline_lead_response_time", displayName: "Baseline: Lead Response Time", defaultValue: "24", valueType: "number", unit: "hrs", description: "Current average time to respond to new leads", usedInSteps: ["2", "3"] },
    { fieldName: "baseline_conversion_rate", displayName: "Baseline: Conversion Rate", defaultValue: "15", valueType: "percentage", unit: "%", description: "Current lead-to-customer conversion rate", usedInSteps: ["2", "3", "5"] },
    { fieldName: "baseline_policy_cycle_time", displayName: "Baseline: Policy Issuance Cycle", defaultValue: "5", valueType: "number", unit: "days", description: "Current average time to issue a policy/contract", usedInSteps: ["2", "3"] },
    { fieldName: "baseline_claims_cycle_time", displayName: "Baseline: Claims Processing", defaultValue: "14", valueType: "number", unit: "days", description: "Current average claims processing time", usedInSteps: ["2", "3"] },
    { fieldName: "baseline_first_call_resolution", displayName: "Baseline: First Call Resolution", defaultValue: "65", valueType: "percentage", unit: "%", description: "Current first-call resolution rate", usedInSteps: ["2", "3"] },
    { fieldName: "baseline_agent_handle_time", displayName: "Baseline: Avg Handle Time", defaultValue: "8", valueType: "number", unit: "min", description: "Current average call handling time", usedInSteps: ["2", "3"] },
    { fieldName: "baseline_compliance_score", displayName: "Baseline: Compliance Score", defaultValue: "92", valueType: "percentage", unit: "%", description: "Current compliance/audit score", usedInSteps: ["2", "3"] },
  ],
  kpi_targets: [
    { fieldName: "target_lead_response_time", displayName: "Target: Lead Response Time", defaultValue: "4", valueType: "number", unit: "hrs", description: "Target time to respond to new leads", usedInSteps: ["2", "5"] },
    { fieldName: "target_conversion_rate", displayName: "Target: Conversion Rate", defaultValue: "22", valueType: "percentage", unit: "%", description: "Target lead-to-customer conversion rate", usedInSteps: ["2", "5"] },
    { fieldName: "target_policy_cycle_time", displayName: "Target: Policy Issuance Cycle", defaultValue: "2", valueType: "number", unit: "days", description: "Target time to issue a policy/contract", usedInSteps: ["2", "5"] },
    { fieldName: "target_claims_cycle_time", displayName: "Target: Claims Processing", defaultValue: "5", valueType: "number", unit: "days", description: "Target claims processing time", usedInSteps: ["2", "5"] },
    { fieldName: "target_first_call_resolution", displayName: "Target: First Call Resolution", defaultValue: "85", valueType: "percentage", unit: "%", description: "Target first-call resolution rate", usedInSteps: ["2", "5"] },
    { fieldName: "target_agent_handle_time", displayName: "Target: Avg Handle Time", defaultValue: "5", valueType: "number", unit: "min", description: "Target average call handling time", usedInSteps: ["2", "5"] },
    { fieldName: "target_compliance_score", displayName: "Target: Compliance Score", defaultValue: "98", valueType: "percentage", unit: "%", description: "Target compliance/audit score", usedInSteps: ["2", "5"] },
  ],
  improvement_uplifts: [
    { fieldName: "conversion_uplift", displayName: "Conversion Uplift", defaultValue: "15", valueType: "percentage", unit: "%", description: "Expected lift in conversion from AI scoring - used in revenue benefit calculations", usedInSteps: ["5"] },
    { fieldName: "retention_uplift", displayName: "Retention Uplift", defaultValue: "10", valueType: "percentage", unit: "%", description: "Expected improvement in customer retention - drives LTV calculations", usedInSteps: ["5"] },
    { fieldName: "cycle_time_reduction", displayName: "Cycle Time Reduction", defaultValue: "40", valueType: "percentage", unit: "%", description: "Expected reduction in process cycle times - drives cost savings", usedInSteps: ["5"] },
    { fieldName: "compliance_improvement", displayName: "Compliance Improvement", defaultValue: "50", valueType: "percentage", unit: "%", description: "Reduction in audit failures - used in risk-benefit calculations", usedInSteps: ["5"] },
    { fieldName: "productivity_improvement", displayName: "Productivity Improvement", defaultValue: "25", valueType: "percentage", unit: "%", description: "Expected productivity gain from AI assistance", usedInSteps: ["5"] },
    { fieldName: "error_reduction", displayName: "Error Reduction", defaultValue: "60", valueType: "percentage", unit: "%", description: "Expected reduction in manual process errors", usedInSteps: ["5"] },
  ],
  risk_factors: [
    { fieldName: "confidence_adjustment", displayName: "Confidence Adjustment", defaultValue: "70", valueType: "percentage", unit: "%", description: "Risk-adjusted probability factor for benefits - allows sensitivity analysis", usedInSteps: ["5", "7"] },
    { fieldName: "adoption_rate", displayName: "Projected Adoption Rate", defaultValue: "65", valueType: "percentage", unit: "%", description: "Expected user adoption of AI tools", usedInSteps: ["5", "6", "7"] },
    { fieldName: "implementation_risk", displayName: "Implementation Risk Factor", defaultValue: "Medium", valueType: "text", description: "Overall implementation risk: Low, Medium, High", usedInSteps: ["7"] },
    { fieldName: "data_readiness_score", displayName: "Data Readiness Score", defaultValue: "3", valueType: "number", unit: "1-5", description: "Organization's data quality and accessibility (1=Poor, 5=Excellent)", usedInSteps: ["6", "7"] },
    { fieldName: "change_mgmt_score", displayName: "Change Management Readiness", defaultValue: "3", valueType: "number", unit: "1-5", description: "Organization's change management capability (1=Poor, 5=Excellent)", usedInSteps: ["6", "7"] },
    { fieldName: "weight_value", displayName: "Priority Weight: Value", defaultValue: "40", valueType: "percentage", unit: "%", description: "Value weight in priority scoring (Value + TTV + Effort = 100%)", usedInSteps: ["7"] },
    { fieldName: "weight_ttv", displayName: "Priority Weight: Time-to-Value", defaultValue: "30", valueType: "percentage", unit: "%", description: "Time-to-value weight in priority scoring", usedInSteps: ["7"] },
    { fieldName: "weight_effort", displayName: "Priority Weight: Effort", defaultValue: "30", valueType: "percentage", unit: "%", description: "Implementation effort weight in priority scoring", usedInSteps: ["7"] },
  ],
};

// Formula Configuration for calculated fields
export const formulaConfigs = pgTable("formula_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  useCaseId: varchar("use_case_id"), // null = global default
  reportId: varchar("report_id"), // which report this belongs to
  fieldKey: text("field_key").notNull(), // e.g., "totalAnnualImpact", "priorityScore"
  label: text("label").notNull(), // human-friendly name
  expression: text("expression").notNull(), // the formula: "costSavings + revenueImpact"
  inputFields: text("input_fields").array().notNull(), // referenced fields
  constants: jsonb("constants").$type<FormulaConstant[]>().default([]),
  isActive: boolean("is_active").default(false).notNull(),
  version: integer("version").default(1).notNull(),
  notes: text("notes"),
  createdBy: text("created_by").default("system"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Type for formula constants
export interface FormulaConstant {
  key: string;
  label: string;
  value: number;
  description?: string;
}

export const insertFormulaConfigSchema = createInsertSchema(formulaConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFormulaConfig = z.infer<typeof insertFormulaConfigSchema>;
export type FormulaConfig = typeof formulaConfigs.$inferSelect;

// Predefined field keys for calculated fields
export const CALCULATED_FIELD_KEYS = [
  "totalAnnualImpact",
  "priorityScore",
  "valueScore",
  "ttvScore",
  "effortScore",
  "annualTokenCost",
  "netBenefit"
] as const;

export type CalculatedFieldKey = typeof CALCULATED_FIELD_KEYS[number];

// Default formulas for calculated fields
export const DEFAULT_FORMULAS: Record<CalculatedFieldKey, {
  label: string;
  expression: string;
  inputFields: string[];
  description: string;
}> = {
  totalAnnualImpact: {
    label: "Total Annual Impact (Default)",
    expression: "revenueBenefit + costBenefit + cashFlowBenefit + riskBenefit",
    inputFields: ["revenueBenefit", "costBenefit", "cashFlowBenefit", "riskBenefit"],
    description: "Sum of all benefit categories"
  },
  priorityScore: {
    label: "Priority Score (Default)",
    expression: "(valueScore * weightValue / 100) + (ttvScore * weightTtv / 100) + ((100 - effortScore) * weightEffort / 100)",
    inputFields: ["valueScore", "ttvScore", "effortScore", "weightValue", "weightTtv", "weightEffort"],
    description: "Weighted combination of value, time-to-value, and effort scores"
  },
  valueScore: {
    label: "Value Score (Default)",
    expression: "(totalAnnualImpact / maxTotalImpact) * 100 * (probabilityOfSuccess / 100)",
    inputFields: ["totalAnnualImpact", "maxTotalImpact", "probabilityOfSuccess"],
    description: "Normalized value score adjusted by probability"
  },
  ttvScore: {
    label: "TTV Score (Default)",
    expression: "max(0, 100 - (timeToValueMonths * 10))",
    inputFields: ["timeToValueMonths"],
    description: "Time-to-value score (higher = faster implementation)"
  },
  effortScore: {
    label: "Effort Score (Default)",
    expression: "effortScore",
    inputFields: ["effortScore"],
    description: "Direct pass-through of effort estimate"
  },
  annualTokenCost: {
    label: "Annual Token Cost (Default)",
    expression: "(avgInputTokens * inputTokenCost / 1000000 + avgOutputTokens * outputTokenCost / 1000000) * runsPerYear * (1 - cachingEffectiveness * promptCachingDiscount / 10000)",
    inputFields: ["avgInputTokens", "inputTokenCost", "avgOutputTokens", "outputTokenCost", "runsPerYear", "cachingEffectiveness", "promptCachingDiscount"],
    description: "Annual AI token costs with caching discount"
  },
  netBenefit: {
    label: "Net Benefit (Default)",
    expression: "totalAnnualImpact - annualTokenCost - implementationCost / 3",
    inputFields: ["totalAnnualImpact", "annualTokenCost", "implementationCost"],
    description: "Net annual benefit after costs (3-year amortization)"
  }
};
