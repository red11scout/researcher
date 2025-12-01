import { useState, useEffect, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FormulaExplorer } from "@/components/FormulaExplorer";
import { 
  ArrowLeft, 
  Plus, 
  Pencil, 
  Trash2, 
  Sparkles, 
  Save,
  Loader2,
  Calculator,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  Settings,
  Zap,
  DollarSign,
  ChevronRight,
  HelpCircle,
  FunctionSquare
} from "lucide-react";

interface StepData {
  step: number;
  title: string;
  content: string;
  data: any[] | null;
}

interface AnalysisData {
  steps: StepData[];
  summary: string;
  executiveDashboard: any;
}

const EDITABLE_STEPS = [2, 3, 4, 5, 6, 7];
const STEP_FIELD_DEFINITIONS: Record<number, { key: string; label: string; type: string; options?: string[]; group?: string }[]> = {
  2: [
    { key: "Function", label: "Function", type: "select", options: ["Sales", "Marketing", "Product/Engineering", "Operations", "Procurement", "Manufacturing", "Finance", "Accounting", "HR/People", "IT", "Risk/Security", "Legal/Compliance", "Data/Analytics", "Customer Success"] },
    { key: "Sub-Function", label: "Sub-Function", type: "text" },
    { key: "KPI Name", label: "KPI Name", type: "text" },
    { key: "Baseline Value", label: "Baseline Value", type: "text" },
    { key: "Industry Benchmark", label: "Industry Benchmark", type: "text" },
    { key: "Target Value", label: "Target Value", type: "text" },
    { key: "Direction", label: "Direction", type: "select", options: ["↑", "↓"] },
    { key: "Timeframe", label: "Timeframe", type: "text" },
    { key: "Measurement Method", label: "Measurement Method", type: "textarea" },
  ],
  3: [
    { key: "Function", label: "Function", type: "select", options: ["Sales", "Marketing", "Product/Engineering", "Operations", "Procurement", "Manufacturing", "Finance", "Accounting", "HR/People", "IT", "Risk/Security", "Legal/Compliance", "Data/Analytics", "Customer Success"] },
    { key: "Sub-Function", label: "Sub-Function", type: "text" },
    { key: "Friction Point", label: "Friction Point", type: "textarea" },
    { key: "Severity", label: "Severity", type: "select", options: ["Critical", "High", "Medium", "Low"] },
    { key: "Estimated Annual Cost", label: "Estimated Annual Cost", type: "text" },
    { key: "Primary Driver Impact", label: "Primary Driver", type: "select", options: ["Grow Revenue", "Reduce Cost", "Increase Cash Flow", "Decrease Risk"] },
  ],
  4: [
    { key: "ID", label: "ID", type: "text" },
    { key: "Function", label: "Function", type: "select", options: ["Sales", "Marketing", "Product/Engineering", "Operations", "Procurement", "Manufacturing", "Finance", "Accounting", "HR/People", "IT", "Risk/Security", "Legal/Compliance", "Data/Analytics", "Customer Success"] },
    { key: "Sub-Function", label: "Sub-Function", type: "text" },
    { key: "Use Case Name", label: "Use Case Name", type: "text" },
    { key: "Description", label: "Description", type: "textarea" },
    { key: "AI Primitives", label: "AI Primitives", type: "text" },
    { key: "Target Friction", label: "Target Friction", type: "textarea" },
  ],
  5: [
    { key: "ID", label: "ID", type: "text", group: "basic" },
    { key: "Use Case", label: "Use Case", type: "text", group: "basic" },
    { key: "Revenue Benefit", label: "Revenue Benefit", type: "text", group: "revenue" },
    { key: "Revenue Formula", label: "Revenue Formula", type: "textarea", group: "revenue" },
    { key: "Cost Benefit", label: "Cost Benefit", type: "text", group: "cost" },
    { key: "Cost Formula", label: "Cost Formula", type: "textarea", group: "cost" },
    { key: "Cash Flow Benefit", label: "Cash Flow Benefit", type: "text", group: "cashflow" },
    { key: "Cash Flow Formula", label: "Cash Flow Formula", type: "textarea", group: "cashflow" },
    { key: "Risk Benefit", label: "Risk Benefit", type: "text", group: "risk" },
    { key: "Risk Formula", label: "Risk Formula", type: "textarea", group: "risk" },
    { key: "Total Annual Value", label: "Total Annual Value", type: "text", group: "totals" },
    { key: "Probability of Success", label: "Probability of Success (%)", type: "number", group: "totals" },
  ],
  6: [
    { key: "ID", label: "ID", type: "text" },
    { key: "Use Case", label: "Use Case", type: "text" },
    { key: "Runs/Month", label: "Runs/Month", type: "number" },
    { key: "Input Tokens/Run", label: "Input Tokens/Run", type: "number" },
    { key: "Output Tokens/Run", label: "Output Tokens/Run", type: "number" },
    { key: "Monthly Tokens", label: "Monthly Tokens", type: "number" },
    { key: "Annual Token Cost ($)", label: "Annual Token Cost", type: "text" },
    { key: "Data Readiness", label: "Data Readiness (1-5)", type: "number" },
    { key: "Integration Complexity", label: "Integration Complexity (1-5)", type: "number" },
    { key: "Change Mgmt", label: "Change Mgmt (1-5)", type: "number" },
    { key: "Effort Score", label: "Effort Score", type: "number" },
    { key: "Time-to-Value (months)", label: "Time-to-Value (months)", type: "number" },
  ],
  7: [
    { key: "ID", label: "ID", type: "text" },
    { key: "Use Case", label: "Use Case", type: "text" },
    { key: "Value Score", label: "Value Score", type: "number" },
    { key: "TTV Score", label: "TTV Score", type: "number" },
    { key: "Effort Score", label: "Effort Score", type: "number" },
    { key: "Priority Score", label: "Priority Score", type: "number" },
    { key: "Priority Tier", label: "Priority Tier", type: "select", options: ["Critical", "High", "Medium", "Low"] },
    { key: "Recommended Phase", label: "Recommended Phase", type: "select", options: ["Q1", "Q2", "Q3", "Q4"] },
  ],
};

const parseFormattedValue = (value: string | number | undefined): number => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const match = String(value).match(/^[\$]?([\d.]+)\s*([KkMmBb])?/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = match[2]?.toUpperCase();
  if (suffix === 'K') return num * 1000;
  if (suffix === 'M') return num * 1000000;
  if (suffix === 'B') return num * 1000000000;
  return num;
};

// Format currency with $ symbol and commas for readability
const formatCurrency = (value: number): string => {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const prefix = isNegative ? '-$' : '$';
  
  if (absValue >= 1000000000) return `${prefix}${(absValue / 1000000000).toFixed(1)}B`;
  if (absValue >= 1000000) return `${prefix}${(absValue / 1000000).toFixed(1)}M`;
  if (absValue >= 1000) return `${prefix}${absValue.toLocaleString('en-US')}`;
  return `${prefix}${Math.round(absValue)}`;
};

const CALCULATED_FIELDS: Record<string, { fieldKey: string; fieldLabel: string; step: number }> = {
  "Total Annual Value": { fieldKey: "totalAnnualImpact", fieldLabel: "Total Annual Impact", step: 5 },
  "Priority Score": { fieldKey: "priorityScore", fieldLabel: "Priority Score", step: 7 },
  "Value Score": { fieldKey: "valueScore", fieldLabel: "Value Score", step: 7 },
  "TTV Score": { fieldKey: "ttvScore", fieldLabel: "TTV Score", step: 7 },
  "Effort Score": { fieldKey: "effortScore", fieldLabel: "Effort Score", step: 7 },
  "Annual Token Cost ($)": { fieldKey: "annualTokenCost", fieldLabel: "Annual Token Cost", step: 6 },
};

export default function WhatIfAnalysis() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/whatif/:reportId");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentReport, setParentReport] = useState<any>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [activeStep, setActiveStep] = useState(2);
  const [useCaseCount, setUseCaseCount] = useState(10);
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [guidanceStep, setGuidanceStep] = useState(0);

  // Formula Explorer state
  const [formulaExplorerOpen, setFormulaExplorerOpen] = useState(false);
  const [selectedFormulaField, setSelectedFormulaField] = useState<{
    fieldKey: string;
    fieldLabel: string;
    useCaseId?: string;
    useCaseName?: string;
    context: Record<string, number>;
  } | null>(null);

  const reportId = params?.reportId;

  useEffect(() => {
    if (reportId) {
      fetchReport();
    }
  }, [reportId]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reports/${reportId}`);
      if (response.ok) {
        const report = await response.json();
        setParentReport(report);
        setAnalysisData(JSON.parse(JSON.stringify(report.analysisData)));
        
        const step4Data = report.analysisData?.steps?.find((s: any) => s.step === 4);
        if (step4Data?.data) {
          setUseCaseCount(step4Data.data.length);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to load report",
          variant: "destructive",
        });
        setLocation("/saved");
      }
    } catch (error) {
      console.error("Failed to fetch report:", error);
      toast({
        title: "Error",
        description: "Failed to load report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurrentStepData = (): any[] => {
    if (!analysisData) return [];
    const step = analysisData.steps.find(s => s.step === activeStep);
    return step?.data || [];
  };

  const updateStepData = (newData: any[]) => {
    if (!analysisData) return;
    
    setAnalysisData(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const stepIndex = updated.steps.findIndex(s => s.step === activeStep);
      if (stepIndex >= 0) {
        updated.steps[stepIndex] = { ...updated.steps[stepIndex], data: newData };
      }
      return updated;
    });
  };

  const handleAddRecord = () => {
    setEditingRecord(null);
    setEditingIndex(-1);
    setFormData({});
    setGuidanceStep(activeStep === 5 ? 1 : 0);
    setEditDialogOpen(true);
  };

  const handleEditRecord = (record: any, index: number) => {
    setEditingRecord(record);
    setEditingIndex(index);
    setFormData({ ...record });
    setGuidanceStep(0);
    setEditDialogOpen(true);
  };

  const handleDeleteRecord = (index: number) => {
    const currentData = getCurrentStepData();
    const newData = currentData.filter((_, i) => i !== index);
    updateStepData(newData);
    toast({
      title: "Record Deleted",
      description: "The record has been removed from the analysis.",
    });
  };

  const calculateTotalAnnualValue = (record: Record<string, string>): string => {
    const revenue = parseFormattedValue(record["Revenue Benefit"]);
    const cost = parseFormattedValue(record["Cost Benefit"]);
    const cashFlow = parseFormattedValue(record["Cash Flow Benefit"]);
    const risk = parseFormattedValue(record["Risk Benefit"]);
    const total = revenue + cost + cashFlow + risk;
    return formatCurrency(total);
  };

  const updateStep7FromStep5 = (step5Data: any[]) => {
    if (!analysisData) return;

    const step7Index = analysisData.steps.findIndex(s => s.step === 7);
    const step6Index = analysisData.steps.findIndex(s => s.step === 6);
    if (step7Index < 0) return;

    const step6Data = step6Index >= 0 ? analysisData.steps[step6Index].data || [] : [];
    const maxTotalValue = Math.max(...step5Data.map(r => parseFormattedValue(r["Total Annual Value"])), 1);

    const updatedStep7 = step5Data.map((record: any, index: number) => {
      const existing = analysisData.steps[step7Index]?.data?.[index] || {};
      const step6Record = step6Data[index] || {};
      
      const totalValue = parseFormattedValue(record["Total Annual Value"]);
      const probability = parseFloat(record["Probability of Success"]) || 80;
      const valueScore = Math.round((totalValue / maxTotalValue) * 100 * (probability / 100));
      
      const ttv = parseFloat(step6Record["Time-to-Value (months)"]) || 6;
      const ttvScore = Math.max(0, 100 - (ttv * 10));
      
      const effortScore = parseFloat(step6Record["Effort Score"]) || 50;
      const priorityScore = Math.round((valueScore * 0.4) + (ttvScore * 0.3) + ((100 - effortScore) * 0.3));
      
      let priorityTier = "Low";
      if (priorityScore >= 80) priorityTier = "Critical";
      else if (priorityScore >= 60) priorityTier = "High";
      else if (priorityScore >= 40) priorityTier = "Medium";

      let recommendedPhase = "Q4";
      if (priorityScore >= 80) recommendedPhase = "Q1";
      else if (priorityScore >= 60) recommendedPhase = "Q2";
      else if (priorityScore >= 40) recommendedPhase = "Q3";

      return {
        ...existing,
        ID: record.ID || `UC-${String(index + 1).padStart(2, '0')}`,
        "Use Case": record["Use Case"] || "",
        "Value Score": valueScore,
        "TTV Score": ttvScore,
        "Effort Score": effortScore,
        "Priority Score": priorityScore,
        "Priority Tier": priorityTier,
        "Recommended Phase": recommendedPhase,
      };
    });

    setAnalysisData(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      updated.steps[step7Index] = { 
        ...updated.steps[step7Index], 
        data: updatedStep7 
      };
      return updated;
    });
  };

  const handleSaveRecord = () => {
    const currentData = getCurrentStepData();
    let updatedFormData = { ...formData };
    
    if (activeStep === 5) {
      updatedFormData["Total Annual Value"] = calculateTotalAnnualValue(formData);
      if (!updatedFormData["Probability of Success"]) {
        updatedFormData["Probability of Success"] = "80";
      }
    }
    
    let newData: any[];
    if (editingIndex >= 0) {
      newData = [...currentData];
      newData[editingIndex] = updatedFormData;
    } else {
      newData = [...currentData, updatedFormData];
    }
    
    updateStepData(newData);
    
    if (activeStep === 5) {
      setTimeout(() => {
        updateStep7FromStep5(newData);
        standardizeKPIs();
        toast({
          title: editingIndex >= 0 ? "Record Updated" : "Record Added",
          description: "Benefits saved and Step 7 priority scores recalculated.",
        });
      }, 100);
    } else {
      toast({
        title: editingIndex >= 0 ? "Record Updated" : "Record Added",
        description: "Changes have been saved.",
      });
    }
    
    setEditDialogOpen(false);
    setEditingRecord(null);
    setEditingIndex(-1);
    setFormData({});
    setGuidanceStep(0);
  };

  const buildFormulaContext = (step: number, data: any[]): Record<string, number> => {
    const context: Record<string, number> = {};
    
    if (step === 5 && data.length > 0) {
      const totals = data.reduce((acc, record) => {
        return {
          revenueBenefit: acc.revenueBenefit + parseFormattedValue(record["Revenue Benefit"] || record["Revenue Benefit ($)"]),
          costBenefit: acc.costBenefit + parseFormattedValue(record["Cost Benefit"] || record["Cost Benefit ($)"]),
          cashFlowBenefit: acc.cashFlowBenefit + parseFormattedValue(record["Cash Flow Benefit"] || record["Cash Flow Benefit ($)"]),
          riskBenefit: acc.riskBenefit + parseFormattedValue(record["Risk Benefit"] || record["Risk Benefit ($)"]),
          totalAnnualImpact: acc.totalAnnualImpact + parseFormattedValue(record["Total Annual Value"] || record["Total Annual Value ($)"]),
        };
      }, { revenueBenefit: 0, costBenefit: 0, cashFlowBenefit: 0, riskBenefit: 0, totalAnnualImpact: 0 });
      
      Object.assign(context, totals);
      context.maxTotalImpact = Math.max(...data.map(r => parseFormattedValue(r["Total Annual Value"] || r["Total Annual Value ($)"])));
    }
    
    if (step === 6 && data.length > 0) {
      context.avgInputTokens = data.reduce((sum, r) => sum + (parseFloat(r["Input Tokens/Run"]) || 0), 0) / data.length;
      context.avgOutputTokens = data.reduce((sum, r) => sum + (parseFloat(r["Output Tokens/Run"]) || 0), 0) / data.length;
      context.runsPerYear = data.reduce((sum, r) => sum + (parseFloat(r["Runs/Month"]) || 0) * 12, 0);
    }
    
    if (step === 7 && data.length > 0) {
      context.weightValue = 40;
      context.weightTtv = 30;
      context.weightEffort = 30;
    }
    
    return context;
  };

  const handleAISuggest = async () => {
    if (!parentReport) return;
    
    setAiSuggesting(true);
    try {
      const response = await fetch("/api/whatif/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: activeStep,
          context: {
            companyName: parentReport.companyName,
            summary: analysisData?.summary,
          },
          currentData: getCurrentStepData(),
        }),
      });

      if (response.ok) {
        const { suggestion } = await response.json();
        setFormData(suggestion);
        toast({
          title: "AI Suggestion Generated",
          description: "Review and modify the suggested values as needed.",
        });
      } else {
        throw new Error("Failed to get suggestion");
      }
    } catch (error) {
      toast({
        title: "Suggestion Failed",
        description: "Could not generate AI suggestion. Please fill in manually.",
        variant: "destructive",
      });
    } finally {
      setAiSuggesting(false);
    }
  };

  const recalculateBenefits = () => {
    if (!analysisData) return;

    toast({
      title: "Recalculating Benefits",
      description: "Updating Step 5 based on your changes...",
    });

    const step4Data = analysisData.steps.find(s => s.step === 4)?.data || [];
    const step5Index = analysisData.steps.findIndex(s => s.step === 5);
    
    if (step5Index >= 0) {
      const updatedBenefits = step4Data.map((useCase: any, i: number) => {
        const existing = analysisData.steps[step5Index]?.data?.[i] || {};
        return {
          ...existing,
          ID: useCase.ID || `UC-${String(i + 1).padStart(2, '0')}`,
          "Use Case": useCase["Use Case Name"] || useCase["Use Case"] || "",
        };
      });

      setAnalysisData(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.steps[step5Index] = { 
          ...updated.steps[step5Index], 
          data: updatedBenefits 
        };
        return updated;
      });
    }

    toast({
      title: "Benefits Updated",
      description: "Step 5 has been synchronized with your use case changes.",
    });
  };

  const standardizeKPIs = () => {
    if (!analysisData) return;

    toast({
      title: "Standardizing KPIs",
      description: "Formatting all measurements consistently...",
    });

    setAnalysisData(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      
      updated.steps = updated.steps.map(step => {
        if (!step.data) return step;
        
        const standardizedData = step.data.map((record: any) => {
          const standardized = { ...record };
          
          Object.keys(standardized).forEach(key => {
            const value = standardized[key];
            if (typeof value === 'string') {
              if (key.toLowerCase().includes('cost') || key.toLowerCase().includes('value') || key.toLowerCase().includes('benefit') || key.toLowerCase().includes('revenue')) {
                const numMatch = value.replace(/[^0-9.]/g, '');
                const num = parseFloat(numMatch);
                if (!isNaN(num)) {
                  if (num >= 1000000) {
                    standardized[key] = `$${(num / 1000000).toFixed(1)}M`;
                  } else if (num >= 1000) {
                    standardized[key] = `$${Math.round(num / 1000)}K`;
                  }
                }
              }
              
              if (key.toLowerCase().includes('time') && !key.toLowerCase().includes('value')) {
                if (value.includes('week')) {
                  const weeks = parseInt(value);
                  if (!isNaN(weeks)) {
                    standardized[key] = `${weeks * 7} days`;
                  }
                } else if (value.includes('month') && !key.toLowerCase().includes('token')) {
                  const months = parseInt(value);
                  if (!isNaN(months)) {
                    standardized[key] = `${months * 30} days`;
                  }
                }
              }
            }
          });
          
          return standardized;
        });
        
        return { ...step, data: standardizedData };
      });
      
      return updated;
    });

    toast({
      title: "Standardization Complete",
      description: "All KPIs have been formatted consistently.",
    });
  };

  const handleSaveWhatIf = async () => {
    if (!analysisData || !reportId) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/whatif/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisData }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "What-If Scenario Saved",
          description: `Saved as ${result.companyName}`,
        });
        setLocation(`/report?company=${encodeURIComponent(result.companyName)}`);
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not save the What-If scenario.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getStepIcon = (step: number) => {
    switch (step) {
      case 2: return <Target className="h-4 w-4" />;
      case 3: return <AlertTriangle className="h-4 w-4" />;
      case 4: return <Lightbulb className="h-4 w-4" />;
      case 5: return <DollarSign className="h-4 w-4" />;
      case 6: return <Calculator className="h-4 w-4" />;
      case 7: return <TrendingUp className="h-4 w-4" />;
      default: return <Settings className="h-4 w-4" />;
    }
  };

  const getStepTitle = (step: number) => {
    switch (step) {
      case 2: return "KPI Baselines";
      case 3: return "Friction Points";
      case 4: return "AI Use Cases";
      case 5: return "Benefits Quantification";
      case 6: return "Token Modeling";
      case 7: return "Priority Scoring";
      default: return `Step ${step}`;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading analysis...</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (!analysisData || !parentReport) {
    return (
      <Layout>
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Report Not Found</h3>
              <p className="text-muted-foreground mb-6">The requested report could not be loaded.</p>
              <Button onClick={() => setLocation("/saved")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Saved Reports
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const stepData = getCurrentStepData();
  const fieldDefs = STEP_FIELD_DEFINITIONS[activeStep] || [];

  return (
    <Layout>
      <div className="container mx-auto max-w-7xl px-3 md:px-4 py-4 md:py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/saved")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h1 className="text-xl md:text-2xl font-display font-bold" data-testid="heading-whatif">
                  What-If Analysis
                </h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Modifying: <span className="font-medium text-foreground">{parentReport.companyName}</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/assumptions/${params?.reportId}`)} data-testid="button-assumptions">
              <Settings className="mr-2 h-4 w-4" />
              Assumptions
            </Button>
            <Button variant="outline" size="sm" onClick={recalculateBenefits} data-testid="button-recalculate">
              <RefreshCw className="mr-2 h-4 w-4" />
              Recalculate Benefits
            </Button>
            <Button variant="outline" size="sm" onClick={standardizeKPIs} data-testid="button-standardize">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Standardize KPIs
            </Button>
            <Button onClick={handleSaveWhatIf} disabled={saving} data-testid="button-save-whatif">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save What-If
            </Button>
          </div>
        </div>

        {/* Use Case Count Setting */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Scenario Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Label htmlFor="use-case-count" className="whitespace-nowrap">Number of Use Cases:</Label>
              <Input
                id="use-case-count"
                type="number"
                min={1}
                max={50}
                value={useCaseCount}
                onChange={(e) => setUseCaseCount(parseInt(e.target.value) || 10)}
                className="w-24"
                data-testid="input-use-case-count"
              />
              <span className="text-sm text-muted-foreground">
                (Current: {getCurrentStepData().length} records in Step {activeStep})
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Step Tabs */}
        <Tabs value={String(activeStep)} onValueChange={(v) => setActiveStep(parseInt(v))}>
          <TabsList className="mb-4 w-full flex-wrap h-auto gap-1">
            {EDITABLE_STEPS.map(step => (
              <TabsTrigger 
                key={step} 
                value={String(step)}
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-testid={`tab-step-${step}`}
              >
                {getStepIcon(step)}
                <span className="hidden sm:inline">Step {step}:</span>
                <span>{getStepTitle(step)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {EDITABLE_STEPS.map(step => (
            <TabsContent key={step} value={String(step)}>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {getStepIcon(step)}
                        Step {step}: {getStepTitle(step)}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {step === 2 && "Define KPI baselines, benchmarks, and targets for each business function."}
                        {step === 3 && "Identify friction points and their estimated annual cost impact."}
                        {step === 4 && "Define AI use cases with primitives and target frictions."}
                        {step === 5 && "Quantify benefits across the 4 business drivers: Revenue, Cost, Cash Flow, and Risk."}
                        {step === 6 && "Model token usage, effort scores, and time-to-value."}
                        {step === 7 && "Set priority scores and recommended implementation phases."}
                      </CardDescription>
                    </div>
                    <Button onClick={handleAddRecord} data-testid="button-add-record">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Record
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {stepData.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No records in this step yet.</p>
                      <Button variant="outline" className="mt-4" onClick={handleAddRecord}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add First Record
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            {fieldDefs.slice(0, 5).map(field => (
                              <TableHead key={field.key} className="whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  {field.label}
                                  {CALCULATED_FIELDS[field.key] && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0 text-blue-500 hover:text-blue-700"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const calcField = CALCULATED_FIELDS[field.key];
                                              const context = buildFormulaContext(step, stepData);
                                              setSelectedFormulaField({
                                                fieldKey: calcField.fieldKey,
                                                fieldLabel: calcField.fieldLabel,
                                                context,
                                              });
                                              setFormulaExplorerOpen(true);
                                            }}
                                            data-testid={`formula-btn-${field.key}`}
                                          >
                                            <FunctionSquare className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>View/Edit formula for {field.label}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              </TableHead>
                            ))}
                            <TableHead className="text-right w-24">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stepData.map((record, index) => (
                            <TableRow key={index} data-testid={`row-record-${index}`}>
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              {fieldDefs.slice(0, 5).map(field => (
                                <TableCell key={field.key} className="max-w-[200px] truncate">
                                  {field.key === "Severity" || field.key === "Priority Tier" ? (
                                    <Badge variant={
                                      record[field.key] === "Critical" ? "destructive" :
                                      record[field.key] === "High" ? "default" :
                                      record[field.key] === "Medium" ? "secondary" : "outline"
                                    }>
                                      {record[field.key] || "-"}
                                    </Badge>
                                  ) : (
                                    <span title={record[field.key]}>{record[field.key] || "-"}</span>
                                  )}
                                </TableCell>
                              ))}
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => handleEditRecord(record, index)}
                                    data-testid={`button-edit-${index}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteRecord(index)}
                                    data-testid={`button-delete-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Edit/Add Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingIndex >= 0 ? (
                  <>
                    <Pencil className="h-5 w-5" />
                    Edit Record
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    Add New Record
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {editingIndex >= 0 
                  ? "Modify the values below and save your changes."
                  : activeStep === 5 && guidanceStep > 0
                    ? `Step ${guidanceStep} of 5: Follow the guided workflow to add a new benefit record.`
                    : "Fill in the fields below to create a new record. Use AI to get suggestions."}
              </DialogDescription>
            </DialogHeader>

            {/* Step 5 Guidance Progress */}
            {activeStep === 5 && editingIndex < 0 && guidanceStep > 0 && (
              <div className="flex items-center gap-2 py-2 px-4 bg-muted rounded-lg mb-4">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div key={step} className="flex items-center">
                    <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                        step < guidanceStep 
                          ? 'bg-green-500 text-white' 
                          : step === guidanceStep 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted-foreground/20 text-muted-foreground'
                      }`}
                    >
                      {step < guidanceStep ? <CheckCircle2 className="h-4 w-4" /> : step}
                    </div>
                    {step < 5 && (
                      <ChevronRight className={`h-4 w-4 mx-1 ${step < guidanceStep ? 'text-green-500' : 'text-muted-foreground/40'}`} />
                    )}
                  </div>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">
                  {guidanceStep === 1 && "Basic Info"}
                  {guidanceStep === 2 && "Revenue"}
                  {guidanceStep === 3 && "Cost"}
                  {guidanceStep === 4 && "Cash Flow & Risk"}
                  {guidanceStep === 5 && "Review & Save"}
                </span>
              </div>
            )}

            <div className="space-y-4 py-4">
              {editingIndex < 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleAISuggest} 
                  disabled={aiSuggesting}
                  className="w-full mb-4"
                  data-testid="button-ai-suggest"
                >
                  {aiSuggesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {aiSuggesting ? "Generating suggestion..." : "Get AI Suggestion (Pre-fill All Fields)"}
                </Button>
              )}

              {/* Step 5 Guided Wizard */}
              {activeStep === 5 && editingIndex < 0 && guidanceStep > 0 ? (
                <div className="space-y-4">
                  {/* Step 1: Basic Info */}
                  {guidanceStep === 1 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <HelpCircle className="h-5 w-5 text-blue-500" />
                        <span className="font-medium">Enter basic information about this use case</span>
                      </div>
                      {fieldDefs.filter(f => f.group === "basic").map(field => (
                        <div key={field.key}>
                          <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
                          <Input
                            id={field.key}
                            value={formData[field.key] || ""}
                            onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="mt-1.5"
                            placeholder={field.key === "ID" ? "e.g., UC-11" : "e.g., AI-Powered Lead Scoring"}
                            data-testid={`input-${field.key}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Step 2: Revenue Benefits */}
                  {guidanceStep === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        <span className="font-medium text-green-700">Revenue Growth Benefits</span>
                      </div>
                      <p className="text-sm text-muted-foreground">How does this use case help grow revenue? Enter the estimated annual benefit and explain the calculation.</p>
                      {fieldDefs.filter(f => f.group === "revenue").map(field => (
                        <div key={field.key}>
                          <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
                          {field.type === "textarea" ? (
                            <Textarea
                              id={field.key}
                              value={formData[field.key] || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="mt-1.5"
                              rows={2}
                              placeholder="e.g., 10% increase in conversion rate × $50M pipeline = $5M"
                              data-testid={`textarea-${field.key}`}
                            />
                          ) : (
                            <Input
                              id={field.key}
                              value={formData[field.key] || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="mt-1.5"
                              placeholder="e.g., $2.5M or $500K"
                              data-testid={`input-${field.key}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Step 3: Cost Benefits */}
                  {guidanceStep === 3 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="h-5 w-5 text-blue-500" />
                        <span className="font-medium text-blue-700">Cost Reduction Benefits</span>
                      </div>
                      <p className="text-sm text-muted-foreground">How does this use case reduce costs? Enter the estimated annual savings and explain the calculation.</p>
                      {fieldDefs.filter(f => f.group === "cost").map(field => (
                        <div key={field.key}>
                          <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
                          {field.type === "textarea" ? (
                            <Textarea
                              id={field.key}
                              value={formData[field.key] || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="mt-1.5"
                              rows={2}
                              placeholder="e.g., 20 hours/week saved × $75/hr × 52 weeks = $78K"
                              data-testid={`textarea-${field.key}`}
                            />
                          ) : (
                            <Input
                              id={field.key}
                              value={formData[field.key] || ""}
                              onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                              className="mt-1.5"
                              placeholder="e.g., $800K or $1.2M"
                              data-testid={`input-${field.key}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Step 4: Cash Flow & Risk */}
                  {guidanceStep === 4 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Calculator className="h-5 w-5 text-purple-500" />
                            <span className="font-medium text-purple-700">Cash Flow Benefits</span>
                          </div>
                          {fieldDefs.filter(f => f.group === "cashflow").map(field => (
                            <div key={field.key}>
                              <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
                              {field.type === "textarea" ? (
                                <Textarea
                                  id={field.key}
                                  value={formData[field.key] || ""}
                                  onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  className="mt-1.5"
                                  rows={2}
                                  placeholder="e.g., 5 days faster collections × $10M monthly = $200K"
                                  data-testid={`textarea-${field.key}`}
                                />
                              ) : (
                                <Input
                                  id={field.key}
                                  value={formData[field.key] || ""}
                                  onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  className="mt-1.5"
                                  placeholder="e.g., $300K"
                                  data-testid={`input-${field.key}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            <span className="font-medium text-orange-700">Risk Reduction Benefits</span>
                          </div>
                          {fieldDefs.filter(f => f.group === "risk").map(field => (
                            <div key={field.key}>
                              <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
                              {field.type === "textarea" ? (
                                <Textarea
                                  id={field.key}
                                  value={formData[field.key] || ""}
                                  onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  className="mt-1.5"
                                  rows={2}
                                  placeholder="e.g., 50% reduction in compliance incidents × $500K avg penalty"
                                  data-testid={`textarea-${field.key}`}
                                />
                              ) : (
                                <Input
                                  id={field.key}
                                  value={formData[field.key] || ""}
                                  onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  className="mt-1.5"
                                  placeholder="e.g., $250K"
                                  data-testid={`input-${field.key}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 5: Review */}
                  {guidanceStep === 5 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="font-medium">Review & Finalize</span>
                      </div>
                      <div className="bg-muted p-4 rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><span className="text-muted-foreground">ID:</span> {formData["ID"] || "Not set"}</div>
                          <div><span className="text-muted-foreground">Use Case:</span> {formData["Use Case"] || "Not set"}</div>
                          <div className="text-green-600"><span className="text-muted-foreground">Revenue:</span> {formData["Revenue Benefit"] || "$0"}</div>
                          <div className="text-blue-600"><span className="text-muted-foreground">Cost:</span> {formData["Cost Benefit"] || "$0"}</div>
                          <div className="text-purple-600"><span className="text-muted-foreground">Cash Flow:</span> {formData["Cash Flow Benefit"] || "$0"}</div>
                          <div className="text-orange-600"><span className="text-muted-foreground">Risk:</span> {formData["Risk Benefit"] || "$0"}</div>
                        </div>
                        <div className="border-t pt-2 mt-2">
                          <span className="font-semibold">Estimated Total Annual Value: </span>
                          <span className="text-lg font-bold text-primary">{calculateTotalAnnualValue(formData)}</span>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="Probability of Success" className="text-sm font-medium">Probability of Success (%)</Label>
                        <Input
                          id="Probability of Success"
                          type="number"
                          min={1}
                          max={100}
                          value={formData["Probability of Success"] || "80"}
                          onChange={(e) => setFormData(prev => ({ ...prev, "Probability of Success": e.target.value }))}
                          className="mt-1.5 w-32"
                          data-testid="input-probability"
                        />
                        <p className="text-xs text-muted-foreground mt-1">This affects the priority scoring in Step 7.</p>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-4 border-t">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        if (guidanceStep > 1) {
                          setGuidanceStep(guidanceStep - 1);
                        } else {
                          setEditDialogOpen(false);
                        }
                      }}
                    >
                      {guidanceStep === 1 ? "Cancel" : "Back"}
                    </Button>
                    {guidanceStep < 5 ? (
                      <Button onClick={() => setGuidanceStep(guidanceStep + 1)}>
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button onClick={handleSaveRecord} data-testid="button-save-record">
                        <Save className="mr-2 h-4 w-4" />
                        Save & Update Priorities
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                /* Standard form for other steps or editing */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fieldDefs.map(field => (
                    <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                      <Label htmlFor={field.key} className="text-sm font-medium">
                        {field.label}
                      </Label>
                      {field.type === "select" ? (
                        <Select
                          value={formData[field.key] || ""}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, [field.key]: value }))}
                        >
                          <SelectTrigger id={field.key} className="mt-1.5" data-testid={`select-${field.key}`}>
                            <SelectValue placeholder={`Select ${field.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.type === "textarea" ? (
                        <Textarea
                          id={field.key}
                          value={formData[field.key] || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="mt-1.5"
                          rows={3}
                          data-testid={`textarea-${field.key}`}
                        />
                      ) : (
                        <Input
                          id={field.key}
                          type={field.type === "number" ? "number" : "text"}
                          value={formData[field.key] || ""}
                          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="mt-1.5"
                          data-testid={`input-${field.key}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer only for non-wizard mode */}
            {!(activeStep === 5 && editingIndex < 0 && guidanceStep > 0) && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveRecord} data-testid="button-save-record">
                  <Save className="mr-2 h-4 w-4" />
                  {editingIndex >= 0 ? "Save Changes" : "Add Record"}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {/* Formula Explorer */}
        <FormulaExplorer
          open={formulaExplorerOpen}
          onOpenChange={setFormulaExplorerOpen}
          fieldKey={selectedFormulaField?.fieldKey || ""}
          fieldLabel={selectedFormulaField?.fieldLabel || ""}
          useCaseId={selectedFormulaField?.useCaseId}
          useCaseName={selectedFormulaField?.useCaseName}
          context={selectedFormulaField?.context || {}}
          onFormulaChange={(newResult) => {
            toast({
              title: "Formula Updated",
              description: `New calculated value: ${newResult}`,
            });
          }}
        />
      </div>
    </Layout>
  );
}
