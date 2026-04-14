import { useState, useMemo } from "react";
import { useLocation } from "wouter";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  ArrowLeft, 
  Search,
  RotateCcw,
  Info,
  Building2,
  Brain,
  TrendingUp,
  Calculator,
  Check,
  X,
  Pencil,
  Save,
  Filter,
  Users,
  BarChart3,
  ShieldAlert,
  Zap,
  FileSpreadsheet,
  Database
} from "lucide-react";
import {
  PARENT_CATEGORIES,
  PARENT_CATEGORY_META,
  ASSUMPTION_CATEGORIES,
  CATEGORY_TO_PARENT,
  CATEGORY_LABELS,
  DEFAULT_ASSUMPTIONS,
  ASSUMPTION_SOURCES,
  type ParentCategory,
  type AssumptionCategory,
  type AssumptionSource
} from "@shared/schema";
import { STANDARDIZED_ROLES, getRolesGroupedByCategory } from "@shared/standardizedRoles";

type ScenarioType = "base" | "conservative" | "aggressive";

interface AssumptionValue {
  fieldName: string;
  displayName: string;
  value: string;
  defaultValue: string;
  valueType: string;
  unit?: string;
  description: string;
  source: AssumptionSource;
  sourceUrl?: string;
  usedInSteps?: string[];
  isEditing?: boolean;
  isCalculated?: boolean;
  formula?: string;
}

interface FormulaTrace {
  formula: string;
  inputs: Record<string, number>;
  intermediates?: Record<string, number>;
  output: number;
}

const SCENARIO_MULTIPLIERS: Record<ScenarioType, { label: string; multiplier: number; description: string }> = {
  base: { label: "Base Case", multiplier: 1.0, description: "Default assumptions" },
  conservative: { label: "Conservative", multiplier: 0.85, description: "15% reduction in benefit estimates" },
  aggressive: { label: "Aggressive", multiplier: 1.20, description: "20% increase in benefit estimates" }
};

const PARENT_CATEGORY_ICONS: Record<ParentCategory, any> = {
  financial_operational: Building2,
  ai_technology: Brain,
  industry_benchmark: TrendingUp,
  performance_operational: Calculator
};

const CATEGORY_ICONS: Record<string, any> = {
  company_financials: Building2,
  labor_statistics: Users,
  customer_metrics: Users,
  compliance_risk: ShieldAlert,
  industry_benchmarks: TrendingUp,
  macroeconomic: BarChart3,
  ai_modeling: Brain,
  ai_adoption: Zap,
  operational_metrics: Calculator,
  kpi_baselines: BarChart3,
  kpi_targets: TrendingUp,
  improvement_uplifts: TrendingUp,
  risk_factors: ShieldAlert
};

const SOURCE_COLORS: Record<AssumptionSource, string> = {
  "Client Provided": "bg-blue-100 text-blue-800 border-blue-200",
  "Industry Benchmark": "bg-green-100 text-green-800 border-green-200",
  "API - External": "bg-purple-100 text-purple-800 border-purple-200",
  "Analyst Estimate": "bg-orange-100 text-orange-800 border-orange-200",
  "System Default": "bg-gray-100 text-gray-800 border-gray-200",
};

const SAMPLE_FORMULAS: Record<string, FormulaTrace> = {
  "ltv_cac_ratio": {
    formula: "LTV / CAC",
    inputs: { ltv: 5000, cac: 500 },
    output: 10
  },
  "fully_burdened_rate": {
    formula: "Average Hourly Wage × Burden Multiplier",
    inputs: { avg_hourly_wage: 32.07, burden_multiplier: 1.40 },
    intermediates: { base_calculation: 44.90 },
    output: 45.65
  },
  "churn_rate": {
    formula: "100% - Retention Rate",
    inputs: { retention_rate: 85 },
    output: 15
  }
};

function buildInitialAssumptions(): Record<AssumptionCategory, AssumptionValue[]> {
  const result: Record<string, AssumptionValue[]> = {};
  
  for (const category of ASSUMPTION_CATEGORIES) {
    const defaults = DEFAULT_ASSUMPTIONS[category] || [];
    result[category] = defaults.map(d => ({
      fieldName: d.fieldName,
      displayName: d.displayName,
      value: d.defaultValue,
      defaultValue: d.defaultValue,
      valueType: d.valueType,
      unit: d.unit,
      description: d.description,
      source: "System Default" as AssumptionSource,
      sourceUrl: d.sourceUrl,
      usedInSteps: d.usedInSteps,
      isCalculated: ["ltv_cac_ratio", "fully_burdened_rate", "churn_rate"].includes(d.fieldName),
      formula: SAMPLE_FORMULAS[d.fieldName]?.formula
    }));
  }
  
  return result as Record<AssumptionCategory, AssumptionValue[]>;
}

export default function Assumptions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [activeScenario, setActiveScenario] = useState<ScenarioType>("base");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [assumptions, setAssumptions] = useState<Record<AssumptionCategory, AssumptionValue[]>>(buildInitialAssumptions);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<{ fieldName: string; displayName: string; trace: FormulaTrace } | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

  const filteredAssumptions = useMemo(() => {
    const result: Record<ParentCategory, { category: AssumptionCategory; fields: AssumptionValue[] }[]> = {
      financial_operational: [],
      ai_technology: [],
      industry_benchmark: [],
      performance_operational: []
    };
    
    for (const category of ASSUMPTION_CATEGORIES) {
      const parentCategory = CATEGORY_TO_PARENT[category];
      let fields = assumptions[category] || [];
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        fields = fields.filter(f => 
          f.displayName.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query) ||
          f.fieldName.toLowerCase().includes(query)
        );
      }
      
      if (categoryFilter !== "all" && category !== categoryFilter) {
        continue;
      }
      
      if (fields.length > 0) {
        result[parentCategory].push({ category, fields });
      }
    }
    
    return result;
  }, [assumptions, searchQuery, categoryFilter]);

  const startEditing = (fieldName: string, currentValue: string) => {
    setEditingField(fieldName);
    setEditValue(currentValue);
  };

  const saveEdit = (category: AssumptionCategory, fieldName: string) => {
    setAssumptions(prev => {
      const updated = { ...prev };
      updated[category] = prev[category].map(f => 
        f.fieldName === fieldName ? { ...f, value: editValue, source: "Client Provided" as AssumptionSource } : f
      );
      return updated;
    });
    setPendingChanges(prev => new Set(prev).add(fieldName));
    setEditingField(null);
    setEditValue("");
    
    toast({
      title: "Value updated",
      description: "Recalculation triggered for dependent fields."
    });
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const resetToDefault = (category: AssumptionCategory, fieldName: string) => {
    setAssumptions(prev => {
      const updated = { ...prev };
      updated[category] = prev[category].map(f => 
        f.fieldName === fieldName ? { ...f, value: f.defaultValue, source: "System Default" as AssumptionSource } : f
      );
      return updated;
    });
    setPendingChanges(prev => {
      const newSet = new Set(prev);
      newSet.delete(fieldName);
      return newSet;
    });
    
    toast({
      title: "Reset to default",
      description: "Value restored to system default."
    });
  };

  const openTraceModal = (fieldName: string, displayName: string) => {
    const trace = SAMPLE_FORMULAS[fieldName];
    if (trace) {
      setSelectedTrace({ fieldName, displayName, trace });
      setTraceModalOpen(true);
    }
  };

  const formatValue = (value: string, valueType: string, unit?: string) => {
    if (valueType === "currency") {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        if (num >= 1000000) {
          return `$${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
          return `$${(num / 1000).toFixed(0)}K`;
        }
        return `$${num.toLocaleString()}`;
      }
    }
    if (valueType === "percentage") {
      return `${value}%`;
    }
    if (unit && unit !== "$") {
      return `${value} ${unit}`;
    }
    return value;
  };

  const applyScenarioMultiplier = (value: string, valueType: string): string => {
    if (activeScenario === "base") return value;
    if (valueType !== "currency" && valueType !== "number" && valueType !== "percentage") return value;
    
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    const multiplier = SCENARIO_MULTIPLIERS[activeScenario].multiplier;
    return (num * multiplier).toFixed(valueType === "percentage" ? 1 : 0);
  };

  const getTotalFields = () => {
    return Object.values(assumptions).reduce((acc, fields) => acc + fields.length, 0);
  };

  const getFilteredCount = () => {
    return Object.values(filteredAssumptions).reduce((acc, categories) => 
      acc + categories.reduce((sum, c) => sum + c.fields.length, 0), 0);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/")}
                  data-testid="back-button"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Assumptions Manager</h1>
                  <p className="text-sm text-slate-500">
                    {getFilteredCount()} of {getTotalFields()} assumptions shown
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {pendingChanges.size > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    {pendingChanges.size} modified
                  </Badge>
                )}
                <Button
                  variant="default"
                  disabled={pendingChanges.size === 0}
                  data-testid="save-all-button"
                  onClick={() => {
                    setPendingChanges(new Set());
                    toast({
                      title: "All changes saved",
                      description: "Assumptions have been saved and recalculations applied."
                    });
                  }}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save All
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Tabs value={activeScenario} onValueChange={(v) => setActiveScenario(v as ScenarioType)} className="mb-6">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="base" data-testid="tab-base">
                Base Case
              </TabsTrigger>
              <TabsTrigger value="conservative" data-testid="tab-conservative">
                Conservative
              </TabsTrigger>
              <TabsTrigger value="aggressive" data-testid="tab-aggressive">
                Aggressive
              </TabsTrigger>
            </TabsList>
            
            <div className="mt-2 text-sm text-slate-500">
              {SCENARIO_MULTIPLIERS[activeScenario].description}
            </div>
          </Tabs>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search assumptions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="search-input"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]" data-testid="category-filter">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {ASSUMPTION_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {PARENT_CATEGORIES.map(parentCategory => {
            const categories = filteredAssumptions[parentCategory];
            if (categories.length === 0) return null;
            
            const ParentIcon = PARENT_CATEGORY_ICONS[parentCategory];
            const meta = PARENT_CATEGORY_META[parentCategory];
            
            return (
              <Card key={parentCategory} className="mb-6">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      parentCategory === "financial_operational" ? "bg-blue-100" :
                      parentCategory === "ai_technology" ? "bg-purple-100" :
                      parentCategory === "industry_benchmark" ? "bg-green-100" :
                      "bg-orange-100"
                    }`}>
                      <ParentIcon className={`h-5 w-5 ${
                        parentCategory === "financial_operational" ? "text-blue-600" :
                        parentCategory === "ai_technology" ? "text-purple-600" :
                        parentCategory === "industry_benchmark" ? "text-green-600" :
                        "text-orange-600"
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{meta.label}</CardTitle>
                      <CardDescription>{meta.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="space-y-2">
                    {categories.map(({ category, fields }) => {
                      const CategoryIcon = CATEGORY_ICONS[category] || Info;
                      return (
                        <AccordionItem key={category} value={category} className="border rounded-lg px-4">
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex items-center gap-2">
                              <CategoryIcon className="h-4 w-4 text-slate-500" />
                              <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                              <Badge variant="secondary" className="ml-2">
                                {fields.length}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[250px]">Field</TableHead>
                                    <TableHead className="w-[150px]">Value</TableHead>
                                    <TableHead className="w-[120px]">Source</TableHead>
                                    <TableHead className="w-[200px]">Description</TableHead>
                                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {fields.map((field) => {
                                    const displayValue = applyScenarioMultiplier(field.value, field.valueType);
                                    const isModified = pendingChanges.has(field.fieldName);
                                    
                                    return (
                                      <TableRow 
                                        key={field.fieldName} 
                                        className={isModified ? "bg-amber-50" : ""}
                                        data-testid={`row-${field.fieldName}`}
                                      >
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-900">
                                              {field.displayName}
                                            </span>
                                            {field.isCalculated && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => openTraceModal(field.fieldName, field.displayName)}
                                                    data-testid={`trace-${field.fieldName}`}
                                                  >
                                                    <Calculator className="h-3.5 w-3.5 text-purple-500" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>View calculation trace</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {editingField === field.fieldName ? (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                className="h-8 w-24"
                                                autoFocus
                                                data-testid={`input-${field.fieldName}`}
                                              />
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => saveEdit(category, field.fieldName)}
                                                data-testid={`save-${field.fieldName}`}
                                              >
                                                <Check className="h-4 w-4 text-green-600" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={cancelEdit}
                                                data-testid={`cancel-${field.fieldName}`}
                                              >
                                                <X className="h-4 w-4 text-red-600" />
                                              </Button>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <span className="font-mono text-sm">
                                                {formatValue(displayValue, field.valueType, field.unit)}
                                              </span>
                                              {activeScenario !== "base" && (
                                                <Badge variant="outline" className="text-xs">
                                                  {activeScenario === "conservative" ? "-15%" : "+20%"}
                                                </Badge>
                                              )}
                                            </div>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <Badge 
                                            variant="outline" 
                                            className={`text-xs ${SOURCE_COLORS[field.source]}`}
                                          >
                                            {field.source}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="text-sm text-slate-500 line-clamp-2 cursor-help">
                                                {field.description}
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                              <p>{field.description}</p>
                                              {field.usedInSteps && field.usedInSteps.length > 0 && (
                                                <p className="mt-1 text-xs text-slate-400">
                                                  Used in steps: {field.usedInSteps.join(", ")}
                                                </p>
                                              )}
                                            </TooltipContent>
                                          </Tooltip>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            {!field.isCalculated && editingField !== field.fieldName && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => startEditing(field.fieldName, field.value)}
                                                    data-testid={`edit-${field.fieldName}`}
                                                  >
                                                    <Pencil className="h-4 w-4 text-slate-500" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Edit value</TooltipContent>
                                              </Tooltip>
                                            )}
                                            {field.value !== field.defaultValue && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => resetToDefault(category, field.fieldName)}
                                                    data-testid={`reset-${field.fieldName}`}
                                                  >
                                                    <RotateCcw className="h-4 w-4 text-slate-500" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Reset to default</TooltipContent>
                                              </Tooltip>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                            {category === "labor_statistics" && (
                              <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                  <Users className="h-4 w-4" />
                                  Standardized Roles Reference
                                </h4>
                                <p className="text-sm text-slate-600 mb-4">
                                  Below are the standardized roles with their default fully-loaded hourly rates used in cost calculations:
                                </p>
                                <div className="overflow-x-auto">
                                  <Table className="text-sm">
                                    <TableHeader>
                                      <TableRow className="bg-slate-50">
                                        <TableHead>Role Name</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Default Rate</TableHead>
                                        <TableHead>Description</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {STANDARDIZED_ROLES.map((role) => (
                                        <TableRow key={role.roleId}>
                                          <TableCell className="font-medium">{role.roleName}</TableCell>
                                          <TableCell>
                                            <Badge variant="outline" className="capitalize">
                                              {role.category}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="font-mono">
                                            ${role.defaultLoadedHourlyRate}/hr
                                          </TableCell>
                                          <TableCell className="text-slate-600 max-w-xs">
                                            {role.description}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            );
          })}

          {getFilteredCount() === 0 && (
            <Card className="py-12">
              <CardContent className="text-center">
                <Search className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No assumptions found</h3>
                <p className="text-slate-500">
                  Try adjusting your search or filter criteria.
                </p>
              </CardContent>
            </Card>
          )}
        </main>

        <Dialog open={traceModalOpen} onOpenChange={setTraceModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-500" />
                How Computed: {selectedTrace?.displayName}
              </DialogTitle>
              <DialogDescription>
                Trace showing how this calculated field is derived
              </DialogDescription>
            </DialogHeader>
            {selectedTrace && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Formula</h4>
                  <code className="text-sm bg-white px-3 py-2 rounded border block">
                    {selectedTrace.trace.formula}
                  </code>
                </div>
                
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-700 mb-2">Inputs</h4>
                  <div className="space-y-1">
                    {Object.entries(selectedTrace.trace.inputs).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-slate-600">{key.replace(/_/g, " ")}</span>
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedTrace.trace.intermediates && (
                  <div className="bg-amber-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-amber-700 mb-2">Intermediate Steps</h4>
                    <div className="space-y-1">
                      {Object.entries(selectedTrace.trace.intermediates).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-slate-600">{key.replace(/_/g, " ")}</span>
                          <span className="font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-700 mb-2">Result</h4>
                  <div className="text-2xl font-bold text-green-800">
                    {selectedTrace.trace.output}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
