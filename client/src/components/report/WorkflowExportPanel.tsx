import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Download, Workflow, Loader2 } from "lucide-react";

interface WorkflowExportPanelProps {
  reportId: string;
  companyName: string;
  onExportComplete?: (data: any) => void;
}

type ExportFormat = "standard" | "enhanced" | "csv";
type DetailLevel = "summary" | "standard" | "detailed";

export function WorkflowExportPanel({ reportId, companyName, onExportComplete }: WorkflowExportPanelProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("enhanced");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const [includeAgenticPatterns, setIncludeAgenticPatterns] = useState(true);
  const [includeAssumptions, setIncludeAssumptions] = useState(true);
  const [includeMiroMetadata, setIncludeMiroMetadata] = useState(true);

  const handleExport = async () => {
    setIsGenerating(true);

    try {
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate workflows");
      }

      const data = await response.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${companyName.replace(/\s+/g, "_")}_Workflows_${format}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Workflow Export Complete",
        description: `Generated ${data.workflowData?.length || 0} workflow pairs for Miro import.`,
      });

      if (onExportComplete) {
        onExportComplete(data);
      }

      setIsOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to generate workflows",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2"
          data-testid="button-workflow-export"
        >
          <Workflow className="h-4 w-4" />
          <span className="hidden sm:inline">Miro Export</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            Export Workflow Data for Miro
          </DialogTitle>
          <DialogDescription>
            Generate detailed before/after workflow diagrams for each use case.
            Export includes agentic patterns, comparison metrics, and Miro-ready metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Export Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as ExportFormat)}
              className="grid grid-cols-3 gap-2"
            >
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="standard" id="format-standard" />
                <Label htmlFor="format-standard" className="cursor-pointer text-sm">
                  Standard
                  <span className="block text-xs text-muted-foreground">Basic JSON</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 border-primary">
                <RadioGroupItem value="enhanced" id="format-enhanced" />
                <Label htmlFor="format-enhanced" className="cursor-pointer text-sm">
                  Enhanced
                  <span className="block text-xs text-muted-foreground">+ Workflows</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
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
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="summary" id="detail-summary" />
                <Label htmlFor="detail-summary" className="cursor-pointer text-sm">
                  Summary
                  <span className="block text-xs text-muted-foreground">5-6 steps</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 border-primary">
                <RadioGroupItem value="standard" id="detail-standard" />
                <Label htmlFor="detail-standard" className="cursor-pointer text-sm">
                  Standard
                  <span className="block text-xs text-muted-foreground">8-10 steps</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50">
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
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-patterns"
                  checked={includeAgenticPatterns}
                  onCheckedChange={(c) => setIncludeAgenticPatterns(c === true)}
                />
                <Label htmlFor="include-patterns" className="text-sm cursor-pointer">
                  Agentic Patterns (Orchestrator-Workers, Semantic Router, etc.)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-assumptions"
                  checked={includeAssumptions}
                  onCheckedChange={(c) => setIncludeAssumptions(c === true)}
                />
                <Label htmlFor="include-assumptions" className="text-sm cursor-pointer">
                  Master Assumptions (financial, operational metrics)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-miro"
                  checked={includeMiroMetadata}
                  onCheckedChange={(c) => setIncludeMiroMetadata(c === true)}
                />
                <Label htmlFor="include-miro" className="text-sm cursor-pointer">
                  Miro Metadata (colors, icons, layout settings)
                </Label>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium mb-2">What's included:</p>
            <ul className="space-y-1 text-muted-foreground text-xs">
              <li>• Current State: Manual process with bottlenecks identified</li>
              <li>• Target State: AI-enhanced workflow with HITL checkpoints</li>
              <li>• Before/After comparison metrics</li>
              <li>• Actor roles, systems, and data sources per step</li>
              <li>• Duration estimates and pain points</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate & Download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
