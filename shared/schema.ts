import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, real, uuid } from "drizzle-orm/pg-core";
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

export const sharedDashboards = pgTable("shared_dashboards", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  dubLinkId: text("dub_link_id"),
  shortUrl: text("short_url"),
});

export const insertSharedDashboardSchema = createInsertSchema(sharedDashboards).omit({
  createdAt: true,
});

export type InsertSharedDashboard = z.infer<typeof insertSharedDashboardSchema>;
export type SharedDashboard = typeof sharedDashboards.$inferSelect;

export const bulkUpdateJobs = pgTable("bulk_update_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyIds: jsonb("company_ids").notNull(), // array of report IDs
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, in_progress, completed, failed, cancelled
  progress: integer("progress").default(0).notNull(), // 0-100
  currentCompanyId: varchar("current_company_id"),
  completedCompanies: jsonb("completed_companies").default([]).notNull(), // array of {id, name, status}
  failedCompanies: jsonb("failed_companies").default([]).notNull(), // array of {id, name, error}
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBulkUpdateJobSchema = createInsertSchema(bulkUpdateJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertBulkUpdateJob = z.infer<typeof insertBulkUpdateJobSchema>;
export type BulkUpdateJob = typeof bulkUpdateJobs.$inferSelect;

export const bulkExports = pgTable("bulk_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyIds: jsonb("company_ids").notNull(), // array of report IDs
  reportType: varchar("report_type", { length: 50 }).notNull().default("overview"), // overview, financial, competitive, full
  format: varchar("format", { length: 10 }).notNull().default("pdf"), // pdf, docx, xlsx, md, json
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, generating, ready, expired, failed, cancelled
  progress: integer("progress").default(0).notNull(), // 0-100
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  downloadUrl: text("download_url"),
  expiresAt: timestamp("expires_at"),
  manifest: jsonb("manifest"), // export manifest JSON
  completedCompanies: jsonb("completed_companies").default([]).notNull(),
  failedCompanies: jsonb("failed_companies").default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBulkExportSchema = createInsertSchema(bulkExports).omit({
  id: true,
  createdAt: true,
});
export type InsertBulkExport = z.infer<typeof insertBulkExportSchema>;
export type BulkExport = typeof bulkExports.$inferSelect;

export const batchResearchJobs = pgTable("batch_research_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, processing, completed, failed, paused, cancelled
  
  // Configuration
  config: jsonb("config").notNull().default({}), // batchSize, researchDepth, skipExisting, etc.
  
  // Queue management (all are arrays of objects)
  pendingQueue: jsonb("pending_queue").notNull().default([]), // [{name, group, priority}]
  activeQueue: jsonb("active_queue").notNull().default([]), // companies currently being researched
  completedQueue: jsonb("completed_queue").notNull().default([]), // [{name, reportId, duration}]
  failedQueue: jsonb("failed_queue").notNull().default([]), // [{name, attempts, error, willRetry}]
  retryQueue: jsonb("retry_queue").notNull().default([]), // [{name, attempts, nextRetryAt}]
  
  // Progress metrics
  totalCompanies: integer("total_companies").notNull().default(0),
  progress: integer("progress").notNull().default(0), // 0-100
  averageTimePerCompany: integer("average_time_per_company"), // seconds
  
  // Duplicate detection results
  duplicatesRemoved: jsonb("duplicates_removed").default([]), // companies removed as duplicates
  existingReports: jsonb("existing_reports").default([]), // companies with existing reports
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertBatchResearchJobSchema = createInsertSchema(batchResearchJobs).omit({
  id: true,
  createdAt: true,
});
export type InsertBatchResearchJob = z.infer<typeof insertBatchResearchJobSchema>;
export type BatchResearchJob = typeof batchResearchJobs.$inferSelect;

// ============================================
// INTERACTIVE EDITING: User sessions and edits
// Anonymous browser-based sessions (no auth required)
// ============================================
export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull(),
  browserToken: text("browser_token").notNull(),  // localStorage UUID, no auth required
  sessionName: text("session_name").default("Default Session"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;

export const userEdits = pgTable("user_edits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  reportId: varchar("report_id").notNull(),
  stepNumber: integer("step_number").notNull(),
  useCaseId: text("use_case_id"),       // e.g. "UC-01"
  fieldPath: text("field_path").notNull(), // e.g. "Annual Hours" or "Organizational Capacity"
  originalValue: text("original_value").notNull(),
  editedValue: text("edited_value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserEditSchema = createInsertSchema(userEdits).omit({
  id: true,
  createdAt: true,
});
export type InsertUserEdit = z.infer<typeof insertUserEditSchema>;
export type UserEdit = typeof userEdits.$inferSelect;

// Audit trail for admin endpoints. One row per admin action attempt — both
// successful runs (e.g. POST /api/admin/backfill-reports finishing) and
// failed authn/authz attempts (wrong ADMIN_PASSWORD on /api/auth/admin-login,
// 403s from requireAdmin). Lets operators investigate "who overwrote report
// X yesterday at 3pm?" once more than one person knows the admin password.
export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // The action being audited. Stable string identifier so we can group rows
  // by operation type. Examples:
  //   "backfill-reports"          — POST /api/admin/backfill-reports succeeded
  //   "admin-login"               — POST /api/auth/admin-login succeeded
  //   "admin-login-failed"        — wrong ADMIN_PASSWORD
  //   "admin-access-denied"       — requireAdmin returned 403
  action: text("action").notNull(),
  // "success" or "failure". Mirrored on a dedicated column (vs. inferred from
  // statusCode) so the UI doesn't have to hardcode HTTP semantics.
  status: text("status").notNull(),
  // HTTP status code returned to the client (200, 401, 403, 500, …).
  statusCode: integer("status_code"),
  // Best-effort source IP from req.ip (Express resolves X-Forwarded-For when
  // trust proxy is on, which it is in setupAuth).
  actorIp: text("actor_ip"),
  // User-agent string of the operator's browser, helpful to disambiguate
  // simultaneous sessions from the same NAT'd IP.
  actorUserAgent: text("actor_user_agent"),
  // Path that was being accessed (e.g. "/api/admin/backfill-reports").
  // Stored for context — we don't strictly need it when `action` already
  // identifies the operation, but it lets us audit any future /api/admin/*
  // endpoint without changing the schema.
  path: text("path"),
  // Request parameters worth recording (query string flags like force=1,
  // body fields like onlyIds count). Free-form JSON to stay forward-compatible.
  params: jsonb("params"),
  // Outcome counters for successful destructive runs:
  //   { total, updated, skipped, failed, durationMs }
  // Null for auth failures / denial events.
  outcome: jsonb("outcome"),
  // Short error string when status === "failure" (e.g. "Invalid admin
  // password"). Not used to surface stack traces — keep it operator-readable.
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;

// Persisted snapshot of the most recent completed admin backfill run. The
// Admin page hydrates from this on load so an operator who refreshes the
// browser (or comes back the next day) still sees the post-run summary,
// failures table, and "Retry these" button without having to re-run the
// upgrade just to surface what already finished.
//
// Singleton table — only ever holds one row, keyed by `id="singleton"`. A
// new completed run upserts and replaces the row so admins always see the
// latest state. We keep this separate from `admin_audit_log` (which only
// records counts in `outcome`) because rebuilding the failures table needs
// the full per-report records (id, error string, etc.) that audit rows
// intentionally don't carry.
//
// The `summary` and `updatedReports` JSONB columns mirror the shapes
// declared by `PersistedBackfillSummary` and `BackfillReportResult` in
// `server/report-backfill.ts`. We can't `.$type<>()`-tag them with those
// server-side types from `shared/` (would invert the dependency
// direction), so storage uses an explicit typed cast on read instead —
// the schema-level shapes below document the contract for that cast.
export const adminLastBackfill = pgTable("admin_last_backfill", {
  id: text("id").primaryKey(),
  // PersistedBackfillSummary-shaped payload: success, force, total,
  // updated, skipped, failed, durationMs, plus the failures array.
  summary: jsonb("summary").notNull(),
  // The list of "updated" BackfillReportResult records from the run.
  // Used by the UpgradesAppliedPanel on /admin to group reports by which
  // upgrade was applied and surface headline-number movements. Stored
  // separately so the grouping panel can rehydrate without us having to
  // round-trip every skipped report through the wire.
  updatedReports: jsonb("updated_reports").notNull(),
  // Wall-clock time the run finished — surfaced in the UI so the operator
  // can see "this is the run from yesterday at 3pm" and not confuse it
  // with a fresh result.
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const insertAdminLastBackfillSchema = createInsertSchema(adminLastBackfill).omit({
  completedAt: true,
});
export type InsertAdminLastBackfill = z.infer<typeof insertAdminLastBackfillSchema>;
export type AdminLastBackfillRow = typeof adminLastBackfill.$inferSelect;

// Singleton row of operator-tunable admin settings. Today this only
// carries `auditRetentionDays`, the override for how long admin audit
// rows are retained before the daily sweeper deletes them. We keep it
// as a generic "settings" table (rather than `admin_audit_settings`)
// so future small admin toggles can land here without a fresh table /
// migration each time.
//
// The retention value is intentionally nullable: `null` means "no
// override stored — fall back to the ADMIN_AUDIT_RETENTION_DAYS env
// var, then the hard-coded default". That layered fallback is what
// lets the env var keep working for ops who already rely on it (the
// task explicitly calls this out under "Done looks like").
//
// Singleton: keyed by `id="singleton"`. Writes go through
// `storage.updateAdminSettings`, which upserts on that key so we can't
// accidentally end up with two competing rows.
export const adminSettings = pgTable("admin_settings", {
  id: text("id").primaryKey(),
  // Positive integer (days). Null = use env / default.
  auditRetentionDays: integer("audit_retention_days"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({
  updatedAt: true,
});
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettingsRow = typeof adminSettings.$inferSelect;

// Validation for the PUT /api/admin/settings payload. We accept a
// finite positive integer only — zero would silently disable
// retention (the cutoff would be "right now"), and negatives /
// non-numbers don't have any sensible interpretation. The upper cap
// (10 years) keeps a typo from accidentally locking in a retention
// window that never sweeps anything in practice.
//
// `null` is allowed as a way to clear the override and fall back to
// the env var / hard-coded default. The route layer lifts this schema
// directly so the JSON error message stays consistent between the
// client and any future API consumer.
export const adminSettingsUpdateSchema = z.object({
  auditRetentionDays: z
    .union([
      z
        .number()
        .int("Must be a whole number of days.")
        .positive("Must be at least 1 day.")
        .max(3650, "Must be 3650 days (10 years) or fewer."),
      z.null(),
    ])
    .optional(),
});
export type AdminSettingsUpdate = z.infer<typeof adminSettingsUpdateSchema>;

// Singleton record of the most recent admin_audit_log retention sweep
// (success or failure). Surfaced in the Admin "Recent admin activity"
// panel so operators can confirm the sweeper is running.
export const adminLastAuditCleanup = pgTable("admin_last_audit_cleanup", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  removedCount: integer("removed_count").notNull().default(0),
  retentionDays: integer("retention_days").notNull(),
  cutoff: timestamp("cutoff").notNull(),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  ranAt: timestamp("ran_at").defaultNow().notNull(),
});

export const insertAdminLastAuditCleanupSchema = createInsertSchema(
  adminLastAuditCleanup,
).omit({
  ranAt: true,
});
export type InsertAdminLastAuditCleanup = z.infer<
  typeof insertAdminLastAuditCleanupSchema
>;
export type AdminLastAuditCleanupRow =
  typeof adminLastAuditCleanup.$inferSelect;

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
    { fieldName: "weight_effort", displayName: "Priority Weight: Readiness", defaultValue: "30", valueType: "percentage", unit: "%", description: "Implementation effort weight in priority scoring", usedInSteps: ["7"] },
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
  netBenefit: {
    label: "Net Benefit (Default)",
    expression: "totalAnnualImpact - implementationCost / 3",
    inputFields: ["totalAnnualImpact", "implementationCost"],
    description: "Net annual benefit after costs (3-year amortization)"
  }
};

// ============================================================================
// WORKFLOW DATA TYPES - Miro-Ready Process Flow Generation
// ============================================================================

// Consolidated Agentic Patterns (12 patterns: 7 single-agent, 5 multi-agent)
export const AGENTIC_PATTERNS = [
  // Single-Agent Patterns
  "Reflection",
  "Tool Use",
  "Planning",
  "ReAct Loop",
  "Prompt Chaining",
  "Semantic Router",
  "Constitutional Guardrail",
  // Multi-Agent Patterns
  "Orchestrator-Workers",
  "Agent Handoff",
  "Parallelization",
  "Generator-Critic",
  "Group Chat",
] as const;

export type AgenticPattern = typeof AGENTIC_PATTERNS[number];

export type AgenticPatternType = "single-agent" | "multi-agent";
export type PatternComplexity = "low" | "medium" | "high";

// Legacy pattern name mapping (for backward compatibility with existing analyses)
export const LEGACY_PATTERN_MAP: Record<string, AgenticPattern> = {
  "Drafter-Critic": "Generator-Critic",
  "RAG Detective": "Tool Use",
  "Memetic Agent": "Reflection",
  "Human-in-the-Loop": "Constitutional Guardrail",
};

// Resolve a pattern name (handles legacy names)
export function resolvePatternName(name: string): AgenticPattern {
  if (!name) return "Prompt Chaining";
  const trimmed = name.trim();
  if (AGENTIC_PATTERNS.includes(trimmed as AgenticPattern)) return trimmed as AgenticPattern;
  return LEGACY_PATTERN_MAP[trimmed] || "Prompt Chaining";
}

// Agentic Pattern descriptions for UI
export const AGENTIC_PATTERN_META: Record<AgenticPattern, {
  description: string;
  icon: string;
  type: AgenticPatternType;
  complexity: PatternComplexity;
  useCaseExamples: string[];
}> = {
  "Reflection": {
    description: "Self-critique loops where AI evaluates and refines its own outputs iteratively",
    icon: "🪞",
    type: "single-agent",
    complexity: "low",
    useCaseExamples: ["Content quality review", "Code generation & testing", "Fact-checking"]
  },
  "Tool Use": {
    description: "LLM invokes external tools, APIs, and databases during reasoning",
    icon: "🔧",
    type: "single-agent",
    complexity: "medium",
    useCaseExamples: ["Research assistants", "Data lookup & enrichment", "Knowledge search"]
  },
  "Planning": {
    description: "Explicitly breaks complex goals into ordered sub-tasks before execution",
    icon: "📋",
    type: "single-agent",
    complexity: "medium",
    useCaseExamples: ["Project planning", "Multi-step analysis", "Strategic initiatives"]
  },
  "ReAct Loop": {
    description: "Autonomous troubleshooting with reasoning and action cycles",
    icon: "🔄",
    type: "single-agent",
    complexity: "medium",
    useCaseExamples: ["Technical diagnostics", "Root cause analysis", "Self-healing systems"]
  },
  "Prompt Chaining": {
    description: "Sequential pipeline of prompts where each step feeds the next",
    icon: "🔗",
    type: "single-agent",
    complexity: "low",
    useCaseExamples: ["Document processing pipelines", "Multi-stage extraction", "Report generation"]
  },
  "Semantic Router": {
    description: "Classification and intelligent routing decisions",
    icon: "🔀",
    type: "single-agent",
    complexity: "low",
    useCaseExamples: ["Support ticket triage", "Lead qualification", "Intent classification"]
  },
  "Constitutional Guardrail": {
    description: "Compliance-sensitive outputs with built-in constraints",
    icon: "🛡️",
    type: "single-agent",
    complexity: "medium",
    useCaseExamples: ["Regulatory compliance", "Policy enforcement", "Risk assessment"]
  },
  "Orchestrator-Workers": {
    description: "Multi-step complex tasks with coordinated sub-agents",
    icon: "🎭",
    type: "multi-agent",
    complexity: "high",
    useCaseExamples: ["Multi-department analysis", "Complex document processing", "End-to-end workflows"]
  },
  "Agent Handoff": {
    description: "Decentralized delegation between specialist agents",
    icon: "🤝",
    type: "multi-agent",
    complexity: "high",
    useCaseExamples: ["Customer service escalation", "Specialist routing", "Cross-domain tasks"]
  },
  "Parallelization": {
    description: "Concurrent independent sub-tasks with final synthesis",
    icon: "⚡",
    type: "multi-agent",
    complexity: "medium",
    useCaseExamples: ["Parallel data processing", "Multi-source analysis", "Batch operations"]
  },
  "Generator-Critic": {
    description: "Content generation with iterative review and refinement by a separate critic",
    icon: "✍️",
    type: "multi-agent",
    complexity: "medium",
    useCaseExamples: ["Report generation", "Email drafting", "Content creation"]
  },
  "Group Chat": {
    description: "Multi-agent deliberation and debate for complex decisions",
    icon: "💬",
    type: "multi-agent",
    complexity: "high",
    useCaseExamples: ["Multi-perspective analysis", "Consensus building", "Complex evaluations"]
  },
};

// Workflow step actor
export interface WorkflowActor {
  type: "human" | "system" | "ai_agent";
  name: string;
  role: string;
}

// Duration specification
export interface WorkflowDuration {
  value: number;
  unit: "seconds" | "minutes" | "hours" | "days";
  variability: "per item" | "per batch" | "per day" | "fixed";
}

// Base workflow step (current state)
export interface WorkflowStep {
  stepNumber: number;
  stepId: string;
  stepName: string;
  description: string;
  actor: WorkflowActor;
  duration: WorkflowDuration;
  systems: string[];
  dataSources: string[];
  isBottleneck: boolean;
  isFrictionPoint: boolean;
  isDecisionPoint: boolean;
  painPoints: string[];
  connectedTo: string[];
}

// Target state workflow step (extends base with AI properties)
export interface TargetWorkflowStep extends WorkflowStep {
  isAIEnabled: boolean;
  isHumanInTheLoop: boolean;
  aiCapabilities: string[];
  agentType: AgenticPattern | null;
  model: string | null;
  automationLevel: "full" | "assisted" | "supervised" | "manual";
}

// Comparison metrics for before/after
export interface ComparisonMetric {
  before: string;
  after: string;
  improvement: string;
  unit?: string;
}

export interface WorkflowComparisonMetrics {
  timeReduction: ComparisonMetric;
  costReduction?: ComparisonMetric;
  qualityImprovement?: ComparisonMetric;
  throughputIncrease?: ComparisonMetric;
  errorReduction?: ComparisonMetric;
  customerSatisfaction?: ComparisonMetric;
}

// Miro visualization metadata
export interface MiroMetadata {
  colorScheme: {
    bottleneckHighlight: string;
    frictionPointHighlight: string;
    aiEnabledHighlight: string;
    humanCheckpointHighlight: string;
    decisionPointHighlight: string;
    normalStep: string;
  };
  iconMapping: {
    human: string;
    system: string;
    ai_agent: string;
    bottleneck: string;
    friction: string;
    decision: string;
    hitl: string;
  };
  layoutSettings: {
    stepWidth: number;
    stepHeight: number;
    horizontalGap: number;
    verticalGap: number;
  };
}

// AI Primitives for pattern classification (standardized labels from taxonomy.ts)
export type AIPrimitive =
  | "Research & Information Retrieval"
  | "Content Creation"
  | "Data Analysis"
  | "Conversational Interfaces"
  | "Workflow Automation"
  | "Coding Assistance"
  // Legacy lowercase values for backward compatibility
  | "classification"
  | "generation"
  | "retrieval"
  | "extraction"
  | "summarization"
  | "translation"
  | "reasoning"
  | "validation"
  | "prediction"
  | "routing"
  | "orchestration"
  | "monitoring";

// Business functions for pattern mapping (standardized labels from taxonomy.ts)
export type BusinessFunction =
  | "Sales"
  | "Marketing"
  | "Finance"
  | "Operations"
  | "Human Resources"
  | "Information Technology"
  | "Customer Service"
  | "Legal & Compliance"
  | "Supply Chain"
  | "Product Management"
  | "Digital Commerce"
  | "Merchandising"
  | "Logistics"
  // Legacy values for backward compatibility
  | "HR"
  | "IT"
  | "Legal"
  | "Compliance"
  | "R&D"
  | "Executive"
  | "General";

// Benchmark data structure for KPIs (Step 2)
export interface BenchmarkData {
  industryAverage: string;
  industryBestInClass: string;
  overallBestInClass: string;
}

// Strategic theme linkage
export interface StrategicThemeLink {
  themeNumber: number;
  themeName: string;
  financialImpact: number;
}

// Pattern mapping result with primary, secondary, and HITL
export interface AgenticPatternMapping {
  primaryPattern: AgenticPattern;
  primaryRationale: string;
  secondaryPattern: AgenticPattern | null;
  secondaryRationale: string | null;
  hitlPattern: "Human-in-the-Loop";
  hitlRationale: string;
  detectedPrimitives: AIPrimitive[];
  detectedFunction: BusinessFunction;
  confidenceScore: number;
}

// Complete workflow data for a single use case
export interface UseCaseWorkflowData {
  useCaseId: string;
  useCaseName: string;
  businessFunction: string;
  agenticPattern: AgenticPattern;
  patternRationale: string;
  patternMapping?: AgenticPatternMapping;
  currentStateWorkflow: WorkflowStep[];
  targetStateWorkflow: TargetWorkflowStep[];
  comparisonMetrics: WorkflowComparisonMetrics;
  implementationNotes: string[];
  humanCheckpoints: string[];
}

// Export options configuration
export interface WorkflowExportOptions {
  format: "standard" | "enhanced" | "csv";
  detailLevel: "summary" | "standard" | "detailed";
  includeAgenticPatterns: boolean;
  includeAssumptions: boolean;
  includeMiroMetadata: boolean;
}

// Complete workflow export data
export interface WorkflowExportData {
  reportId: string;
  companyName: string;
  generatedAt: string;
  exportOptions: WorkflowExportOptions;
  workflowData: UseCaseWorkflowData[];
  masterAssumptions?: Record<string, any>;
  agenticPatternLibrary: typeof AGENTIC_PATTERN_META;
  miroMetadata: MiroMetadata;
}

// Workflow Validation Types
export interface WorkflowValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  stepId?: string;
  field?: string;
  suggestion?: string;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  currentStateValid: boolean;
  targetStateValid: boolean;
  totalIssues: number;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
  infos: WorkflowValidationIssue[];
  metrics: {
    currentStepCount: number;
    targetStepCount: number;
    bottleneckCount: number;
    frictionPointCount: number;
    hitlCheckpointCount: number;
    aiEnabledStepCount: number;
    orphanedStepCount: number;
    durationOutlierCount: number;
  };
}

// Validation configuration
export interface WorkflowValidationConfig {
  minCurrentSteps: number;
  minTargetSteps: number;
  requireBottleneck: boolean;
  requireHITL: boolean;
  maxDurationMinutes: number;
  minDurationSeconds: number;
}

export const DEFAULT_VALIDATION_CONFIG: WorkflowValidationConfig = {
  minCurrentSteps: 6,
  minTargetSteps: 8,
  requireBottleneck: true,
  requireHITL: true,
  maxDurationMinutes: 480, // 8 hours max per step
  minDurationSeconds: 1,   // 1 second min per step
};

// Default Miro metadata
export const DEFAULT_MIRO_METADATA: MiroMetadata = {
  colorScheme: {
    bottleneckHighlight: "#FFCDD2",      // Red - bottlenecks
    frictionPointHighlight: "#FFE0B2",   // Orange - friction
    aiEnabledHighlight: "#C8E6C9",       // Green - AI enabled
    humanCheckpointHighlight: "#FFF9C4", // Yellow - human review
    decisionPointHighlight: "#E1BEE7",   // Purple - decisions
    normalStep: "#E3F2FD"                // Light blue - normal
  },
  iconMapping: {
    human: "👤",
    system: "💻",
    ai_agent: "🤖",
    bottleneck: "🔴",
    friction: "🟠",
    decision: "🔷",
    hitl: "✋"
  },
  layoutSettings: {
    stepWidth: 200,
    stepHeight: 120,
    horizontalGap: 50,
    verticalGap: 80
  }
};
