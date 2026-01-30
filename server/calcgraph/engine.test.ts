/**
 * CalcGraph Engine Test Suite
 * 
 * Comprehensive tests to ensure calculation accuracy and determinism.
 * Following the user's requirement for "thousands of functional tests".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CalcGraphEngine,
  createCalcGraphEngine,
  UNITS,
  FORMULA_REGISTRY,
  DEFAULT_ASSUMPTIONS,
} from './engine';

describe('CalcGraphEngine', () => {
  let engine: CalcGraphEngine;

  beforeEach(() => {
    engine = createCalcGraphEngine();
  });

  afterEach(() => {
    engine.destroy();
  });

  // ============================================================================
  // INITIALIZATION TESTS
  // ============================================================================

  describe('Initialization', () => {
    it('should initialize with default assumptions', () => {
      const assumptions = engine.getAllAssumptions();
      expect(assumptions.length).toBe(DEFAULT_ASSUMPTIONS.length);
    });

    it('should have all formula definitions loaded', () => {
      const formulaCount = Object.keys(FORMULA_REGISTRY).length;
      expect(formulaCount).toBeGreaterThan(0);
    });

    it('should initialize assumptions with correct default values', () => {
      const dataMaturity = engine.getAssumption('data_maturity_factor');
      expect(dataMaturity?.currentValue).toBe(0.75);
      expect(dataMaturity?.defaultValue).toBe(0.75);
    });
  });

  // ============================================================================
  // ASSUMPTION MANAGEMENT TESTS
  // ============================================================================

  describe('Assumption Management', () => {
    it('should update assumption value', () => {
      const result = engine.updateAssumption('data_maturity_factor', 0.85);
      expect(result.success).toBe(true);
      
      const assumption = engine.getAssumption('data_maturity_factor');
      expect(assumption?.currentValue).toBe(0.85);
      expect(assumption?.isUserOverride).toBe(true);
    });

    it('should reject values below minimum', () => {
      const result = engine.updateAssumption('data_maturity_factor', 0.1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('below minimum');
    });

    it('should reject values above maximum', () => {
      const result = engine.updateAssumption('data_maturity_factor', 1.5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('above maximum');
    });

    it('should reset assumption to default', () => {
      engine.updateAssumption('data_maturity_factor', 0.85);
      const resetResult = engine.resetAssumption('data_maturity_factor');
      expect(resetResult.success).toBe(true);
      
      const assumption = engine.getAssumption('data_maturity_factor');
      expect(assumption?.currentValue).toBe(0.75);
      expect(assumption?.isUserOverride).toBe(false);
    });

    it('should reset all assumptions', () => {
      engine.updateAssumption('data_maturity_factor', 0.85);
      engine.updateAssumption('adoption_rate', 0.95);
      
      engine.resetAllAssumptions();
      
      const dataMaturity = engine.getAssumption('data_maturity_factor');
      const adoptionRate = engine.getAssumption('adoption_rate');
      
      expect(dataMaturity?.currentValue).toBe(0.75);
      expect(adoptionRate?.currentValue).toBe(0.85);
    });

    it('should group assumptions by category', () => {
      const grouped = engine.getAssumptionsByCategory();
      expect(grouped['conservative_factors']).toBeDefined();
      expect(grouped['conservative_factors'].length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // FORMULA EVALUATION TESTS - DETERMINISM
  // ============================================================================

  describe('Formula Evaluation - Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const context = {
        baseBenefit: 1000000,
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const result1 = engine.evaluateFormula('cost_benefit_with_factors', context);
      const result2 = engine.evaluateFormula('cost_benefit_with_factors', context);
      const result3 = engine.evaluateFormula('cost_benefit_with_factors', context);

      expect(result1.value).toBe(result2.value);
      expect(result2.value).toBe(result3.value);
    });

    it('should produce deterministic results across 1000 iterations', () => {
      const context = {
        baseBenefit: 500000,
        conservativeFactor: 0.85,
        dataMaturityFactor: 0.8,
      };

      const firstResult = engine.evaluateFormula('cost_benefit_with_factors', context);
      
      for (let i = 0; i < 1000; i++) {
        const result = engine.evaluateFormula('cost_benefit_with_factors', context);
        expect(result.value).toBe(firstResult.value);
      }
    });
  });

  // ============================================================================
  // FORMULA EVALUATION TESTS - ACCURACY
  // ============================================================================

  describe('Formula Evaluation - Accuracy', () => {
    it('should calculate cost_benefit_with_factors correctly', () => {
      const context = {
        baseBenefit: 1000000,
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      
      // Expected: 1000000 * 0.9 * 0.75 = 675000
      expect(result.value).toBe(675000);
    });

    it('should calculate total_annual_value correctly', () => {
      const context = {
        revenueBenefit: 500000,
        costBenefit: 300000,
        cashFlowBenefit: 200000,
        riskBenefit: 100000,
      };

      const result = engine.evaluateFormula('total_annual_value', context);
      
      // Expected: 500000 + 300000 + 200000 + 100000 = 1100000
      expect(result.value).toBe(1100000);
    });

    it('should calculate token_cost_monthly correctly', () => {
      const context = {
        inputTokens: 1000000,
        outputTokens: 500000,
        inputPrice: 3.00,
        outputPrice: 15.00,
      };

      const result = engine.evaluateFormula('token_cost_monthly', context);
      
      // Expected: (1000000 * 3 / 1000000) + (500000 * 15 / 1000000) = 3 + 7.5 = 10.5
      expect(result.value).toBe(10.5);
    });

    it('should calculate priority_score correctly', () => {
      const context = {
        valueScore: 80,
        ttvScore: 70,
        effortScore: 60,
        valueWeight: 40,
        ttvWeight: 30,
        effortWeight: 30,
      };

      const result = engine.evaluateFormula('priority_score', context);
      
      // Expected: (80*40 + 70*30 + (100-60)*30) / 100 = (3200 + 2100 + 1200) / 100 = 65
      expect(result.value).toBe(65);
    });

    it('should calculate value_score correctly', () => {
      const context = {
        totalImpact: 750000,
        maxImpact: 1000000,
      };

      const result = engine.evaluateFormula('value_score', context);
      
      // Expected: (750000 / 1000000) * 100 = 75
      expect(result.value).toBe(75);
    });

    it('should calculate ttv_score correctly', () => {
      const context = {
        timeToValueMonths: 6,
      };

      const result = engine.evaluateFormula('ttv_score', context);
      
      // Expected: max(0, 100 - (6 * 8.33)) = max(0, 100 - 49.98) = 50.02
      expect(result.value).toBeCloseTo(50.02, 1);
    });

    it('should calculate roi_percentage correctly', () => {
      const context = {
        totalBenefit: 1500000,
        totalCost: 500000,
      };

      const result = engine.evaluateFormula('roi_percentage', context);
      
      // Expected: ((1500000 - 500000) / 500000) * 100 = 200
      expect(result.value).toBe(200);
    });

    it('should calculate payback_period correctly', () => {
      const context = {
        initialInvestment: 250000,
        annualBenefit: 1000000,
      };

      const result = engine.evaluateFormula('payback_period', context);
      
      // Expected: 250000 / 1000000 = 0.25 years
      expect(result.value).toBe(0.25);
    });
  });

  // ============================================================================
  // USE CASE CALCULATION TESTS
  // ============================================================================

  describe('Use Case Calculations', () => {
    it('should calculate use case benefits with conservative factors', () => {
      const useCase = {
        id: 'UC-01',
        rawRevenueBenefit: 1000000,
        rawCostBenefit: 500000,
        rawCashFlowBenefit: 300000,
        rawRiskBenefit: 200000,
      };

      const result = engine.calculateUseCaseBenefits(useCase);

      // Revenue: 1000000 * 0.95 * 0.75 = 712500
      expect(result.revenueBenefit.value).toBe(712500);
      
      // Cost: 500000 * 0.90 * 0.75 = 337500
      expect(result.costBenefit.value).toBe(337500);
      
      // CashFlow: 300000 * 0.85 * 0.75 = 191250
      expect(result.cashFlowBenefit.value).toBe(191250);
      
      // Risk: 200000 * 0.80 * 0.75 = 120000
      expect(result.riskBenefit.value).toBe(120000);
      
      // Total: 712500 + 337500 + 191250 + 120000 = 1361250
      expect(result.totalAnnualValue.value).toBe(1361250);
    });

    it('should calculate token costs correctly', () => {
      const params = {
        inputTokensPerRun: 1000,
        outputTokensPerRun: 500,
        runsPerMonth: 1000,
      };

      const result = engine.calculateTokenCosts(params);

      // Monthly tokens: (1000 + 500) * 1000 = 1500000
      expect(result.monthlyTokens).toBe(1500000);

      // Monthly cost: (1000000 * 3 / 1000000) + (500000 * 15 / 1000000) = 3 + 7.5 = 10.5
      expect(result.monthlyCost.value).toBe(10.5);

      // Annual cost: 10.5 * 12 = 126
      expect(result.annualCost.value).toBe(126);
    });

    it('should calculate priority scores correctly', () => {
      const params = {
        totalImpact: 800000,
        maxImpact: 1000000,
        timeToValueMonths: 3,
        effortScore: 50,
      };

      const result = engine.calculatePriorityScore(params);

      // Value score: (800000 / 1000000) * 100 = 80
      expect(result.valueScore.value).toBe(80);

      // TTV score: max(0, 100 - (3 * 8.33)) = 75.01
      expect(result.ttvScore.value).toBeCloseTo(75.01, 1);
    });
  });

  // ============================================================================
  // MONTE CARLO TESTS
  // ============================================================================

  describe('Monte Carlo Simulation', () => {
    it('should sample triangular distribution correctly', () => {
      const variable = {
        id: 'test',
        name: 'Test Variable',
        distribution: 'triangular' as const,
        low: 0.5,
        mode: 0.75,
        high: 1.0,
        unit: UNITS.RATIO,
        confidenceLevel: 'medium' as const,
        sources: [],
      };

      const samples = engine.sampleDistribution(variable, 10000);

      // Check sample count
      expect(samples.length).toBe(10000);

      // Check all samples are within bounds
      samples.forEach(s => {
        expect(s).toBeGreaterThanOrEqual(0.5);
        expect(s).toBeLessThanOrEqual(1.0);
      });

      // Check mean is close to expected (for triangular: (low + mode + high) / 3)
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const expectedMean = (0.5 + 0.75 + 1.0) / 3;
      expect(mean).toBeCloseTo(expectedMean, 1);
    });

    it('should sample uniform distribution correctly', () => {
      const variable = {
        id: 'test',
        name: 'Test Variable',
        distribution: 'uniform' as const,
        low: 0,
        mode: 50,
        high: 100,
        unit: UNITS.COUNT,
        confidenceLevel: 'low' as const,
        sources: [],
      };

      const samples = engine.sampleDistribution(variable, 10000);

      // Check bounds
      samples.forEach(s => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      });

      // Check mean is close to 50
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(mean).toBeCloseTo(50, 0);
    });

    it('should run Monte Carlo simulation and return valid results', () => {
      const variables = [
        {
          id: 'baseBenefit',
          name: 'Base Benefit',
          distribution: 'triangular' as const,
          low: 800000,
          mode: 1000000,
          high: 1200000,
          unit: UNITS.USD,
          confidenceLevel: 'medium' as const,
          sources: [],
        },
        {
          id: 'conservativeFactor',
          name: 'Conservative Factor',
          distribution: 'triangular' as const,
          low: 0.8,
          mode: 0.9,
          high: 1.0,
          unit: UNITS.RATIO,
          confidenceLevel: 'high' as const,
          sources: [],
        },
        {
          id: 'dataMaturityFactor',
          name: 'Data Maturity Factor',
          distribution: 'triangular' as const,
          low: 0.6,
          mode: 0.75,
          high: 0.9,
          unit: UNITS.RATIO,
          confidenceLevel: 'low' as const,
          sources: [],
        },
      ];

      const result = engine.runMonteCarloSimulation(variables, 'cost_benefit_with_factors', 5000);

      // Check result structure
      expect(result.sampleSize).toBeLessThanOrEqual(5000);
      expect(result.p10).toBeLessThan(result.median);
      expect(result.median).toBeLessThan(result.p90);
      expect(result.mean).toBeGreaterThan(0);
      expect(result.standardDeviation).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // EDGE CASE TESTS
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle zero values correctly', () => {
      const context = {
        baseBenefit: 0,
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      expect(result.value).toBe(0);
    });

    it('should handle very large values correctly', () => {
      const context = {
        baseBenefit: 1000000000, // 1 billion
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      expect(result.value).toBe(675000000);
    });

    it('should handle very small values correctly', () => {
      const context = {
        baseBenefit: 0.001,
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      expect(result.value).toBeCloseTo(0.000675, 6);
    });

    it('should throw error for missing variables', () => {
      const context = {
        baseBenefit: 1000000,
        // Missing conservativeFactor and dataMaturityFactor
      };

      expect(() => {
        engine.evaluateFormula('cost_benefit_with_factors', context);
      }).toThrow();
    });

    it('should throw error for unknown formula', () => {
      expect(() => {
        engine.evaluateFormula('unknown_formula', {});
      }).toThrow('Formula unknown_formula not found');
    });
  });

  // ============================================================================
  // AUDIT TRAIL TESTS
  // ============================================================================

  describe('Audit Trail', () => {
    it('should log initialization', () => {
      const auditLog = engine.getAuditLog();
      const initEntry = auditLog.find(e => e.action === 'initialize');
      expect(initEntry).toBeDefined();
    });

    it('should log assumption updates', () => {
      engine.updateAssumption('data_maturity_factor', 0.85);
      
      const auditLog = engine.getAuditLog();
      const updateEntry = auditLog.find(e => e.action === 'update_assumption');
      
      expect(updateEntry).toBeDefined();
      expect(updateEntry?.details.id).toBe('data_maturity_factor');
      expect(updateEntry?.details.newValue).toBe(0.85);
    });

    it('should log assumption resets', () => {
      engine.updateAssumption('data_maturity_factor', 0.85);
      engine.resetAssumption('data_maturity_factor');
      
      const auditLog = engine.getAuditLog();
      const resetEntry = auditLog.find(e => e.action === 'reset_assumption');
      
      expect(resetEntry).toBeDefined();
    });
  });

  // ============================================================================
  // STATE EXPORT/IMPORT TESTS
  // ============================================================================

  describe('State Management', () => {
    it('should export state correctly', () => {
      engine.updateAssumption('data_maturity_factor', 0.85);
      
      const state = engine.exportState();
      
      expect(state.assumptions).toBeDefined();
      expect(state.formulas).toBeDefined();
      expect(state.auditLog).toBeDefined();
      expect(state.exportedAt).toBeDefined();
    });

    it('should import state correctly', () => {
      const newEngine = createCalcGraphEngine();
      
      // Modify original engine
      engine.updateAssumption('data_maturity_factor', 0.85);
      const state = engine.exportState();
      
      // Import into new engine
      newEngine.importState({ assumptions: state.assumptions });
      
      const assumption = newEngine.getAssumption('data_maturity_factor');
      expect(assumption?.currentValue).toBe(0.85);
      
      newEngine.destroy();
    });
  });

  // ============================================================================
  // STRESS TESTS
  // ============================================================================

  describe('Stress Tests', () => {
    it('should handle 10000 sequential calculations', () => {
      const context = {
        baseBenefit: 1000000,
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const startTime = Date.now();
      
      for (let i = 0; i < 10000; i++) {
        engine.evaluateFormula('cost_benefit_with_factors', context);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 10000 calculations in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle rapid assumption updates', () => {
      for (let i = 0; i < 1000; i++) {
        const value = 0.5 + (Math.random() * 0.5);
        engine.updateAssumption('data_maturity_factor', value);
      }
      
      // Should not throw and assumption should be valid
      const assumption = engine.getAssumption('data_maturity_factor');
      expect(assumption?.currentValue).toBeGreaterThanOrEqual(0.5);
      expect(assumption?.currentValue).toBeLessThanOrEqual(1.0);
    });
  });
});

// ============================================================================
// PARAMETERIZED TESTS FOR COMPREHENSIVE COVERAGE
// ============================================================================

describe('Parameterized Calculation Tests', () => {
  let engine: CalcGraphEngine;

  beforeEach(() => {
    engine = createCalcGraphEngine();
  });

  afterEach(() => {
    engine.destroy();
  });

  // Test various benefit amounts
  const benefitAmounts = [
    0, 1, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000,
  ];

  benefitAmounts.forEach(amount => {
    it(`should calculate correctly for benefit amount: ${amount}`, () => {
      const context = {
        baseBenefit: amount,
        conservativeFactor: 0.9,
        dataMaturityFactor: 0.75,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      const expected = amount * 0.9 * 0.75;
      
      expect(result.value).toBeCloseTo(expected, 6);
    });
  });

  // Test various conservative factors
  const conservativeFactors = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0];

  conservativeFactors.forEach(factor => {
    it(`should calculate correctly for conservative factor: ${factor}`, () => {
      const context = {
        baseBenefit: 1000000,
        conservativeFactor: factor,
        dataMaturityFactor: 0.75,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      const expected = 1000000 * factor * 0.75;
      
      expect(result.value).toBeCloseTo(expected, 6);
    });
  });

  // Test various data maturity factors
  const dataMaturityFactors = [0.25, 0.5, 0.65, 0.75, 0.85, 0.95];

  dataMaturityFactors.forEach(factor => {
    it(`should calculate correctly for data maturity factor: ${factor}`, () => {
      const context = {
        baseBenefit: 1000000,
        conservativeFactor: 0.9,
        dataMaturityFactor: factor,
      };

      const result = engine.evaluateFormula('cost_benefit_with_factors', context);
      const expected = 1000000 * 0.9 * factor;
      
      expect(result.value).toBeCloseTo(expected, 6);
    });
  });

  // Test time-to-value scores
  const ttvMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  ttvMonths.forEach(months => {
    it(`should calculate TTV score correctly for ${months} months`, () => {
      const result = engine.evaluateFormula('ttv_score', { timeToValueMonths: months });
      const expected = Math.max(0, 100 - (months * 8.33));
      
      expect(result.value).toBeCloseTo(expected, 1);
    });
  });

  // Test priority scores with various weights
  const weightCombinations = [
    { value: 40, ttv: 30, effort: 30 },
    { value: 50, ttv: 25, effort: 25 },
    { value: 60, ttv: 20, effort: 20 },
    { value: 33, ttv: 33, effort: 34 },
  ];

  weightCombinations.forEach(weights => {
    it(`should calculate priority score with weights: ${JSON.stringify(weights)}`, () => {
      const context = {
        valueScore: 80,
        ttvScore: 70,
        effortScore: 60,
        valueWeight: weights.value,
        ttvWeight: weights.ttv,
        effortWeight: weights.effort,
      };

      const result = engine.evaluateFormula('priority_score', context);
      const expected = (80 * weights.value + 70 * weights.ttv + 40 * weights.effort) / 100;
      
      expect(result.value).toBeCloseTo(expected, 1);
    });
  });
});
