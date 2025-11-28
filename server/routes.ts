import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateCompanyAnalysis } from "./ai-service";
import { insertReportSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Generate or retrieve analysis for a company
  app.post("/api/analyze", async (req, res) => {
    try {
      const { companyName } = req.body;
      
      if (!companyName || typeof companyName !== "string") {
        return res.status(400).json({ error: "Company name is required" });
      }

      // Check if we already have a report for this company
      const existingReport = await storage.getReportByCompany(companyName);
      
      if (existingReport) {
        return res.json({
          id: existingReport.id,
          companyName: existingReport.companyName,
          data: existingReport.analysisData,
          createdAt: existingReport.createdAt,
          updatedAt: existingReport.updatedAt,
          isNew: false,
        });
      }

      // Generate new analysis using AI
      const analysis = await generateCompanyAnalysis(companyName);
      
      // Save to database
      const report = await storage.createReport({
        companyName,
        analysisData: analysis,
      });

      return res.json({
        id: report.id,
        companyName: report.companyName,
        data: report.analysisData,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        isNew: true,
      });
      
    } catch (error) {
      console.error("Analysis error:", error);
      return res.status(500).json({ 
        error: "Failed to generate analysis",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Regenerate analysis for existing company
  app.post("/api/regenerate/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { companyName } = req.body;

      if (!companyName) {
        return res.status(400).json({ error: "Company name is required" });
      }

      // Generate fresh analysis
      const analysis = await generateCompanyAnalysis(companyName);
      
      // Update existing report
      const updatedReport = await storage.updateReport(id, {
        analysisData: analysis,
      });

      if (!updatedReport) {
        return res.status(404).json({ error: "Report not found" });
      }

      return res.json({
        id: updatedReport.id,
        companyName: updatedReport.companyName,
        data: updatedReport.analysisData,
        createdAt: updatedReport.createdAt,
        updatedAt: updatedReport.updatedAt,
      });
      
    } catch (error) {
      console.error("Regeneration error:", error);
      return res.status(500).json({ 
        error: "Failed to regenerate analysis",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all reports (for potential future features)
  app.get("/api/reports", async (req, res) => {
    try {
      const allReports = await storage.getAllReports();
      return res.json(allReports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      return res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  return httpServer;
}
