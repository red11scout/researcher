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

// Assumption Categories
export const ASSUMPTION_CATEGORIES = [
  "company_profile",
  "labor_statistics", 
  "kpi_baselines",
  "ai_modeling",
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

// Assumption Fields (Individual Values)
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
  description: text("description"),
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

// Default Assumption Templates by Category
export const DEFAULT_ASSUMPTIONS: Record<AssumptionCategory, Array<{
  fieldName: string;
  displayName: string;
  defaultValue: string;
  valueType: string;
  unit?: string;
  description: string;
}>> = {
  company_profile: [
    { fieldName: "company_name", displayName: "Company Name", defaultValue: "", valueType: "text", description: "Company being analyzed" },
    { fieldName: "industry", displayName: "Industry / Sub-Industry", defaultValue: "", valueType: "text", description: "Primary industry classification" },
    { fieldName: "annual_revenue", displayName: "Annual Revenue", defaultValue: "0", valueType: "currency", unit: "$", description: "Total annual revenue" },
    { fieldName: "gross_margin", displayName: "Gross Margin (%)", defaultValue: "40", valueType: "percentage", unit: "%", description: "Gross margin percentage" },
    { fieldName: "operating_expenses", displayName: "Operating Expenses", defaultValue: "0", valueType: "currency", unit: "$", description: "Annual operating expenses" },
  ],
  labor_statistics: [
    { fieldName: "total_employees", displayName: "Total Employees", defaultValue: "100", valueType: "number", description: "Total headcount" },
    { fieldName: "sales_reps", displayName: "Number of Sales Reps", defaultValue: "20", valueType: "number", description: "Sales team size" },
    { fieldName: "hourly_cost", displayName: "Fully Burdened Cost per Hour", defaultValue: "75", valueType: "currency", unit: "$/hr", description: "Avg hourly cost including benefits" },
    { fieldName: "work_hours_week", displayName: "Average Work Hours per Week", defaultValue: "40", valueType: "number", unit: "hrs", description: "Standard work week hours" },
  ],
  kpi_baselines: [
    { fieldName: "rep_productivity", displayName: "Average Rep Productivity (Annual)", defaultValue: "95000", valueType: "currency", unit: "$", description: "Annual revenue per sales rep" },
    { fieldName: "conversion_rate", displayName: "Lead-to-Client Conversion Rate", defaultValue: "12", valueType: "percentage", unit: "%", description: "Percentage of leads converted" },
    { fieldName: "cac", displayName: "Customer Acquisition Cost (CAC)", defaultValue: "850", valueType: "currency", unit: "$", description: "Cost to acquire one customer" },
    { fieldName: "retention_rate", displayName: "Annual Retention Rate", defaultValue: "78", valueType: "percentage", unit: "%", description: "Customer retention percentage" },
    { fieldName: "ltv", displayName: "Average Customer LTV", defaultValue: "12000", valueType: "currency", unit: "$", description: "Lifetime value per customer" },
    { fieldName: "manual_task_hours", displayName: "Time Spent on Manual Tasks", defaultValue: "12", valueType: "number", unit: "hrs/week", description: "Weekly hours on manual work" },
  ],
  ai_modeling: [
    { fieldName: "llm_model", displayName: "Primary LLM Model", defaultValue: "Claude 3.5 Sonnet", valueType: "text", description: "AI model used for analysis" },
    { fieldName: "input_token_cost", displayName: "Input Token Cost (per 1M)", defaultValue: "3.00", valueType: "currency", unit: "$", description: "Cost per million input tokens" },
    { fieldName: "output_token_cost", displayName: "Output Token Cost (per 1M)", defaultValue: "15.00", valueType: "currency", unit: "$", description: "Cost per million output tokens" },
    { fieldName: "caching_effectiveness", displayName: "Caching Effectiveness (%)", defaultValue: "40", valueType: "percentage", unit: "%", description: "Query reuse rate" },
  ],
  risk_factors: [
    { fieldName: "confidence_adjustment", displayName: "Confidence Adjustment Factor (%)", defaultValue: "70", valueType: "percentage", unit: "%", description: "Risk-adjusted probability factor" },
    { fieldName: "adoption_rate", displayName: "Projected User Adoption Rate (%)", defaultValue: "65", valueType: "percentage", unit: "%", description: "Expected user adoption" },
    { fieldName: "weight_value", displayName: "Prioritization Weight: Value", defaultValue: "40", valueType: "percentage", unit: "%", description: "Value weight in priority score" },
    { fieldName: "weight_ttv", displayName: "Prioritization Weight: TTV", defaultValue: "30", valueType: "percentage", unit: "%", description: "Time-to-value weight" },
    { fieldName: "weight_effort", displayName: "Prioritization Weight: Effort", defaultValue: "30", valueType: "percentage", unit: "%", description: "Effort/cost weight" },
  ],
};
