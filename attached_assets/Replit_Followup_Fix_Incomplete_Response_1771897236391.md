# REPLIT AGENT: Fix "AI Generated an Incomplete Response" Error

**Status:** After implementing the first round of fixes (retry logic, timeouts, benefits caps), report generation now fails with: **"The AI generated an incomplete response that couldn't be recovered."**

This error means the Claude API is returning a response that cannot be parsed into the expected JSON structure. The previous fixes did not solve the root cause. This prompt identifies the exact failure modes and provides the precise code-level fixes needed.

---

## THE PROBLEM: WHY CLAUDE RETURNS "INCOMPLETE" RESPONSES

There are exactly 5 reasons this happens. You need to check and fix ALL of them:

### 1. `max_tokens` is too low — Claude's response is literally truncated

**This is the #1 most likely cause.** When Claude hits the `max_tokens` limit, it stops generating mid-sentence, mid-JSON. The response ends with something like `"annual_hours": 12` (no closing braces, no closing brackets). `JSON.parse()` fails.

**How to check:** Search the entire codebase for every Claude API call. Look for the `max_tokens` parameter.

```bash
grep -rn "max_tokens" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

**The fix:** Set `max_tokens` appropriately for each step:

| Step | Content | Required max_tokens |
|------|---------|-------------------|
| 0 (Company Overview) | Short narrative + JSON | 4096 |
| 1 (Strategic Themes) | 5 themes with details | 4096 |
| 2 (KPIs) | 10 KPIs with benchmarks | 6000 |
| 3 (Friction Points) | 10 friction points with formulas | 8000 |
| 4 (Use Cases) | 10 detailed use cases | 8192 |
| 5 (Benefits) | 10 benefit models (4 drivers each) | 8192 |
| 6 (Readiness) | 10 readiness scores + token models | 6000 |
| 7 (Priority) | 10 priority scores + roadmap | 4096 |
| Executive Summary | Narrative synthesis | 4096 |

**If ANY step has `max_tokens` below 4096, that's your bug.** Steps 3, 4, and 5 generating 10 detailed items each need 8000+ tokens. The default `max_tokens` in many Anthropic SDK versions is 1024 or 4096 — both too low for the larger steps.

**Code pattern to implement:**

```typescript
const STEP_TOKEN_LIMITS: Record<number, number> = {
  0: 4096,
  1: 4096,
  2: 6000,
  3: 8000,
  4: 8192,
  5: 8192,
  6: 6000,
  7: 4096,
};

// In every Claude API call:
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: STEP_TOKEN_LIMITS[stepNumber] || 8192,
  // ... rest of params
});
```

### 2. Claude wraps JSON in markdown code fences — parser doesn't strip them

Claude frequently returns JSON wrapped like this:

```
Here is the analysis:

\`\`\`json
{"themes": [...]}
\`\`\`
```

If your parser does `JSON.parse(response.content[0].text)`, it fails because the string starts with "Here is" not "{".

**The fix:** Add this utility and use it EVERYWHERE you parse Claude's response:

```typescript
function extractJSON(text: string): any {
  // Strategy 1: Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Continue to extraction strategies
  }

  // Strategy 2: Extract from markdown code fence
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch (e) {
      // Continue
    }
  }

  // Strategy 3: Find the first { or [ and last } or ]
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const start = firstBrace === -1 ? firstBracket :
                firstBracket === -1 ? firstBrace :
                Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    const isArray = text[start] === '[';
    const lastChar = isArray ? ']' : '}';
    const end = text.lastIndexOf(lastChar);

    if (end > start) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch (e) {
        // Continue
      }
    }
  }

  // Strategy 4: If all parsing fails, throw with diagnostic info
  const preview = text.substring(0, 200);
  throw new Error(
    `Failed to extract JSON from Claude response. ` +
    `Response length: ${text.length} chars. ` +
    `Starts with: "${preview}..." ` +
    `Contains code fence: ${text.includes('```')}. ` +
    `Contains opening brace: ${text.includes('{')}`
  );
}
```

**CRITICAL: Search for every instance of `JSON.parse` in your codebase and replace with `extractJSON`.** Do not miss any.

### 3. Claude's `stop_reason` is `"max_tokens"` — response was cut off

Even with higher `max_tokens`, Claude might still truncate if the prompt + response exceeds the model's context window, or if a particularly complex step needs more tokens than allocated.

**The fix:** Check `stop_reason` after every Claude call:

```typescript
const response = await anthropic.messages.create({ ... });

const stopReason = response.stop_reason;
const responseText = response.content[0]?.text || '';

if (stopReason === 'max_tokens') {
  console.error(`[Step ${stepNumber}] Claude response truncated (hit max_tokens). ` +
    `Response length: ${responseText.length} chars. ` +
    `Attempting JSON repair...`);

  // Attempt to repair truncated JSON
  const repaired = repairTruncatedJSON(responseText);
  if (repaired) {
    return repaired;
  }

  // If repair fails, retry with higher max_tokens
  console.log(`[Step ${stepNumber}] Retrying with 2x max_tokens...`);
  const retryResponse = await anthropic.messages.create({
    ...originalParams,
    max_tokens: originalParams.max_tokens * 2,
  });

  if (retryResponse.stop_reason === 'max_tokens') {
    throw new Error(`Step ${stepNumber} exceeded token limit even after retry`);
  }

  return extractJSON(retryResponse.content[0].text);
}

return extractJSON(responseText);
```

**JSON repair function for truncated responses:**

```typescript
function repairTruncatedJSON(text: string): any | null {
  // Find the JSON portion
  const start = text.indexOf('{') !== -1 ? text.indexOf('{') :
                text.indexOf('[') !== -1 ? text.indexOf('[') : -1;
  if (start === -1) return null;

  let jsonStr = text.substring(start);

  // Count open/close braces and brackets
  let openBraces = (jsonStr.match(/\{/g) || []).length;
  let closeBraces = (jsonStr.match(/\}/g) || []).length;
  let openBrackets = (jsonStr.match(/\[/g) || []).length;
  let closeBrackets = (jsonStr.match(/\]/g) || []).length;

  // Close any unclosed structures
  // First, close any unclosed strings (find last quote context)
  // Then add missing brackets/braces
  while (closeBrackets < openBrackets) {
    jsonStr += ']';
    closeBrackets++;
  }
  while (closeBraces < openBraces) {
    jsonStr += '}';
    closeBraces++;
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Truncation happened mid-value — can't repair
    return null;
  }
}
```

### 4. The prompt asks for too much in a single call

If you're asking Claude to generate ALL 10 use cases with ALL their details in a single API call, the response can exceed 6000+ tokens easily. When combined with a long prompt (company research, previous steps, few-shot examples), the total context gets large.

**The fix — split large steps into two calls:**

For Steps 3, 4, and 5 (the ones generating 10 detailed items each), consider splitting into two batches:

```typescript
// Instead of: "Generate 10 friction points"
// Do:
const batch1 = await claudeCall("Generate friction points for themes 1-3 (items 1-6)");
const batch2 = await claudeCall("Generate friction points for themes 4-5 (items 7-10)");
const allFrictionPoints = [...batch1, ...batch2];
```

This halves the response size per call and dramatically reduces truncation risk. Each batch stays well under 4096 tokens.

**Alternative: Use the prompt to force shorter outputs:**

Add this to every step prompt:
```
RESPONSE FORMAT: Return ONLY valid JSON. No markdown, no explanation, no code fences.
Keep each text field under 100 words. Be concise. The JSON must be parseable by JSON.parse() directly.
```

### 5. Streaming response isn't being accumulated correctly

If you're using streaming (`stream: true`) to show progress, the response text must be fully accumulated before parsing.

**The fix:** Ensure you're collecting all chunks:

```typescript
// WRONG — parsing before stream completes
const stream = await anthropic.messages.stream({ ... });
stream.on('text', (text) => {
  const result = JSON.parse(text); // ← FAILS — this is a partial chunk
});

// RIGHT — accumulate then parse
const stream = await anthropic.messages.stream({ ... });
let fullText = '';
stream.on('text', (text) => {
  fullText += text;
});
const finalMessage = await stream.finalMessage();
const result = extractJSON(fullText);
```

If you're NOT using streaming (just `anthropic.messages.create()`), this isn't the issue. But search for `stream: true` or `.stream(` to verify.

---

## IMPLEMENTATION CHECKLIST — DO THESE IN ORDER

1. **Search all Claude API calls:**
   ```bash
   grep -rn "messages.create\|messages.stream\|anthropic\.\|claude" --include="*.ts" --include="*.tsx" --include="*.js"
   ```
   Count how many there are. List them with file:line.

2. **For EACH Claude API call:**
   - [ ] Set `max_tokens` per the table above (minimum 8192 for Steps 3-5)
   - [ ] Check `stop_reason` after the call — if `"max_tokens"`, retry with 2x
   - [ ] Pass the response through `extractJSON()` not raw `JSON.parse()`
   - [ ] Add try/catch with detailed error logging (step number, response length, first 200 chars)

3. **Add the `extractJSON` utility function** (from section 2 above) to a shared utils file. Import it everywhere.

4. **Add the `repairTruncatedJSON` function** (from section 3 above) as a fallback.

5. **Add this to EVERY Claude prompt:**
   ```
   RESPONSE FORMAT: Return ONLY a valid JSON object. Do NOT wrap in markdown code fences.
   Do NOT include any text before or after the JSON. The response must start with { or [ and end with } or ].
   ```

6. **Add diagnostic logging** so you can see exactly what's happening:
   ```typescript
   console.log(`[Step ${step}] Claude response received. ` +
     `Length: ${text.length}, Stop reason: ${stopReason}, ` +
     `Starts with: "${text.substring(0, 50)}"`);
   ```

7. **Test with "Truist Financial"** — run a full report and check logs for any truncation warnings.

---

## QUICK DIAGNOSTIC: FIND THE FAILING STEP

The error "AI generated an incomplete response that couldn't be recovered" is being thrown somewhere in your code. Find it:

```bash
grep -rn "incomplete response" --include="*.ts" --include="*.tsx" --include="*.js"
grep -rn "couldn't be recovered" --include="*.ts" --include="*.tsx" --include="*.js"
```

This will show you the exact file and line where the error is thrown. From there, trace back to which step triggered it, and check that step's `max_tokens` and parsing logic first. That's your quickest path to the fix.

---

## WHAT "SUCCESS" LOOKS LIKE

After these fixes:
- Reports generate end-to-end without errors for any company name
- Console logs show `stop_reason: "end_turn"` for every Claude call (never "max_tokens")
- No JSON parsing errors in logs
- Benefits values are capped per the previous prompt's validation rules
- The entire pipeline completes in under 5 minutes

Do NOT consider this fixed until you've successfully generated at least 3 reports for different companies (one large public company, one mid-size, one small/private).
