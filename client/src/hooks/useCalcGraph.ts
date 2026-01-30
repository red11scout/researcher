/**
 * useCalcGraph Hook - React integration for CalcGraph calculation service
 * 
 * This hook provides:
 * - Assumption management (view, update, reset)
 * - Report recalculation with custom assumptions
 * - Monte Carlo uncertainty analysis
 * - Formula transparency
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// TYPES
// ============================================================================

export interface Unit {
  dimension: string;
  symbol: string;
  scale: number;
  displayFormat?: string;
}

export interface SourceReference {
  id: string;
  type: 'research' | 'user_input' | 'calculation' | 'benchmark' | 'assumption';
  description: string;
  url?: string;
  timestamp: string;
}

export interface CalculatedValue {
  value: number;
  unit: Unit;
  confidenceInterval: [number, number];
  confidenceLevel: 'high' | 'medium' | 'low' | 'estimated';
  formulaRef: string;
  formulaVersion: string;
  sources: SourceReference[];
  calculatedAt: string;
  dependsOn: string[];
}

export interface Assumption {
  id: string;
  name: string;
  description: string;
  currentValue: number;
  defaultValue: number;
  unit: Unit;
  confidenceLevel: 'high' | 'medium' | 'low' | 'estimated';
  source: SourceReference;
  category: string;
  isUserOverride: boolean;
  minValue?: number;
  maxValue?: number;
  step?: number;
}

export interface FormulaDefinition {
  id: string;
  name: string;
  description: string;
  expression: string;
  version: string;
  category: string;
  inputVariables: string[];
  outputUnit: Unit;
  validationRules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MonteCarloResult {
  p10: number;
  p25: number;
  mean: number;
  median: number;
  p75: number;
  p90: number;
  standardDeviation: number;
  sampleSize: number;
  convergenceAchieved: boolean;
}

export interface UncertaintyAnalysis {
  totalValueDistribution: MonteCarloResult;
  sensitivityAnalysis: Array<{
    assumptionId: string;
    assumptionName: string;
    impactOnTotalValue: number;
  }>;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchAssumptions(): Promise<Assumption[]> {
  const response = await fetch('/api/calcgraph/assumptions');
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

async function fetchAssumptionsByCategory(): Promise<Record<string, Assumption[]>> {
  const response = await fetch('/api/calcgraph/assumptions/categories');
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

async function updateAssumption(id: string, value: number): Promise<void> {
  const response = await fetch(`/api/calcgraph/assumptions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
}

async function updateMultipleAssumptions(updates: Array<{ id: string; value: number }>): Promise<void> {
  const response = await fetch('/api/calcgraph/assumptions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
}

async function resetAssumptions(): Promise<void> {
  const response = await fetch('/api/calcgraph/assumptions/reset', {
    method: 'POST',
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
}

async function fetchFormulas(): Promise<FormulaDefinition[]> {
  const response = await fetch('/api/calcgraph/formulas');
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

async function runUncertaintyAnalysis(research: any, sampleSize?: number): Promise<UncertaintyAnalysis> {
  const response = await fetch('/api/calcgraph/uncertainty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ research, sampleSize }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

async function recalculateReport(research: any, assumptions: Array<{ id: string; value: number }>): Promise<any> {
  const response = await fetch('/api/calcgraph/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ research, assumptions }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for managing assumptions
 */
export function useAssumptions() {
  const queryClient = useQueryClient();

  const {
    data: assumptions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['calcgraph', 'assumptions'],
    queryFn: fetchAssumptions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: assumptionsByCategory,
    isLoading: isCategoriesLoading,
  } = useQuery({
    queryKey: ['calcgraph', 'assumptions', 'categories'],
    queryFn: fetchAssumptionsByCategory,
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) => updateAssumption(id, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calcgraph', 'assumptions'] });
    },
  });

  const updateMultipleMutation = useMutation({
    mutationFn: (updates: Array<{ id: string; value: number }>) => updateMultipleAssumptions(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calcgraph', 'assumptions'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetAssumptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calcgraph', 'assumptions'] });
    },
  });

  return {
    assumptions,
    assumptionsByCategory,
    isLoading: isLoading || isCategoriesLoading,
    error,
    refetch,
    updateAssumption: updateMutation.mutate,
    updateMultipleAssumptions: updateMultipleMutation.mutate,
    resetAssumptions: resetMutation.mutate,
    isUpdating: updateMutation.isPending || updateMultipleMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}

/**
 * Hook for viewing formulas
 */
export function useFormulas() {
  const {
    data: formulas,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['calcgraph', 'formulas'],
    queryFn: fetchFormulas,
    staleTime: 30 * 60 * 1000, // 30 minutes (formulas don't change often)
  });

  return {
    formulas,
    isLoading,
    error,
  };
}

/**
 * Hook for Monte Carlo uncertainty analysis
 */
export function useUncertaintyAnalysis() {
  const [analysis, setAnalysis] = useState<UncertaintyAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const runAnalysis = useCallback(async (research: any, sampleSize?: number) => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runUncertaintyAnalysis(research, sampleSize);
      setAnalysis(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Analysis failed'));
      throw err;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return {
    analysis,
    isRunning,
    error,
    runAnalysis,
    clearAnalysis: () => setAnalysis(null),
  };
}

/**
 * Hook for recalculating reports with custom assumptions
 */
export function useRecalculation() {
  const [recalculatedReport, setRecalculatedReport] = useState<any>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const recalculate = useCallback(async (research: any, assumptions: Array<{ id: string; value: number }>) => {
    setIsRecalculating(true);
    setError(null);
    try {
      const result = await recalculateReport(research, assumptions);
      setRecalculatedReport(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Recalculation failed'));
      throw err;
    } finally {
      setIsRecalculating(false);
    }
  }, []);

  return {
    recalculatedReport,
    isRecalculating,
    error,
    recalculate,
    clearRecalculation: () => setRecalculatedReport(null),
  };
}

/**
 * Combined hook for scenario building
 */
export function useScenarioBuilder(initialResearch?: any) {
  const [research, setResearch] = useState(initialResearch);
  const [customAssumptions, setCustomAssumptions] = useState<Array<{ id: string; value: number }>>([]);
  const [baseReport, setBaseReport] = useState<any>(null);
  const [customReport, setCustomReport] = useState<any>(null);

  const { assumptions, isLoading: isLoadingAssumptions } = useAssumptions();
  const { recalculate, isRecalculating } = useRecalculation();
  const { runAnalysis, isRunning: isRunningAnalysis, analysis } = useUncertaintyAnalysis();

  // Update a single assumption
  const updateCustomAssumption = useCallback((id: string, value: number) => {
    setCustomAssumptions(prev => {
      const existing = prev.findIndex(a => a.id === id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { id, value };
        return updated;
      }
      return [...prev, { id, value }];
    });
  }, []);

  // Reset custom assumptions
  const resetCustomAssumptions = useCallback(() => {
    setCustomAssumptions([]);
    setCustomReport(null);
  }, []);

  // Recalculate with current custom assumptions
  const recalculateWithCustomAssumptions = useCallback(async () => {
    if (!research) return;
    const result = await recalculate(research, customAssumptions);
    setCustomReport(result);
    return result;
  }, [research, customAssumptions, recalculate]);

  // Get comparison between base and custom
  const getComparison = useCallback(() => {
    if (!baseReport || !customReport) return null;

    return {
      base: {
        totalValue: baseReport.executiveDashboard?.totalAnnualValue?.value ?? 0,
        revenue: baseReport.executiveDashboard?.totalRevenueBenefit?.value ?? 0,
        cost: baseReport.executiveDashboard?.totalCostBenefit?.value ?? 0,
        cashFlow: baseReport.executiveDashboard?.totalCashFlowBenefit?.value ?? 0,
        risk: baseReport.executiveDashboard?.totalRiskBenefit?.value ?? 0,
      },
      custom: {
        totalValue: customReport.executiveDashboard?.totalAnnualValue?.value ?? 0,
        revenue: customReport.executiveDashboard?.totalRevenueBenefit?.value ?? 0,
        cost: customReport.executiveDashboard?.totalCostBenefit?.value ?? 0,
        cashFlow: customReport.executiveDashboard?.totalCashFlowBenefit?.value ?? 0,
        risk: customReport.executiveDashboard?.totalRiskBenefit?.value ?? 0,
      },
      delta: {
        totalValue: (customReport.executiveDashboard?.totalAnnualValue?.value ?? 0) - 
                    (baseReport.executiveDashboard?.totalAnnualValue?.value ?? 0),
        revenue: (customReport.executiveDashboard?.totalRevenueBenefit?.value ?? 0) - 
                 (baseReport.executiveDashboard?.totalRevenueBenefit?.value ?? 0),
        cost: (customReport.executiveDashboard?.totalCostBenefit?.value ?? 0) - 
              (baseReport.executiveDashboard?.totalCostBenefit?.value ?? 0),
        cashFlow: (customReport.executiveDashboard?.totalCashFlowBenefit?.value ?? 0) - 
                  (baseReport.executiveDashboard?.totalCashFlowBenefit?.value ?? 0),
        risk: (customReport.executiveDashboard?.totalRiskBenefit?.value ?? 0) - 
              (baseReport.executiveDashboard?.totalRiskBenefit?.value ?? 0),
      },
    };
  }, [baseReport, customReport]);

  return {
    // State
    research,
    customAssumptions,
    baseReport,
    customReport,
    assumptions,
    analysis,
    
    // Loading states
    isLoadingAssumptions,
    isRecalculating,
    isRunningAnalysis,
    
    // Actions
    setResearch,
    setBaseReport,
    updateCustomAssumption,
    resetCustomAssumptions,
    recalculateWithCustomAssumptions,
    runUncertaintyAnalysis: () => research && runAnalysis(research),
    getComparison,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a calculated value for display
 */
export function formatCalculatedValue(value: CalculatedValue): string {
  const { value: num, unit } = value;
  
  if (unit.dimension === 'currency' || unit.dimension === 'currency_per_time') {
    if (Math.abs(num) >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1000) {
      return `$${(num / 1000).toFixed(0)}K`;
    }
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  
  if (unit.dimension === 'rate') {
    return `${(num * 100).toFixed(1)}%`;
  }
  
  if (unit.dimension === 'time') {
    return `${num.toFixed(1)} ${unit.symbol}`;
  }
  
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Format confidence interval for display
 */
export function formatConfidenceInterval(value: CalculatedValue): string {
  const [low, high] = value.confidenceInterval;
  const format = (n: number) => formatCalculatedValue({ ...value, value: n });
  return `${format(low)} – ${format(high)}`;
}

/**
 * Get confidence level color
 */
export function getConfidenceLevelColor(level: string): string {
  switch (level) {
    case 'high': return 'text-green-600';
    case 'medium': return 'text-yellow-600';
    case 'low': return 'text-orange-600';
    case 'estimated': return 'text-red-600';
    default: return 'text-gray-600';
  }
}
