// server/calculation-postprocessor.ts
// Post-processes AI-generated analysis to ensure all calculations are deterministic and accurate

import {
  calculateCostBenefit,
  calculateRevenueBenefit,
  calculateCashFlowBenefit,
  calculateRiskBenefit,
  calculateTokenCost,
  calculateTotalAnnualValue,
  calculatePriorityScore,
  calculateValuePerMillionTokens,
  getPriorityTier,
  getRecommendedPhase,
  formatMoney,
  DEFAULT_MULTIPLIERS,
} from "../src/calc/formulas";

interface Step5Record {
  ID: string;
  "Use Case": string;
  "Revenue Benefit ($)"?: string;
  "Revenue Formula"?: string;
  "Cost Benefit ($)"?: string;
  "Cost Formula"?: string;
  "Cash Flow Benefit ($)"?: string;
  "Cash Flow Formula"?: string;
  "Risk Benefit ($)"?: string;
  "Risk Formula"?: string;
  "Total Annual Value ($)"?: string;
  "Probability of Success"?: number;
}

interface Step6Record {
  ID: string;
  "Use Case": string;
  "Data Readiness (1-5)": number;
  "Integration Complexity (1-5)": number;
  "Change Mgmt (1-5)": number;
  "Effort Score (1-5)": number;
  "Time-to-Value (months)": number;
  "Input Tokens/Run": number;
  "Output Tokens/Run": number;
  "Runs/Month": number;
  "Monthly Tokens"?: number;
  "Annual Token Cost ($)"?: string;
}

interface Step7Record {
  ID: string;
  "Use Case": string;
  "Value Score (0-40)"?: number;
  "TTV Score (0-30)"?: number;
  "Effort Score (0-30)"?: number;
  "Priority Score (0-100)"?: number;
  "Priority Tier"?: string;
  "Recommended Phase"?: string;
}

// Parse a number from a string that may contain currency symbols, commas, M/K suffixes
function parseNumber(str: string | number | undefined): number {
  if (typeof str === "number") return str;
  if (!str || str === "$0" || str === "N/A" || str === "No direct" || str.includes("No ")) return 0;
  
  // Remove currency symbols and commas
  let cleaned = str.replace(/[$,]/g, "").trim();
  
  // Handle M (millions) and K (thousands) suffixes
  if (cleaned.endsWith("M")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000_000;
  }
  if (cleaned.endsWith("K")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000;
  }
  if (cleaned.endsWith("B")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000_000_000;
  }
  
  return parseFloat(cleaned) || 0;
}

// Extract numerical values from a formula string
// e.g., "23,000 hours × $100/hr × 0.85 savings × 0.90 × 0.75 = $13,253,250"
function extractFormulaInputs(formula: string): number[] {
  if (!formula || formula.includes("No direct") || formula.includes("No quantifiable")) {
    return [];
  }
  
  // Split by = and take the left side (the formula part, not the result)
  const formulaPart = formula.split("=")[0] || formula;
  
  // Extract all numbers (including decimals and percentages)
  const numbers: number[] = [];
  
  // Match patterns like: 23,000 or 100 or 0.85 or 15% or $100 or $2.1M
  const patterns = formulaPart.match(/[\d,]+\.?\d*[%MKB]?|\d+\.?\d*[%MKB]?/g) || [];
  
  for (const match of patterns) {
    let value = parseFloat(match.replace(/,/g, ""));
    
    // Handle percentage
    if (match.endsWith("%")) {
      value = parseFloat(match.slice(0, -1)) / 100;
    }
    // Handle M suffix
    else if (match.endsWith("M")) {
      value = parseFloat(match.slice(0, -1)) * 1_000_000;
    }
    // Handle K suffix
    else if (match.endsWith("K")) {
      value = parseFloat(match.slice(0, -1)) * 1_000;
    }
    // Handle B suffix
    else if (match.endsWith("B")) {
      value = parseFloat(match.slice(0, -1)) * 1_000_000_000;
    }
    
    if (!isNaN(value)) {
      numbers.push(value);
    }
  }
  
  return numbers;
}

// Parse cost formula and recalculate
// Expected format: "23,000 hours × $100/hr × 0.85 savings × 0.90 × 0.75"
function recalculateCostBenefit(formula: string): { value: number; formulaText: string } {
  if (!formula || formula.includes("No direct") || formula.includes("No quantifiable")) {
    return { value: 0, formulaText: "No direct cost reduction" };
  }
  
  const numbers = extractFormulaInputs(formula);
  
  if (numbers.length < 2) {
    return { value: 0, formulaText: formula };
  }
  
  // Try to identify hours and rate from the formula
  // The first large number is typically hours, second is rate
  let hoursSaved = 0;
  let loadedHourlyRate = 0;
  let efficiencyMultiplier = DEFAULT_MULTIPLIERS.efficiencyMultiplier;
  let costRealization = DEFAULT_MULTIPLIERS.costRealizationMultiplier;
  let dataMaturity = DEFAULT_MULTIPLIERS.dataMaturityMultiplier;
  
  // Parse formula to extract values
  const lowerFormula = formula.toLowerCase();
  
  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    
    if (num >= 1000 && hoursSaved === 0) {
      // First large number is likely hours
      hoursSaved = num;
    } else if (num >= 50 && num <= 500 && loadedHourlyRate === 0) {
      // Reasonable hourly rate range
      loadedHourlyRate = num;
    } else if (num > 0 && num <= 1) {
      // Multiplier (efficiency, adoption, etc.)
      if (Math.abs(num - 0.85) < 0.01 || Math.abs(num - 0.50) < 0.01 || Math.abs(num - 0.55) < 0.01 || 
          Math.abs(num - 0.60) < 0.01 || Math.abs(num - 0.40) < 0.01 || Math.abs(num - 0.75) < 0.01 ||
          Math.abs(num - 0.80) < 0.01) {
        if (i === numbers.indexOf(num)) {
          // First decimal might be efficiency/savings rate
          efficiencyMultiplier = num;
        }
      }
      if (Math.abs(num - 0.90) < 0.01) {
        costRealization = num;
      }
      if (Math.abs(num - 0.75) < 0.01) {
        dataMaturity = num;
      }
    }
  }
  
  // If we couldn't parse structured inputs, compute manually from all multipliers
  if (hoursSaved > 0 && loadedHourlyRate > 0) {
    // Find all decimals for multipliers
    const decimals = numbers.filter(n => n > 0 && n <= 1);
    
    // Calculate: hours × rate × (all decimals multiplied together)
    let multiplierProduct = 1;
    for (const d of decimals) {
      multiplierProduct *= d;
    }
    
    const rawValue = hoursSaved * loadedHourlyRate * multiplierProduct;
    const roundedValue = Math.floor(rawValue / 100000) * 100000;
    
    const newFormula = `${hoursSaved.toLocaleString()} hours × $${loadedHourlyRate}/hr × ${decimals.map(d => d.toFixed(2)).join(" × ")} = ${formatMoney(rawValue)} → ${formatMoney(roundedValue)}`;
    
    return { value: roundedValue, formulaText: newFormula };
  }
  
  // Fallback: multiply all extracted numbers
  let product = 1;
  for (const num of numbers) {
    product *= num;
  }
  const roundedValue = Math.floor(product / 100000) * 100000;
  
  return { value: roundedValue, formulaText: formula };
}

// Parse revenue formula and recalculate
function recalculateRevenueBenefit(formula: string): { value: number; formulaText: string } {
  if (!formula || formula.includes("No direct") || formula.includes("No quantifiable")) {
    return { value: 0, formulaText: "No direct revenue impact" };
  }
  
  const numbers = extractFormulaInputs(formula);
  
  if (numbers.length < 2) {
    return { value: 0, formulaText: formula };
  }
  
  // Multiply all the numbers in the formula
  let product = 1;
  for (const num of numbers) {
    product *= num;
  }
  
  const roundedValue = Math.floor(product / 100000) * 100000;
  
  // Reconstruct formula with correct result
  const formulaPart = formula.split("=")[0]?.trim() || formula;
  const newFormula = `${formulaPart} = ${formatMoney(product)} → ${formatMoney(roundedValue)}`;
  
  return { value: roundedValue, formulaText: newFormula };
}

// Parse cash flow formula and recalculate
function recalculateCashFlowBenefit(formula: string): { value: number; formulaText: string } {
  if (!formula || formula.includes("No direct") || formula.includes("No quantifiable")) {
    return { value: 0, formulaText: "No direct cash flow impact" };
  }
  
  const numbers = extractFormulaInputs(formula);
  
  if (numbers.length < 2) {
    return { value: 0, formulaText: formula };
  }
  
  // Multiply all the numbers in the formula
  let product = 1;
  for (const num of numbers) {
    product *= num;
  }
  
  const roundedValue = Math.floor(product / 100000) * 100000;
  
  // Reconstruct formula with correct result
  const formulaPart = formula.split("=")[0]?.trim() || formula;
  const newFormula = `${formulaPart} = ${formatMoney(product)} → ${formatMoney(roundedValue)}`;
  
  return { value: roundedValue, formulaText: newFormula };
}

// Parse risk formula and recalculate
function recalculateRiskBenefit(formula: string): { value: number; formulaText: string } {
  if (!formula || formula.includes("No quantifiable") || formula.includes("No additional")) {
    return { value: 0, formulaText: "No quantifiable risk reduction" };
  }
  
  const numbers = extractFormulaInputs(formula);
  
  if (numbers.length < 2) {
    return { value: 0, formulaText: formula };
  }
  
  // Multiply all the numbers in the formula
  let product = 1;
  for (const num of numbers) {
    product *= num;
  }
  
  const roundedValue = Math.floor(product / 100000) * 100000;
  
  // Reconstruct formula with correct result
  const formulaPart = formula.split("=")[0]?.trim() || formula;
  const newFormula = `${formulaPart} = ${formatMoney(product)} → ${formatMoney(roundedValue)}`;
  
  return { value: roundedValue, formulaText: newFormula };
}

// Calculate token cost from Step 6 data
function calculateTokenCostFromStep6(record: Step6Record): { monthlyTokens: number; annualCost: number } {
  const runsPerMonth = record["Runs/Month"] || 0;
  const inputTokensPerRun = record["Input Tokens/Run"] || 0;
  const outputTokensPerRun = record["Output Tokens/Run"] || 0;
  
  const result = calculateTokenCost({
    runsPerMonth,
    inputTokensPerRun,
    outputTokensPerRun,
  });
  
  const monthlyTokens = runsPerMonth * (inputTokensPerRun + outputTokensPerRun);
  
  return { monthlyTokens, annualCost: result.value };
}

// Post-process the entire analysis result
export function postProcessAnalysis(analysisResult: any): any {
  if (!analysisResult || !analysisResult.steps) {
    return analysisResult;
  }
  
  const steps = [...analysisResult.steps];
  
  // Find Step 5 (Benefits Quantification) and Step 6 (Effort & Token Modeling)
  const step5 = steps.find((s: any) => s.step === 5);
  const step6 = steps.find((s: any) => s.step === 6);
  const step7 = steps.find((s: any) => s.step === 7);
  
  if (!step5?.data || !Array.isArray(step5.data)) {
    console.log("[postProcessAnalysis] Step 5 data not found or invalid");
    return analysisResult;
  }
  
  console.log("[postProcessAnalysis] Processing", step5.data.length, "use cases");
  
  // Recalculate all Step 5 benefits
  const correctedStep5Data: Step5Record[] = [];
  let totalCostBenefit = 0;
  let totalRevenueBenefit = 0;
  let totalCashFlowBenefit = 0;
  let totalRiskBenefit = 0;
  
  for (const record of step5.data as Step5Record[]) {
    const costResult = recalculateCostBenefit(record["Cost Formula"] || "");
    const revenueResult = recalculateRevenueBenefit(record["Revenue Formula"] || "");
    const cashFlowResult = recalculateCashFlowBenefit(record["Cash Flow Formula"] || "");
    const riskResult = recalculateRiskBenefit(record["Risk Formula"] || "");
    
    const totalValue = costResult.value + revenueResult.value + cashFlowResult.value + riskResult.value;
    const prob = record["Probability of Success"] || 0.75;
    const adjustedTotal = Math.floor((totalValue * prob) / 100000) * 100000;
    
    totalCostBenefit += costResult.value;
    totalRevenueBenefit += revenueResult.value;
    totalCashFlowBenefit += cashFlowResult.value;
    totalRiskBenefit += riskResult.value;
    
    correctedStep5Data.push({
      ...record,
      "Cost Benefit ($)": formatMoney(costResult.value),
      "Cost Formula": costResult.formulaText,
      "Revenue Benefit ($)": formatMoney(revenueResult.value),
      "Revenue Formula": revenueResult.formulaText,
      "Cash Flow Benefit ($)": formatMoney(cashFlowResult.value),
      "Cash Flow Formula": cashFlowResult.formulaText,
      "Risk Benefit ($)": formatMoney(riskResult.value),
      "Risk Formula": riskResult.formulaText,
      "Total Annual Value ($)": formatMoney(adjustedTotal),
    });
    
    console.log(`[postProcessAnalysis] ${record.ID}: Cost=${formatMoney(costResult.value)}, Revenue=${formatMoney(revenueResult.value)}, CashFlow=${formatMoney(cashFlowResult.value)}, Risk=${formatMoney(riskResult.value)}, Total=${formatMoney(adjustedTotal)}`);
  }
  
  // Update Step 5 data
  step5.data = correctedStep5Data;
  
  // Recalculate Step 6 token costs
  let totalMonthlyTokens = 0;
  
  if (step6?.data && Array.isArray(step6.data)) {
    const correctedStep6Data: Step6Record[] = [];
    
    for (const record of step6.data as Step6Record[]) {
      const tokenResult = calculateTokenCostFromStep6(record);
      totalMonthlyTokens += tokenResult.monthlyTokens;
      
      correctedStep6Data.push({
        ...record,
        "Monthly Tokens": tokenResult.monthlyTokens,
        "Annual Token Cost ($)": formatMoney(tokenResult.annualCost),
      });
    }
    
    step6.data = correctedStep6Data;
  }
  
  // Recalculate Step 7 priority scores
  if (step7?.data && Array.isArray(step7.data) && step6?.data) {
    const correctedStep7Data: Step7Record[] = [];
    
    for (const record of step7.data as Step7Record[]) {
      // Find matching Step 5 and Step 6 records
      const step5Record = correctedStep5Data.find(r => r.ID === record.ID);
      const step6Record = (step6.data as Step6Record[]).find(r => r.ID === record.ID);
      
      if (step5Record && step6Record) {
        const totalValue = parseNumber(step5Record["Total Annual Value ($)"]);
        const ttv = step6Record["Time-to-Value (months)"];
        const dataReadiness = step6Record["Data Readiness (1-5)"];
        const integrationComplexity = step6Record["Integration Complexity (1-5)"];
        const changeMgmt = step6Record["Change Mgmt (1-5)"];
        
        const priorityResult = calculatePriorityScore({
          totalAnnualValue: totalValue,
          timeToValueMonths: ttv,
          dataReadiness,
          integrationComplexity,
          changeMgmt,
        });
        
        const tier = getPriorityTier(priorityResult.value);
        const phase = getRecommendedPhase(priorityResult.value, ttv);
        
        correctedStep7Data.push({
          ...record,
          "Value Score (0-40)": Math.round(priorityResult.valueScore * 0.4),
          "TTV Score (0-30)": Math.round(priorityResult.ttvScore * 0.3),
          "Effort Score (0-30)": Math.round(priorityResult.effortScore * 0.3),
          "Priority Score (0-100)": priorityResult.value,
          "Priority Tier": tier,
          "Recommended Phase": phase,
        });
      } else {
        correctedStep7Data.push(record);
      }
    }
    
    step7.data = correctedStep7Data;
  }
  
  // Update executive dashboard
  const totalAnnualValue = totalCostBenefit + totalRevenueBenefit + totalCashFlowBenefit + totalRiskBenefit;
  const valuePerMillion = calculateValuePerMillionTokens({
    totalAnnualValue,
    totalMonthlyTokens,
  });
  
  // Get top 5 use cases by priority score
  const sortedUseCases = [...(step7?.data || [])].sort(
    (a: any, b: any) => (b["Priority Score (0-100)"] || 0) - (a["Priority Score (0-100)"] || 0)
  );
  
  const topUseCases = sortedUseCases.slice(0, 5).map((uc: any, index: number) => {
    const step5Record = correctedStep5Data.find(r => r.ID === uc.ID);
    return {
      rank: index + 1,
      useCase: uc["Use Case"],
      priorityScore: uc["Priority Score (0-100)"] || 0,
      monthlyTokens: (step6?.data as Step6Record[])?.find(r => r.ID === uc.ID)?.["Monthly Tokens"] || 0,
      annualValue: parseNumber(step5Record?.["Total Annual Value ($)"]),
    };
  });
  
  const correctedResult = {
    ...analysisResult,
    steps,
    executiveDashboard: {
      totalRevenueBenefit,
      totalCostBenefit,
      totalCashFlowBenefit,
      totalRiskBenefit,
      totalAnnualValue,
      totalMonthlyTokens,
      valuePerMillionTokens: valuePerMillion.value,
      topUseCases,
    },
  };
  
  console.log(`[postProcessAnalysis] Dashboard: TotalValue=${formatMoney(totalAnnualValue)}, Cost=${formatMoney(totalCostBenefit)}, Revenue=${formatMoney(totalRevenueBenefit)}, CashFlow=${formatMoney(totalCashFlowBenefit)}, Risk=${formatMoney(totalRiskBenefit)}`);
  
  return correctedResult;
}
