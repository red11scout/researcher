import { db } from "@db";
import { reports, type Report, type InsertReport } from "@shared/schema";
import { eq, desc, and, like, sql } from "drizzle-orm";

export interface IStorage {
  createReport(report: InsertReport): Promise<Report>;
  getReportByCompany(companyName: string): Promise<Report | undefined>;
  updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined>;
  deleteReport(id: string): Promise<void>;
  getAllReports(): Promise<Report[]>;
  getWhatIfReports(parentReportId: string): Promise<Report[]>;
  getNextWhatIfVersion(parentReportId: string): Promise<number>;
  createWhatIfReport(parentReportId: string, analysisData: any): Promise<Report>;
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
}

export const storage = new DatabaseStorage();
