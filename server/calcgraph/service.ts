/**
 * CalcGraph Service - Integration Layer
 * 
 * This service provides the bridge between the AI-generated research data
 * and the deterministic calculation engine. It ensures that:
 * 
 * 1. AI generates qualitative research and raw data points only
 * 2. All calculations are performed by the CalcGraph engine
 * 3. Results are validated and auditable
 * 4. Users can adjust assumptions and see recalculated results
 */

import {
  CalcGraphEngine,
  createCalcGraphEngine,
  CalculatedValue,
  Assumption,
  MonteCarloResult,
  UncertainVariable,
  UNITS,
  FORMULA_REGISTRY,
} from './engine';

// ============================================================================
// TYPES FOR AI RESEARCH OUTPUT
// ============================================================================

/**
 * Raw research data from AI - NO CALCULATIONS
 * The AI should only provide qualitative research and raw numbers
 */
export interface AIResearchOutput {
  companyName: string;
  companyOverview: {
    position: string;
    industry: string;
    estimatedRevenue?: number;  // Raw number, no formatting
    estimatedEmployees?: number;
    dataMaturityLevel: 1 | 2 | 3 | 4 | 5;
  };
  frictionPoints: Array<{
    id: string;
    domain: string;
    description: string;
    estimatedAnnualHours: number;  // Raw hours
    estimatedHourlyRate: number;   // Raw rate
    severity: 'Critical' | 'High' | 'Medium';
    strategicImpact: string;
  }>;
  useCases: Array<{
    id: string;
    name: string;
    function: string;
    subFunction: string;
    description: string;
    targetFriction: string;
    hitlCheckpoint: string;
    aiPrimitives: string[];
    // Raw estimates - NOT calculated values
    estimatedHoursSaved: number;
    estimatedHourlyRate: number;
    estimatedAdoptionRate: number;
    estimatedRevenueImpact: number;
    estimatedCostImpact: number;
    estimatedCashFlowImpact: number;
    estimatedRiskReduction: number;
    // Effort metrics
    dataReadiness: 1 | 2 | 3 | 4 | 5;
    integrationComplexity: 1 | 2 | 3 | 4 | 5;
    changeManagement: 1 | 2 | 3 | 4 | 5;
    timeToValueMonths: number;
    // Token estimates
    inputTokensPerRun: number;
    outputTokensPerRun: number;
    runsPerMonth: number;
  }>;
  strategicThemes: Array<{
    theme: string;
    primaryDriver: string;
    secondaryDriver: string;
    currentState: string;
    targetState: string;
  }>;
  kpiBaselines: Array<{
    function: string;
    subFunction: string;
    kpiName: string;
    baselineValue: string;
    industryBenchmark: string;
    targetValue: string;
    direction: '↑' | '↓';
    timeframe: string;
    measurementMethod: string;
  }>;
}

/**
 * Fully calculated report with audit trail
 */
export interface CalculatedReport {
  reportId: string;
  companyName: string;
  generatedAt: string;
  calculationEngineVersion: string;
  
  // Assumptions used (for transparency)
  assumptions: Assumption[];
  
  // Company overview with calculated friction costs
  companyOverview: {
    position: string;
    industry: string;
    estimatedRevenue: number;
    estimatedEmployees: number;
    dataMaturityLevel: number;
    frictionTable: Array<{
      domain: string;
      annualBurden: CalculatedValue;
      strategicImpact: string;
    }>;
  };
  
  // Use cases with all calculations
  useCases: Array<{
    id: string;
    name: string;
    function: string;
    subFunction: string;
    description: string;
    targetFriction: string;
    hitlCheckpoint: string;
    aiPrimitives: string[];
    
      // Calculated benefits
    benefits: {
      revenueBenefit: CalculatedValue;
      costBenefit: CalculatedValue;
      cashFlowBenefit: CalculatedValue;
      riskBenefit: CalculatedValue;
      totalAnnualValue: CalculatedValue;
      // Aliases for convenience
      revenue: CalculatedValue;
      cost: CalculatedValue;
      cashFlow: CalculatedValue;
      risk: CalculatedValue;
      totalAnnual: CalculatedValue;
    };
    
    // Token costs
    tokenCosts: {
      monthlyTokens: number;
      monthlyCost: CalculatedValue;
      annualCost: CalculatedValue;
      perRunCost: number;
    };
    
    // Priority scoring
    scoring: {
      valueScore: CalculatedValue;
      ttvScore: CalculatedValue;
      effortScore: number;
      priorityScore: CalculatedValue;
      priorityTier: 'Critical' | 'High' | 'Medium' | 'Low';
      recommendedPhase: string;
    };
    
    // Effort metrics
    effort: {
      dataReadiness: number;
      integrationComplexity: number;
      changeManagement: number;
      timeToValueMonths: number;
    };
  }>;
  
  // Executive dashboard with aggregated calculations
  executiveDashboard: {
    totalRevenueBenefit: CalculatedValue;
    totalCostBenefit: CalculatedValue;
    totalCashFlowBenefit: CalculatedValue;
    totalRiskBenefit: CalculatedValue;
    totalAnnualValue: CalculatedValue;
    totalMonthlyTokens: number;
    totalAnnualTokenCost: CalculatedValue;
    valuePerMillionTokens: CalculatedValue;
    roi: CalculatedValue;
    paybackPeriod: CalculatedValue;
    topUseCases: Array<{
      rank: number;
      id: string;
      name: string;
      priorityScore: number;
      annualValue: number;
      monthlyTokens: number;
    }>;
  };
  
  // Monte Carlo simulation results (if run)
  uncertaintyAnalysis?: {
    totalValueDistribution: MonteCarloResult;
    sensitivityAnalysis: Array<{
      assumptionId: string;
      assumptionName: string;
      impactOnTotalValue: number;  // Percentage of variance explained
    }>;
  };
  
  // Audit trail
  auditTrail: Array<{
    timestamp: string;
    action: string;
    details: any;
  }>;
}

// ============================================================================
// CALCGRAPH SERVICE CLASS
// ============================================================================

export class CalcGraphService {
  private engine: CalcGraphEngine;

  constructor() {
    this.engine = createCalcGraphEngine();
  }

  /**
   * Process AI research output and generate fully calculated report
   */
  processResearchOutput(research: AIResearchOutput): CalculatedReport {
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generatedAt = new Date().toISOString();

    // Adjust data maturity factor based on company's level
    const dataMaturityFactors: Record<number, number> = {
      1: 0.50,  // Very low maturity
      2: 0.65,
      3: 0.75,  // Default
      4: 0.85,
      5: 0.95,  // High maturity
    };
    const dataMaturityFactor = dataMaturityFactors[research.companyOverview.dataMaturityLevel] ?? 0.75;
    this.engine.updateAssumption('data_maturity_factor', dataMaturityFactor);

    // Calculate friction point costs
    const frictionTable = research.frictionPoints.map(fp => {
      const annualBurden = this.engine.evaluateFormula('hours_saved_value', {
        hoursSaved: fp.estimatedAnnualHours,
        hourlyRate: fp.estimatedHourlyRate,
        adoptionRate: 1.0,  // Full cost, not adoption-adjusted
      });
      return {
        domain: fp.domain,
        annualBurden,
        strategicImpact: fp.strategicImpact,
      };
    });

    // Calculate all use cases
    const calculatedUseCases = research.useCases.map(uc => {
      // Calculate benefits
      const benefits = this.engine.calculateUseCaseBenefits({
        id: uc.id,
        rawRevenueBenefit: uc.estimatedRevenueImpact,
        rawCostBenefit: uc.estimatedCostImpact,
        rawCashFlowBenefit: uc.estimatedCashFlowImpact,
        rawRiskBenefit: uc.estimatedRiskReduction,
      });

      // Calculate token costs
      const tokenCosts = this.engine.calculateTokenCosts({
        inputTokensPerRun: uc.inputTokensPerRun,
        outputTokensPerRun: uc.outputTokensPerRun,
        runsPerMonth: uc.runsPerMonth,
      });

      // Calculate effort score (average of three factors, inverted to 0-100 scale)
      const effortScore = ((uc.dataReadiness + uc.integrationComplexity + uc.changeManagement) / 3) * 20;

      return {
        id: uc.id,
        name: uc.name,
        function: uc.function,
        subFunction: uc.subFunction,
        description: uc.description,
        targetFriction: uc.targetFriction,
        hitlCheckpoint: uc.hitlCheckpoint,
        aiPrimitives: uc.aiPrimitives,
        benefits: {
          ...benefits,
          // Add aliases for convenience
          revenue: benefits.revenueBenefit,
          cost: benefits.costBenefit,
          cashFlow: benefits.cashFlowBenefit,
          risk: benefits.riskBenefit,
          totalAnnual: benefits.totalAnnualValue,
        },
        tokenCosts,
        effortScore,
        effort: {
          dataReadiness: uc.dataReadiness,
          integrationComplexity: uc.integrationComplexity,
          changeManagement: uc.changeManagement,
          timeToValueMonths: uc.timeToValueMonths,
        },
      };
    });

    // Find max impact for value score normalization
    const maxImpact = Math.max(...calculatedUseCases.map(uc => uc.benefits.totalAnnualValue.value));

    // Calculate priority scores
    const useCasesWithScoring = calculatedUseCases.map(uc => {
      const scoring = this.engine.calculatePriorityScore({
        totalImpact: uc.benefits.totalAnnualValue.value,
        maxImpact,
        timeToValueMonths: uc.effort.timeToValueMonths,
        effortScore: uc.effortScore,
      });

      // Determine priority tier
      const priorityScore = scoring.priorityScore.value;
      let priorityTier: 'Critical' | 'High' | 'Medium' | 'Low';
      let recommendedPhase: string;
      
      if (priorityScore >= 80) {
        priorityTier = 'Critical';
        recommendedPhase = 'Q1';
      } else if (priorityScore >= 60) {
        priorityTier = 'High';
        recommendedPhase = 'Q2';
      } else if (priorityScore >= 40) {
        priorityTier = 'Medium';
        recommendedPhase = 'Q3';
      } else {
        priorityTier = 'Low';
        recommendedPhase = 'Q4';
      }

      return {
        ...uc,
        scoring: {
          valueScore: scoring.valueScore,
          ttvScore: scoring.ttvScore,
          effortScore: uc.effortScore,
          priorityScore: scoring.priorityScore,
          priorityTier,
          recommendedPhase,
        },
      };
    });

    // Calculate executive dashboard totals
    const totalRevenue = useCasesWithScoring.reduce((sum, uc) => sum + uc.benefits.revenue.value, 0);
    const totalCost = useCasesWithScoring.reduce((sum, uc) => sum + uc.benefits.cost.value, 0);
    const totalCashFlow = useCasesWithScoring.reduce((sum, uc) => sum + uc.benefits.cashFlow.value, 0);
    const totalRisk = useCasesWithScoring.reduce((sum, uc) => sum + uc.benefits.risk.value, 0);
    const totalAnnualValue = totalRevenue + totalCost + totalCashFlow + totalRisk;
    const totalMonthlyTokens = useCasesWithScoring.reduce((sum, uc) => sum + uc.tokenCosts.monthlyTokens, 0);
    const totalAnnualTokenCost = useCasesWithScoring.reduce((sum, uc) => sum + uc.tokenCosts.annualCost.value, 0);

    // Create calculated values for dashboard
    const createDashboardValue = (value: number, unit = UNITS.USD_M_PER_YEAR): CalculatedValue => ({
      value,
      unit,
      confidenceInterval: [value * 0.9, value * 1.1],
      confidenceLevel: 'medium',
      formulaRef: 'aggregation',
      formulaVersion: '2.0.0',
      sources: [],
      calculatedAt: generatedAt,
      dependsOn: useCasesWithScoring.map(uc => uc.id),
    });

    // Calculate value per million tokens
    const valuePerMillionTokens = totalMonthlyTokens > 0 
      ? (totalAnnualValue / (totalMonthlyTokens * 12)) * 1000000 
      : 0;

    // Calculate ROI (assuming implementation cost is 20% of first year value)
    const estimatedImplementationCost = totalAnnualValue * 0.2;
    const roi = estimatedImplementationCost > 0 
      ? ((totalAnnualValue - estimatedImplementationCost - totalAnnualTokenCost) / (estimatedImplementationCost + totalAnnualTokenCost)) * 100
      : 0;

    // Calculate payback period
    const paybackPeriod = totalAnnualValue > 0 
      ? (estimatedImplementationCost + totalAnnualTokenCost) / totalAnnualValue 
      : 0;

    // Get top 5 use cases by priority score
    const topUseCases = [...useCasesWithScoring]
      .sort((a, b) => b.scoring.priorityScore.value - a.scoring.priorityScore.value)
      .slice(0, 5)
      .map((uc, index) => ({
        rank: index + 1,
        id: uc.id,
        name: uc.name,
        priorityScore: Math.round(uc.scoring.priorityScore.value),
        annualValue: uc.benefits.totalAnnualValue.value,
        monthlyTokens: uc.tokenCosts.monthlyTokens,
      }));

    return {
      reportId,
      companyName: research.companyName,
      generatedAt,
      calculationEngineVersion: '2.0.0',
      assumptions: this.engine.getAllAssumptions(),
      companyOverview: {
        position: research.companyOverview.position,
        industry: research.companyOverview.industry,
        estimatedRevenue: research.companyOverview.estimatedRevenue ?? 0,
        estimatedEmployees: research.companyOverview.estimatedEmployees ?? 0,
        dataMaturityLevel: research.companyOverview.dataMaturityLevel,
        frictionTable,
      },
      useCases: useCasesWithScoring,
      executiveDashboard: {
        totalRevenueBenefit: createDashboardValue(totalRevenue),
        totalCostBenefit: createDashboardValue(totalCost),
        totalCashFlowBenefit: createDashboardValue(totalCashFlow),
        totalRiskBenefit: createDashboardValue(totalRisk),
        totalAnnualValue: createDashboardValue(totalAnnualValue),
        totalMonthlyTokens,
        totalAnnualTokenCost: createDashboardValue(totalAnnualTokenCost, UNITS.USD_PER_YEAR),
        valuePerMillionTokens: createDashboardValue(valuePerMillionTokens, UNITS.USD),
        roi: createDashboardValue(roi, UNITS.PERCENT),
        paybackPeriod: createDashboardValue(paybackPeriod, UNITS.YEARS),
        topUseCases,
      },
      auditTrail: this.engine.getAuditLog(),
    };
  }

  /**
   * Recalculate report with updated assumptions
   */
  recalculateWithAssumptions(
    research: AIResearchOutput,
    assumptionUpdates: Array<{ id: string; value: number }>
  ): CalculatedReport {
    // Apply assumption updates
    for (const update of assumptionUpdates) {
      this.engine.updateAssumption(update.id, update.value);
    }

    // Recalculate
    return this.processResearchOutput(research);
  }

  /**
   * Run Monte Carlo simulation for uncertainty analysis
   */
  runUncertaintyAnalysis(
    research: AIResearchOutput,
    sampleSize: number = 10000
  ): {
    totalValueDistribution: MonteCarloResult;
    sensitivityAnalysis: Array<{
      assumptionId: string;
      assumptionName: string;
      impactOnTotalValue: number;
    }>;
  } {
    // Create uncertain variables from key assumptions
    const uncertainVariables: UncertainVariable[] = [
      {
        id: 'data_maturity_factor',
        name: 'Data Maturity Factor',
        distribution: 'triangular',
        low: 0.5,
        mode: 0.75,
        high: 0.95,
        unit: UNITS.RATIO,
        confidenceLevel: 'low',
        sources: [],
      },
      {
        id: 'adoption_rate',
        name: 'Adoption Rate',
        distribution: 'pert',
        low: 0.6,
        mode: 0.85,
        high: 0.95,
        unit: UNITS.RATIO,
        confidenceLevel: 'medium',
        sources: [],
      },
      {
        id: 'cost_conservative_factor',
        name: 'Cost Conservative Factor',
        distribution: 'triangular',
        low: 0.7,
        mode: 0.9,
        high: 1.0,
        unit: UNITS.RATIO,
        confidenceLevel: 'medium',
        sources: [],
      },
    ];

    // Run simulation for total value
    const totalValueDistribution = this.engine.runMonteCarloSimulation(
      uncertainVariables,
      'cost_benefit_with_factors',
      sampleSize
    );

    // Calculate sensitivity (simplified - which assumptions drive variance)
    const sensitivityAnalysis = uncertainVariables.map(v => ({
      assumptionId: v.id,
      assumptionName: v.name,
      impactOnTotalValue: ((v.high - v.low) / v.mode) * 100,  // Simplified sensitivity measure
    })).sort((a, b) => b.impactOnTotalValue - a.impactOnTotalValue);

    return {
      totalValueDistribution,
      sensitivityAnalysis,
    };
  }

  /**
   * Get all assumptions for the UI
   */
  getAssumptions(): Assumption[] {
    return this.engine.getAllAssumptions();
  }

  /**
   * Get assumptions grouped by category
   */
  getAssumptionsByCategory(): Record<string, Assumption[]> {
    return this.engine.getAssumptionsByCategory();
  }

  /**
   * Update a single assumption
   */
  updateAssumption(id: string, value: number): { success: boolean; error?: string } {
    return this.engine.updateAssumption(id, value);
  }

  /**
   * Reset all assumptions to defaults
   */
  resetAssumptions(): void {
    this.engine.resetAllAssumptions();
  }

  /**
   * Get formula definitions for transparency
   */
  getFormulas(): typeof FORMULA_REGISTRY {
    return FORMULA_REGISTRY;
  }

  /**
   * Export current state for persistence
   */
  exportState(): ReturnType<CalcGraphEngine['exportState']> {
    return this.engine.exportState();
  }

  /**
   * Import state from persistence
   */
  importState(state: Parameters<CalcGraphEngine['importState']>[0]): void {
    this.engine.importState(state);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.engine.destroy();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

let serviceInstance: CalcGraphService | null = null;

export function getCalcGraphService(): CalcGraphService {
  if (!serviceInstance) {
    serviceInstance = new CalcGraphService();
  }
  return serviceInstance;
}

export function createNewCalcGraphService(): CalcGraphService {
  return new CalcGraphService();
}
