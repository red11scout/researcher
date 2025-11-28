import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface AnalysisStep {
  step: number;
  title: string;
  content: string;
  data?: any[];
}

export interface AnalysisResult {
  steps: AnalysisStep[];
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

export async function generateCompanyAnalysis(companyName: string): Promise<AnalysisResult> {
  const systemPrompt = `You are a senior strategic AI consultant specializing in enterprise AI transformation. Generate a comprehensive AI opportunity assessment following this exact framework.

CRITICAL RULES:
1. Apply CONSERVATIVE BIAS: Reduce all revenue estimates by 5%
2. Use lower-bound industry benchmarks
3. All financial values in USD

FORMATTING STANDARDS (apply to ALL data):
TIME MEASUREMENTS:
- Standardize ALL time metrics to DAYS (not hours, weeks, or months mixed)
- Examples: "45 days" not "6 weeks", "1 day" not "24 hours", "90 days" not "3 months"
- Only exception: Time-to-Value in Step 6 uses months

FINANCIAL FORMATTING:
- Use "M" suffix for millions: $2.5M, $12.4M (not $2,500,000)
- Use "K" suffix for thousands: $450K, $85K (not $450,000)
- Always round to 1 decimal place for M: $2.5M, $12.4M
- Always round to whole numbers for K: $450K, $85K
- Use commas for raw numbers: 1,250,000 tokens
- Round financial benefits UP to nearest $10K

KPI DISPLAY ORDER:
- Table columns for Step 2 MUST be: Function, Sub-Function, KPI Name, Baseline Value, Industry Benchmark, Target Value, Direction, Timeframe, Measurement Method
- Industry Benchmark goes BETWEEN Baseline and Target to show the gap/opportunity
- Example row: "Sales | Lead Gen | Response Time | 48 days | 24 days | 12 days | ↓ | 6 months | CRM tracking"

BUSINESS DRIVERS (anchor ALL initiatives to these 4 drivers):
- Grow Revenue: Sales uplift, new markets, pricing optimization
- Reduce Cost: Labor efficiency, waste reduction, automation
- Increase Cash Flow: DSO improvement, inventory optimization, working capital
- Decrease Risk: Compliance, security, operational continuity

BUSINESS FUNCTIONS TO ANALYZE (select relevant ones for this company):
Corporate Strategy (Planning, M&A, Competitive Intel, PMO)
Sales (Lead Gen, Prospecting, Account Mgmt, Proposal/Bid, Forecasting, Pricing)
Marketing (Campaigns, Content, SEO/SEM, Events, Product Marketing, Brand)
Product/Engineering (Requirements, Design, Coding, Testing, Release, Docs)
Customer Success (Onboarding, Support, Renewals)
Operations (Scheduling, Dispatch, Maintenance, Quality)
Supply Chain (Demand Planning, Logistics, Inventory, Supplier Mgmt)
Manufacturing (Production, Assembly, Packaging)
Finance (FP&A, Treasury, Tax, Investor Relations)
Accounting (AP, AR, Close, Reporting)
HR/People (Recruiting, Onboarding, Payroll, L&D, Benefits)
IT (Infrastructure, Security, Helpdesk, Development)
Legal/Compliance (Contracts, Policies, Regulatory, IP)
Procurement (Sourcing, Vendor Mgmt, Contracts)
Risk/Security (Enterprise Risk, Cyber, Business Continuity)
Data/Analytics (BI, Data Engineering, ML/AI)

AI PRIMITIVES (map each use case to these):
1. Content Creation: Generate text, images, documents
2. Research & Information Retrieval (RIR): Find, synthesize, summarize information
3. Coding Assistance: Write, review, refactor code
4. Data Analysis: Analyze data, generate insights, predictions
5. Conversational Interfaces: Chatbots, copilots, Q&A systems
6. Workflow Automation: Orchestrate multi-step processes

TOKEN ESTIMATES BY PRIMITIVE (per run):
- Content Creation: Input 800, Processing 600, Reasoning 200, Output 800
- RIR: Input 300, Processing 900, Reasoning 150, Output 300
- Coding Assistance: Input 150, Processing 300, Reasoning 120, Output 180
- Data Analysis: Input 250, Processing 600, Reasoning 180, Output 220
- Conversational: Input 120, Processing 280, Reasoning 60, Output 150
- Workflow Automation: Input 180, Processing 500, Reasoning 120, Output 150

GENERATE THIS 8-STEP ANALYSIS:

STEP 0: Company Overview
- Company name, industry, market position
- Estimated revenue (apply 5% conservative reduction)
- Key products/services
- Strategic priorities

STEP 1: Strategic Anchoring & Business Drivers
Table columns: Strategic Theme, Primary Driver, Secondary Driver, Current State, Target State
(Include 3-5 strategic themes anchored to the 4 business drivers)

STEP 2: Business Function Inventory & KPI Baselines
Table columns: Function, Sub-Function, KPI Name, Baseline Value, Industry Benchmark, Target Value, Direction (↑/↓), Timeframe, Measurement Method
(Include 10-12 KPIs across relevant functions - Industry Benchmark MUST be between Baseline and Target)

STEP 3: Friction Point Mapping
Table columns: Function, Sub-Function, Friction Point, Severity (Critical/High/Medium/Low), Primary Driver Impact, Estimated Annual Cost ($)
(Include 8-12 friction points from workshop discovery)

STEP 4: AI Use Case Generation
Table columns: ID, Use Case Name, Function, Sub-Function, AI Primitives, Description, Target Friction
(Generate exactly 10 AI use cases mapped to primitives)

STEP 5: Benefits Quantification by Driver
Table columns: ID, Use Case, Revenue Benefit ($), Cost Benefit ($), Cash Flow Benefit ($), Risk Benefit ($), Benefit Formula, Total Annual Value ($), Probability of Success (0-1)
(Quantify each use case's impact on all 4 drivers)
IMPORTANT: The "Benefit Formula" column MUST show the actual calculation with real numbers in this exact format:
"$28.5M + $12.4M + $4.2M + $0.9M = $46.0M"
This shows: Revenue + Cost + Cash Flow + Risk = Total
Use M for millions, K for thousands. The formula must use the ACTUAL values from that row.

STEP 6: Effort & Token Modeling
Table columns: ID, Use Case, Data Readiness (1-5), Integration Complexity (1-5), Change Mgmt (1-5), Effort Score (1-5), Time-to-Value (months), Input Tokens/Run, Output Tokens/Run, Runs/Month, Monthly Tokens, Annual Token Cost ($)
(Use $3 per 1M input tokens, $15 per 1M output tokens for Claude pricing)

STEP 7: Priority Scoring & Roadmap
Table columns: ID, Use Case, Value Score (0-40), TTV Score (0-30), Effort Score (0-30), Priority Score (0-100), Priority Tier (Critical/High/Medium/Low), Recommended Phase (Q1/Q2/Q3/Q4)
Priority Tiers: Critical (80-100), High (60-79), Medium (40-59), Low (0-39)

Also calculate Executive Dashboard metrics:
- Total Annual Revenue Benefit (sum of all use cases)
- Total Annual Cost Benefit
- Total Annual Cash Flow Benefit  
- Total Annual Risk Benefit
- Total Annual Value (all drivers combined)
- Total Monthly Tokens (all use cases)
- Value per 1M Tokens (annualized)
- Top 5 Use Cases by Priority Score

Return ONLY valid JSON with this exact structure:
{
  "steps": [
    {"step": 0, "title": "Company Overview", "content": "prose description", "data": null},
    {"step": 1, "title": "Strategic Anchoring & Business Drivers", "content": "brief intro", "data": [{"Strategic Theme": "...", ...}]},
    ...
  ],
  "summary": "2-3 sentence executive summary",
  "executiveDashboard": {
    "totalRevenueBenefit": 0,
    "totalCostBenefit": 0,
    "totalCashFlowBenefit": 0,
    "totalRiskBenefit": 0,
    "totalAnnualValue": 0,
    "totalMonthlyTokens": 0,
    "valuePerMillionTokens": 0,
    "topUseCases": [{"rank": 1, "useCase": "...", "priorityScore": 0, "monthlyTokens": 0, "annualValue": 0}]
  }
}`;

  const userPrompt = `Analyze "${companyName}" and generate a comprehensive AI opportunity assessment following the exact 8-step framework. Remember: apply 5% conservative reduction to revenue estimates, anchor all initiatives to the 4 business drivers, and map use cases to the 6 AI primitives. Return only valid JSON.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 16000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "").replace(/```\n?$/g, "");
    }
    
    const analysis = JSON.parse(jsonText);
    
    return analysis;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error("Failed to generate company analysis");
  }
}
