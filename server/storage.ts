import { db } from "@db";
import { 
  reports, 
  assumptionSets,
  assumptionFields,
  formulaConfigs,
  sharedDashboards,
  bulkUpdateJobs,
  bulkExports,
  batchResearchJobs,
  type Report, 
  type InsertReport,
  type AssumptionSet,
  type InsertAssumptionSet,
  type AssumptionField,
  type InsertAssumptionField,
  type FormulaConfig,
  type InsertFormulaConfig,
  type SharedDashboard,
  type InsertSharedDashboard,
  type BulkUpdateJob,
  type InsertBulkUpdateJob,
  type BulkExport,
  type InsertBulkExport,
  type BatchResearchJob,
  type InsertBatchResearchJob,
  userSessions,
  userEdits,
  type UserSession,
  type InsertUserSession,
  type UserEdit,
  type InsertUserEdit,
  adminAuditLog,
  type AdminAuditLogEntry,
  type InsertAdminAuditLog,
  adminLastBackfill,
  type AdminLastBackfillRow,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_FORMULAS,
  ASSUMPTION_CATEGORIES,
  type AssumptionCategory,
  type CalculatedFieldKey
} from "@shared/schema";
import { eq, desc, and, like, sql, isNull, lt, gte, lte, ilike } from "drizzle-orm";
import type {
  BackfillReportResult,
  PersistedBackfillSummary,
} from "./report-backfill";

// Filter + pagination options for reading the admin audit log.
//
// All fields are optional. The caller supplies whichever subset of filters
// the operator picked in the UI; unspecified fields are not constrained.
// `limit`/`offset` paginate the result. `ip` is matched as a case-insensitive
// substring so an operator can search "10.0." without typing the full v4.
export interface AdminAuditLogQuery {
  limit?: number;
  offset?: number;
  // Exact action match (e.g. "backfill-reports", "admin-login-failed"). The
  // set of valid values mirrors the action codes recorded server-side.
  action?: string;
  // "success" or "failure". Anything else is ignored.
  status?: string;
  // Inclusive lower bound on createdAt.
  since?: Date;
  // Inclusive upper bound on createdAt.
  until?: Date;
  // Substring match against actorIp, case-insensitive.
  ip?: string;
}

export interface IStorage {
  // Report operations
  createReport(report: InsertReport): Promise<Report>;
  getReportById(id: string): Promise<Report | undefined>;
  getReportByCompany(companyName: string): Promise<Report | undefined>;
  updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined>;
  deleteReport(id: string): Promise<void>;
  getAllReports(): Promise<Report[]>;
  getWhatIfReports(parentReportId: string): Promise<Report[]>;
  getNextWhatIfVersion(parentReportId: string): Promise<number>;
  createWhatIfReport(parentReportId: string, analysisData: any): Promise<Report>;
  
  // Assumption Set operations
  createAssumptionSet(set: InsertAssumptionSet): Promise<AssumptionSet>;
  getAssumptionSetsByReport(reportId: string): Promise<AssumptionSet[]>;
  getActiveAssumptionSet(reportId: string): Promise<AssumptionSet | undefined>;
  updateAssumptionSet(id: string, data: Partial<InsertAssumptionSet>): Promise<AssumptionSet | undefined>;
  deleteAssumptionSet(id: string): Promise<void>;
  setActiveAssumptionSet(reportId: string, setId: string): Promise<void>;
  duplicateAssumptionSet(setId: string, newName: string): Promise<AssumptionSet>;
  
  // Assumption Field operations
  createAssumptionField(field: InsertAssumptionField): Promise<AssumptionField>;
  getAssumptionFieldsBySet(setId: string): Promise<AssumptionField[]>;
  getAssumptionFieldsByCategory(setId: string, category: string): Promise<AssumptionField[]>;
  updateAssumptionField(id: string, data: Partial<InsertAssumptionField>): Promise<AssumptionField | undefined>;
  deleteAssumptionField(id: string): Promise<void>;
  initializeDefaultAssumptions(setId: string, companyName?: string): Promise<AssumptionField[]>;
  
  // Formula Config operations
  createFormulaConfig(config: InsertFormulaConfig): Promise<FormulaConfig>;
  getFormulaConfigs(reportId: string | null, fieldKey: string, useCaseId?: string | null): Promise<FormulaConfig[]>;
  getActiveFormula(reportId: string | null, fieldKey: string, useCaseId?: string | null): Promise<FormulaConfig | undefined>;
  activateFormula(id: string): Promise<FormulaConfig | undefined>;
  getFormulaById(id: string): Promise<FormulaConfig | undefined>;
  initializeDefaultFormulas(reportId: string): Promise<FormulaConfig[]>;
  
  // Shared Dashboard operations
  createSharedDashboard(dashboard: InsertSharedDashboard): Promise<SharedDashboard>;
  getSharedDashboard(id: string): Promise<SharedDashboard | undefined>;
  incrementSharedDashboardViewCount(id: string): Promise<void>;
  cleanupExpiredSharedDashboards(): Promise<number>;
  
  // Bulk Update Job operations
  createBulkUpdateJob(job: InsertBulkUpdateJob): Promise<BulkUpdateJob>;
  getBulkUpdateJob(id: string): Promise<BulkUpdateJob | undefined>;
  updateBulkUpdateJob(id: string, data: Partial<InsertBulkUpdateJob>): Promise<BulkUpdateJob | undefined>;
  getActiveBulkUpdateJobs(): Promise<BulkUpdateJob[]>;
  getBulkUpdateHistory(limit?: number): Promise<BulkUpdateJob[]>;
  
  // Bulk Export operations
  createBulkExport(job: InsertBulkExport): Promise<BulkExport>;
  getBulkExport(id: string): Promise<BulkExport | undefined>;
  updateBulkExport(id: string, data: Partial<InsertBulkExport>): Promise<BulkExport | undefined>;
  getActiveBulkExports(): Promise<BulkExport[]>;
  getBulkExportHistory(limit?: number): Promise<BulkExport[]>;
  cleanupExpiredBulkExports(): Promise<number>;
  
  // Batch Research Job operations
  createBatchResearchJob(job: InsertBatchResearchJob): Promise<BatchResearchJob>;
  getBatchResearchJob(id: string): Promise<BatchResearchJob | undefined>;
  updateBatchResearchJob(id: string, data: Partial<InsertBatchResearchJob>): Promise<BatchResearchJob | undefined>;
  getActiveBatchResearchJobs(): Promise<BatchResearchJob[]>;
  getBatchResearchJobHistory(limit?: number): Promise<BatchResearchJob[]>;

  // Interactive Editing: Session and Edit operations
  getOrCreateSession(reportId: string, browserToken: string, sessionName?: string): Promise<UserSession>;
  getSession(reportId: string, browserToken: string): Promise<UserSession | undefined>;
  getSessionEdits(sessionId: string): Promise<UserEdit[]>;
  saveEdit(edit: InsertUserEdit): Promise<UserEdit>;
  clearSessionEdits(sessionId: string): Promise<void>;

  // Admin audit log: append-only record of admin endpoint usage and access
  // attempts. createAdminAuditEntry never throws — failures are logged and
  // swallowed so audit-write problems can never break a real admin request.
  createAdminAuditEntry(entry: InsertAdminAuditLog): Promise<AdminAuditLogEntry | null>;
  // Read recent audit entries with optional filters and pagination. Returns
  // both the page of rows and the total matching count so the UI can render
  // "showing N of M" and disable pagination buttons at the boundaries.
  // All filters are optional; an empty options object yields the most recent
  // page (limit defaulting to 25, offset 0) which preserves the at-a-glance
  // panel behaviour.
  getRecentAdminAuditEntries(
    options?: AdminAuditLogQuery,
  ): Promise<{ entries: AdminAuditLogEntry[]; total: number }>;
  // Delete admin_audit_log rows older than the supplied cutoff date and
  // return how many rows were removed. Used by the retention scheduler so
  // the audit table doesn't grow unbounded — particularly important
  // because failed admin-login attempts also write rows, so a brute-force
  // bot could otherwise fill the table indefinitely. Callers pass the
  // already-computed cutoff (now - retentionDays) so the scheduler owns
  // the policy and storage stays a thin DB wrapper.
  pruneOldAdminAuditEntries(olderThan: Date): Promise<number>;

  // Persisted snapshot of the most recent completed admin backfill run, so
  // the Admin page can hydrate the post-run summary / failures table /
  // "Retry these" button on page load instead of losing them when the
  // operator refreshes. Singleton: a new run replaces the previous row.
  saveLastBackfillSummary(
    summary: PersistedBackfillSummary,
    updatedReports: BackfillReportResult[],
  ): Promise<void>;
  getLastBackfillSummary(): Promise<{
    summary: PersistedBackfillSummary;
    updatedReports: BackfillReportResult[];
    completedAt: Date;
  } | null>;
}

export class DatabaseStorage implements IStorage {
  async createReport(report: InsertReport): Promise<Report> {
    const [newReport] = await db
      .insert(reports)
      .values(report)
      .returning();
    return newReport;
  }

  async getReportById(id: string): Promise<Report | undefined> {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);
    return report;
  }

  async getReportByCompany(companyName: string): Promise<Report | undefined> {
    const [report] = await db
      .select()
      .from(reports)
      .where(and(
        eq(reports.companyName, companyName),
        eq(reports.isWhatIf, false)
      ))
      .orderBy(desc(reports.updatedAt))
      .limit(1);
    return report;
  }

  async updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined> {
    const [updatedReport] = await db
      .update(reports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return updatedReport;
  }

  async deleteReport(id: string): Promise<void> {
    await db
      .delete(reports)
      .where(eq(reports.id, id));
  }

  async getAllReports(): Promise<Report[]> {
    return await db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt));
  }

  async getWhatIfReports(parentReportId: string): Promise<Report[]> {
    return await db
      .select()
      .from(reports)
      .where(eq(reports.parentReportId, parentReportId))
      .orderBy(desc(reports.whatIfVersion));
  }

  async getNextWhatIfVersion(parentReportId: string): Promise<number> {
    const [result] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${reports.whatIfVersion}), 0)` })
      .from(reports)
      .where(eq(reports.parentReportId, parentReportId));
    return (result?.maxVersion || 0) + 1;
  }

  async createWhatIfReport(parentReportId: string, analysisData: any): Promise<Report> {
    const [parentReport] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, parentReportId))
      .limit(1);

    if (!parentReport) {
      throw new Error("Parent report not found");
    }

    const version = await this.getNextWhatIfVersion(parentReportId);
    const companyName = `${parentReport.companyName}_WhatIf_${version}`;

    const [newReport] = await db
      .insert(reports)
      .values({
        companyName,
        analysisData,
        isWhatIf: true,
        parentReportId,
        whatIfVersion: version,
      })
      .returning();

    return newReport;
  }

  // Assumption Set operations
  async createAssumptionSet(set: InsertAssumptionSet): Promise<AssumptionSet> {
    const [newSet] = await db
      .insert(assumptionSets)
      .values(set)
      .returning();
    return newSet;
  }

  async getAssumptionSetsByReport(reportId: string): Promise<AssumptionSet[]> {
    return await db
      .select()
      .from(assumptionSets)
      .where(eq(assumptionSets.reportId, reportId))
      .orderBy(desc(assumptionSets.createdAt));
  }

  async getActiveAssumptionSet(reportId: string): Promise<AssumptionSet | undefined> {
    const [activeSet] = await db
      .select()
      .from(assumptionSets)
      .where(and(
        eq(assumptionSets.reportId, reportId),
        eq(assumptionSets.isActive, true)
      ))
      .limit(1);
    return activeSet;
  }

  async updateAssumptionSet(id: string, data: Partial<InsertAssumptionSet>): Promise<AssumptionSet | undefined> {
    const [updated] = await db
      .update(assumptionSets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assumptionSets.id, id))
      .returning();
    return updated;
  }

  async deleteAssumptionSet(id: string): Promise<void> {
    // Delete all fields first
    await db.delete(assumptionFields).where(eq(assumptionFields.setId, id));
    // Then delete the set
    await db.delete(assumptionSets).where(eq(assumptionSets.id, id));
  }

  async setActiveAssumptionSet(reportId: string, setId: string): Promise<void> {
    // Deactivate all sets for this report
    await db
      .update(assumptionSets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(assumptionSets.reportId, reportId));
    
    // Activate the selected set
    await db
      .update(assumptionSets)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(assumptionSets.id, setId));
  }

  async duplicateAssumptionSet(setId: string, newName: string): Promise<AssumptionSet> {
    // Get the original set
    const [originalSet] = await db
      .select()
      .from(assumptionSets)
      .where(eq(assumptionSets.id, setId))
      .limit(1);

    if (!originalSet) {
      throw new Error("Assumption set not found");
    }

    // Create new set
    const [newSet] = await db
      .insert(assumptionSets)
      .values({
        reportId: originalSet.reportId,
        name: newName,
        description: `Duplicated from ${originalSet.name}`,
        isActive: false,
        isDefault: false,
      })
      .returning();

    // Copy all fields including new metadata
    const fields = await this.getAssumptionFieldsBySet(setId);
    for (const field of fields) {
      await db.insert(assumptionFields).values({
        setId: newSet.id,
        category: field.category,
        fieldName: field.fieldName,
        displayName: field.displayName,
        value: field.value,
        valueType: field.valueType,
        unit: field.unit,
        source: field.source,
        sourceUrl: field.sourceUrl,
        description: field.description,
        usedInSteps: field.usedInSteps,
        autoRefresh: field.autoRefresh,
        refreshFrequency: field.refreshFrequency,
        lastRefreshedAt: field.lastRefreshedAt,
        isLocked: field.isLocked,
        isCustom: field.isCustom,
        sortOrder: field.sortOrder,
      });
    }

    return newSet;
  }

  // Assumption Field operations
  async createAssumptionField(field: InsertAssumptionField): Promise<AssumptionField> {
    const [newField] = await db
      .insert(assumptionFields)
      .values(field)
      .returning();
    return newField;
  }

  async getAssumptionFieldsBySet(setId: string): Promise<AssumptionField[]> {
    return await db
      .select()
      .from(assumptionFields)
      .where(eq(assumptionFields.setId, setId))
      .orderBy(assumptionFields.category, assumptionFields.sortOrder);
  }

  async getAssumptionFieldsByCategory(setId: string, category: string): Promise<AssumptionField[]> {
    return await db
      .select()
      .from(assumptionFields)
      .where(and(
        eq(assumptionFields.setId, setId),
        eq(assumptionFields.category, category)
      ))
      .orderBy(assumptionFields.sortOrder);
  }

  async updateAssumptionField(id: string, data: Partial<InsertAssumptionField>): Promise<AssumptionField | undefined> {
    const [updated] = await db
      .update(assumptionFields)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assumptionFields.id, id))
      .returning();
    return updated;
  }

  async deleteAssumptionField(id: string): Promise<void> {
    await db.delete(assumptionFields).where(eq(assumptionFields.id, id));
  }

  async initializeDefaultAssumptions(setId: string, companyName?: string): Promise<AssumptionField[]> {
    const createdFields: AssumptionField[] = [];
    let sortOrder = 0;

    for (const category of ASSUMPTION_CATEGORIES) {
      const categoryDefaults = DEFAULT_ASSUMPTIONS[category];
      
      for (const template of categoryDefaults) {
        let value = template.defaultValue;
        
        // Pre-populate company name if provided
        if (template.fieldName === 'company_name' && companyName) {
          value = companyName;
        }

        const [field] = await db
          .insert(assumptionFields)
          .values({
            setId,
            category,
            fieldName: template.fieldName,
            displayName: template.displayName,
            value,
            valueType: template.valueType,
            unit: template.unit || null,
            source: template.autoRefresh ? "API - External" : "System Default",
            sourceUrl: template.sourceUrl || null,
            description: template.description,
            usedInSteps: template.usedInSteps || null,
            autoRefresh: template.autoRefresh || false,
            refreshFrequency: template.refreshFrequency || null,
            isLocked: false,
            isCustom: false,
            sortOrder: sortOrder++,
          })
          .returning();

        createdFields.push(field);
      }
    }

    return createdFields;
  }

  // Formula Config operations
  async createFormulaConfig(config: InsertFormulaConfig): Promise<FormulaConfig> {
    // Get the next version number for this field/useCase combo
    const existing = await db
      .select()
      .from(formulaConfigs)
      .where(and(
        config.reportId ? eq(formulaConfigs.reportId, config.reportId) : isNull(formulaConfigs.reportId),
        eq(formulaConfigs.fieldKey, config.fieldKey),
        config.useCaseId ? eq(formulaConfigs.useCaseId, config.useCaseId) : isNull(formulaConfigs.useCaseId)
      ))
      .orderBy(desc(formulaConfigs.version));

    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

    // If this will be active, deactivate others first
    if (config.isActive) {
      await db
        .update(formulaConfigs)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          config.reportId ? eq(formulaConfigs.reportId, config.reportId) : isNull(formulaConfigs.reportId),
          eq(formulaConfigs.fieldKey, config.fieldKey),
          config.useCaseId ? eq(formulaConfigs.useCaseId, config.useCaseId) : isNull(formulaConfigs.useCaseId)
        ));
    }

    const constants = Array.isArray(config.constants) ? config.constants : (config.constants ? Array.from(config.constants as any) : []);

    const [newConfig] = await db
      .insert(formulaConfigs)
      .values({
        reportId: config.reportId,
        useCaseId: config.useCaseId || null,
        fieldKey: config.fieldKey,
        label: config.label,
        expression: config.expression,
        inputFields: config.inputFields,
        constants: constants as any,
        isActive: config.isActive,
        version: nextVersion,
        notes: config.notes,
        createdBy: config.createdBy,
      })
      .returning();

    return newConfig;
  }

  async getFormulaConfigs(reportId: string | null, fieldKey: string, useCaseId?: string | null): Promise<FormulaConfig[]> {
    const conditions = [eq(formulaConfigs.fieldKey, fieldKey)];
    
    if (reportId) {
      conditions.push(eq(formulaConfigs.reportId, reportId));
    } else {
      conditions.push(isNull(formulaConfigs.reportId));
    }
    
    if (useCaseId !== undefined) {
      if (useCaseId) {
        conditions.push(eq(formulaConfigs.useCaseId, useCaseId));
      } else {
        conditions.push(isNull(formulaConfigs.useCaseId));
      }
    }

    return await db
      .select()
      .from(formulaConfigs)
      .where(and(...conditions))
      .orderBy(desc(formulaConfigs.version));
  }

  async getActiveFormula(reportId: string | null, fieldKey: string, useCaseId?: string | null): Promise<FormulaConfig | undefined> {
    // First try to find use-case specific active formula
    if (useCaseId) {
      const [specific] = await db
        .select()
        .from(formulaConfigs)
        .where(and(
          reportId ? eq(formulaConfigs.reportId, reportId) : isNull(formulaConfigs.reportId),
          eq(formulaConfigs.fieldKey, fieldKey),
          eq(formulaConfigs.useCaseId, useCaseId),
          eq(formulaConfigs.isActive, true)
        ))
        .limit(1);

      if (specific) return specific;
    }

    // Fall back to report-level formula (useCaseId = null)
    const [reportLevel] = await db
      .select()
      .from(formulaConfigs)
      .where(and(
        reportId ? eq(formulaConfigs.reportId, reportId) : isNull(formulaConfigs.reportId),
        eq(formulaConfigs.fieldKey, fieldKey),
        isNull(formulaConfigs.useCaseId),
        eq(formulaConfigs.isActive, true)
      ))
      .limit(1);

    if (reportLevel) return reportLevel;

    // Fall back to global default (reportId = null, useCaseId = null)
    if (reportId) {
      const [global] = await db
        .select()
        .from(formulaConfigs)
        .where(and(
          isNull(formulaConfigs.reportId),
          eq(formulaConfigs.fieldKey, fieldKey),
          isNull(formulaConfigs.useCaseId),
          eq(formulaConfigs.isActive, true)
        ))
        .limit(1);

      return global;
    }

    return undefined;
  }

  async activateFormula(id: string): Promise<FormulaConfig | undefined> {
    // Get the formula to activate
    const [formula] = await db
      .select()
      .from(formulaConfigs)
      .where(eq(formulaConfigs.id, id))
      .limit(1);

    if (!formula) return undefined;

    // Deactivate all other formulas for this field/useCase combo
    await db
      .update(formulaConfigs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        formula.reportId ? eq(formulaConfigs.reportId, formula.reportId) : isNull(formulaConfigs.reportId),
        eq(formulaConfigs.fieldKey, formula.fieldKey),
        formula.useCaseId ? eq(formulaConfigs.useCaseId, formula.useCaseId) : isNull(formulaConfigs.useCaseId)
      ));

    // Activate the selected formula
    const [activated] = await db
      .update(formulaConfigs)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(formulaConfigs.id, id))
      .returning();

    return activated;
  }

  async getFormulaById(id: string): Promise<FormulaConfig | undefined> {
    const [formula] = await db
      .select()
      .from(formulaConfigs)
      .where(eq(formulaConfigs.id, id))
      .limit(1);
    return formula;
  }

  async initializeDefaultFormulas(reportId: string): Promise<FormulaConfig[]> {
    const createdFormulas: FormulaConfig[] = [];
    const fieldKeys = Object.keys(DEFAULT_FORMULAS) as CalculatedFieldKey[];

    for (const fieldKey of fieldKeys) {
      const defaultFormula = DEFAULT_FORMULAS[fieldKey];
      
      // Check if formula already exists for this report
      const existing = await this.getFormulaConfigs(reportId, fieldKey, null);
      if (existing.length > 0) continue;

      const [formula] = await db
        .insert(formulaConfigs)
        .values({
          reportId,
          useCaseId: null,
          fieldKey,
          label: defaultFormula.label,
          expression: defaultFormula.expression,
          inputFields: defaultFormula.inputFields,
          constants: [],
          isActive: true,
          version: 1,
          notes: defaultFormula.description,
          createdBy: "system",
        })
        .returning();

      createdFormulas.push(formula);
    }

    return createdFormulas;
  }

  async createSharedDashboard(dashboard: InsertSharedDashboard): Promise<SharedDashboard> {
    const [newDashboard] = await db
      .insert(sharedDashboards)
      .values(dashboard)
      .returning();
    return newDashboard;
  }

  async getSharedDashboard(id: string): Promise<SharedDashboard | undefined> {
    const [dashboard] = await db
      .select()
      .from(sharedDashboards)
      .where(eq(sharedDashboards.id, id))
      .limit(1);
    return dashboard;
  }

  async incrementSharedDashboardViewCount(id: string): Promise<void> {
    await db
      .update(sharedDashboards)
      .set({ viewCount: sql`${sharedDashboards.viewCount} + 1` })
      .where(eq(sharedDashboards.id, id));
  }

  async cleanupExpiredSharedDashboards(): Promise<number> {
    const result = await db
      .delete(sharedDashboards)
      .where(lt(sharedDashboards.expiresAt, new Date()))
      .returning();
    return result.length;
  }

  // Bulk Update Job operations
  async createBulkUpdateJob(job: InsertBulkUpdateJob): Promise<BulkUpdateJob> {
    const [newJob] = await db
      .insert(bulkUpdateJobs)
      .values(job)
      .returning();
    return newJob;
  }

  async getBulkUpdateJob(id: string): Promise<BulkUpdateJob | undefined> {
    const [job] = await db
      .select()
      .from(bulkUpdateJobs)
      .where(eq(bulkUpdateJobs.id, id))
      .limit(1);
    return job;
  }

  async updateBulkUpdateJob(id: string, data: Partial<InsertBulkUpdateJob>): Promise<BulkUpdateJob | undefined> {
    const [updated] = await db
      .update(bulkUpdateJobs)
      .set(data)
      .where(eq(bulkUpdateJobs.id, id))
      .returning();
    return updated;
  }

  async getActiveBulkUpdateJobs(): Promise<BulkUpdateJob[]> {
    return await db
      .select()
      .from(bulkUpdateJobs)
      .where(
        sql`${bulkUpdateJobs.status} IN ('pending', 'in_progress')`
      )
      .orderBy(desc(bulkUpdateJobs.createdAt));
  }

  async getBulkUpdateHistory(limit: number = 50): Promise<BulkUpdateJob[]> {
    return await db
      .select()
      .from(bulkUpdateJobs)
      .orderBy(desc(bulkUpdateJobs.createdAt))
      .limit(limit);
  }

  // Bulk Export operations
  async createBulkExport(job: InsertBulkExport): Promise<BulkExport> {
    const [newJob] = await db
      .insert(bulkExports)
      .values(job)
      .returning();
    return newJob;
  }

  async getBulkExport(id: string): Promise<BulkExport | undefined> {
    const [job] = await db
      .select()
      .from(bulkExports)
      .where(eq(bulkExports.id, id))
      .limit(1);
    return job;
  }

  async updateBulkExport(id: string, data: Partial<InsertBulkExport>): Promise<BulkExport | undefined> {
    const [updated] = await db
      .update(bulkExports)
      .set(data)
      .where(eq(bulkExports.id, id))
      .returning();
    return updated;
  }

  async getActiveBulkExports(): Promise<BulkExport[]> {
    return await db
      .select()
      .from(bulkExports)
      .where(
        sql`${bulkExports.status} IN ('pending', 'generating')`
      )
      .orderBy(desc(bulkExports.createdAt));
  }

  async getBulkExportHistory(limit: number = 50): Promise<BulkExport[]> {
    return await db
      .select()
      .from(bulkExports)
      .orderBy(desc(bulkExports.createdAt))
      .limit(limit);
  }

  async cleanupExpiredBulkExports(): Promise<number> {
    const result = await db
      .delete(bulkExports)
      .where(
        and(
          lt(bulkExports.expiresAt, new Date()),
          sql`${bulkExports.expiresAt} IS NOT NULL`
        )
      )
      .returning();
    return result.length;
  }

  // Batch Research Job operations
  async createBatchResearchJob(job: InsertBatchResearchJob): Promise<BatchResearchJob> {
    const [newJob] = await db
      .insert(batchResearchJobs)
      .values(job)
      .returning();
    return newJob;
  }

  async getBatchResearchJob(id: string): Promise<BatchResearchJob | undefined> {
    const [job] = await db
      .select()
      .from(batchResearchJobs)
      .where(eq(batchResearchJobs.id, id))
      .limit(1);
    return job;
  }

  async updateBatchResearchJob(id: string, data: Partial<InsertBatchResearchJob>): Promise<BatchResearchJob | undefined> {
    const [updated] = await db
      .update(batchResearchJobs)
      .set(data)
      .where(eq(batchResearchJobs.id, id))
      .returning();
    return updated;
  }

  async getActiveBatchResearchJobs(): Promise<BatchResearchJob[]> {
    return await db
      .select()
      .from(batchResearchJobs)
      .where(
        sql`${batchResearchJobs.status} IN ('pending', 'processing')`
      )
      .orderBy(desc(batchResearchJobs.createdAt));
  }

  async getBatchResearchJobHistory(limit: number = 50): Promise<BatchResearchJob[]> {
    return await db
      .select()
      .from(batchResearchJobs)
      .orderBy(desc(batchResearchJobs.createdAt))
      .limit(limit);
  }

  // ============================================
  // Interactive Editing: Session and Edit operations
  // ============================================

  async getOrCreateSession(reportId: string, browserToken: string, sessionName?: string): Promise<UserSession> {
    // Check for existing session
    const existing = await db
      .select()
      .from(userSessions)
      .where(and(
        eq(userSessions.reportId, reportId),
        eq(userSessions.browserToken, browserToken),
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new session
    const [session] = await db
      .insert(userSessions)
      .values({
        reportId,
        browserToken,
        sessionName: sessionName || "Default Session",
      })
      .returning();

    return session;
  }

  async getSession(reportId: string, browserToken: string): Promise<UserSession | undefined> {
    const results = await db
      .select()
      .from(userSessions)
      .where(and(
        eq(userSessions.reportId, reportId),
        eq(userSessions.browserToken, browserToken),
      ))
      .limit(1);

    return results[0];
  }

  async getSessionEdits(sessionId: string): Promise<UserEdit[]> {
    return await db
      .select()
      .from(userEdits)
      .where(eq(userEdits.sessionId, sessionId))
      .orderBy(desc(userEdits.createdAt));
  }

  async saveEdit(edit: InsertUserEdit): Promise<UserEdit> {
    const [saved] = await db
      .insert(userEdits)
      .values(edit)
      .returning();

    // Update session updatedAt timestamp
    await db
      .update(userSessions)
      .set({ updatedAt: new Date() })
      .where(eq(userSessions.id, edit.sessionId));

    return saved;
  }

  async clearSessionEdits(sessionId: string): Promise<void> {
    await db
      .delete(userEdits)
      .where(eq(userEdits.sessionId, sessionId));
  }

  async createAdminAuditEntry(
    entry: InsertAdminAuditLog,
  ): Promise<AdminAuditLogEntry | null> {
    // Audit writes must never crash an admin request — if the DB write fails
    // we log to the server console (which is itself a passive audit trail)
    // and return null so callers can keep going.
    try {
      const [saved] = await db.insert(adminAuditLog).values(entry).returning();
      return saved ?? null;
    } catch (err) {
      console.error("[admin-audit] Failed to write audit entry:", err, entry);
      return null;
    }
  }

  async getRecentAdminAuditEntries(
    options: AdminAuditLogQuery = {},
  ): Promise<{ entries: AdminAuditLogEntry[]; total: number }> {
    // Clamp the limit so a malicious or careless caller can't ask for the
    // entire table in one shot. The default of 25 mirrors the original
    // single-arg behaviour so the at-a-glance panel stays unchanged when
    // the UI doesn't pass a limit.
    const safeLimit = Math.max(
      1,
      Math.min(200, Math.floor(options.limit ?? 25) || 25),
    );
    const safeOffset = Math.max(0, Math.floor(options.offset ?? 0) || 0);

    // Build the WHERE clause from whichever filters the caller supplied.
    // An unspecified filter must not constrain the query — that's how the
    // default "show me the most recent N" view stays cheap.
    const conditions = [] as ReturnType<typeof eq>[];
    if (options.action && options.action.trim().length > 0) {
      conditions.push(eq(adminAuditLog.action, options.action.trim()));
    }
    if (options.status === "success" || options.status === "failure") {
      conditions.push(eq(adminAuditLog.status, options.status));
    }
    if (options.since instanceof Date && !Number.isNaN(options.since.getTime())) {
      conditions.push(gte(adminAuditLog.createdAt, options.since));
    }
    if (options.until instanceof Date && !Number.isNaN(options.until.getTime())) {
      conditions.push(lte(adminAuditLog.createdAt, options.until));
    }
    if (options.ip && options.ip.trim().length > 0) {
      // Substring match — operators routinely know only the network prefix
      // ("10.0.", "192.168.", an IPv6 fragment), not the full address.
      conditions.push(ilike(adminAuditLog.actorIp, `%${options.ip.trim()}%`));
    }
    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

    // Run the page query and the COUNT(*) in parallel — both hit the same
    // filtered set, so paying for one round-trip each is fine.
    const pageQuery = db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminAuditLog);

    const [entries, countRows] = await Promise.all([
      whereClause ? pageQuery.where(whereClause) : pageQuery,
      whereClause ? countQuery.where(whereClause) : countQuery,
    ]);
    const total = Number(countRows[0]?.count ?? 0);
    return { entries, total };
  }

  async pruneOldAdminAuditEntries(olderThan: Date): Promise<number> {
    // Defensive: if the caller hands us a bad Date we'd otherwise generate
    // `WHERE created_at < 'Invalid Date'` and Postgres would reject it.
    // Returning 0 keeps the scheduler's "we ran but nothing to prune" path
    // working without surfacing a misconfiguration as a crash.
    if (!(olderThan instanceof Date) || Number.isNaN(olderThan.getTime())) {
      return 0;
    }
    // Use a CTE so Postgres returns only the aggregate count of deleted
    // rows instead of streaming every deleted row back to Node. The
    // first sweep after a long-running unbounded period could otherwise
    // delete tens of thousands of audit rows in one shot, and a
    // `RETURNING id` on that would create avoidable memory pressure.
    const rows = await db.execute(sql<{ count: number }>`
      WITH deleted AS (
        DELETE FROM ${adminAuditLog}
        WHERE ${adminAuditLog.createdAt} < ${olderThan}
        RETURNING 1
      )
      SELECT count(*)::int AS count FROM deleted
    `);
    // `db.execute` returns the driver's raw result. Neon's serverless
    // pg driver exposes the row list under `.rows`; fall back to
    // treating `rows` as iterable for any other driver shape.
    const first = (rows as { rows?: Array<{ count?: number }> }).rows?.[0]
      ?? (rows as unknown as Array<{ count?: number }>)[0];
    return Number(first?.count ?? 0);
  }

  async saveLastBackfillSummary(
    summary: PersistedBackfillSummary,
    updatedReports: BackfillReportResult[],
  ): Promise<void> {
    // Singleton row keyed by `id="singleton"`. Upsert so a new run replaces
    // the previous snapshot and the Admin page only ever hydrates the most
    // recent state, exactly mirroring the in-memory behaviour after a fresh
    // run finishes in the same browser tab.
    await db
      .insert(adminLastBackfill)
      .values({
        id: "singleton",
        summary,
        updatedReports,
      })
      .onConflictDoUpdate({
        target: adminLastBackfill.id,
        set: {
          summary,
          updatedReports,
          completedAt: new Date(),
        },
      });
  }

  async getLastBackfillSummary(): Promise<{
    summary: PersistedBackfillSummary;
    updatedReports: BackfillReportResult[];
    completedAt: Date;
  } | null> {
    const [row] = await db
      .select()
      .from(adminLastBackfill)
      .where(eq(adminLastBackfill.id, "singleton"))
      .limit(1);
    if (!row) return null;
    // The JSONB columns come back as `unknown` from Drizzle (the schema is
    // declared in shared/ where the server-side persisted types aren't
    // visible). We narrow at the persistence boundary here so callers get
    // typed data without sprinkling casts in every route handler. The cast
    // is safe because writes go through `saveLastBackfillSummary` above,
    // which is the only path that ever inserts into this table.
    return {
      summary: row.summary as PersistedBackfillSummary,
      updatedReports: row.updatedReports as BackfillReportResult[],
      completedAt: row.completedAt,
    };
  }
}

export const storage = new DatabaseStorage();
