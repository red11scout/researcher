import { db } from "@db";
import { reports, type Report, type InsertReport } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createReport(report: InsertReport): Promise<Report>;
  getReportByCompany(companyName: string): Promise<Report | undefined>;
  updateReport(id: string, data: Partial<InsertReport>): Promise<Report | undefined>;
  getAllReports(): Promise<Report[]>;
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
      .where(eq(reports.companyName, companyName))
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

  async getAllReports(): Promise<Report[]> {
    return await db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt));
  }
}

export const storage = new DatabaseStorage();
