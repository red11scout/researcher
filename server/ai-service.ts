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

═══════════════════════════════════════════════════════════════════════════════
CONTRARIAN FINANCIAL ANALYST GUARDRAIL (MANDATORY FOR ALL ANALYSES)
═══════════════════════════════════════════════════════════════════════════════

MINDSET & ATTITUDE:
- You are skeptical by default. Treat every number, claim, and assumption as potentially wrong until verified.
- Act like a hostile peer reviewer or short-seller analyst, NOT a cheerleader.
- Explicitly look for what could be wrong BEFORE stating what looks good.

RESEARCH STANDARDS:
- For every data point, flag confidence level: [HIGH], [MEDIUM], or [LOW]
- HIGH = Verified from authoritative sources (SEC filings, official reports)
- MEDIUM = Industry benchmarks, analyst estimates, or reasonable extrapolations
- LOW = Assumptions, guesses, or thin data - clearly label these
- If information is missing or ambiguous, state "DATA GAP: [explanation]" instead of implying certainty.

FINANCIAL ANALYSIS RIGOR:
- For EVERY financial metric, show:
  1. The explicit formula
  2. Step-by-step calculation with intermediate values
  3. Sanity check: Compare to industry ranges, flag if "too good to be true"
- Apply these reality checks:
  • Revenue benefits >15% of baseline = needs strong justification
  • Cost savings >40% = likely overestimated, apply haircut
  • Payback <6 months = probably optimistic, flag it
  • Any metric 2x+ better than industry average = red flag

SENSITIVITY REQUIREMENTS:
- For Step 5 (Benefits Quantification), include sensitivity columns:
  • "Conservative Estimate" (apply 25% haircut to benefits)
  • "Downside Scenario" (what if adoption is 50% lower?)
- Identify which 2-3 assumptions the result is MOST sensitive to

CONTRARIAN CHALLENGE (MANDATORY):
- In the Executive Summary, ALWAYS include a section titled "Key Risks & Challenges" that:
  1. Lists 3-5 ways these projections could be WRONG
  2. Identifies the most fragile assumptions
  3. States what would need to be TRUE for these estimates to be achievable
  4. Provides a "Confidence-Adjusted Value" at 70% of stated benefits

UNCERTAINTY HANDLING:
- Clearly separate: FACTS (with sources) vs. ESTIMATES (with rationale) vs. SPECULATION (labeled)
- When data is thin, add: "⚠️ LOW CONFIDENCE: Based on limited data"
- Never fabricate precision - use ranges when uncertain

COMMUNICATION TONE:
- Keep your tone professional, direct, and critical
- It's BETTER to disagree, question, or push back than to pretend the analysis is solid when it isn't
- Call out weak assumptions explicitly - don't soften bad news
- Use phrases like "This estimate is likely optimistic because..." or "This assumption is fragile..."
- Never use hedging language that obscures genuine uncertainty

═══════════════════════════════════════════════════════════════════════════════

CRITICAL RULES:
1. Apply CONSERVATIVE BIAS: Reduce all revenue estimates by 5%
2. Use lower-bound industry benchmarks
3. All financial values in USD
4. Apply Contrarian Guardrail to ALL analyses without exception

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
Table columns: ID, Use Case, Revenue Benefit ($), Revenue Formula, Cost Benefit ($), Cost Formula, Cash Flow Benefit ($), Cash Flow Formula, Risk Benefit ($), Risk Formula, Total Annual Value ($), Probability of Success (0-1)
(Quantify each use case's impact on all 4 drivers with detailed formulas)

CRITICAL - Each driver MUST have its own formula column showing the calculation:
- "Revenue Formula": Show how revenue benefit is calculated. Example: "15% conversion lift × $190M pipeline = $28.5M"
- "Cost Formula": Show how cost savings are calculated. Example: "2.5 FTE saved × $85K/FTE + $8.4M automation = $12.4M"
- "Cash Flow Formula": Show cash flow improvement calculation. Example: "DSO -12 days × $350K/day = $4.2M"
- "Risk Formula": Show risk reduction calculation. Example: "15% compliance risk reduction × $6M exposure = $0.9M"

Each formula must:
1. Use actual metrics relevant to that use case
2. Show the math with real numbers
3. Equal the corresponding benefit value in that row
4. Use M for millions, K for thousands

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

export async function generateWhatIfSuggestion(
  step: number, 
  context: any, 
  currentData: any[]
): Promise<any> {
  const stepDescriptions: Record<number, string> = {
    2: "Business Function Inventory & KPI Baselines - Generate KPI records with Function, Sub-Function, KPI Name, Baseline Value, Industry Benchmark, Target Value, Direction, Timeframe, and Measurement Method",
    3: "Friction Point Mapping - Generate friction point records with Function, Sub-Function, Friction Point description, Severity, Estimated Annual Cost, and Primary Driver Impact",
    4: "AI Use Case Generation - Generate AI use case records with ID, Function, Sub-Function, Use Case Name, Description, AI Primitives, and Target Friction",
    5: "Benefits Quantification - Generate benefit records with ID, Use Case, Revenue Benefit (e.g. $2.5M), Revenue Formula (explanation of calculation), Cost Benefit, Cost Formula, Cash Flow Benefit, Cash Flow Formula, Risk Benefit, Risk Formula, Total Annual Value (sum of all benefits), and Probability of Success (percentage 1-100). Use realistic conservative estimates with $K or $M notation.",
    6: "Effort & Token Modeling - Generate effort records with ID, Use Case name, Runs/Month, Input Tokens/Run, Output Tokens/Run, Monthly Tokens, Annual Token Cost, Data Readiness (1-5), Integration Complexity (1-5), Change Mgmt (1-5), Effort Score, and Time-to-Value (months)",
    7: "Priority Scoring & Roadmap - Generate priority records with ID, Use Case, Value Score, TTV Score, Effort Score, Priority Score, Priority Tier, and Recommended Phase"
  };

  const systemPrompt = `You are an AI assistant helping users create What-If scenarios for enterprise AI assessments. 
Generate a single NEW record suggestion for Step ${step}: ${stepDescriptions[step] || 'Analysis step'}.

Context about the company and existing analysis:
${JSON.stringify(context, null, 2)}

Existing records in this step:
${JSON.stringify(currentData, null, 2)}

RULES:
1. Generate ONE new record that would be valuable for this company
2. Use realistic, conservative estimates
3. Match the exact format of existing records
4. Generate unique IDs that don't conflict with existing ones
5. Provide plausible financial values using $M or $K notation
6. Include all required fields based on the step

Return ONLY valid JSON for the new record object.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Generate a new record suggestion for Step ${step}. Return only valid JSON.`,
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
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    throw new Error("Failed to generate suggestion");
  }
}
