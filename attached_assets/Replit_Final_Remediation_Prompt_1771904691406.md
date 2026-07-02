# SYSTEM DIRECTIVE: Comprehensive Architectural Remediation for BlueAlly AI Assessment Engine

**Application:** `smart-report-ai-claude-style.replit.app` / `discover.movefasterwithai.com`
**Date:** February 24, 2026
**Priority:** CRITICAL — Production application is 100% broken. Zero reports complete successfully.

---

## PERSONA AND OPERATING PARAMETERS

You are assuming the synthesized persona of an elite Cloud Architect and Tier-1 Strategy Consultant. Your operational parameters are defined by the rigorous code standards of top-tier AI researchers at Anthropic, DeepMind, and Meta (focusing on structured generation, context management, and inference reliability) and the financial validation frameworks of premier management consultancies — McKinsey & Company, Boston Consulting Group, and Bain & Company (focusing on Value-at-Stake methodologies, conservative NPV calculations, and hallucination constraint).

Your objective is to fundamentally refactor this application to eliminate three classes of critical systemic failure: HTTP gateway timeouts and process kills, `JSON.parse` exceptions from truncated or malformed LLM responses, and severe mathematical hallucinations in the financial modeling layer.

Execute the following comprehensive, multi-phase remediation plan sequentially. Do not skip any validation phase. Implement changes across the backend logic, API routing layer, financial calculation utilities, and Claude prompt architecture.

---

## LIVE FORENSIC EVIDENCE — THE EXACT FAILURE SEQUENCE

On February 24, 2026, the failure was reproduced with full network telemetry capture for "Truist Financial". This is not theoretical — this is exactly what happens:

```
NETWORK TRACE (captured live):
────────────────────────────────────────────────────────
T+0s    POST /api/analyze                              → 200 OK (pipeline starts)
T+0s    GET  /api/progress/session_1771898784948_xxx    → 503 SERVICE UNAVAILABLE ← SSE DEAD
T+1s    GET  /api/analyze/status/session_xxx            → 200 (polling fallback begins)
T+5s    Step 0: Company Overview                        → ✅ Complete
T+30s   Step 1: Strategic Anchoring                     → ✅ Complete
T+60s   Step 2: Business Functions & KPIs               → ✅ Complete
T+75s   Step 3: Friction Points                         → ✅ Complete
T+105s  Step 4: AI Use Cases                            → ✅ Complete (~45s — heavy step)
T+135s  Step 5: Benefits Quantification                 → ✅ Complete
T+150s  Step 6: Readiness & Token Modeling              → Spinner visible...
T+165s  Step 7: Priority Roadmap                        → Spinner visible...
T+~180s ❌ CRASH: "Analysis Failed: The AI generated an incomplete response
         that couldn't be recovered. This usually happens with complex companies.
         Please try again — the retry often succeeds."

Total polling requests: 130 GET /api/analyze/status/ — all returned 200 until server-side crash
Console errors: 172 EXCEPTION entries — "A listener indicated an asynchronous response by
  returning true, but the message channel closed before a response was received"
```

### What This Tells Us

1. **Steps 0–5 complete successfully.** The Claude API calls for qualitative analysis and benefits computation work. The early steps are NOT the problem.
2. **The crash occurs at Steps 6–7 or during final synthesis** — after approximately 3 minutes of continuous server-side execution.
3. **The `/api/progress/` SSE endpoint returned 503 immediately.** The EventSource connection was never established. The app silently fell back to polling.
4. **The crash is server-side.** The client polls faithfully; the server process dies or throws an unrecoverable error after accumulating ~3 minutes of execution state.
5. **This is reproducible 100% of the time.** Tested with "Truist Financial" and "Global Payments" — both fail identically at the same stage.

### Saved Reports Show Inflated Benefits (Separate Bug)

Previously completed reports exhibit severe financial hallucinations:

| Company | Revenue | Total AI Value | % of Revenue | Verdict |
|---------|---------|---------------|--------------|---------|
| Ardent Health | ~$5.5B | **$839.5M** | 15.3% | Absurd |
| Maryland Dept of Health | ~$15B budget | **$154.2M** | ~1% | High |
| NCR Voyix | ~$7.1B | **$114.1M** | 1.6% | High |

Individual use case values from Ardent Health:
- UC-02 "Autonomous Medical Coding Validator": **$226.8M** — no single AI use case generates this
- UC-09 "Automated Patient Engagement Platform": **$93.6M** revenue + **$70.2M** risk
- UC-10 "Clinical Documentation Quality Auditor": **$106.8M** revenue + **$80.1M** risk
- Risk Benefit total: **$654.6M** — larger than most hospital systems' entire operating margin

---

## PHASE 1: NETWORK RESILIENCE AND PROCESS LIFECYCLE MANAGEMENT

The application is crashing because the entire 8-step pipeline executes as a single continuous server-side process. After ~3 minutes, Replit's container orchestrator terminates the process due to execution timeout or memory pressure. The `/api/progress/` SSE endpoint is dead (503), confirming infrastructure-level connection management failures.

### 1.1 — Decouple the Generation Pipeline into Per-Step Execution Contexts

**Current architecture (broken):**
```
POST /api/analyze → spawns ONE background process that runs Steps 0–7 sequentially
GET /api/analyze/status/{sessionId} → polls for progress
Result: Process killed after ~3 minutes; Steps 6–7 never complete
```

**Required architecture:**
```
POST /api/analyze → creates session, triggers Step 0 ONLY
Each step completion triggers the NEXT step as a separate execution
GET /api/analyze/status/{sessionId} → polls for progress
Result: No single execution context runs longer than ~45 seconds
```

**Implementation — Client-Side Orchestration (simplest, most reliable on Replit):**

```typescript
// New endpoint: POST /api/analyze/step
// Executes ONE step at a time, returns result, client calls next step

export async function POST(req: Request) {
  const { sessionId, stepNumber, companyName, previousResults } = await req.json();

  try {
    const result = await executeStep(stepNumber, companyName, previousResults);
    await saveStepResult(sessionId, stepNumber, result);
    return Response.json({ success: true, step: stepNumber, data: result });
  } catch (error) {
    return Response.json({
      success: false,
      step: stepNumber,
      error: error.message,
      retryable: true
    }, { status: 500 });
  }
}

// Client-side orchestration loop
async function generateReport(companyName: string) {
  const sessionId = createSessionId();
  let accumulatedResults: Record<number, any> = {};

  for (const step of [0, 1, 2, 3, 4, 5, 6, 7]) {
    updateProgressUI(step, 'running');

    let attempts = 0;
    const MAX_RETRIES = 3;

    while (attempts < MAX_RETRIES) {
      try {
        const response = await fetch('/api/analyze/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            stepNumber: step,
            companyName,
            previousResults: accumulatedResults
          }),
          signal: AbortSignal.timeout(120_000) // 2-minute timeout per step
        });

        if (!response.ok) throw new Error(`Step ${step}: HTTP ${response.status}`);

        const result = await response.json();
        accumulatedResults[step] = result.data;
        updateProgressUI(step, 'complete');
        break; // Success — exit retry loop

      } catch (error) {
        attempts++;
        if (attempts >= MAX_RETRIES) {
          updateProgressUI(step, 'failed');
          showError(`Step ${step} failed after ${MAX_RETRIES} attempts: ${error.message}`);
          // Offer "Retry from Step X" button — previous steps are preserved
          return;
        }
        await sleep(2000 * Math.pow(2, attempts)); // Exponential backoff
      }
    }
  }

  // All steps complete — run final synthesis
  await runFinalSynthesis(sessionId, accumulatedResults);
}
```

**Why this fixes the crash:** Each step runs as a fresh HTTP request with its own timeout window. No single request exceeds 45 seconds. If Step 6 fails, Steps 0–5 results are preserved in `accumulatedResults` and Step 6 retries independently with exponential backoff.

### 1.2 — Implement Exponential Backoff with Jitter on All Claude API Calls

```typescript
async function callClaudeWithRetry(
  params: MessageCreateParams,
  stepNumber: number,
  maxRetries: number = 3
): Promise<Message> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        ...params,
        max_tokens: STEP_TOKEN_LIMITS[stepNumber] || 8192,
      });

      // Check for truncation
      if (response.stop_reason === 'max_tokens') {
        console.warn(`[Step ${stepNumber}] Response TRUNCATED (stop_reason=max_tokens). ` +
          `Length: ${response.content[0]?.text?.length || 0} chars. Retrying with 2x tokens...`);

        if (attempt < maxRetries - 1) {
          params = { ...params, max_tokens: (params.max_tokens || 8192) * 2 };
          continue;
        }
      }

      return response;

    } catch (error: any) {
      const isRetryable = [429, 500, 502, 503, 529].includes(error?.status);
      if (!isRetryable || attempt >= maxRetries - 1) throw error;

      const baseDelay = 2000 * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      console.log(`[Step ${stepNumber}] Retry ${attempt + 1}/${maxRetries} after ${baseDelay + jitter}ms`);
      await new Promise(r => setTimeout(r, baseDelay + jitter));
    }
  }
  throw new Error(`[Step ${stepNumber}] Exhausted all ${maxRetries} retries`);
}
```

### 1.3 — Set Correct max_tokens for Every Step

```typescript
const STEP_TOKEN_LIMITS: Record<number, number> = {
  0: 4096,   // Company Overview — short narrative
  1: 4096,   // Strategic Themes — 5 items
  2: 6000,   // KPIs — 10 items with benchmarks
  3: 8192,   // Friction Points — 10 items with cost formulas
  4: 8192,   // AI Use Cases — 10 detailed items (heaviest)
  5: 8192,   // Benefits Quantification — 10 items × 4 drivers
  6: 6000,   // Readiness & Token Modeling — 10 scores
  7: 4096,   // Priority Roadmap — 10 rankings
  99: 4096,  // Executive Summary synthesis
};
```

**CRITICAL:** Search the entire codebase for every Claude API call and verify max_tokens:
```bash
grep -rn "max_tokens" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
grep -rn "messages.create\|messages.stream" --include="*.ts" --include="*.tsx" --include="*.js"
```

### 1.4 — Fix or Remove the Dead SSE Endpoint

The `/api/progress/` endpoint returned 503. Either fix it or remove it cleanly:

```bash
grep -rn "progress" --include="*.ts" --include="*.tsx" --include="*.js" | grep -i "route\|handler\|api\|sse\|eventsource"
```

If SSE is not viable on Replit (likely), remove the SSE attempt entirely and rely on the polling architecture that's already working as fallback. Eliminate the 503 error from the network trace.

---

## PHASE 2: BULLETPROOF LEXICAL PARSING AND STRUCTURED GENERATION

The error message "The AI generated an incomplete response that couldn't be recovered" is thrown by your application code when `JSON.parse()` fails and all recovery strategies also fail. The LLM is returning responses that contain markdown wrappers, conversational preambles, or are truncated mid-JSON due to token limits.

### 2.1 — Enforce Structured Output at the API Level

Add this instruction block to the system message of EVERY Claude API call:

```
RESPONSE FORMAT — MANDATORY:
1. Return ONLY valid JSON. Your response must start with { or [ and end with } or ].
2. Do NOT wrap in markdown code fences (no ```json blocks).
3. Do NOT include any explanatory text before or after the JSON.
4. Keep all text fields concise — under 80 words each.
5. The response must be directly parseable by JSON.parse() with zero preprocessing.
```

### 2.2 — Replace All JSON.parse with Defensive Extraction Pipeline

Find the exact error throw location:
```bash
grep -rn "incomplete response" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
grep -rn "couldn't be recovered" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

Create a shared utility and replace ALL instances of `JSON.parse()` across the entire codebase:

```typescript
// lib/utils/safeJsonExtraction.ts

export function safeJsonExtraction(rawText: string, stepNumber: number): any {
  const text = rawText.trim();

  // Log raw response for observability
  console.log(`[Step ${stepNumber}] Raw response: ${text.length} chars`);
  console.log(`[Step ${stepNumber}] Starts: "${text.substring(0, 120)}"`);
  console.log(`[Step ${stepNumber}] Ends: "${text.substring(Math.max(0, text.length - 120))}"`);

  // Strategy 1: Direct parse (fast path)
  try { return JSON.parse(text); } catch (e) { /* continue */ }

  // Strategy 2: Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (e) { /* continue */ }
  }

  // Strategy 3: Extract object between first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (e) { /* continue */ }
  }

  // Strategy 4: Extract array between first [ and last ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(text.substring(firstBracket, lastBracket + 1)); } catch (e) { /* continue */ }
  }

  // Strategy 5: Repair truncated JSON (close unclosed structures)
  const jsonStart = Math.min(
    firstBrace !== -1 ? firstBrace : Infinity,
    firstBracket !== -1 ? firstBracket : Infinity
  );
  if (jsonStart !== Infinity) {
    let partial = text.substring(jsonStart);
    // Remove trailing incomplete key-value pair
    partial = partial.replace(/,\s*"[^"]*"?\s*:?\s*[^}\]]*$/, '');
    // Count and close unclosed structures
    const openBraces = (partial.match(/\{/g) || []).length;
    const closeBraces = (partial.match(/\}/g) || []).length;
    const openBrackets = (partial.match(/\[/g) || []).length;
    const closeBrackets = (partial.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) partial += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) partial += '}';
    try { return JSON.parse(partial); } catch (e) { /* continue */ }
  }

  // ALL 5 STRATEGIES FAILED — throw with maximum diagnostic context
  throw new Error(
    `[Step ${stepNumber}] JSON extraction failed after 5 strategies. ` +
    `Length: ${text.length}. ` +
    `Has '{': ${text.includes('{')}. Has '[': ${text.includes('[')}. ` +
    `Has code fence: ${text.includes('```')}. ` +
    `First 200: "${text.substring(0, 200)}"`
  );
}
```

### 2.3 — Compress Context Passed to Later Steps

By Steps 6–7, the prompt includes ALL previous step outputs — potentially 30,000+ input tokens. This crowds out the response window and causes truncation. Only pass what each step actually needs:

```typescript
function buildStepContext(stepNumber: number, allResults: Record<number, any>): object {
  const company = allResults[0]; // Step 0 always needed

  switch (stepNumber) {
    case 6: // Readiness — needs use cases + company context
      return {
        companyName: company.companyName,
        revenue: company.revenue,
        employeeCount: company.employeeCount,
        industry: company.industry,
        useCases: allResults[4].useCases.map((uc: any) => ({
          id: uc.id, name: uc.name, description: uc.description,
          agenticPattern: uc.agenticPattern, integrations: uc.integrations,
        })),
      };

    case 7: // Priority Roadmap — needs benefits + readiness scores
      return {
        companyName: company.companyName,
        useCases: allResults[4].useCases.map((uc: any, i: number) => ({
          id: uc.id, name: uc.name,
          primaryDriver: uc.primaryDriver,
          expectedValue: allResults[5]?.benefits?.[i]?.expectedValue,
          readinessScore: allResults[6]?.readiness?.[i]?.score,
          timeToValue: allResults[6]?.readiness?.[i]?.timeToValue,
        })),
      };

    case 99: // Executive Summary — needs high-level metrics only
      return {
        companyName: company.companyName,
        revenue: company.revenue,
        industry: company.industry,
        themes: allResults[1]?.themes?.map((t: any) => t.name),
        topUseCases: allResults[7]?.priority?.slice(0, 5).map((p: any) => ({
          name: p.name, tier: p.tier, expectedValue: p.expectedValue,
        })),
        totalPortfolioValue: allResults[5]?.totalPortfolioValue,
        scenarioAnalysis: allResults[5]?.scenarioAnalysis,
      };

    default: // Steps 0-5 can receive full previous context (still manageable)
      return allResults;
  }
}
```

---

## PHASE 3: STRATEGIC CONSTRAINT OF BENEFITS QUANTIFICATION (SECTION 5)

The Benefits Quantification module is producing mathematically absurd projections. Ardent Health ($5.5B revenue) shows $839.5M in AI benefits — 15.3% of revenue. Individual use cases claim $100M+ each. These numbers are not credible and would be immediately rejected by any CFO, CIO, or board-level audience.

This is a classic LLM semantic hallucination: the model lacks internalized grounding in macroeconomic realism and corporate financial architecture. Without strict guardrails, it confidently extrapolates minor productivity gains across entire organizational structures, compounding small numbers into astronomical figures.

### 3.1 — Overhaul the Claude Prompt for Step 5

Inject these instructions into the Step 5 system prompt:

```
CRITICAL FINANCIAL MODELING CONSTRAINTS — MANDATORY:

You are generating financial benefit estimates for a Tier-1 management consulting engagement.
These numbers will be presented to C-suite executives, CFOs, and board members.
Your estimates MUST be conservative, defensible, and empirically grounded.

HARD RULES:
1. No single AI use case may produce more than $10M in total annual value.
2. Revenue uplift per use case: 0.05% to 0.3% of company revenue maximum.
3. Risk reduction per use case: 2% to 5% of the stated risk pool maximum.
4. Cost savings per use case: equivalent of 2–10 FTEs maximum, not 50+.
5. Cash flow improvement per use case: 1–3 days of DSO improvement, not 10+.
6. Total portfolio value across all 10 use cases: target 1–3% of company revenue.
7. Probability of success: 0.40 to 0.70 range — never higher.
8. Apply implementation drag: assume 18–24 month value realization period.
9. Efficiency gains: hardcap at 30–50% time savings. Never project 10x improvements.

MENTAL MODEL: If a CFO saw these numbers, would they nod in agreement or challenge
your credibility? An underestimate that earns trust is infinitely more valuable than
an overestimate that destroys it.

When in doubt, go lower.
```

### 3.2 — Implement Deterministic Reasonableness Checks (The Guardrail Logic)

Create a validation middleware that runs AFTER Claude generates Step 5 outputs and AFTER the deterministic calc engine computes financial values, but BEFORE results are stored or displayed:

```typescript
// lib/validation/validateFinancialSanity.ts

interface ValidationResult {
  isValid: boolean;
  violations: string[];
  adjustments: string[];
  originalTotal: number;
  validatedTotal: number;
  scaleFactor: number;
}

export function validateFinancialSanity(
  useCases: UseCaseBenefit[],
  companyRevenue: number,
  companyOperatingExpense?: number
): ValidationResult {
  const violations: string[] = [];
  const adjustments: string[] = [];
  const opex = companyOperatingExpense || companyRevenue * 0.85; // Estimate if not provided

  // ── Per-Use-Case Caps ─────────────────────────────────────────
  const MAX_UC_VALUE = Math.min(15_000_000, companyRevenue * 0.005);

  const DRIVER_CAPS = {
    costReduction:   (uc: UseCaseBenefit) => Math.min(5_000_000, opex * 0.01),
    revenueGrowth:   (uc: UseCaseBenefit) => Math.min(8_000_000, companyRevenue * 0.003),
    riskMitigation:  (uc: UseCaseBenefit) => Math.min(5_000_000, (uc.riskExposure || companyRevenue * 0.1) * 0.05),
    cashFlow:        (uc: UseCaseBenefit) => Math.min(3_000_000, companyRevenue * 0.002),
  };

  for (const uc of useCases) {
    // Cap per-driver values
    if (uc.costBenefit > DRIVER_CAPS.costReduction(uc)) {
      violations.push(`${uc.id} cost benefit $${(uc.costBenefit/1e6).toFixed(1)}M exceeds cap`);
      uc.costBenefit = DRIVER_CAPS.costReduction(uc);
      adjustments.push(`${uc.id} cost benefit capped at $${(uc.costBenefit/1e6).toFixed(1)}M`);
    }
    if (uc.revenueBenefit > DRIVER_CAPS.revenueGrowth(uc)) {
      violations.push(`${uc.id} revenue benefit $${(uc.revenueBenefit/1e6).toFixed(1)}M exceeds cap`);
      uc.revenueBenefit = DRIVER_CAPS.revenueGrowth(uc);
      adjustments.push(`${uc.id} revenue benefit capped at $${(uc.revenueBenefit/1e6).toFixed(1)}M`);
    }
    if (uc.riskBenefit > DRIVER_CAPS.riskMitigation(uc)) {
      violations.push(`${uc.id} risk benefit $${(uc.riskBenefit/1e6).toFixed(1)}M exceeds cap`);
      uc.riskBenefit = DRIVER_CAPS.riskMitigation(uc);
      adjustments.push(`${uc.id} risk benefit capped at $${(uc.riskBenefit/1e6).toFixed(1)}M`);
    }
    if (uc.cashFlowBenefit > DRIVER_CAPS.cashFlow(uc)) {
      violations.push(`${uc.id} cash flow benefit $${(uc.cashFlowBenefit/1e6).toFixed(1)}M exceeds cap`);
      uc.cashFlowBenefit = DRIVER_CAPS.cashFlow(uc);
      adjustments.push(`${uc.id} cash flow benefit capped at $${(uc.cashFlowBenefit/1e6).toFixed(1)}M`);
    }

    // Recalculate total after per-driver caps
    uc.totalAnnualValue = uc.costBenefit + uc.revenueBenefit + uc.riskBenefit + uc.cashFlowBenefit;

    // Cap per-UC total
    if (uc.totalAnnualValue > MAX_UC_VALUE) {
      const ucScale = MAX_UC_VALUE / uc.totalAnnualValue;
      uc.costBenefit *= ucScale;
      uc.revenueBenefit *= ucScale;
      uc.riskBenefit *= ucScale;
      uc.cashFlowBenefit *= ucScale;
      uc.totalAnnualValue = MAX_UC_VALUE;
      adjustments.push(`${uc.id} total capped at $${(MAX_UC_VALUE/1e6).toFixed(1)}M (scale: ${ucScale.toFixed(2)})`);
    }

    // Recalculate expected value
    uc.expectedValue = uc.totalAnnualValue * Math.min(uc.probabilityOfSuccess, 0.70);

    // Cap efficiency multipliers at 55%
    if (uc.efficiencyGain && uc.efficiencyGain > 0.55) {
      violations.push(`${uc.id} efficiency gain ${(uc.efficiencyGain*100).toFixed(0)}% exceeds 55% cap`);
      uc.efficiencyGain = 0.55;
    }
  }

  // ── Portfolio-Level Cap ────────────────────────────────────────
  const MAX_PORTFOLIO = companyRevenue * 0.03; // 3% of revenue — aggressive but defensible
  const portfolioTotal = useCases.reduce((sum, uc) => sum + uc.totalAnnualValue, 0);
  const originalTotal = portfolioTotal;
  let scaleFactor = 1.0;

  if (portfolioTotal > MAX_PORTFOLIO) {
    scaleFactor = MAX_PORTFOLIO / portfolioTotal;
    violations.push(`Portfolio total $${(portfolioTotal/1e6).toFixed(1)}M exceeds ${(MAX_PORTFOLIO/1e6).toFixed(1)}M cap (3% of revenue)`);

    for (const uc of useCases) {
      uc.totalAnnualValue *= scaleFactor;
      uc.expectedValue *= scaleFactor;
      uc.costBenefit *= scaleFactor;
      uc.revenueBenefit *= scaleFactor;
      uc.riskBenefit *= scaleFactor;
      uc.cashFlowBenefit *= scaleFactor;
    }
    adjustments.push(`Portfolio scaled by factor ${scaleFactor.toFixed(3)} to meet 3% revenue ceiling`);
  }

  const validatedTotal = useCases.reduce((sum, uc) => sum + uc.totalAnnualValue, 0);

  // ── Recalculate ALL Downstream Values ──────────────────────────
  // After capping, scenario analysis, priority scores, and executive summary
  // must be recalculated from the capped values. Do NOT skip this step.

  return {
    isValid: violations.length === 0,
    violations,
    adjustments,
    originalTotal,
    validatedTotal,
    scaleFactor,
  };
}
```

### 3.3 — Input Parameter Guardrails (Constrain What Claude Generates)

Validate Claude's raw inputs BEFORE they enter the calc engine:

```typescript
// lib/validation/clampInputParameters.ts

export function clampInputParameters(inputs: StepInputs, companyRevenue: number): StepInputs {
  return {
    ...inputs,
    annualHours: Math.min(inputs.annualHours, 50_000),
    hourlyRate: Math.max(35, Math.min(inputs.hourlyRate, 250)),
    revenueUpliftPct: Math.min(inputs.revenueUpliftPct, 0.005), // 0.5% max
    revenueAtRisk: Math.min(inputs.revenueAtRisk, companyRevenue * 0.20),
    riskExposure: Math.min(inputs.riskExposure, companyRevenue * 0.10),
    riskReductionPct: Math.min(inputs.riskReductionPct, 0.08), // 8% max
    daysImproved: Math.min(inputs.daysImproved, 5),
    probabilityOfSuccess: Math.max(0.40, Math.min(inputs.probabilityOfSuccess, 0.70)),
  };
}
```

### 3.4 — Display Validation Transparency

After applying caps, surface a validation summary in the Benefits Quantification section so consultants understand what was adjusted:

```
── Validation Applied ──────────────────────────────────
• 4 use cases capped at per-UC maximum ($15M or 0.5% of revenue)
• 6 input parameters clamped to guardrail ranges
• Portfolio total scaled by factor 0.247 to meet 3% revenue ceiling
• Original uncapped total: $839.5M → Validated total: $165.0M
────────────────────────────────────────────────────────
```

---

## PHASE 4: ENVIRONMENTAL PARITY AND OBSERVABILITY

### 4.1 — Structured Logging at Every Step Boundary

```typescript
function logStepExecution(stepNumber: number, phase: string, data: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    step: stepNumber,
    phase, // 'start' | 'claude_call' | 'claude_response' | 'parse' | 'validate' | 'complete' | 'error'
    ...data,
  }));
}

// Usage in step execution:
logStepExecution(5, 'claude_response', {
  responseLength: responseText.length,
  stopReason: response.stop_reason,
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  latencyMs: Date.now() - startTime,
});
```

### 4.2 — Environment Variable Validation at Startup

```typescript
// lib/config/validateEnv.ts
const REQUIRED_ENV_VARS = ['ANTHROPIC_API_KEY', 'DATABASE_URL'];

export function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  }
  console.log('✅ All required environment variables present');
}
```

### 4.3 — Log Raw Claude Outputs Before Parsing

Every Claude response must be logged to the console BEFORE any parsing is attempted. This ensures future debugging has access to the exact text payload that caused any failure:

```typescript
const rawText = response.content[0]?.text || '';
logStepExecution(stepNumber, 'claude_raw_output', {
  length: rawText.length,
  stopReason: response.stop_reason,
  first200: rawText.substring(0, 200),
  last200: rawText.substring(Math.max(0, rawText.length - 200)),
});

const parsed = safeJsonExtraction(rawText, stepNumber);
```

---

## PHASE 5: ROUTE AND UX FIXES

### 5.1 — Fix /saved-reports 404

The `/saved-reports` route returns 404 while `/saved` works. Register both routes or add a redirect:

```typescript
// In your routing configuration
// Option A: Redirect
export async function GET(req: Request) {
  return Response.redirect(new URL('/saved', req.url), 301);
}

// Option B: Register as alias pointing to same component
```

### 5.2 — Error Recovery UX

When a step fails mid-pipeline, the UI should show:
- Which specific step failed (not a generic "Analysis Failed")
- The actual error message (e.g., "Step 6 timed out" or "Step 7 JSON parse failed")
- A "Retry from Step X" button that preserves all previous step results
- The option to view partially completed results (Steps 0–5 were fine — show them)

---

## EXECUTION ORDER — FOLLOW THIS EXACTLY

| Phase | Duration | What To Do |
|-------|----------|-----------|
| **1** | 30 min | Find `"incomplete response"` error string. Replace all `JSON.parse()` with `safeJsonExtraction()`. |
| **2** | 30 min | Set `max_tokens: 8192` on all Claude calls. Add `stop_reason` checking. Add retry with backoff. |
| **3** | 1-2 hr | Refactor pipeline into per-step API calls (client-side orchestration). Remove broken SSE endpoint. |
| **4** | 30 min | Add compressed context for Steps 6-7 (don't dump all previous steps into prompt). |
| **5** | 1 hr | Implement `validateFinancialSanity()` and `clampInputParameters()`. Wire into Step 5 output path. |
| **6** | 30 min | Update Claude Step 5 prompt with conservative financial instructions. |
| **7** | 30 min | Add structured logging. Add environment validation. Add route fix. |
| **8** | 30 min | **TEST** — generate 3 reports and verify all pass. |

---

## TESTING AND SUCCESS CRITERIA — DO NOT STOP UNTIL ALL ARE MET

### Functional Tests
- [ ] Generate report for **"Truist Financial"** — all 8 steps complete, no errors
- [ ] Generate report for **"Global Payments"** — all 8 steps complete, no errors
- [ ] Generate report for **"Calendly"** (small company) — benefits scale appropriately to low single-digit millions
- [ ] Hit **"Try Again"** on a failed step — it retries only that step, previous steps preserved

### Financial Validation Tests
- [ ] No single use case exceeds $15M in any generated report
- [ ] No single use case exceeds 0.5% of company revenue
- [ ] Total portfolio value is under 3% of company revenue for all reports
- [ ] Risk benefit per use case is under 5% of stated risk exposure
- [ ] Revenue uplift per use case is under 0.3% of company revenue
- [ ] Probability of success values are all between 0.40 and 0.70

### Infrastructure Tests
- [ ] Console shows `stop_reason: "end_turn"` for every Claude call (never "max_tokens")
- [ ] No 503 errors on any endpoint
- [ ] No `JSON.parse` errors in console during generation
- [ ] Each step completes in under 60 seconds individually
- [ ] Total report generation completes in under 5 minutes
- [ ] Saved Reports page loads and displays all reports correctly

### Ardent Health Revalidation
- [ ] Re-run "Ardent Health" report — total should be ~$80-165M (1.5-3% of $5.5B), not $839.5M
- [ ] No individual use case exceeds $15M
- [ ] Risk benefit total is under $30M (was $654.6M)

Execute these changes comprehensively. Upon completion, output a structured summary of all modified files, the validation test results for 3 generated reports, and confirmation that the `safeJsonExtraction` and `validateFinancialSanity` functions are deployed and operational.
