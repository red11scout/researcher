import type { FormulaConstant } from "@shared/schema";

export interface FormulaContext {
  [key: string]: number;
}

export interface EvaluationStep {
  label: string;
  value: number;
  formatted?: string;
}

export interface FormulaResult {
  value: number;
  steps: EvaluationStep[];
  error?: string;
}

export interface FormulaValidation {
  isValid: boolean;
  errors: string[];
  missingVariables: string[];
  usedVariables: string[];
}

const ALLOWED_FUNCTIONS = ['max', 'min', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'pow'];

const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  max: Math.max,
  min: Math.min,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  pow: Math.pow,
};

function extractVariables(expression: string): string[] {
  const variablePattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const matches = expression.match(variablePattern) || [];
  const filtered = matches.filter(v => !ALLOWED_FUNCTIONS.includes(v));
  return Array.from(new Set(filtered));
}

function sanitizeExpression(expression: string): string {
  const dangerousPatterns = [
    /\beval\b/gi,
    /\bFunction\b/gi,
    /\bnew\b/gi,
    /\breturn\b/gi,
    /\bimport\b/gi,
    /\brequire\b/gi,
    /\bprocess\b/gi,
    /\bglobal\b/gi,
    /\bwindow\b/gi,
    /\bdocument\b/gi,
    /\bconsole\b/gi,
    /\[\s*['"`]/g,
    /['"`]\s*\]/g,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(expression)) {
      throw new Error(`Unsafe expression pattern detected`);
    }
  }
  
  return expression;
}

export function validateFormula(
  expression: string,
  availableVariables: string[]
): FormulaValidation {
  const errors: string[] = [];
  const usedVariables = extractVariables(expression);
  const missingVariables: string[] = [];

  try {
    sanitizeExpression(expression);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Invalid expression');
    return { isValid: false, errors, missingVariables, usedVariables };
  }

  for (const v of usedVariables) {
    if (!availableVariables.includes(v)) {
      missingVariables.push(v);
    }
  }

  if (missingVariables.length > 0) {
    errors.push(`Unknown variables: ${missingVariables.join(', ')}`);
  }

  let bracketCount = 0;
  for (const char of expression) {
    if (char === '(') bracketCount++;
    if (char === ')') bracketCount--;
    if (bracketCount < 0) {
      errors.push('Mismatched parentheses');
      break;
    }
  }
  if (bracketCount !== 0 && !errors.some(e => e.includes('parentheses'))) {
    errors.push('Mismatched parentheses');
  }

  const validCharsPattern = /^[\w\s+\-*/().,%]+$/;
  if (!validCharsPattern.test(expression)) {
    errors.push('Expression contains invalid characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingVariables,
    usedVariables,
  };
}

function buildEvaluator(
  expression: string,
  context: FormulaContext
): () => number {
  sanitizeExpression(expression);
  
  let processedExpr = expression;
  
  const sortedVars = Object.keys(context).sort((a, b) => b.length - a.length);
  for (const key of sortedVars) {
    const value = context[key];
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    processedExpr = processedExpr.replace(regex, String(value));
  }

  for (const [name, fn] of Object.entries(MATH_FUNCTIONS)) {
    const fnPattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
    processedExpr = processedExpr.replace(fnPattern, `Math.${name}(`);
  }

  try {
    const evalFn = new Function(`"use strict"; return (${processedExpr});`) as () => number;
    return evalFn;
  } catch (e) {
    throw new Error(`Invalid formula syntax: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
}

export function evaluateFormula(
  expression: string,
  context: FormulaContext,
  constants: FormulaConstant[] = []
): FormulaResult {
  const steps: EvaluationStep[] = [];
  
  const fullContext = { ...context };
  for (const constant of constants) {
    fullContext[constant.key] = constant.value;
    steps.push({
      label: constant.label || constant.key,
      value: constant.value,
      formatted: formatNumber(constant.value),
    });
  }

  for (const [key, value] of Object.entries(context)) {
    steps.push({
      label: camelToTitleCase(key),
      value,
      formatted: formatNumber(value),
    });
  }

  try {
    const evaluator = buildEvaluator(expression, fullContext);
    const result = evaluator();

    if (!isFinite(result)) {
      return {
        value: 0,
        steps,
        error: 'Calculation resulted in invalid value (division by zero or overflow)',
      };
    }

    steps.push({
      label: 'Result',
      value: result,
      formatted: formatNumber(result),
    });

    return { value: result, steps };
  } catch (e) {
    return {
      value: 0,
      steps,
      error: e instanceof Error ? e.message : 'Evaluation failed',
    };
  }
}

export function previewFormula(
  expression: string,
  context: FormulaContext,
  constants: FormulaConstant[] = []
): FormulaResult {
  const availableVars = [
    ...Object.keys(context),
    ...constants.map(c => c.key),
  ];

  const validation = validateFormula(expression, availableVars);

  if (!validation.isValid) {
    return {
      value: 0,
      steps: [],
      error: validation.errors.join('; '),
    };
  }

  return evaluateFormula(expression, context, constants);
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toFixed(2);
}

function camelToTitleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

export const AVAILABLE_INPUTS: Record<string, { label: string; description: string; category: string }> = {
  revenueBenefit: { label: "Revenue Benefit ($)", description: "Annual revenue increase from AI use case", category: "benefits" },
  costBenefit: { label: "Cost Benefit ($)", description: "Annual cost savings from AI use case", category: "benefits" },
  cashFlowBenefit: { label: "Cash Flow Benefit ($)", description: "Annual cash flow improvement", category: "benefits" },
  riskBenefit: { label: "Risk Benefit ($)", description: "Annual risk reduction value", category: "benefits" },
  totalAnnualImpact: { label: "Total Annual Impact ($)", description: "Sum of all benefit categories", category: "calculated" },
  probabilityOfSuccess: { label: "Probability of Success (%)", description: "Estimated success probability", category: "risk" },
  timeToValueMonths: { label: "Time to Value (months)", description: "Months until value realization", category: "timing" },
  effortScore: { label: "Effort Score (0-100)", description: "Implementation effort estimate", category: "effort" },
  valueScore: { label: "Value Score (0-100)", description: "Normalized value score", category: "calculated" },
  ttvScore: { label: "TTV Score (0-100)", description: "Time-to-value score", category: "calculated" },
  maxTotalImpact: { label: "Max Total Impact ($)", description: "Highest impact among all use cases", category: "context" },
  weightValue: { label: "Value Weight (%)", description: "Weight for value in priority scoring", category: "weights" },
  weightTtv: { label: "TTV Weight (%)", description: "Weight for time-to-value in scoring", category: "weights" },
  weightEffort: { label: "Effort Weight (%)", description: "Weight for effort in priority scoring", category: "weights" },
  avgInputTokens: { label: "Avg Input Tokens", description: "Average input tokens per AI call", category: "ai" },
  avgOutputTokens: { label: "Avg Output Tokens", description: "Average output tokens per AI call", category: "ai" },
  inputTokenCost: { label: "Input Token Cost ($/1M)", description: "Cost per million input tokens", category: "ai" },
  outputTokenCost: { label: "Output Token Cost ($/1M)", description: "Cost per million output tokens", category: "ai" },
  runsPerYear: { label: "Runs Per Year", description: "Estimated annual AI invocations", category: "ai" },
  cachingEffectiveness: { label: "Caching Effectiveness (%)", description: "Percentage of cached prompts", category: "ai" },
  promptCachingDiscount: { label: "Prompt Caching Discount (%)", description: "Discount for cached prompts", category: "ai" },
  implementationCost: { label: "Implementation Cost ($)", description: "One-time implementation cost", category: "costs" },
  annualTokenCost: { label: "Annual Token Cost ($)", description: "Annual AI API costs", category: "calculated" },
};

export function getInputsByCategory(): Record<string, { key: string; label: string; description: string }[]> {
  const grouped: Record<string, { key: string; label: string; description: string }[]> = {};
  
  for (const [key, info] of Object.entries(AVAILABLE_INPUTS)) {
    if (!grouped[info.category]) {
      grouped[info.category] = [];
    }
    grouped[info.category].push({ key, label: info.label, description: info.description });
  }
  
  return grouped;
}
