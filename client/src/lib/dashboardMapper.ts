import type { DashboardData, KPI, MatrixDataPoint, UseCase } from "@/components/Dashboard";
import { format } from "@/lib/formatters";

const BRAND = {
  primary: '#0339AF',
  accent: '#4C73E9',
  success: '#059669',
};

interface ReportAnalysisData {
  steps: Array<{
    step: number;
    title: string;
    content: string;
    data: any;
  }>;
  summary: string;
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

function getPriorityType(score: number, timeToValue: number): string {
  if (score >= 80 && timeToValue <= 6) return "Quick Win";
  if (score >= 80) return "High Value";
  if (timeToValue <= 6) return "Low Hanging Fruit";
  if (score >= 60) return "Strategic";
  return "Balanced";
}

function getColorForType(type: string): string {
  switch (type) {
    case "Quick Win":
    case "Low Hanging Fruit":
      return BRAND.success;
    case "High Value":
    case "Strategic":
      return BRAND.primary;
    default:
      return BRAND.accent;
  }
}

function extractUseCaseDetails(steps: ReportAnalysisData['steps'], useCaseName: string): {
  function?: string;
  description?: string;
  tags: string[];
  effortScore?: number;
  timeToValue?: number;
  monthlyTokens?: number;
} {
  const result: { function?: string; description?: string; tags: string[]; effortScore?: number; timeToValue?: number; monthlyTokens?: number } = {
    tags: []
  };

  const step4 = steps.find(s => s.step === 4);
  if (step4?.data && Array.isArray(step4.data)) {
    const useCase = step4.data.find((uc: any) => 
      uc["Use Case Name"] === useCaseName || uc.useCase === useCaseName || uc.name === useCaseName
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
      result.effortScore = effort["Effort Score"] || effort.effortScore || 3;
      result.timeToValue = effort["Time-to-Value (months)"] || effort.timeToValue || effort["Time-to-Value"] || 6;
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
      if (totalVal > 5000000) {
        result.tags.push("High Impact");
      }
      if ((benefit["Revenue Benefit ($)"] || benefit.revenueBenefit || 0) > 0) {
        result.tags.push("Growth");
      }
      if ((benefit["Risk Benefit ($)"] || benefit.riskBenefit || 0) > 0) {
        result.tags.push("Risk");
      }
    }
  }

  if (result.tags.length === 0) {
    result.tags.push("AI", "Optimization");
  }

  return result;
}

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

  const step0 = analysis.steps.find(s => s.step === 0);
  const companyOverview = step0?.content || `AI-driven optimization opportunities for ${report.companyName}`;
  
  const useCaseCount = dashboard.topUseCases?.length || 0;
  const heroDescription = `We identified ${useCaseCount > 0 ? useCaseCount : 'multiple'} high-impact AI use cases focused on operational optimization and risk mitigation to drive efficiency.`;

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

  const matrixData: MatrixDataPoint[] = [];
  if (dashboard.topUseCases && dashboard.topUseCases.length > 0) {
    dashboard.topUseCases.forEach((uc, idx) => {
      const details = extractUseCaseDetails(analysis.steps, uc.useCase);
      const timeToValue = details.timeToValue || (6 + idx * 2);
      const effortScore = details.effortScore || (3 + (idx % 3));
      const annualValueM = (uc.annualValue || 0) / 1000000;
      const type = getPriorityType(uc.priorityScore || 50, timeToValue);
      
      matrixData.push({
        name: uc.useCase,
        x: timeToValue,
        y: annualValueM,
        z: effortScore,
        type,
        color: getColorForType(type)
      });
    });
  }

  const useCaseItems: UseCase[] = [];
  if (dashboard.topUseCases && dashboard.topUseCases.length > 0) {
    dashboard.topUseCases.slice(0, 6).forEach((uc, idx) => {
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
          if (revFormula) {
            impactText = revFormula.split('=')[0]?.trim() || impactText;
          } else if (costFormula) {
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

  const createdDate = new Date(report.createdAt);
  const reportDate = createdDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return {
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
      description: analysis.summary || `Our analysis projects ${formatValue(totalValue)} in annual value across four strategic pillars.`,
      kpis
    },
    priorityMatrix: {
      title: "Strategic Priority Matrix",
      description: "We mapped the top initiatives by Value (Y) vs. Time-to-Value (X).\nSize represents Implementation Complexity (Smaller = Easier).",
      data: matrixData
    },
    useCases: {
      title: "Use Case Discovery",
      description: `Explore the high-impact engines of the AI Strategy for ${report.companyName}.`,
      items: useCaseItems
    }
  };
}

export type { Report as ReportForDashboard };
