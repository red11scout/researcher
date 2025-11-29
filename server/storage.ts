import { db } from "@db";
import { 
  reports, 
  assumptionSets,
  assumptionFields,
  type Report, 
  type InsertReport,
  type AssumptionSet,
  type InsertAssumptionSet,
  type AssumptionField,
  type InsertAssumptionField,
  DEFAULT_ASSUMPTIONS,
  ASSUMPTION_CATEGORIES,
  type AssumptionCategory
} from "@shared/schema";
import { eq, desc, and, like, sql } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
