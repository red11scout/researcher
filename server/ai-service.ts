import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

interface AnalysisStep {
  step: number;
  title: string;
  content: string;
  data?: any[];
}

export async function generateCompanyAnalysis(companyName: string): Promise<{
  steps: AnalysisStep[];
  summary: string;
}> {
  const systemPrompt = `You are a strategic business analyst specializing in company research and AI opportunity identification. You MUST apply conservative bias - reduce revenue estimates by 5% and use lower-bound industry figures. Generate comprehensive analysis following this exact 8-step framework:

STEP 0: Company Overview
- Business model description
- Core products/services
- Market position
- Recent developments

STEP 1: Company Research & Profile
- Detailed company information
- Industry classification
- Geographic presence
- Key leadership

STEP 2: KPI Baselines
Generate a table with these exact columns: KPI Name, Baseline Value, Target Value, Industry Benchmark, Direction (↑/↓), Desired Improvement
Include 8-12 relevant KPIs (revenue, customer metrics, efficiency metrics, etc.)
Apply 5% conservative reduction to revenue figures.

STEP 3: Major Workflows
Identify 6-8 critical business workflows in table format:
Workflow Name, Department, Frequency, Team Size, Hours per Run

STEP 4: Friction Points
For each workflow, identify friction points in table format:
Workflow, Friction Point, Impact Level (High/Medium/Low), Annual Cost Estimate

STEP 5: AI Use Cases
Generate exactly 10 AI use cases in table format:
Use Case Name, Description, Workflow, Expected Benefit, Implementation Complexity (High/Medium/Low)

STEP 6: Token Modeling
For each use case, create token cost model in table format:
Use Case, Input Tokens/Run, Output Tokens/Run, Runs/Year, Annual Input Tokens, Annual Output Tokens

STEP 7: ROI Prioritization
Calculate ROI for each use case in table format:
Use Case, Annual Benefit ($), Annual Cost ($), ROI Ratio, Priority (Critical/High/Medium/Low)
Priority: Critical (ROI > 10x), High (5-10x), Medium (2-5x), Low (<2x)

Return your analysis as a structured JSON object with this format:
{
  "steps": [
    {
      "step": 0,
      "title": "Company Overview",
      "content": "prose description here",
      "data": null
    },
    {
      "step": 2,
      "title": "KPI Baselines",
      "content": "brief introduction",
      "data": [
        {"KPI Name": "Annual Revenue", "Baseline Value": "$XX.XB", "Target Value": "$XX.XB", "Industry Benchmark": "$XX.XB", "Direction": "↑", "Desired Improvement": "XX%"}
      ]
    }
  ],
  "summary": "2-3 sentence executive summary"
}`;

  const userPrompt = `Analyze "${companyName}" and generate a comprehensive strategic analysis following the 8-step framework. Remember to apply conservative bias (reduce revenue by 5%). Return only valid JSON.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
    
    // Extract JSON from response (handle markdown code blocks)
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
