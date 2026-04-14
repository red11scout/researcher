import { HyperFormula } from 'hyperformula';
import type { CalculationResult, FormulaTrace, Scenario } from './formulas';
import { SCENARIO_MULTIPLIERS, DEFAULT_MULTIPLIERS, ROUNDING } from './formulas';

let hfInstance: HyperFormula | null = null;
let sheetId: number = 0;

function getOrCreateInstance(): { hf: HyperFormula; sheetId: number } {
  if (!hfInstance) {
    hfInstance = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });
    const sheetName = hfInstance.addSheet('Calc');
    sheetId = hfInstance.getSheetId(sheetName)!;
  }
  return { hf: hfInstance, sheetId };
}

export function getHyperFormulaInstance(): HyperFormula {
  return getOrCreateInstance().hf;
}

function evalFormula(values: number[], formula: string): number {
  const { hf, sheetId: sid } = getOrCreateInstance();

  for (let col = 0; col < values.length; col++) {
    hf.setCellContents({ sheet: sid, row: 0, col }, [[values[col]]]);
  }

  const formulaRow = 1;
  hf.setCellContents({ sheet: sid, row: formulaRow, col: 0 }, [[formula]]);
  const result = hf.getCellValue({ sheet: sid, row: formulaRow, col: 0 });

  if (typeof result === 'number') {
    return result;
  }
  return 0;
}

export function hfCalculateCostBenefit(inputs: {
  hoursSaved: number;
  loadedHourlyRate?: number;
  benefitsLoading?: number;
  costRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const hoursSaved = inputs.hoursSaved;
  const loadedHourlyRate = inputs.loadedHourlyRate ?? DEFAULT_MULTIPLIERS.loadedHourlyRate;
  const benefitsLoading = inputs.benefitsLoading ?? DEFAULT_MULTIPLIERS.benefitsLoading;
  const costRealizationMultiplier = inputs.costRealizationMultiplier ?? DEFAULT_MULTIPLIERS.costRealizationMultiplier;
  const dataMaturityMultiplier = inputs.dataMaturityMultiplier ?? DEFAULT_MULTIPLIERS.dataMaturityMultiplier;
  const scenarioMultiplier = SCENARIO_MULTIPLIERS[inputs.scenario ?? 'moderate'];

  const cellValues = [hoursSaved, loadedHourlyRate, benefitsLoading, costRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier];
  const formula = `=FLOOR(A1*B1*C1*D1*E1*F1, ${ROUNDING.BENEFIT_PRECISION})`;
  const value = evalFormula(cellValues, formula);

  return {
    value,
    trace: {
      formula,
      inputs: { hoursSaved, loadedHourlyRate, benefitsLoading, costRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      output: value,
    },
  };
}

export function hfCalculateRevenueBenefit(inputs: {
  upliftPct: number;
  baselineRevenueAtRisk: number;
  marginPct?: number;
  revenueRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const upliftPct = inputs.upliftPct;
  const baselineRevenueAtRisk = inputs.baselineRevenueAtRisk;
  const marginPct = inputs.marginPct ?? 1.0;
  const revenueRealizationMultiplier = inputs.revenueRealizationMultiplier ?? DEFAULT_MULTIPLIERS.revenueRealizationMultiplier;
  const dataMaturityMultiplier = inputs.dataMaturityMultiplier ?? DEFAULT_MULTIPLIERS.dataMaturityMultiplier;
  const scenarioMultiplier = SCENARIO_MULTIPLIERS[inputs.scenario ?? 'moderate'];

  const cellValues = [upliftPct, baselineRevenueAtRisk, marginPct, revenueRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier];
  const formula = `=FLOOR(MIN(A1,0.5)*B1*C1*D1*E1*F1, ${ROUNDING.BENEFIT_PRECISION})`;
  const value = evalFormula(cellValues, formula);

  return {
    value,
    trace: {
      formula,
      inputs: { upliftPct, baselineRevenueAtRisk, marginPct, revenueRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      output: value,
    },
  };
}

export function hfCalculateCashFlowBenefit(inputs: {
  annualRevenue: number;
  daysImprovement: number;
  costOfCapital?: number;
  cashFlowRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const annualRevenue = inputs.annualRevenue;
  const daysImprovement = inputs.daysImprovement;
  const costOfCapital = inputs.costOfCapital ?? DEFAULT_MULTIPLIERS.defaultCostOfCapital;
  const cashFlowRealizationMultiplier = inputs.cashFlowRealizationMultiplier ?? DEFAULT_MULTIPLIERS.cashFlowRealizationMultiplier;
  const dataMaturityMultiplier = inputs.dataMaturityMultiplier ?? DEFAULT_MULTIPLIERS.dataMaturityMultiplier;
  const scenarioMultiplier = SCENARIO_MULTIPLIERS[inputs.scenario ?? 'moderate'];

  const cellValues = [annualRevenue, daysImprovement, costOfCapital, cashFlowRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier];
  const formula = `=FLOOR(A1*(B1/365)*C1*D1*E1*F1, ${ROUNDING.BENEFIT_PRECISION})`;
  const value = evalFormula(cellValues, formula);

  return {
    value,
    trace: {
      formula,
      inputs: { annualRevenue, daysImprovement, costOfCapital, cashFlowRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      output: value,
    },
  };
}

export function hfCalculateRiskBenefit(inputs: {
  riskReductionPct: number;
  riskExposure: number;
  riskRealizationMultiplier?: number;
  dataMaturityMultiplier?: number;
  scenario?: Scenario;
}): CalculationResult {
  const riskReductionPct = inputs.riskReductionPct;
  const riskExposure = inputs.riskExposure;
  const riskRealizationMultiplier = inputs.riskRealizationMultiplier ?? DEFAULT_MULTIPLIERS.riskRealizationMultiplier;
  const dataMaturityMultiplier = inputs.dataMaturityMultiplier ?? DEFAULT_MULTIPLIERS.dataMaturityMultiplier;
  const scenarioMultiplier = SCENARIO_MULTIPLIERS[inputs.scenario ?? 'moderate'];

  const cellValues = [riskReductionPct, riskExposure, riskRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier];
  const formula = `=FLOOR(A1*B1*C1*D1*E1, ${ROUNDING.BENEFIT_PRECISION})`;
  const value = evalFormula(cellValues, formula);

  return {
    value,
    trace: {
      formula,
      inputs: { riskReductionPct, riskExposure, riskRealizationMultiplier, dataMaturityMultiplier, scenarioMultiplier },
      output: value,
    },
  };
}

export function hfCalculateFrictionCost(inputs: {
  annualHours: number;
  loadedHourlyRate: number;
}): CalculationResult {
  const annualHours = inputs.annualHours;
  const loadedHourlyRate = inputs.loadedHourlyRate;

  const cellValues = [annualHours, loadedHourlyRate];
  const formula = `=FLOOR(A1*B1, ${ROUNDING.FRICTION_PRECISION})`;
  const value = evalFormula(cellValues, formula);

  return {
    value,
    trace: {
      formula,
      inputs: { annualHours, loadedHourlyRate },
      output: value,
    },
  };
}

export function hfCalculateTokenCost(inputs: {
  runsPerMonth: number;
  inputTokensPerRun: number;
  outputTokensPerRun: number;
  inputTokenPricePerM?: number;
  outputTokenPricePerM?: number;
}): CalculationResult {
  const runsPerMonth = inputs.runsPerMonth;
  const inputTokensPerRun = inputs.inputTokensPerRun;
  const outputTokensPerRun = inputs.outputTokensPerRun;
  const inputTokenPricePerM = inputs.inputTokenPricePerM ?? DEFAULT_MULTIPLIERS.inputTokenPricePerM;
  const outputTokenPricePerM = inputs.outputTokenPricePerM ?? DEFAULT_MULTIPLIERS.outputTokenPricePerM;

  const { hf, sheetId: sid } = getOrCreateInstance();

  hf.setCellContents({ sheet: sid, row: 0, col: 0 }, [[runsPerMonth]]);
  hf.setCellContents({ sheet: sid, row: 0, col: 1 }, [[inputTokensPerRun]]);
  hf.setCellContents({ sheet: sid, row: 0, col: 2 }, [[outputTokensPerRun]]);
  hf.setCellContents({ sheet: sid, row: 0, col: 3 }, [[inputTokenPricePerM]]);
  hf.setCellContents({ sheet: sid, row: 0, col: 4 }, [[outputTokenPricePerM]]);

  const formula = '=ROUND(12*((A1*B1/1000000)*D1+(A1*C1/1000000)*E1), 2)';
  hf.setCellContents({ sheet: sid, row: 1, col: 0 }, [[formula]]);
  const result = hf.getCellValue({ sheet: sid, row: 1, col: 0 });
  const value = typeof result === 'number' ? result : 0;

  return {
    value,
    trace: {
      formula,
      inputs: { runsPerMonth, inputTokensPerRun, outputTokensPerRun, inputTokenPricePerM, outputTokenPricePerM },
      output: value,
    },
  };
}
