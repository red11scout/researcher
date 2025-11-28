import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateCompanyAnalysis } from "./ai-service";
import { insertReportSchema } from "@shared/schema";

// Store active SSE connections for progress updates
const progressConnections = new Map<string, any>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // SSE endpoint for progress updates
  app.get("/api/progress/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    progressConnections.set(sessionId, res);

    req.on('close', () => {
      progressConnections.delete(sessionId);
    });
  });

  // Helper to send progress updates
  const sendProgress = (sessionId: string, step: number, message: string, detail?: string) => {
    const connection = progressConnections.get(sessionId);
    if (connection) {
      const data = JSON.stringify({ step, message, detail, timestamp: Date.now() });
      connection.write(`data: ${data}\n\n`);
    }
  };

  // Generate or retrieve analysis for a company with progress updates
  app.post("/api/analyze", async (req, res) => {
    try {
      const { companyName, sessionId } = req.body;
      
      if (!companyName || typeof companyName !== "string") {
        return res.status(400).json({ error: "Company name is required" });
      }

      // Send initial progress
      if (sessionId) {
        sendProgress(sessionId, 0, "Starting analysis", `Analyzing ${companyName}...`);
      }

      // Check if we already have a report for this company
      const existingReport = await storage.getReportByCompany(companyName);
      
      if (existingReport) {
        if (sessionId) {
          sendProgress(sessionId, 100, "Complete", "Retrieved existing report");
        }
        return res.json({
          id: existingReport.id,
          companyName: existingReport.companyName,
          data: existingReport.analysisData,
          createdAt: existingReport.createdAt,
          updatedAt: existingReport.updatedAt,
          isNew: false,
        });
      }

      // Send progress updates during generation
      if (sessionId) {
        sendProgress(sessionId, 1, "Step 0: Company Overview", "Gathering company information...");
        
        setTimeout(() => sendProgress(sessionId, 2, "Step 1: Strategic Anchoring", "Identifying business drivers..."), 2000);
        setTimeout(() => sendProgress(sessionId, 3, "Step 2: Business Functions", "Analyzing departments and KPIs..."), 5000);
        setTimeout(() => sendProgress(sessionId, 4, "Step 3: Friction Points", "Identifying operational bottlenecks..."), 8000);
        setTimeout(() => sendProgress(sessionId, 5, "Step 4: AI Use Cases", "Generating AI opportunities with 6 primitives..."), 12000);
        setTimeout(() => sendProgress(sessionId, 6, "Step 5: Benefit Quantification", "Calculating ROI across 4 drivers..."), 16000);
        setTimeout(() => sendProgress(sessionId, 7, "Step 6: Token Modeling", "Estimating token costs per use case..."), 20000);
        setTimeout(() => sendProgress(sessionId, 8, "Step 7: Priority Scoring", "Computing weighted priority scores..."), 24000);
      }

      // Generate new analysis using AI
      const analysis = await generateCompanyAnalysis(companyName);
      
      if (sessionId) {
        sendProgress(sessionId, 9, "Saving Report", "Storing analysis in database...");
      }

      // Save to database
      const report = await storage.createReport({
        companyName,
        analysisData: analysis,
      });

      if (sessionId) {
        sendProgress(sessionId, 100, "Complete", "Report generated successfully!");
      }

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
      const { sessionId } = req.body;
      if (sessionId) {
        sendProgress(sessionId, -1, "Error", error instanceof Error ? error.message : "Analysis failed");
      }
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
      const { companyName, sessionId } = req.body;

      if (!companyName) {
        return res.status(400).json({ error: "Company name is required" });
      }

      if (sessionId) {
        sendProgress(sessionId, 1, "Regenerating Analysis", "Starting fresh analysis...");
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

      if (sessionId) {
        sendProgress(sessionId, 100, "Complete", "Report regenerated!");
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
