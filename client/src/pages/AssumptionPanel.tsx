import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Copy, 
  Trash2, 
  RefreshCw, 
  Info, 
  Building2,
  Users,
  BarChart3,
  Brain,
  ShieldAlert,
  Check,
  X,
  Pencil,
  Database,
  Calculator,
  TrendingUp,
  FileSpreadsheet,
  Lock,
  Unlock,
  ExternalLink,
  Clock,
  Link2,
  Zap
} from "lucide-react";

interface AssumptionField {
  id: string;
  setId: string;
  category: string;
  fieldName: string;
  displayName: string;
  value: string;
  valueType: string;
  unit: string | null;
  source: string;
  sourceUrl: string | null;
  description: string | null;
  usedInSteps: string[] | null;
  autoRefresh: boolean;
  refreshFrequency: string | null;
  lastRefreshedAt: string | null;
  isLocked: boolean;
  isCustom: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface AssumptionSet {
  id: string;
  reportId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  fields?: AssumptionField[];
}

// Parent category structure (from document Section 2)
const PARENT_CATEGORY_INFO: Record<string, { label: string; icon: any; description: string; color: string }> = {
  financial_operational: {
    label: "Company Financial & Operational",
    icon: Building2,
    description: "Revenue, margins, employees, labor costs, CAC, LTV, and compliance metrics",
    color: "bg-blue-600"
  },
  ai_technology: {
    label: "AI Model & Technology",
    icon: Brain,
    description: "LLM models, token costs, context windows, adoption rates, and confidence multipliers",
    color: "bg-purple-600"
  },
  industry_benchmark: {
    label: "Industry Benchmarks",
    icon: TrendingUp,
    description: "Revenue multiples, WACC, market volatility, and macroeconomic indicators",
    color: "bg-green-600"
  },
  performance_operational: {
    label: "Operational & Performance",
    icon: Calculator,
    description: "Baseline KPIs, target KPIs, process metrics, and improvement uplift assumptions",
    color: "bg-orange-600"
  },
};

// Subcategory information with parent mapping
const CATEGORY_INFO: Record<string, { label: string; icon: any; description: string; color: string; parent: string }> = {
  company_financials: { 
    label: "Company Financials", 
    icon: Building2, 
    description: "Revenue, margins, and financial metrics from 10-K/10-Q filings",
    color: "bg-blue-500",
    parent: "financial_operational"
  },
  labor_statistics: { 
    label: "Labor Statistics", 
    icon: Users, 
    description: "Workforce costs and headcount metrics from BLS data",
    color: "bg-blue-400",
    parent: "financial_operational"
  },
  customer_metrics: { 
    label: "Customer Metrics", 
    icon: Users, 
    description: "CAC, LTV, retention rates, and customer satisfaction",
    color: "bg-blue-300",
    parent: "financial_operational"
  },
  compliance_risk: { 
    label: "Compliance & Risk", 
    icon: ShieldAlert, 
    description: "Compliance costs, audit failure rates, and regulatory fines",
    color: "bg-blue-200",
    parent: "financial_operational"
  },
  industry_benchmarks: { 
    label: "Industry Benchmarks", 
    icon: TrendingUp, 
    description: "Sector multiples, WACC, and competitive metrics",
    color: "bg-green-500",
    parent: "industry_benchmark"
  },
  macroeconomic: { 
    label: "Macroeconomic Indicators", 
    icon: BarChart3, 
    description: "Inflation, GDP, interest rates, and market volatility",
    color: "bg-green-400",
    parent: "industry_benchmark"
  },
  ai_modeling: { 
    label: "AI Model Costs", 
    icon: Brain, 
    description: "Token pricing, caching, and model parameters",
    color: "bg-purple-500",
    parent: "ai_technology"
  },
  ai_adoption: { 
    label: "AI Adoption & Confidence", 
    icon: Zap, 
    description: "Adoption rates, confidence multipliers, and ramp-up times",
    color: "bg-purple-400",
    parent: "ai_technology"
  },
  risk_factors: { 
    label: "Risk & Weighting Factors", 
    icon: ShieldAlert, 
    description: "Confidence factors, adoption rates, and priority scoring weights",
    color: "bg-purple-300",
    parent: "ai_technology"
  },
  operational_metrics: { 
    label: "Operational Metrics", 
    icon: Calculator, 
    description: "Process volumes, cycle times, and automation rates",
    color: "bg-orange-500",
    parent: "performance_operational"
  },
  kpi_baselines: { 
    label: "Baseline KPIs", 
    icon: BarChart3, 
    description: "Current performance indicators for each business function",
    color: "bg-orange-400",
    parent: "performance_operational"
  },
  kpi_targets: { 
    label: "Target KPIs", 
    icon: TrendingUp, 
    description: "Desired future values for each KPI",
    color: "bg-orange-300",
    parent: "performance_operational"
  },
  improvement_uplifts: { 
    label: "Improvement Uplifts", 
    icon: TrendingUp, 
    description: "Expected conversion, retention, and cycle-time improvements",
    color: "bg-orange-200",
    parent: "performance_operational"
  },
};

const SOURCE_OPTIONS = [
  { value: "Client Provided", label: "Client Provided", icon: FileSpreadsheet },
  { value: "Industry Benchmark", label: "Industry Benchmark", icon: TrendingUp },
  { value: "API - External", label: "API - External", icon: Database },
  { value: "Analyst Estimate", label: "Analyst Estimate", icon: Calculator },
  { value: "System Default", label: "System Default", icon: Info },
];

const SOURCE_COLORS: Record<string, string> = {
  "Client Provided": "bg-blue-100 text-blue-800 border-blue-200",
  "Industry Benchmark": "bg-green-100 text-green-800 border-green-200",
  "API - External": "bg-purple-100 text-purple-800 border-purple-200",
  "Analyst Estimate": "bg-orange-100 text-orange-800 border-orange-200",
  "System Default": "bg-gray-100 text-gray-800 border-gray-200",
};

export default function AssumptionPanel() {
  const params = useParams();
  const reportId = params.reportId as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ value: string; source: string }>({ value: "", source: "" });
  const [newScenarioName, setNewScenarioName] = useState("");
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldData, setNewFieldData] = useState({
    category: "company_financials",
    fieldName: "",
    displayName: "",
    value: "",
    valueType: "text",
    unit: "",
    description: "",
  });
  const [pendingChanges, setPendingChanges] = useState<Record<string, { value: string; source: string }>>({});

  // Fetch report data
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["/api/reports", reportId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/${reportId}`);
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: !!reportId,
  });

  // Fetch all assumption sets for this report
  const { data: sets = [], isLoading: setsLoading } = useQuery<AssumptionSet[]>({
    queryKey: ["/api/assumptions/sets", reportId],
    queryFn: async () => {
      const res = await fetch(`/api/assumptions/sets/${reportId}`);
      if (!res.ok) throw new Error("Failed to fetch assumption sets");
      return res.json();
    },
    enabled: !!reportId,
  });

  // Fetch active set with fields
  const { data: activeSet, isLoading: activeSetLoading, refetch: refetchActiveSet } = useQuery<AssumptionSet | null>({
    queryKey: ["/api/assumptions/sets/active", reportId],
    queryFn: async () => {
      const res = await fetch(`/api/assumptions/sets/${reportId}/active`);
      if (!res.ok) throw new Error("Failed to fetch active assumption set");
      return res.json();
    },
    enabled: !!reportId,
  });

  // Create assumption set mutation
  const createSetMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch("/api/assumptions/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          reportId, 
          name: data.name, 
          description: data.description,
          companyName: report?.companyName 
        }),
      });
      if (!res.ok) throw new Error("Failed to create assumption set");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets", reportId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
      setShowNewScenario(false);
      setNewScenarioName("");
      toast({ title: "Scenario created", description: "New assumption scenario created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Activate set mutation
  const activateSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      const res = await fetch(`/api/assumptions/sets/${setId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      if (!res.ok) throw new Error("Failed to activate assumption set");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets", reportId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
      setPendingChanges({});
      toast({ title: "Scenario activated", description: "Switched to selected scenario" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Duplicate set mutation
  const duplicateSetMutation = useMutation({
    mutationFn: async ({ setId, newName }: { setId: string; newName: string }) => {
      const res = await fetch(`/api/assumptions/sets/${setId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName }),
      });
      if (!res.ok) throw new Error("Failed to duplicate assumption set");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets", reportId] });
      toast({ title: "Scenario duplicated", description: "New scenario created from copy" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete set mutation
  const deleteSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      const res = await fetch(`/api/assumptions/sets/${setId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete assumption set");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets", reportId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
      toast({ title: "Scenario deleted", description: "Assumption scenario removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update field mutation
  const updateFieldMutation = useMutation({
    mutationFn: async ({ fieldId, value, source }: { fieldId: string; value: string; source: string }) => {
      const res = await fetch(`/api/assumptions/fields/${fieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, source }),
      });
      if (!res.ok) throw new Error("Failed to update field");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async (updates: Array<{ fieldId: string; value: string; source: string }>) => {
      const res = await fetch("/api/assumptions/fields/batch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
      setPendingChanges({});
      toast({ title: "Changes saved", description: "All assumption updates saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Recalculate report mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/assumptions/recalculate/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to recalculate report");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", reportId] });
      queryClient.invalidateQueries({ queryKey: [`/api/reports/${reportId}`] });
      toast({ 
        title: "Report recalculated", 
        description: "All calculations updated with current assumptions" 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Create custom field mutation
  const createFieldMutation = useMutation({
    mutationFn: async (data: typeof newFieldData) => {
      const res = await fetch("/api/assumptions/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          setId: activeSet?.id,
          ...data,
          source: "Client Provided"
        }),
      });
      if (!res.ok) throw new Error("Failed to create field");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
      setShowAddField(false);
      setNewFieldData({
        category: "company_profile",
        fieldName: "",
        displayName: "",
        value: "",
        valueType: "text",
        unit: "",
        description: "",
      });
      toast({ title: "Field added", description: "Custom assumption field created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete field mutation
  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const res = await fetch(`/api/assumptions/fields/${fieldId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete field");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/sets/active", reportId] });
      toast({ title: "Field deleted", description: "Custom assumption field removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Auto-create default set if none exists
  useEffect(() => {
    if (!setsLoading && sets.length === 0 && reportId && report?.companyName) {
      createSetMutation.mutate({ 
        name: "Base Case", 
        description: "Default assumptions for analysis" 
      });
    }
  }, [setsLoading, sets.length, reportId, report?.companyName]);

  const startEditing = (field: AssumptionField) => {
    setEditingField(field.id);
    const pending = pendingChanges[field.id];
    setEditValues({
      value: pending?.value ?? field.value,
      source: pending?.source ?? field.source,
    });
  };

  const saveFieldEdit = (fieldId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [fieldId]: { value: editValues.value, source: editValues.source }
    }));
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValues({ value: "", source: "" });
  };

  const saveAllChanges = async () => {
    const updates = Object.entries(pendingChanges).map(([fieldId, changes]) => ({
      fieldId,
      value: changes.value,
      source: changes.source,
    }));
    if (updates.length > 0) {
      await batchUpdateMutation.mutateAsync(updates);
    }
  };

  const saveAndRecalculate = async () => {
    const updates = Object.entries(pendingChanges).map(([fieldId, changes]) => ({
      fieldId,
      value: changes.value,
      source: changes.source,
    }));
    if (updates.length > 0) {
      await batchUpdateMutation.mutateAsync(updates);
    }
    await recalculateMutation.mutateAsync();
  };

  const formatValue = (value: string, valueType: string, unit?: string | null) => {
    if (valueType === "currency") {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return `$${num.toLocaleString()}${unit && unit !== "$" ? ` ${unit}` : ""}`;
      }
    }
    if (valueType === "percentage") {
      return `${value}%`;
    }
    if (unit) {
      return `${value} ${unit}`;
    }
    return value;
  };

  const getFieldsByCategory = (category: string) => {
    if (!activeSet?.fields) return [];
    return activeSet.fields
      .filter(f => f.category === category)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const isLoading = reportLoading || setsLoading || activeSetLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-lg text-slate-600">Loading assumptions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation(`/whatif/${reportId}`)}
                data-testid="back-button"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to What-If Analysis
              </Button>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <h1 className="text-xl font-bold text-slate-900">Assumption Control Panel</h1>
                <p className="text-sm text-slate-500">{report?.companyName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {hasPendingChanges && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {Object.keys(pendingChanges).length} unsaved changes
                </Badge>
              )}
              <Button
                variant="default"
                onClick={saveAllChanges}
                disabled={!hasPendingChanges || batchUpdateMutation.isPending}
                data-testid="save-all-button"
              >
                <Save className="h-4 w-4 mr-2" />
                Save All Changes
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Scenario Selector */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Active Scenario</CardTitle>
                <CardDescription>Select or create assumption scenarios for comparison</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewScenarioName("Optimistic");
                    setShowNewScenario(true);
                  }}
                  data-testid="preset-optimistic-button"
                  className="border-green-200 text-green-700 hover:bg-green-50"
                >
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Optimistic
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewScenarioName("Conservative");
                    setShowNewScenario(true);
                  }}
                  data-testid="preset-conservative-button"
                  className="border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  <ShieldAlert className="h-4 w-4 mr-1" />
                  Conservative
                </Button>
                <Dialog open={showNewScenario} onOpenChange={setShowNewScenario}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="new-scenario-button">
                      <Plus className="h-4 w-4 mr-2" />
                      Custom
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Scenario</DialogTitle>
                      <DialogDescription>
                        Create a new assumption scenario with default values
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Label htmlFor="scenario-name">Scenario Name</Label>
                      <Input
                        id="scenario-name"
                        value={newScenarioName}
                        onChange={(e) => setNewScenarioName(e.target.value)}
                        placeholder="e.g., Optimistic, Conservative"
                        className="mt-2"
                        data-testid="scenario-name-input"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewScenario(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createSetMutation.mutate({ name: newScenarioName })}
                        disabled={!newScenarioName.trim() || createSetMutation.isPending}
                        data-testid="create-scenario-submit"
                      >
                        Create Scenario
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {sets.map((set) => (
                <div
                  key={set.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    set.isActive
                      ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <button
                    onClick={() => activateSetMutation.mutate(set.id)}
                    className="font-medium text-slate-900 hover:text-blue-600"
                    data-testid={`scenario-${set.id}`}
                  >
                    {set.name}
                    {set.isDefault && (
                      <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>
                    )}
                  </button>
                  <div className="flex items-center gap-1 border-l pl-2 ml-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => duplicateSetMutation.mutate({ 
                            setId: set.id, 
                            newName: `${set.name} (Copy)` 
                          })}
                          data-testid={`duplicate-scenario-${set.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Duplicate scenario</TooltipContent>
                    </Tooltip>
                    {!set.isDefault && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => deleteSetMutation.mutate(set.id)}
                            data-testid={`delete-scenario-${set.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete scenario</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Assumption Categories */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Assumption Values</h2>
          <Dialog open={showAddField} onOpenChange={setShowAddField}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="add-field-button">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Field
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Custom Assumption Field</DialogTitle>
                <DialogDescription>
                  Create a custom field for tracking additional assumptions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={newFieldData.category}
                    onValueChange={(v) => setNewFieldData(prev => ({ ...prev, category: v }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                        <SelectItem key={key} value={key}>{info.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Display Name</Label>
                  <Input
                    value={newFieldData.displayName}
                    onChange={(e) => {
                      const display = e.target.value;
                      const fieldName = display.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                      setNewFieldData(prev => ({ ...prev, displayName: display, fieldName }));
                    }}
                    placeholder="e.g., Average Deal Size"
                    className="mt-2"
                    data-testid="new-field-display-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Value Type</Label>
                    <Select
                      value={newFieldData.valueType}
                      onValueChange={(v) => setNewFieldData(prev => ({ ...prev, valueType: v }))}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="currency">Currency</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Unit (optional)</Label>
                    <Input
                      value={newFieldData.unit}
                      onChange={(e) => setNewFieldData(prev => ({ ...prev, unit: e.target.value }))}
                      placeholder="e.g., $/hr, %"
                      className="mt-2"
                    />
                  </div>
                </div>
                <div>
                  <Label>Initial Value</Label>
                  <Input
                    value={newFieldData.value}
                    onChange={(e) => setNewFieldData(prev => ({ ...prev, value: e.target.value }))}
                    placeholder="Enter value"
                    className="mt-2"
                    data-testid="new-field-value"
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Input
                    value={newFieldData.description}
                    onChange={(e) => setNewFieldData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of this assumption"
                    className="mt-2"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddField(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createFieldMutation.mutate(newFieldData)}
                  disabled={!newFieldData.displayName.trim() || createFieldMutation.isPending}
                  data-testid="create-field-submit"
                >
                  Add Field
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

{/* Parent Category Accordions - Hierarchical Structure */}
        <Accordion type="multiple" defaultValue={["financial_operational", "ai_technology", "industry_benchmark", "performance_operational"]} className="space-y-4">
          {Object.entries(PARENT_CATEGORY_INFO).map(([parentKey, parentInfo]) => {
            const ParentIcon = parentInfo.icon;
            
            const subcategories = Object.entries(CATEGORY_INFO)
              .filter(([, info]) => info.parent === parentKey)
              .sort(([a], [b]) => {
                const order = Object.keys(CATEGORY_INFO);
                return order.indexOf(a) - order.indexOf(b);
              });
            
            const totalFields = subcategories.reduce((sum, [cat]) => sum + getFieldsByCategory(cat).length, 0);
            
            if (totalFields === 0 && !subcategories.length) return null;
            
            return (
              <AccordionItem
                key={parentKey}
                value={parentKey}
                className="border-2 rounded-xl bg-white shadow-md overflow-hidden"
              >
                <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50">
                  <div className="flex items-center gap-4 w-full">
                    <div className={`p-3 rounded-xl ${parentInfo.color}`}>
                      <ParentIcon className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-left flex-1">
                      <h2 className="text-lg font-bold text-slate-900">{parentInfo.label}</h2>
                      <p className="text-sm text-slate-500">{parentInfo.description}</p>
                    </div>
                    <Badge variant="secondary" className="text-sm px-3 py-1 mr-4">
                      {totalFields} fields
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5">
                  <Accordion type="multiple" defaultValue={subcategories.map(([cat]) => cat)} className="space-y-2 mt-2">
                    {subcategories.map(([category, info]) => {
                      const fields = getFieldsByCategory(category);
                      const Icon = info.icon;
                      
                      return (
                        <AccordionItem
                          key={category}
                          value={category}
                          className="border rounded-lg bg-slate-50 overflow-hidden"
                        >
                          <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-slate-100">
                            <div className="flex items-center gap-3 w-full">
                              <div className={`p-1.5 rounded-lg ${info.color} bg-opacity-20`}>
                                <Icon className={`h-4 w-4 ${info.color.replace("bg-", "text-")}`} />
                              </div>
                              <div className="text-left flex-1">
                                <h3 className="font-semibold text-sm text-slate-800">{info.label}</h3>
                              </div>
                              <Badge variant="outline" className="text-xs mr-3">
                                {fields.length} fields
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-3">
                            <div className="space-y-2 mt-2">
                              {fields.map((field) => {
                                const isEditing = editingField === field.id;
                                const pending = pendingChanges[field.id];
                                const displayValue = pending?.value ?? field.value;
                                const displaySource = pending?.source ?? field.source;
                                const hasChange = !!pending;

                                return (
                                  <div
                                    key={field.id}
                                    className={`p-3 rounded-lg border transition-all ${
                                      hasChange
                                        ? "bg-amber-50 border-amber-200"
                                        : field.isLocked
                                        ? "bg-white border-slate-200"
                                        : "bg-white border-slate-100"
                                    }`}
                                    data-testid={`field-row-${field.fieldName}`}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-medium text-slate-900">
                                            {field.displayName}
                                          </span>
                                          {field.isLocked && (
                                            <Tooltip>
                                              <TooltipTrigger>
                                                <Lock className="h-3.5 w-3.5 text-amber-600" />
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Locked - auto-refresh disabled
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                          {field.autoRefresh && !field.isLocked && (
                                            <Tooltip>
                                              <TooltipTrigger>
                                                <Zap className="h-3.5 w-3.5 text-green-600" />
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Auto-refresh: {field.refreshFrequency || "enabled"}
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                          {field.isCustom && (
                                            <Badge variant="outline" className="text-xs">Custom</Badge>
                                          )}
                                          {field.description && (
                                            <Tooltip>
                                              <TooltipTrigger>
                                                <Info className="h-3.5 w-3.5 text-slate-400" />
                                              </TooltipTrigger>
                                              <TooltipContent className="max-w-xs">
                                                <p>{field.description}</p>
                                                {field.sourceUrl && (
                                                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                                                    <ExternalLink className="h-3 w-3" />
                                                    Source: {field.sourceUrl}
                                                  </p>
                                                )}
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                        {field.usedInSteps && field.usedInSteps.length > 0 && (
                                          <div className="flex items-center gap-1 mt-1">
                                            <Link2 className="h-3 w-3 text-slate-400" />
                                            <span className="text-xs text-slate-500">
                                              Used in: {field.usedInSteps.map(s => s === "summary" ? "Summary" : `Step ${s}`).join(", ")}
                                            </span>
                                          </div>
                                        )}
                                      </div>

                                      {isEditing ? (
                                        <div className="flex items-center gap-2">
                                          <Input
                                            value={editValues.value}
                                            onChange={(e) => setEditValues(prev => ({ ...prev, value: e.target.value }))}
                                            className="w-32 h-8"
                                            autoFocus
                                            data-testid={`edit-value-${field.fieldName}`}
                                          />
                                          <Select
                                            value={editValues.source}
                                            onValueChange={(v) => setEditValues(prev => ({ ...prev, source: v }))}
                                          >
                                            <SelectTrigger className="w-40 h-8">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {SOURCE_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                  {opt.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                            onClick={() => saveFieldEdit(field.id)}
                                            data-testid={`save-field-${field.fieldName}`}
                                          >
                                            <Check className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-500 hover:text-slate-700"
                                            onClick={cancelEdit}
                                            data-testid={`cancel-edit-${field.fieldName}`}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3">
                                          <span className="font-mono text-sm text-slate-700 min-w-[100px] text-right">
                                            {formatValue(displayValue, field.valueType, field.unit)}
                                          </span>
                                          <Badge 
                                            variant="outline" 
                                            className={`text-xs ${SOURCE_COLORS[displaySource] || SOURCE_COLORS["System Default"]}`}
                                          >
                                            {displaySource}
                                          </Badge>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                            onClick={() => startEditing(field)}
                                            data-testid={`edit-field-${field.fieldName}`}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          {field.isCustom && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                                              onClick={() => deleteFieldMutation.mutate(field.id)}
                                              data-testid={`delete-field-${field.fieldName}`}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              
                              {fields.length === 0 && (
                                <div className="text-center py-4 text-slate-500 text-sm">
                                  No fields in this subcategory yet
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Recalculation Notice */}
        {hasPendingChanges && (
          <Card className="mt-6 border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    You have unsaved changes that will affect calculations
                  </p>
                  <p className="text-sm text-amber-700">
                    Save your changes to update all dependent calculations in the analysis
                  </p>
                </div>
                <Button
                  className="ml-auto"
                  onClick={saveAndRecalculate}
                  disabled={batchUpdateMutation.isPending || recalculateMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save & Recalculate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
