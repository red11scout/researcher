import pRetry, { AbortError } from "p-retry";

// Use native fetch - test-direct-fetch works with native fetch
// The undici fetch was causing issues (hanging on requests)

// Helper to get current configuration (evaluated at call time, not module load)
function getConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const isLocalhostUrl = configuredBaseURL?.includes('localhost');
  const userApiKey = process.env.ANTHROPIC_API_KEY;
  const integrationApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  
  // Determine which API key and URL to use:
  // IMPORTANT: Replit AI Integration uses localhost proxy - only works in development
  // In PRODUCTION: Must use user's own ANTHROPIC_API_KEY with direct Anthropic API
  // In DEVELOPMENT: Can use either user's key or the integration proxy
  let apiKey: string | undefined;
  let baseURL: string;
  let usingIntegration = false;
  
  if (isProduction) {
    // Production: MUST use user's own API key (integration localhost proxy doesn't work)
    if (userApiKey) {
      apiKey = userApiKey;
      baseURL = "https://api.anthropic.com";
    } else {
      // No user key in production - will fail
      apiKey = undefined;
      baseURL = "https://api.anthropic.com";
    }
  } else if (userApiKey) {
    // Development with user key: Use direct API for speed
    apiKey = userApiKey;
    baseURL = "https://api.anthropic.com";
  } else if (integrationApiKey && configuredBaseURL) {
    // Development without user key: Use integration proxy
    apiKey = integrationApiKey;
    baseURL = configuredBaseURL;
    usingIntegration = true;
  } else {
    // No valid configuration
    apiKey = undefined;
    baseURL = "https://api.anthropic.com";
  }
  
  return {
    isProduction,
    userApiKey,
    integrationApiKey,
    usingIntegration,
    apiKey,
    baseURL,
  };
}

// Direct API call using undici fetch (bypasses proxy issues)
async function callAnthropicAPI(systemPrompt: string, userPrompt: string, maxTokens: number = 16000): Promise<string> {
  const config = getConfig();
  
  console.log("[callAnthropicAPI] Starting API call with config:", {
    baseURL: config.baseURL,
    hasApiKey: !!config.apiKey,
    maxTokens,
    systemPromptLength: systemPrompt.length,
    userPromptLength: userPrompt.length,
  });
  
  if (!config.apiKey) {
    console.error("[callAnthropicAPI] No API key configured");
    throw new Error("Anthropic API key is not configured");
  }
  
  try {
    console.log("[callAnthropicAPI] Making fetch request to:", `${config.baseURL}/v1/messages`);
    
    // Use AbortController with 5 minute timeout for large analysis requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("[callAnthropicAPI] Request timed out after 5 minutes");
      controller.abort();
    }, 5 * 60 * 1000);
    
    const response = await fetch(`${config.baseURL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: maxTokens,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    console.log("[callAnthropicAPI] Response received:", {
      ok: response.ok,
      status: response.status,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[callAnthropicAPI] API error response:", errorText);
      const error: any = new Error(`Anthropic API error: ${response.status}`);
      error.status = response.status;
      error.body = errorText;
      throw error;
    }
    
    const data = await response.json() as any;
    console.log("[callAnthropicAPI] Response parsed successfully, content length:", data.content?.[0]?.text?.length || 0);
    
    if (!data.content || !data.content[0] || data.content[0].type !== "text") {
      console.error("[callAnthropicAPI] Invalid response format:", JSON.stringify(data).substring(0, 500));
      throw new Error("Invalid response format from Anthropic API");
    }
    
    return data.content[0].text;
  } catch (error: any) {
    console.error("[callAnthropicAPI] Exception caught:", {
      message: error?.message,
      code: error?.code,
      cause: error?.cause?.message,
    });
    throw error;
  }
}

// Log configuration status at startup (without revealing secrets)
const startupConfig = getConfig();
console.log("AI Service Configuration:", {
  usingUserApiKey: !!startupConfig.userApiKey && !startupConfig.usingIntegration,
  usingReplitIntegration: startupConfig.usingIntegration,
  baseURL: startupConfig.baseURL,
  isProduction: startupConfig.isProduction,
  configValid: !!startupConfig.apiKey,
});

// Export a function to check if production is properly configured
export function checkProductionConfig(): { ok: boolean; message: string } {
  const config = getConfig();
  
  // In production, we MUST have the user's API key
  if (config.isProduction && !config.userApiKey) {
    return {
      ok: false,
      message: "Production requires ANTHROPIC_API_KEY secret. The Replit AI Integration only works in development."
    };
  }
  
  // Check if we have ANY API key available
  if (!config.apiKey) {
    return {
      ok: false,
      message: "No Anthropic API key configured. Please add ANTHROPIC_API_KEY in Secrets."
    };
  }
  return { ok: true, message: `AI service configured (using ${config.isProduction ? 'direct API' : config.usingIntegration ? 'integration' : 'direct API'})` };
}

// Helper function to check if error is rate limit or transient
function isRetryableError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  const status = error?.status;
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit") ||
    errorMsg.toLowerCase().includes("timeout") ||
    errorMsg.toLowerCase().includes("overloaded")
  );
}

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

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanatory text. Start with { and end with }.

JSON structure:
{
  "steps": [
    {"step": 0, "title": "Company Overview", "content": "prose description", "data": null},
    {"step": 1, "title": "Strategic Anchoring & Business Drivers", "content": "brief intro", "data": [{"Strategic Theme": "...", ...}]},
    {"step": 2, "title": "Business Function Inventory & KPI Baselines", "content": "...", "data": [...]},
    {"step": 3, "title": "Friction Point Mapping", "content": "...", "data": [...]},
    {"step": 4, "title": "AI Use Case Generation", "content": "...", "data": [...]},
    {"step": 5, "title": "Benefits Quantification by Driver", "content": "...", "data": [...]},
    {"step": 6, "title": "Effort & Token Modeling", "content": "...", "data": [...]},
    {"step": 7, "title": "Priority Scoring & Roadmap", "content": "...", "data": [...]}
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

  const userPrompt = `Analyze "${companyName}" and generate a comprehensive AI opportunity assessment following the exact 8-step framework. Remember: apply 5% conservative reduction to revenue estimates, anchor all initiatives to the 4 business drivers, and map use cases to the 6 AI primitives.

CRITICAL REQUIREMENT: Your ENTIRE response must be valid JSON - no markdown, no text before or after, no code blocks. Start your response with { and end with }. Do not include any explanatory text.`;

  // Get current configuration and verify API key
  const config = getConfig();
  
  // Simply check if we have ANY API key available
  if (!config.apiKey) {
    throw new Error("Anthropic API key is not configured. Please add the ANTHROPIC_API_KEY secret.");
  }

  console.log(`Starting analysis for: ${companyName}`);

  try {
    // Use pRetry for automatic retries on transient failures
    // Rate limits (429) need MUCH longer waits - up to 60-90 seconds
    const responseText = await pRetry(
      async () => {
        try {
          return await callAnthropicAPI(systemPrompt, userPrompt, 16000);
        } catch (error: any) {
          console.error(`API call attempt failed:`, error?.message || error);
          
          // For rate limit errors (429), wait longer before retrying
          if (error?.status === 429 || error?.message?.includes("429") || error?.message?.toLowerCase().includes("rate limit")) {
            console.log("Rate limit hit - waiting 60 seconds before retry...");
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
            throw error; // Then retry
          }
          
          // Check if it's a retryable error
          if (isRetryableError(error)) {
            console.log("Retrying due to transient error...");
            throw error; // Rethrow to trigger retry
          }
          
          // For non-retryable errors, abort retries
          throw new AbortError(error);
        }
      },
      {
        retries: 3,
        minTimeout: 5000,
        maxTimeout: 120000,
        factor: 3,
        onFailedAttempt: (error) => {
          console.log(`Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Waiting before retry...`);
        },
      }
    );

    console.log(`Received response for: ${companyName}`);
    
    if (!responseText) {
      throw new Error("Empty response received from AI service");
    }
    
    let jsonText = responseText.trim();
    
    // Handle various response formats
    // Remove markdown code blocks
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/g, "").replace(/\s*```$/g, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/g, "").replace(/\s*```$/g, "");
    }
    
    // Try to find JSON object if there's text before/after it
    const jsonStartIndex = jsonText.indexOf('{');
    const jsonEndIndex = jsonText.lastIndexOf('}');
    
    if (jsonStartIndex === -1 || jsonEndIndex === -1) {
      console.error("No JSON object found in response");
      console.error("Raw response (first 1000 chars):", responseText.substring(0, 1000));
      throw new Error("AI response does not contain valid JSON. The model returned text instead of the requested JSON format.");
    }
    
    // Extract just the JSON portion
    jsonText = jsonText.substring(jsonStartIndex, jsonEndIndex + 1);
    
    try {
      const analysis = JSON.parse(jsonText);
      console.log(`Successfully parsed analysis for: ${companyName}`);
      return analysis;
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw response (first 1000 chars):", jsonText.substring(0, 1000));
      throw new Error("Failed to parse AI response as JSON. The model may have returned malformed JSON.");
    }
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    
    // Extract the original error if wrapped by pRetry
    const originalError = error.originalError || error;
    
    // Provide more specific error messages
    if (originalError.status === 401) {
      throw new Error("Authentication failed. Please check your Anthropic API key configuration.");
    } else if (originalError.status === 429 || originalError.message?.includes("429") || originalError.message?.toLowerCase().includes("rate limit")) {
      throw new Error("The AI service is busy. Please wait 1-2 minutes and try again. This is normal during high usage periods.");
    } else if (originalError.status === 500 || originalError.status === 503) {
      throw new Error("AI service is temporarily unavailable. Please try again in a few minutes.");
    } else if (originalError.code === 'ECONNREFUSED' || originalError.code === 'ENOTFOUND') {
      throw new Error("Cannot connect to AI service. Please check your network connection.");
    } else if (originalError.message) {
      throw new Error(originalError.message);
    }
    
    throw new Error("Failed to generate company analysis. Please try again.");
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

  const userPrompt = `Generate a new record suggestion for Step ${step}. Return only valid JSON.`;

  try {
    const responseText = await callAnthropicAPI(systemPrompt, userPrompt, 2000);
    
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
