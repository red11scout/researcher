import { HyperFormula } from 'hyperformula';

export interface HFCalcResult {
  value: number;
  rawValue: number;
  formulaText: string;
  verified: boolean;
  inputs: Record<string, number>;
  auditTrail: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) {
    const b = n / 1_000_000_000;
    return `$${b % 1 === 0 ? b.toFixed(0) : b.toFixed(1)}B`;
  }
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}K`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtExact(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function computeInHyperFormula(values: number[], formula: string): number {
  const hf = HyperFormula.buildFromArray(
    [values, [formula]],
    { licenseKey: 'gpl-v3', precisionRounding: 10 },
  );
  const result = hf.getCellValue({ sheet: 0, row: 1, col: 0 });
  hf.destroy();
  if (typeof result === 'number') return result;
  console.warn(`[HyperFormula] Non-numeric result for formula "${formula}": ${result}`);
  return 0;
}

function verify(inputs: number[], result: number): boolean {
  let product = 1;
  for (const v of inputs) {
    product *= v;
  }
  const diff = Math.abs(product - result);
  return diff < 0.01;
}

export function calcCostBenefit(inputs: {
  hoursSaved: number;
  loadedHourlyRate: number;
  benefitsLoading: number;
  adoptionRate: number;
  dataMaturity: number;
}): HFCalcResult {
  const { hoursSaved, loadedHourlyRate, benefitsLoading, adoptionRate, dataMaturity } = inputs;
  const values = [hoursSaved, loadedHourlyRate, benefitsLoading, adoptionRate, dataMaturity];
  const formula = '=A1*B1*C1*D1*E1';
  const rawValue = computeInHyperFormula(values, formula);
  const roundedValue = Math.floor(rawValue / 100_000) * 100_000;
  const verified = verify(values, rawValue);

  if (!verified) {
    console.error(`[HyperFormula VERIFICATION FAILED] Cost: ${values.join(' × ')} expected ${values.reduce((a, b) => a * b, 1)} got ${rawValue}`);
  }

  const formulaText = `${fmtNum(hoursSaved)} hours × $${loadedHourlyRate}/hr × ${benefitsLoading} × ${adoptionRate} × ${dataMaturity} = ${fmtExact(rawValue)} → ${fmt(roundedValue)}`;

  return {
    value: roundedValue,
    rawValue,
    formulaText,
    verified,
    inputs: { hoursSaved, loadedHourlyRate, benefitsLoading, adoptionRate, dataMaturity },
    auditTrail: `HyperFormula: ${formula} with [${values.join(', ')}] = ${rawValue} (rounded to ${roundedValue})`,
  };
}

export function calcRevenueBenefit(inputs: {
  upliftPct: number;
  baselineRevenueAtRisk: number;
  realizationFactor: number;
  dataMaturity: number;
}): HFCalcResult {
  const { upliftPct, baselineRevenueAtRisk, realizationFactor, dataMaturity } = inputs;
  const cappedUplift = Math.min(upliftPct, 0.50);
  const values = [cappedUplift, baselineRevenueAtRisk, realizationFactor, dataMaturity];
  const formula = '=A1*B1*C1*D1';
  const rawValue = computeInHyperFormula(values, formula);
  const roundedValue = Math.floor(rawValue / 100_000) * 100_000;
  const verified = verify(values, rawValue);

  if (!verified) {
    console.error(`[HyperFormula VERIFICATION FAILED] Revenue: ${values.join(' × ')} expected ${values.reduce((a, b) => a * b, 1)} got ${rawValue}`);
  }

  const pctDisplay = (cappedUplift * 100).toFixed(1);
  const formulaText = `${pctDisplay}% uplift × ${fmt(baselineRevenueAtRisk)} revenue × ${realizationFactor} × ${dataMaturity} = ${fmtExact(rawValue)} → ${fmt(roundedValue)}`;

  return {
    value: roundedValue,
    rawValue,
    formulaText,
    verified,
    inputs: { upliftPct: cappedUplift, baselineRevenueAtRisk, realizationFactor, dataMaturity },
    auditTrail: `HyperFormula: ${formula} with [${values.join(', ')}] = ${rawValue} (rounded to ${roundedValue})`,
  };
}

export function calcCashFlowBenefit(inputs: {
  annualRevenue: number;
  daysImprovement: number;
  costOfCapital: number;
  realizationFactor: number;
  dataMaturity: number;
}): HFCalcResult {
  const { annualRevenue, daysImprovement, costOfCapital, realizationFactor, dataMaturity } = inputs;
  const values = [annualRevenue, daysImprovement, costOfCapital, realizationFactor, dataMaturity];
  const formula = '=A1*(B1/365)*C1*D1*E1';
  const rawValue = computeInHyperFormula(values, formula);
  const roundedValue = Math.floor(rawValue / 100_000) * 100_000;

  const manualCalc = annualRevenue * (daysImprovement / 365) * costOfCapital * realizationFactor * dataMaturity;
  const verified = Math.abs(manualCalc - rawValue) < 0.01;

  if (!verified) {
    console.error(`[HyperFormula VERIFICATION FAILED] CashFlow: manual=${manualCalc} hf=${rawValue}`);
  }

  const formulaText = `${fmt(annualRevenue)} × (${daysImprovement} days / 365) × ${(costOfCapital * 100).toFixed(1)}% WACC × ${realizationFactor} × ${dataMaturity} = ${fmtExact(rawValue)} → ${fmt(roundedValue)}`;

  return {
    value: roundedValue,
    rawValue,
    formulaText,
    verified,
    inputs: { annualRevenue, daysImprovement, costOfCapital, realizationFactor, dataMaturity },
    auditTrail: `HyperFormula: ${formula} with [${values.join(', ')}] = ${rawValue} (rounded to ${roundedValue})`,
  };
}

export function calcRiskBenefit(inputs: {
  riskReductionPct: number;
  riskExposure: number;
  realizationFactor: number;
  dataMaturity: number;
}): HFCalcResult {
  const { riskReductionPct, riskExposure, realizationFactor, dataMaturity } = inputs;
  const maxReduction = 0.50;
  const cappedReduction = Math.min(riskReductionPct, maxReduction);
  const values = [cappedReduction, riskExposure, realizationFactor, dataMaturity];
  const formula = '=A1*B1*C1*D1';
  const rawValue = computeInHyperFormula(values, formula);
  const roundedValue = Math.floor(rawValue / 100_000) * 100_000;
  const verified = verify(values, rawValue);

  if (!verified) {
    console.error(`[HyperFormula VERIFICATION FAILED] Risk: ${values.join(' × ')} expected ${values.reduce((a, b) => a * b, 1)} got ${rawValue}`);
  }

  const pctDisplay = (cappedReduction * 100).toFixed(0);
  const formulaText = `${pctDisplay}% reduction × ${fmt(riskExposure)} exposure × ${realizationFactor} × ${dataMaturity} = ${fmtExact(rawValue)} → ${fmt(roundedValue)}`;

  return {
    value: roundedValue,
    rawValue,
    formulaText,
    verified,
    inputs: { riskReductionPct: cappedReduction, riskExposure, realizationFactor, dataMaturity },
    auditTrail: `HyperFormula: ${formula} with [${values.join(', ')}] = ${rawValue} (rounded to ${roundedValue})`,
  };
}

export function calcFrictionCost(inputs: {
  annualHours: number;
  loadedHourlyRate: number;
}): HFCalcResult {
  const { annualHours, loadedHourlyRate } = inputs;
  const values = [annualHours, loadedHourlyRate];
  const formula = '=A1*B1';
  const rawValue = computeInHyperFormula(values, formula);
  const roundedValue = Math.floor(rawValue / 10_000) * 10_000;
  const verified = verify(values, rawValue);

  if (!verified) {
    console.error(`[HyperFormula VERIFICATION FAILED] Friction: ${values.join(' × ')} expected ${values.reduce((a, b) => a * b, 1)} got ${rawValue}`);
  }

  const formulaText = `${fmtNum(annualHours)} hours × $${loadedHourlyRate}/hr = ${fmtExact(rawValue)} → ${fmt(roundedValue)}`;

  return {
    value: roundedValue,
    rawValue,
    formulaText,
    verified,
    inputs: { annualHours, loadedHourlyRate },
    auditTrail: `HyperFormula: ${formula} with [${values.join(', ')}] = ${rawValue} (rounded to ${roundedValue})`,
  };
}

export interface FullBenefitResult {
  cost: HFCalcResult;
  revenue: HFCalcResult;
  cashFlow: HFCalcResult;
  risk: HFCalcResult;
  totalAnnualValue: number;
  expectedValue: number;
  probabilityOfSuccess: number;
  allVerified: boolean;
}

const ZERO_RESULT: HFCalcResult = {
  value: 0,
  rawValue: 0,
  formulaText: 'No direct impact',
  verified: true,
  inputs: {},
  auditTrail: 'No inputs provided — zero value',
};

export interface StructuredLabels {
  components?: Array<{ label: string; value: number | string }>;
}

function extractLabelValue(labels: StructuredLabels | string | undefined, targetLabels: string[]): number | null {
  if (!labels) return null;
  let parsed: StructuredLabels;
  if (typeof labels === 'string') {
    try { parsed = JSON.parse(labels); } catch { return null; }
  } else {
    parsed = labels;
  }
  if (!parsed.components || !Array.isArray(parsed.components)) return null;

  for (const target of targetLabels) {
    const tLower = target.toLowerCase();
    for (const comp of parsed.components) {
      const label = comp.label.toLowerCase();
      if (label.includes(tLower)) {
        const val = typeof comp.value === 'string' ? parseFloat(comp.value.replace(/[$,]/g, '')) : comp.value;
        if (!isNaN(val)) return val;
      }
    }
  }
  return null;
}

function hasNonEmptyLabels(labels: StructuredLabels | string | undefined): boolean {
  if (!labels) return false;
  let parsed: StructuredLabels;
  if (typeof labels === 'string') {
    try { parsed = JSON.parse(labels); } catch { return false; }
  } else {
    parsed = labels;
  }
  return !!parsed.components && Array.isArray(parsed.components) && parsed.components.length > 0;
}

export function computeUseCaseBenefits(record: {
  "Cost Formula Labels"?: StructuredLabels | string;
  "Revenue Formula Labels"?: StructuredLabels | string;
  "Cash Flow Formula Labels"?: StructuredLabels | string;
  "Risk Formula Labels"?: StructuredLabels | string;
  "Probability of Success"?: number;
  [key: string]: any;
}, defaults: {
  benefitsLoading: number;
  costRealizationFactor: number;
  revenueRealizationFactor: number;
  cashFlowRealizationFactor: number;
  riskRealizationFactor: number;
  dataMaturity: number;
  annualRevenue: number;
  costOfCapital: number;
}): FullBenefitResult {
  let cost = { ...ZERO_RESULT };
  let revenue = { ...ZERO_RESULT };
  let cashFlow = { ...ZERO_RESULT };
  let risk = { ...ZERO_RESULT };

  const costLabels = record["Cost Formula Labels"];
  if (hasNonEmptyLabels(costLabels)) {
    const hours = extractLabelValue(costLabels, ['hours saved', 'hours']);
    const rate = extractLabelValue(costLabels, ['hourly rate', 'rate', 'loaded']);
    const loading = extractLabelValue(costLabels, ['benefits loading', 'loading']);
    const adoption = extractLabelValue(costLabels, ['adoption', 'realization']);
    const maturity = extractLabelValue(costLabels, ['data maturity', 'maturity']);

    if (hours !== null && hours > 0) {
      cost = calcCostBenefit({
        hoursSaved: hours,
        loadedHourlyRate: rate !== null ? rate : 60,
        benefitsLoading: loading !== null ? loading : defaults.benefitsLoading,
        adoptionRate: adoption !== null ? adoption : defaults.costRealizationFactor,
        dataMaturity: maturity !== null ? maturity : defaults.dataMaturity,
      });
    }
  }

  const revLabels = record["Revenue Formula Labels"];
  if (hasNonEmptyLabels(revLabels)) {
    const uplift = extractLabelValue(revLabels, ['uplift', 'lift']);
    const baseRev = extractLabelValue(revLabels, ['revenue at risk', 'revenue', 'pipeline', 'baseline']);
    const realization = extractLabelValue(revLabels, ['realization']);
    const maturity = extractLabelValue(revLabels, ['data maturity', 'maturity']);

    if (uplift !== null && uplift > 0 && baseRev !== null && baseRev > 0) {
      const upliftDecimal = uplift > 1 ? uplift / 100 : uplift;
      revenue = calcRevenueBenefit({
        upliftPct: upliftDecimal,
        baselineRevenueAtRisk: baseRev,
        realizationFactor: realization !== null ? realization : defaults.revenueRealizationFactor,
        dataMaturity: maturity !== null ? maturity : defaults.dataMaturity,
      });
    }
  }

  const cfLabels = record["Cash Flow Formula Labels"];
  if (hasNonEmptyLabels(cfLabels)) {
    const annRev = extractLabelValue(cfLabels, ['annual revenue', 'revenue']);
    const days = extractLabelValue(cfLabels, ['days improved', 'days improvement', 'days']);
    const coc = extractLabelValue(cfLabels, ['cost of capital', 'capital', 'wacc']);
    const realization = extractLabelValue(cfLabels, ['realization']);
    const maturity = extractLabelValue(cfLabels, ['data maturity', 'maturity']);

    if (days !== null && days > 0 && ((annRev !== null && annRev > 0) || defaults.annualRevenue > 0)) {
      const cocDecimal = coc !== null ? (coc > 1 ? coc / 100 : coc) : defaults.costOfCapital;
      cashFlow = calcCashFlowBenefit({
        annualRevenue: annRev !== null ? annRev : defaults.annualRevenue,
        daysImprovement: days,
        costOfCapital: cocDecimal,
        realizationFactor: realization !== null ? realization : defaults.cashFlowRealizationFactor,
        dataMaturity: maturity !== null ? maturity : defaults.dataMaturity,
      });
    }
  }

  const riskLabels = record["Risk Formula Labels"];
  if (hasNonEmptyLabels(riskLabels)) {
    const reduction = extractLabelValue(riskLabels, ['risk reduction', 'reduction']);
    const exposure = extractLabelValue(riskLabels, ['risk exposure', 'exposure']);
    const realization = extractLabelValue(riskLabels, ['realization']);
    const maturity = extractLabelValue(riskLabels, ['data maturity', 'maturity']);

    if (reduction !== null && reduction > 0 && exposure !== null && exposure > 0) {
      const reductionDecimal = reduction > 1 ? reduction / 100 : reduction;
      risk = calcRiskBenefit({
        riskReductionPct: reductionDecimal,
        riskExposure: exposure,
        realizationFactor: realization !== null ? realization : defaults.riskRealizationFactor,
        dataMaturity: maturity !== null ? maturity : defaults.dataMaturity,
      });
    }
  }

  const totalAnnualValue = cost.value + revenue.value + cashFlow.value + risk.value;
  const prob = typeof record["Probability of Success"] === 'number'
    ? record["Probability of Success"]
    : 0.75;
  const expectedValue = totalAnnualValue * prob;
  const allVerified = cost.verified && revenue.verified && cashFlow.verified && risk.verified;

  return {
    cost,
    revenue,
    cashFlow,
    risk,
    totalAnnualValue,
    expectedValue,
    probabilityOfSuccess: prob,
    allVerified,
  };
}
