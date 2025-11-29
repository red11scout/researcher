import { db } from "@db";
import { 
  reports, 
  assumptionSets,
  assumptionFields,
  formulaConfigs,
  type Report, 
  type InsertReport,
  type AssumptionSet,
  type InsertAssumptionSet,
  type AssumptionField,
  type InsertAssumptionField,
  type FormulaConfig,
  type InsertFormulaConfig,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_FORMULAS,
  ASSUMPTION_CATEGORIES,
  type AssumptionCategory,
  type CalculatedFieldKey
} from "@shared/schema";
import { eq, desc, and, like, sql, isNull } from "drizzle-orm";

export interface IStorage {
  // Report operations
  createReport(report: InsertReport): Promise<Report>;
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
}

export class DatabaseStorage implements IStorage {
  async createReport(report: InsertReport): Promise<Report> {
    const [newReport] = await db
      .insert(reports)
      .values(report)
      .returning();
    return newReport;
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

    const [newConfig] = await db
      .insert(formulaConfigs)
      .values({
        ...config,
        version: nextVersion,
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
}

export const storage = new DatabaseStorage();
