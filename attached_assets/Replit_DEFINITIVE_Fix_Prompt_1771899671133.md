# REPLIT AGENT: DEFINITIVE FIX — "Analysis Failed: Incomplete Response"

**Date:** February 24, 2026
**App:** https://discover.movefasterwithai.com / https://smart-report-ai-claude-style.replit.app
**Status:** App is broken in production. Report generation fails 100% of the time.

---

## EXACT ERROR REPRODUCED — HERE'S WHAT HAPPENS

I just ran a live test generating a report for "Truist Financial" and captured the entire failure sequence:

### Timeline of Failure
```
T+0s    POST /api/analyze → 200 (pipeline starts)
T+0s    GET /api/progress/session_xxx → 503 SERVICE UNAVAILABLE ← RED FLAG #1
T+1s    GET /api/analyze/status/session_xxx → 200 (polling begins)
T+5s    Step 0: Company Overview → ✅ Complete
T+30s   Step 1: Strategic Anchoring → ✅ Complete
T+60s   Step 2: Business Functions & KPIs → ✅ Complete
T+75s   Step 3: Friction Points → ✅ Complete
T+105s  Step 4: AI Use Cases → ✅ Complete (took ~45s — heavy step)
T+135s  Step 5: Benefits Quantification → ✅ Complete
T+150s  Step 6: Readiness & Token Modeling → Spinner visible
T+165s  Step 7: Priority Roadmap → Spinner visible
T+180s  ❌ "Analysis Failed: The AI generated an incomplete response that couldn't be recovered"

130 total polling requests to /api/analyze/status/ — all returned 200 until crash
```

### What This Tells Us

1. **Steps 0-5 complete successfully.** The Claude API calls for qualitative analysis (Steps 0-4) and benefits computation (Step 5) are working.

2. **The failure occurs at Steps 6-7 or the final synthesis phase** — after ~3 minutes of execution.

3. **The `/api/progress/` SSE endpoint returned 503 immediately.** This means the SSE/EventSource connection was never established. The app fell back to polling, which works but indicates an infrastructure issue.

4. **The crash is server-side.** The client just polls `/api/analyze/status/` — it's the server process that dies or throws an unrecoverable error.

---

## ROOT CAUSE ANALYSIS — THREE LIKELY CAUSES (FIX ALL THREE)

### Cause 1: Replit Process Timeout / Memory Kill (MOST LIKELY)

Replit's deployment infrastructure kills long-running processes. The pipeline runs for ~3 minutes as a single server-side job. By Step 6-7, Replit's process manager likely terminates the handler due to:

- **Execution timeout:** Replit Deployments have timeout limits (often 60-120s for individual request handlers). Even though the POST to `/api/analyze` returned 200 immediately, the background processing may be running in a context that gets garbage collected or killed.
- **Memory pressure:** Each step accumulates the full context of all previous steps. By Step 6, the server is holding Steps 0-5 data (potentially 50-100KB of JSON) plus the prompt context for the next Claude call. If the process runs out of memory, it crashes silently.

**FIX — Break the pipeline into separate, independent API calls:**

```
CURRENT (broken):
  POST /api/analyze → starts Steps 0-7 as ONE continuous background process
  GET /api/analyze/status → polls for progress

FIXED:
  POST /api/analyze → starts Step 0 only, saves result to DB/memory store
  When Step 0 completes → server triggers Step 1 as a NEW function invocation
  When Step 1 completes → server triggers Step 2 as a NEW function invocation
  ... and so on for each step
```

Each step should be its own independent execution context. Use one of these patterns:

**Option A: Chained API calls from the client (simplest)**
```typescript
// Client-side orchestration
const steps = [0, 1, 2, 3, 4, 5, 6, 7];
let previousResult = null;

for (const step of steps) {
  updateUI(`Running Step ${step}...`);
  const response = await fetch('/api/analyze/step', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      step,
      companyName,
      previousResults: previousResult
    })
  });

  if (!response.ok) {
    // Retry this specific step up to 3 times
    // If still fails, show "Step X failed" not generic error
    throw new Error(`Step ${step} failed: ${await response.text()}`);
  }

  previousResult = await response.json();
  updateUI(`Step ${step} complete ✅`);
}
```

**Option B: Server-side queue with per-step handlers**
```typescript
// Each step is a separate serverless function invocation
// POST /api/analyze/step/[stepNumber]
export async function POST(req, { params }) {
  const { stepNumber } = params;
  const { sessionId, previousResults } = await req.json();

  const result = await executeStep(stepNumber, previousResults);

  // Save to in-memory store or DB
  await saveStepResult(sessionId, stepNumber, result);

  return Response.json({ success: true, data: result });
}
```

**Why this fixes it:** Each step runs as a fresh execution context with its own timeout window. No single request runs for 3+ minutes. If Step 6 fails, Steps 0-5 results are preserved and Step 6 can retry independently.

### Cause 2: Claude Response Truncation on Later Steps (CONFIRMED CONTRIBUTING FACTOR)

The error message explicitly says "incomplete response" — meaning a Claude API call returned truncated JSON. By Steps 6-7, the prompt includes ALL previous step results as context, making the prompt extremely long. This leaves fewer tokens for the response.

**The math:**
```
Step 7 prompt = system instructions + company research + Step 0 output + Step 1 output +
                Step 2 output + Step 3 output + Step 4 output + Step 5 output + Step 6 output
              = potentially 30,000-50,000+ input tokens

Claude Sonnet context window = 200K tokens
Available for response = 200K - input tokens - safety margin
```

Even with 200K context, if `max_tokens` is set to 4096 and the response needs 5000+ tokens, it gets truncated.

**FIX — Three changes needed:**

**A. Increase max_tokens for ALL steps to at least 8192:**
```bash
# Find every Claude API call
grep -rn "max_tokens" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
# Set ALL of them to at least 8192
```

**B. Check stop_reason on every Claude response:**
```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 8192,
  messages: [...],
});

// CRITICAL: Check if response was truncated
if (response.stop_reason === 'max_tokens') {
  console.error(`Step ${step}: Response TRUNCATED at ${response.content[0].text.length} chars`);
  // Option 1: Retry with higher max_tokens
  // Option 2: Retry with condensed prompt (only pass essential previous step data, not everything)
}
```

**C. Compress previous step context passed to later steps:**

Don't pass the entire raw output of Steps 0-6 into the Step 7 prompt. Instead, extract only the fields needed:

```typescript
// WRONG — passes everything, bloating the prompt
const step7Prompt = `Previous results: ${JSON.stringify(allPreviousSteps)}`;

// RIGHT — passes only what Step 7 needs
const step7Context = {
  companyName: step0.companyName,
  revenue: step0.revenue,
  themes: step1.themes.map(t => t.name),  // Just names, not full objects
  useCases: step4.useCases.map(uc => ({
    id: uc.id,
    name: uc.name,
    primaryDriver: uc.primaryDriver,
    expectedValue: step5.benefits[uc.id].expectedValue,
    readinessScore: step6.readiness[uc.id].score,
  })),
};
const step7Prompt = `Context: ${JSON.stringify(step7Context)}`;
```

This can reduce the Step 7 prompt from 30K+ tokens to under 5K.

### Cause 3: JSON Parsing Still Not Robust Enough

The "incomplete response that couldn't be recovered" error message was written by YOUR code — it's a catch-all for when JSON parsing fails and the recovery logic also fails.

**FIX — Find and upgrade the error handler:**

```bash
# Find the exact line that throws this error
grep -rn "incomplete response" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
grep -rn "couldn't be recovered" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

Replace the catch-all with a robust extraction pipeline:

```typescript
function parseClaudeResponse(rawText: string, stepNumber: number): any {
  // Log the raw response for debugging
  console.log(`[Step ${stepNumber}] Raw response length: ${rawText.length}`);
  console.log(`[Step ${stepNumber}] First 100 chars: ${rawText.substring(0, 100)}`);
  console.log(`[Step ${stepNumber}] Last 100 chars: ${rawText.substring(rawText.length - 100)}`);

  // Strategy 1: Direct parse
  try { return JSON.parse(rawText.trim()); } catch (e) { /* continue */ }

  // Strategy 2: Strip markdown code fences
  const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (e) { /* continue */ }
  }

  // Strategy 3: Extract JSON between first { and last }
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(rawText.substring(firstBrace, lastBrace + 1)); } catch (e) { /* continue */ }
  }

  // Strategy 4: Extract JSON array between first [ and last ]
  const firstBracket = rawText.indexOf('[');
  const lastBracket = rawText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(rawText.substring(firstBracket, lastBracket + 1)); } catch (e) { /* continue */ }
  }

  // Strategy 5: Repair truncated JSON (close unclosed braces/brackets)
  const jsonStart = Math.min(
    firstBrace !== -1 ? firstBrace : Infinity,
    firstBracket !== -1 ? firstBracket : Infinity
  );
  if (jsonStart !== Infinity) {
    let partial = rawText.substring(jsonStart);
    const opens = (partial.match(/\{/g) || []).length;
    const closes = (partial.match(/\}/g) || []).length;
    const openBrackets = (partial.match(/\[/g) || []).length;
    const closeBrackets = (partial.match(/\]/g) || []).length;

    // Remove any trailing incomplete key-value pair
    partial = partial.replace(/,\s*"[^"]*"?\s*:?\s*[^}\]]*$/, '');

    // Close unclosed structures
    for (let i = 0; i < openBrackets - closeBrackets; i++) partial += ']';
    for (let i = 0; i < opens - closes; i++) partial += '}';

    try { return JSON.parse(partial); } catch (e) { /* continue */ }
  }

  // ALL STRATEGIES FAILED — throw with maximum diagnostic info
  throw new Error(
    `[Step ${stepNumber}] JSON parse failed after 5 strategies. ` +
    `Response length: ${rawText.length}. ` +
    `Starts with: "${rawText.substring(0, 200)}". ` +
    `Ends with: "${rawText.substring(rawText.length - 200)}". ` +
    `Contains '{': ${rawText.includes('{')}. ` +
    `Contains code fence: ${rawText.includes('```')}.`
  );
}
```

---

## ALSO: ADD THESE TO EVERY CLAUDE PROMPT

Add this instruction block to the system message or beginning of EVERY step prompt:

```
CRITICAL RESPONSE FORMAT RULES:
1. Return ONLY valid JSON. No markdown code fences. No explanation text before or after.
2. Your response must start with { or [ and end with } or ].
3. Keep all text fields concise (under 80 words each).
4. Do NOT include comments in the JSON.
5. The response must be parseable by JSON.parse() directly with zero preprocessing.
```

---

## ALSO: FIX THE 503 ON /api/progress ENDPOINT

The SSE progress endpoint (`/api/progress/session_xxx`) returned 503 Service Unavailable immediately. This means either:
- The endpoint doesn't exist or isn't registered in the router
- The endpoint crashed on startup
- Replit's proxy rejected the SSE connection

**Find and fix:**
```bash
grep -rn "progress" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" | grep -i "route\|handler\|api"
```

If the endpoint exists but SSE isn't working on Replit, convert it to a polling-only architecture (which is what the app is already falling back to). Remove the SSE attempt to eliminate the 503 error and reduce confusion.

---

## ALSO: BENEFITS QUANTIFICATION CAPS (FROM PREVIOUS PROMPT — IMPLEMENT IF NOT YET DONE)

The saved reports show wildly inflated values. After fixing the pipeline crash, implement these validation caps:

### Per-Use-Case Cap
```typescript
const MAX_UC_VALUE = Math.min(15_000_000, companyRevenue * 0.005);
// No single use case exceeds $15M or 0.5% of revenue
```

### Per-Driver Caps
```typescript
const DRIVER_CAPS = {
  costReduction: Math.min(5_000_000, totalLaborCost * 0.03),
  revenueGrowth: Math.min(8_000_000, companyRevenue * 0.003),
  riskMitigation: Math.min(5_000_000, riskExposure * 0.05),
  cashFlow: Math.min(3_000_000, companyRevenue * 0.002),
};
```

### Portfolio Cap
```typescript
const MAX_PORTFOLIO = companyRevenue * 0.03; // 3% of revenue max
const totalValue = useCases.reduce((sum, uc) => sum + uc.totalAnnualValue, 0);
if (totalValue > MAX_PORTFOLIO) {
  const scaleFactor = MAX_PORTFOLIO / totalValue;
  useCases.forEach(uc => {
    uc.totalAnnualValue *= scaleFactor;
    uc.expectedValue *= scaleFactor;
    uc.costBenefit *= scaleFactor;
    uc.revenueBenefit *= scaleFactor;
    uc.riskBenefit *= scaleFactor;
    uc.cashFlowBenefit *= scaleFactor;
  });
}
```

### Add to Claude Step 5 Prompt
```
CONSERVATIVE BENEFITS RULES:
- No single use case should exceed $10M total annual value
- Revenue uplift: 0.05%-0.3% max per use case
- Risk reduction: 2%-5% of the risk pool max per use case
- Cost savings: 2-10 FTEs equivalent per use case, not 50+
- Cash flow: 1-3 days DSO improvement per use case, not 10+
- Total portfolio: aim for 1-3% of company revenue across all 10 use cases
- These go to CFOs. Underestimate > overestimate. Always.
```

---

## IMPLEMENTATION ORDER — DO THIS EXACTLY

### Phase 1: Stop the Crash (30 minutes)
1. Find the "incomplete response" / "couldn't be recovered" error string in codebase
2. Replace the JSON parsing with the 5-strategy `parseClaudeResponse()` function above
3. Set `max_tokens: 8192` on ALL Claude API calls
4. Add `stop_reason` checking — log when truncation happens

### Phase 2: Fix the Architecture (1-2 hours)
5. Refactor the pipeline so each step is a separate API call (Option A above is simplest)
6. Each step saves its result independently
7. If a step fails, previous steps are preserved and the failed step can retry
8. Remove or fix the broken `/api/progress` SSE endpoint (503 error)

### Phase 3: Compress Prompts (30 minutes)
9. For Steps 5-7 and the executive summary, pass ONLY the fields needed from previous steps
10. Don't dump the entire accumulated JSON into every subsequent prompt
11. This reduces token consumption and leaves more room for the response

### Phase 4: Benefits Caps (1 hour)
12. Implement per-UC, per-driver, and portfolio-level caps
13. Add conservative instructions to the Step 5 Claude prompt
14. Recalculate all downstream values (expected value, scenarios, priority scores) after capping

### Phase 5: Test (30 minutes)
15. Generate report for "Truist Financial" — must complete all 8 steps
16. Generate report for "Global Payments" — must complete all 8 steps
17. Generate report for "Calendly" — verify benefits scale down for small company
18. Check no single use case exceeds $15M in any report
19. Check total portfolio value is under 3% of company revenue

---

## SUCCESS CRITERIA — DON'T STOP UNTIL ALL ARE MET

- [ ] 3 consecutive successful report generations with zero errors
- [ ] No "Analysis Failed" screen for any company tested
- [ ] Console shows `stop_reason: "end_turn"` for every Claude call
- [ ] No 503 errors on any endpoint
- [ ] Benefits values are capped and realistic (portfolio < 3% of revenue)
- [ ] Each step is independently retryable without restarting the full pipeline
