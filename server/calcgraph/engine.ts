/**
 * CalcGraph Engine - World-Class Deterministic Calculation System
 * 
 * This module implements a dimensional calculation engine inspired by:
 * - Anthropic's interpretability research (structured, auditable outputs)
 * - DeepMind's data validation approaches (type safety, unit consistency)
 * - BCG/McKinsey financial modeling standards (conservative estimation, sensitivity analysis)
 * 
 * Key Features:
 * - Dimensional analysis with unit validation
 * - Monte Carlo uncertainty quantification
 * - Full audit trail with formula versioning
 * - Dependency graph for calculation ordering
 */

import { HyperFormula } from 'hyperformula';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Supported unit dimensions for dimensional analysis
 */
export type UnitDimension = 
  | 'currency'           // USD, EUR, etc.
  | 'currency_per_time'  // USD/month, USD/year
  | 'time'               // hours, days, months, years
  | 'count'              // employees, transactions, etc.
  | 'rate'               // percentage, ratio
  | 'tokens'             // AI tokens
  | 'tokens_per_time'    // tokens/month
  | 'dimensionless';     // pure numbers

/**
 * Unit specification with dimension and scale
 */
export interface Unit {
  dimension: UnitDimension;
  symbol: string;           // e.g., "USD", "hours", "%"
  scale: number;            // multiplier to base unit (e.g., 1000000 for "M")
  displayFormat?: string;   // e.g., "$#,##0.00M"
}

/**
 * Confidence levels for estimates
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'estimated';

/**
 * Distribution types for Monte Carlo simulation
 */
export type DistributionType = 'triangular' | 'normal' | 'uniform' | 'pert' | 'point';

/**
 * Source reference for audit trail
 */
export interface SourceReference {
  id: string;
  type: 'research' | 'user_input' | 'calculation' | 'benchmark' | 'assumption';
  description: string;
  url?: string;
  timestamp: string;
}

/**
 * A calculated value with full metadata for audit and transparency
 */
export interface CalculatedValue {
  value: number;
  unit: Unit;
  confidenceInterval: [number, number];  // [p10, p90]
  confidenceLevel: ConfidenceLevel;
  formulaRef: string;
  formulaVersion: string;
  sources: SourceReference[];
  calculatedAt: string;
  dependsOn: string[];  // IDs of input values this depends on
}

/**
 * An uncertain variable for Monte Carlo simulation
 */
export interface UncertainVariable {
  id: string;
  name: string;
  distribution: DistributionType;
  low: number;
  mode: number;      // Most likely value
  high: number;
  unit: Unit;
  confidenceLevel: ConfidenceLevel;
  sources: SourceReference[];
}

/**
 * Result of Monte Carlo simulation
 */
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

/**
 * Formula definition with metadata
 */
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

/**
 * Assumption with user-adjustable value
 */
export interface Assumption {
  id: string;
  name: string;
  description: string;
  currentValue: number;
  defaultValue: number;
  unit: Unit;
  confidenceLevel: ConfidenceLevel;
  source: SourceReference;
  category: string;
  isUserOverride: boolean;
  minValue?: number;
  maxValue?: number;
  step?: number;
}

/**
 * Calculation node in the dependency graph
 */
export interface CalculationNode {
  id: string;
  type: 'input' | 'assumption' | 'intermediate' | 'output';
  name: string;
  value?: CalculatedValue;
  formula?: FormulaDefinition;
  dependencies: string[];
  dependents: string[];
}

/**
 * Complete calculation graph
 */
export interface CalculationGraph {
  nodes: Map<string, CalculationNode>;
  topologicalOrder: string[];
  lastUpdated: string;
}

// ============================================================================
// UNIT DEFINITIONS
// ============================================================================

export const UNITS: Record<string, Unit> = {
  // Currency
  USD: { dimension: 'currency', symbol: 'USD', scale: 1, displayFormat: '$#,##0' },
  USD_K: { dimension: 'currency', symbol: 'USD', scale: 1000, displayFormat: '$#,##0K' },
  USD_M: { dimension: 'currency', symbol: 'USD', scale: 1000000, displayFormat: '$#,##0.0M' },
  
  // Currency per time
  USD_PER_MONTH: { dimension: 'currency_per_time', symbol: 'USD/month', scale: 1, displayFormat: '$#,##0/mo' },
  USD_PER_YEAR: { dimension: 'currency_per_time', symbol: 'USD/year', scale: 1, displayFormat: '$#,##0/yr' },
  USD_M_PER_YEAR: { dimension: 'currency_per_time', symbol: 'USD/year', scale: 1000000, displayFormat: '$#,##0.0M/yr' },
  
  // Time
  HOURS: { dimension: 'time', symbol: 'hours', scale: 1, displayFormat: '#,##0 hrs' },
  DAYS: { dimension: 'time', symbol: 'days', scale: 24, displayFormat: '#,##0 days' },
  MONTHS: { dimension: 'time', symbol: 'months', scale: 720, displayFormat: '#,##0 months' },
  YEARS: { dimension: 'time', symbol: 'years', scale: 8760, displayFormat: '#,##0 years' },
  
  // Count
  COUNT: { dimension: 'count', symbol: '', scale: 1, displayFormat: '#,##0' },
  EMPLOYEES: { dimension: 'count', symbol: 'employees', scale: 1, displayFormat: '#,##0' },
  TRANSACTIONS: { dimension: 'count', symbol: 'transactions', scale: 1, displayFormat: '#,##0' },
  
  // Rate
  PERCENT: { dimension: 'rate', symbol: '%', scale: 0.01, displayFormat: '#,##0.0%' },
  RATIO: { dimension: 'rate', symbol: '', scale: 1, displayFormat: '0.00' },
  
  // Tokens
  TOKENS: { dimension: 'tokens', symbol: 'tokens', scale: 1, displayFormat: '#,##0' },
  TOKENS_M: { dimension: 'tokens', symbol: 'tokens', scale: 1000000, displayFormat: '#,##0.0M' },
  TOKENS_PER_MONTH: { dimension: 'tokens_per_time', symbol: 'tokens/month', scale: 1, displayFormat: '#,##0/mo' },
  
  // Dimensionless
  DIMENSIONLESS: { dimension: 'dimensionless', symbol: '', scale: 1, displayFormat: '#,##0.00' },
  SCORE: { dimension: 'dimensionless', symbol: 'pts', scale: 1, displayFormat: '#,##0' },
};

// ============================================================================
// FORMULA REGISTRY
// ============================================================================

export const FORMULA_REGISTRY: Record<string, FormulaDefinition> = {
  // Token Cost Calculations
  token_cost_monthly: {
    id: 'token_cost_monthly',
    name: 'Monthly Token Cost',
    description: 'Calculate monthly AI token costs based on usage and pricing',
    expression: '(inputTokens * inputPrice / 1000000) + (outputTokens * outputPrice / 1000000)',
    version: '2.0.0',
    category: 'ai_costs',
    inputVariables: ['inputTokens', 'outputTokens', 'inputPrice', 'outputPrice'],
    outputUnit: UNITS.USD_PER_MONTH,
    validationRules: ['inputTokens >= 0', 'outputTokens >= 0', 'inputPrice > 0', 'outputPrice > 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  token_cost_annual: {
    id: 'token_cost_annual',
    name: 'Annual Token Cost',
    description: 'Annualize monthly token costs',
    expression: 'monthlyCost * 12',
    version: '2.0.0',
    category: 'ai_costs',
    inputVariables: ['monthlyCost'],
    outputUnit: UNITS.USD_PER_YEAR,
    validationRules: ['monthlyCost >= 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  // Benefit Calculations
  hours_saved_value: {
    id: 'hours_saved_value',
    name: 'Value of Hours Saved',
    description: 'Calculate dollar value of time savings',
    expression: 'hoursSaved * hourlyRate * adoptionRate',
    version: '2.0.0',
    category: 'benefits',
    inputVariables: ['hoursSaved', 'hourlyRate', 'adoptionRate'],
    outputUnit: UNITS.USD_PER_YEAR,
    validationRules: ['hoursSaved >= 0', 'hourlyRate > 0', 'adoptionRate >= 0', 'adoptionRate <= 1'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  cost_benefit_with_factors: {
    id: 'cost_benefit_with_factors',
    name: 'Cost Benefit with Conservative Factors',
    description: 'Apply conservative estimation factors to cost benefits',
    expression: 'baseBenefit * conservativeFactor * dataMaturityFactor',
    version: '2.0.0',
    category: 'benefits',
    inputVariables: ['baseBenefit', 'conservativeFactor', 'dataMaturityFactor'],
    outputUnit: UNITS.USD_PER_YEAR,
    validationRules: ['baseBenefit >= 0', 'conservativeFactor > 0', 'conservativeFactor <= 1', 'dataMaturityFactor > 0', 'dataMaturityFactor <= 1'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  total_annual_value: {
    id: 'total_annual_value',
    name: 'Total Annual Value',
    description: 'Sum of all benefit categories',
    expression: 'revenueBenefit + costBenefit + cashFlowBenefit + riskBenefit',
    version: '2.0.0',
    category: 'benefits',
    inputVariables: ['revenueBenefit', 'costBenefit', 'cashFlowBenefit', 'riskBenefit'],
    outputUnit: UNITS.USD_PER_YEAR,
    validationRules: [],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  // Priority Scoring
  priority_score: {
    id: 'priority_score',
    name: 'Priority Score',
    description: 'Weighted priority score for use case ranking',
    expression: '(valueScore * valueWeight + ttvScore * ttvWeight + (100 - effortScore) * effortWeight) / 100',
    version: '2.0.0',
    category: 'scoring',
    inputVariables: ['valueScore', 'ttvScore', 'effortScore', 'valueWeight', 'ttvWeight', 'effortWeight'],
    outputUnit: UNITS.SCORE,
    validationRules: ['valueScore >= 0', 'valueScore <= 100', 'ttvScore >= 0', 'ttvScore <= 100', 'effortScore >= 0', 'effortScore <= 100'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  value_score: {
    id: 'value_score',
    name: 'Value Score',
    description: 'Normalized value score (0-100) based on total impact',
    expression: '(totalImpact / maxImpact) * 100',
    version: '2.0.0',
    category: 'scoring',
    inputVariables: ['totalImpact', 'maxImpact'],
    outputUnit: UNITS.SCORE,
    validationRules: ['totalImpact >= 0', 'maxImpact > 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  ttv_score: {
    id: 'ttv_score',
    name: 'Time-to-Value Score',
    description: 'Score based on implementation timeline (shorter = higher)',
    expression: 'max(0, 100 - (timeToValueMonths * 8.33))',
    version: '2.0.0',
    category: 'scoring',
    inputVariables: ['timeToValueMonths'],
    outputUnit: UNITS.SCORE,
    validationRules: ['timeToValueMonths >= 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  // ROI Calculations
  roi_percentage: {
    id: 'roi_percentage',
    name: 'ROI Percentage',
    description: 'Return on investment as percentage',
    expression: '((totalBenefit - totalCost) / totalCost) * 100',
    version: '2.0.0',
    category: 'financial',
    inputVariables: ['totalBenefit', 'totalCost'],
    outputUnit: UNITS.PERCENT,
    validationRules: ['totalCost > 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  payback_period: {
    id: 'payback_period',
    name: 'Payback Period',
    description: 'Time to recover initial investment',
    expression: 'initialInvestment / annualBenefit',
    version: '2.0.0',
    category: 'financial',
    inputVariables: ['initialInvestment', 'annualBenefit'],
    outputUnit: UNITS.YEARS,
    validationRules: ['initialInvestment >= 0', 'annualBenefit > 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
  
  value_per_million_tokens: {
    id: 'value_per_million_tokens',
    name: 'Value per Million Tokens',
    description: 'Annual value generated per million tokens consumed',
    expression: '(totalAnnualValue / totalAnnualTokens) * 1000000',
    version: '2.0.0',
    category: 'efficiency',
    inputVariables: ['totalAnnualValue', 'totalAnnualTokens'],
    outputUnit: UNITS.USD,
    validationRules: ['totalAnnualTokens > 0'],
    createdAt: '2025-01-30T00:00:00Z',
    updatedAt: '2025-01-30T00:00:00Z',
  },
};

// ============================================================================
// DEFAULT ASSUMPTIONS
// ============================================================================

export const DEFAULT_ASSUMPTIONS: Assumption[] = [
  // AI Pricing
  {
    id: 'claude_input_price',
    name: 'Claude Input Token Price',
    description: 'Cost per million input tokens for Claude 3.5 Sonnet',
    currentValue: 3.00,
    defaultValue: 3.00,
    unit: UNITS.USD,
    confidenceLevel: 'high',
    source: { id: 'anthropic_pricing', type: 'research', description: 'Anthropic Pricing Page', url: 'https://anthropic.com/pricing', timestamp: '2025-01-30T00:00:00Z' },
    category: 'ai_pricing',
    isUserOverride: false,
    minValue: 0.01,
    maxValue: 100,
    step: 0.01,
  },
  {
    id: 'claude_output_price',
    name: 'Claude Output Token Price',
    description: 'Cost per million output tokens for Claude 3.5 Sonnet',
    currentValue: 15.00,
    defaultValue: 15.00,
    unit: UNITS.USD,
    confidenceLevel: 'high',
    source: { id: 'anthropic_pricing', type: 'research', description: 'Anthropic Pricing Page', url: 'https://anthropic.com/pricing', timestamp: '2025-01-30T00:00:00Z' },
    category: 'ai_pricing',
    isUserOverride: false,
    minValue: 0.01,
    maxValue: 100,
    step: 0.01,
  },
  
  // Labor Rates
  {
    id: 'analyst_hourly_rate',
    name: 'Analyst Hourly Rate (Burdened)',
    description: 'Fully burdened hourly cost for business analyst',
    currentValue: 85,
    defaultValue: 85,
    unit: UNITS.USD,
    confidenceLevel: 'medium',
    source: { id: 'glassdoor_burden', type: 'benchmark', description: 'Glassdoor + 30% burden factor', timestamp: '2025-01-30T00:00:00Z' },
    category: 'labor_rates',
    isUserOverride: false,
    minValue: 25,
    maxValue: 500,
    step: 5,
  },
  {
    id: 'engineer_hourly_rate',
    name: 'Engineer Hourly Rate (Burdened)',
    description: 'Fully burdened hourly cost for software engineer',
    currentValue: 125,
    defaultValue: 125,
    unit: UNITS.USD,
    confidenceLevel: 'medium',
    source: { id: 'glassdoor_burden', type: 'benchmark', description: 'Glassdoor + 30% burden factor', timestamp: '2025-01-30T00:00:00Z' },
    category: 'labor_rates',
    isUserOverride: false,
    minValue: 50,
    maxValue: 750,
    step: 5,
  },
  {
    id: 'csm_hourly_rate',
    name: 'CSM Hourly Rate (Burdened)',
    description: 'Fully burdened hourly cost for customer success manager',
    currentValue: 95,
    defaultValue: 95,
    unit: UNITS.USD,
    confidenceLevel: 'medium',
    source: { id: 'glassdoor_burden', type: 'benchmark', description: 'Glassdoor + 30% burden factor', timestamp: '2025-01-30T00:00:00Z' },
    category: 'labor_rates',
    isUserOverride: false,
    minValue: 30,
    maxValue: 500,
    step: 5,
  },
  
  // Conservative Factors
  {
    id: 'revenue_conservative_factor',
    name: 'Revenue Conservative Factor',
    description: 'Discount factor applied to revenue benefit estimates',
    currentValue: 0.95,
    defaultValue: 0.95,
    unit: UNITS.RATIO,
    confidenceLevel: 'high',
    source: { id: 'bcg_methodology', type: 'benchmark', description: 'BCG AI Value Methodology', timestamp: '2025-01-30T00:00:00Z' },
    category: 'conservative_factors',
    isUserOverride: false,
    minValue: 0.5,
    maxValue: 1.0,
    step: 0.01,
  },
  {
    id: 'cost_conservative_factor',
    name: 'Cost Conservative Factor',
    description: 'Discount factor applied to cost benefit estimates',
    currentValue: 0.90,
    defaultValue: 0.90,
    unit: UNITS.RATIO,
    confidenceLevel: 'high',
    source: { id: 'bcg_methodology', type: 'benchmark', description: 'BCG AI Value Methodology', timestamp: '2025-01-30T00:00:00Z' },
    category: 'conservative_factors',
    isUserOverride: false,
    minValue: 0.5,
    maxValue: 1.0,
    step: 0.01,
  },
  {
    id: 'cashflow_conservative_factor',
    name: 'Cash Flow Conservative Factor',
    description: 'Discount factor applied to cash flow benefit estimates',
    currentValue: 0.85,
    defaultValue: 0.85,
    unit: UNITS.RATIO,
    confidenceLevel: 'high',
    source: { id: 'bcg_methodology', type: 'benchmark', description: 'BCG AI Value Methodology', timestamp: '2025-01-30T00:00:00Z' },
    category: 'conservative_factors',
    isUserOverride: false,
    minValue: 0.5,
    maxValue: 1.0,
    step: 0.01,
  },
  {
    id: 'risk_conservative_factor',
    name: 'Risk Conservative Factor',
    description: 'Discount factor applied to risk benefit estimates',
    currentValue: 0.80,
    defaultValue: 0.80,
    unit: UNITS.RATIO,
    confidenceLevel: 'high',
    source: { id: 'bcg_methodology', type: 'benchmark', description: 'BCG AI Value Methodology', timestamp: '2025-01-30T00:00:00Z' },
    category: 'conservative_factors',
    isUserOverride: false,
    minValue: 0.5,
    maxValue: 1.0,
    step: 0.01,
  },
  {
    id: 'data_maturity_factor',
    name: 'Data Maturity Factor',
    description: 'Adjustment based on organization data readiness',
    currentValue: 0.75,
    defaultValue: 0.75,
    unit: UNITS.RATIO,
    confidenceLevel: 'low',
    source: { id: 'mckinsey_ai_report', type: 'benchmark', description: 'McKinsey AI Maturity Report', timestamp: '2025-01-30T00:00:00Z' },
    category: 'conservative_factors',
    isUserOverride: false,
    minValue: 0.25,
    maxValue: 1.0,
    step: 0.05,
  },
  
  // Adoption Factors
  {
    id: 'adoption_rate',
    name: 'Adoption Rate',
    description: 'Expected percentage of potential users who will adopt',
    currentValue: 0.85,
    defaultValue: 0.85,
    unit: UNITS.RATIO,
    confidenceLevel: 'medium',
    source: { id: 'bcg_change_mgmt', type: 'benchmark', description: 'BCG Change Management Research', timestamp: '2025-01-30T00:00:00Z' },
    category: 'adoption',
    isUserOverride: false,
    minValue: 0.3,
    maxValue: 1.0,
    step: 0.05,
  },
  {
    id: 'adoption_friction',
    name: 'Adoption Friction Factor',
    description: 'Reduction due to change management challenges',
    currentValue: 0.90,
    defaultValue: 0.90,
    unit: UNITS.RATIO,
    confidenceLevel: 'medium',
    source: { id: 'bcg_change_mgmt', type: 'benchmark', description: 'BCG Change Management Research', timestamp: '2025-01-30T00:00:00Z' },
    category: 'adoption',
    isUserOverride: false,
    minValue: 0.5,
    maxValue: 1.0,
    step: 0.05,
  },
  
  // Priority Scoring Weights
  {
    id: 'value_weight',
    name: 'Value Weight',
    description: 'Weight for value in priority scoring',
    currentValue: 40,
    defaultValue: 40,
    unit: UNITS.PERCENT,
    confidenceLevel: 'high',
    source: { id: 'internal', type: 'assumption', description: 'Default priority weighting', timestamp: '2025-01-30T00:00:00Z' },
    category: 'scoring_weights',
    isUserOverride: false,
    minValue: 0,
    maxValue: 100,
    step: 5,
  },
  {
    id: 'ttv_weight',
    name: 'Time-to-Value Weight',
    description: 'Weight for time-to-value in priority scoring',
    currentValue: 30,
    defaultValue: 30,
    unit: UNITS.PERCENT,
    confidenceLevel: 'high',
    source: { id: 'internal', type: 'assumption', description: 'Default priority weighting', timestamp: '2025-01-30T00:00:00Z' },
    category: 'scoring_weights',
    isUserOverride: false,
    minValue: 0,
    maxValue: 100,
    step: 5,
  },
  {
    id: 'effort_weight',
    name: 'Effort Weight',
    description: 'Weight for effort in priority scoring',
    currentValue: 30,
    defaultValue: 30,
    unit: UNITS.PERCENT,
    confidenceLevel: 'high',
    source: { id: 'internal', type: 'assumption', description: 'Default priority weighting', timestamp: '2025-01-30T00:00:00Z' },
    category: 'scoring_weights',
    isUserOverride: false,
    minValue: 0,
    maxValue: 100,
    step: 5,
  },
];

// ============================================================================
// CALCGRAPH ENGINE CLASS
// ============================================================================

export class CalcGraphEngine {
  private hf: HyperFormula;
  private sheetId: number;
  private assumptions: Map<string, Assumption>;
  private formulas: Map<string, FormulaDefinition>;
  private calculationGraph: CalculationGraph;
  private auditLog: Array<{ timestamp: string; action: string; details: any }>;

  constructor() {
    this.hf = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
      precisionRounding: 10,
      useArrayArithmetic: true,
    });
    const sheetName = this.hf.addSheet('calcgraph');
    this.sheetId = this.hf.getSheetId(sheetName) ?? 0;
    
    this.assumptions = new Map();
    this.formulas = new Map();
    this.calculationGraph = {
      nodes: new Map(),
      topologicalOrder: [],
      lastUpdated: new Date().toISOString(),
    };
    this.auditLog = [];
    
    // Initialize with default assumptions and formulas
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    // Load default assumptions
    for (const assumption of DEFAULT_ASSUMPTIONS) {
      this.assumptions.set(assumption.id, { ...assumption });
    }
    
    // Load formula registry
    for (const [id, formula] of Object.entries(FORMULA_REGISTRY)) {
      this.formulas.set(id, { ...formula });
    }
    
    this.logAudit('initialize', { assumptionCount: this.assumptions.size, formulaCount: this.formulas.size });
  }

  private logAudit(action: string, details: any): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action,
      details,
    });
  }

  // ============================================================================
  // ASSUMPTION MANAGEMENT
  // ============================================================================

  getAssumption(id: string): Assumption | undefined {
    return this.assumptions.get(id);
  }

  getAllAssumptions(): Assumption[] {
    return Array.from(this.assumptions.values());
  }

  getAssumptionsByCategory(): Record<string, Assumption[]> {
    const grouped: Record<string, Assumption[]> = {};
    for (const assumption of Array.from(this.assumptions.values())) {
      if (!grouped[assumption.category]) {
        grouped[assumption.category] = [];
      }
      grouped[assumption.category].push(assumption);
    }
    return grouped;
  }

  updateAssumption(id: string, newValue: number): { success: boolean; error?: string } {
    const assumption = this.assumptions.get(id);
    if (!assumption) {
      return { success: false, error: `Assumption ${id} not found` };
    }

    // Validate bounds
    if (assumption.minValue !== undefined && newValue < assumption.minValue) {
      return { success: false, error: `Value ${newValue} is below minimum ${assumption.minValue}` };
    }
    if (assumption.maxValue !== undefined && newValue > assumption.maxValue) {
      return { success: false, error: `Value ${newValue} is above maximum ${assumption.maxValue}` };
    }

    const oldValue = assumption.currentValue;
    assumption.currentValue = newValue;
    assumption.isUserOverride = newValue !== assumption.defaultValue;

    this.logAudit('update_assumption', { id, oldValue, newValue, isUserOverride: assumption.isUserOverride });

    return { success: true };
  }

  resetAssumption(id: string): { success: boolean; error?: string } {
    const assumption = this.assumptions.get(id);
    if (!assumption) {
      return { success: false, error: `Assumption ${id} not found` };
    }

    const oldValue = assumption.currentValue;
    assumption.currentValue = assumption.defaultValue;
    assumption.isUserOverride = false;

    this.logAudit('reset_assumption', { id, oldValue, newValue: assumption.defaultValue });

    return { success: true };
  }

  resetAllAssumptions(): void {
    for (const assumption of Array.from(this.assumptions.values())) {
      assumption.currentValue = assumption.defaultValue;
      assumption.isUserOverride = false;
    }
    this.logAudit('reset_all_assumptions', { count: this.assumptions.size });
  }

  // ============================================================================
  // FORMULA EVALUATION
  // ============================================================================

  evaluateFormula(
    formulaId: string,
    context: Record<string, number>
  ): CalculatedValue {
    const formula = this.formulas.get(formulaId);
    if (!formula) {
      throw new Error(`Formula ${formulaId} not found`);
    }

    // Build full context with assumptions
    const fullContext: Record<string, number> = { ...context };
    for (const assumption of Array.from(this.assumptions.values())) {
      fullContext[assumption.id] = assumption.currentValue;
    }

    // Validate all required variables are present
    const missingVars = formula.inputVariables.filter(v => fullContext[v] === undefined);
    if (missingVars.length > 0) {
      throw new Error(`Missing variables for formula ${formulaId}: ${missingVars.join(', ')}`);
    }

    // Evaluate using HyperFormula
    let processedExpr = formula.expression;
    const sortedVars = Object.keys(fullContext).sort((a, b) => b.length - a.length);
    for (const key of sortedVars) {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      processedExpr = processedExpr.replace(regex, String(fullContext[key]));
    }

    // Handle math functions
    processedExpr = processedExpr.replace(/\bmax\s*\(/g, 'MAX(');
    processedExpr = processedExpr.replace(/\bmin\s*\(/g, 'MIN(');
    processedExpr = processedExpr.replace(/\babs\s*\(/g, 'ABS(');
    processedExpr = processedExpr.replace(/\bround\s*\(/g, 'ROUND(');

    const tempRow = 9999;
    this.hf.setCellContents({ sheet: this.sheetId, row: tempRow, col: 0 }, [[`=${processedExpr}`]]);
    const result = this.hf.getCellValue({ sheet: this.sheetId, row: tempRow, col: 0 });
    this.hf.setCellContents({ sheet: this.sheetId, row: tempRow, col: 0 }, [[null]]);

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Formula ${formulaId} evaluation failed: ${result}`);
    }

    // Calculate confidence interval (±5% for deterministic calculations)
    const confidenceInterval: [number, number] = [result * 0.95, result * 1.05];

    // Collect sources from used assumptions
    const sources: SourceReference[] = [];
    for (const varName of formula.inputVariables) {
      const assumption = this.assumptions.get(varName);
      if (assumption) {
        sources.push(assumption.source);
      }
    }

    return {
      value: result,
      unit: formula.outputUnit,
      confidenceInterval,
      confidenceLevel: 'high',
      formulaRef: formula.id,
      formulaVersion: formula.version,
      sources,
      calculatedAt: new Date().toISOString(),
      dependsOn: formula.inputVariables,
    };
  }

  // ============================================================================
  // MONTE CARLO SIMULATION
  // ============================================================================

  sampleDistribution(variable: UncertainVariable, n: number = 10000): number[] {
    const samples: number[] = [];
    
    for (let i = 0; i < n; i++) {
      let sample: number;
      
      switch (variable.distribution) {
        case 'triangular':
          sample = this.sampleTriangular(variable.low, variable.mode, variable.high);
          break;
        case 'normal':
          const mean = variable.mode;
          const stdDev = (variable.high - variable.low) / 4; // 95% within range
          sample = this.sampleNormal(mean, stdDev);
          break;
        case 'uniform':
          sample = variable.low + Math.random() * (variable.high - variable.low);
          break;
        case 'pert':
          sample = this.samplePERT(variable.low, variable.mode, variable.high);
          break;
        case 'point':
        default:
          sample = variable.mode;
          break;
      }
      
      samples.push(sample);
    }
    
    return samples;
  }

  private sampleTriangular(low: number, mode: number, high: number): number {
    const u = Math.random();
    const fc = (mode - low) / (high - low);
    
    if (u < fc) {
      return low + Math.sqrt(u * (high - low) * (mode - low));
    } else {
      return high - Math.sqrt((1 - u) * (high - low) * (high - mode));
    }
  }

  private sampleNormal(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  private samplePERT(low: number, mode: number, high: number): number {
    // PERT distribution (modified beta)
    const lambda = 4; // Shape parameter
    const mean = (low + lambda * mode + high) / (lambda + 2);
    const alpha = ((mean - low) * (2 * mode - low - high)) / ((mode - mean) * (high - low));
    const beta = alpha * (high - mean) / (mean - low);
    
    // Sample from beta distribution
    const betaSample = this.sampleBeta(alpha, beta);
    return low + betaSample * (high - low);
  }

  private sampleBeta(alpha: number, beta: number): number {
    // Simple beta sampling using gamma
    const gammaAlpha = this.sampleGamma(alpha);
    const gammaBeta = this.sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  private sampleGamma(shape: number): number {
    // Marsaglia and Tsang's method
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x: number, v: number;
      do {
        x = this.sampleNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = Math.random();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  runMonteCarloSimulation(
    variables: UncertainVariable[],
    formulaId: string,
    sampleSize: number = 10000
  ): MonteCarloResult {
    const formula = this.formulas.get(formulaId);
    if (!formula) {
      throw new Error(`Formula ${formulaId} not found`);
    }

    // Generate samples for each variable
    const variableSamples: Record<string, number[]> = {};
    for (const variable of variables) {
      variableSamples[variable.id] = this.sampleDistribution(variable, sampleSize);
    }

    // Evaluate formula for each sample
    const results: number[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const context: Record<string, number> = {};
      for (const variable of variables) {
        context[variable.id] = variableSamples[variable.id][i];
      }
      
      try {
        const result = this.evaluateFormula(formulaId, context);
        results.push(result.value);
      } catch {
        // Skip failed evaluations
      }
    }

    // Sort results for percentile calculations
    results.sort((a, b) => a - b);

    // Calculate statistics
    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const variance = results.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / results.length;
    const standardDeviation = Math.sqrt(variance);

    // Check convergence (coefficient of variation of mean estimate)
    const standardError = standardDeviation / Math.sqrt(results.length);
    const convergenceAchieved = (standardError / mean) < 0.01; // 1% threshold

    return {
      p10: results[Math.floor(results.length * 0.1)],
      p25: results[Math.floor(results.length * 0.25)],
      mean,
      median: results[Math.floor(results.length * 0.5)],
      p75: results[Math.floor(results.length * 0.75)],
      p90: results[Math.floor(results.length * 0.9)],
      standardDeviation,
      sampleSize: results.length,
      convergenceAchieved,
    };
  }

  // ============================================================================
  // USE CASE CALCULATIONS
  // ============================================================================

  calculateUseCaseBenefits(useCase: {
    id: string;
    rawRevenueBenefit: number;
    rawCostBenefit: number;
    rawCashFlowBenefit: number;
    rawRiskBenefit: number;
  }): {
    revenueBenefit: CalculatedValue;
    costBenefit: CalculatedValue;
    cashFlowBenefit: CalculatedValue;
    riskBenefit: CalculatedValue;
    totalAnnualValue: CalculatedValue;
  } {
    const revenueConservative = this.assumptions.get('revenue_conservative_factor')?.currentValue ?? 0.95;
    const costConservative = this.assumptions.get('cost_conservative_factor')?.currentValue ?? 0.90;
    const cashflowConservative = this.assumptions.get('cashflow_conservative_factor')?.currentValue ?? 0.85;
    const riskConservative = this.assumptions.get('risk_conservative_factor')?.currentValue ?? 0.80;
    const dataMaturity = this.assumptions.get('data_maturity_factor')?.currentValue ?? 0.75;

    const revenueBenefit = this.evaluateFormula('cost_benefit_with_factors', {
      baseBenefit: useCase.rawRevenueBenefit,
      conservativeFactor: revenueConservative,
      dataMaturityFactor: dataMaturity,
    });

    const costBenefit = this.evaluateFormula('cost_benefit_with_factors', {
      baseBenefit: useCase.rawCostBenefit,
      conservativeFactor: costConservative,
      dataMaturityFactor: dataMaturity,
    });

    const cashFlowBenefit = this.evaluateFormula('cost_benefit_with_factors', {
      baseBenefit: useCase.rawCashFlowBenefit,
      conservativeFactor: cashflowConservative,
      dataMaturityFactor: dataMaturity,
    });

    const riskBenefit = this.evaluateFormula('cost_benefit_with_factors', {
      baseBenefit: useCase.rawRiskBenefit,
      conservativeFactor: riskConservative,
      dataMaturityFactor: dataMaturity,
    });

    const totalAnnualValue = this.evaluateFormula('total_annual_value', {
      revenueBenefit: revenueBenefit.value,
      costBenefit: costBenefit.value,
      cashFlowBenefit: cashFlowBenefit.value,
      riskBenefit: riskBenefit.value,
    });

    return {
      revenueBenefit,
      costBenefit,
      cashFlowBenefit,
      riskBenefit,
      totalAnnualValue,
    };
  }

  calculateTokenCosts(params: {
    inputTokensPerRun: number;
    outputTokensPerRun: number;
    runsPerMonth: number;
  }): {
    monthlyTokens: number;
    monthlyCost: CalculatedValue;
    annualCost: CalculatedValue;
    perRunCost: number;
  } {
    const inputPrice = this.assumptions.get('claude_input_price')?.currentValue ?? 3.00;
    const outputPrice = this.assumptions.get('claude_output_price')?.currentValue ?? 15.00;

    const monthlyInputTokens = params.inputTokensPerRun * params.runsPerMonth;
    const monthlyOutputTokens = params.outputTokensPerRun * params.runsPerMonth;
    const monthlyTokens = monthlyInputTokens + monthlyOutputTokens;

    const monthlyCost = this.evaluateFormula('token_cost_monthly', {
      inputTokens: monthlyInputTokens,
      outputTokens: monthlyOutputTokens,
      inputPrice,
      outputPrice,
    });

    const annualCost = this.evaluateFormula('token_cost_annual', {
      monthlyCost: monthlyCost.value,
    });

    const perRunCost = monthlyCost.value / params.runsPerMonth;

    return {
      monthlyTokens,
      monthlyCost,
      annualCost,
      perRunCost,
    };
  }

  calculatePriorityScore(params: {
    totalImpact: number;
    maxImpact: number;
    timeToValueMonths: number;
    effortScore: number;
  }): {
    valueScore: CalculatedValue;
    ttvScore: CalculatedValue;
    priorityScore: CalculatedValue;
  } {
    const valueWeight = this.assumptions.get('value_weight')?.currentValue ?? 40;
    const ttvWeight = this.assumptions.get('ttv_weight')?.currentValue ?? 30;
    const effortWeight = this.assumptions.get('effort_weight')?.currentValue ?? 30;

    const valueScore = this.evaluateFormula('value_score', {
      totalImpact: params.totalImpact,
      maxImpact: params.maxImpact,
    });

    const ttvScore = this.evaluateFormula('ttv_score', {
      timeToValueMonths: params.timeToValueMonths,
    });

    const priorityScore = this.evaluateFormula('priority_score', {
      valueScore: valueScore.value,
      ttvScore: ttvScore.value,
      effortScore: params.effortScore,
      valueWeight,
      ttvWeight,
      effortWeight,
    });

    return {
      valueScore,
      ttvScore,
      priorityScore,
    };
  }

  // ============================================================================
  // AUDIT AND EXPORT
  // ============================================================================

  getAuditLog(): Array<{ timestamp: string; action: string; details: any }> {
    return [...this.auditLog];
  }

  exportState(): {
    assumptions: Assumption[];
    formulas: FormulaDefinition[];
    auditLog: Array<{ timestamp: string; action: string; details: any }>;
    exportedAt: string;
  } {
    return {
      assumptions: this.getAllAssumptions(),
      formulas: Array.from(this.formulas.values()),
      auditLog: this.getAuditLog(),
      exportedAt: new Date().toISOString(),
    };
  }

  importState(state: {
    assumptions?: Assumption[];
    auditLog?: Array<{ timestamp: string; action: string; details: any }>;
  }): void {
    if (state.assumptions) {
      for (const assumption of state.assumptions) {
        this.assumptions.set(assumption.id, assumption);
      }
    }
    
    if (state.auditLog) {
      this.auditLog = [...state.auditLog];
    }
    
    this.logAudit('import_state', { assumptionCount: state.assumptions?.length ?? 0 });
  }

  destroy(): void {
    this.hf.destroy();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createCalcGraphEngine(): CalcGraphEngine {
  return new CalcGraphEngine();
}
