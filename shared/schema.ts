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

// Assumption Categories - expanded for holistic coverage
export const ASSUMPTION_CATEGORIES = [
  "company_financials",
  "labor_statistics", 
  "industry_benchmarks",
  "macroeconomic",
  "ai_modeling",
  "operational_metrics",
  "risk_factors"
] as const;

export type AssumptionCategory = typeof ASSUMPTION_CATEGORIES[number];

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

// Default Assumption Templates by Category - comprehensive and modular
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
  company_financials: [
    { fieldName: "company_name", displayName: "Company Name", defaultValue: "", valueType: "text", description: "Company being analyzed", usedInSteps: ["0", "summary"] },
    { fieldName: "industry", displayName: "Industry / Sector", defaultValue: "", valueType: "text", description: "Primary industry classification (NAICS/SIC)", usedInSteps: ["0", "1"] },
    { fieldName: "annual_revenue", displayName: "Annual Revenue", defaultValue: "0", valueType: "currency", unit: "$", description: "Total annual revenue (from 10-K or estimates)", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["0", "3", "5"] },
    { fieldName: "gross_margin", displayName: "Gross Margin", defaultValue: "40", valueType: "percentage", unit: "%", description: "Gross profit / Revenue (from financial statements)", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "operating_margin", displayName: "Operating Margin", defaultValue: "15", valueType: "percentage", unit: "%", description: "Operating income / Revenue", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "net_income", displayName: "Net Income", defaultValue: "0", valueType: "currency", unit: "$", description: "Annual net income after taxes", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "total_assets", displayName: "Total Assets", defaultValue: "0", valueType: "currency", unit: "$", description: "Total assets from balance sheet", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "fiscal_year_end", displayName: "Fiscal Year End", defaultValue: "December", valueType: "text", description: "Month when fiscal year ends", usedInSteps: ["0"] },
  ],
  labor_statistics: [
    { fieldName: "total_employees", displayName: "Total Employees", defaultValue: "1000", valueType: "number", description: "Total headcount (from 10-K or LinkedIn)", sourceUrl: "SEC EDGAR API", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["0", "3", "6"] },
    { fieldName: "avg_hourly_wage", displayName: "Average Hourly Wage", defaultValue: "32.07", valueType: "currency", unit: "$/hr", description: "BLS private-sector average wage (Jun 2025)", sourceUrl: "https://www.bls.gov/news.release/ecec.toc.htm", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["3", "5", "6"] },
    { fieldName: "avg_hourly_benefits", displayName: "Average Hourly Benefits", defaultValue: "13.58", valueType: "currency", unit: "$/hr", description: "BLS employer benefit costs (29.8% of total comp)", sourceUrl: "https://www.bls.gov/news.release/ecec.toc.htm", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["3", "5"] },
    { fieldName: "fully_burdened_rate", displayName: "Fully Burdened Hourly Cost", defaultValue: "45.65", valueType: "currency", unit: "$/hr", description: "Total employer cost per hour (wage + benefits)", sourceUrl: "BLS ECEC", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["3", "5", "6"] },
    { fieldName: "burden_multiplier", displayName: "Burden Multiplier", defaultValue: "1.40", valueType: "number", description: "Total cost / base salary (typically 1.25-1.4x per SBA)", sourceUrl: "SBA Guidelines", usedInSteps: ["3", "5"] },
    { fieldName: "work_hours_year", displayName: "Annual Work Hours", defaultValue: "2080", valueType: "number", unit: "hrs", description: "Standard annual work hours (40 hrs × 52 weeks)", usedInSteps: ["3", "5", "6"] },
    { fieldName: "it_staff_count", displayName: "IT Staff Count", defaultValue: "50", valueType: "number", description: "Technology and IT department headcount", usedInSteps: ["6"] },
    { fieldName: "sales_staff_count", displayName: "Sales Staff Count", defaultValue: "100", valueType: "number", description: "Sales and business development headcount", usedInSteps: ["3", "5"] },
  ],
  industry_benchmarks: [
    { fieldName: "revenue_multiple", displayName: "Revenue Multiple (EV/Rev)", defaultValue: "3.5", valueType: "number", unit: "x", description: "Enterprise value / Revenue for sector", sourceUrl: "Damodaran Data Library", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "wacc", displayName: "WACC", defaultValue: "10.5", valueType: "percentage", unit: "%", description: "Weighted average cost of capital for sector", sourceUrl: "Kroll Cost of Capital", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["5"] },
    { fieldName: "industry_growth_rate", displayName: "Industry Growth Rate", defaultValue: "5.2", valueType: "percentage", unit: "%", description: "Annual sector growth rate", sourceUrl: "IBISWorld", autoRefresh: true, refreshFrequency: "annually", usedInSteps: ["1", "5"] },
    { fieldName: "peer_ai_adoption", displayName: "Peer AI Adoption Rate", defaultValue: "35", valueType: "percentage", unit: "%", description: "Percentage of peers with AI initiatives", usedInSteps: ["1", "7"] },
    { fieldName: "avg_dso", displayName: "Industry Avg DSO", defaultValue: "45", valueType: "number", unit: "days", description: "Average days sales outstanding in sector", usedInSteps: ["2", "3"] },
    { fieldName: "avg_inventory_turns", displayName: "Industry Avg Inventory Turns", defaultValue: "6", valueType: "number", unit: "x/year", description: "Average inventory turnover for sector", usedInSteps: ["2", "3"] },
  ],
  macroeconomic: [
    { fieldName: "inflation_rate", displayName: "CPI Inflation Rate", defaultValue: "3.0", valueType: "percentage", unit: "%", description: "Annual CPI all-items inflation (Sep 2025)", sourceUrl: "https://www.bls.gov/cpi/", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["5"] },
    { fieldName: "unemployment_rate", displayName: "Unemployment Rate", defaultValue: "4.4", valueType: "percentage", unit: "%", description: "National unemployment rate", sourceUrl: "https://www.bls.gov/cps/", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["3"] },
    { fieldName: "gdp_growth", displayName: "GDP Growth Rate", defaultValue: "2.5", valueType: "percentage", unit: "%", description: "Annual real GDP growth rate", sourceUrl: "https://fred.stlouisfed.org/series/GDP", autoRefresh: true, refreshFrequency: "quarterly", usedInSteps: ["1", "5"] },
    { fieldName: "fed_funds_rate", displayName: "Fed Funds Rate", defaultValue: "5.25", valueType: "percentage", unit: "%", description: "Federal Reserve target rate", sourceUrl: "https://fred.stlouisfed.org/series/FEDFUNDS", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["5"] },
    { fieldName: "vix_index", displayName: "VIX Volatility Index", defaultValue: "18", valueType: "number", description: "CBOE market volatility (Low: <15, Normal: 15-20, High: 20-30)", sourceUrl: "CBOE VIX", autoRefresh: true, refreshFrequency: "daily", usedInSteps: ["7"] },
    { fieldName: "market_volatility_tier", displayName: "Market Volatility Tier", defaultValue: "Normal", valueType: "text", description: "Risk tier: Low, Normal, High, Very High", usedInSteps: ["7"] },
    { fieldName: "corporate_tax_rate", displayName: "Corporate Tax Rate", defaultValue: "21", valueType: "percentage", unit: "%", description: "Federal corporate income tax rate", usedInSteps: ["5"] },
  ],
  ai_modeling: [
    { fieldName: "llm_model", displayName: "Primary LLM Model", defaultValue: "Claude 3.5 Sonnet", valueType: "text", description: "AI model used for analysis", usedInSteps: ["4", "6"] },
    { fieldName: "input_token_cost", displayName: "Input Token Cost (per 1M)", defaultValue: "3.00", valueType: "currency", unit: "$", description: "Anthropic Claude input pricing", sourceUrl: "https://www.anthropic.com/pricing", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["6"] },
    { fieldName: "output_token_cost", displayName: "Output Token Cost (per 1M)", defaultValue: "15.00", valueType: "currency", unit: "$", description: "Anthropic Claude output pricing", sourceUrl: "https://www.anthropic.com/pricing", autoRefresh: true, refreshFrequency: "monthly", usedInSteps: ["6"] },
    { fieldName: "prompt_caching_discount", displayName: "Prompt Caching Discount", defaultValue: "90", valueType: "percentage", unit: "%", description: "Cost reduction for cached prompts", sourceUrl: "https://www.anthropic.com/pricing", usedInSteps: ["6"] },
    { fieldName: "caching_effectiveness", displayName: "Caching Effectiveness", defaultValue: "40", valueType: "percentage", unit: "%", description: "Percentage of queries using cached prompts", usedInSteps: ["6"] },
    { fieldName: "avg_input_tokens", displayName: "Avg Input Tokens per Run", defaultValue: "500", valueType: "number", description: "Average input tokens per AI interaction", usedInSteps: ["6"] },
    { fieldName: "avg_output_tokens", displayName: "Avg Output Tokens per Run", defaultValue: "300", valueType: "number", description: "Average output tokens per AI interaction", usedInSteps: ["6"] },
    { fieldName: "model_context_window", displayName: "Model Context Window", defaultValue: "200000", valueType: "number", unit: "tokens", description: "Maximum context window for selected model", usedInSteps: ["4", "6"] },
  ],
  operational_metrics: [
    { fieldName: "avg_ticket_volume", displayName: "Monthly Support Tickets", defaultValue: "5000", valueType: "number", description: "Average monthly customer support tickets", usedInSteps: ["3", "4", "6"] },
    { fieldName: "avg_resolution_time", displayName: "Avg Resolution Time", defaultValue: "24", valueType: "number", unit: "hrs", description: "Average time to resolve support tickets", usedInSteps: ["2", "3"] },
    { fieldName: "process_automation_rate", displayName: "Current Automation Rate", defaultValue: "25", valueType: "percentage", unit: "%", description: "Percentage of processes currently automated", usedInSteps: ["3", "4"] },
    { fieldName: "manual_data_entry_hrs", displayName: "Manual Data Entry Hours", defaultValue: "500", valueType: "number", unit: "hrs/month", description: "Monthly hours spent on manual data entry", usedInSteps: ["3", "5"] },
    { fieldName: "document_processing_volume", displayName: "Monthly Document Volume", defaultValue: "10000", valueType: "number", description: "Documents processed per month", usedInSteps: ["4", "6"] },
    { fieldName: "avg_approval_cycle", displayName: "Avg Approval Cycle Time", defaultValue: "5", valueType: "number", unit: "days", description: "Average time for approval workflows", usedInSteps: ["3", "4"] },
    { fieldName: "error_rate", displayName: "Manual Process Error Rate", defaultValue: "3", valueType: "percentage", unit: "%", description: "Error rate in manual processes", usedInSteps: ["3", "5"] },
  ],
  risk_factors: [
    { fieldName: "confidence_adjustment", displayName: "Confidence Adjustment", defaultValue: "70", valueType: "percentage", unit: "%", description: "Risk-adjusted probability factor for benefits", usedInSteps: ["5", "7"] },
    { fieldName: "adoption_rate", displayName: "Projected Adoption Rate", defaultValue: "65", valueType: "percentage", unit: "%", description: "Expected user adoption of AI tools", usedInSteps: ["5", "6", "7"] },
    { fieldName: "implementation_risk", displayName: "Implementation Risk Factor", defaultValue: "Medium", valueType: "text", description: "Overall implementation risk: Low, Medium, High", usedInSteps: ["7"] },
    { fieldName: "data_readiness_score", displayName: "Data Readiness Score", defaultValue: "3", valueType: "number", unit: "1-5", description: "Organization's data quality and accessibility (1=Poor, 5=Excellent)", usedInSteps: ["6", "7"] },
    { fieldName: "change_mgmt_score", displayName: "Change Management Readiness", defaultValue: "3", valueType: "number", unit: "1-5", description: "Organization's change management capability (1=Poor, 5=Excellent)", usedInSteps: ["6", "7"] },
    { fieldName: "weight_value", displayName: "Priority Weight: Value", defaultValue: "40", valueType: "percentage", unit: "%", description: "Value weight in priority scoring (Value + TTV + Effort = 100%)", usedInSteps: ["7"] },
    { fieldName: "weight_ttv", displayName: "Priority Weight: Time-to-Value", defaultValue: "30", valueType: "percentage", unit: "%", description: "Time-to-value weight in priority scoring", usedInSteps: ["7"] },
    { fieldName: "weight_effort", displayName: "Priority Weight: Effort", defaultValue: "30", valueType: "percentage", unit: "%", description: "Implementation effort weight in priority scoring", usedInSteps: ["7"] },
  ],
};
