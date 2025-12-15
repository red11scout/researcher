import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Download, Workflow, Loader2, FileJson, CheckCircle2, AlertCircle, Files, FileText } from "lucide-react";

interface WorkflowExportPanelProps {
  reportId: string;
  companyName: string;
  analysisData?: any;
  onExportComplete?: (data: any) => void;
}

type ExportFormat = "standard" | "enhanced" | "csv";
type DetailLevel = "summary" | "standard" | "detailed";
type ExportMode = "single" | "separate";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ExportProgress {
  stage: "idle" | "validating" | "generating" | "downloading" | "complete" | "error";
  percent: number;
  message: string;
}

const REQUIRED_WORKFLOW_FIELDS = ["stepNumber", "stepId", "stepName", "description", "actor", "duration"];
const REQUIRED_TARGET_FIELDS = [...REQUIRED_WORKFLOW_FIELDS, "isAIEnabled", "isHumanInTheLoop"];

function validateWorkflowSchema(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data) {
    errors.push("Export data is empty");
    return { isValid: false, errors, warnings };
  }

  if (!data.reportId) {
    errors.push("Missing reportId in export data");
  }

  if (!data.companyName) {
    errors.push("Missing companyName in export data");
  }

  if (!data.workflowData || !Array.isArray(data.workflowData)) {
    errors.push("Missing or invalid workflowData array");
  } else {
    data.workflowData.forEach((workflow: any, index: number) => {
      const prefix = `Workflow ${index + 1} (${workflow.useCaseName || "Unknown"})`;
      
      if (!workflow.useCaseId) {
        warnings.push(`${prefix}: Missing useCaseId`);
      }
      
      if (!workflow.currentStateWorkflow || !Array.isArray(workflow.currentStateWorkflow)) {
        errors.push(`${prefix}: Missing currentStateWorkflow array`);
      } else {
        if (workflow.currentStateWorkflow.length < 6) {
          warnings.push(`${prefix}: Current state has only ${workflow.currentStateWorkflow.length} steps (recommended: 6+)`);
        }
        
        workflow.currentStateWorkflow.forEach((step: any, stepIndex: number) => {
          REQUIRED_WORKFLOW_FIELDS.forEach(field => {
            if (!step[field]) {
              warnings.push(`${prefix} Current Step ${stepIndex + 1}: Missing ${field}`);
            }
          });
        });
        
        const hasBottleneck = workflow.currentStateWorkflow.some((s: any) => s.isBottleneck);
        if (!hasBottleneck) {
          warnings.push(`${prefix}: No bottleneck identified in current state`);
        }
      }
      
      if (!workflow.targetStateWorkflow || !Array.isArray(workflow.targetStateWorkflow)) {
        errors.push(`${prefix}: Missing targetStateWorkflow array`);
      } else {
        if (workflow.targetStateWorkflow.length < 8) {
          warnings.push(`${prefix}: Target state has only ${workflow.targetStateWorkflow.length} steps (recommended: 8+)`);
        }
        
        const hasHITL = workflow.targetStateWorkflow.some((s: any) => s.isHumanInTheLoop);
        if (!hasHITL) {
          warnings.push(`${prefix}: No HITL checkpoint in target state`);
        }
        
        const hasAIEnabled = workflow.targetStateWorkflow.some((s: any) => s.isAIEnabled);
        if (!hasAIEnabled) {
          warnings.push(`${prefix}: No AI-enabled steps in target state`);
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

function downloadFile(content: string, filename: string, contentType: string = "application/json") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function WorkflowExportPanel({ reportId, companyName, analysisData, onExportComplete }: WorkflowExportPanelProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("enhanced");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const [exportMode, setExportMode] = useState<ExportMode>("single");
  const [includeAgenticPatterns, setIncludeAgenticPatterns] = useState(true);
  const [includeAssumptions, setIncludeAssumptions] = useState(true);
  const [includeMiroMetadata, setIncludeMiroMetadata] = useState(true);
  const [includeReportData, setIncludeReportData] = useState(true);
  const [progress, setProgress] = useState<ExportProgress>({ stage: "idle", percent: 0, message: "" });
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const updateProgress = useCallback((stage: ExportProgress["stage"], percent: number, message: string) => {
    setProgress({ stage, percent, message });
  }, []);

  const handleExport = async () => {
    try {
      updateProgress("validating", 10, "Validating export configuration...");
      await new Promise(resolve => setTimeout(resolve, 300));

      updateProgress("generating", 25, "Fetching workflow data from server...");
      
      const response = await fetch(`/api/reports/${reportId}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          detailLevel,
          includeAgenticPatterns,
          includeAssumptions,
          includeMiroMetadata,
        }),
      });

      updateProgress("generating", 50, "Processing workflow data...");

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate workflows");
      }

      const workflowData = await response.json();

      updateProgress("validating", 65, "Validating JSON schema...");
      await new Promise(resolve => setTimeout(resolve, 200));

      const validation = validateWorkflowSchema(workflowData);
      setValidationResult(validation);

      if (!validation.isValid) {
        updateProgress("error", 0, "Validation failed - see errors below");
        toast({
          title: "Validation Failed",
          description: `${validation.errors.length} error(s) found in export data`,
          variant: "destructive",
        });
        return;
      }

      updateProgress("downloading", 80, "Preparing download...");
      await new Promise(resolve => setTimeout(resolve, 200));

      const sanitizedName = companyName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
      const timestamp = new Date().toISOString().split("T")[0];

      if (exportMode === "separate") {
        updateProgress("downloading", 85, "Downloading report.json...");
        
        const reportExport = {
          reportId,
          companyName,
          generatedAt: new Date().toISOString(),
          exportFormat: format,
          detailLevel,
          summary: workflowData.summary || {},
          executiveDashboard: workflowData.executiveDashboard || analysisData?.executiveDashboard || {},
          assumptions: includeAssumptions ? (workflowData.masterAssumptions || {}) : undefined,
        };
        
        if (includeReportData && analysisData) {
          Object.assign(reportExport, { analysisData });
        }

        downloadFile(
          JSON.stringify(reportExport, null, 2),
          `${sanitizedName}_Report_${timestamp}.json`
        );

        updateProgress("downloading", 92, "Downloading workflows.json...");
        await new Promise(resolve => setTimeout(resolve, 300));

        const workflowExport = {
          reportId,
          companyName,
          generatedAt: new Date().toISOString(),
          exportFormat: format,
          detailLevel,
          workflowCount: workflowData.workflowData?.length || 0,
          workflowData: workflowData.workflowData || [],
          agenticPatternLibrary: includeAgenticPatterns ? workflowData.agenticPatternLibrary : undefined,
          miroMetadata: includeMiroMetadata ? workflowData.miroMetadata : undefined,
        };

        downloadFile(
          JSON.stringify(workflowExport, null, 2),
          `${sanitizedName}_Workflows_${timestamp}.json`
        );

        toast({
          title: "Export Complete",
          description: `Downloaded 2 files: report.json and workflows.json`,
        });
      } else {
        const combinedExport = {
          ...workflowData,
          reportId,
          companyName,
          generatedAt: new Date().toISOString(),
          exportFormat: format,
          detailLevel,
        };

        if (includeReportData && analysisData) {
          combinedExport.analysisData = analysisData;
        }

        downloadFile(
          JSON.stringify(combinedExport, null, 2),
          `${sanitizedName}_Enhanced_Export_${timestamp}.json`
        );

        toast({
          title: "Export Complete",
          description: `Generated ${workflowData.workflowData?.length || 0} workflow pairs for Miro import.`,
        });
      }

      updateProgress("complete", 100, "Export complete!");

      if (onExportComplete) {
        onExportComplete(workflowData);
      }

      setTimeout(() => {
        setIsOpen(false);
        setProgress({ stage: "idle", percent: 0, message: "" });
        setValidationResult(null);
      }, 1500);

    } catch (error) {
      console.error("Export error:", error);
      updateProgress("error", 0, error instanceof Error ? error.message : "Export failed");
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to generate workflows",
        variant: "destructive",
      });
    }
  };

  const isExporting = progress.stage !== "idle" && progress.stage !== "complete" && progress.stage !== "error";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setProgress({ stage: "idle", percent: 0, message: "" });
        setValidationResult(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          size="sm" 
          className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
          data-testid="button-enhanced-export"
        >
          <FileJson className="h-4 w-4" />
          <span>Enhanced Export</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" />
            Enhanced Workflow Export
          </DialogTitle>
          <DialogDescription>
            Export comprehensive workflow data with full validation and multiple output options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {progress.stage !== "idle" && (
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg" data-testid="export-progress">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  {progress.stage === "complete" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : progress.stage === "error" ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {progress.message}
                </span>
                <span className="text-muted-foreground">{progress.percent}%</span>
              </div>
              <Progress value={progress.percent} className="h-2" />
            </div>
          )}

          {validationResult && !validationResult.isValid && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg" data-testid="validation-errors">
              <p className="font-medium text-red-700 dark:text-red-400 text-sm mb-2">Validation Errors:</p>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                {validationResult.errors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          )}

          {validationResult && validationResult.warnings.length > 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg" data-testid="validation-warnings">
              <p className="font-medium text-yellow-700 dark:text-yellow-400 text-sm mb-2">Warnings ({validationResult.warnings.length}):</p>
              <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1 max-h-24 overflow-y-auto">
                {validationResult.warnings.slice(0, 5).map((warn, i) => (
                  <li key={i}>• {warn}</li>
                ))}
                {validationResult.warnings.length > 5 && (
                  <li className="italic">...and {validationResult.warnings.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Export Mode</Label>
            <RadioGroup
              value={exportMode}
              onValueChange={(v) => setExportMode(v as ExportMode)}
              className="grid grid-cols-2 gap-3"
            >
              <div className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${exportMode === "single" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="single" id="mode-single" data-testid="radio-single-file" />
                <Label htmlFor="mode-single" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">Single File</span>
                  </div>
                  <span className="block text-xs text-muted-foreground mt-1">
                    All data in one JSON file
                  </span>
                </Label>
              </div>
              <div className={`flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${exportMode === "separate" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="separate" id="mode-separate" data-testid="radio-separate-files" />
                <Label htmlFor="mode-separate" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <Files className="h-4 w-4" />
                    <span className="text-sm font-medium">Separate Files</span>
                  </div>
                  <span className="block text-xs text-muted-foreground mt-1">
                    report.json + workflows.json
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Export Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-3 gap-2"
            >
              <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${format === "standard" ? "border-primary" : ""}`}>
                <RadioGroupItem value="standard" id="format-standard" />
                <Label htmlFor="format-standard" className="cursor-pointer text-sm">
                  Standard
                  <span className="block text-xs text-muted-foreground">Basic JSON</span>
                </Label>
              </div>
              <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${format === "enhanced" ? "border-primary" : ""}`}>
                <RadioGroupItem value="enhanced" id="format-enhanced" />
                <Label htmlFor="format-enhanced" className="cursor-pointer text-sm">
                  Enhanced
                  <span className="block text-xs text-muted-foreground">+ Workflows</span>
                </Label>
              </div>
              <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${format === "csv" ? "border-primary" : ""}`}>
                <RadioGroupItem value="csv" id="format-csv" />
                <Label htmlFor="format-csv" className="cursor-pointer text-sm">
                  CSV
                  <span className="block text-xs text-muted-foreground">Spreadsheet</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Workflow Detail Level</Label>
            <RadioGroup
              value={detailLevel}
              onValueChange={(v) => setDetailLevel(v as DetailLevel)}
              className="grid grid-cols-3 gap-2"
            >
              <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${detailLevel === "summary" ? "border-primary" : ""}`}>
                <RadioGroupItem value="summary" id="detail-summary" />
                <Label htmlFor="detail-summary" className="cursor-pointer text-sm">
                  Summary
                  <span className="block text-xs text-muted-foreground">5-6 steps</span>
                </Label>
              </div>
              <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${detailLevel === "standard" ? "border-primary" : ""}`}>
                <RadioGroupItem value="standard" id="detail-standard" />
                <Label htmlFor="detail-standard" className="cursor-pointer text-sm">
                  Standard
                  <span className="block text-xs text-muted-foreground">8-10 steps</span>
                </Label>
              </div>
              <div className={`flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 ${detailLevel === "detailed" ? "border-primary" : ""}`}>
                <RadioGroupItem value="detailed" id="detail-detailed" />
                <Label htmlFor="detail-detailed" className="cursor-pointer text-sm">
                  Detailed
                  <span className="block text-xs text-muted-foreground">12-15 steps</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Include Options</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-report"
                  checked={includeReportData}
                  onCheckedChange={(c) => setIncludeReportData(c === true)}
                  data-testid="checkbox-include-report"
                />
                <Label htmlFor="include-report" className="text-sm cursor-pointer">
                  Full Report Data
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-patterns"
                  checked={includeAgenticPatterns}
                  onCheckedChange={(c) => setIncludeAgenticPatterns(c === true)}
                />
                <Label htmlFor="include-patterns" className="text-sm cursor-pointer">
                  Agentic Patterns
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-assumptions"
                  checked={includeAssumptions}
                  onCheckedChange={(c) => setIncludeAssumptions(c === true)}
                />
                <Label htmlFor="include-assumptions" className="text-sm cursor-pointer">
                  Assumptions
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-miro"
                  checked={includeMiroMetadata}
                  onCheckedChange={(c) => setIncludeMiroMetadata(c === true)}
                />
                <Label htmlFor="include-miro" className="text-sm cursor-pointer">
                  Miro Metadata
                </Label>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium mb-2">Enhanced Export includes:</p>
            <ul className="space-y-1 text-muted-foreground text-xs grid grid-cols-2 gap-1">
              <li>• Complete workflowData array</li>
              <li>• JSON schema validation</li>
              <li>• Current & target state flows</li>
              <li>• Before/after metrics</li>
              <li>• HITL checkpoints</li>
              <li>• Bottleneck analysis</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            data-testid="button-download-export"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {progress.stage === "validating" ? "Validating..." : 
                 progress.stage === "generating" ? "Generating..." : 
                 "Downloading..."}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {exportMode === "separate" ? "Download Files" : "Download JSON"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowExportButton({ reportId, companyName, analysisData }: WorkflowExportPanelProps) {
  return (
    <WorkflowExportPanel 
      reportId={reportId} 
      companyName={companyName} 
      analysisData={analysisData}
    />
  );
}
