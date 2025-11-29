import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  FunctionSquare,
  Check,
  X,
  Plus,
  History,
  Play,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  Trash2,
  Copy,
} from "lucide-react";

interface FormulaConstant {
  key: string;
  label: string;
  value: number;
  description?: string;
}

interface Formula {
  id: string;
  useCaseId: string | null;
  reportId: string | null;
  fieldKey: string;
  label: string;
  expression: string;
  inputFields: string[];
  constants: FormulaConstant[];
  isActive: boolean;
  version: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EvaluationStep {
  label: string;
  value: number;
  formatted?: string;
}

interface PreviewResult {
  value: number;
  steps: EvaluationStep[];
  error?: string;
}

interface AvailableInput {
  key: string;
  label: string;
  description: string;
}

interface FormulaExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  fieldKey: string;
  fieldLabel: string;
  reportId: string | null;
  useCaseId?: string | null;
  useCaseName?: string;
  currentContext: Record<string, number>;
  onFormulaChange?: (result: PreviewResult) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  benefits: "Benefit Inputs",
  calculated: "Calculated Fields",
  risk: "Risk Factors",
  timing: "Timing",
  effort: "Effort Metrics",
  context: "Context Variables",
  weights: "Priority Weights",
  ai: "AI Model Costs",
  costs: "Implementation Costs",
};

export function FormulaExplorer({
  isOpen,
  onClose,
  fieldKey,
  fieldLabel,
  reportId,
  useCaseId,
  useCaseName,
  currentContext,
  onFormulaChange,
}: FormulaExplorerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<"view" | "edit" | "history">("view");
  const [editExpression, setEditExpression] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editConstants, setEditConstants] = useState<FormulaConstant[]>([]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: formulaData, isLoading } = useQuery({
    queryKey: ["formulas", reportId, fieldKey, useCaseId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("fieldKey", fieldKey);
      if (reportId) params.set("reportId", reportId);
      if (useCaseId !== undefined) params.set("useCaseId", useCaseId || "");
      
      const res = await fetch(`/api/formulas?${params}`);
      if (!res.ok) throw new Error("Failed to fetch formulas");
      return res.json();
    },
    enabled: isOpen,
  });

  const { data: inputsData } = useQuery({
    queryKey: ["formula-inputs"],
    queryFn: async () => {
      const res = await fetch("/api/formulas/inputs/available");
      if (!res.ok) throw new Error("Failed to fetch inputs");
      return res.json();
    },
    enabled: isOpen,
  });

  const previewMutation = useMutation({
    mutationFn: async (data: { expression: string; context: Record<string, number>; constants: FormulaConstant[] }) => {
      const res = await fetch("/api/formulas/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to preview formula");
      return res.json();
    },
    onSuccess: (result: PreviewResult) => {
      setPreviewResult(result);
      setPreviewError(result.error || null);
    },
    onError: (error: Error) => {
      setPreviewError(error.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      reportId: string | null;
      useCaseId: string | null;
      fieldKey: string;
      label: string;
      expression: string;
      constants: FormulaConstant[];
      notes: string;
      isActive: boolean;
    }) => {
      const res = await fetch("/api/formulas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create formula");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formulas", reportId, fieldKey, useCaseId] });
      toast({
        title: "Formula saved",
        description: "New formula version created and activated.",
      });
      setActiveTab("view");
      if (onFormulaChange && previewResult) {
        onFormulaChange(previewResult);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (formulaId: string) => {
      const res = await fetch(`/api/formulas/${formulaId}/activate`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to activate formula");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formulas", reportId, fieldKey, useCaseId] });
      toast({
        title: "Formula activated",
        description: "The selected formula version is now active.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const activeFormula: Formula | undefined = formulaData?.activeFormula;
  const allFormulas: Formula[] = formulaData?.formulas || [];
  const groupedInputs: Record<string, AvailableInput[]> = inputsData?.grouped || {};

  useEffect(() => {
    if (activeFormula && activeTab === "edit") {
      setEditExpression(activeFormula.expression);
      setEditLabel(`${activeFormula.label} - v${activeFormula.version + 1}`);
      setEditNotes(activeFormula.notes || "");
      setEditConstants(activeFormula.constants || []);
    }
  }, [activeFormula, activeTab]);

  const debouncePreview = useCallback(() => {
    if (editExpression.trim()) {
      const fullContext = { ...currentContext };
      editConstants.forEach(c => {
        fullContext[c.key] = c.value;
      });
      previewMutation.mutate({
        expression: editExpression,
        context: fullContext,
        constants: editConstants,
      });
    }
  }, [editExpression, currentContext, editConstants]);

  useEffect(() => {
    const timer = setTimeout(debouncePreview, 500);
    return () => clearTimeout(timer);
  }, [editExpression, editConstants, debouncePreview]);

  const handleInsertVariable = (key: string) => {
    setEditExpression(prev => prev + (prev ? " + " : "") + key);
  };

  const handleAddConstant = () => {
    setEditConstants([
      ...editConstants,
      { key: `constant${editConstants.length + 1}`, label: "New Constant", value: 0 },
    ]);
  };

  const handleRemoveConstant = (index: number) => {
    setEditConstants(editConstants.filter((_, i) => i !== index));
  };

  const handleUpdateConstant = (index: number, field: keyof FormulaConstant, value: string | number) => {
    const updated = [...editConstants];
    updated[index] = { ...updated[index], [field]: value };
    setEditConstants(updated);
  };

  const handleSaveFormula = () => {
    if (!editExpression.trim() || !editLabel.trim()) {
      toast({
        title: "Validation Error",
        description: "Label and expression are required.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      reportId,
      useCaseId: useCaseId || null,
      fieldKey,
      label: editLabel,
      expression: editExpression,
      constants: editConstants,
      notes: editNotes,
      isActive: true,
    });
  };

  const handleCreateNewVersion = () => {
    if (activeFormula) {
      setEditExpression(activeFormula.expression);
      setEditLabel(`${activeFormula.label.replace(/ - v\d+$/, "")} - v${activeFormula.version + 1}`);
      setEditNotes(activeFormula.notes || "");
      setEditConstants(activeFormula.constants || []);
    }
    setActiveTab("edit");
  };

  const formatValue = (value: number): string => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2" data-testid="formula-explorer-title">
            <FunctionSquare className="h-5 w-5 text-blue-500" />
            Formula for {fieldLabel}
          </SheetTitle>
          <SheetDescription>
            {useCaseName ? `Use Case: ${useCaseName}` : "Report-level formula"}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 mt-4">
            <TabsTrigger value="view" className="flex items-center gap-1" data-testid="tab-view">
              <CheckCircle2 className="h-4 w-4" />
              Current
            </TabsTrigger>
            <TabsTrigger value="edit" className="flex items-center gap-1" data-testid="tab-edit">
              <FunctionSquare className="h-4 w-4" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1" data-testid="tab-history">
              <History className="h-4 w-4" />
              Versions
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="view" className="m-0 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activeFormula ? (
                <>
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{activeFormula.label}</h3>
                      <Badge variant="outline">v{activeFormula.version}</Badge>
                    </div>
                    <div className="font-mono text-sm bg-background rounded p-3 border">
                      {fieldLabel} = {activeFormula.expression}
                    </div>
                    {activeFormula.notes && (
                      <p className="text-sm text-muted-foreground">{activeFormula.notes}</p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Input Values</h4>
                    <div className="grid gap-2">
                      {activeFormula.inputFields.map((field) => (
                        <div key={field} className="flex justify-between items-center text-sm bg-muted/30 rounded px-3 py-2">
                          <span className="text-muted-foreground">{field}</span>
                          <span className="font-mono">{formatValue(currentContext[field] || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {activeFormula.constants && activeFormula.constants.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Constants</h4>
                        <div className="grid gap-2">
                          {activeFormula.constants.map((constant) => (
                            <div key={constant.key} className="flex justify-between items-center text-sm bg-muted/30 rounded px-3 py-2">
                              <span className="text-muted-foreground">{constant.label}</span>
                              <span className="font-mono">{constant.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="flex gap-2">
                    <Button onClick={handleCreateNewVersion} className="flex-1" data-testid="btn-create-version">
                      <Plus className="h-4 w-4 mr-2" />
                      Create New Version
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Created by {activeFormula.createdBy || "system"} on{" "}
                    {new Date(activeFormula.createdAt).toLocaleDateString()}
                  </p>
                </>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">No formula configured for this field.</p>
                  <Button onClick={() => setActiveTab("edit")} data-testid="btn-create-first">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Formula
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="edit" className="m-0 space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Formula Name</Label>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="e.g., Custom ROI Calculation"
                    data-testid="input-formula-label"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Available Inputs</Label>
                    <ScrollArea className="h-48 border rounded-md p-2">
                      <Accordion type="multiple" defaultValue={Object.keys(groupedInputs)}>
                        {Object.entries(groupedInputs).map(([category, inputs]) => (
                          <AccordionItem key={category} value={category}>
                            <AccordionTrigger className="text-sm py-2">
                              {CATEGORY_LABELS[category] || category}
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-1">
                                {inputs.map((input) => (
                                  <TooltipProvider key={input.key}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-start text-xs h-7"
                                          onClick={() => handleInsertVariable(input.key)}
                                          data-testid={`input-${input.key}`}
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          {input.key}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="right">
                                        <p className="font-medium">{input.label}</p>
                                        <p className="text-xs text-muted-foreground">{input.description}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </ScrollArea>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Constants</Label>
                      <Button variant="ghost" size="sm" onClick={handleAddConstant} data-testid="btn-add-constant">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <ScrollArea className="h-48 border rounded-md p-2">
                      {editConstants.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No constants defined
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {editConstants.map((constant, index) => (
                            <div key={index} className="space-y-1 border-b pb-2">
                              <div className="flex gap-1">
                                <Input
                                  placeholder="key"
                                  value={constant.key}
                                  onChange={(e) => handleUpdateConstant(index, "key", e.target.value)}
                                  className="h-7 text-xs"
                                />
                                <Input
                                  type="number"
                                  placeholder="value"
                                  value={constant.value}
                                  onChange={(e) => handleUpdateConstant(index, "value", parseFloat(e.target.value) || 0)}
                                  className="h-7 text-xs w-20"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleRemoveConstant(index)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <Input
                                placeholder="Label"
                                value={constant.label}
                                onChange={(e) => handleUpdateConstant(index, "label", e.target.value)}
                                className="h-7 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Expression</Label>
                  <Textarea
                    value={editExpression}
                    onChange={(e) => setEditExpression(e.target.value)}
                    placeholder="e.g., costSavings + revenueImpact * 0.8"
                    className="font-mono text-sm min-h-[80px]"
                    data-testid="input-expression"
                  />
                  <p className="text-xs text-muted-foreground">
                    Operators: + - * / ( ) | Functions: max, min, abs, round, sqrt, pow
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Why this formula exists, what changes were made..."
                    className="min-h-[60px]"
                    data-testid="input-notes"
                  />
                </div>

                <Separator />

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Live Preview
                    </h4>
                    {previewMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                  </div>

                  {previewError ? (
                    <div className="flex items-start gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{previewError}</span>
                    </div>
                  ) : previewResult ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Result:</span>
                        <span className="font-mono font-medium text-lg">
                          {formatValue(previewResult.value)}
                        </span>
                      </div>
                      {previewResult.steps.length > 0 && (
                        <div className="text-xs space-y-1 border-t pt-2">
                          {previewResult.steps.slice(0, -1).map((step, i) => (
                            <div key={i} className="flex justify-between text-muted-foreground">
                              <span>{step.label}</span>
                              <span className="font-mono">{step.formatted}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Enter an expression to preview</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveFormula}
                    disabled={createMutation.isPending || !!previewError}
                    className="flex-1"
                    data-testid="btn-save-formula"
                  >
                    {createMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save & Activate
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab("view")} data-testid="btn-cancel-edit">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="m-0 space-y-4">
              {allFormulas.length === 0 ? (
                <div className="text-center py-8">
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No formula versions yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allFormulas.map((formula) => (
                    <div
                      key={formula.id}
                      className={`p-4 rounded-lg border ${
                        formula.isActive ? "border-primary bg-primary/5" : "bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{formula.label}</h4>
                            <Badge variant="outline">v{formula.version}</Badge>
                            {formula.isActive && (
                              <Badge variant="default" className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Created {new Date(formula.createdAt).toLocaleDateString()} by{" "}
                            {formula.createdBy || "system"}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {!formula.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => activateMutation.mutate(formula.id)}
                              disabled={activateMutation.isPending}
                              data-testid={`btn-activate-${formula.id}`}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Activate
                            </Button>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditExpression(formula.expression);
                                    setEditLabel(`${formula.label} (copy)`);
                                    setEditNotes(formula.notes || "");
                                    setEditConstants(formula.constants || []);
                                    setActiveTab("edit");
                                  }}
                                  data-testid={`btn-copy-${formula.id}`}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate as new version</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      <div className="font-mono text-xs bg-background rounded p-2 border">
                        {formula.expression}
                      </div>
                      {formula.notes && (
                        <p className="text-xs text-muted-foreground mt-2">{formula.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export function FormulaButton({
  onClick,
  hasFormula = true,
}: {
  onClick: () => void;
  hasFormula?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${hasFormula ? "text-blue-500" : "text-muted-foreground"}`}
            onClick={onClick}
            data-testid="btn-formula"
          >
            <FunctionSquare className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>View and customize formula</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
