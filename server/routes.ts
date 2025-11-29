import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateCompanyAnalysis, generateWhatIfSuggestion } from "./ai-service";
import * as formulaService from "./formula-service";
import { insertReportSchema } from "@shared/schema";

// Store active SSE connections for progress updates
const progressConnections = new Map<string, any>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint to verify AI service configuration
  app.get("/api/health", (req, res) => {
    const config = {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      aiConfigured: {
        hasApiKey: !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        hasBaseUrl: !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
        baseUrlType: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL?.includes("localhost") 
          ? "local-proxy" 
          : process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL 
            ? "remote" 
            : "default",
      },
      databaseConnected: !!process.env.DATABASE_URL,
    };
    res.json(config);
  });

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

  // Get all reports
  app.get("/api/reports", async (req, res) => {
    try {
      const allReports = await storage.getAllReports();
      return res.json(allReports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      return res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // Get a single report by ID
  app.get("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const allReports = await storage.getAllReports();
      const report = allReports.find(r => r.id === id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      return res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      return res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // Delete a report
  app.delete("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteReport(id);
      return res.json({ success: true, message: "Report deleted" });
    } catch (error) {
      console.error("Error deleting report:", error);
      return res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ===== WHAT-IF ANALYSIS ENDPOINTS =====

  // Create a What-If scenario from an existing report
  app.post("/api/whatif/:parentReportId", async (req, res) => {
    try {
      const { parentReportId } = req.params;
      const { analysisData } = req.body;

      if (!analysisData) {
        return res.status(400).json({ error: "Analysis data is required" });
      }

      const whatIfReport = await storage.createWhatIfReport(parentReportId, analysisData);

      return res.json({
        id: whatIfReport.id,
        companyName: whatIfReport.companyName,
        data: whatIfReport.analysisData,
        isWhatIf: whatIfReport.isWhatIf,
        parentReportId: whatIfReport.parentReportId,
        whatIfVersion: whatIfReport.whatIfVersion,
        createdAt: whatIfReport.createdAt,
        updatedAt: whatIfReport.updatedAt,
      });
    } catch (error) {
      console.error("What-If creation error:", error);
      return res.status(500).json({ 
        error: "Failed to create What-If scenario",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get all What-If scenarios for a parent report
  app.get("/api/whatif/:parentReportId", async (req, res) => {
    try {
      const { parentReportId } = req.params;
      const whatIfReports = await storage.getWhatIfReports(parentReportId);
      return res.json(whatIfReports);
    } catch (error) {
      console.error("Error fetching What-If reports:", error);
      return res.status(500).json({ error: "Failed to fetch What-If reports" });
    }
  });

  // Update a What-If scenario
  app.put("/api/whatif/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { analysisData } = req.body;

      if (!analysisData) {
        return res.status(400).json({ error: "Analysis data is required" });
      }

      const updatedReport = await storage.updateReport(id, { analysisData });

      if (!updatedReport) {
        return res.status(404).json({ error: "What-If scenario not found" });
      }

      return res.json({
        id: updatedReport.id,
        companyName: updatedReport.companyName,
        data: updatedReport.analysisData,
        isWhatIf: updatedReport.isWhatIf,
        parentReportId: updatedReport.parentReportId,
        whatIfVersion: updatedReport.whatIfVersion,
        createdAt: updatedReport.createdAt,
        updatedAt: updatedReport.updatedAt,
      });
    } catch (error) {
      console.error("What-If update error:", error);
      return res.status(500).json({ 
        error: "Failed to update What-If scenario",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // AI suggestion endpoint for What-If analysis
  app.post("/api/whatif/suggest", async (req, res) => {
    try {
      const { step, context, currentData } = req.body;

      if (!step || !context) {
        return res.status(400).json({ error: "Step and context are required" });
      }

      const suggestion = await generateWhatIfSuggestion(step, context, currentData);
      return res.json({ suggestion });
    } catch (error) {
      console.error("AI suggestion error:", error);
      return res.status(500).json({ 
        error: "Failed to generate suggestion",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ===== ASSUMPTION TABLE ENDPOINTS =====

  // Get all assumption sets for a report
  app.get("/api/assumptions/sets/:reportId", async (req, res) => {
    try {
      const { reportId } = req.params;
      const sets = await storage.getAssumptionSetsByReport(reportId);
      return res.json(sets);
    } catch (error) {
      console.error("Error fetching assumption sets:", error);
      return res.status(500).json({ error: "Failed to fetch assumption sets" });
    }
  });

  // Get active assumption set for a report
  app.get("/api/assumptions/sets/:reportId/active", async (req, res) => {
    try {
      const { reportId } = req.params;
      const activeSet = await storage.getActiveAssumptionSet(reportId);
      
      if (!activeSet) {
        return res.json(null);
      }
      
      // Also get the fields for this set
      const fields = await storage.getAssumptionFieldsBySet(activeSet.id);
      return res.json({ ...activeSet, fields });
    } catch (error) {
      console.error("Error fetching active assumption set:", error);
      return res.status(500).json({ error: "Failed to fetch active assumption set" });
    }
  });

  // Create a new assumption set with default values
  app.post("/api/assumptions/sets", async (req, res) => {
    try {
      const { reportId, name, description, companyName } = req.body;

      if (!reportId || !name) {
        return res.status(400).json({ error: "Report ID and name are required" });
      }

      // Check if this is the first set for this report
      const existingSets = await storage.getAssumptionSetsByReport(reportId);
      const isFirst = existingSets.length === 0;

      // Create the set
      const newSet = await storage.createAssumptionSet({
        reportId,
        name,
        description: description || null,
        isActive: isFirst, // First set is automatically active
        isDefault: isFirst, // First set is the default
      });

      // Initialize with default assumptions
      const fields = await storage.initializeDefaultAssumptions(newSet.id, companyName);

      return res.json({ ...newSet, fields });
    } catch (error) {
      console.error("Error creating assumption set:", error);
      return res.status(500).json({ error: "Failed to create assumption set" });
    }
  });

  // Update an assumption set
  app.put("/api/assumptions/sets/:setId", async (req, res) => {
    try {
      const { setId } = req.params;
      const { name, description } = req.body;

      const updated = await storage.updateAssumptionSet(setId, { name, description });
      
      if (!updated) {
        return res.status(404).json({ error: "Assumption set not found" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Error updating assumption set:", error);
      return res.status(500).json({ error: "Failed to update assumption set" });
    }
  });

  // Set active assumption set
  app.post("/api/assumptions/sets/:setId/activate", async (req, res) => {
    try {
      const { setId } = req.params;
      const { reportId } = req.body;

      if (!reportId) {
        return res.status(400).json({ error: "Report ID is required" });
      }

      await storage.setActiveAssumptionSet(reportId, setId);
      
      // Return the newly active set with its fields
      const sets = await storage.getAssumptionSetsByReport(reportId);
      const activeSet = sets.find(s => s.id === setId);
      
      if (activeSet) {
        const fields = await storage.getAssumptionFieldsBySet(setId);
        return res.json({ ...activeSet, fields });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Error activating assumption set:", error);
      return res.status(500).json({ error: "Failed to activate assumption set" });
    }
  });

  // Duplicate an assumption set
  app.post("/api/assumptions/sets/:setId/duplicate", async (req, res) => {
    try {
      const { setId } = req.params;
      const { newName } = req.body;

      if (!newName) {
        return res.status(400).json({ error: "New name is required" });
      }

      const duplicatedSet = await storage.duplicateAssumptionSet(setId, newName);
      const fields = await storage.getAssumptionFieldsBySet(duplicatedSet.id);

      return res.json({ ...duplicatedSet, fields });
    } catch (error) {
      console.error("Error duplicating assumption set:", error);
      return res.status(500).json({ error: "Failed to duplicate assumption set" });
    }
  });

  // Delete an assumption set
  app.delete("/api/assumptions/sets/:setId", async (req, res) => {
    try {
      const { setId } = req.params;
      await storage.deleteAssumptionSet(setId);
      return res.json({ success: true, message: "Assumption set deleted" });
    } catch (error) {
      console.error("Error deleting assumption set:", error);
      return res.status(500).json({ error: "Failed to delete assumption set" });
    }
  });

  // Get category metadata (parent categories, subcategories, labels)
  app.get("/api/assumptions/categories", async (_req, res) => {
    try {
      const { 
        PARENT_CATEGORIES, 
        PARENT_CATEGORY_META, 
        ASSUMPTION_CATEGORIES, 
        CATEGORY_TO_PARENT,
        CATEGORY_LABELS 
      } = await import("@shared/schema");
      
      return res.json({
        parentCategories: PARENT_CATEGORIES,
        parentCategoryMeta: PARENT_CATEGORY_META,
        subcategories: ASSUMPTION_CATEGORIES,
        categoryToParent: CATEGORY_TO_PARENT,
        categoryLabels: CATEGORY_LABELS,
      });
    } catch (error) {
      console.error("Error fetching category metadata:", error);
      return res.status(500).json({ error: "Failed to fetch category metadata" });
    }
  });

  // Get all fields for an assumption set
  app.get("/api/assumptions/fields/:setId", async (req, res) => {
    try {
      const { setId } = req.params;
      const fields = await storage.getAssumptionFieldsBySet(setId);
      return res.json(fields);
    } catch (error) {
      console.error("Error fetching assumption fields:", error);
      return res.status(500).json({ error: "Failed to fetch assumption fields" });
    }
  });

  // Get fields by category
  app.get("/api/assumptions/fields/:setId/:category", async (req, res) => {
    try {
      const { setId, category } = req.params;
      const fields = await storage.getAssumptionFieldsByCategory(setId, category);
      return res.json(fields);
    } catch (error) {
      console.error("Error fetching assumption fields by category:", error);
      return res.status(500).json({ error: "Failed to fetch fields" });
    }
  });

  // Create a custom assumption field
  app.post("/api/assumptions/fields", async (req, res) => {
    try {
      const { 
        setId, category, fieldName, displayName, value, valueType, unit, 
        source, sourceUrl, description, usedInSteps, autoRefresh, 
        refreshFrequency, isLocked 
      } = req.body;

      if (!setId || !category || !fieldName || !displayName) {
        return res.status(400).json({ error: "Required fields missing" });
      }

      const field = await storage.createAssumptionField({
        setId,
        category,
        fieldName,
        displayName,
        value: value || "",
        valueType: valueType || "text",
        unit: unit || null,
        source: source || "Client Provided",
        sourceUrl: sourceUrl || null,
        description: description || null,
        usedInSteps: usedInSteps || null,
        autoRefresh: autoRefresh ?? false,
        refreshFrequency: refreshFrequency || null,
        isLocked: isLocked ?? false,
        isCustom: true,
        sortOrder: 999, // Custom fields at the end
      });

      return res.json(field);
    } catch (error) {
      console.error("Error creating assumption field:", error);
      return res.status(500).json({ error: "Failed to create assumption field" });
    }
  });

  // Update an assumption field
  app.put("/api/assumptions/fields/:fieldId", async (req, res) => {
    try {
      const { fieldId } = req.params;
      const { 
        value, source, sourceUrl, displayName, description, unit,
        usedInSteps, autoRefresh, refreshFrequency, isLocked 
      } = req.body;

      const updateData: Record<string, any> = {};
      if (value !== undefined) updateData.value = value;
      if (source !== undefined) updateData.source = source;
      if (sourceUrl !== undefined) updateData.sourceUrl = sourceUrl;
      if (displayName !== undefined) updateData.displayName = displayName;
      if (description !== undefined) updateData.description = description;
      if (unit !== undefined) updateData.unit = unit;
      if (usedInSteps !== undefined) updateData.usedInSteps = usedInSteps;
      if (autoRefresh !== undefined) updateData.autoRefresh = autoRefresh;
      if (refreshFrequency !== undefined) updateData.refreshFrequency = refreshFrequency;
      if (isLocked !== undefined) updateData.isLocked = isLocked;

      const updated = await storage.updateAssumptionField(fieldId, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "Assumption field not found" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Error updating assumption field:", error);
      return res.status(500).json({ error: "Failed to update assumption field" });
    }
  });

  // Delete a custom assumption field
  app.delete("/api/assumptions/fields/:fieldId", async (req, res) => {
    try {
      const { fieldId } = req.params;
      await storage.deleteAssumptionField(fieldId);
      return res.json({ success: true, message: "Assumption field deleted" });
    } catch (error) {
      console.error("Error deleting assumption field:", error);
      return res.status(500).json({ error: "Failed to delete assumption field" });
    }
  });

  // Batch update multiple assumption fields
  app.put("/api/assumptions/fields/batch", async (req, res) => {
    try {
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      const results = [];
      for (const update of updates) {
        const { fieldId, ...data } = update;
        const updated = await storage.updateAssumptionField(fieldId, data);
        if (updated) {
          results.push(updated);
        }
      }

      return res.json(results);
    } catch (error) {
      console.error("Error batch updating fields:", error);
      return res.status(500).json({ error: "Failed to batch update fields" });
    }
  });

  // Recalculate report based on assumptions
  app.post("/api/assumptions/recalculate/:reportId", async (req, res) => {
    try {
      const { reportId } = req.params;
      
      // Get active assumption set
      const activeSet = await storage.getActiveAssumptionSet(reportId);
      if (!activeSet) {
        return res.status(400).json({ error: "No active assumption set found" });
      }
      
      // Get all fields for the active set
      const fields = await storage.getAssumptionFieldsBySet(activeSet.id);
      
      // Get the report
      const allReports = await storage.getAllReports();
      const report = allReports.find(r => r.id === reportId);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      
      // Build assumption map for easy lookup
      const assumptions: Record<string, { value: string; source: string }> = {};
      fields.forEach(f => {
        assumptions[f.fieldName] = { value: f.value, source: f.source };
      });
      
      // Get the analysis data and apply assumptions
      const analysisData = report.analysisData as any;
      
      // Apply recalculations to Step 5 (Benefits) based on assumptions
      if (analysisData?.steps) {
        const step5 = analysisData.steps.find((s: any) => s.step === 5);
        const step7 = analysisData.steps.find((s: any) => s.step === 7);
        
        if (step5?.data && Array.isArray(step5.data)) {
          // Apply confidence adjustment from assumptions
          const confidenceAdj = parseFloat(assumptions['confidence_adjustment']?.value || '70') / 100;
          
          step5.data = step5.data.map((row: any) => {
            // Recalculate probability based on confidence adjustment
            const baseProbability = parseFloat(row['Probability of Success']) || 0.7;
            const adjustedProbability = Math.min(1, baseProbability * confidenceAdj / 0.7);
            
            return {
              ...row,
              'Probability of Success': adjustedProbability.toFixed(2),
            };
          });
        }
        
        // Recalculate Step 7 priority scores based on weights from assumptions
        if (step7?.data && Array.isArray(step7.data)) {
          const weightValue = parseFloat(assumptions['weight_value']?.value || '40');
          const weightTTV = parseFloat(assumptions['weight_ttv']?.value || '30');
          const weightEffort = parseFloat(assumptions['weight_effort']?.value || '30');
          
          step7.data = step7.data.map((row: any) => {
            const valueScore = parseFloat(row['Value Score']) || 0;
            const ttvScore = parseFloat(row['TTV Score']) || 0;
            const effortScore = parseFloat(row['Effort Score']) || 0;
            
            // Recalculate priority score with new weights
            const priorityScore = Math.round(
              (valueScore * weightValue / 40) +
              (ttvScore * weightTTV / 30) +
              (effortScore * weightEffort / 30)
            );
            
            // Determine priority tier based on new score
            let tier = 'Low';
            if (priorityScore >= 80) tier = 'Critical';
            else if (priorityScore >= 70) tier = 'High';
            else if (priorityScore >= 60) tier = 'Medium';
            
            return {
              ...row,
              'Priority Score': priorityScore,
              'Priority Tier': tier,
            };
          });
          
          // Sort by priority score
          step7.data.sort((a: any, b: any) => 
            (parseFloat(b['Priority Score']) || 0) - (parseFloat(a['Priority Score']) || 0)
          );
        }
      }
      
      // Also recalculate executive dashboard totals
      if (analysisData?.executiveDashboard && analysisData?.steps) {
        const step5 = analysisData.steps.find((s: any) => s.step === 5);
        const step7 = analysisData.steps.find((s: any) => s.step === 7);
        
        if (step5?.data && Array.isArray(step5.data)) {
          let totalRevenueBenefit = 0;
          let totalCostBenefit = 0;
          let totalRiskBenefit = 0;
          let totalCashFlowBenefit = 0;
          let totalAnnualValue = 0;
          
          step5.data.forEach((row: any) => {
            totalRevenueBenefit += parseFloat(String(row['Revenue Benefit ($)']).replace(/[$,]/g, '')) || 0;
            totalCostBenefit += parseFloat(String(row['Cost Benefit ($)']).replace(/[$,]/g, '')) || 0;
            totalRiskBenefit += parseFloat(String(row['Risk Benefit ($)']).replace(/[$,]/g, '')) || 0;
            totalCashFlowBenefit += parseFloat(String(row['Cash Flow Benefit ($)']).replace(/[$,]/g, '')) || 0;
            totalAnnualValue += parseFloat(String(row['Total Annual Value ($)']).replace(/[$,]/g, '')) || 0;
          });
          
          analysisData.executiveDashboard.totalRevenueBenefit = totalRevenueBenefit;
          analysisData.executiveDashboard.totalCostBenefit = totalCostBenefit;
          analysisData.executiveDashboard.totalRiskBenefit = totalRiskBenefit;
          analysisData.executiveDashboard.totalCashFlowBenefit = totalCashFlowBenefit;
          analysisData.executiveDashboard.totalAnnualValue = totalAnnualValue;
        }
        
        // Update top use cases based on recalculated priority scores
        if (step7?.data && Array.isArray(step7.data)) {
          const topUseCases = step7.data.slice(0, 5).map((row: any, index: number) => ({
            rank: index + 1,
            useCase: row['Use Case'],
            annualValue: row['Total Annual Value ($)'] || row['annualValue'],
            priorityScore: row['Priority Score'],
            monthlyTokens: row['Monthly Tokens'] || 0,
          }));
          
          analysisData.executiveDashboard.topUseCases = topUseCases;
        }
      }
      
      // Update the report with recalculated data
      const updatedReport = await storage.updateReport(reportId, {
        analysisData,
      });
      
      if (!updatedReport) {
        return res.status(500).json({ error: "Failed to update report" });
      }
      
      return res.json({
        success: true,
        message: "Report recalculated with updated assumptions",
        assumptions,
        report: updatedReport,
      });
    } catch (error) {
      console.error("Error recalculating report:", error);
      return res.status(500).json({ error: "Failed to recalculate report" });
    }
  });

  // ============= FORMULA MANAGEMENT ENDPOINTS =============

  // Get all formulas for a field (with optional useCase filter)
  app.get("/api/formulas", async (req, res) => {
    try {
      const { reportId, fieldKey, useCaseId } = req.query;

      if (!fieldKey || typeof fieldKey !== "string") {
        return res.status(400).json({ error: "fieldKey is required" });
      }

      const formulas = await storage.getFormulaConfigs(
        reportId as string | null,
        fieldKey,
        useCaseId !== undefined ? (useCaseId as string | null) : undefined
      );

      const active = await storage.getActiveFormula(
        reportId as string | null,
        fieldKey,
        useCaseId !== undefined ? (useCaseId as string | null) : undefined
      );

      return res.json({
        formulas,
        activeFormula: active,
        availableInputs: formulaService.getInputsByCategory(),
      });
    } catch (error) {
      console.error("Error fetching formulas:", error);
      return res.status(500).json({ error: "Failed to fetch formulas" });
    }
  });

  // Get a single formula by ID
  app.get("/api/formulas/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const formula = await storage.getFormulaById(id);

      if (!formula) {
        return res.status(404).json({ error: "Formula not found" });
      }

      return res.json(formula);
    } catch (error) {
      console.error("Error fetching formula:", error);
      return res.status(500).json({ error: "Failed to fetch formula" });
    }
  });

  // Create a new formula version
  app.post("/api/formulas", async (req, res) => {
    try {
      const { 
        reportId, useCaseId, fieldKey, label, expression, 
        inputFields, constants, notes, isActive 
      } = req.body;

      if (!fieldKey || !label || !expression) {
        return res.status(400).json({ error: "fieldKey, label, and expression are required" });
      }

      // Validate the formula
      const allInputs = Object.keys(formulaService.AVAILABLE_INPUTS);
      const constantKeys = (constants || []).map((c: any) => c.key);
      const validation = formulaService.validateFormula(
        expression, 
        [...allInputs, ...constantKeys]
      );

      if (!validation.isValid) {
        return res.status(400).json({ 
          error: "Invalid formula",
          details: validation.errors,
          missingVariables: validation.missingVariables,
        });
      }

      const formula = await storage.createFormulaConfig({
        reportId: reportId || null,
        useCaseId: useCaseId || null,
        fieldKey,
        label,
        expression,
        inputFields: inputFields || validation.usedVariables,
        constants: constants || [],
        notes: notes || null,
        isActive: isActive ?? true,
        createdBy: "user",
      });

      return res.json(formula);
    } catch (error) {
      console.error("Error creating formula:", error);
      return res.status(500).json({ error: "Failed to create formula" });
    }
  });

  // Activate a specific formula version
  app.patch("/api/formulas/:id/activate", async (req, res) => {
    try {
      const { id } = req.params;
      const activated = await storage.activateFormula(id);

      if (!activated) {
        return res.status(404).json({ error: "Formula not found" });
      }

      return res.json(activated);
    } catch (error) {
      console.error("Error activating formula:", error);
      return res.status(500).json({ error: "Failed to activate formula" });
    }
  });

  // Preview formula evaluation without saving
  app.post("/api/formulas/preview", async (req, res) => {
    try {
      const { expression, context, constants } = req.body;

      if (!expression) {
        return res.status(400).json({ error: "Expression is required" });
      }

      const result = formulaService.previewFormula(
        expression,
        context || {},
        constants || []
      );

      return res.json(result);
    } catch (error) {
      console.error("Error previewing formula:", error);
      return res.status(500).json({ error: "Failed to preview formula" });
    }
  });

  // Evaluate a formula with given context
  app.post("/api/formulas/evaluate", async (req, res) => {
    try {
      const { formulaId, context, constants } = req.body;

      let expression: string;
      let formulaConstants: any[] = [];

      if (formulaId) {
        const formula = await storage.getFormulaById(formulaId);
        if (!formula) {
          return res.status(404).json({ error: "Formula not found" });
        }
        expression = formula.expression;
        formulaConstants = formula.constants || [];
      } else if (req.body.expression) {
        expression = req.body.expression;
        formulaConstants = constants || [];
      } else {
        return res.status(400).json({ error: "Either formulaId or expression is required" });
      }

      const result = formulaService.evaluateFormula(
        expression,
        context || {},
        formulaConstants
      );

      return res.json(result);
    } catch (error) {
      console.error("Error evaluating formula:", error);
      return res.status(500).json({ error: "Failed to evaluate formula" });
    }
  });

  // Initialize default formulas for a report
  app.post("/api/formulas/initialize/:reportId", async (req, res) => {
    try {
      const { reportId } = req.params;
      const formulas = await storage.initializeDefaultFormulas(reportId);
      return res.json(formulas);
    } catch (error) {
      console.error("Error initializing formulas:", error);
      return res.status(500).json({ error: "Failed to initialize formulas" });
    }
  });

  // Get available inputs for formula editor
  app.get("/api/formulas/inputs/available", async (_req, res) => {
    try {
      return res.json({
        inputs: formulaService.AVAILABLE_INPUTS,
        grouped: formulaService.getInputsByCategory(),
      });
    } catch (error) {
      console.error("Error fetching available inputs:", error);
      return res.status(500).json({ error: "Failed to fetch available inputs" });
    }
  });

  return httpServer;
}
