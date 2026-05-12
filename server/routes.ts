import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage, AUDIT_EXPORT_MAX_ROWS, type AdminAuditLogQuery } from "./storage";
import { generateCompanyAnalysis, generateWhatIfSuggestion, checkProductionConfig, executePipelineCall } from "./ai-service";
import * as formulaService from "./formula-service";
import { dubService } from "./dub-service";
import { insertReportSchema, adminSettingsUpdateSchema } from "@shared/schema";
import {
  resolveRetentionDays as resolveAuditRetentionDays,
  CLEANUP_INTERVAL_MS as ADMIN_AUDIT_CLEANUP_INTERVAL_MS,
} from "./admin-audit-retention";
import { recordAdminAudit } from "./auth";
import { buildAssumptionExcelWorkbook, buildAssumptionJSON } from "./assumption-export";
import { formatReportAsJson, formatReportAsMarkdown } from "./export-formatters";
import {
  evaluateReportStaleness,
  backfillAllReports,
  parseOnlyIdsFromBody,
  type BackfillReportResult,
} from "./report-backfill";
import { nanoid } from "nanoid";
import multer from "multer";
import { createRequire } from "module";
import archiver from "archiver";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

// Configure multer for file uploads (memory storage for immediate processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for PDF files
    files: 10, // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ];
    const allowedExtensions = [".pdf", ".txt", ".md", ".csv", ".json"];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}`));
    }
  },
});

// Store background job status and results
interface StepResult {
  step: number;
  title: string;
  data: any;
  completedAt: number;
}

interface JobStatus {
  status: 'pending' | 'processing' | 'complete' | 'error';
  companyName: string;
  result?: any;
  error?: string;
  startedAt: number;
  completedSteps: StepResult[];
  currentStep: number;
}
const backgroundJobs = new Map<string, JobStatus>();

// Cleanup old jobs after 30 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(backgroundJobs.entries());
  for (const [jobId, job] of entries) {
    if (now - job.startedAt > 30 * 60 * 1000) {
      backgroundJobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Escape a value for inclusion in a CSV cell. Per RFC 4180: any cell
// containing a comma, double-quote, CR, or LF must be wrapped in double
// quotes, with embedded double-quotes escaped by doubling. Plain-text
// cells (no special chars) are emitted verbatim so common cases like
// timestamps and action codes don't produce noisy quoting that breaks
// `cut`-style command-line analysis on the resulting file.
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Format one audit-log entry as a CSV row matching the header
//   when,action,status,statusCode,actorIp,path,errorMessage,outcome
// `outcome` is JSON-stringified so structured fields like
// `{ updated: 12, skipped: 0, failed: 1 }` survive round-tripping into
// a spreadsheet without losing their shape.
function formatAuditEntryAsCsvRow(entry: {
  createdAt: Date;
  action: string;
  status: string;
  statusCode: number | null;
  actorIp: string | null;
  path: string | null;
  errorMessage: string | null;
  outcome: unknown;
}): string {
  const when =
    entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : String(entry.createdAt ?? "");
  const outcomeStr =
    entry.outcome === null || entry.outcome === undefined
      ? ""
      : JSON.stringify(entry.outcome);
  return (
    [
      csvEscape(when),
      csvEscape(entry.action),
      csvEscape(entry.status),
      csvEscape(entry.statusCode),
      csvEscape(entry.actorIp),
      csvEscape(entry.path),
      csvEscape(entry.errorMessage),
      csvEscape(outcomeStr),
    ].join(",") + "\n"
  );
}

// Build a self-describing filename for the CSV download so an operator
// who archives the file (e.g. attaches it to an incident ticket) can
// later recover what filter slice it represents without re-running the
// query. Format: `admin-audit-<UTC timestamp>[-<filter tags>].csv`
// where filter tags only appear for active filters. Sanitised to
// filesystem-safe characters because operators routinely save these to
// shared drives where Windows paths reject `:`, `/`, etc.
function buildAuditExportFilename(
  opts: AdminAuditLogQuery,
  extension: "csv" | "xlsx" | "pdf" = "csv",
): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/Z$/, "Z");
  const tags: string[] = [];
  const safe = (s: string) =>
    s.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_");
  if (opts.action) tags.push(`action_${safe(opts.action)}`);
  if (opts.status === "success" || opts.status === "failure") {
    tags.push(`status_${opts.status}`);
  }
  if (opts.since instanceof Date && !Number.isNaN(opts.since.getTime())) {
    tags.push(`from_${opts.since.toISOString().slice(0, 10)}`);
  }
  if (opts.until instanceof Date && !Number.isNaN(opts.until.getTime())) {
    tags.push(`to_${opts.until.toISOString().slice(0, 10)}`);
  }
  if (opts.ip && opts.ip.trim().length > 0) {
    tags.push(`ip_${safe(opts.ip.trim())}`);
  }
  const suffix = tags.length === 0 ? "" : `-${tags.join("-")}`;
  return `admin-audit-${stamp}${suffix}.${extension}`;
}

// Build a real .xlsx workbook for the audit-log export. Returns a Buffer
// suitable for piping to the response. Two sheets:
//   - "Audit Log": one row per entry. `when` is a real Excel datetime cell
//     (so spreadsheet date filters work and the local-timezone coercion
//     trap is avoided), `statusCode` is a real number, the rest are text.
//     The header row is bold + frozen so it stays visible while scrolling.
//   - "Outcomes": one row per entry that has a non-null `outcome`, keyed
//     by the audit row id so an operator can look up the structured
//     counters without staring at JSON-stringified gibberish in the main
//     sheet. Skipped entirely (no sheet at all) if no row has an outcome.
async function buildAuditExportXlsxBuffer(
  entries: ReadonlyArray<{
    id: string;
    createdAt: Date;
    action: string;
    status: string;
    statusCode: number | null;
    actorIp: string | null;
    path: string | null;
    errorMessage: string | null;
    outcome: unknown;
  }>,
): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "BlueAlly Insight";
  wb.created = new Date();

  const main = wb.addWorksheet("Audit Log", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  main.columns = [
    { header: "id", key: "id", width: 38 },
    { header: "when", key: "when", width: 22, style: { numFmt: "yyyy-mm-dd hh:mm:ss" } },
    { header: "action", key: "action", width: 28 },
    { header: "status", key: "status", width: 12 },
    { header: "statusCode", key: "statusCode", width: 12 },
    { header: "actorIp", key: "actorIp", width: 18 },
    { header: "path", key: "path", width: 60 },
    { header: "errorMessage", key: "errorMessage", width: 50 },
    { header: "outcome", key: "outcome", width: 18 },
  ];
  main.getRow(1).font = { bold: true };

  const outcomesPresent = entries.some(
    (e) => e.outcome !== null && e.outcome !== undefined,
  );
  let outcomeSheet: import("exceljs").Worksheet | null = null;
  if (outcomesPresent) {
    outcomeSheet = wb.addWorksheet("Outcomes", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    outcomeSheet.columns = [
      { header: "id", key: "id", width: 38 },
      { header: "action", key: "action", width: 28 },
      { header: "when", key: "when", width: 22, style: { numFmt: "yyyy-mm-dd hh:mm:ss" } },
      { header: "outcomeJson", key: "outcomeJson", width: 80 },
    ];
    outcomeSheet.getRow(1).font = { bold: true };
  }

  for (const entry of entries) {
    const when =
      entry.createdAt instanceof Date ? entry.createdAt : null;
    const hasOutcome =
      entry.outcome !== null && entry.outcome !== undefined;
    main.addRow({
      id: entry.id,
      when,
      action: entry.action,
      status: entry.status,
      // Use null (rather than the string "") so the spreadsheet column
      // stays numeric — mixing "" into a number column makes Excel
      // complain about "Number stored as text" on every other row.
      statusCode:
        typeof entry.statusCode === "number" ? entry.statusCode : null,
      actorIp: entry.actorIp ?? "",
      path: entry.path ?? "",
      errorMessage: entry.errorMessage ?? "",
      // Cross-reference: if there's structured outcome data, point the
      // operator at the Outcomes sheet rather than dumping JSON inline.
      outcome: hasOutcome ? "see Outcomes sheet" : "",
    });
    if (hasOutcome && outcomeSheet) {
      outcomeSheet.addRow({
        id: entry.id,
        action: entry.action,
        when,
        outcomeJson: JSON.stringify(entry.outcome),
      });
    }
  }

  // exceljs returns ArrayBuffer-like; coerce to Node Buffer for res.end().
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

// Build a print-ready PDF of the filtered audit slice. Operators who
// archive these to compliance systems or attach them to incident
// tickets prefer a paginated PDF over a spreadsheet because it reads
// well on mobile, captures the active filters at the top of every
// page, and avoids "is this column a date or a string?" import
// questions entirely.
//
// Rendering choices:
//   - Landscape A4 — eight columns of audit data don't fit portrait
//     once `path` and `errorMessage` get any breathing room.
//   - Header band (page 1 + repeated atop every page via autotable's
//     `didDrawPage` hook) lists the active filter values, the export
//     timestamp, and a truncation banner when the slice exceeded the
//     10k cap. Operators routinely flip to page 7 to find one row;
//     repeating the filter context means they don't have to flip back.
//   - `outcome` is rendered as compact JSON inline (PDFs don't have
//     a sister "Outcomes sheet" the way the .xlsx export does) so the
//     row stays self-contained.
async function buildAuditExportPdfBuffer(
  entries: ReadonlyArray<{
    id: string;
    createdAt: Date;
    action: string;
    status: string;
    statusCode: number | null;
    actorIp: string | null;
    path: string | null;
    errorMessage: string | null;
    outcome: unknown;
  }>,
  opts: AdminAuditLogQuery,
  meta: { total: number; truncated: boolean; generatedAt: Date },
): Promise<Buffer> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Build a human-readable summary of the active filters so the
  // header band reads like the panel's filter row, not like a
  // query-string dump.
  const filterLines: string[] = [];
  const fmtDate = (d: Date) => d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
  if (opts.action) filterLines.push(`Action: ${opts.action}`);
  if (opts.status === "success" || opts.status === "failure") {
    filterLines.push(`Status: ${opts.status}`);
  }
  if (opts.since instanceof Date && !Number.isNaN(opts.since.getTime())) {
    filterLines.push(`From: ${fmtDate(opts.since)}`);
  }
  if (opts.until instanceof Date && !Number.isNaN(opts.until.getTime())) {
    filterLines.push(`To: ${fmtDate(opts.until)}`);
  }
  if (opts.ip && opts.ip.trim().length > 0) {
    filterLines.push(`IP contains: ${opts.ip.trim()}`);
  }
  if (filterLines.length === 0) filterLines.push("Filters: (none — full slice)");

  const headerBlock = (): number => {
    let y = 32;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Admin audit log", 32, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 16;
    doc.text(
      `Generated ${meta.generatedAt.toISOString()}  ·  Rows: ${entries.length}${
        meta.truncated ? ` of ${meta.total} (truncated)` : ""
      }`,
      32,
      y,
    );
    y += 14;
    for (const line of filterLines) {
      doc.text(line, 32, y);
      y += 12;
    }
    if (meta.truncated) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 0, 0);
      doc.text(
        `Truncated at ${entries.length} rows (cap: ${entries.length}). Narrow the filters to capture the remaining ${
          meta.total - entries.length
        } rows.`,
        32,
        y,
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      y += 14;
    }
    return y + 6;
  };

  const startY = headerBlock();

  const body = entries.map((e) => [
    e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt ?? ""),
    e.action,
    e.status,
    typeof e.statusCode === "number" ? String(e.statusCode) : "",
    e.actorIp ?? "",
    e.path ?? "",
    e.errorMessage ?? "",
    e.outcome === null || e.outcome === undefined ? "" : JSON.stringify(e.outcome),
  ]);

  autoTable(doc, {
    head: [[
      "when",
      "action",
      "status",
      "statusCode",
      "actorIp",
      "path",
      "errorMessage",
      "outcome",
    ]],
    body,
    startY,
    margin: { left: 32, right: 32, top: 32, bottom: 32 },
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 90 },
      2: { cellWidth: 45 },
      3: { cellWidth: 45 },
      4: { cellWidth: 75 },
      5: { cellWidth: 130 },
      6: { cellWidth: 130 },
      7: { cellWidth: "auto" },
    },
    didDrawPage: (data) => {
      // Page 1 already had the full header rendered before
      // autotable started; subsequent pages get just a compact
      // "Admin audit log — page N" strip so the filter context
      // isn't lost mid-document.
      if ((data.pageNumber ?? 1) > 1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Admin audit log (continued)", 32, 24);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(filterLines.join("  ·  "), 32, 38);
      }
      // Footer with page numbers on every page.
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Page ${data.pageNumber}`,
        pageWidth - 32,
        pageHeight - 16,
        { align: "right" },
      );
      doc.setTextColor(0, 0, 0);
    },
  });

  const ab = doc.output("arraybuffer");
  return Buffer.from(ab as ArrayBuffer);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/version", (req, res) => {
    res.json({ version: "2.5.0", buildTime: "2025-11-30T03:10:00Z" });
  });

  // Document upload endpoint - extracts text from PDFs and text files
  app.post("/api/upload", upload.array("files", 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const results: Array<{ name: string; content: string; size: number; type: string }> = [];
      const errors: Array<{ name: string; error: string }> = [];

      for (const file of files) {
        try {
          let content: string;
          const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf("."));
          
          if (ext === ".pdf" || file.mimetype === "application/pdf") {
            // Parse PDF and extract text using PDFParse class
            const parser = new PDFParse({ data: file.buffer });
            const pdfData = await parser.getText();
            content = pdfData.text;
            await parser.destroy();
            
            // Clean up extracted text (remove excessive whitespace)
            content = content
              .replace(/\r\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .replace(/[ \t]+/g, " ")
              .trim();
          } else {
            // Text-based files - read directly as UTF-8
            content = file.buffer.toString("utf-8");
          }

          // ============================================================
          // PRIOR-ASSESSMENT DETECTION (.json imports)
          // ------------------------------------------------------------
          // If the uploaded JSON is a previously-exported BlueAlly
          // assessment (has `analysis.steps[]` with use cases), surface
          // it as an importable assessment instead of stuffing the raw
          // text into Claude as source material. The client routes
          // these into `/api/import-analysis`, which saves the JSON
          // verbatim — preserving every input the user provided.
          // ============================================================
          let priorAssessment: any = null;
          if (ext === ".json") {
            try {
              const parsed = JSON.parse(content);
              const steps = parsed?.analysis?.steps;
              if (
                parsed &&
                typeof parsed === "object" &&
                Array.isArray(steps) &&
                steps.some((s: any) => s?.step === 5 && Array.isArray(s?.data) && s.data.length > 0)
              ) {
                priorAssessment = {
                  companyName: typeof parsed.companyName === "string" ? parsed.companyName : null,
                  analysis: parsed.analysis,
                  generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
                };
              }
            } catch {
              // Not valid JSON or not an assessment — fall through to
              // the regular text-document path below.
            }
          }

          // Enforce character limit per document
          const MAX_CHARS = 50000;
          if (content.length > MAX_CHARS) {
            content = content.substring(0, MAX_CHARS) + "\n... [truncated]";
          }

          results.push({
            name: file.originalname,
            content,
            size: file.size,
            type: file.mimetype || "text/plain",
            ...(priorAssessment ? { priorAssessment } : {}),
          });
        } catch (fileError: any) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
          errors.push({
            name: file.originalname,
            error: fileError.message || "Failed to process file",
          });
        }
      }

      res.json({
        success: true,
        documents: results,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: error.message || "Failed to process uploaded files",
      });
    }
  });

  // ============================================================
  // POST /api/import-analysis
  // ------------------------------------------------------------
  // Accept a previously-exported assessment JSON and persist it
  // VERBATIM as a new (or upserted) report. Critically, this path:
  //   1. Does NOT call Claude / the LLM pipeline.
  //   2. Does NOT call `postProcessAnalysis` — that function would
  //      overwrite the per-UC benefit values, formula strings,
  //      scenario / headline figures, and run the CFO reality
  //      rescale. Imports must preserve every input the user
  //      explicitly provided.
  //   3. Stamps `importedFromJson: true` on the analysis payload so
  //      `evaluateReportStaleness` short-circuits and subsequent
  //      loads through /api/reports/:id and /api/analyze/check
  //      never reprocess the report either.
  // ============================================================
  app.post("/api/import-analysis", async (req, res) => {
    try {
      const { analysis, companyName: explicitCompanyName, displayName: explicitDisplayName } = req.body ?? {};
      if (!analysis || typeof analysis !== "object" || !Array.isArray(analysis?.steps)) {
        return res.status(400).json({
          error: "Invalid import payload — `analysis` must be an object with a `steps` array (a previously-exported BlueAlly assessment).",
        });
      }
      const companyName: string =
        (typeof explicitCompanyName === "string" && explicitCompanyName.trim()) ||
        (typeof analysis?.companyOverview?.companyName === "string" && analysis.companyOverview.companyName.trim()) ||
        (typeof req.body?.parsedCompanyName === "string" && req.body.parsedCompanyName.trim()) ||
        "";
      if (!companyName) {
        return res.status(400).json({
          error: "Could not determine a company name for the imported assessment. Provide `companyName` in the request body.",
        });
      }

      // Display-name override: prefer the explicit request body field, then
      // a top-level `displayName` baked into the exported JSON. Trim and
      // collapse empty strings to null so the UI falls back to companyName.
      const candidateDisplayName: unknown =
        explicitDisplayName ?? (analysis as any)?.displayName ?? null;
      const displayName: string | null =
        typeof candidateDisplayName === "string" && candidateDisplayName.trim()
          ? candidateDisplayName.trim().slice(0, 200)
          : null;

      const preservedAnalysis = {
        ...analysis,
        // Stamp displayName into the analysis envelope so client renderers
        // (which read from `analysisData`) see it without an extra fetch.
        displayName,
        importedFromJson: true,
        importedAt: new Date().toISOString(),
      };

      // Upsert: if a report already exists for this company, replace
      // its analysisData with the imported payload so the user sees
      // exactly what they imported (no merge, no reconciliation).
      const existing = await storage.getReportByCompany(companyName);
      let report: any;
      if (existing) {
        report = await storage.updateReport(existing.id, { analysisData: preservedAnalysis, displayName } as any);
        if (!report) report = { ...existing, analysisData: preservedAnalysis, displayName, updatedAt: new Date() };
        console.log(`[import-analysis] Replaced report ${existing.id} for ${companyName}${displayName ? ` (display: ${displayName})` : ""}`);
      } else {
        report = await storage.createReport({
          companyName,
          displayName,
          analysisData: preservedAnalysis,
        } as any);
        console.log(`[import-analysis] Created report ${report?.id} for ${companyName}${displayName ? ` (display: ${displayName})` : ""}`);
      }
      if (!report?.id) {
        return res.status(500).json({ error: "Storage layer did not return a report row." });
      }

      res.json({
        success: true,
        report: {
          id: report.id,
          data: preservedAnalysis,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
        },
      });
    } catch (err: any) {
      console.error("[import-analysis] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to import assessment" });
    }
  });

  // Shareable link endpoint - Get report by ID
  app.get("/api/reports/:id", async (req, res) => {
    try {
      const reportId = req.params.id;
      
      // Fetch report from DB using storage interface
      const report = await storage.getReportById(reportId);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Re-run post-processing to ensure Step 6 recovery, correct column order, and current VRM schema
      const analysis = report.analysisData as any;
      if (analysis?.steps && Array.isArray(analysis.steps)) {
        const staleness = evaluateReportStaleness(analysis);
        if (staleness.stale) {
          try {
            const { postProcessAnalysis } = await import("./calculation-postprocessor");
            const reprocessed = await postProcessAnalysis(analysis);
            report.analysisData = reprocessed;
            // Persist so future loads don't need reprocessing
            await storage.updateReport(reportId, { analysisData: reprocessed });
            console.log(`[routes] Re-processed report ${reportId} (reasons: ${staleness.reasons.join(', ')})`);
          } catch (ppErr) {
            console.warn(`[routes] Post-processing failed for report ${reportId}:`, ppErr);
          }
        }
      }

      // Splice displayName onto the analysisData envelope so client renderers
      // (which read primarily from analysisData) see the override without
      // needing a second fetch. The row's `displayName` column is the source
      // of truth — this is just a convenience mirror.
      if (report.analysisData && typeof report.analysisData === "object") {
        (report.analysisData as any).displayName = report.displayName ?? null;
      }

      // Return the full report data
      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Failed to load report" });
    }
  });

  // Update the presentation-only display name for a report.
  // Auth-gated. The research/canonical companyName is left untouched so AI
  // lookups, slugs, and export filenames keep working.
  //   PATCH body: { "displayName": "A+E Networks, LLC" }   → set
  //   PATCH body: { "displayName": null } | "" | omitted   → clear (revert)
  app.patch("/api/reports/:id/display-name", async (req, res) => {
    try {
      if (!req.session?.authenticated) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { id } = req.params;
      const { updateReportDisplayNameSchema } = await import("@shared/schema");
      const parsed = updateReportDisplayNameSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid display name",
          details: parsed.error.flatten(),
        });
      }
      const existing = await storage.getReportById(id);
      if (!existing) {
        return res.status(404).json({ error: "Report not found" });
      }
      const newDisplayName = parsed.data.displayName ?? null;
      const updated = await storage.updateReportDisplayName(id, newDisplayName);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update display name" });
      }
      // Mirror onto analysisData so future loads see the new override.
      try {
        const analysis = updated.analysisData as any;
        if (analysis && typeof analysis === "object") {
          analysis.displayName = updated.displayName ?? null;
          await storage.updateReport(id, { analysisData: analysis });
        }
      } catch (mirrorErr) {
        console.warn(`[display-name] Could not mirror onto analysisData for ${id}:`, mirrorErr);
      }
      console.log(`[display-name] ${id} → ${updated.displayName ? `"${updated.displayName}"` : "(cleared)"} (research name remains "${updated.companyName}")`);
      return res.json({
        success: true,
        report: {
          id: updated.id,
          companyName: updated.companyName,
          displayName: updated.displayName,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err: any) {
      console.error("[display-name] Error:", err);
      return res.status(500).json({ error: err?.message || "Failed to update display name" });
    }
  });

  // Database connectivity test
  app.get("/api/test-db", async (req, res) => {
    const dbUrl = process.env.DATABASE_URL || "";
    const result: any = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      databaseUrl: dbUrl ? {
        set: true,
        length: dbUrl.length,
        protocol: dbUrl.split("://")[0],
        host: dbUrl.includes("@") ? dbUrl.split("@")[1]?.split("/")[0]?.split(":")[0] : "unknown",
      } : { set: false },
      tests: {},
    };
    
    try {
      // Test 1: Check if storage is initialized
      result.tests.storageImport = "checking...";
      result.tests.storageImport = storage ? "success" : "storage is null";
      
      // Test 2: Try to get all reports (simple query)
      result.tests.getAllReports = "checking...";
      const reports = await storage.getAllReports();
      result.tests.getAllReports = `success (${reports.length} reports found)`;
      
      // Test 3: Try to get a specific company report
      result.tests.getReportByCompany = "checking...";
      const testReport = await storage.getReportByCompany("TestCompany123");
      result.tests.getReportByCompany = testReport ? "found" : "not found (expected)";
      
      result.success = true;
    } catch (error: any) {
      result.success = false;
      result.error = {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 5),
      };
    }
    
    res.json(result);
  });

  // Diagnostic endpoint to check API configuration
  app.get("/api/debug-config", (req, res) => {
    const integrationApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    const claudeResearcherKey = process.env.CLAUDERESEARCHER;
    
    // Use Replit-managed integration, fallback to CLAUDERESEARCHER
    const activeConfig = integrationApiKey ? "INTEGRATION_KEY" : (claudeResearcherKey ? "CLAUDERESEARCHER" : "NONE");
    const activeBaseUrl = integrationBaseUrl || "https://api.anthropic.com";
    
    res.json({
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "not set",
      replitDeployment: process.env.REPLIT_DEPLOYMENT || "not set",
      apiKeyStatus: {
        AI_INTEGRATIONS_ANTHROPIC_API_KEY: integrationApiKey ? `SET (${integrationApiKey.length} chars)` : "NOT SET",
        AI_INTEGRATIONS_ANTHROPIC_BASE_URL: integrationBaseUrl ? `SET (${integrationBaseUrl.substring(0, 30)}...)` : "NOT SET",
        CLAUDERESEARCHER: claudeResearcherKey ? `SET (${claudeResearcherKey.length} chars)` : "NOT SET",
      },
      activeConfiguration: activeConfig,
      activeBaseUrl: activeBaseUrl,
      willWork: activeConfig !== "NONE",
    });
  });

  // Test direct fetch to Anthropic (bypass SDK)
  app.get("/api/test-direct-fetch", async (req, res) => {
    // Use Replit-managed integration, fallback to CLAUDERESEARCHER
    const integrationApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    
    const apiKey = integrationApiKey || process.env.CLAUDERESEARCHER;
    if (!apiKey) {
      return res.json({ error: "No API key configured", hasIntegrationKey: false });
    }
    const baseUrl = integrationBaseUrl || "https://api.anthropic.com";
    
    try {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 100,
          messages: [{ role: "user", content: "Say hello in 5 words" }],
        }),
      });
      
      const data = await response.json();
      res.json({ success: response.ok, status: response.status, baseUrl, data });
    } catch (error: any) {
      res.json({ 
        error: error?.message,
        cause: error?.cause?.message,
        code: error?.cause?.code,
      });
    }
  });
  
  // Test longer prompt with larger output
  app.get("/api/test-long", async (req, res) => {
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.CLAUDERESEARCHER;
    if (!apiKey) {
      return res.json({ error: "No AI integration API key configured" });
    }
    
    console.log("[test-long] Starting long prompt test...");
    
    // Use the actual system prompt from ai-service to test if size is the issue
    const longSystemPrompt = `You are a senior strategic AI consultant. Generate a simple JSON analysis with 3 steps.
Return ONLY valid JSON with this structure:
{
  "steps": [
    {"step": 0, "title": "Overview", "content": "Brief overview"},
    {"step": 1, "title": "Analysis", "content": "Analysis content"},
    {"step": 2, "title": "Recommendations", "content": "Recommendations"}
  ],
  "summary": "Executive summary"
}`;
    
    try {
      console.log("[test-long] Making fetch request...");
      const startTime = Date.now();
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4000,
          system: longSystemPrompt,
          messages: [{ role: "user", content: "Analyze TestCorp and return the JSON analysis. Return ONLY valid JSON. No markdown code fences, no explanation text before or after. The response must start with { or [ and end with } or ]." }],
        }),
      });
      
      const duration = Date.now() - startTime;
      console.log("[test-long] Response received:", response.status, "in", duration, "ms");
      const data = await response.json();
      console.log("[test-long] Response parsed, content length:", JSON.stringify(data).length);
      res.json({ success: response.ok, status: response.status, duration, data });
    } catch (error: any) {
      console.error("[test-long] Error:", error?.message);
      res.json({ 
        error: error?.message,
        cause: error?.cause?.message,
        code: error?.cause?.code,
      });
    }
  });
  
  // Test with very long system prompt (similar to actual analysis)
  app.get("/api/test-full-prompt", async (req, res) => {
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.CLAUDERESEARCHER;
    if (!apiKey) {
      return res.json({ error: "No AI integration API key configured" });
    }
    
    console.log("[test-full-prompt] Starting full prompt test...");
    
    // Use a shortened version of the actual system prompt
    const systemPrompt = `You are a senior strategic AI consultant. Generate a comprehensive AI opportunity assessment.

CRITICAL RULES:
1. Apply CONSERVATIVE BIAS: Reduce all revenue estimates by 5%
2. Use lower-bound industry benchmarks
3. All financial values in USD

GENERATE THIS 3-STEP ANALYSIS:

STEP 0: Company Overview
- Company name, industry, estimated revenue

STEP 1: Strategic Themes
- 3 strategic themes

STEP 2: Key Recommendations
- 3 recommendations

Return ONLY valid JSON with this structure:
{
  "steps": [
    {"step": 0, "title": "Company Overview", "content": "prose description", "data": null},
    {"step": 1, "title": "Strategic Themes", "content": "brief intro", "data": [{"theme": "..."}]},
    {"step": 2, "title": "Recommendations", "content": "brief intro", "data": [{"recommendation": "..."}]}
  ],
  "summary": "Executive summary"
}`;

    const userPrompt = `Analyze "TestCorp" and generate the 3-step analysis. Return ONLY valid JSON. No markdown code fences, no explanation text before or after. The response must start with { or [ and end with } or ].`;
    
    try {
      console.log("[test-full-prompt] Making fetch request, prompt length:", systemPrompt.length);
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log("[test-full-prompt] Request timed out after 3 minutes");
        controller.abort();
      }, 3 * 60 * 1000);
      
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8000,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.log("[test-full-prompt] Response received:", response.status, "in", duration, "ms");
      const data = await response.json();
      console.log("[test-full-prompt] Response parsed, content length:", JSON.stringify(data).length);
      res.json({ success: response.ok, status: response.status, duration, data });
    } catch (error: any) {
      console.error("[test-full-prompt] Error:", error?.message, error?.name);
      res.json({ 
        error: error?.message,
        name: error?.name,
        cause: error?.cause?.message,
        code: error?.cause?.code,
      });
    }
  });

  // Debug endpoint to see env config
  app.get("/api/debug-env", (req, res) => {
    // List all relevant env vars
    const relevantVars: Record<string, string> = {};
    const patterns = ['ANTHROPIC', 'AI_INTEGRATIONS', 'PROXY', 'proxy', 'HTTP', 'HTTPS'];
    for (const [key, value] of Object.entries(process.env)) {
      if (patterns.some(p => key.includes(p))) {
        relevantVars[key] = value ? `${value.substring(0, 30)}...` : 'undefined';
      }
    }
    
    res.json({
      NODE_ENV: process.env.NODE_ENV,
      relevantVars: relevantVars,
    });
  });

  // Debug endpoint to check database configuration in production
  app.get("/api/debug-db-config", (req, res) => {
    const fs = require("fs");
    const replitDbPath = "/tmp/replitdb";
    
    let replitDbContent = null;
    let replitDbExists = false;
    try {
      replitDbExists = fs.existsSync(replitDbPath);
      if (replitDbExists) {
        const content = fs.readFileSync(replitDbPath, "utf-8").trim();
        // Show first 100 chars (masked if credentials)
        const preview = content.substring(0, 100);
        const startsWithPostgres = content.startsWith("postgresql://");
        const startsWithHttp = content.startsWith("http");
        
        replitDbContent = {
          hasContent: true,
          length: content.length,
          startsWithPostgres,
          startsWithHttp,
          preview: preview.replace(/\/\/[^@]+@/, "//***@"), // mask credentials
          hasAtSign: content.includes("@"),
        };
      }
    } catch (error: any) {
      replitDbContent = { error: error.message };
    }
    
    const dbUrl = process.env.DATABASE_URL || "";
    let dbUrlHost = "not set";
    if (dbUrl.includes("@")) {
      const parts = dbUrl.split("@");
      const hostPart = parts[1] || "";
      dbUrlHost = hostPart.split("/")[0]?.split(":")[0] || "unknown";
    }
    
    res.json({
      environment: process.env.NODE_ENV,
      replitDbFile: {
        path: replitDbPath,
        exists: replitDbExists,
        content: replitDbContent,
      },
      envDatabaseUrl: {
        set: !!process.env.DATABASE_URL,
        length: dbUrl.length,
        host: dbUrlHost,
      },
      pgEnvVars: {
        PGHOST: process.env.PGHOST || "not set",
        PGPORT: process.env.PGPORT || "not set",
        PGDATABASE: process.env.PGDATABASE || "not set",
        PGUSER: process.env.PGUSER ? "set" : "not set",
      },
    });
  });

  app.post("/api/analyze/check", async (req, res) => {
    try {
      const { companyName } = req.body;
      if (!companyName) return res.status(400).json({ exists: false });
      const existing = await storage.getReportByCompany(companyName);
      if (existing) {
        // Refresh stale v2.0 reports to current v2.1 schema on the fly
        let analysis: any = existing.analysisData;
        if (analysis?.steps) {
          const staleness = evaluateReportStaleness(analysis);
          if (staleness.stale) {
            try {
              const { postProcessAnalysis } = await import("./calculation-postprocessor");
              const reprocessed = await postProcessAnalysis(analysis);
              analysis = reprocessed;
              await storage.updateReport(existing.id, { analysisData: reprocessed });
              console.log(`[analyze/check] Refreshed ${companyName} (reasons: ${staleness.reasons.join(', ')})`);
            } catch (ppErr) {
              console.warn(`[analyze/check] Refresh failed for ${companyName}:`, ppErr);
            }
          }
        }
        // Splice displayName onto analysis so client renderers see it.
        if (analysis && typeof analysis === "object") {
          analysis.displayName = existing.displayName ?? null;
        }
        return res.json({
          exists: true,
          report: {
            id: existing.id,
            data: analysis,
            displayName: existing.displayName ?? null,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
        });
      }
      res.json({ exists: false });
    } catch (err: any) {
      console.error("[analyze/check] Error:", err.message);
      res.status(500).json({ exists: false, error: err.message });
    }
  });

  // One-shot admin backfill: re-run postProcessAnalysis over every report so
  // they all carry the v2.1 schema, diagnostic flat fields, and Step 6 hard
  // knockout fields without waiting for a user to open them. Protected by the
  // session auth middleware (registered in setupAuth).
  // Query params:
  //   force=1  → reprocess every report regardless of staleness
  //   verbose=1 → include the per-report results array in the response
  //   stream=1 → stream per-report progress as newline-delimited JSON
  // Body (JSON, optional):
  //   { onlyIds: string[] } → restrict the run to just those report IDs
  //   (used by the "Retry these" button on /admin to re-run only the
  //   failures from the previous run instead of the whole dataset).
  app.post("/api/admin/backfill-reports", async (req, res) => {
    const force = req.query.force === "1" || req.query.force === "true";
    const verbose = req.query.verbose === "1" || req.query.verbose === "true";
    const stream = req.query.stream === "1" || req.query.stream === "true";

    // Parse and validate the optional onlyIds whitelist from the JSON body.
    // We intentionally accept it from the body (not query string) so the
    // request does not bump into URL-length limits when retrying dozens of
    // failed reports. The validation is in `parseOnlyIdsFromBody` so the
    // wire-format contract is unit-testable without standing up the route.
    const parsed = parseOnlyIdsFromBody(req.body);
    if (!parsed.ok) {
      recordAdminAudit(req, {
        action: "backfill-reports",
        status: "failure",
        statusCode: 400,
        params: { force, stream, verbose },
        errorMessage: parsed.error,
      });
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const onlyIds = parsed.onlyIds;
    // Store onlyIds count (not the IDs themselves) so the row stays compact.
    const auditParams = {
      force,
      stream,
      verbose,
      onlyIdsCount: onlyIds ? onlyIds.length : 0,
    };

    const startedAt = Date.now();
    console.log(
      `[admin/backfill-reports] Starting backfill (force=${force}, stream=${stream}${
        onlyIds ? `, onlyIds=${onlyIds.length}` : ""
      }) — initiated by ${req.ip || "unknown"}`,
    );

    if (stream) {
      // Stream per-report progress as newline-delimited JSON. The browser
      // consumes the response body incrementally so operators see live
      // progress instead of staring at a spinner for minutes.
      type StreamEvent =
        | { type: "start"; total: number; force: boolean }
        | {
            type: "progress";
            index: number;
            total: number;
            result: BackfillReportResult;
          }
        | {
            type: "complete";
            success: true;
            force: boolean;
            total: number;
            updated: number;
            skipped: number;
            failed: number;
            durationMs: number;
            failures: BackfillReportResult[];
            results?: BackfillReportResult[];
          }
        | { type: "error"; success: false; error: string };

      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      // Flush headers immediately so the client knows the stream is open.
      // `flushHeaders` is part of Node's http.ServerResponse but isn't
      // declared on Express's narrowed Response type, so guard via a
      // type-safe interface narrowing rather than an `any` cast.
      const maybeFlushable: { flushHeaders?: () => void } = res;
      if (typeof maybeFlushable.flushHeaders === "function") {
        maybeFlushable.flushHeaders();
      }

      const writeEvent = (event: StreamEvent) => {
        res.write(JSON.stringify(event) + "\n");
      };

      try {
        const summary = await backfillAllReports({
          force,
          onlyIds,
          onStart: (total) => {
            // Emit a start frame as soon as the report list is known so the
            // client can render the progress bar immediately, even while the
            // first report is still being processed.
            writeEvent({ type: "start", total, force });
          },
          onProgress: (i, total, result) => {
            if (result.status !== "skipped") {
              console.log(
                `[admin/backfill-reports] (${i}/${total}) ${result.status.toUpperCase()} ${result.companyName} (${result.id})${
                  result.reasons ? ` reasons=${result.reasons.join(",")}` : ""
                }${result.error ? ` error=${result.error}` : ""} (${result.durationMs}ms)`,
              );
            }
            writeEvent({ type: "progress", index: i, total, result });
          },
        });
        console.log(
          `[admin/backfill-reports] Done in ${summary.durationMs}ms — total=${summary.total}, updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed}`,
        );
        recordAdminAudit(req, {
          action: "backfill-reports",
          status: "success",
          statusCode: 200,
          params: auditParams,
          outcome: {
            total: summary.total,
            updated: summary.updated,
            skipped: summary.skipped,
            failed: summary.failed,
            durationMs: summary.durationMs,
          },
        });
        const failures = summary.results.filter((r) => r.status === "failed");
        const updatedReports = summary.results.filter(
          (r) => r.status === "updated",
        );
        const completePayload: Extract<StreamEvent, { type: "complete" }> = {
          type: "complete",
          success: true,
          force,
          total: summary.total,
          updated: summary.updated,
          skipped: summary.skipped,
          failed: summary.failed,
          durationMs: summary.durationMs,
          failures,
          ...(verbose ? { results: summary.results } : {}),
        };
        // Persist the completed run so the Admin page can rehydrate the
        // same summary, failures table, and "Retry these" button on the
        // next page load (or after the operator comes back tomorrow). A
        // persistence failure must NOT mask the run itself — the live
        // stream consumer already has every byte they need — so we log
        // and swallow.
        try {
          await storage.saveLastBackfillSummary(
            {
              success: true,
              force,
              total: summary.total,
              updated: summary.updated,
              skipped: summary.skipped,
              failed: summary.failed,
              durationMs: summary.durationMs,
              failures,
            },
            updatedReports,
          );
        } catch (persistErr) {
          console.error(
            "[admin/backfill-reports] Failed to persist last-run summary:",
            persistErr,
          );
        }
        writeEvent(completePayload);
        res.end();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[admin/backfill-reports] Aborted after ${Date.now() - startedAt}ms:`,
          err,
        );
        recordAdminAudit(req, {
          action: "backfill-reports",
          status: "failure",
          statusCode: 500,
          params: auditParams,
          outcome: { durationMs: Date.now() - startedAt },
          errorMessage: message,
        });
        try {
          writeEvent({
            type: "error",
            success: false,
            error: message,
          });
        } catch {
          // Stream may already be torn down — nothing useful to do.
        }
        res.end();
      }
      return;
    }

    try {
      const summary = await backfillAllReports({
        force,
        onlyIds,
        onProgress: (i, total, result) => {
          if (result.status !== "skipped") {
            console.log(
              `[admin/backfill-reports] (${i}/${total}) ${result.status.toUpperCase()} ${result.companyName} (${result.id})${
                result.reasons ? ` reasons=${result.reasons.join(",")}` : ""
              }${result.error ? ` error=${result.error}` : ""} (${result.durationMs}ms)`,
            );
          }
        },
      });
      console.log(
        `[admin/backfill-reports] Done in ${summary.durationMs}ms — total=${summary.total}, updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed}`,
      );
      recordAdminAudit(req, {
        action: "backfill-reports",
        status: "success",
        statusCode: 200,
        params: auditParams,
        outcome: {
          total: summary.total,
          updated: summary.updated,
          skipped: summary.skipped,
          failed: summary.failed,
          durationMs: summary.durationMs,
        },
      });
      const failures = summary.results.filter((r) => r.status === "failed");
      const updatedReports = summary.results.filter(
        (r) => r.status === "updated",
      );
      const responseBody: any = {
        success: true,
        force,
        total: summary.total,
        updated: summary.updated,
        skipped: summary.skipped,
        failed: summary.failed,
        durationMs: summary.durationMs,
      };
      if (verbose) {
        responseBody.results = summary.results;
      } else {
        // Always surface failures so the operator can act on them without re-running with verbose
        responseBody.failures = failures;
      }
      // Persist the same snapshot the streaming branch persists so an
      // operator who triggered the backfill via curl/CLI also gets the
      // hydrated post-run state next time they open /admin in the browser.
      try {
        await storage.saveLastBackfillSummary(
          {
            success: true,
            force,
            total: summary.total,
            updated: summary.updated,
            skipped: summary.skipped,
            failed: summary.failed,
            durationMs: summary.durationMs,
            failures,
          },
          updatedReports,
        );
      } catch (persistErr) {
        console.error(
          "[admin/backfill-reports] Failed to persist last-run summary:",
          persistErr,
        );
      }
      res.json(responseBody);
    } catch (err: any) {
      console.error(
        `[admin/backfill-reports] Aborted after ${Date.now() - startedAt}ms:`,
        err,
      );
      recordAdminAudit(req, {
        action: "backfill-reports",
        status: "failure",
        statusCode: 500,
        params: auditParams,
        outcome: { durationMs: Date.now() - startedAt },
        errorMessage: err?.message ?? String(err),
      });
      res.status(500).json({
        success: false,
        error: err?.message ?? String(err),
      });
    }
  });

  // Returns the most recently completed backfill run so the Admin page can
  // hydrate the post-run summary, failures table, and "Retry these" button
  // on page load — without forcing the operator to re-run the entire upgrade
  // just to surface failures they noticed yesterday. Returns
  // `{ summary: null }` when no run has ever completed against this DB.
  app.get("/api/admin/last-backfill", async (req, res) => {
    try {
      const row = await storage.getLastBackfillSummary();
      if (!row) {
        return res.json({ summary: null });
      }
      res.json({
        summary: row.summary,
        updatedReports: row.updatedReports,
        completedAt: row.completedAt,
      });
    } catch (err: any) {
      console.error("[admin/last-backfill] Failed to read last run:", err);
      res
        .status(500)
        .json({ summary: null, error: err?.message ?? String(err) });
    }
  });

  // Operator-triggered "Clear last run" affordance. Drops the singleton
  // `admin_last_backfill` row so the Admin page collapses back to the
  // empty `{ summary: null }` state on the next hydration fetch — used
  // when the operator has already actioned (or dismissed) the previous
  // failures table and doesn't want it rehydrating until the next full
  // run. Audited explicitly via `recordAdminAudit` so the action shows
  // up in the audit log alongside backfill runs and settings changes.
  app.delete("/api/admin/last-backfill", async (req, res) => {
    try {
      const removed = await storage.clearLastBackfillSummary();
      recordAdminAudit(req, {
        action: "clear-last-backfill",
        status: "success",
        statusCode: 200,
        outcome: { removed },
      });
      res.json({ success: true, removed });
    } catch (err: any) {
      console.error("[admin/last-backfill] Failed to clear last run:", err);
      recordAdminAudit(req, {
        action: "clear-last-backfill",
        status: "failure",
        statusCode: 500,
        errorMessage: err?.message ?? String(err),
      });
      res
        .status(500)
        .json({ success: false, error: err?.message ?? String(err) });
    }
  });

  // Most recent admin_audit_log retention sweep, used by the cleanup
  // status banner on /admin. Returns 200 with `cleanup: null` before
  // the first sweep, and also on read failure (banner renders the muted
  // "no record" state instead of a hard error).
  app.get("/api/admin/last-audit-cleanup", async (_req, res) => {
    try {
      const row = await storage.getLastAdminAuditCleanup();
      if (!row) {
        return res.json({
          cleanup: null,
          intervalMs: ADMIN_AUDIT_CLEANUP_INTERVAL_MS,
        });
      }
      res.json({
        cleanup: {
          status: row.status,
          removedCount: row.removedCount,
          retentionDays: row.retentionDays,
          cutoff: row.cutoff,
          errorMessage: row.errorMessage,
          durationMs: row.durationMs,
          ranAt: row.ranAt,
        },
        intervalMs: ADMIN_AUDIT_CLEANUP_INTERVAL_MS,
      });
    } catch (err: any) {
      console.error(
        "[admin/last-audit-cleanup] Failed to read last run:",
        err,
      );
      res
        .status(200)
        .json({
          cleanup: null,
          intervalMs: ADMIN_AUDIT_CLEANUP_INTERVAL_MS,
          error: err?.message ?? String(err),
        });
    }
  });

  // Operator-tunable admin settings. Currently exposes only the audit log
  // retention window (in days). The shape is intentionally `{ settings,
  // effective }` so the UI can both:
  //   - render the input bound to the persisted override (`settings.auditRetentionDays`,
  //     null when no override is stored), and
  //   - show the value the scheduler would use right now if it ran
  //     (`effective.auditRetentionDays`, which folds in the env-var fallback
  //     so an admin who hasn't set a UI override still sees what's in force).
  app.get("/api/admin/settings", async (_req, res) => {
    try {
      const row = await storage.getAdminSettings();
      const effective = await resolveAuditRetentionDays();
      res.json({
        settings: {
          auditRetentionDays: row?.auditRetentionDays ?? null,
          updatedAt: row?.updatedAt ?? null,
        },
        effective: {
          auditRetentionDays: effective,
        },
      });
    } catch (err: any) {
      console.error("[admin/settings] Failed to read settings:", err);
      res
        .status(500)
        .json({ error: err?.message ?? String(err) });
    }
  });

  // Persist an updated admin setting. Validation lives in
  // `adminSettingsUpdateSchema` (shared/schema.ts) so the wire contract
  // stays consistent. A clear error message — not a 500, not "Internal
  // Server Error" — is returned for invalid input so the operator sees
  // what's wrong (zero, negative, non-numeric) without having to read
  // the server log. Crucially, an invalid value can never reach the
  // scheduler, which would silently disable retention if it did.
  app.put("/api/admin/settings", async (req, res) => {
    const parsed = adminSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Invalid settings payload.";
      recordAdminAudit(req, {
        action: "update-admin-settings",
        status: "failure",
        statusCode: 400,
        params: { keys: Object.keys(req.body ?? {}) },
        errorMessage: message,
      });
      return res.status(400).json({ error: message });
    }
    try {
      const updated = await storage.updateAdminSettings(parsed.data);
      const effective = await resolveAuditRetentionDays();
      recordAdminAudit(req, {
        action: "update-admin-settings",
        status: "success",
        statusCode: 200,
        params: { auditRetentionDays: parsed.data.auditRetentionDays ?? null },
      });
      res.json({
        settings: {
          auditRetentionDays: updated.auditRetentionDays,
          updatedAt: updated.updatedAt,
        },
        effective: {
          auditRetentionDays: effective,
        },
      });
    } catch (err: any) {
      console.error("[admin/settings] Failed to persist settings:", err);
      recordAdminAudit(req, {
        action: "update-admin-settings",
        status: "failure",
        statusCode: 500,
        errorMessage: err?.message ?? String(err),
      });
      res
        .status(500)
        .json({ error: err?.message ?? String(err) });
    }
  });

  // Preview how many existing audit_log rows would fall outside a proposed
  // retention window. Used by the Admin UI to put a real number in front of
  // the operator before they shorten retention — e.g. "going from 90 days to
  // 7 will permanently delete 1,243 audit entries on the next sweep".
  // Read-only: this never mutates anything; it just runs a COUNT(*) over the
  // same filter the scheduler would use (createdAt < now - days).
  app.get("/api/admin/settings/retention-impact", async (req, res) => {
    const raw = req.query.days;
    // Strict integer parsing — `parseInt` would silently accept "7abc"
    // or "7.9" as 7, masking obvious bugs in the caller. We require a
    // pure decimal string so the wire contract matches the stated
    // "integer between 1 and 3650".
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
      return res
        .status(400)
        .json({ error: "Query param `days` must be an integer between 1 and 3650." });
    }
    const days = Number(raw);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return res
        .status(400)
        .json({ error: "Query param `days` must be an integer between 1 and 3650." });
    }
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // The retention sweeper deletes rows where `createdAt < cutoff`
      // (see `pruneOldAdminAuditEntries`). Mirror that strict comparison
      // here so the previewed count is exactly what the next sweep will
      // delete — not off-by-one for entries created at the cutoff
      // instant. `getRecentAdminAuditEntries` only exposes a `<=` filter
      // (`until`), so we shave a millisecond off the cutoff to emulate
      // strict `<`.
      const strictCutoff = new Date(cutoff.getTime() - 1);
      const result = await storage.getRecentAdminAuditEntries({
        until: strictCutoff,
        limit: 1,
        offset: 0,
      });
      res.json({ days, cutoff: cutoff.toISOString(), affected: result.total });
    } catch (err: any) {
      console.error(
        "[admin/settings/retention-impact] Failed to count entries:",
        err,
      );
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  // Read-only access to recent admin activity for the Admin UI panel.
  //
  // Accepts optional filters (`action`, `status`, `since`, `until`, `ip`)
  // and pagination (`limit`, `offset`) so the Admin page can support
  // operators investigating "who overwrote report X two weeks ago?" once
  // the table grows past the most-recent-25 default.
  //
  // - `since` and `until` are ISO-8601 strings; invalid values are silently
  //   ignored so a partial query still returns useful data instead of 400.
  // - `status` is restricted to "success" / "failure"; anything else is
  //   ignored at the storage layer.
  // - `ip` is treated as a case-insensitive substring (operators rarely
  //   know the full IPv6 address; "10.0." is a common partial query).
  //
  // The same filter shape is shared with `/api/admin/audit-log/export`
  // (CSV download), via `parseAuditLogQuery` below — so a future filter
  // addition only has to be wired in one place.
  const parseAuditLogQuery = (
    q: Record<string, unknown>,
    defaultLimit: number,
  ) => {
    const asString = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim().length > 0 ? v : undefined;
    const asInt = (v: unknown, fallback: number): number => {
      if (typeof v !== "string") return fallback;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    };
    const asDate = (v: unknown): Date | undefined => {
      const s = asString(v);
      if (!s) return undefined;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    return {
      limit: asInt(q.limit, defaultLimit),
      offset: asInt(q.offset, 0),
      action: asString(q.action),
      status: asString(q.status),
      since: asDate(q.since),
      until: asDate(q.until),
      ip: asString(q.ip),
    };
  };

  app.get("/api/admin/audit-log", async (req, res) => {
    try {
      const result = await storage.getRecentAdminAuditEntries(
        parseAuditLogQuery(req.query as Record<string, unknown>, 25),
      );
      res.json({ entries: result.entries, total: result.total });
    } catch (err: any) {
      console.error("[admin/audit-log] Failed to read audit log:", err);
      res
        .status(500)
        .json({ entries: [], total: 0, error: err?.message ?? String(err) });
    }
  });

  // CSV export of the filtered audit trail. Mirrors the same filter
  // semantics as `/api/admin/audit-log` so an operator's "Download CSV"
  // pulls exactly the slice they're currently viewing in the panel.
  // Capped at `AUDIT_EXPORT_MAX_ROWS` rows in the storage layer; if the
  // filter selects more, the response includes an `X-Audit-Export-Truncated`
  // header so the UI can warn the operator they need to narrow further.
  // Filename includes the timestamp + active filters for archival —
  // operators routinely attach these to incident tickets.
  app.get("/api/admin/audit-log/export", async (req, res) => {
    try {
      const opts = parseAuditLogQuery(
        req.query as Record<string, unknown>,
        AUDIT_EXPORT_MAX_ROWS,
      );
      const result = await storage.exportAdminAuditEntries(opts);

      const filename = buildAuditExportFilename(opts);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      // Custom headers so the client can show "exported N of M rows" /
      // "results were truncated" toast feedback without re-fetching.
      res.setHeader("X-Audit-Export-Total", String(result.total));
      res.setHeader("X-Audit-Export-Rows", String(result.entries.length));
      res.setHeader(
        "X-Audit-Export-Truncated",
        result.truncated ? "1" : "0",
      );
      // Expose the custom headers to the browser fetch layer — without
      // this, the Admin page can't read them off the Response object.
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, X-Audit-Export-Total, X-Audit-Export-Rows, X-Audit-Export-Truncated",
      );

      // Stream row-by-row so we don't buffer the entire CSV in memory
      // before the first byte hits the wire. At the 10k cap with ~1KB
      // rows the buffered approach would still be fine, but streaming
      // is the same code and gives us headroom if the cap ever rises.
      res.write(
        "when,action,status,statusCode,actorIp,path,errorMessage,outcome\n",
      );
      for (const entry of result.entries) {
        res.write(formatAuditEntryAsCsvRow(entry));
      }
      res.end();
    } catch (err: any) {
      console.error("[admin/audit-log/export] Failed to export audit log:", err);
      // If headers haven't gone out yet, surface the error as JSON so the
      // browser fetch can display it. Once we've started writing CSV
      // bytes we can't switch content types — best we can do is hang up
      // mid-stream and log the failure.
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: err?.message ?? String(err) });
      } else {
        res.end();
      }
    }
  });

  // Excel (.xlsx) export of the same filtered slice as the CSV endpoint
  // above. Operators who archive audit trails in spreadsheets prefer this
  // because: (a) `when` round-trips as a real datetime cell instead of
  // being coerced to local time on import, (b) `statusCode` stays numeric
  // so they can sort/filter numerically, (c) long action paths and error
  // messages don't get truncated by Excel's CSV import column-width
  // heuristic, and (d) structured `outcome` data lives on its own sheet
  // keyed by row id rather than as a JSON-stringified blob in a single
  // cell. Identical filter shape, 10k row cap, and truncation headers as
  // the CSV route — so the UI can offer both side-by-side.
  app.get("/api/admin/audit-log/export.xlsx", async (req, res) => {
    try {
      const opts = parseAuditLogQuery(
        req.query as Record<string, unknown>,
        AUDIT_EXPORT_MAX_ROWS,
      );
      const result = await storage.exportAdminAuditEntries(opts);

      const buffer = await buildAuditExportXlsxBuffer(result.entries);
      const filename = buildAuditExportFilename(opts, "xlsx");
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("X-Audit-Export-Total", String(result.total));
      res.setHeader("X-Audit-Export-Rows", String(result.entries.length));
      res.setHeader(
        "X-Audit-Export-Truncated",
        result.truncated ? "1" : "0",
      );
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, X-Audit-Export-Total, X-Audit-Export-Rows, X-Audit-Export-Truncated",
      );
      res.setHeader("Content-Length", String(buffer.length));
      res.end(buffer);
    } catch (err: any) {
      console.error(
        "[admin/audit-log/export.xlsx] Failed to export audit log:",
        err,
      );
      // Mirror the CSV route's pre-stream error handling: build the whole
      // workbook in-memory before sending bytes, so any failure (storage
      // throw, exceljs serialization error) can still surface as JSON.
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: err?.message ?? String(err) });
      } else {
        res.end();
      }
    }
  });

  // PDF export of the same filtered slice as the CSV / .xlsx routes
  // above. Operators who attach audit trails to compliance archives or
  // incident tickets typically prefer a print-ready PDF: it reads well
  // on mobile, captures the active filter values + timestamp at the top
  // of every page, and avoids spreadsheet import quirks. Identical
  // filter shape, 10k row cap, and truncation headers as the other
  // export routes — so the UI can offer all three side-by-side.
  app.get("/api/admin/audit-log/export.pdf", async (req, res) => {
    try {
      const opts = parseAuditLogQuery(
        req.query as Record<string, unknown>,
        AUDIT_EXPORT_MAX_ROWS,
      );
      const result = await storage.exportAdminAuditEntries(opts);

      const buffer = await buildAuditExportPdfBuffer(result.entries, opts, {
        total: result.total,
        truncated: result.truncated,
        generatedAt: new Date(),
      });
      const filename = buildAuditExportFilename(opts, "pdf");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("X-Audit-Export-Total", String(result.total));
      res.setHeader("X-Audit-Export-Rows", String(result.entries.length));
      res.setHeader(
        "X-Audit-Export-Truncated",
        result.truncated ? "1" : "0",
      );
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, X-Audit-Export-Total, X-Audit-Export-Rows, X-Audit-Export-Truncated",
      );
      res.setHeader("Content-Length", String(buffer.length));
      res.end(buffer);
    } catch (err: any) {
      console.error(
        "[admin/audit-log/export.pdf] Failed to export audit log:",
        err,
      );
      // Mirror the .xlsx route's pre-stream error handling: the whole
      // PDF is built in memory before any byte hits the wire, so a
      // failure can still surface as JSON for the browser fetch.
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: err?.message ?? String(err) });
      } else {
        res.end();
      }
    }
  });

  app.post("/api/analyze/step", async (req, res) => {
    try {
      const { companyName, callNumber, previousCallResults, documentContext } = req.body;

      if (!companyName || typeof companyName !== "string") {
        return res.status(400).json({ error: "companyName is required" });
      }
      if (!callNumber || callNumber < 1 || callNumber > 4) {
        return res.status(400).json({ error: "callNumber must be 1-4" });
      }

      const configCheck = checkProductionConfig();
      if (!configCheck.ok) {
        return res.status(503).json({ error: configCheck.message });
      }

      console.log(`[analyze/step] Call ${callNumber} for "${companyName}"`);

      const result = await executePipelineCall(
        callNumber,
        companyName,
        previousCallResults || {},
        documentContext
      );

      if (callNumber === 4 && result.analysis) {
        const report = await storage.createReport({
          companyName,
          analysisData: result.analysis,
        });
        console.log(`[analyze/step] Report saved: ${report.id}`);
        return res.json({
          report: {
            id: report.id,
            data: report.analysisData,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          },
        });
      }

      return res.json({ data: result });
    } catch (err: any) {
      console.error(`[analyze/step] Error:`, err.message);

      if (err.message?.includes("rate limit") || err.message?.includes("429")) {
        return res.status(429).json({ error: "AI service is busy. Please wait and retry." });
      }
      if (err.message?.includes("401") || err.message?.includes("Authentication")) {
        return res.status(401).json({ error: "API key configuration error." });
      }

      return res.status(500).json({ error: err.message || "Pipeline step failed" });
    }
  });

  // Direct analyze test - same as /api/analyze but simpler logging
  app.post("/api/analyze-direct", async (req, res) => {
    console.log("=== ANALYZE-DIRECT START ===");
    console.log("Body:", JSON.stringify(req.body));
    
    try {
      const { companyName } = req.body;
      
      if (!companyName) {
        console.log("No company name");
        return res.status(400).json({ error: "Company name required" });
      }
      
      console.log("Checking config...");
      const configCheck = checkProductionConfig();
      console.log("Config:", JSON.stringify(configCheck));
      
      if (!configCheck.ok) {
        return res.status(503).json({ error: configCheck.message });
      }
      
      console.log("Checking existing report...");
      const existingReport = await storage.getReportByCompany(companyName);
      
      if (existingReport) {
        console.log("Found existing report");
        return res.json({
          id: existingReport.id,
          companyName: existingReport.companyName,
          data: existingReport.analysisData,
          isNew: false,
        });
      }
      
      console.log("Generating new analysis...");
      const analysis = await generateCompanyAnalysis(companyName);
      console.log("Analysis complete, saving...");
      
      const report = await storage.createReport({
        companyName,
        analysisData: analysis,
      });
      console.log("Report saved:", report.id);
      
      return res.json({
        id: report.id,
        companyName: report.companyName,
        data: report.analysisData,
        isNew: true,
      });
    } catch (error: any) {
      console.error("=== ANALYZE-DIRECT ERROR ===");
      console.error("Error:", error?.message);
      console.error("Stack:", error?.stack);
      return res.status(500).json({ 
        error: error?.message || "Analysis failed",
        stack: error?.stack?.split('\n').slice(0, 3)
      });
    }
  });

  // Health check endpoint to verify AI service configuration
  app.get("/api/health", (req, res) => {
    const configCheck = checkProductionConfig();
    
    const config = {
      status: configCheck.ok ? "ok" : "misconfigured",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      aiConfigured: {
        hasIntegrationApiKey: !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        hasCustomApiKey: !!process.env.CLAUDERESEARCHER,
        configOk: configCheck.ok,
        message: configCheck.message,
      },
      databaseConnected: !!process.env.DATABASE_URL,
    };
    res.json(config);
  });

  // Quick analysis test endpoint
  app.get("/api/test-analyze", async (req, res) => {
    const testResult: any = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      stages: {},
    };
    
    try {
      // Stage 1: Check config
      testResult.stages.config = "checking...";
      const configCheck = checkProductionConfig();
      testResult.stages.config = configCheck;
      
      if (!configCheck.ok) {
        testResult.success = false;
        testResult.error = "Config check failed";
        return res.json(testResult);
      }
      
      // Stage 2: Try to generate a mini analysis
      testResult.stages.analysis = "starting...";
      const analysis = await generateCompanyAnalysis("TestCorp");
      testResult.stages.analysis = "completed";
      testResult.success = true;
      testResult.summary = analysis.summary?.substring(0, 200) || "No summary";
    } catch (error: any) {
      testResult.success = false;
      testResult.stages.analysis = "failed";
      testResult.error = {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5),
      };
    }
    
    res.json(testResult);
  });

  // Test endpoint to debug AI API connectivity
  app.get("/api/test-ai", async (req, res) => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    
    const integrationApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.CLAUDERESEARCHER;
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    
    const testResult: any = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      config: {
        hasIntegrationApiKey: !!integrationApiKey,
        usingBaseUrl: !!baseURL,
        keyUsed: integrationApiKey ? "integration" : "none",
      },
    };
    
    try {
      const anthropic = new Anthropic({
        apiKey: integrationApiKey,
        ...(baseURL && { baseURL }),
        timeout: 30000,
      });
      
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 50,
        messages: [{ role: "user", content: "Say hello in one word." }],
      });
      
      testResult.success = true;
      testResult.response = message.content[0].type === "text" ? message.content[0].text : "Non-text response";
    } catch (error: any) {
      testResult.success = false;
      testResult.error = {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.constructor?.name,
      };
    }
    
    res.json(testResult);
  });

  // Check job status endpoint
  app.get("/api/analyze/status/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = backgroundJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (job.status === 'complete') {
      return res.json({
        status: 'complete',
        result: job.result
      });
    } else if (job.status === 'error') {
      return res.json({
        status: 'error',
        error: job.error
      });
    } else {
      return res.json({
        status: job.status,
        companyName: job.companyName,
        currentStep: job.currentStep || 0,
        completedSteps: (job.completedSteps || []).map(s => s.step),
      });
    }
  });

  app.get("/api/analyze/step/:jobId/:stepNum", (req, res) => {
    const { jobId, stepNum } = req.params;
    const step = parseInt(stepNum);
    const job = backgroundJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    if (job.status === 'error') {
      return res.status(500).json({ error: job.error });
    }
    
    if (job.status !== 'complete' || !job.result?.data) {
      if (job.currentStep !== undefined && job.currentStep > step + 1) {
        return res.json({ status: 'step_complete', step });
      }
      return res.json({ status: 'pending', currentStep: job.currentStep || 0 });
    }
    
    const analysisData = job.result.data;
    const steps = analysisData?.steps;
    if (!steps || !Array.isArray(steps)) {
      return res.status(500).json({ error: "Analysis data missing steps" });
    }
    
    const stepData = steps.find((s: any) => s.step === step);
    if (!stepData) {
      return res.status(404).json({ error: `Step ${step} not found in analysis` });
    }
    
    return res.json({ status: 'complete', step, data: stepData });
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      console.log("Analyze endpoint called with body:", JSON.stringify(req.body));
      const { companyName, sessionId, documents } = req.body;
      
      if (!companyName || typeof companyName !== "string") {
        console.log("Invalid company name:", companyName);
        return res.status(400).json({ error: "Company name is required" });
      }
      
      // Process uploaded documents into context string
      let documentContext = "";
      if (documents && Array.isArray(documents) && documents.length > 0) {
        console.log(`Processing ${documents.length} uploaded documents`);
        documentContext = documents
          .map((doc: { name: string; content: string }) => 
            `--- Document: ${doc.name} ---\n${doc.content.slice(0, 50000)}\n--- End of ${doc.name} ---`
          )
          .join("\n\n");
        console.log(`Document context length: ${documentContext.length} characters`);
      }

      // Check if production is properly configured before proceeding
      console.log("Checking production config...");
      const configCheck = checkProductionConfig();
      if (!configCheck.ok) {
        console.error("Production config check failed:", configCheck.message);
        return res.status(503).json({ 
          error: "AI service not configured for production",
          message: configCheck.message
        });
      }
      console.log("Config check passed");

      // Check if we already have a report for this company
      console.log("Checking for existing report...");
      const existingReport = await storage.getReportByCompany(companyName);
      console.log("Existing report check complete:", existingReport ? "found" : "not found");
      
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

      // Create a job ID for background processing
      const jobId = sessionId || nanoid();
      
      // Store job status
      backgroundJobs.set(jobId, {
        status: 'processing',
        companyName,
        startedAt: Date.now(),
        completedSteps: [],
        currentStep: 0,
      });

      // Start background processing and return immediately
      // Use setImmediate to ensure response is sent before processing starts
      setImmediate(async () => {
        const startTime = Date.now();
        console.log(`[analyze-job] Starting background analysis for "${companyName}" (jobId: ${jobId})`);
        try {
          const progressCallback = (step: number, message: string, detail?: string) => {
            const job = backgroundJobs.get(jobId);
            if (job) {
              job.currentStep = step;
            }
          };

          const analysis = await generateCompanyAnalysis(companyName, documentContext, progressCallback);
          const aiElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[analyze-job] AI generation completed in ${aiElapsed}s for "${companyName}"`);

          const report = await storage.createReport({
            companyName,
            analysisData: analysis,
          });

          backgroundJobs.set(jobId, {
            status: 'complete',
            companyName,
            startedAt: backgroundJobs.get(jobId)?.startedAt || Date.now(),
            completedSteps: [],
            currentStep: 10,
            result: {
              id: report.id,
              companyName: report.companyName,
              data: report.analysisData,
              createdAt: report.createdAt,
              updatedAt: report.updatedAt,
              isNew: true,
            }
          });

          const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[analyze-job] Job complete for "${companyName}" in ${totalElapsed}s (jobId: ${jobId})`);
        } catch (error: any) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[analyze-job] Job FAILED for "${companyName}" after ${elapsed}s (jobId: ${jobId}):`, error?.message || error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          backgroundJobs.set(jobId, {
            status: 'error',
            companyName,
            startedAt: backgroundJobs.get(jobId)?.startedAt || Date.now(),
            completedSteps: [],
            currentStep: 0,
            error: errorMessage
          });
        }
      });

      // Return immediately with job ID - client will poll for results
      return res.json({
        status: 'processing',
        jobId,
        companyName,
        message: 'Analysis started. Poll /api/analyze/status/:jobId for results.'
      });
      
    } catch (error: any) {
      console.error("Analysis error full details:", error);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
      return res.status(500).json({ 
        error: "Failed to generate analysis",
        message: errorMessage,
        details: error?.stack?.split('\n').slice(0, 5)
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

      const jobId = sessionId || nanoid();
      
      backgroundJobs.set(jobId, {
        status: 'processing',
        companyName,
        startedAt: Date.now(),
        completedSteps: [],
        currentStep: 0,
      });

      setImmediate(async () => {
        const startTime = Date.now();
        console.log(`[regenerate-job] Starting regeneration for "${companyName}" (jobId: ${jobId})`);
        try {
          const progressCallback = (step: number, message: string, detail?: string) => {
            const job = backgroundJobs.get(jobId);
            if (job) {
              job.currentStep = step;
            }
          };

          const analysis = await generateCompanyAnalysis(companyName, "", progressCallback);
          
          const updatedReport = await storage.updateReport(id, {
            analysisData: analysis,
          });

          if (!updatedReport) {
            throw new Error("Report not found during regeneration");
          }

          backgroundJobs.set(jobId, {
            status: 'complete',
            companyName,
            startedAt: backgroundJobs.get(jobId)?.startedAt || Date.now(),
            completedSteps: [],
            currentStep: 10,
            result: {
              id: updatedReport.id,
              companyName: updatedReport.companyName,
              data: updatedReport.analysisData,
              createdAt: updatedReport.createdAt,
              updatedAt: updatedReport.updatedAt,
            }
          });

          const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[regenerate-job] Regeneration complete for "${companyName}" in ${totalElapsed}s`);
        } catch (error: any) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.error(`[regenerate-job] Failed for "${companyName}" after ${elapsed}s:`, error?.message || error);
          backgroundJobs.set(jobId, {
            status: 'error',
            companyName,
            startedAt: backgroundJobs.get(jobId)?.startedAt || Date.now(),
            completedSteps: [],
            currentStep: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      return res.json({
        status: 'processing',
        jobId,
        companyName,
        message: 'Regeneration started. Poll /api/analyze/status/:jobId for results.'
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

  // ===== WORKFLOW GENERATION ENDPOINTS =====

  // Generate Miro-ready workflow data for a report
  app.post("/api/reports/:id/workflows", async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        format = "enhanced",
        detailLevel = "standard",
        includeAgenticPatterns = true,
        includeAssumptions = true,
        includeMiroMetadata = true
      } = req.body;

      // Import workflow generator dynamically
      const { 
        generateAllWorkflows, 
        createWorkflowExport, 
        extractUseCasesFromAnalysis 
      } = await import("./workflow-generator");

      // Get the report
      const report = await storage.getReportById(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const analysis = report.analysisData as any;
      
      // Extract use cases from the analysis
      const useCases = extractUseCasesFromAnalysis(analysis);
      
      if (useCases.length === 0) {
        return res.status(400).json({ 
          error: "No use cases found in report",
          message: "The report must contain use cases in Step 4 or Step 5 to generate workflows"
        });
      }

      // Generate workflows for all use cases
      const options = {
        format: format as "standard" | "enhanced" | "csv",
        detailLevel: detailLevel as "summary" | "standard" | "detailed",
        includeAgenticPatterns,
        includeAssumptions,
        includeMiroMetadata
      };

      const workflows = await generateAllWorkflows(useCases, options);

      // Create the export data
      const exportData = createWorkflowExport(
        id,
        report.companyName,
        workflows,
        options,
        includeAssumptions ? (analysis.assumptions || {}) : undefined
      );

      return res.json(exportData);
    } catch (error) {
      console.error("Workflow generation error:", error);
      return res.status(500).json({ 
        error: "Failed to generate workflows",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get workflow data if already generated (cached in report)
  app.get("/api/reports/:id/workflows", async (req, res) => {
    try {
      const { id } = req.params;
      const report = await storage.getReportById(id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      const analysis = report.analysisData as any;
      
      if (analysis.workflowData) {
        return res.json(analysis.workflowData);
      }

      return res.status(404).json({ 
        error: "Workflows not generated",
        message: "Use POST /api/reports/:id/workflows to generate workflow data"
      });
    } catch (error) {
      console.error("Error fetching workflows:", error);
      return res.status(500).json({ error: "Failed to fetch workflows" });
    }
  });

  // Map agentic patterns for a use case
  app.post("/api/pattern-mapping", async (req, res) => {
    try {
      const { 
        name, 
        description, 
        businessFunction,
        frictionPoint
      } = req.body;

      if (!name) {
        return res.status(400).json({ 
          error: "Missing required field",
          message: "'name' is required for pattern mapping"
        });
      }

      const { mapAgenticPatterns } = await import("./workflow-generator");

      const patternMapping = mapAgenticPatterns({
        name,
        description: description || "",
        businessFunction: businessFunction || "General",
        frictionPoint: frictionPoint || ""
      });

      return res.json({
        success: true,
        patternMapping,
        summary: {
          primaryPattern: patternMapping.primaryPattern,
          secondaryPattern: patternMapping.secondaryPattern,
          hitlPattern: patternMapping.hitlPattern,
          detectedPrimitives: patternMapping.detectedPrimitives,
          detectedFunction: patternMapping.detectedFunction,
          confidenceScore: patternMapping.confidenceScore
        }
      });
    } catch (error) {
      console.error("Pattern mapping error:", error);
      return res.status(500).json({ 
        error: "Failed to map patterns",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Generate process steps for a specific use case (standalone endpoint)
  app.post("/api/process-steps", async (req, res) => {
    try {
      const { 
        description, 
        frictionPoint, 
        businessFunction = "General Operations",
        detailLevel = "standard"
      } = req.body;

      if (!description || !frictionPoint) {
        return res.status(400).json({ 
          error: "Missing required fields",
          message: "Both 'description' and 'frictionPoint' are required"
        });
      }

      const { generateProcessSteps } = await import("./workflow-generator");

      const processSteps = await generateProcessSteps({
        description,
        frictionPoint,
        businessFunction,
        detailLevel: detailLevel as "summary" | "standard" | "detailed"
      });

      return res.json({
        success: true,
        data: processSteps,
        metadata: {
          description,
          frictionPoint,
          businessFunction,
          detailLevel,
          generatedAt: new Date().toISOString(),
          currentStateStepCount: processSteps.currentStateWorkflow.length,
          targetStateStepCount: processSteps.targetStateWorkflow.length,
          aiEnabledSteps: processSteps.targetStateWorkflow.filter(s => s.isAIEnabled).length,
          hitlCheckpoints: processSteps.targetStateWorkflow.filter(s => s.isHumanInTheLoop).length
        }
      });
    } catch (error) {
      console.error("Process steps generation error:", error);
      return res.status(500).json({ 
        error: "Failed to generate process steps",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Validate workflow data quality
  app.post("/api/validate-workflow", async (req, res) => {
    try {
      const { currentStateWorkflow, targetStateWorkflow, config } = req.body;

      if (!currentStateWorkflow || !targetStateWorkflow) {
        return res.status(400).json({ 
          error: "Missing required fields",
          message: "Both 'currentStateWorkflow' and 'targetStateWorkflow' arrays are required"
        });
      }

      if (!Array.isArray(currentStateWorkflow) || !Array.isArray(targetStateWorkflow)) {
        return res.status(400).json({ 
          error: "Invalid field types",
          message: "'currentStateWorkflow' and 'targetStateWorkflow' must be arrays"
        });
      }

      const { validateWorkflowData, repairWorkflowData } = await import("./workflow-generator");

      const validationResult = validateWorkflowData(currentStateWorkflow, targetStateWorkflow, config);

      let repairResult = null;
      if (!validationResult.isValid) {
        repairResult = repairWorkflowData(currentStateWorkflow, targetStateWorkflow, config);
      }

      return res.json({
        success: true,
        validation: validationResult,
        repair: repairResult ? {
          available: true,
          repairsApplied: repairResult.repairsApplied,
          repairedWorkflows: {
            current: repairResult.current,
            target: repairResult.target
          }
        } : {
          available: false,
          message: "Workflow data is valid, no repairs needed"
        }
      });
    } catch (error) {
      console.error("Workflow validation error:", error);
      return res.status(500).json({ 
        error: "Failed to validate workflow",
        message: error instanceof Error ? error.message : "Unknown error"
      });
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

  // Export all assumption/reference data (Excel or JSON)
  app.get("/api/assumptions/export/:reportId?", async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const { reportId } = req.params;

      // Optionally load report-specific assumptions
      let reportAssumptions: any[] | undefined;
      if (reportId) {
        const activeSet = await storage.getActiveAssumptionSet(reportId);
        if (activeSet) {
          const fields = await storage.getAssumptionFieldsBySet(activeSet.id);
          reportAssumptions = fields.map((f: any) => ({
            category: f.category,
            fieldName: f.fieldName,
            displayName: f.displayName,
            value: f.value,
            valueType: f.valueType,
            unit: f.unit,
            description: f.description,
          }));
        }
      }

      if (format === "excel") {
        const workbook = buildAssumptionExcelWorkbook(reportAssumptions);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="assumptions-export.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
      } else {
        const data = buildAssumptionJSON(reportAssumptions);
        res.json(data);
      }
    } catch (error) {
      console.error("Error exporting assumptions:", error);
      return res.status(500).json({ error: "Failed to export assumptions" });
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
            const effortScore = parseFloat(row['Readiness Score'] || row['Effort Score']) || 0;
            
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
          const topUseCases = step7.data.slice(0, 12).map((row: any, index: number) => ({
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

  // Create a short URL using Dub.co
  app.post("/api/shorten", async (req, res) => {
    try {
      const { url, title } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL required" });
      }
      
      if (!dubService.isConfigured()) {
        return res.json({ shortUrl: url, isShortened: false });
      }
      
      try {
        const externalId = `url-${nanoid(8)}`;
        const dubLink = await dubService.createLink({
          url,
          externalId,
          metadata: { title: title || "BlueAlly Report" }
        });
        console.log(`Created Dub.co short link: ${dubLink.shortLink}`);
        return res.json({ 
          shortUrl: dubLink.shortLink, 
          originalUrl: url,
          isShortened: true,
          linkId: dubLink.id,
        });
      } catch (dubError) {
        console.warn("Dub.co shortening failed:", dubError);
        return res.json({ shortUrl: url, isShortened: false });
      }
    } catch (error) {
      console.error("URL shortening error:", error);
      return res.status(500).json({ error: "Failed to shorten URL" });
    }
  });

  // Create share link for dashboard with Dub.co URL shortening
  app.post("/api/share", async (req, res) => {
    try {
      const { reportData } = req.body;
      
      if (!reportData) {
        return res.status(400).json({ error: "Report data required" });
      }

      // Bake the resolved displayName into the snapshot at share-creation
      // time. Future edits to the source report's displayName will NOT
      // mutate already-shared links — that's a feature, not a bug.
      // We accept displayName from either the top level or a nested
      // analysisData.displayName, since older clients only mirror inside
      // the analysis envelope.
      try {
        const topDn = typeof reportData.displayName === "string" ? reportData.displayName.trim() : "";
        const nestedDn =
          reportData.analysisData &&
          typeof reportData.analysisData === "object" &&
          typeof (reportData.analysisData as any).displayName === "string"
            ? ((reportData.analysisData as any).displayName as string).trim()
            : "";
        const dn = topDn || nestedDn;
        if (dn) {
          reportData.displayName = dn;
          if (reportData.analysisData && typeof reportData.analysisData === "object") {
            (reportData.analysisData as any).displayName = dn;
          }
        } else {
          reportData.displayName = null;
          if (reportData.analysisData && typeof reportData.analysisData === "object") {
            (reportData.analysisData as any).displayName = null;
          }
        }
      } catch { /* best-effort */ }

      const shareId = nanoid(12);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      // Get base URL from request origin or construct from host header
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000';
      const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
      const shareUrl = `${baseUrl}/shared/${shareId}`;
      
      // Try to create Dub.co short link if API key is configured
      let dubLinkId: string | undefined;
      let shortUrl: string | undefined;
      
      if (dubService.isConfigured()) {
        try {
          const companyName = reportData.companyName || "Company";
          const dubLink = await dubService.createReportLink(shareUrl, shareId, companyName);
          dubLinkId = dubLink.id;
          shortUrl = dubLink.shortLink;
          console.log(`Created Dub.co short link: ${shortUrl} for share ${shareId}`);
        } catch (dubError) {
          console.warn("Dub.co link creation failed, using direct link:", dubError);
        }
      }
      
      await storage.createSharedDashboard({
        id: shareId,
        data: JSON.stringify(reportData),
        expiresAt,
        viewCount: 0,
        dubLinkId,
        shortUrl,
      });
      
      return res.json({ 
        shareId,
        shareUrl: shortUrl || shareUrl,
        originalUrl: shareUrl,
        shortUrl,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Share creation failed:", error);
      return res.status(500).json({ error: "Failed to create share link" });
    }
  });

  // Get shared dashboard
  app.get("/api/share/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const dashboard = await storage.getSharedDashboard(id);
      
      if (!dashboard) {
        return res.status(404).json({ error: "Dashboard not found" });
      }
      
      if (new Date(dashboard.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Dashboard link has expired" });
      }
      
      await storage.incrementSharedDashboardViewCount(id);
      
      return res.json({
        data: JSON.parse(dashboard.data),
        createdAt: dashboard.createdAt,
        expiresAt: dashboard.expiresAt,
        viewCount: dashboard.viewCount + 1,
        shortUrl: dashboard.shortUrl,
      });
    } catch (error) {
      console.error("Share retrieval failed:", error);
      return res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  // ============================================
  // CrewAI Agentic Framework API Endpoints
  // ============================================
  
  const CREWAI_SERVICE_URL = process.env.CREWAI_SERVICE_URL || 'http://localhost:5001';
  
  // Import CrewAI service manager
  const { startCrewAIService, stopCrewAIService, getServiceStatus } = await import("./crewai-manager");
  
  // Start CrewAI service
  app.post("/api/crewai/start", async (req, res) => {
    const result = await startCrewAIService();
    return res.json(result);
  });
  
  // Stop CrewAI service
  app.post("/api/crewai/stop", async (req, res) => {
    const result = stopCrewAIService();
    return res.json(result);
  });
  
  // Get service status
  app.get("/api/crewai/status", async (req, res) => {
    const status = getServiceStatus();
    return res.json(status);
  });
  
  // CrewAI health check
  app.get("/api/crewai/health", async (req, res) => {
    try {
      const response = await fetch(`${CREWAI_SERVICE_URL}/health`);
      const data = await response.json();
      return res.json(data);
    } catch (error: any) {
      return res.json({
        status: "unavailable",
        error: error.message,
        serviceUrl: CREWAI_SERVICE_URL,
      });
    }
  });
  
  // Helper function to proxy requests with proper error handling
  async function proxyCrewAIRequest(
    url: string, 
    options?: RequestInit
  ): Promise<{ ok: boolean; status: number; data: any }> {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    } catch (error: any) {
      const isConnectionError = error.code === "ECONNREFUSED" || 
        error.message?.includes("fetch failed") ||
        error.message?.includes("ECONNREFUSED");
      
      return {
        ok: false,
        status: isConnectionError ? 503 : 500,
        data: {
          success: false,
          error: isConnectionError 
            ? "CrewAI service is not running. Click 'Start Service' to begin."
            : `Service error: ${error.message}`,
          code: isConnectionError ? "SERVICE_UNAVAILABLE" : "SERVICE_ERROR",
        },
      };
    }
  }

  // List available agents
  app.get("/api/crewai/agents", async (req, res) => {
    const result = await proxyCrewAIRequest(`${CREWAI_SERVICE_URL}/agents`);
    return res.status(result.status).json(result.data);
  });
  
  // List available tasks
  app.get("/api/crewai/tasks", async (req, res) => {
    const result = await proxyCrewAIRequest(`${CREWAI_SERVICE_URL}/tasks`);
    return res.status(result.status).json(result.data);
  });
  
  // List available crews
  app.get("/api/crewai/crews", async (req, res) => {
    const result = await proxyCrewAIRequest(`${CREWAI_SERVICE_URL}/crews`);
    return res.status(result.status).json(result.data);
  });
  
  // Run a crew
  app.post("/api/crewai/run", async (req, res) => {
    const result = await proxyCrewAIRequest(`${CREWAI_SERVICE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    return res.status(result.status).json(result.data);
  });
  
  // Get execution history
  app.get("/api/crewai/history", async (req, res) => {
    const limit = req.query.limit || 10;
    const result = await proxyCrewAIRequest(`${CREWAI_SERVICE_URL}/history?limit=${limit}`);
    return res.status(result.status).json(result.data);
  });
  
  // Get specific execution
  app.get("/api/crewai/history/:executionId", async (req, res) => {
    const { executionId } = req.params;
    const result = await proxyCrewAIRequest(`${CREWAI_SERVICE_URL}/history/${executionId}`);
    return res.status(result.status).json(result.data);
  });

  // ==========================================
  // ASSUMPTIONS MANAGEMENT ENDPOINTS
  // ==========================================

  // GET /api/assumptions/:reportId - Get all assumptions for a report
  app.get("/api/assumptions/:reportId", async (req, res) => {
    try {
      const { reportId } = req.params;

      // Verify report exists
      const report = await storage.getReportById(reportId);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Get all assumption sets for this report
      const assumptionSets = await storage.getAssumptionSetsByReport(reportId);

      // Get the active assumption set
      const activeSet = await storage.getActiveAssumptionSet(reportId);

      // Get all fields for each set
      const setsWithFields = await Promise.all(
        assumptionSets.map(async (set) => {
          const fields = await storage.getAssumptionFieldsBySet(set.id);
          return {
            ...set,
            fields,
          };
        })
      );

      res.json({
        reportId,
        companyName: report.companyName,
        activeSetId: activeSet?.id || null,
        assumptionSets: setsWithFields,
        totalSets: assumptionSets.length,
        totalFields: setsWithFields.reduce((acc, set) => acc + set.fields.length, 0),
      });
    } catch (error: any) {
      console.error("Error fetching assumptions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch assumptions" });
    }
  });

  // PUT /api/assumptions/:assumptionId - Update a single assumption value
  app.put("/api/assumptions/:assumptionId", async (req, res) => {
    try {
      const { assumptionId } = req.params;
      const { value, source, sourceUrl, description, isLocked } = req.body;

      // Validate that at least one field is being updated
      if (value === undefined && source === undefined && sourceUrl === undefined && 
          description === undefined && isLocked === undefined) {
        return res.status(400).json({ 
          error: "At least one field must be provided for update (value, source, sourceUrl, description, isLocked)" 
        });
      }

      // Build update object with only provided fields
      const updateData: Record<string, any> = {};
      if (value !== undefined) updateData.value = String(value);
      if (source !== undefined) updateData.source = source;
      if (sourceUrl !== undefined) updateData.sourceUrl = sourceUrl;
      if (description !== undefined) updateData.description = description;
      if (isLocked !== undefined) updateData.isLocked = isLocked;

      const updatedField = await storage.updateAssumptionField(assumptionId, updateData);

      if (!updatedField) {
        return res.status(404).json({ error: "Assumption field not found" });
      }

      res.json({
        success: true,
        field: updatedField,
        message: "Assumption updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating assumption:", error);
      res.status(500).json({ error: error.message || "Failed to update assumption" });
    }
  });

  // POST /api/reports/:id/recalculate - Recalculate all derived values using the formula registry
  app.post("/api/reports/:id/recalculate", async (req, res) => {
    try {
      const { id: reportId } = req.params;

      // Load the report
      const report = await storage.getReportById(reportId);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Get the active assumption set
      const activeSet = await storage.getActiveAssumptionSet(reportId);
      if (!activeSet) {
        return res.status(400).json({ 
          error: "No active assumption set found for this report. Please create or activate an assumption set first." 
        });
      }

      // Get all assumption fields for the active set
      const assumptionFields = await storage.getAssumptionFieldsBySet(activeSet.id);

      // Build a lookup map for assumption values
      const assumptions: Record<string, number | string> = {};
      for (const field of assumptionFields) {
        // Try to parse as number, fallback to string
        const numValue = parseFloat(field.value);
        assumptions[field.fieldName] = isNaN(numValue) ? field.value : numValue;
      }

      // Import formula functions dynamically
      const formulas = await import("../src/calc/formulas");

      // Extract key values from assumptions with defaults
      const getNum = (key: string, defaultVal: number = 0): number => {
        const val = assumptions[key];
        return typeof val === "number" ? val : defaultVal;
      };

      // Calculate benefits using the formula registry (SPEC COMPLIANT: Section 3.2 & 3.3)
      const calculationResults: Record<string, any> = {};
      const traces: Record<string, any> = {};

      // SPEC 3.3: Required global assumptions
      const hoursSaved = getNum("hours_saved_annually", 10000);
      const loadedHourlyRate = getNum("loaded_hourly_rate", formulas.DEFAULT_MULTIPLIERS.loadedHourlyRate);
      const costRealizationMultiplier = getNum("cost_realization", formulas.DEFAULT_MULTIPLIERS.costRealizationMultiplier);
      const dataMaturityMultiplier = getNum("data_maturity", formulas.DEFAULT_MULTIPLIERS.dataMaturityMultiplier);

      // SPEC 3.2: CostBenefit = HoursSaved × LoadedRate × BenefitsLoading × Realization × DataMaturity × Scenario
      const costBenefitResult = formulas.calculateCostBenefit({
        hoursSaved,
        loadedHourlyRate,
        costRealizationMultiplier,
        dataMaturityMultiplier,
      });
      calculationResults.costBenefit = costBenefitResult.value;
      traces.costBenefit = costBenefitResult.trace;

      // SPEC 3.2: RevenueBenefit = UpliftPct × BaselineRevenueAtRisk × MarginPct × Realization × DataMaturity
      const upliftPct = getNum("revenue_uplift_pct", 0.05);
      const baselineRevenueAtRisk = getNum("annual_revenue", 100000000);
      const marginPct = getNum("gross_margin_pct", 1.0);
      const revenueRealizationMultiplier = getNum("revenue_realization", formulas.DEFAULT_MULTIPLIERS.revenueRealizationMultiplier);

      const revenueBenefitResult = formulas.calculateRevenueBenefit({
        upliftPct,
        baselineRevenueAtRisk,
        marginPct,
        revenueRealizationMultiplier,
        dataMaturityMultiplier,
      });
      calculationResults.revenueBenefit = revenueBenefitResult.value;
      traces.revenueBenefit = revenueBenefitResult.trace;

      // SPEC 3.2: CashFlowBenefit = AnnualRevenue × (DaysImprovement / 365) × CostOfCapital × Realization × DataMaturity
      const daysImprovement = getNum("dso_improvement_days", 5);
      const annualRevenue = baselineRevenueAtRisk; // Use full annual revenue for working capital calculation
      const costOfCapital = getNum("cost_of_capital", formulas.DEFAULT_MULTIPLIERS.defaultCostOfCapital);
      const cashFlowRealizationMultiplier = getNum("cashflow_realization", formulas.DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier);

      const cashFlowBenefitResult = formulas.calculateCashFlowBenefit({
        daysImprovement,
        annualRevenue,
        costOfCapital,
        cashFlowRealizationMultiplier,
        dataMaturityMultiplier,
      });
      calculationResults.cashFlowBenefit = cashFlowBenefitResult.value;
      traces.cashFlowBenefit = cashFlowBenefitResult.trace;

      // SPEC 3.2: RiskBenefit = (ProbBefore × ImpactBefore - ProbAfter × ImpactAfter) × Realization × DataMaturity
      const probBefore = getNum("risk_prob_before", 0.15);
      const impactBefore = getNum("risk_impact_before", 5000000);
      const probAfter = getNum("risk_prob_after", 0.05);
      const impactAfter = getNum("risk_impact_after", 2000000);
      const riskRealizationMultiplier = getNum("risk_realization", formulas.DEFAULT_MULTIPLIERS.riskRealizationMultiplier);

      const riskBenefitResult = formulas.calculateRiskBenefit({
        probBefore,
        impactBefore,
        probAfter,
        impactAfter,
        riskRealizationMultiplier,
        dataMaturityMultiplier,
      });
      calculationResults.riskBenefit = riskBenefitResult.value;
      traces.riskBenefit = riskBenefitResult.trace;

      // Calculate total annual value (with revenue cap)
      const totalAnnualValueResult = formulas.calculateTotalAnnualValue({
        costBenefit: calculationResults.costBenefit,
        revenueBenefit: calculationResults.revenueBenefit,
        cashFlowBenefit: calculationResults.cashFlowBenefit,
        riskBenefit: calculationResults.riskBenefit,
        annualRevenue: baselineRevenueAtRisk,
      });
      calculationResults.totalAnnualValue = totalAnnualValueResult.value;
      traces.totalAnnualValue = totalAnnualValueResult.trace;

      // Calculate token costs (if applicable)
      const runsPerMonth = getNum("runs_per_month", 1000);
      const inputTokensPerRun = getNum("input_tokens_per_run", 2000);
      const outputTokensPerRun = getNum("output_tokens_per_run", 500);
      const inputTokenPricePerM = getNum("input_token_price_per_m", formulas.DEFAULT_MULTIPLIERS.inputTokenPricePerM);
      const outputTokenPricePerM = getNum("output_token_price_per_m", formulas.DEFAULT_MULTIPLIERS.outputTokenPricePerM);

      const tokenCostResult = formulas.calculateTokenCost({
        runsPerMonth,
        inputTokensPerRun,
        outputTokensPerRun,
        inputTokenPricePerM,
        outputTokenPricePerM,
      });
      // Calculate net value
      calculationResults.netAnnualValue = calculationResults.totalAnnualValue;

      // Calculate priority score
      const timeToValueMonths = getNum("time_to_value_months", 6);
      const dataReadiness = getNum("data_readiness", 3);
      const integrationComplexity = getNum("integration_complexity", 3);
      const changeMgmt = getNum("change_mgmt_complexity", 3);

      const priorityScoreResult = formulas.calculatePriorityScore({
        totalAnnualValue: calculationResults.totalAnnualValue,
        timeToValueMonths,
        dataReadiness,
        integrationComplexity,
        changeMgmt,
      });
      calculationResults.priorityScore = priorityScoreResult.value;
      calculationResults.priorityTier = formulas.getPriorityTier(priorityScoreResult.value);
      calculationResults.recommendedPhase = formulas.getRecommendedPhase(priorityScoreResult.value, timeToValueMonths);
      traces.priorityScore = priorityScoreResult.trace;

      // Update the report's analysisData with calculated values
      const analysisData = report.analysisData as any || {};
      
      // Merge calculated results into analysisData
      const updatedAnalysisData = {
        ...analysisData,
        calculatedAt: new Date().toISOString(),
        assumptionSetId: activeSet.id,
        assumptionSetName: activeSet.name,
        calculations: calculationResults,
        formulaTraces: traces,
        summary: {
          ...analysisData.summary,
          totalAnnualValue: calculationResults.totalAnnualValue,
          netAnnualValue: calculationResults.netAnnualValue,
          costBenefit: calculationResults.costBenefit,
          revenueBenefit: calculationResults.revenueBenefit,
          cashFlowBenefit: calculationResults.cashFlowBenefit,
          riskBenefit: calculationResults.riskBenefit,
          priorityScore: calculationResults.priorityScore,
          priorityTier: calculationResults.priorityTier,
          recommendedPhase: calculationResults.recommendedPhase,
        },
      };

      // Update the report in the database
      const updatedReport = await storage.updateReport(reportId, {
        analysisData: updatedAnalysisData,
      });

      res.json({
        success: true,
        reportId,
        companyName: report.companyName,
        assumptionSetUsed: {
          id: activeSet.id,
          name: activeSet.name,
        },
        calculations: calculationResults,
        formulaTraces: traces,
        formattedSummary: {
          totalAnnualValue: formulas.formatMoney(calculationResults.totalAnnualValue),
          netAnnualValue: formulas.formatMoney(calculationResults.netAnnualValue),
          costBenefit: formulas.formatMoney(calculationResults.costBenefit),
          revenueBenefit: formulas.formatMoney(calculationResults.revenueBenefit),
          cashFlowBenefit: formulas.formatMoney(calculationResults.cashFlowBenefit),
          riskBenefit: formulas.formatMoney(calculationResults.riskBenefit),
          priorityScore: calculationResults.priorityScore,
          priorityTier: calculationResults.priorityTier,
          recommendedPhase: calculationResults.recommendedPhase,
        },
        message: "Recalculation completed successfully",
      });
    } catch (error: any) {
      console.error("Error recalculating report:", error);
      res.status(500).json({ 
        error: error.message || "Failed to recalculate report",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  });

  // =============================================
  // BULK UPDATE API ENDPOINTS
  // =============================================

  // Processing function for bulk updates (non-blocking)
  async function processBulkUpdate(jobId: string, reportIds: string[]) {
    console.log(`[bulk-update] Starting job ${jobId} with ${reportIds.length} reports`);
    
    try {
      // Update job status to in_progress
      await storage.updateBulkUpdateJob(jobId, {
        status: "in_progress",
        startedAt: new Date(),
      });

      const completedCompanies: Array<{ id: string; name: string; status: string }> = [];
      const failedCompanies: Array<{ id: string; name: string; error: string }> = [];

      for (let i = 0; i < reportIds.length; i++) {
        const reportId = reportIds[i];
        
        // Check if job was cancelled
        const currentJob = await storage.getBulkUpdateJob(jobId);
        if (currentJob?.status === "cancelled") {
          console.log(`[bulk-update] Job ${jobId} was cancelled, stopping processing`);
          break;
        }

        // Get the report
        const report = await storage.getReportById(reportId);
        if (!report) {
          failedCompanies.push({ id: reportId, name: "Unknown", error: "Report not found" });
          continue;
        }

        const companyName = report.companyName;
        console.log(`[bulk-update] Processing ${i + 1}/${reportIds.length}: ${companyName}`);

        // Update current company being processed
        await storage.updateBulkUpdateJob(jobId, {
          currentCompanyId: reportId,
          progress: Math.round((i / reportIds.length) * 100),
          completedCompanies,
          failedCompanies,
        });

        try {
          // Generate new analysis
          const analysis = await generateCompanyAnalysis(companyName);
          
          // Update the report with new analysis
          await storage.updateReport(reportId, {
            analysisData: analysis,
          });

          completedCompanies.push({ id: reportId, name: companyName, status: "updated" });
          console.log(`[bulk-update] Successfully updated ${companyName}`);
        } catch (error: any) {
          console.error(`[bulk-update] Error updating ${companyName}:`, error?.message);
          failedCompanies.push({ 
            id: reportId, 
            name: companyName, 
            error: error?.message || "Unknown error" 
          });
        }

        // Update progress after each company
        await storage.updateBulkUpdateJob(jobId, {
          progress: Math.round(((i + 1) / reportIds.length) * 100),
          completedCompanies,
          failedCompanies,
        });
      }

      // Check final status (may have been cancelled)
      const finalJob = await storage.getBulkUpdateJob(jobId);
      if (finalJob?.status !== "cancelled") {
        // Determine final status
        const finalStatus = failedCompanies.length === reportIds.length 
          ? "failed" 
          : "completed";

        await storage.updateBulkUpdateJob(jobId, {
          status: finalStatus,
          progress: 100,
          currentCompanyId: null,
          completedCompanies,
          failedCompanies,
          completedAt: new Date(),
        });

        console.log(`[bulk-update] Job ${jobId} finished with status: ${finalStatus}`);
      }
    } catch (error: any) {
      console.error(`[bulk-update] Job ${jobId} failed with error:`, error?.message);
      await storage.updateBulkUpdateJob(jobId, {
        status: "failed",
        completedAt: new Date(),
      });
    }
  }

  // POST /api/bulk-update/start - Initiate bulk update job
  app.post("/api/bulk-update/start", async (req, res) => {
    try {
      const { reportIds } = req.body;

      if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({ error: "reportIds array is required" });
      }

      // Check AI service configuration
      const configCheck = checkProductionConfig();
      if (!configCheck.ok) {
        return res.status(503).json({ error: configCheck.message });
      }

      // Create the bulk update job
      const job = await storage.createBulkUpdateJob({
        companyIds: reportIds,
        status: "pending",
        progress: 0,
        completedCompanies: [],
        failedCompanies: [],
      });

      // Estimate time (roughly 30-60 seconds per report)
      const estimatedTime = reportIds.length * 45; // seconds

      // Start processing asynchronously (non-blocking)
      setImmediate(() => {
        processBulkUpdate(job.id, reportIds);
      });

      res.json({
        jobId: job.id,
        estimatedTime,
        totalReports: reportIds.length,
        message: "Bulk update job started",
      });
    } catch (error: any) {
      console.error("Error starting bulk update:", error);
      res.status(500).json({ error: error.message || "Failed to start bulk update" });
    }
  });

  // GET /api/bulk-update/status/:jobId - Check job progress
  app.get("/api/bulk-update/status/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const job = await storage.getBulkUpdateJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error: any) {
      console.error("Error getting bulk update status:", error);
      res.status(500).json({ error: error.message || "Failed to get job status" });
    }
  });

  // POST /api/bulk-update/cancel/:jobId - Cancel running job
  app.post("/api/bulk-update/cancel/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      
      const job = await storage.getBulkUpdateJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "pending" && job.status !== "in_progress") {
        return res.status(400).json({ 
          error: "Cannot cancel job", 
          reason: `Job is already ${job.status}` 
        });
      }

      await storage.updateBulkUpdateJob(jobId, {
        status: "cancelled",
        completedAt: new Date(),
      });

      res.json({ success: true, message: "Job cancelled" });
    } catch (error: any) {
      console.error("Error cancelling bulk update:", error);
      res.status(500).json({ error: error.message || "Failed to cancel job" });
    }
  });

  // GET /api/bulk-update/active - Get active jobs
  app.get("/api/bulk-update/active", async (req, res) => {
    try {
      const activeJobs = await storage.getActiveBulkUpdateJobs();
      res.json(activeJobs);
    } catch (error: any) {
      console.error("Error getting active bulk updates:", error);
      res.status(500).json({ error: error.message || "Failed to get active jobs" });
    }
  });

  // GET /api/bulk-update/history - List recent bulk update jobs
  app.get("/api/bulk-update/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await storage.getBulkUpdateHistory(limit);
      res.json(history);
    } catch (error: any) {
      console.error("Error getting bulk update history:", error);
      res.status(500).json({ error: error.message || "Failed to get job history" });
    }
  });

  // ============================================================
  // BULK EXPORT ENDPOINTS
  // ============================================================

  const EXPORTS_DIR = "/tmp/exports";
  
  // Ensure exports directory exists
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }

  // Process bulk export job asynchronously
  async function processBulkExport(jobId: string): Promise<void> {
    try {
      const job = await storage.getBulkExport(jobId);
      if (!job) {
        console.error(`[bulk-export] Job ${jobId} not found`);
        return;
      }

      const reportIds = job.companyIds as string[];
      const format = job.format;
      const reportType = job.reportType;

      // Update status to generating
      await storage.updateBulkExport(jobId, {
        status: "generating",
      });

      console.log(`[bulk-export] Starting job ${jobId} with ${reportIds.length} reports, format: ${format}`);

      const completedCompanies: Array<{ id: string; name: string; filename: string }> = [];
      const failedCompanies: Array<{ id: string; name: string; error: string }> = [];
      const exportFiles: Array<{ filename: string; content: string }> = [];

      for (let i = 0; i < reportIds.length; i++) {
        // Check if job was cancelled
        const currentJob = await storage.getBulkExport(jobId);
        if (currentJob?.status === "cancelled") {
          console.log(`[bulk-export] Job ${jobId} was cancelled, stopping processing`);
          return;
        }

        const reportId = reportIds[i];
        try {
          const report = await storage.getReportById(reportId);
          if (!report) {
            failedCompanies.push({ id: reportId, name: "Unknown", error: "Report not found" });
            continue;
          }

          const companyName = report.companyName;
          console.log(`[bulk-export] Processing ${i + 1}/${reportIds.length}: ${companyName}`);

          // Generate export content based on format
          let filename: string;
          let content: string;
          const safeCompanyName = companyName.replace(/[^a-zA-Z0-9]/g, "_");

          // Pure pass-through formatters (server/export-formatters.ts).
          // Calculation-determinism gate: these MUST NOT recompute or
          // round numbers — they emit the canonical analysisData verbatim.
          const exportCtx = { reportType, exportedAt: new Date().toISOString() };
          switch (format) {
            case "json":
              filename = `${safeCompanyName}_${reportType}.json`;
              content = JSON.stringify(
                formatReportAsJson(report, exportCtx),
                null,
                2,
              );
              break;
            case "md":
              filename = `${safeCompanyName}_${reportType}.md`;
              content = formatReportAsMarkdown(report, exportCtx);
              break;
            case "pdf":
              filename = `${safeCompanyName}_${reportType}.txt`;
              content = `[PDF Export Placeholder]\n\nCompany: ${companyName}\nReport Type: ${reportType}\nExported: ${new Date().toISOString()}\n\nNote: Actual PDF generation will be implemented in a future update.`;
              break;
            case "docx":
              filename = `${safeCompanyName}_${reportType}.txt`;
              content = `[DOCX Export Placeholder]\n\nCompany: ${companyName}\nReport Type: ${reportType}\nExported: ${new Date().toISOString()}\n\nNote: Actual DOCX generation will be implemented in a future update.`;
              break;
            case "xlsx":
              filename = `${safeCompanyName}_${reportType}.txt`;
              content = `[XLSX Export Placeholder]\n\nCompany: ${companyName}\nReport Type: ${reportType}\nExported: ${new Date().toISOString()}\n\nNote: Actual XLSX generation will be implemented in a future update.`;
              break;
            default:
              filename = `${safeCompanyName}_${reportType}.json`;
              content = JSON.stringify(report.analysisData, null, 2);
          }

          exportFiles.push({ filename, content });
          completedCompanies.push({ id: reportId, name: companyName, filename });

          // Update progress
          const progress = Math.round(((i + 1) / reportIds.length) * 90); // Reserve 10% for ZIP creation
          await storage.updateBulkExport(jobId, {
            progress,
            completedCompanies,
            failedCompanies,
          });

        } catch (error: any) {
          console.error(`[bulk-export] Error processing report ${reportId}:`, error?.message);
          failedCompanies.push({ id: reportId, name: "Unknown", error: error?.message || "Unknown error" });
        }
      }

      // Create ZIP file
      const zipPath = path.join(EXPORTS_DIR, `${jobId}.zip`);
      
      // Create manifest object before ZIP creation
      const manifestData = {
        exportId: jobId,
        exportedAt: new Date().toISOString(),
        format: format,
        reportType: reportType,
        totalReports: reportIds.length,
        successfulExports: completedCompanies.length,
        failedExports: failedCompanies.length,
        files: completedCompanies.map(c => c.filename),
        failed: failedCompanies,
      };
      
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
          console.log(`[bulk-export] ZIP created: ${archive.pointer()} bytes`);
          resolve();
        });

        archive.on("error", (err) => {
          console.error(`[bulk-export] Archive error:`, err);
          reject(err);
        });

        archive.pipe(output);

        // Add all export files
        for (const file of exportFiles) {
          archive.append(file.content, { name: file.filename });
        }

        // Add manifest to ZIP
        archive.append(JSON.stringify(manifestData, null, 2), { name: "manifest.json" });

        archive.finalize();
      });

      // Get file size
      const stats = fs.statSync(zipPath);
      const fileSize = stats.size;

      // Calculate expiration (24 hours from now)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Update job with final status
      await storage.updateBulkExport(jobId, {
        status: "ready",
        progress: 100,
        filePath: zipPath,
        fileSize,
        expiresAt,
        completedCompanies,
        failedCompanies,
        manifest: manifestData,
      });

      console.log(`[bulk-export] Job ${jobId} completed successfully`);

    } catch (error: any) {
      console.error(`[bulk-export] Job ${jobId} failed:`, error?.message);
      await storage.updateBulkExport(jobId, {
        status: "failed",
        failedCompanies: [{ id: "system", name: "System Error", error: error?.message || "Unknown error" }],
      });
    }
  }

  // POST /api/bulk-export/start - Initiate bulk export job
  app.post("/api/bulk-export/start", async (req, res) => {
    try {
      const { reportIds, format, reportType } = req.body;

      // Validate reportIds
      if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({ error: "reportIds must be a non-empty array" });
      }

      if (reportIds.length > 100) {
        return res.status(400).json({ error: "Maximum 100 reports per export job" });
      }

      // Validate format
      const validFormats = ["pdf", "docx", "xlsx", "md", "json"];
      if (!format || !validFormats.includes(format)) {
        return res.status(400).json({ error: `Invalid format. Must be one of: ${validFormats.join(", ")}` });
      }

      // Validate reportType
      if (!reportType || typeof reportType !== "string") {
        return res.status(400).json({ error: "reportType is required" });
      }

      // Create job in storage
      const job = await storage.createBulkExport({
        companyIds: reportIds,
        format,
        reportType,
        status: "pending",
        progress: 0,
        completedCompanies: [],
        failedCompanies: [],
      });

      // Estimate time (roughly 2 seconds per report + 5 seconds for ZIP)
      const estimatedTime = reportIds.length * 2 + 5;

      // Start processing asynchronously
      setImmediate(() => processBulkExport(job.id));

      res.json({
        jobId: job.id,
        totalReports: reportIds.length,
        estimatedTime,
      });

    } catch (error: any) {
      console.error("Error starting bulk export:", error);
      res.status(500).json({ error: error.message || "Failed to start export job" });
    }
  });

  // GET /api/bulk-export/status/:jobId - Check export progress
  app.get("/api/bulk-export/status/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBulkExport(jobId);

      if (!job) {
        return res.status(404).json({ error: "Export job not found" });
      }

      res.json(job);
    } catch (error: any) {
      console.error("Error getting bulk export status:", error);
      res.status(500).json({ error: error.message || "Failed to get job status" });
    }
  });

  // GET /api/bulk-export/download/:jobId - Download zip file
  app.get("/api/bulk-export/download/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBulkExport(jobId);

      if (!job) {
        return res.status(404).json({ error: "Export job not found" });
      }

      if (job.status !== "ready") {
        return res.status(400).json({ error: `Export is not ready. Current status: ${job.status}` });
      }

      if (!job.filePath || !fs.existsSync(job.filePath)) {
        return res.status(404).json({ error: "Export file not found" });
      }

      // Check if expired
      if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Export has expired" });
      }

      // Set headers for download
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="export_${jobId}.zip"`);
      res.setHeader("Content-Length", job.fileSize || 0);

      // Stream the file
      const fileStream = fs.createReadStream(job.filePath);
      fileStream.pipe(res);

    } catch (error: any) {
      console.error("Error downloading bulk export:", error);
      res.status(500).json({ error: error.message || "Failed to download export" });
    }
  });

  // POST /api/bulk-export/cancel/:jobId - Cancel export
  app.post("/api/bulk-export/cancel/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBulkExport(jobId);

      if (!job) {
        return res.status(404).json({ error: "Export job not found" });
      }

      // Check if job is cancellable
      const cancellableStatuses = ["pending", "generating"];
      if (!cancellableStatuses.includes(job.status)) {
        return res.status(400).json({ error: `Cannot cancel job with status: ${job.status}` });
      }

      // Update status to cancelled
      await storage.updateBulkExport(jobId, {
        status: "cancelled",
      });

      res.json({ success: true, message: "Export job cancelled" });

    } catch (error: any) {
      console.error("Error cancelling bulk export:", error);
      res.status(500).json({ error: error.message || "Failed to cancel export" });
    }
  });

  // GET /api/bulk-export/active - Get active export jobs
  app.get("/api/bulk-export/active", async (req, res) => {
    try {
      const activeJobs = await storage.getActiveBulkExports();
      res.json(activeJobs);
    } catch (error: any) {
      console.error("Error getting active bulk exports:", error);
      res.status(500).json({ error: error.message || "Failed to get active exports" });
    }
  });

  // GET /api/bulk-export/history - List export history
  app.get("/api/bulk-export/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await storage.getBulkExportHistory(limit);
      res.json(history);
    } catch (error: any) {
      console.error("Error getting bulk export history:", error);
      res.status(500).json({ error: error.message || "Failed to get export history" });
    }
  });

  // ============================================
  // BATCH RESEARCH ENDPOINTS
  // ============================================

  async function processBatchResearch(jobId: string) {
    const BATCH_SIZE = 3;
    const COOLDOWN_BETWEEN_BATCHES = 2000;

    let job = await storage.getBatchResearchJob(jobId);
    if (!job || job.status === 'cancelled' || job.status === 'paused') return;

    await storage.updateBatchResearchJob(jobId, { status: 'processing', startedAt: new Date() });

    while (true) {
      job = await storage.getBatchResearchJob(jobId);
      if (!job || job.status === 'cancelled' || job.status === 'paused') break;

      const pending = job.pendingQueue as any[];
      const completed = job.completedQueue as any[];
      const failed = job.failedQueue as any[];

      if (pending.length === 0) break;

      const batch = pending.slice(0, BATCH_SIZE);
      const remaining = pending.slice(BATCH_SIZE);

      await storage.updateBatchResearchJob(jobId, { 
        pendingQueue: remaining,
        activeQueue: batch 
      });

      const results = await Promise.allSettled(
        batch.map(async (company: any) => {
          const startTime = Date.now();
          try {
            const analysis = await generateCompanyAnalysis(company.name);
            const report = await storage.createReport({
              companyName: company.name,
              analysisData: analysis,
              isWhatIf: false
            });
            return { success: true, name: company.name, reportId: report.id, duration: Math.round((Date.now() - startTime) / 1000) };
          } catch (error: any) {
            return { success: false, name: company.name, error: error.message, duration: Math.round((Date.now() - startTime) / 1000) };
          }
        })
      );

      const newCompleted = [...completed];
      const newFailed = [...failed];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const r = result.value;
          if (r.success) {
            newCompleted.push({ name: r.name, reportId: r.reportId, duration: r.duration });
          } else {
            newFailed.push({ name: r.name, error: r.error, attempts: 1, willRetry: false });
          }
        }
      }

      const progress = Math.round((newCompleted.length / job.totalCompanies) * 100);

      await storage.updateBatchResearchJob(jobId, {
        completedQueue: newCompleted,
        failedQueue: newFailed,
        activeQueue: [],
        progress
      });

      await new Promise(r => setTimeout(r, COOLDOWN_BETWEEN_BATCHES));
    }

    await storage.updateBatchResearchJob(jobId, {
      status: 'completed',
      completedAt: new Date()
    });
  }

  // POST /api/batch-research/start - Start a batch research job
  app.post("/api/batch-research/start", async (req, res) => {
    try {
      const { companies, config = {} } = req.body;

      if (!companies || !Array.isArray(companies)) {
        return res.status(400).json({ error: "companies array is required" });
      }

      if (companies.length > 100) {
        return res.status(400).json({ error: "Maximum 100 companies allowed per batch" });
      }

      if (companies.length === 0) {
        return res.status(400).json({ error: "At least one company is required" });
      }

      const normalizeCompanyName = (name: string): string => {
        return name.toLowerCase().trim().replace(/\s+/g, ' ');
      };

      const seenNames = new Set<string>();
      const duplicatesRemoved: string[] = [];
      const normalizedCompanies: Array<{name: string, normalizedName: string, group?: string, priority?: number}> = [];

      for (const company of companies) {
        if (!company.name || typeof company.name !== 'string') continue;
        
        const normalizedName = normalizeCompanyName(company.name);
        if (seenNames.has(normalizedName)) {
          duplicatesRemoved.push(company.name);
        } else {
          seenNames.add(normalizedName);
          normalizedCompanies.push({
            name: company.name.trim(),
            normalizedName,
            group: company.group,
            priority: company.priority
          });
        }
      }

      const existingReports: Array<{name: string, reportId: string}> = [];
      const pendingCompanies: Array<{name: string, group?: string, priority?: number}> = [];
      const skipExisting = config.skipExisting !== false;

      if (skipExisting) {
        const allReports = await storage.getAllReports();
        const reportsByNormalizedName = new Map<string, {id: string, companyName: string}>();
        
        for (const report of allReports) {
          if (!report.isWhatIf) {
            const normalized = normalizeCompanyName(report.companyName);
            reportsByNormalizedName.set(normalized, { id: report.id, companyName: report.companyName });
          }
        }

        for (const company of normalizedCompanies) {
          const existing = reportsByNormalizedName.get(company.normalizedName);
          if (existing) {
            existingReports.push({ name: company.name, reportId: existing.id });
          } else {
            pendingCompanies.push({ name: company.name, group: company.group, priority: company.priority });
          }
        }
      } else {
        for (const company of normalizedCompanies) {
          pendingCompanies.push({ name: company.name, group: company.group, priority: company.priority });
        }
      }

      if (pendingCompanies.length === 0) {
        return res.json({
          jobId: null,
          totalCompanies: 0,
          duplicatesRemoved: duplicatesRemoved.length,
          existingReports,
          estimatedTime: 0,
          message: "All companies already have existing reports"
        });
      }

      const batchSize = config.batchSize || 3;
      const estimatedTimePerCompany = 60;
      const estimatedTime = Math.ceil(pendingCompanies.length / batchSize) * estimatedTimePerCompany;

      const job = await storage.createBatchResearchJob({
        status: 'pending',
        config: { batchSize, skipExisting },
        pendingQueue: pendingCompanies,
        activeQueue: [],
        completedQueue: [],
        failedQueue: [],
        retryQueue: [],
        totalCompanies: pendingCompanies.length,
        progress: 0,
        duplicatesRemoved,
        existingReports
      });

      setImmediate(() => {
        processBatchResearch(job.id).catch(err => {
          console.error(`[batch-research] Error processing job ${job.id}:`, err);
        });
      });

      res.json({
        jobId: job.id,
        totalCompanies: pendingCompanies.length,
        duplicatesRemoved: duplicatesRemoved.length,
        existingReports,
        estimatedTime
      });
    } catch (error: any) {
      console.error("Error starting batch research job:", error);
      res.status(500).json({ error: error.message || "Failed to start batch research" });
    }
  });

  // GET /api/batch-research/status/:jobId - Get job status
  app.get("/api/batch-research/status/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBatchResearchJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(job);
    } catch (error: any) {
      console.error("Error getting batch research status:", error);
      res.status(500).json({ error: error.message || "Failed to get job status" });
    }
  });

  // POST /api/batch-research/pause/:jobId - Pause processing
  app.post("/api/batch-research/pause/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBatchResearchJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (job.status !== 'processing' && job.status !== 'pending') {
        return res.status(400).json({ error: `Cannot pause job with status: ${job.status}` });
      }
      
      await storage.updateBatchResearchJob(jobId, { status: 'paused' });
      const updatedJob = await storage.getBatchResearchJob(jobId);
      
      res.json(updatedJob);
    } catch (error: any) {
      console.error("Error pausing batch research job:", error);
      res.status(500).json({ error: error.message || "Failed to pause job" });
    }
  });

  // POST /api/batch-research/resume/:jobId - Resume processing
  app.post("/api/batch-research/resume/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBatchResearchJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (job.status !== 'paused') {
        return res.status(400).json({ error: `Cannot resume job with status: ${job.status}` });
      }
      
      await storage.updateBatchResearchJob(jobId, { status: 'processing' });
      
      setImmediate(() => {
        processBatchResearch(jobId).catch(err => {
          console.error(`[batch-research] Error resuming job ${jobId}:`, err);
        });
      });
      
      const updatedJob = await storage.getBatchResearchJob(jobId);
      res.json(updatedJob);
    } catch (error: any) {
      console.error("Error resuming batch research job:", error);
      res.status(500).json({ error: error.message || "Failed to resume job" });
    }
  });

  // POST /api/batch-research/cancel/:jobId - Cancel job
  app.post("/api/batch-research/cancel/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getBatchResearchJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (job.status === 'completed' || job.status === 'cancelled') {
        return res.status(400).json({ error: `Cannot cancel job with status: ${job.status}` });
      }
      
      await storage.updateBatchResearchJob(jobId, { status: 'cancelled' });
      const updatedJob = await storage.getBatchResearchJob(jobId);
      
      res.json(updatedJob);
    } catch (error: any) {
      console.error("Error cancelling batch research job:", error);
      res.status(500).json({ error: error.message || "Failed to cancel job" });
    }
  });

  // GET /api/batch-research/active - Get active jobs
  app.get("/api/batch-research/active", async (req, res) => {
    try {
      const activeJobs = await storage.getActiveBatchResearchJobs();
      res.json(activeJobs);
    } catch (error: any) {
      console.error("Error getting active batch research jobs:", error);
      res.status(500).json({ error: error.message || "Failed to get active jobs" });
    }
  });

  // GET /api/batch-research/history - Get job history
  app.get("/api/batch-research/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await storage.getBatchResearchJobHistory(limit);
      res.json(history);
    } catch (error: any) {
      console.error("Error getting batch research history:", error);
      res.status(500).json({ error: error.message || "Failed to get job history" });
    }
  });

  // ============================================
  // INTERACTIVE EDITING: Session and Edit Management
  // Anonymous browser-based sessions (no auth required)
  // ============================================

  // POST /api/sessions - Create or get session for a report
  app.post("/api/sessions", async (req, res) => {
    try {
      const { reportId, browserToken, sessionName } = req.body;
      if (!reportId || !browserToken) {
        return res.status(400).json({ error: "reportId and browserToken are required" });
      }
      const session = await storage.getOrCreateSession(reportId, browserToken, sessionName);
      res.json(session);
    } catch (error: any) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: error.message || "Failed to create session" });
    }
  });

  // GET /api/sessions/:reportId/:browserToken - Get session with edits
  app.get("/api/sessions/:reportId/:browserToken", async (req, res) => {
    try {
      const { reportId, browserToken } = req.params;
      const session = await storage.getSession(reportId, browserToken);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const edits = await storage.getSessionEdits(session.id);
      res.json({ session, edits });
    } catch (error: any) {
      console.error("Error getting session:", error);
      res.status(500).json({ error: error.message || "Failed to get session" });
    }
  });

  // POST /api/edits - Save a user edit
  app.post("/api/edits", async (req, res) => {
    try {
      const { sessionId, reportId, stepNumber, useCaseId, fieldPath, originalValue, editedValue } = req.body;
      if (!sessionId || !reportId || stepNumber == null || !fieldPath) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const edit = await storage.saveEdit({
        sessionId,
        reportId,
        stepNumber,
        useCaseId: useCaseId || null,
        fieldPath,
        originalValue: String(originalValue),
        editedValue: String(editedValue),
      });
      res.json(edit);
    } catch (error: any) {
      console.error("Error saving edit:", error);
      res.status(500).json({ error: error.message || "Failed to save edit" });
    }
  });

  // DELETE /api/edits/:sessionId - Reset all edits for a session
  app.delete("/api/edits/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await storage.clearSessionEdits(sessionId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error clearing edits:", error);
      res.status(500).json({ error: error.message || "Failed to clear edits" });
    }
  });

  return httpServer;
}
