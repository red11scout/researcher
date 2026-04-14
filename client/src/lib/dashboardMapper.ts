import type { DashboardData, KPI, MatrixDataPoint, UseCase, ValueInsight } from "@/components/Dashboard";
import { format, parseFormattedValue } from "@/lib/formatters";

// Sanitize text to remove markdown artifacts and ensure professional prose
function sanitizeForProse(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^[-_*]{3,}\s*$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|\s*[-:]+\s*\|/g, '')
    .replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c: string) => c.trim()).filter((c: string) => c);
      return cells.join(', ');
    })
    .replace(/\|/g, ' ')
    .replace(/⚠️?/g, '')
    .replace(/[\u2600-\u26FF\u2700-\u27BF]/g, '')
    .replace(/[→←↑↓↗↘]/g, '')
    .replace(/\[(HIGH|MEDIUM|LOW|ASSUMPTION|ESTIMATED|DATED)[^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const BRAND = {
  primary: '#0339AF',
  accent: '#4C73E9',
  success: '#059669',
  teal: '#0D9488',
  gray: '#94A3B8',
};

interface ReportAnalysisData {
  steps: Array<{
    step: number;
    title: string;
    content: string;
    data: any;
  }>;
  summary: string;
  scenarioAnalysis?: {
    conservative?: { annualBenefit: number | string; npv: number | string; paybackMonths?: number };
    moderate?: { annualBenefit: number | string; npv: number | string; paybackMonths?: number };
    aggressive?: { annualBenefit: number | string; npv: number | string; paybackMonths?: number };
  };
  executiveDashboard: {
    totalRevenueBenefit: number;
    totalCostBenefit: number;
    totalCashFlowBenefit: number;
    totalRiskBenefit: number;
    totalAnnualValue: number;
    totalMonthlyTokens: number;
    valuePerMillionTokens: number;
    topUseCases: Array<{
      rank: number;
      useCase: string;
      priorityScore: number;
      monthlyTokens: number;
      annualValue: number;
    }>;
  };
}

interface Report {
  id: string;
  companyName: string;
  analysisData: ReportAnalysisData;
  createdAt: string | Date;
  updatedAt: string | Date;
}

function formatValue(value: number): string {
  return format.currencyAuto(value);
}

function formatTokens(tokens: number): string {
  return format.tokensPerMonth(tokens);
}

function calculateGrowthPercent(value: number, total: number): string {
  if (total === 0) return "+0%";
  const percent = Math.round((value / total) * 100);
  return `+${percent}%`;
}

function getComplexityLabel(score: number): string {
  if (score >= 4.5) return "Critical";
  if (score >= 3.5) return "High";
  if (score >= 2.5) return "Medium";
  return "Low";
}

// ============================================================================
// VALUE-READINESS MATRIX: New scoring system (1-10 scale)
// ============================================================================

// Normalize annual values to 1-10 scale using min-max normalization
function normalizeValuesToScale(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 5.5);
  return values.map(v => Math.round((1 + ((v - min) / (max - min)) * 9) * 10) / 10);
}

// Get quadrant type based on new thresholds (5.5 midpoint on 1-10 scale)
function getQuadrantType(normalizedValue: number, readinessScore: number): string {
  if (normalizedValue >= 5.5 && readinessScore >= 5.5) return "Champion";
  if (normalizedValue >= 5.5 && readinessScore < 5.5) return "Strategic";
  if (normalizedValue < 5.5 && readinessScore >= 5.5) return "Quick Win";
  return "Foundation";
}

function getQuadrantColor(type: string): string {
  switch (type) {
    case "Champion": return BRAND.success;
    case "Strategic": return BRAND.primary;
    case "Quick Win": return BRAND.teal;
    case "Foundation": return BRAND.gray;
    default: return BRAND.accent;
  }
}

function getTierColor(tier: string): string {
  if (tier.includes('Champion')) return BRAND.success;
  if (tier.includes('Quick Win')) return BRAND.teal;
  if (tier.includes('Strategic')) return BRAND.primary;
  if (tier.includes('Foundation')) return BRAND.gray;
  // Legacy tier names
  switch (tier) {
    case 'Critical': return '#0F172A';
    case 'High': return BRAND.primary;
    case 'Medium': return BRAND.accent;
    case 'Low': return BRAND.gray;
    default: return BRAND.accent;
  }
}

// TTV bubble sizing: 1 - MIN(TTV/12, 1), with minimum visible size
function calculateTTVBubbleScore(ttvMonths: number): number {
  return Math.max(0, 1 - Math.min(ttvMonths / 12, 1));
}

// ============================================================================
// VALUE DRIVER INSIGHTS: Generate structured insight cards from dashboard data
// ============================================================================
function generateValueInsights(dashboard: ReportAnalysisData['executiveDashboard']): ValueInsight[] {
  const totalValue = dashboard.totalAnnualValue || 0;
  const insights: ValueInsight[] = [];

  const pillars = [
    {
      pillar: "Revenue",
      title: "Revenue Growth",
      value: dashboard.totalRevenueBenefit || 0,
      iconName: "TrendingUp",
      descTemplate: (pct: number) =>
        `${pct}% of total value from commercial growth, sales enablement, and market expansion opportunities.`
    },
    {
      pillar: "Cost",
      title: "Cost Reduction",
      value: dashboard.totalCostBenefit || 0,
      iconName: "Activity",
      descTemplate: (pct: number) =>
        `${pct}% of total value from back-office automation, process optimization, and labor efficiency.`
    },
    {
      pillar: "CashFlow",
      title: "Cash Flow Acceleration",
      value: dashboard.totalCashFlowBenefit || 0,
      iconName: "Banknote",
      descTemplate: (pct: number) =>
        `${pct}% of total value from working capital optimization and cycle time reduction.`
    },
    {
      pillar: "Risk",
      title: "Risk Mitigation",
      value: dashboard.totalRiskBenefit || 0,
      iconName: "Shield",
      descTemplate: (pct: number) =>
        `${pct}% of total value from enhanced compliance, fraud detection, and risk management.`
    },
  ];

  for (const p of pillars) {
    const pct = totalValue > 0 ? Math.round((p.value / totalValue) * 100) : 0;
    insights.push({
      pillar: p.pillar,
      title: p.title,
      metric: formatValue(p.value),
      description: p.descTemplate(pct),
      pctOfTotal: pct,
      iconName: p.iconName,
    });
  }

  return insights;
}

// ============================================================================
// EXTRACT SCENARIO COMPARISON from analysis data
// ============================================================================
function extractScenarioComparison(analysisData: ReportAnalysisData): {
  conservative: { annualBenefit: string; npv: string };
  moderate: { annualBenefit: string; npv: string };
  aggressive: { annualBenefit: string; npv: string };
} | null {
  if (!analysisData.scenarioAnalysis) {
    return null;
  }

  const scenarios = analysisData.scenarioAnalysis;
  const result: any = {};

  const scenarioKeys = ['conservative', 'moderate', 'aggressive'] as const;
  for (const key of scenarioKeys) {
    const scenario = scenarios[key];
    if (scenario) {
      result[key] = {
        annualBenefit: formatValue(
          typeof scenario.annualBenefit === 'string'
            ? parseFormattedValue(scenario.annualBenefit)
            : scenario.annualBenefit
        ),
        npv: formatValue(
          typeof scenario.npv === 'string'
            ? parseFormattedValue(scenario.npv)
            : scenario.npv
        ),
      };
    }
  }

  return Object.keys(result).length === 3 ? result : null;
}

// ============================================================================
// GROUP FRICTION POINTS by Strategic Theme
// ============================================================================
function extractFrictionByTheme(steps: ReportAnalysisData['steps']): Record<string, string[]> | null {
  const frictionData: Record<string, string[]> = {};

  // Look for friction points data in step 3 (friction point mapping) first, then fallback
  const frictionStep = steps.find(s => s.step === 3) || steps.find(s => s.title?.toLowerCase().includes('friction'));

  if (!frictionStep?.data || !Array.isArray(frictionStep.data)) {
    return null;
  }

  for (const item of frictionStep.data) {
    const theme = item['Strategic Theme'] || item.strategicTheme || item.theme || 'Other';
    const friction = item['Friction Point'] || item.frictionPoint || item.point || '';

    if (friction) {
      if (!frictionData[theme]) {
        frictionData[theme] = [];
      }
      frictionData[theme].push(friction);
    }
  }

  return Object.keys(frictionData).length > 0 ? frictionData : null;
}

// ============================================================================
// EXTRACT USE CASE DETAILS from step data
// ============================================================================
function extractUseCaseDetails(steps: ReportAnalysisData['steps'], useCaseName: string): {
  function?: string;
  description?: string;
  tags: string[];
  readinessScore?: number;
  timeToValue?: number;
  monthlyTokens?: number;
  organizationalCapacity?: number;
  dataAvailabilityQuality?: number;
  technicalInfrastructure?: number;
  governance?: number;
  // Legacy fields for backward compat
  effortScore?: number;
  dataReadiness?: number;
  integrationComplexity?: number;
  changeMgmt?: number;
} {
  const result: {
    function?: string; description?: string; tags: string[];
    readinessScore?: number; timeToValue?: number; monthlyTokens?: number;
    organizationalCapacity?: number; dataAvailabilityQuality?: number;
    technicalInfrastructure?: number; governance?: number;
    effortScore?: number; dataReadiness?: number; integrationComplexity?: number; changeMgmt?: number;
  } = { tags: [] };

  const step4 = steps.find(s => s.step === 4);
  if (step4?.data && Array.isArray(step4.data)) {
    const useCase = step4.data.find((uc: any) =>
      uc["Use Case Name"] === useCaseName || uc["Use Case"] === useCaseName || uc.useCase === useCaseName || uc.name === useCaseName
    );
    if (useCase) {
      result.function = useCase.Function || useCase.function;
      result.description = useCase.Description || useCase.description;
      if (result.function) {
        result.tags.push(result.function);
      }
    }
  }

  const step6 = steps.find(s => s.step === 6);
  if (step6?.data && Array.isArray(step6.data)) {
    const effort = step6.data.find((e: any) =>
      e["Use Case"] === useCaseName || e.useCase === useCaseName
    );
    if (effort) {
      // New 4-component system (1-10 scale)
      result.readinessScore = effort["Readiness Score"] || effort["Feasibility Score"] || effort.feasibilityScore;
      result.organizationalCapacity = effort["Organizational Capacity"];
      result.dataAvailabilityQuality = effort["Data Availability & Quality"];
      result.technicalInfrastructure = effort["Technical Infrastructure"];
      result.governance = effort["Governance"];

      // Legacy fields (backward compat)
      result.effortScore = effort["Effort Score (1-5)"] || effort["Effort Score"] || effort.effortScore;
      result.dataReadiness = effort["Data Readiness (1-5)"] || effort["Data Readiness"] || effort.dataReadiness;
      result.integrationComplexity = effort["Integration Complexity (1-5)"] || effort["Integration Complexity"] || effort.integrationComplexity;
      result.changeMgmt = effort["Change Mgmt (1-5)"] || effort["Change Mgmt"] || effort.changeMgmt;

      // Extract Time-to-Value with multiple field name variants
      const ttv = effort["Time To Value"] ??
                  effort["Time-to-Value (months)"] ??
                  effort["Time-to-Value"] ??
                  effort.timeToValue ??
                  6;
      result.timeToValue = typeof ttv === 'string' ? parseInt(ttv, 10) : (ttv || 6);
      result.monthlyTokens = effort["Monthly Tokens"] || effort.monthlyTokens || 0;
    }
  }

  const step5 = steps.find(s => s.step === 5);
  if (step5?.data && Array.isArray(step5.data)) {
    const benefit = step5.data.find((b: any) =>
      b["Use Case"] === useCaseName || b.useCase === useCaseName
    );
    if (benefit) {
      const totalVal = benefit["Total Annual Value ($)"] || benefit.totalAnnualValue || 0;
      if (typeof totalVal === 'string' ? parseFloat(totalVal.replace(/[$,]/g, '')) > 5000000 : totalVal > 5000000) {
        result.tags.push("High Impact");
      }
      if ((benefit["Revenue Benefit ($)"] || benefit.revenueBenefit || 0) !== "$0" &&
          (benefit["Revenue Benefit ($)"] || benefit.revenueBenefit || 0) !== 0) {
        result.tags.push("Growth");
      }
      if ((benefit["Risk Benefit ($)"] || benefit.riskBenefit || 0) !== "$0" &&
          (benefit["Risk Benefit ($)"] || benefit.riskBenefit || 0) !== 0) {
        result.tags.push("Risk");
      }
    }
  }

  if (result.tags.length === 0) {
    result.tags.push("AI", "Optimization");
  }

  return result;
}

// ============================================================================
// MAIN MAPPER: Transform report data into dashboard display format
// ============================================================================
export function mapReportToDashboardData(report: Report): DashboardData {
  const analysis = report.analysisData;
  const dashboard = analysis.executiveDashboard;

  const totalValue = dashboard.totalAnnualValue || 0;

  // Safe formatting for any value range including sub-$1K
  let totalValueFormatted: string;
  let valueSuffix: string;
  if (totalValue >= 1000000) {
    totalValueFormatted = (totalValue / 1000000).toFixed(1);
    valueSuffix = "M";
  } else if (totalValue >= 1000) {
    totalValueFormatted = (totalValue / 1000).toFixed(0);
    valueSuffix = "K";
  } else if (totalValue > 0) {
    totalValueFormatted = totalValue.toFixed(0);
    valueSuffix = "";
  } else {
    totalValueFormatted = "0";
    valueSuffix = "";
  }

  // Use step 5 count as fallback when topUseCases is incomplete
  const step5Count = (analysis.steps.find(s => s.step === 5)?.data as any[] | undefined)?.length || 0;
  const useCaseCount = Math.max(dashboard.topUseCases?.length || 0, step5Count);
  const heroDescription = `We identified ${useCaseCount > 0 ? useCaseCount : 'multiple'} high-impact AI use cases focused on operational optimization and risk mitigation to drive efficiency.`;

  // KPI cards (kept for backward compatibility)
  const kpis: KPI[] = [
    {
      id: 1,
      label: "Revenue Growth",
      value: formatValue(dashboard.totalRevenueBenefit || 0),
      growth: calculateGrowthPercent(dashboard.totalRevenueBenefit || 0, totalValue),
      iconName: "TrendingUp",
      desc: "Commercial growth opportunities"
    },
    {
      id: 2,
      label: "Cost Reduction",
      value: formatValue(dashboard.totalCostBenefit || 0),
      growth: totalValue > 0 ? `-${Math.round(((dashboard.totalCostBenefit || 0) / totalValue) * 100)}%` : "-0%",
      iconName: "Activity",
      desc: "Back-office automation"
    },
    {
      id: 3,
      label: "Cash Flow",
      value: formatValue(dashboard.totalCashFlowBenefit || 0),
      growth: calculateGrowthPercent(dashboard.totalCashFlowBenefit || 0, totalValue),
      iconName: "Banknote",
      desc: "Cycle time optimization"
    },
    {
      id: 4,
      label: "Risk Mitigation",
      value: formatValue(dashboard.totalRiskBenefit || 0),
      growth: totalValue > 0 ? `-${Math.round(((dashboard.totalRiskBenefit || 0) / totalValue) * 100)}%` : "-0%",
      iconName: "Shield",
      desc: "Compliance & fraud detection"
    }
  ];

  // NEW: Generate structured Value Driver insights
  const insights = generateValueInsights(dashboard);

  // NEW: Value-Readiness Matrix (1-10 scale, min-max normalization)
  // Fallback: if topUseCases is incomplete (fewer entries than step 5 data),
  // build the use case source from step 5/6 data directly.
  const step5DataFull = analysis.steps.find(s => s.step === 5)?.data as any[] | undefined;
  const step6DataFull = analysis.steps.find(s => s.step === 6)?.data as any[] | undefined;

  let useCaseSource = dashboard.topUseCases || [];

  if (step5DataFull && Array.isArray(step5DataFull) && useCaseSource.length < step5DataFull.length) {
    useCaseSource = step5DataFull.map((s5: any, idx: number) => ({
      rank: idx + 1,
      useCase: s5["Use Case"] || s5.useCase || '',
      priorityScore: 0, // will be overwritten from step 7
      monthlyTokens: step6DataFull?.find((s6: any) => s6.ID === s5.ID)?.["Monthly Tokens"] || 0,
      annualValue: typeof s5["Total Annual Value ($)"] === 'string'
        ? parseFormattedValue(s5["Total Annual Value ($)"])
        : (s5["Total Annual Value ($)"] || 0),
    }));
  }

  const matrixData: MatrixDataPoint[] = [];
  if (useCaseSource.length > 0) {
    // Read pre-computed Value Scores from Step 7 (EV/friction ratio, normalized 1-10)
    const step7Data = analysis.steps.find(s => s.step === 7)?.data;

    useCaseSource.forEach((uc, idx) => {
      const details = extractUseCaseDetails(analysis.steps, uc.useCase);

      // Get Value Score and Readiness Score from Step 7 (computed by postprocessor)
      let normalizedValue = 5.5;
      let readinessScore = details.readinessScore ?? 5;
      let priorityTier = "Foundation";

      let priorityScore = uc.priorityScore || 0;

      if (step7Data && Array.isArray(step7Data)) {
        const step7Record = step7Data.find((r: any) =>
          r["Use Case"] === uc.useCase || r.useCase === uc.useCase
        );
        if (step7Record) {
          normalizedValue = step7Record["Value Score"] ?? normalizedValue;
          readinessScore = step7Record["Readiness Score"] ?? step7Record["Feasibility Score"] ?? readinessScore;
          priorityTier = step7Record["Priority Tier"] ?? priorityTier;
          priorityScore = step7Record["Priority Score"] ?? step7Record["Composite Score"] ?? priorityScore;
        }
      }

      const type = getQuadrantType(normalizedValue, readinessScore);
      const ttvScore = calculateTTVBubbleScore(details.timeToValue || 6);

      if (priorityScore === 0 && normalizedValue > 0 && readinessScore > 0) {
        priorityScore = Math.round(((normalizedValue * 0.5) + (readinessScore * 0.3) + (ttvScore * 10 * 0.2)) * 10) / 10;
      }

      matrixData.push({
        name: uc.useCase,
        x: readinessScore,          // X-axis: Readiness Score (1-10)
        y: normalizedValue,         // Y-axis: Normalized Annual Value (1-10)
        z: ttvScore,                // Bubble size: TTV score (0-1, higher = faster)
        type,
        color: getTierColor(priorityTier),
        // Enriched fields for consulting-grade bubble chart
        timeToValue: details.timeToValue || 6,
        priorityTier,
        priorityScore,
        annualValue: uc.annualValue || 0,
        readinessScore,
        normalizedValue,
        organizationalCapacity: details.organizationalCapacity,
        dataAvailabilityQuality: details.dataAvailabilityQuality,
        technicalInfrastructure: details.technicalInfrastructure,
        governance: details.governance,
        monthlyTokens: details.monthlyTokens || uc.monthlyTokens || 0,
        description: details.description,
      });
    });
  }

  matrixData.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  // Use Case cards
  const useCaseItems: UseCase[] = [];
  if (useCaseSource.length > 0) {
    useCaseSource.slice(0, 12).forEach((uc, idx) => {
      const details = extractUseCaseDetails(analysis.steps, uc.useCase);
      const step5 = analysis.steps.find(s => s.step === 5);
      let impactText = "Improves operational efficiency";

      if (step5?.data && Array.isArray(step5.data)) {
        const benefit = step5.data.find((b: any) =>
          b["Use Case"] === uc.useCase || b.useCase === uc.useCase
        );
        if (benefit) {
          const revFormula = benefit["Revenue Formula"] || benefit.revenueFormula;
          const costFormula = benefit["Cost Formula"] || benefit.costFormula;
          if (revFormula && !revFormula.toLowerCase().includes('no direct')) {
            impactText = revFormula.split('=')[0]?.trim() || impactText;
          } else if (costFormula && !costFormula.toLowerCase().includes('no direct')) {
            impactText = costFormula.split('=')[0]?.trim() || impactText;
          }
        }
      }

      useCaseItems.push({
        id: `UC-${String(idx + 1).padStart(2, '0')}`,
        title: uc.useCase,
        value: formatValue(uc.annualValue || 0),
        impact: impactText,
        tokens: formatTokens(uc.monthlyTokens || details.monthlyTokens || 0),
        complexity: getComplexityLabel(details.effortScore || 3),
        tags: details.tags.slice(0, 3)
      });
    });
  }

  // Extract scenario comparison and friction by theme
  const scenarioComparison = extractScenarioComparison(analysis);
  const frictionByTheme = extractFrictionByTheme(analysis.steps);

  const createdDate = new Date(report.createdAt);
  const reportDate = createdDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const dashboardOutput: any = {
    clientName: report.companyName,
    reportDate,
    hero: {
      titlePrefix: "Unlocking",
      titleHighlight: "Value",
      totalValue: totalValueFormatted,
      valueSuffix,
      description: heroDescription
    },
    executiveSummary: {
      title: "Value Drivers",
      description: sanitizeForProse(analysis.summary) || `Our analysis projects ${formatValue(totalValue)} in annual value across four strategic pillars.`,
      kpis,
      insights,
    },
    priorityMatrix: {
      title: "Value-Readiness Matrix",
      description: "Initiatives mapped by Normalized Annual Value vs. Readiness Score.\nBubble size indicates Time-to-Value (larger = faster time-to-value).",
      data: matrixData
    },
    useCases: {
      title: "Use Case Discovery",
      description: `Explore the high-impact engines of the AI Strategy for ${report.companyName}.`,
      items: useCaseItems
    }
  };

  // Pass raw Step 4 data for detailed card layout
  const step4 = analysis.steps.find((s: any) => s.step === 4);
  if (step4?.data && Array.isArray(step4.data) && step4.data.length > 0) {
    dashboardOutput.useCaseDetails = step4.data;
  }

  // Add optional properties if they exist
  if (scenarioComparison) {
    dashboardOutput.scenarioComparison = scenarioComparison;
  }
  if (frictionByTheme) {
    dashboardOutput.frictionByTheme = frictionByTheme;
  }

  return dashboardOutput;
}

export type { Report as ReportForDashboard };
