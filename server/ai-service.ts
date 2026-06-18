import pRetry, { AbortError } from "p-retry";
import Anthropic from "@anthropic-ai/sdk";
import https from "https";
import { postProcessAnalysis } from "./calculation-postprocessor";
import { getStandardizedRolesPromptText } from "../shared/standardizedRoles";

// Create a custom HTTPS agent that bypasses any proxy settings
const directAgent = new https.Agent({
  rejectUnauthorized: true,
});

// Helper to get current configuration (evaluated at call time, not module load)
function getConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const integrationApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  
  // Use the Replit-managed integration for both development and production
  // The AI_INTEGRATIONS_ANTHROPIC_API_KEY is the preferred, secure approach
  // Falls back to CLAUDERESEARCHER as secondary option
  let apiKey: string | undefined;
  let baseURL: string | undefined;
  let usingIntegration = false;
  
  if (integrationApiKey) {
    // Use Replit-managed integration (works in both dev and production)
    apiKey = integrationApiKey;
    baseURL = configuredBaseURL; // Use integration base URL if available
    usingIntegration = true;
  } else if (process.env.CLAUDERESEARCHER) {
    // Fallback to custom API key
    apiKey = process.env.CLAUDERESEARCHER;
    baseURL = configuredBaseURL;
    usingIntegration = false;
  } else {
    apiKey = undefined;
    baseURL = undefined;
  }
  
  return {
    isProduction,
    integrationApiKey,
    usingIntegration,
    apiKey,
    baseURL,
  };
}

// Create Anthropic client lazily
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  const config = getConfig();
  
  if (!config.apiKey) {
    throw new Error("Anthropic API key is not configured");
  }
  
  // Create client with custom fetch that uses direct agent (no proxy)
  const clientOptions: any = {
    apiKey: config.apiKey,
  };
  
  if (config.baseURL) {
    clientOptions.baseURL = config.baseURL;
  }
  
  // In production, use custom fetch with direct HTTPS agent to bypass proxy
  if (config.isProduction) {
    clientOptions.fetch = async (url: string, init: any) => {
      // Clear any proxy environment variables for this request
      const originalHttpProxy = process.env.HTTP_PROXY;
      const originalHttpsProxy = process.env.HTTPS_PROXY;
      const originalHttpProxyLower = process.env.http_proxy;
      const originalHttpsProxyLower = process.env.https_proxy;
      
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      delete process.env.http_proxy;
      delete process.env.https_proxy;
      
      try {
        const response = await fetch(url, {
          ...init,
        });
        return response;
      } finally {
        // Restore proxy env vars
        if (originalHttpProxy) process.env.HTTP_PROXY = originalHttpProxy;
        if (originalHttpsProxy) process.env.HTTPS_PROXY = originalHttpsProxy;
        if (originalHttpProxyLower) process.env.http_proxy = originalHttpProxyLower;
        if (originalHttpsProxyLower) process.env.https_proxy = originalHttpsProxyLower;
      }
    };
  }
  
  anthropicClient = new Anthropic(clientOptions);
  return anthropicClient;
}

// Progress callback type for streaming updates
type ProgressCallback = (step: number, message: string, detail?: string) => void;

interface StreamingResult {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

// ── Benchmark URL sourcing via live web search ──────────────────────
// Web search is enabled ONLY for Call 1 (Step 2 KPI benchmark source URLs) so
// every cited URL is search-grounded rather than recalled from model memory.
// `max_uses` is the hard backstop for the per-KPI search budget; override with
// BENCHMARK_WEB_SEARCH_MAX_USES.
export function getBenchmarkWebSearchMaxUses(): number {
  const raw = Number(process.env.BENCHMARK_WEB_SEARCH_MAX_USES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15;
}

export function buildBenchmarkWebSearchTool() {
  return {
    type: "web_search_20250305" as const,
    name: "web_search" as const,
    max_uses: getBenchmarkWebSearchMaxUses(),
  };
}

// Streaming API call that detects step boundaries and fires progress callbacks
async function callAnthropicAPIStreaming(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 64000,
  onProgress?: ProgressCallback,
  opts?: { webSearch?: boolean }
): Promise<StreamingResult> {
  const config = getConfig();

  if (!config.apiKey) {
    console.error("[callAnthropicAPIStreaming] No API key configured");
    throw new Error("Anthropic API key is not configured");
  }

  try {
    console.log("[callAnthropicAPIStreaming] Making streaming API request");
    const client = getAnthropicClient();

    let fullText = "";
    let lastDetectedStep = -1;

    const stepLabels: Record<number, string> = {
      0: "Company Overview",
      1: "Strategic Anchoring",
      2: "Business Functions & KPIs",
      3: "Friction Points",
      4: "AI Use Cases",
      5: "Benefits Quantification",
      6: "Readiness & Token Modeling",
      7: "Priority Roadmap",
    };

    const streamParams: any = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    };
    if (opts?.webSearch) {
      const tool = buildBenchmarkWebSearchTool();
      streamParams.tools = [tool];
      console.log(`[callAnthropicAPIStreaming] Web search ENABLED (max_uses=${tool.max_uses})`);
    }

    const stream = client.messages.stream(streamParams);

    stream.on("text", (text) => {
      fullText += text;

      // Detect step boundaries by looking for "step": N patterns in the accumulated JSON
      if (onProgress) {
        for (let s = lastDetectedStep + 1; s <= 7; s++) {
          // Look for the step key in the JSON being generated
          if (fullText.includes(`"step": ${s}`) || fullText.includes(`"step":${s}`)) {
            lastDetectedStep = s;
            const label = stepLabels[s] || `Step ${s}`;
            onProgress(s + 1, `Step ${s}: ${label}`, `Generating ${label.toLowerCase()}...`);
          }
        }
      }
    });

    const STREAM_TIMEOUT_MS = 720000; // 12 minutes
    const finalMessage = await Promise.race([
      stream.finalMessage(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          stream.abort();
          reject(new Error("Anthropic streaming response timed out after 12 minutes"));
        }, STREAM_TIMEOUT_MS);
      }),
    ]);

    const stopReason = finalMessage.stop_reason || null;
    const inputTokens = finalMessage.usage?.input_tokens || 0;
    const outputTokens = finalMessage.usage?.output_tokens || 0;
    console.log(`[callAnthropicAPIStreaming] Stream completed — ${fullText.length} chars, stop_reason: ${stopReason}, tokens: ${inputTokens} in / ${outputTokens} out`);

    if (stopReason === 'max_tokens') {
      console.warn(`[callAnthropicAPIStreaming] ⚠ TRUNCATED: Model hit max_tokens (${maxTokens}). Output: ${outputTokens} tokens. Response will need recovery.`);
    }

    if (!fullText && (!finalMessage.content || !finalMessage.content[0] || finalMessage.content[0].type !== "text")) {
      console.error("[callAnthropicAPIStreaming] Invalid response format and no streamed text");
      throw new Error("Invalid response format from Anthropic API");
    }

    // With web search enabled the final message interleaves server_tool_use /
    // web_search_tool_result blocks with one or more text blocks, so join ALL
    // text blocks rather than assuming content[0] is text.
    const finalText = (finalMessage.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("");
    const resultText = (finalText.length > fullText.length ? finalText : fullText) || '';
    if (fullText && finalText && fullText.length !== finalText.length) {
      console.warn(`[callAnthropicAPIStreaming] Stream text (${fullText.length} chars) differs from finalMessage text (${finalText.length} chars) — using longer one`);
    }
    const searchRequests = (finalMessage.usage as any)?.server_tool_use?.web_search_requests;
    if (searchRequests != null) {
      console.log(`[callAnthropicAPIStreaming] Web searches performed: ${searchRequests}`);
    }

    return {
      text: resultText,
      stopReason,
      inputTokens,
      outputTokens,
    };
  } catch (error: any) {
    console.error("[callAnthropicAPIStreaming] Exception caught:", {
      message: error?.message,
      name: error?.name,
      status: error?.status,
    });
    throw error;
  }
}

// API call using official Anthropic SDK
async function callAnthropicAPI(systemPrompt: string, userPrompt: string, maxTokens: number = 64000): Promise<string> {
  const config = getConfig();
  
  if (!config.apiKey) {
    console.error("[callAnthropicAPI] No API key configured");
    throw new Error("Anthropic API key is not configured");
  }
  
  try {
    console.log("[callAnthropicAPI] Making API request using Anthropic SDK, production:", config.isProduction);
    
    const client = getAnthropicClient();
    
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    
    if (!message.content || !message.content[0] || message.content[0].type !== "text") {
      console.error("[callAnthropicAPI] Invalid response format");
      throw new Error("Invalid response format from Anthropic API");
    }
    
    const text = message.content[0].text;
    console.log(`[callAnthropicAPI] Response received: ${text.length} chars, stop_reason: ${message.stop_reason}, starts with: "${text.substring(0, 50)}..."`);
    
    if (message.stop_reason === 'max_tokens') {
      console.warn(`[callAnthropicAPI] ⚠ Response truncated at max_tokens (${maxTokens}). Response: ${text.length} chars.`);
    }
    
    return text;
  } catch (error: any) {
    console.error("[callAnthropicAPI] Exception caught:", {
      message: error?.message,
      name: error?.name,
      status: error?.status,
    });
    throw error;
  }
}

// Export a function to check if production is properly configured
export function checkProductionConfig(): { ok: boolean; message: string } {
  const config = getConfig();
  
  // Check if we have the Replit-managed integration API key
  if (!config.apiKey) {
    return {
      ok: false,
      message: "No Anthropic API key configured. Please set up the Anthropic integration in Replit."
    };
  }
  return { ok: true, message: `AI service configured (using Replit-managed integration)` };
}

// Helper function to check if error is rate limit or transient
function isRetryableError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  const status = error?.status;
  return (
    status === 413 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    errorMsg.includes("413") ||
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

export interface ExecutiveSummaryFinding {
  title: string;
  body: string;
  value: string;
}

export interface ExecutiveSummary {
  headline: string;
  context: string;
  opportunityTable: {
    rows: Array<{
      metric: string;
      value: string;
    }>;
  };
  findings: ExecutiveSummaryFinding[];
  criticalPath: string;
  recommendedAction: string;
}

export interface CompanyOverview {
  annualRevenue: number;
  totalEmployees: number;
  position: string;
  frictionTable: {
    rows: Array<{
      domain: string;
      annualBurden: string;
      strategicImpact: string;
    }>;
  };
  dataReadiness: {
    currentState: string;
    keyGaps: string;
  };
  whyNow: string;
}

export interface AnalysisResult {
  steps: AnalysisStep[];
  summary: string;
  executiveSummary: ExecutiveSummary;
  companyOverview: CompanyOverview;
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

/**
 * Extracts and parses JSON from Claude API response text using multiple strategies.
 * Use this instead of raw JSON.parse() for any Claude response.
 */
export function extractJSON(text: string): any {
  const trimmed = text.trim();
  
  try {
    return JSON.parse(trimmed);
  } catch (e) {
  }

  const codeFenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch (e) {
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const start = firstBrace === -1 ? firstBracket :
                firstBracket === -1 ? firstBrace :
                Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    const isArray = trimmed[start] === '[';
    const lastChar = isArray ? ']' : '}';
    const end = trimmed.lastIndexOf(lastChar);

    if (end > start) {
      try {
        return JSON.parse(trimmed.substring(start, end + 1));
      } catch (e) {
      }
    }
  }

  const preview = trimmed.substring(0, 200);
  throw new Error(
    `Failed to extract JSON from Claude response. ` +
    `Response length: ${trimmed.length} chars. ` +
    `Starts with: "${preview}..." ` +
    `Contains code fence: ${trimmed.includes('```')}. ` +
    `Contains opening brace: ${trimmed.includes('{')}`
  );
}

/**
 * Attempts to repair truncated JSON by closing unclosed braces/brackets.
 * Returns parsed object or null if repair fails.
 */
export function repairTruncatedJSON(text: string): any | null {
  const start = text.indexOf('{') !== -1 ? text.indexOf('{') :
                text.indexOf('[') !== -1 ? text.indexOf('[') : -1;
  if (start === -1) return null;

  let jsonStr = text.substring(start);

  let inString = false;
  let escaped = false;
  let lastOutsideString = start;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') {
      inString = !inString;
      if (!inString) lastOutsideString = i;
      continue;
    }
    if (!inString) lastOutsideString = i;
  }
  
  if (inString) {
    jsonStr = jsonStr.substring(0, lastOutsideString + 1);
    jsonStr = jsonStr.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
  }

  let openBraces = (jsonStr.match(/\{/g) || []).length;
  let closeBraces = (jsonStr.match(/\}/g) || []).length;
  let openBrackets = (jsonStr.match(/\[/g) || []).length;
  let closeBrackets = (jsonStr.match(/\]/g) || []).length;

  jsonStr = jsonStr.replace(/,\s*$/, '');

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
    return null;
  }
}

function robustJsonRepair(jsonText: string): string {
  let text = jsonText;

  text = text.replace(/^\uFEFF/, '');
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;

  let inString = false;
  let escaped = false;
  let lastSafePos = -1;
  const stack: string[] = [];

  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') {
      inString = !inString;
      if (!inString) lastSafePos = i;
      continue;
    }
    if (inString) continue;
    if (ch === '{') { stack.push('{'); }
    else if (ch === '[') { stack.push('['); }
    else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
      lastSafePos = i;
    }
    else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
      lastSafePos = i;
    }
    else if (ch === ',' || ch === ':') {
      lastSafePos = i;
    }
    else if (/[0-9.eE\-+]/.test(ch) || ch === 't' || ch === 'r' || ch === 'u' ||
             ch === 'f' || ch === 'a' || ch === 'l' || ch === 's' || ch === 'n') {
      lastSafePos = i;
    }

    if (stack.length === 0 && i > firstBrace) {
      text = text.substring(firstBrace, i + 1);
      console.warn(`[JSON Repair] Found complete top-level object ending at position ${i}`);
      return cleanupJson(text);
    }
  }

  const adjustedSafe = lastSafePos - firstBrace;
  text = text.substring(firstBrace);

  if (inString || stack.length > 0) {
    if (adjustedSafe > 0 && adjustedSafe < text.length) {
      text = text.substring(0, adjustedSafe + 1);
      console.warn(`[JSON Repair] Truncated to last safe position ${adjustedSafe} (stack depth: ${stack.length}, inString: ${inString})`);
    }

    if (inString) {
      const lastQuote = text.lastIndexOf('"');
      if (lastQuote > 0) {
        text = text.substring(0, lastQuote + 1);
        console.warn(`[JSON Repair] Cut back to last quote at pos ${lastQuote}`);
      }
    }
  }

  text = text.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/g, '');
  text = text.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:\s*$/g, '');
  text = text.replace(/,\s*"(?:[^"\\]|\\.)*"\s*$/g, '');
  text = text.replace(/,\s*"[^"]*$/g, '');
  text = text.replace(/,\s*$/g, '');
  text = text.replace(/:\s*[0-9]+\.?$/g, ': 0');
  text = text.replace(/:\s*tru?e?$/g, ': true');
  text = text.replace(/:\s*fals?e?$/g, ': false');
  text = text.replace(/:\s*nul?l?$/g, ': null');

  let cleaned = removeTrailingIncompleteObjects(text);
  return cleanupJson(cleaned);
}

function removeTrailingIncompleteObjects(text: string): string {
  let inStr = false;
  let esc = false;
  const stack: Array<{ch: string, pos: number}> = [];
  let lastCompleteItemEnd = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (ch === '{' || ch === '[') {
      stack.push({ch, pos: i});
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1].ch === '{') {
        stack.pop();
        if (stack.length <= 1) lastCompleteItemEnd = i;
      }
    } else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1].ch === '[') {
        stack.pop();
        if (stack.length <= 1) lastCompleteItemEnd = i;
      }
    }
  }

  if (stack.length > 1 && lastCompleteItemEnd > 0) {
    let cutPos = lastCompleteItemEnd + 1;
    const after = text.substring(cutPos).trim();
    if (after.startsWith(',')) {
      text = text.substring(0, cutPos);
      console.warn(`[JSON Repair] Removed trailing incomplete object/array at position ${cutPos} (stack depth: ${stack.length})`);
    }
  }

  return text;
}

function cleanupJson(text: string): string {
  text = text.replace(/,\s*([\]}])/g, '$1');
  text = text.replace(/"([^"]+)"\s*:\s*([}\]])/g, '"$1": null$2');
  text = text.replace(/"([^"]+)"\s*:\s*,/g, '"$1": null,');

  let openBraces = 0, openBrackets = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    else if (ch === '}') openBraces--;
    else if (ch === '[') openBrackets++;
    else if (ch === ']') openBrackets--;
  }

  while (openBrackets > 0) { text += ']'; openBrackets--; }
  while (openBraces > 0) { text += '}'; openBraces--; }

  text = text.replace(/,\s*([\]}])/g, '$1');

  return text;
}

function findMatchingBrace(text: string, startPos: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  const openChar = text[startPos];
  const closeChar = openChar === '{' ? '}' : ']';

  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findStepMarkersStringAware(text: string): Array<{pos: number, stepNum: number}> {
  const markers: Array<{pos: number, stepNum: number}> = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') {
      if (!inStr) {
        const match = text.substring(i).match(/^"step"\s*:\s*(\d+)/);
        if (match) {
          markers.push({ pos: i, stepNum: parseInt(match[1]) });
          i += match[0].length - 1;
          continue;
        }
      }
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
  }
  return markers;
}

function progressiveStepExtraction(rawText: string): any | null {
  try {
    const steps: any[] = [];

    const stepMarkers = findStepMarkersStringAware(rawText);

    for (const { pos: markerPos, stepNum } of stepMarkers) {

      let objStart = markerPos;
      while (objStart > 0 && rawText[objStart] !== '{') objStart--;
      if (rawText[objStart] !== '{') continue;

      const objEnd = findMatchingBrace(rawText, objStart);
      if (objEnd === -1) {
        const partialText = rawText.substring(objStart);
        const repaired = robustJsonRepair(partialText);
        try {
          const stepObj = extractJSON(repaired);
          if (stepObj.step !== undefined && stepObj.data) {
            steps.push(stepObj);
            console.warn(`[progressive-parse] Repaired partial step ${stepNum}`);
          }
        } catch {
          console.warn(`[progressive-parse] Could not recover step ${stepNum}`);
        }
        continue;
      }

      const stepText = rawText.substring(objStart, objEnd + 1);
      try {
        const stepObj = extractJSON(stepText);
        if (stepObj.step !== undefined && (stepObj.data !== undefined || stepObj.content !== undefined)) {
          steps.push(stepObj);
        }
      } catch {
        const repaired = cleanupJson(stepText);
        try {
          const stepObj = extractJSON(repaired);
          if (stepObj.step !== undefined) {
            steps.push(stepObj);
            console.warn(`[progressive-parse] Repaired data for step ${stepNum}`);
          }
        } catch {
          console.warn(`[progressive-parse] Could not parse step ${stepNum}, skipping`);
        }
      }
    }

    const uniqueSteps = new Map<number, any>();
    for (const s of steps) {
      const existing = uniqueSteps.get(s.step);
      if (!existing || (Array.isArray(s.data) && s.data.length > (existing.data?.length || 0))) {
        uniqueSteps.set(s.step, s);
      }
    }

    const finalSteps = Array.from(uniqueSteps.values()).sort((a, b) => a.step - b.step);

    if (finalSteps.length >= 2) {
      let companyOverview: any = {};
      const overviewMarker = rawText.indexOf('"companyOverview"');
      if (overviewMarker !== -1) {
        const braceAfter = rawText.indexOf('{', overviewMarker + 17);
        if (braceAfter !== -1) {
          const overviewEnd = findMatchingBrace(rawText, braceAfter);
          if (overviewEnd !== -1) {
            try {
              companyOverview = extractJSON(rawText.substring(braceAfter, overviewEnd + 1));
            } catch {}
          }
        }
      }

      console.warn(`[progressive-parse] Extracted ${finalSteps.length} valid steps from malformed JSON`);
      return { companyOverview, steps: finalSteps };
    }

    return null;
  } catch (e) {
    console.error("[progressive-parse] Error:", e);
    return null;
  }
}

function validateAnalysisStructure(analysis: any, companyName: string): void {
  if (!analysis) {
    throw new Error("Analysis result is empty");
  }
  
  if (!analysis.steps || !Array.isArray(analysis.steps)) {
    throw new Error("Analysis is missing the 'steps' array. The AI response may have been truncated.");
  }

  const stepNumbers = analysis.steps.map((s: any) => s.step).sort();
  const missingSteps = [0, 1, 2, 3, 4, 5].filter(n => !stepNumbers.includes(n));
  
  if (missingSteps.length > 0) {
    console.warn(`[validation] Analysis for "${companyName}" is missing steps: ${missingSteps.join(', ')}. Got steps: ${stepNumbers.join(', ')}`);
    const hardRequiredMissing = missingSteps.filter(n => n === 0 || n === 1 || n === 4);
    if (hardRequiredMissing.length > 0) {
      throw new Error(`Analysis is incomplete - missing critical steps: ${hardRequiredMissing.join(', ')}. The AI response was likely truncated. Please try again.`);
    }
  }

  for (const step of analysis.steps) {
    if (step.step >= 1 && step.step <= 7 && step.step !== 0) {
      if (!step.data || !Array.isArray(step.data) || step.data.length === 0) {
        if (step.step <= 4) {
          console.warn(`[validation] Step ${step.step} has no data records for "${companyName}"`);
        }
      }
    }
  }
  
  console.log(`[validation] Analysis structure OK for "${companyName}": ${analysis.steps.length} steps, steps present: [${stepNumbers.join(',')}]`);
}

// ═══════════════════════════════════════════════════════════════════
// SHARED PROMPT CONSTANTS — extracted from the monolithic prompt
// ═══════════════════════════════════════════════════════════════════

const SHARED_SYSTEM_IDENTITY = `<system_identity>
You are a synthesis of the most brilliant minds in business and AI:

STRATEGIC BUSINESS MINDS:
- Michael Porter (Harvard) - Competitive strategy and value chain analysis
- Clayton Christensen (Harvard) - Disruptive innovation frameworks
- Rita McGrath (Columbia) - Strategic inflection points
- The analytical rigor of McKinsey, BCG, and Bain senior partners

AI RESEARCH LEADERS:
- Stuart Russell (Berkeley) - AI foundations and rational agents
- Geoffrey Hinton (Toronto/Google) - Deep learning architecture
- Max Tegmark (MIT) - AI safety and future implications
- Dario Amodei (Anthropic) - Practical AI deployment

WRITING VOICE:
Write in the style of Ernest Hemingway—direct, muscular prose that respects the reader's intelligence. Every word earns its place. No decoration. No throat-clearing. The dignity of your writing comes from what remains unsaid, supported by the depth of analysis beneath.

TONE REQUIREMENTS:
- Professional yet warm
- Confident without arrogance
- Direct without being curt
- Polite without being obsequious
- Executive-appropriate at all times

ANALYTICAL RIGOR:
Inform your analysis with the rigor of MIT/Stanford AI researchers, the strategic lens of BCG/Bain/McKinsey consultants, and the technical depth of Anthropic/DeepMind/Meta scientists.

INTELLIGENT CHOICE ARCHITECTURE:
Layout information to tell a story that guides decision-making. Every number must earn its place. Every sentence must move the narrative forward. Design tables, charts, and summaries so the reader's eye travels naturally from insight to action.

CORE PRINCIPLES:
1. RESHAPE, DON'T ACCELERATE: Every use case must fundamentally change HOW work is performed. A 10x improvement in a bad process is still a bad process.
2. HUMAN-AI COLLABORATION: Design for human judgment at critical decision points. AI handles volume and pattern recognition; humans handle exceptions and accountability.
3. DATA GRAVITY: Use cases must cluster around existing data assets, not data the company wishes they had.
4. REGULATORY AWARENESS: Assume every AI output requires human validation before external action.
5. CONSERVATIVE BY DEFAULT: When in doubt, underestimate benefits and overestimate effort.

NON-NEGOTIABLE DATA LOCK:
PRESERVE EXACTLY: All numbers, percentages, currency values, time horizons, calculated outputs, KPI baselines, targets, deltas, quantitative relationships and formulas, table values and structures, directional conclusions, material caveats affecting interpretation.
</system_identity>`;

const SHARED_VOICE_AND_TONE = `<voice_and_tone>
## EXECUTIVE STYLE RULES

LEAD WITH INSIGHT, FOLLOW WITH EVIDENCE:
- Wrong: "The company processes 8.9B transactions with 87% authorization rates."
- Right: "Cross-border authorization represents a $54M opportunity. At 87% authorization across 8.9B annual transactions, each percentage point improvement generates $24M."

ACTIVE VOICE DEFAULT:
- Wrong: "298,200 hours are deflected by AI-drafted reports."
- Right: "AI-drafted reports deflect 298,200 analyst hours annually."

CONCRETE OVER ABSTRACT:
- Wrong: "Implementation risk concentrates on data mapping challenges."
- Right: "Implementation hinges on mapping 47 jurisdictions with inconsistent schemas—a 120-day sprint before deployment begins."

SENTENCE RHYTHM:
Short sentences punch. They create emphasis. Longer sentences connect ideas and build toward conclusions.

CALIBRATED CONFIDENCE:
- Use "indicates," "suggests," "projects" for estimates
- Reserve "will" for mechanical certainties
- Flag assumptions: "assuming Level 3 data maturity..."

ELIMINATE THROAT-CLEARING:
Remove: "It's important to note..." / "This section examines..." / "The following analysis shows..."

## Number Formatting
- Currency: Always include $ and commas. No decimals. (e.g., $1,234,567)
- Percentages: Include % sign. Round to whole numbers unless < 10%. (e.g., 47% or 3.2%)
- Large numbers: Use M for millions, B for billions (e.g., $1.2M, $3.4B)
- Ranges: Use en-dash with spaces (e.g., $1M – $3M)
- Numbers always shown in context (what they mean, not just what they are)

## FORMATTING REQUIREMENTS
- Paragraph breaks between distinct ideas (max 5-6 sentences per paragraph)
- Bold only for section headers or critical callouts
- No bullet points in narrative sections—use flowing prose
- Tables remain tables—do not convert to prose
- White space between major sections

## Content Standards
- Every use case needs: specific metric improved, baseline value, target value, timeline
- Benefits must be traceable to specific operational changes
- Token estimates must include assumptions about volume and frequency
- Priority scores must show component weights

## QUALITY GATES (verify before output)
1. Top 3 priorities identifiable in 30 seconds
2. Every paragraph has one clear point
3. All original numbers intact and contextualized
4. Uncertainty language calibrated (not inflammatory, not dismissive)
5. Evidence chain clear for skeptical reader
6. Respects executive time constraints

## Forbidden
- Generic statements without data: "improve efficiency"
- Passive voice: "costs will be reduced"
- Weasel words: "significant", "substantial", "various"
- Unsupported claims: Any number without clear derivation
</voice_and_tone>`;

const SHARED_FORMATTING = `
═══════════════════════════════════════════════════════════════════
FORMATTING STANDARDS
═══════════════════════════════════════════════════════════════════

FINANCIAL FORMATTING:
- Use "M" suffix for millions: $2.5M, $12.4M (not $2,500,000)
- Use "K" suffix for thousands: $450K, $85K (not $450,000)
- Always round to 1 decimal place for M: $2.5M, $12.4M
- Always round to whole numbers for K: $450K, $85K
- Use commas for raw numbers: 1,250,000 tokens
- Round financial benefits DOWN to nearest $100K

TIME MEASUREMENTS:
- Standardize ALL time metrics to DAYS (not hours, weeks, or months mixed)
- Examples: "45 days" not "6 weeks", "1 day" not "24 hours", "90 days" not "3 months"
- Only exception: Time-to-Value in Step 6 uses months`;

const SHARED_JSON_INSTRUCTION = `
CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, no text before or after. Start with { and end with }.
Be concise in text fields. Keep descriptions under 2 sentences. The JSON must be COMPLETE.`;

const SHARED_FORBIDDEN = `
<forbidden_outputs>
NEVER:
• Present benefits without reduction factors applied
• Propose use cases without Human-in-the-Loop
• Use "potential" benefits without probability weighting
• Skip showing calculation formulas with × symbols
• Generate fewer or more than 10 use cases, KPIs, or friction points
• Use "accelerate" or "speed up" without process transformation
</forbidden_outputs>`;

const EPOCH_FRAMEWORK_DEFINITION = `
=== EPOCH FRAMEWORK — HARDCODED DEFINITIONS (DO NOT MODIFY OR INTERPRET) ===

The EPOCH Framework is the MIT EPOCH Framework for identifying uniquely human capabilities that AI cannot replicate. When classifying use cases, assigning EPOCH tags, or referencing EPOCH in any output, reports, or UI elements, you MUST use ONLY the following exact definitions. Do NOT infer, guess, or generate alternative meanings for any letter.

E = Empathy (Empathy and Emotional Intelligence)
- The ability to understand, connect with, and care for others on a deep emotional level
- Includes: emotional intelligence, compassion, interpersonal sensitivity, therapeutic rapport

P = Presence (Presence, Networking, and Connectedness)
- The value of physical presence in building trust, collaboration, and in-person connection
- Includes: hands-on work, bedside manner, field presence, physical networking, face-to-face relationship building

O = Opinion (Opinion, Judgment, and Ethics)
- The capacity to make decisions based on human principles, accountability, and responsibility rather than just data
- Includes: ethical reasoning, moral judgment, professional accountability, values-based decision-making

C = Creativity (Creativity and Imagination)
- The ability to generate novel ideas, use humor, and visualize possibilities
- Includes: artistic expression, innovative thinking, humor, imaginative problem-solving, original ideation

H = Hope (Hope, Vision, and Leadership)
- The human capacity for grit, perseverance, and inspiration
- Includes: visionary leadership, motivational influence, resilience, long-term purpose, inspiring others

=== EPOCH CLASSIFICATION RULES ===

1. When a use case involves HIGH levels of a given EPOCH dimension, that use case has LOWER AI replaceability for that dimension.
2. When assigning EPOCH scores or tags to a use case, evaluate EACH of the five dimensions independently.
3. NEVER substitute alternative words for the EPOCH letters. The letters ALWAYS map to: Empathy, Presence, Opinion, Creativity, Hope. No exceptions.
4. In all reports, tables, charts, exports, and UI labels, display the EPOCH letters with their EXACT full names as defined above.
5. If you are uncertain about an EPOCH classification, default to explaining why a use case does or does not require that specific human capability.

=== VALIDATION CHECK ===
Before generating ANY output that references EPOCH, confirm:
- E = Empathy (NOT efficiency, execution, or any other word)
- P = Presence (NOT productivity, performance, or any other word)
- O = Opinion (NOT optimization, operations, or any other word)
- C = Creativity (NOT cost, compliance, or any other word)
- H = Hope (NOT health, hierarchy, or any other word)

If any EPOCH label does not match the above, STOP and correct before outputting.
=== END EPOCH FRAMEWORK DEFINITION ===
`;

function condenseSystemPrompt(prompt: string): string {
  let condensed = prompt;
  condensed = condensed.replace(/SHARED_VOICE_AND_TONE[\s\S]*?<\/voice_and_tone>/g, '');
  condensed = condensed.replace(/<voice_and_tone>[\s\S]*?<\/voice_and_tone>/g, '');
  condensed = condensed.replace(/### WRONG vs RIGHT EXAMPLE[\s\S]*?Always cross-reference[^\n]*/g, '');
  condensed = condensed.replace(/═{10,}/g, '═══');
  condensed = condensed.replace(/\n{3,}/g, '\n\n');
  console.log(`[condenseSystemPrompt] Reduced from ${prompt.length} to ${condensed.length} chars (${Math.round((1 - condensed.length/prompt.length) * 100)}% reduction)`);
  return condensed;
}

function condenseUserPrompt(prompt: string): string {
  let condensed = prompt;
  condensed = condensed.replace(/JSON\.stringify\([^)]+,\s*null,\s*\d+\)/g, (match) => match.replace(/,\s*null,\s*\d+/, ''));
  condensed = condensed.replace(/\n\s+/g, '\n');
  console.log(`[condenseUserPrompt] Reduced from ${prompt.length} to ${condensed.length} chars`);
  return condensed;
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE HELPER: callPipelineStep — single API call with retry + JSON parse
// ═══════════════════════════════════════════════════════════════════

async function callPipelineStep(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  label: string,
  opts?: { webSearch?: boolean }
): Promise<any> {
  const startTime = Date.now();

  const result = await pRetry(
    async () => {
      try {
        return await callAnthropicAPIStreaming(systemPrompt, userPrompt, maxTokens, undefined, opts);
      } catch (error: any) {
        if (error?.status === 429 || error?.message?.includes("429") || error?.message?.toLowerCase().includes("rate limit")) {
          console.log(`[${label}] Rate limit hit - waiting 60 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 60000));
          throw error;
        }
        if (error?.status === 413 || error?.message?.includes("413") || error?.message?.toLowerCase().includes("payload too large")) {
          console.warn(`[${label}] HTTP 413 Payload Too Large — condensing prompts for retry`);
          systemPrompt = condenseSystemPrompt(systemPrompt);
          userPrompt = condenseUserPrompt(userPrompt);
          maxTokens = Math.min(maxTokens, 16000);
          throw error;
        }
        if (isRetryableError(error)) {
          throw error;
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 3,
      minTimeout: 5000,
      maxTimeout: 60000,
      factor: 2,
      onFailedAttempt: (error) => {
        console.log(`[${label}] Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
      },
    }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${label}] Response: ${result.text.length} chars in ${elapsed}s, stop_reason: ${result.stopReason}`);

  let jsonText = result.text.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.replace(/^```json\s*/g, "").replace(/\s*```$/g, "");
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```\s*/g, "").replace(/\s*```$/g, "");
  }

  const jsonStart = jsonText.indexOf('{');
  const jsonEnd = jsonText.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
  }

  try {
    return extractJSON(jsonText);
  } catch (parseError) {
    console.warn(`[${label}] Direct parse failed, trying repair...`);

    if (result.stopReason === 'max_tokens') {
      const repaired = repairTruncatedJSON(jsonText);
      if (repaired) {
        console.warn(`[${label}] Truncation repair succeeded`);
        return repaired;
      }
    }

    const robustRepaired = robustJsonRepair(jsonText);
    try {
      const parsed = extractJSON(robustRepaired);
      console.warn(`[${label}] Robust repair succeeded`);
      return parsed;
    } catch {
      const progressive = progressiveStepExtraction(jsonText);
      if (progressive) {
        console.warn(`[${label}] Progressive extraction recovered ${progressive.steps?.length || 0} steps`);
        return progressive;
      }

      console.error(`[${label}] All parse methods failed. Response length: ${jsonText.length}`);
      console.error(`[${label}] First 500 chars:`, jsonText.substring(0, 500));
      throw new Error(`${label}: Failed to parse AI response after all recovery attempts`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE HELPER: synthesizeMissingSteps — partial recovery logic
// ═══════════════════════════════════════════════════════════════════

function synthesizeMissingSteps(analysis: any): void {
  if (!analysis?.steps || !Array.isArray(analysis.steps)) return;

  const step3 = analysis.steps.find((s: any) => s.step === 3 && s.data?.length > 0);
  const step4 = analysis.steps.find((s: any) => s.step === 4 && s.data?.length > 0);
  let step5 = analysis.steps.find((s: any) => s.step === 5);

  if (step4?.data?.length > 0 && (!step5 || !step5.data || step5.data.length < step4.data.length)) {
    const step4Data = step4.data as any[];
    const existing5 = (step5?.data as any[]) || [];
    const existingIDs = new Set(existing5.map((r: any) => r.ID));
    const synthesized5 = step4Data
      .filter((uc: any) => !existingIDs.has(uc.ID))
      .map((uc: any) => {
        const friction = step3?.data?.find((f: any) => f["Friction Point"] === uc["Target Friction"]);
        const annualCost = friction ? parseFloat(String(friction["Estimated Annual Cost ($)"] || "0").replace(/[$,KMkm]/g, (m: string) => m.toLowerCase() === 'k' ? '000' : m.toLowerCase() === 'm' ? '000000' : '')) || 500000 : 500000;
        return {
          ID: uc.ID,
          "Use Case": uc["Use Case Name"] || uc["Use Case"] || uc.ID,
          "Revenue Benefit ($)": "$0",
          "Revenue Formula": "N/A — synthesized from truncated response",
          "Revenue Formula Labels": { components: [] },
          "Cost Benefit ($)": `$${Math.round(annualCost * 0.3 / 100000) * 100000 / 1000000}M`,
          "Cost Formula": `${annualCost} annual cost × 30% reduction × 0.90 × 0.75`,
          "Cost Formula Labels": { components: [{ label: "Hours Saved", value: Math.round(annualCost / 150) }, { label: "Loaded Hourly Rate", value: 150 }, { label: "Benefits Loading", value: 1.35 }, { label: "Adoption Rate", value: 0.90 }, { label: "Data Maturity", value: 0.75 }] },
          "Cash Flow Benefit ($)": "$0",
          "Cash Flow Formula": "N/A — synthesized from truncated response",
          "Cash Flow Formula Labels": { components: [] },
          "Risk Benefit ($)": "$0",
          "Risk Formula": "N/A — synthesized from truncated response",
          "Risk Formula Labels": { components: [] },
          "Total Annual Value ($)": `$${Math.round(annualCost * 0.3 / 100000) * 100000 / 1000000}M`,
          "Probability of Success": 0.70,
          "Strategic Theme": uc["Strategic Theme"] || "",
        };
      });
    if (synthesized5.length > 0) {
      if (step5) {
        step5.data = [...existing5, ...synthesized5];
      } else {
        const newStep5 = { step: 5, title: "Benefits Quantification by Driver", content: "Synthesized from Step 3/4 data due to truncated AI response.", data: [...existing5, ...synthesized5] };
        analysis.steps.push(newStep5);
        step5 = newStep5;
      }
      console.warn(`[partial-recovery] Step 5 synthesized ${synthesized5.length} records from Step 3/4 friction data. Post-processor will recalculate.`);
    }
  }

  if (!step5) step5 = analysis.steps.find((s: any) => s.step === 5 && s.data?.length > 0);
  if (step5) {
    const step5Count = (step5.data as any[]).length;
    const step5IDs = (step5.data as any[]).map((r: any) => ({ ID: r.ID, "Use Case": r["Use Case"] }));

    const step6 = analysis.steps.find((s: any) => s.step === 6);
    const step6Data = step6?.data as any[] | undefined;
    const step6Valid = step6Data && step6Data.length >= step5Count &&
      step6Data.every((r: any) => r.ID && (r["Organizational Capacity"] !== undefined || r["Readiness Score"] !== undefined));

    if (!step6Valid) {
      const existingIDs = new Set((step6Data || []).filter((r: any) => r.ID && r["Organizational Capacity"] !== undefined).map((r: any) => r.ID));
      const synthesized6 = step5IDs
        .filter(s5 => !existingIDs.has(s5.ID))
        .map(s5 => ({
          ...s5,
          "Organizational Capacity": 5,
          "Data Availability & Quality": 5,
          "Technical Infrastructure": 5,
          "Governance": 5,
          "Time-to-Value (months)": 6,
          "Input Tokens/Run": 800,
          "Output Tokens/Run": 800,
          "Runs/Month": 1000,
          "Monthly Tokens": 1600000,
        }));
      if (synthesized6.length > 0) {
        if (step6) {
          const validExisting = (step6Data || []).filter((r: any) => r.ID && r["Organizational Capacity"] !== undefined);
          step6.data = [...validExisting, ...synthesized6];
        } else {
          analysis.steps.push({
            step: 6,
            title: "Readiness & Token Modeling",
            content: "",
            data: synthesized6,
          });
        }
        console.warn(`[partial-recovery] Step 6 incomplete (${step6Data?.length ?? 0}/${step5Count}) — added ${synthesized6.length} records with conservative defaults.`);
      }
    }

    const step7 = analysis.steps.find((s: any) => s.step === 7);
    const step7Data = step7?.data as any[] | undefined;
    const step7Count = step7Data?.length ?? 0;

    if (step7Count < step5Count) {
      const existingIDs = new Set((step7Data || []).map((r: any) => r.ID));
      const missing = step5IDs.filter(s5 => !existingIDs.has(s5.ID));
      if (missing.length > 0) {
        if (step7) {
          step7.data = [...(step7Data || []), ...missing];
        } else {
          analysis.steps.push({
            step: 7,
            title: "Priority Scoring & Roadmap",
            content: "",
            data: missing,
          });
        }
        console.warn(`[partial-recovery] Step 7 incomplete (${step7Count}/${step5Count}) — added ${missing.length} records from Step 5. Post-processor will compute priority scores.`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE PROMPT BUILDERS — per-call system prompts
// ═══════════════════════════════════════════════════════════════════

export function buildCall1SystemPrompt(): string {
  return `${SHARED_SYSTEM_IDENTITY}

${EPOCH_FRAMEWORK_DEFINITION}

${SHARED_VOICE_AND_TONE}

<confidence_flags>
Mark ALL non-verified information:
• [HIGH CONFIDENCE] - From SEC filings or official company sources
• [MEDIUM CONFIDENCE] - From reputable secondary sources
• [LOW CONFIDENCE] - Industry benchmark applied to specific company
• [ASSUMPTION] - Inference without direct evidence
• [ESTIMATED] - Calculated from partial data
• [DATED] - Information older than 18 months
</confidence_flags>

<output_methodology>
Execute Steps 0-2 of the analysis framework.

STEP 0: COMPANY OVERVIEW (Executive Intelligence Editor Format)

Write board-ready prose paragraphs. NO markdown, NO tables, NO bullet points, NO headers.

REQUIRED PARAGRAPH STRUCTURE:

Paragraph 1 - Company Identity (2-3 sentences):
Revenue scale, core business model, geographic and operational footprint. Lead with the defining fact.
Example: "Acme Corporation generates $4.2B in annual revenue from enterprise software solutions. The company operates from Austin, Texas with 8,500 employees across 12 global offices."

Paragraph 2 - Business Composition (1 paragraph):
Segment breakdown with revenue attribution. Key operational metrics (transaction volume, retention rates, processing spreads).
Example: "The company serves 2,400 enterprise clients across financial services (48% of revenue), healthcare (31%), and manufacturing (21%) sectors. Customer retention stands at 94% over the past three fiscal years. Average contract value reaches $175K with 2.3-year average duration."

Paragraphs 3-5 - Operational Pain Points (1 paragraph per category, max 3-4):
Group related challenges logically. For each: Quantified annual burden (dollars and hours), root cause mechanism, business impact (delays, competitive disadvantage, opportunity cost).
Example: "The company faces a $47M annual burden from manual compliance documentation. Legal teams spend 34,000 hours per year reviewing and updating regulatory filings across 47 jurisdictions. This workload creates a 23-day backlog on routine inquiries and diverts senior attorneys from strategic advisory work."

Final Paragraph - Sources & Assumptions (1 brief paragraph):
Data origins (10-K filings, earnings releases, industry benchmarks). Labor rate assumptions. Data maturity assessment basis.
Example: "Financial figures derive from 2024 10-K filings and Q3 earnings releases. Operational burden estimates apply industry-standard $150/hour fully-loaded rates for professional staff. Data maturity assessed at Level 2 based on disclosed technology investments and governance statements."

FORMATTING RULES:
- NO markdown syntax (no **, no #, no |, no ---, no bullets)
- NO tables in this section—use prose to convey scale metrics
- NO emoji or special characters
- ONLY flowing prose paragraphs separated by line breaks
- Maximum 5-6 sentences per paragraph
- Lead with insight, follow with evidence
- Active voice only

STEP 1: STRATEGIC ANCHORING & BUSINESS DRIVERS
- Map EXACTLY 5 strategic themes to business drivers, ranked by total financial impact (highest first)
- Define current state → target state for each with quantified metrics
- Ground in specific P&L/balance sheet lines
- Each theme must map to exactly 2 KPIs and 2 use cases
- Financially quantify each theme (sum of associated use case benefits)
- These 5 themes are the CONNECTIVE TISSUE for the entire report — every item in Steps 2-7 must link back to one of these themes
Table columns: Strategic Theme, Current State, Target State, Primary Driver Impact, Secondary Driver

STEP 2: BUSINESS FUNCTION INVENTORY & KPI BASELINES
- EXACTLY 10 KPI baselines (2 per strategic theme from Step 1, one for each of the 10 friction points you will generate in Step 3)
- Each KPI must link to one of the 5 Strategic Themes from Step 1 via a "Strategic Theme" column
- Provide THREE benchmark tiers for each KPI:
  * "Benchmark (Avg)" — Industry average for this KPI among peers
  * "Benchmark (Industry Best)" — Top quartile / best-in-class within the specific industry
  * "Benchmark (Overall Best)" — Best-of-breed across ALL industries for this business function
  Include the numeric value and a brief source/context label (e.g., "82% (top quartile retail)")
- VERIFIABLE CITATIONS (MANDATORY): For EVERY benchmark tier you report, you MUST also populate a "Benchmark Sources" object on the row with one entry per tier you provided ("avg", "industryBest", "overallBest"). Each entry MUST contain:
  * "publisher" — the issuing organization (e.g., "MGMA", "Federal Reserve", "U.S. Bureau of Labor Statistics", "McKinsey & Company", "Gartner", "CAQH")
  * "title" — the report or dataset title
  * "year" — the publication year (integer)
  * "url" — the source link, governed by the STRICT URL SOURCING RULES below
  * "label" — the short context label matching the value (e.g., "top quartile health systems")
  * "evidenceText" — (optional) a short note on where the figure came from
- STRICT URL SOURCING RULES — web search is ENABLED for this step. Follow these EXACTLY for every "url":
  1. ZERO URL HALLUCINATION: Under no circumstances generate, guess, construct, or recall a URL from your training data or memory. Do not assemble a URL from a publisher's name or brand.
  2. SEARCH-GROUNDED ONLY: Include a "url" ONLY if you retrieved it directly from a live web search result during THIS session. Copy the URL EXACTLY as it appears in the search result — character for character.
  3. SPEED & LIMITS (TIME-BOXING): Use at most TWO web searches per KPI. When a source you already found applies to another KPI or tier, reuse it instead of searching again. Do not go down a rabbit hole.
  4. EXPLICIT FALLBACK: If you find the benchmark data but cannot retrieve a clear, direct, complete URL within two searches, DO NOT guess. Omit the "url" field for that tier and set "evidenceText": "Source found via search, but direct URL unavailable." (still provide "publisher", "title", and "label").
  5. DOMAIN FILTERING: Prioritize highly reputable domains — government statistics, regulatory filings, recognized industry associations, peer-reviewed research, and major analyst/consulting firms (e.g., Gartner, McKinsey, Forrester, Harvard Business Review) or official company press rooms. The link MUST point to the specific report, article, or dataset page — NEVER a generic homepage.
- Mark extrapolated data as [ESTIMATED] — and when a tier is [ESTIMATED], reflect that in its source "label" (e.g., "[ESTIMATED] analyst extrapolation"), omit the "url", and set "evidenceText" accordingly.
- After you have completed all web searches, output ONLY the JSON object specified below — no preamble, commentary, reasoning, or markdown fences.
- FUNCTION/SUB-FUNCTION CONSTRAINT: You MUST use Function and Sub-Function values from the standardized taxonomy provided. Map company-specific terminology to the nearest canonical function. Standard functions include: Sales, Marketing, Finance, Operations, Human Resources, Information Technology, Customer Service, Legal & Compliance, Supply Chain, Product Management, Digital Commerce, Merchandising, Logistics. Each has defined Sub-Functions — use only those sub-function labels.
Table columns: KPI Name, Function, Sub-Function, Baseline Value, Direction (↑/↓), Target Value, Benchmark (Avg), Benchmark (Industry Best), Benchmark (Overall Best), Timeframe, Strategic Theme
</output_methodology>

${SHARED_FORMATTING}

${SHARED_JSON_INSTRUCTION}

OUTPUT FORMAT:
{
  "companyOverview": {
    "annualRevenue": 0,
    "totalEmployees": 0,
    "position": "What they do in 10 words or fewer. Market position. 2-3 scale metrics.",
    "frictionTable": {
      "rows": [
        { "domain": "Area 1", "annualBurden": "$XXM / XX,000 hours", "strategicImpact": "5-8 word strategic impact" },
        { "domain": "Area 2", "annualBurden": "$XXM / XX,000 hours", "strategicImpact": "5-8 word strategic impact" },
        { "domain": "Area 3", "annualBurden": "$XXM / XX,000 hours", "strategicImpact": "5-8 word strategic impact" }
      ]
    },
    "dataReadiness": {
      "currentState": "Level X — one sentence explaining what this means for implementation",
      "keyGaps": "Specific gaps that affect AI deployment readiness"
    },
    "whyNow": "1-2 sentences connecting company position to AI opportunity."
  },
  "steps": [
    {"step": 0, "title": "Company Overview", "content": "...", "data": null},
    {"step": 1, "title": "Strategic Anchoring & Business Drivers", "content": "brief intro", "data": [{"Strategic Theme": "...", "Primary Driver Impact": "...", "Secondary Driver": "...", "Current State": "...", "Target State": "..."}]},
    {"step": 2, "title": "Business Function Inventory & KPI Baselines", "content": "...", "data": [{"Function": "...", "Sub-Function": "...", "KPI Name": "...", "Baseline Value": "...", "Industry Benchmark": "...", "Target Value": "...", "Direction": "↑/↓", "Timeframe": "...", "Measurement Method": "...", "Benchmark (Avg)": "...", "Benchmark (Industry Best)": "...", "Benchmark (Overall Best)": "...", "Benchmark Sources": {"avg": {"publisher": "MGMA", "title": "Provider Compensation & Productivity Report", "year": 2025, "url": "https://www.mgma.com/data", "label": "national average"}, "industryBest": {"publisher": "...", "title": "...", "year": 2025, "url": "https://...", "label": "top quartile health systems"}, "overallBest": {"publisher": "...", "title": "...", "year": 2024, "url": "https://...", "label": "cross-industry best-in-class"}}, "Strategic Theme": "..."}]}
  ]
}`;
}

function buildCall2SystemPrompt(): string {
  return `${SHARED_SYSTEM_IDENTITY}

${EPOCH_FRAMEWORK_DEFINITION}

${SHARED_VOICE_AND_TONE}

<ai_primitives>
Map all use cases to these six STANDARDIZED capabilities. Use ONLY these exact labels:
1. Research & Information Retrieval — RAG, semantic search, multi-source synthesis, knowledge lookup, document discovery
2. Content Creation — documents, reports, communications, template-based generation, product descriptions
3. Data Analysis — pattern recognition, anomaly detection, classification, extraction, scoring, forecasting, prediction
4. Conversational Interfaces — multi-turn dialogue, intent routing, voice/text, chatbots, virtual assistants
5. Workflow Automation — agentic orchestration, tool use, conditional logic, process automation, routing, approval flows
6. Coding Assistance — code generation, documentation, refactoring, legacy modernization, test generation
List 2-3 most relevant primitives per use case, separated by commas. Use the EXACT names above.
</ai_primitives>

<output_methodology>
Generate Steps 3-4 of the analysis framework.

STEP 3: FRICTION POINT MAPPING
- EXACTLY 10 operational bottlenecks (one for each KPI from Step 2, one for each use case in Step 4)
- Quantify annual cost using fully-loaded labor rates
- Rate severity: Critical/High/Medium
- Each friction point must link to one of the 5 Strategic Themes from Step 1 via a "Strategic Theme" column
- FUNCTION/SUB-FUNCTION CONSTRAINT: Use the SAME standardized Function and Sub-Function labels as Step 2. The Function/Sub-Function for a friction point MUST correspond to a Function/Sub-Function that has a KPI in Step 2.
- FRICTION TYPE CLASSIFICATION: Classify each friction point into exactly one "Friction Type" category. MUST be one of these exact labels:
  * "Process Friction" — Manual steps, handoffs, approval bottlenecks, redundant workflows
  * "Data Friction" — Quality issues, availability gaps, data silos, inconsistent formats
  * "Technology Friction" — Legacy systems, integration gaps, tool limitations, scalability constraints
  * "Knowledge Friction" — Expertise gaps, training needs, institutional knowledge loss, documentation debt
- STANDARDIZED ROLES REQUIREMENT: For each friction point, assign the most appropriate role from the standardized roles list provided below. Use the exact role name (capitalization and format must match EXACTLY). Use the corresponding loaded hourly rate from the standardized table.
${getStandardizedRolesPromptText()}
Table columns: Friction Point, Friction Type, Function, Sub-Function, Estimated Annual Cost ($), Severity (Critical/High/Medium), Primary Driver Impact, Strategic Theme

STEP 4: AI USE CASE GENERATION
Generate EXACTLY 10 use cases that:
✓ RESHAPE business processes (not just accelerate)
✓ Map to 2-3 AI primitives using ONLY the 6 standardized labels: Research & Information Retrieval, Content Creation, Data Analysis, Conversational Interfaces, Workflow Automation, Coding Assistance
✓ CRITICAL 1:1:1 MAPPING CONSTRAINT:
  - Each Use Case MUST target exactly ONE Friction Point from Step 3 via the "Target Friction" column
  - Each Friction Point from Step 3 MUST be targeted by exactly ONE Use Case
  - The "Target Friction" value MUST exactly match a "Friction Point" value from Step 3
  - No two Use Cases may share the same "Target Friction"
  - All 10 friction points must be addressed — no gaps
✓ Include mandatory Human-in-the-Loop checkpoints
✓ Span minimum 5 different business functions
✓ Prioritize back-office over customer-facing
✓ Each use case must link to one of the 5 Strategic Themes from Step 1 via a "Strategic Theme" column
✓ FUNCTION/SUB-FUNCTION CONSTRAINT: Use the SAME standardized Function and Sub-Function labels as Steps 2 and 3. The Function/Sub-Function for a use case MUST match the friction point it targets.
✓ AGENTIC DESIGN PATTERN: For each use case, recommend a PRIMARY agentic pattern and an ALTERNATIVE pattern.
  Available patterns (single-agent): Reflection, Tool Use, Planning, ReAct Loop, Prompt Chaining, Semantic Router, Constitutional Guardrail
  Available patterns (multi-agent): Orchestrator-Workers, Agent Handoff, Parallelization, Generator-Critic, Group Chat
  For each use case, choose the BEST-FIT primary pattern and a viable alternative. Consider complexity, cost, and time-to-value tradeoffs.
✓ AGENTIC PATTERN ID: Also provide a lowercase underscore-format ID for the Primary Pattern using this exact mapping:
  "Reflection" → "reflection", "Tool Use" → "tool_use", "Planning" → "planning", "ReAct Loop" → "react",
  "Prompt Chaining" → "planning", "Semantic Router" → "planning", "Constitutional Guardrail" → "reflection",
  "Orchestrator-Workers" → "orchestrator_worker", "Agent Handoff" → "agent_handoff",
  "Parallelization" → "parallelization", "Generator-Critic" → "generator_critic", "Group Chat" → "group_chat"
✓ PATTERN RATIONALE: Provide a 2-3 sentence explanation for why the selected primary agentic pattern is the best fit; mention the alternative as a viable option
✓ EPOCH FLAGS: For each use case, evaluate all five EPOCH dimensions (Empathy, Presence, Opinion, Creativity, Hope) and provide as a JSON object with boolean values indicating whether that human capability is significantly required (e.g., { "E": true, "P": false, "O": true, "C": false, "H": false })
✓ DESIRED OUTCOMES: List 3-5 specific, measurable business outcomes expected (as a JSON array of strings)
✓ DATA TYPES: List the types of data this use case processes (as a JSON array). Use ONLY these labels: "Structured", "Semi-structured", "Unstructured", "Real-time"
✓ INTEGRATIONS: List 2-5 specific enterprise systems/tools that need integration (as a JSON array, e.g., ["Salesforce CRM", "SAP ERP", "Slack"])
Table columns: ID, Use Case Name, Description, Target Friction, AI Primitives, Human-in-the-Loop Checkpoint, Function, Sub-Function, Strategic Theme, Primary Pattern, Alternative Pattern, Pattern Rationale, Agentic Pattern, EPOCH Flags, Desired Outcomes, Data Types, Integrations
</output_methodology>

${SHARED_FORMATTING}

${SHARED_FORBIDDEN}

${SHARED_JSON_INSTRUCTION}

OUTPUT FORMAT:
{
  "steps": [
    {"step": 3, "title": "Friction Point Mapping", "content": "...", "data": [{"Function": "...", "Sub-Function": "...", "Friction Point": "...", "Friction Type": "Process Friction|Data Friction|Technology Friction|Knowledge Friction", "Severity": "Critical/High/Medium", "Primary Driver Impact": "...", "Estimated Annual Cost ($)": "...", "Strategic Theme": "..."}]},
    {"step": 4, "title": "AI Use Case Generation", "content": "...", "data": [{"ID": "UC-01", "Use Case Name": "...", "Function": "...", "Sub-Function": "...", "AI Primitives": "...", "Primary Pattern": "Tool Use", "Alternative Pattern": "ReAct Loop", "Pattern Rationale": "...", "Agentic Pattern": "tool_use", "EPOCH Flags": { "E": true, "P": false, "O": true, "C": false, "H": false }, "Description": "...", "Target Friction": "...", "Human-in-the-Loop Checkpoint": "...", "Strategic Theme": "...", "Desired Outcomes": ["..."], "Data Types": ["Structured", "Unstructured"], "Integrations": ["System 1", "System 2"]}]}
  ]
}`;
}

function buildCall3SystemPrompt(): string {
  return `${SHARED_SYSTEM_IDENTITY}

${EPOCH_FRAMEWORK_DEFINITION}

${SHARED_VOICE_AND_TONE}

<business_value_drivers>
Quantify ALL use cases across four drivers with EXPLICIT FORMULAS:

1. GROW REVENUE
   Formula: (Volume × Value × Rate_Improvement) × 0.95 × Maturity_Factor × P(Success)
   - Cap rate improvement claims at 30%
   - Require market validation for new revenue streams

2. REDUCE COST
   Formula: (Hours_Saved × Hourly_Rate × Adoption_Rate) × 0.90 × Maturity_Factor × P(Success)
   Hourly rates: Executive $250/hr, Senior $150/hr, Professional $100/hr, Admin $50/hr
   - Apply 1.35× benefits loading factor for employer on-costs (taxes, benefits, overhead)
   - Cap Year 1 adoption at 80%
   - Never claim headcount reduction, only productivity gains

3. INCREASE CASH FLOW
   Formula: AnnualRevenue × (Days_Reduced / 365) × Cost_of_Capital × 0.85 × Maturity_Factor
   - Use company WACC or 8% default for cost of capital
   - This calculates the financing cost saved by releasing working capital
   - Example: $365M revenue, 15-day DSO improvement → $15M freed × 8% = $1.2M annual benefit

4. DECREASE RISK
   Formula: (P(Event) × Expected_Loss × Risk_Reduction) × 0.80 × Maturity_Factor × P(Success)
   - Cap risk reduction claims at 50% of current exposure
</business_value_drivers>

### CRITICAL NUMERIC BOUNDS — NEVER EXCEED
These bounds are enforced by our deterministic post-processor. Your formulas must stay within them:
- **Hours Saved per use case**: MUST be sourced from Step 3 friction data. Never exceed the "Annual Hours" value from the matching Step 3 friction point. Absolute max: 50,000 hours.
- **Loaded Hourly Rate**: $35 – $250 per hour.
- **Revenue Uplift %**: 0.05% to 0.3% of company revenue maximum per use case.
- **Days Improvement**: 1–5 days of DSO improvement maximum, not 10+.
- **Risk Reduction**: 2% to 5% of the stated risk pool maximum per use case. Never higher.
- **Risk Exposure**: Maximum 10% of company annual revenue per use case.
- **Cost Savings**: Equivalent of 2–10 FTEs per use case (4,000–20,000 hours), not 50+ FTEs.
- **Per-Use-Case Cap**: No single use case total may exceed $10M or 0.5% of company annual revenue (whichever is lower).
- **Portfolio Cap**: Total benefits across all 10 use cases must be 1–3% of company annual revenue.
- **Probability of Success**: 0.40 to 0.70 range — never higher.

### WRONG vs RIGHT EXAMPLE
**WRONG** (hallucinated input): "420M hours × $150/hr × 0.55 × 0.90 × 0.75 = $23.6B"
  - 420M hours is impossible. No single process has 420 million annual hours.
  - The Step 3 friction data showed 28,000 annual hours for this friction point.

**RIGHT** (sourced from Step 3): "28,000 hours × $150/hr × 0.55 × 0.90 × 0.75 = $1.56M"
  - Hours match Step 3 data exactly. Result is plausible for a single use case.

Always cross-reference your formula inputs against Step 3 data. If Step 3 says a friction point has 28,000 annual hours, your Step 5 formula MUST use ≤28,000 hours, not 420M.

<conservative_estimation_framework>
═══════════════════════════════════════════════════════════════════
MANDATORY REDUCTIONS - APPLY TO ALL CALCULATIONS
═══════════════════════════════════════════════════════════════════

| Benefit Type | Reduction | Multiply By |
|--------------|-----------|-------------|
| Revenue | 5% | ×0.95 |
| Cost | 10% | ×0.90 |
| Cash Flow | 15% | ×0.85 |
| Risk | 20% | ×0.80 |

DATA MATURITY ADJUSTMENTS (apply AFTER base reductions):

| Level | Description | Additional Multiplier |
|-------|-------------|----------------------|
| 1 | Ad-hoc (scattered, no governance) | ×0.60 |
| 2 | Repeatable (some processes) | ×0.75 ← DEFAULT IF UNKNOWN |
| 3 | Defined (documented, some automation) | ×0.85 |
| 4 | Managed (measured, controlled) | ×0.95 |
| 5 | Optimizing (continuous improvement) | ×1.00 |

ROUNDING RULES:
- Round DOWN all benefit figures to nearest $100K
- Round UP all effort and timeline estimates to nearest month

FORMULA REQUIREMENT:
Show explicit calculation for EVERY financial figure with × symbols visible.
</conservative_estimation_framework>

<total_benefits_cap>
CRITICAL GUARDRAIL — REVENUE-RELATIVE CAP:
Total annual benefits across ALL 10 use cases MUST target 1–3% of the company's annual revenue.
Maximum hard ceiling: 3% of annual revenue. This is a Tier-1 management consulting standard.

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
an overestimate that destroys it. When in doubt, go lower.

CROSS-USE-CASE VALIDATION:
Before finalizing output, verify:
□ Total benefits across all use cases ≤ 3% of company annual revenue
□ Total revenue benefits across all use cases ≤ 1% of company annual revenue
□ Total FTE hours saved ≤ 10% of estimated total workforce hours
□ No single use case claims more than 0.5% of total company revenue
□ Cash flow benefits use working capital × cost of capital (NOT days × daily revenue)
</total_benefits_cap>

<output_methodology>
Generate Step 5 of the analysis framework.

STEP 5: BENEFITS QUANTIFICATION BY DRIVER
ALL 4 benefit types MUST use these EXACT standardized variable structures:
- Cost: Hours Saved × Loaded Hourly Rate × Benefits Loading (1.35) × Adoption Rate × Data Maturity
- Revenue: Revenue Uplift % × Revenue at Risk × Realization Factor × Data Maturity
- Cash Flow: Annual Revenue × (Days Improved / 365) × Cost of Capital × Realization Factor
- Risk: Risk Reduction % × Risk Exposure × Realization Factor × Data Maturity

CRITICAL INSTRUCTION FOR BENEFITS QUANTIFICATION:

You are generating financial benefit estimates that will be presented to C-suite executives and CFOs.
Your estimates MUST be conservative, defensible, and credible.

Rules:
- No single use case should produce more than $10M in total annual value
- Revenue uplift percentages should be 0.05% to 0.3% — not higher
- Risk reduction should be 2% to 5% of the risk pool — not higher  
- Cost savings should reflect realistic FTE reductions (2-10 FTEs per use case, not 50+)
- Cash flow improvements should assume 1-3 days of DSO improvement, not 10+
- Hours saved per friction point should be 5,000-40,000 annually, not 100,000+
- The total portfolio value across all 10 use cases should be 1-3% of company revenue
- Probability of Success should range from 0.40-0.75

Think of it this way: if a CFO saw these numbers, would they nod in agreement or laugh you out of the room? Aim for the nod.

When in doubt, go lower. An underestimate that gets approved is infinitely more valuable than an overestimate that destroys credibility.

IMPORTANT:
- Cost formulas MUST use the role-specific Loaded Hourly Rate from Step 3 (NOT a flat $150/hr)
- Apply conservative reductions: Revenue Realization ×0.95, Cost Adoption ×0.90, Cash Flow Realization ×0.85, Risk Realization ×0.80
- Data Maturity default: ×0.75 (Level 2)
- Round DOWN to nearest $100K
- Include "Probability of Success" (0.50-0.95) for each use case
- Total Annual Value = Cost + Revenue + Cash Flow + Risk (before probability weighting)
- Each use case must include a "Strategic Theme" column linking to Step 1

ALSO provide structured formula labels for each formula type as JSON arrays:
- "Cost Formula Labels": {"components": [{"label": "Hours Saved", "value": 28000}, {"label": "Loaded Hourly Rate", "value": 150}, {"label": "Benefits Loading", "value": 1.35}, {"label": "Adoption Rate", "value": 0.90}, {"label": "Data Maturity", "value": 0.75}]}
- "Revenue Formula Labels": {"components": [{"label": "Revenue Uplift %", "value": 0.15}, {"label": "Revenue at Risk", "value": 190000000}, {"label": "Realization Factor", "value": 0.95}, {"label": "Data Maturity", "value": 0.75}]}
- "Cash Flow Formula Labels": {"components": [{"label": "Annual Revenue", "value": 500000000}, {"label": "Days Improved", "value": 12}, {"label": "Cost of Capital", "value": 0.08}, {"label": "Realization Factor", "value": 0.85}]}
- "Risk Formula Labels": {"components": [{"label": "Risk Reduction %", "value": 0.15}, {"label": "Risk Exposure", "value": 6000000}, {"label": "Realization Factor", "value": 0.80}, {"label": "Data Maturity", "value": 0.75}]}

Table columns: ID, Use Case, Revenue Benefit ($), Revenue Formula, Revenue Formula Labels, Cost Benefit ($), Cost Formula, Cost Formula Labels, Cash Flow Benefit ($), Cash Flow Formula, Cash Flow Formula Labels, Risk Benefit ($), Risk Formula, Risk Formula Labels, Total Annual Value ($), Probability of Success (0-1), Strategic Theme

CRITICAL - Each formula string MUST show the calculation with × symbols:
- "Revenue Formula": Example: "15% lift × $190M pipeline × 0.95 × 0.75 = $20.3M"
- "Cost Formula": Example: "28,000 hours × $50/hr × 1.35 × 0.90 × 0.75 = $1.2M"
- "Cash Flow Formula": Example: "$500M revenue × (12 / 365) × 0.08 × 0.85 = $200K"
- "Risk Formula": Example: "15% reduction × $6M exposure × 0.80 × 0.75 = $540K"
NOTE: Do NOT repeat the result after an arrow (→). Show only: "formula = $result". Not "formula = $result → $result".
</output_methodology>

${SHARED_FORMATTING}

${SHARED_FORBIDDEN}

${SHARED_JSON_INSTRUCTION}

OUTPUT FORMAT:
{
  "steps": [
    {"step": 5, "title": "Benefits Quantification by Driver", "content": "...", "data": [{"ID": "UC-01", "Use Case": "...", "Revenue Benefit ($)": "...", "Revenue Formula": "...", "Revenue Formula Labels": {...}, "Cost Benefit ($)": "...", "Cost Formula": "...", "Cost Formula Labels": {...}, "Cash Flow Benefit ($)": "...", "Cash Flow Formula": "...", "Cash Flow Formula Labels": {...}, "Risk Benefit ($)": "...", "Risk Formula": "...", "Risk Formula Labels": {...}, "Total Annual Value ($)": "...", "Probability of Success": 0.75, "Strategic Theme": "..."}]}
  ]
}`;
}

function buildCall4SystemPrompt(): string {
  return `${SHARED_SYSTEM_IDENTITY}

${EPOCH_FRAMEWORK_DEFINITION}

<output_methodology>
Generate Steps 6-7 + executiveSummary + summary.

STEP 6: READINESS & TOKEN MODELING (Value-Readiness Matrix v2.1)
Score each use case on FOUR readiness components (1-10 scale each) using BARS-anchored levels (1, 3, 5, 7, 10) with interpolation:
1. Organizational Capacity (BASELINE weight 35%) — Executive sponsorship, AI/ML talent depth, change-ready culture, structured AI training. Anchor 1=AI-naive (no sponsor, no budget); 3=Pilot-driven hero mode (one BU funds pilots, verbal exec interest); 5=Programmed-but-federated (named C-level sponsor, ExCo-approved strategy, staffed CoE 20-50 FTE, role-based training reaching 30%+ of relevant staff); 7=Embedded-and-scaling (board-reviewed strategy, embedded ML engineers in product teams, defined career ladders, ML:DS ratio ≥1:1); 10=AI-native operating model (AI presumed in every product launch, comp frameworks include AI productivity).
2. Data Availability & Quality (BASELINE weight 30%) — Catalog/lineage coverage, data quality SLAs, contracts, RAG infrastructure. Anchor 1=Siloed/opaque (no catalog, no labeled data); 3=Centralized but raw (lakehouse exists, catalog <50% coverage, naive RAG); 5=Governed and domain-owned (named data product owners, ≥70% Tier-1 metadata, monitored DQ SLAs, data contracts on ≥1 critical interface, RBAC+PII classification, standardized embeddings); 7=Mesh-mature, RAG-industrialized (federated mesh, contracts on every cross-domain interface, enterprise feature store powering ≥3 production ML systems); 10=AI-optimized data platform (production observability over structured+unstructured+embeddings+prompts, drift detection, PETs in production).
3. AI-Specific Governance (BASELINE weight 20%) — Standing committee, model risk tiering, EU AI Act/NIST AI RMF alignment. Anchor 1=Unaware (no policy, no inventory); 3=Policy on paper (Responsible AI policy published, informal ethics committee); 5=Active governance function (chartered standing committee meeting monthly, mandatory pre-build intake with risk classification, centralized inventory inc. vendor/embedded AI, model risk tiering drives validation depth, model cards/datasheets, fairness testing, AI incident response playbook); 7=Operationalized & auditable (independent model validation, NIST AI RMF mapped to controls with auto-evidence, EU AI Act conformity assessment, bias pipelines on every release); 10=Embedded & adaptive (policy-as-code at platform layer, real-time bias-drift/jailbreak/prompt-injection detection with auto-rollback).
4. Technical Infrastructure (BASELINE weight 15%) — MLOps maturity, AI gateway, vector DB, LLMOps. Anchor 1=Notebook on a laptop (no registry, no monitoring, personal API keys); 3=Pilot stack, manual glue (experiment tracker, managed ML platform, one FM API procured centrally, 1-2 production models deployed manually); 5=Standardized MLOps (model registry with promotion gates, CI/CD for training/validation/deployment, canary/shadow deploys, feature store ≥1 production model, drift detection, centralized AI gateway, LLMOps tracing); 7=Production-grade MLOps & LLMOps (continuous training, champion-challenger, multi-region blue/green, FMs fine-tuned in production with monitoring, eval pipelines per release, enterprise vector DB with hybrid search & re-ranking); 10=AI-native platform (self-service templated landing zone, multi-cluster GPU orchestration, mature agent infrastructure with tool registries and end-to-end traces).

Boundary discipline: 3 vs 6 is the line between "project" and "function". A 3 = a pilot lives in pockets; a 6 = the capability is enterprise-funded, named-owner, standing cadence with measured outcomes.

CRITICAL — SCORE WITH CONVICTION, DO NOT CLUSTER AT 4–5: The four readiness components must be scored against the BARS rubric anchors above using *evidence from the company's own disclosures, filings, and public engineering posture*, not "safe-middle" defaults. An empirical pattern across reports has been every component landing in the 3–5 band, which is statistically implausible and produces a Foundation-only matrix that delivers zero prototyping value to the executive reader.

  RULES:
  (a) Read each anchor (1 / 3 / 5 / 7 / 10) and place the company at the *closest* anchor based on cited evidence. Interpolate to 2, 4, 6, 8, or 9 only when evidence sits cleanly between two anchors.
  (b) Across a portfolio of 8–12 use cases, the *median* readiness component score should land at or above 5 for any company with disclosed AI/data investment, executive sponsorship, or production ML/LLM systems. A median below 4 is only credible for an AI-naive enterprise with no disclosed capability — defend it explicitly in step content.
  (c) Per-use-case heterogeneity matters: a company strong in data but weak in governance should produce different per-component scores per use case (because different use cases stress different components). Identical 4-4-4-4 vectors across all use cases are a tell of lazy scoring and are forbidden.
  (d) When a use case has clear enabling capability (e.g. customer-service GenAI in a company that already runs an AI gateway with LLMOps tracing → Tech Infra ≥ 7; clinical decision support in a regulated firm with a chartered AI governance committee → Governance ≥ 6), score it that high without hedging. The downstream HF-graded engine will compute the weighted Readiness Score; under-scoring inputs collapses Champions and Quick Wins to zero.
  (e) Conversely, do NOT inflate scores to manufacture Champions. Document the evidence inline in the step content for any score ≥ 7.

ALSO emit intake / knock-out fields (VRM v2.1 — hard knock-outs send to Foundation; soft blockers flag remediation but do NOT block prototyping):
- "Has Named Sponsor": true/false/null (true ONLY if a specific executive sponsor for THIS use case is named in the intake. Use false if explicitly absent. Use null if intake is silent — this surfaces as an intake-incomplete soft blocker.)
- "Data Available For Engagement": true/false/null (true if the required data is currently accessible within the engagement timeline. false if a data-access sprint is required. null if intake is silent.)
- "Time-to-Pilot (weeks)": integer (weeks until first running pilot in production-like env). Soft blocker if > 16 weeks (sequencing concern, not a knock-out).
- "Legally Prohibited": true/false (HARD knock-out — true ONLY when the use case is unambiguously banned in the client's jurisdiction by a current regulator. Default false.)
- "Technically Infeasible": true/false (HARD knock-out — true ONLY when the state-of-the-art cannot deliver this use case at production quality today. Default false.)
- Estimate monthly runs and token consumption
- Round UP time-to-value estimates
- Flag prerequisite work NOT in timeline
- Each use case must include a "Strategic Theme" column linking to Step 1
- REQUIRED FIELD: Time-to-Value (months) is MANDATORY for every use case. Cannot be empty or null.
Table columns: ID, Use Case, Organizational Capacity, Data Availability & Quality, Technical Infrastructure, Governance, Has Named Sponsor, Data Available For Engagement, Time-to-Pilot (weeks), Legally Prohibited, Technically Infeasible, Monthly Tokens, Runs/Month, Input Tokens/Run, Output Tokens/Run, Time-to-Value (months) [REQUIRED], Strategic Theme
NOTE: The postprocessor computes Readiness Score using sector-preset weights (default baseline = 35/30/20/15). Do NOT compute Readiness Score yourself.

STEP 7: PRIORITY SCORING & VRM v2.1 ROADMAP
The postprocessor applies the VRM v2.1 three-layer hybrid quadrant logic deterministically:
- Value Score is computed via log10-transformed min-max normalization of (Expected Value × Probability of Success ÷ Friction Annual Cost) across the portfolio (1–10 scale).
- Layer 1 (hard floors → Foundation): Legally Prohibited OR Technically Infeasible OR (Value Score < 4.0 AND absolute annual value < $500K). Both value conditions must fail to knock out.
- Layer 1 soft blockers (do NOT relegate to Foundation; surface as remediation): no named sponsor, data not available (data-access sprint required, default 6 weeks), time-to-pilot > 16 weeks (sequencing concern).
- Layer 2 (default quadrants): Champion (V≥7.5 AND R≥7.5); Strategic (V≥7.5 AND R≥6.0); Quick Win (V≥6.0 AND R≥7.5); else Foundation.
- Layer 3 (Conditional Champion): only if zero Champions AND zero Quick Wins AND zero Strategic exist in the portfolio, top composite-scored item(s) above hard floor are promoted with named gaps, soft-blocker remediation, and a 4–12 week readiness sprint sized to the gap.
- Each use case must include a "Strategic Theme" column linking to Step 1
Table columns: ID, Use Case, Priority Tier, Recommended Phase (Phase 1 / Phase 2 / Phase 3 / Phase 4), Priority Score, Readiness Score, Value Score, TTV Score, Strategic Theme

SPEED OPTIMIZATION: For Step 7, only output the ID and Use Case name. Priority scores, readiness scores, tiers, phases, and quadrant assignments will be computed deterministically by the post-processor. Do NOT waste tokens computing Step 7 scores.
</output_methodology>

${SHARED_FORMATTING}

${SHARED_JSON_INSTRUCTION}

OUTPUT FORMAT:
{
  "steps": [
    {"step": 6, "title": "Readiness & Token Modeling", "content": "...", "data": [{"ID": "UC-01", "Use Case": "...", "Organizational Capacity": 7, "Data Availability & Quality": 6, "Technical Infrastructure": 5, "Governance": 4, "Time-to-Value (months)": 6, "Input Tokens/Run": 800, "Output Tokens/Run": 800, "Runs/Month": 1000, "Monthly Tokens": 1600000, "Strategic Theme": "..."}]},
    {"step": 7, "title": "Priority Scoring & Roadmap", "content": "...", "data": [{"ID": "UC-01", "Use Case": "..."}]}
  ],
  "executiveSummary": {
    "headline": "[Company] should execute [X] Critical-priority AI initiatives in Phase 1 and Phase 2 to capture $[Y]M in first-year value from a $[Z]M total opportunity.",
    "context": "2-4 sentences providing situation and complication.",
    "opportunityTable": {
      "rows": [
        { "metric": "Total Annual Value", "value": "$XX.XM" },
        { "metric": "Critical-Priority Initiatives", "value": "X" },
        { "metric": "First-Year Impact", "value": "$XX.XM" },
        { "metric": "Value per 1M Tokens", "value": "$XX,XXX" }
      ]
    },
    "findings": [
      { "title": "Verb-led insight title", "body": "2-3 sentences with specific numbers.", "value": "$X.XM annually" },
      { "title": "Second verb-led insight title", "body": "2-3 sentences.", "value": "$X.XM annually" },
      { "title": "Third verb-led insight title", "body": "2-3 sentences.", "value": "$X.XM annually" }
    ],
    "criticalPath": "2-3 sentences on prerequisites and dependencies.",
    "recommendedAction": "Specific next step with timeline."
  },
  "summary": "Plain text fallback summary (250-350 words). First sentence states the recommendation with total value."
}`;
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE CONTEXT BUILDERS — user prompts for each call
// ═══════════════════════════════════════════════════════════════════

export function buildCall1UserPrompt(companyName: string, documentSection: string): string {
  return `Generate Steps 0-2 of the BlueAlly AI Strategic Assessment for: **${companyName}**

Today's Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
${documentSection}
EXECUTION CHECKLIST:
✓ Research the company thoroughly (industry, size, revenue, challenges)
${documentSection ? "✓ Incorporate insights from the supplemental documents provided above" : ""}
✓ Generate EXACTLY 5 strategic themes and 10 KPIs (2 per theme)
✓ Mark confidence levels on all data

Return ONLY valid JSON. Start with { and end with }.`;
}

function buildCall2Context(companyName: string, companyOverview: any, step1Data: any[], step2Data: any[]): string {
  const themes = (step1Data || []).map((t: any) => ({
    theme: t["Strategic Theme"],
    driver: t["Primary Driver Impact"],
    secondary: t["Secondary Driver"],
  }));
  const kpis = (step2Data || []).map((k: any) => ({
    name: k["KPI Name"],
    function: k["Function"],
    subFunction: k["Sub-Function"],
    baseline: k["Baseline Value"],
    theme: k["Strategic Theme"],
  }));

  return `Company: ${companyName}
Annual Revenue: $${(companyOverview?.annualRevenue || 0).toLocaleString()}
Employees: ${companyOverview?.totalEmployees || 'Unknown'}

STRATEGIC THEMES FROM STEP 1:
${JSON.stringify(themes, null, 1)}

KPI BASELINES FROM STEP 2:
${JSON.stringify(kpis, null, 1)}

Generate Steps 3-4 aligned to these themes and KPIs.
CRITICAL: Ensure exactly 10 friction points and exactly 10 use cases with 1:1:1 mapping.
Each friction point must map to one KPI. Each use case must target exactly one friction point.
Return ONLY valid JSON. Start with { and end with }.`;
}

function buildCall3Context(companyName: string, companyOverview: any, step3Data: any[], step4Data: any[]): string {
  const frictions = (step3Data || []).map((f: any) => ({
    frictionPoint: f["Friction Point"],
    annualCost: f["Estimated Annual Cost ($)"],
    severity: f["Severity"],
    function: f["Function"],
    theme: f["Strategic Theme"],
    driverImpact: f["Primary Driver Impact"],
  }));
  const useCases = (step4Data || []).map((uc: any) => ({
    id: uc["ID"],
    name: uc["Use Case Name"] || uc["Use Case"],
    targetFriction: uc["Target Friction"],
    theme: uc["Strategic Theme"],
    function: uc["Function"],
  }));

  return `Company: ${companyName}
Annual Revenue: $${(companyOverview?.annualRevenue || 0).toLocaleString()}

FRICTION POINTS FROM STEP 3:
${JSON.stringify(frictions, null, 1)}

USE CASES FROM STEP 4:
${JSON.stringify(useCases, null, 1)}

Generate Step 5 (Benefits Quantification) for all 10 use cases.
CRITICAL: Source hours from Step 3 friction data. Total portfolio value should be 1-3% of annual revenue.
Each use case must have all 4 benefit formulas (Revenue, Cost, Cash Flow, Risk) with × symbols.
Include structured formula labels for each formula type.
Return ONLY valid JSON. Start with { and end with }.`;
}

function buildCall4Context(companyName: string, companyOverview: any, step4Data: any[], step5Data: any[]): string {
  const useCases = (step4Data || []).map((uc: any) => ({
    id: uc["ID"],
    name: uc["Use Case Name"] || uc["Use Case"],
    theme: uc["Strategic Theme"],
  }));
  const benefits = (step5Data || []).map((b: any) => ({
    id: b["ID"],
    name: b["Use Case"],
    total: b["Total Annual Value ($)"],
    cost: b["Cost Benefit ($)"],
    revenue: b["Revenue Benefit ($)"],
    cashFlow: b["Cash Flow Benefit ($)"],
    risk: b["Risk Benefit ($)"],
    probability: b["Probability of Success"],
  }));

  return `Company: ${companyName}
Annual Revenue: $${(companyOverview?.annualRevenue || 0).toLocaleString()}
Employees: ${companyOverview?.totalEmployees || 'Unknown'}
Data Readiness: ${companyOverview?.dataReadiness?.currentState || 'Level 2'}

USE CASES:
${JSON.stringify(useCases)}

BENEFITS FROM STEP 5:
${JSON.stringify(benefits)}

Generate Steps 6-7 + executiveSummary + summary.
Step 7: Only output ID and Use Case name (scores computed by post-processor).
The executiveSummary should reference specific use case values from Step 5.
Return ONLY valid JSON. Start with { and end with }.`;
}

// ═══════════════════════════════════════════════════════════════════
// LAST-RESORT MINIMAL ANALYSIS BUILDER
// ═══════════════════════════════════════════════════════════════════

function buildMinimalAnalysis(companyName: string): any {
  return {
    companyOverview: {
      annualRevenue: 0,
      totalEmployees: 0,
      position: `${companyName} — analysis recovered with minimal data`,
      frictionTable: { rows: [] },
      dataReadiness: { currentState: "Unknown", keyGaps: "Full analysis required" },
      whyNow: "AI adoption is accelerating across all industries.",
    },
    steps: [
      {
        step: 0,
        title: "Company Overview & Strategic Context",
        content: `Overview for ${companyName}. This analysis was constructed from minimal data due to AI response parsing failure. Key metrics will be populated by the post-processor.`,
        data: [],
      },
      {
        step: 1,
        title: "Strategic Theme Anchoring",
        content: "Strategic themes identified for AI transformation.",
        data: [
          { "Theme": "Operational Efficiency", "Description": "Streamline operations through AI-powered automation", "Strategic Alignment": "Cost reduction and productivity improvement" },
          { "Theme": "Revenue Growth", "Description": "Leverage AI to identify and capture new revenue opportunities", "Strategic Alignment": "Top-line growth acceleration" },
          { "Theme": "Risk & Compliance", "Description": "Enhance risk management and regulatory compliance with AI", "Strategic Alignment": "Risk mitigation and governance" },
        ],
      },
      {
        step: 2,
        title: "Business Function Inventory & KPI Baselines",
        content: "Key business functions and performance indicators.",
        data: [
          { "Function": "Operations", "Sub-Function": "Process Management", "KPI Name": "Process Efficiency Rate", "Baseline Value": "70%", "Industry Benchmark": "85%", "Target Value": "82%", "Direction": "Higher is better", "Timeframe": "12 months", "Measurement Method": "Automated tracking" },
        ],
      },
      {
        step: 3,
        title: "Friction Point Mapping",
        content: "Identified operational friction points.",
        data: [
          { "Function": "Operations", "Sub-Function": "Process Management", "Friction Point": "Manual data processing and reconciliation", "Severity": "High", "Estimated Annual Cost ($)": "$500000", "Primary Driver Impact": "Cost" },
        ],
      },
      {
        step: 4,
        title: "AI Use Case Generation",
        content: "AI use cases mapped to identified friction points.",
        data: [
          {
            "ID": "UC-001",
            "Function": "Operations",
            "Sub-Function": "Process Management",
            "Use Case Name": "Intelligent Process Automation",
            "Description": "AI-powered automation of manual data processing workflows",
            "AI Primitives": ["Document Processing", "Data Extraction"],
            "Target Friction": "Manual data processing and reconciliation",
            "Primary Pattern": "Orchestrator-Workers",
            "Alternative Pattern": "Prompt Chaining",
            "Pattern Rationale": "Multi-step processing requires orchestration",
            "Agentic Pattern": "orchestrator-workers",
            "Strategic Theme": "Operational Efficiency",
            "EPOCH Flags": { "E": true, "P": true, "O": true, "C": false, "H": false },
          },
        ],
      },
      {
        step: 5,
        title: "Benefits Quantification by Driver",
        content: "Quantified benefits for each use case.",
        data: [
          {
            "ID": "UC-001",
            "Use Case": "Intelligent Process Automation",
            "Revenue Benefit ($)": "$0",
            "Revenue Formula": "N/A — minimal recovery analysis",
            "Revenue Formula Labels": { components: [] },
            "Cost Benefit ($)": "$150000",
            "Cost Formula": "$500,000 annual cost × 30% reduction",
            "Cost Formula Labels": { components: [{ label: "Annual Cost", value: 500000 }, { label: "Reduction Rate", value: 0.30 }] },
            "Cash Flow Benefit ($)": "$0",
            "Cash Flow Formula": "N/A — minimal recovery analysis",
            "Cash Flow Formula Labels": { components: [] },
            "Risk Benefit ($)": "$0",
            "Risk Formula": "N/A — minimal recovery analysis",
            "Risk Formula Labels": { components: [] },
            "Total Annual Value ($)": "$150000",
            "Probability of Success": 0.70,
            "Strategic Theme": "Operational Efficiency",
          },
        ],
      },
      {
        step: 6,
        title: "Readiness & Token Modeling",
        content: "Readiness assessment and token cost modeling.",
        data: [
          {
            "ID": "UC-001",
            "Use Case": "Intelligent Process Automation",
            "Organizational Capacity": 5,
            "Data Availability & Quality": 5,
            "Technical Infrastructure": 5,
            "Governance": 5,
            "Time-to-Value (months)": 6,
            "Input Tokens/Run": 800,
            "Output Tokens/Run": 800,
            "Runs/Month": 1000,
            "Monthly Tokens": 1600000,
          },
        ],
      },
      {
        step: 7,
        title: "Priority Scoring & Roadmap",
        content: "Priority scoring and implementation roadmap.",
        data: [
          {
            "ID": "UC-001",
            "Use Case": "Intelligent Process Automation",
            "Priority Tier": "Quick Wins",
            "Recommended Phase": "Phase 1",
          },
        ],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP-BY-STEP PIPELINE: executePipelineCall — single call execution
// ═══════════════════════════════════════════════════════════════════

export async function executePipelineCall(
  callNumber: number,
  companyName: string,
  previousCallResults: Record<string, any>,
  documentContext?: string
): Promise<any> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("Anthropic API key is not configured. Please set up the Anthropic integration in Replit.");
  }

  if (callNumber < 1 || callNumber > 4) {
    throw new Error(`Invalid call number: ${callNumber}. Must be 1-4.`);
  }

  const callStart = Date.now();
  console.log(`[pipeline-step] Starting call ${callNumber} for "${companyName}"`);

  const documentSection = documentContext
    ? `\n═══════════════════════════════════════════════════════════════════\nSUPPLEMENTAL DOCUMENTS PROVIDED BY USER\n═══════════════════════════════════════════════════════════════════\nThe following documents have been provided to give additional context about the company, its operations, specific use cases, or challenges. Incorporate this information into your analysis where relevant:\n\n${documentContext}\n\n═══════════════════════════════════════════════════════════════════\nEND OF SUPPLEMENTAL DOCUMENTS\n═══════════════════════════════════════════════════════════════════\n`
    : "";

  if (callNumber === 1) {
    const call1Result = await callPipelineStep(
      buildCall1SystemPrompt(),
      buildCall1UserPrompt(companyName, documentSection),
      32000,
      "Call 1 (Steps 0-2)",
      { webSearch: true }
    );

    const companyOverview = call1Result.companyOverview || {};
    const step1Data = call1Result.steps?.find((s: any) => s.step === 1)?.data || [];
    const step2Data = call1Result.steps?.find((s: any) => s.step === 2)?.data || [];

    if (!companyOverview.annualRevenue) companyOverview.annualRevenue = 0;

    console.log(`[pipeline-step] Call 1 complete in ${((Date.now() - callStart) / 1000).toFixed(1)}s: revenue=${companyOverview.annualRevenue}, themes=${step1Data.length}, KPIs=${step2Data.length}`);

    return {
      companyOverview,
      steps: call1Result.steps || [],
      step1Data,
      step2Data,
    };
  }

  if (callNumber === 2) {
    const call1Data = previousCallResults.call1;
    if (!call1Data) throw new Error("Call 2 requires call1 results in previousCallResults");

    const companyOverview = call1Data.companyOverview || {};
    const step1Data = call1Data.step1Data || [];
    const step2Data = call1Data.step2Data || [];

    const call2Context = buildCall2Context(companyName, companyOverview, step1Data, step2Data);
    const call2Result = await callPipelineStep(
      buildCall2SystemPrompt(),
      call2Context,
      32000,
      "Call 2 (Steps 3-4)"
    );

    const step3Data = call2Result.steps?.find((s: any) => s.step === 3)?.data || [];
    const step4Data = call2Result.steps?.find((s: any) => s.step === 4)?.data || [];

    console.log(`[pipeline-step] Call 2 complete in ${((Date.now() - callStart) / 1000).toFixed(1)}s: frictions=${step3Data.length}, useCases=${step4Data.length}`);

    return {
      steps: call2Result.steps || [],
      step3Data,
      step4Data,
    };
  }

  if (callNumber === 3) {
    const call1Data = previousCallResults.call1;
    const call2Data = previousCallResults.call2;
    if (!call1Data || !call2Data) throw new Error("Call 3 requires call1 and call2 results in previousCallResults");

    const companyOverview = call1Data.companyOverview || {};
    const step3Data = call2Data.step3Data || [];
    const step4Data = call2Data.step4Data || [];

    const call3Context = buildCall3Context(companyName, companyOverview, step3Data, step4Data);
    const call3Result = await callPipelineStep(
      buildCall3SystemPrompt(),
      call3Context,
      32000,
      "Call 3 (Step 5)"
    );

    const step5Data = call3Result.steps?.find((s: any) => s.step === 5)?.data || [];

    console.log(`[pipeline-step] Call 3 complete in ${((Date.now() - callStart) / 1000).toFixed(1)}s: benefitRecords=${step5Data.length}`);

    return {
      steps: call3Result.steps || [],
      step5Data,
    };
  }

  if (callNumber === 4) {
    const call1Data = previousCallResults.call1;
    const call2Data = previousCallResults.call2;
    const call3Data = previousCallResults.call3;
    if (!call1Data || !call2Data || !call3Data) throw new Error("Call 4 requires call1, call2, and call3 results in previousCallResults");

    const companyOverview = call1Data.companyOverview || {};
    const step4Data = call2Data.step4Data || [];
    const step5Data = call3Data.step5Data || [];

    const call4Context = buildCall4Context(companyName, companyOverview, step4Data, step5Data);
    const call4Result = await callPipelineStep(
      buildCall4SystemPrompt(),
      call4Context,
      16000,
      "Call 4 (Steps 6-7 + Summary)"
    );

    console.log(`[pipeline-step] Call 4 complete in ${((Date.now() - callStart) / 1000).toFixed(1)}s`);

    const allSteps = [
      ...(call1Data.steps || []),
      ...(call2Data.steps || []),
      ...(call3Data.steps || []),
      ...(call4Result.steps || []),
    ];

    const analysis: any = {
      companyOverview,
      steps: allSteps,
      executiveSummary: call4Result.executiveSummary || {},
      summary: call4Result.summary || "",
      executiveDashboard: {
        totalRevenueBenefit: 0,
        totalCostBenefit: 0,
        totalCashFlowBenefit: 0,
        totalRiskBenefit: 0,
        totalAnnualValue: 0,
        totalMonthlyTokens: 0,
        valuePerMillionTokens: 0,
        topUseCases: [],
      },
    };

    synthesizeMissingSteps(analysis);

    try {
      validateAnalysisStructure(analysis, companyName);
    } catch (validationError: any) {
      console.warn(`[pipeline-step] Validation warning (non-fatal): ${validationError.message}`);
    }

    console.log(`[pipeline-step] Post-processing analysis...`);
    const corrected = postProcessAnalysis(analysis);

    return {
      analysis: corrected,
    };
  }

  throw new Error(`Unexpected call number: ${callNumber}`);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PIPELINE: generateCompanyAnalysis
// ═══════════════════════════════════════════════════════════════════

export async function generateCompanyAnalysis(companyName: string, documentContext?: string, onProgress?: ProgressCallback): Promise<AnalysisResult> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("Anthropic API key is not configured. Please set up the Anthropic integration in Replit.");
  }

  console.log(`[pipeline] Starting pipeline analysis for: ${companyName}${documentContext ? ` with ${documentContext.length} chars of document context` : ""}`);
  const pipelineStart = Date.now();

  const documentSection = documentContext
    ? `\n═══════════════════════════════════════════════════════════════════\nSUPPLEMENTAL DOCUMENTS PROVIDED BY USER\n═══════════════════════════════════════════════════════════════════\nThe following documents have been provided to give additional context about the company, its operations, specific use cases, or challenges. Incorporate this information into your analysis where relevant:\n\n${documentContext}\n\n═══════════════════════════════════════════════════════════════════\nEND OF SUPPLEMENTAL DOCUMENTS\n═══════════════════════════════════════════════════════════════════\n`
    : "";

  try {
    // ─── CALL 1: Steps 0-2 + companyOverview ───
    onProgress?.(1, "Company Overview & Strategic Themes", "Researching company...");
    const call1Result = await callPipelineStep(
      buildCall1SystemPrompt(),
      buildCall1UserPrompt(companyName, documentSection),
      32000,
      "Call 1 (Steps 0-2)",
      { webSearch: true }
    );

    const companyOverview = call1Result.companyOverview || {};
    const step1Data = call1Result.steps?.find((s: any) => s.step === 1)?.data || [];
    const step2Data = call1Result.steps?.find((s: any) => s.step === 2)?.data || [];

    console.log(`[pipeline] Call 1 complete: revenue=${companyOverview.annualRevenue}, themes=${step1Data.length}, KPIs=${step2Data.length}`);

    // Validate Call 1 output
    if (!companyOverview.annualRevenue || step1Data.length < 3 || step2Data.length < 5) {
      console.warn(`[pipeline] Call 1 incomplete: revenue=${companyOverview.annualRevenue}, themes=${step1Data.length}, KPIs=${step2Data.length}`);
      // Set defaults if missing
      if (!companyOverview.annualRevenue) companyOverview.annualRevenue = 0;
    }

    // ─── CALL 2: Steps 3-4 ───
    onProgress?.(3, "Friction Points & Use Cases", "Mapping operational bottlenecks...");
    const call2Context = buildCall2Context(companyName, companyOverview, step1Data, step2Data);
    const call2Result = await callPipelineStep(
      buildCall2SystemPrompt(),
      call2Context,
      32000,
      "Call 2 (Steps 3-4)"
    );

    const step3Data = call2Result.steps?.find((s: any) => s.step === 3)?.data || [];
    const step4Data = call2Result.steps?.find((s: any) => s.step === 4)?.data || [];

    console.log(`[pipeline] Call 2 complete: frictions=${step3Data.length}, useCases=${step4Data.length}`);

    // Validate Call 2 output
    if (step3Data.length < 5 || step4Data.length < 5) {
      console.warn(`[pipeline] Call 2 incomplete: frictions=${step3Data.length}, useCases=${step4Data.length}`);
    }

    // ─── CALL 3: Step 5 ───
    onProgress?.(5, "Benefits Quantification", "Calculating financial benefits...");
    const call3Context = buildCall3Context(companyName, companyOverview, step3Data, step4Data);
    const call3Result = await callPipelineStep(
      buildCall3SystemPrompt(),
      call3Context,
      32000,
      "Call 3 (Step 5)"
    );

    const step5Data = call3Result.steps?.find((s: any) => s.step === 5)?.data || [];

    console.log(`[pipeline] Call 3 complete: benefitRecords=${step5Data.length}`);

    // Validate Call 3 output
    if (step5Data.length < 5) {
      console.warn(`[pipeline] Call 3 incomplete: benefits=${step5Data.length}`);
    }

    // ─── CALL 4: Steps 6-7 + executiveSummary ───
    onProgress?.(7, "Readiness & Roadmap", "Scoring readiness and building roadmap...");
    const call4Context = buildCall4Context(companyName, companyOverview, step4Data, step5Data);
    const call4Result = await callPipelineStep(
      buildCall4SystemPrompt(),
      call4Context,
      16000,
      "Call 4 (Steps 6-7 + Summary)"
    );

    console.log(`[pipeline] Call 4 complete`);

    // ─── ASSEMBLE ───
    onProgress?.(8, "Assembling Report", "Running post-processing...");

    const allSteps = [
      ...(call1Result.steps || []),
      ...(call2Result.steps || []),
      ...(call3Result.steps || []),
      ...(call4Result.steps || []),
    ];

    const analysis: any = {
      companyOverview,
      steps: allSteps,
      executiveSummary: call4Result.executiveSummary || {},
      summary: call4Result.summary || "",
      executiveDashboard: {
        totalRevenueBenefit: 0,
        totalCostBenefit: 0,
        totalCashFlowBenefit: 0,
        totalRiskBenefit: 0,
        totalAnnualValue: 0,
        totalMonthlyTokens: 0,
        valuePerMillionTokens: 0,
        topUseCases: [],
      },
    };

    synthesizeMissingSteps(analysis);

    try {
      validateAnalysisStructure(analysis, companyName);
    } catch (validationError: any) {
      console.warn(`[pipeline] Validation warning (non-fatal): ${validationError.message}`);
    }

    if (onProgress) {
      onProgress(9, "Applying Formulas", "Running deterministic post-processing...");
    }
    console.log(`[pipeline] Post-processing analysis...`);
    const corrected = postProcessAnalysis(analysis);

    const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log(`[pipeline] Complete for "${companyName}" in ${totalElapsed}s`);

    return corrected;
  } catch (error: any) {
    console.error("[pipeline] Pipeline error:", error?.message || error);

    const originalError = error.originalError || error;

    if (originalError.status === 401) {
      throw new Error("Authentication failed. Please check your Anthropic API key configuration.");
    } else if (originalError.status === 429 || originalError.message?.includes("429") || originalError.message?.toLowerCase().includes("rate limit")) {
      throw new Error("The AI service is busy. Please wait 1-2 minutes and try again. This is normal during high usage periods.");
    } else if (originalError.status === 500 || originalError.status === 503) {
      throw new Error("AI service is temporarily unavailable. Please try again in a few minutes.");
    } else if (originalError.code === 'ECONNREFUSED' || originalError.code === 'ENOTFOUND') {
      throw new Error("Cannot connect to AI service. Please check your network connection.");
    }

    console.warn("[pipeline] Attempting last-resort minimal analysis...");
    try {
      const minimalAnalysis = buildMinimalAnalysis(companyName);
      const correctedMinimal = postProcessAnalysis(minimalAnalysis);
      console.warn(`[pipeline] Last-resort minimal analysis complete for "${companyName}"`);
      return correctedMinimal;
    } catch (minimalError: any) {
      console.error("[pipeline] Even minimal analysis failed:", minimalError?.message);
      if (originalError.message) {
        throw new Error(originalError.message);
      }
      throw new Error("Failed to generate company analysis. Please try again.");
    }
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
    4: "AI Use Case Generation - Generate AI use case records with ID, Function, Sub-Function, Use Case Name, Description, AI Primitives, Target Friction, Primary Pattern (Reflection/Tool Use/Planning/ReAct Loop/Prompt Chaining/Semantic Router/Constitutional Guardrail/Orchestrator-Workers/Agent Handoff/Parallelization/Generator-Critic/Group Chat), Alternative Pattern, Pattern Rationale, Agentic Pattern (lowercase ID), and EPOCH Flags",
    5: "Benefits Quantification - Generate benefit records with ID, Use Case, Revenue Benefit (e.g. $2.5M), Revenue Formula (explanation of calculation), Cost Benefit, Cost Formula, Cash Flow Benefit, Cash Flow Formula, Risk Benefit, Risk Formula, Total Annual Value (sum of all benefits), and Probability of Success (percentage 1-100). Use realistic conservative estimates with $K or $M notation.",
    6: "Readiness & Token Modeling - Generate readiness records with ID, Use Case, Organizational Capacity (1-10), Data Availability & Quality (1-10), Technical Infrastructure (1-10), Governance (1-10), Runs/Month, Input Tokens/Run, Output Tokens/Run, Monthly Tokens, and Time-to-Value (months)",
    7: "Priority Scoring & Roadmap - Generate priority records with ID, Use Case, Priority Tier (Champions/Quick Wins/Strategic/Foundation), Recommended Phase, Priority Score, Readiness Score, Value Score, TTV Score"
  };

  const systemPrompt = `You are an AI assistant helping users create What-If scenarios for enterprise AI assessments.

${EPOCH_FRAMEWORK_DEFINITION}

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

  const userPrompt = `Generate a new record suggestion for Step ${step}. Return ONLY a valid JSON object. Do NOT wrap in markdown code fences. Do NOT include any text before or after the JSON.`;

  try {
    const responseText = await callAnthropicAPI(systemPrompt, userPrompt, 2000);
    
    return extractJSON(responseText);
  } catch (error) {
    console.error("AI Suggestion Error:", error);
    throw new Error("Failed to generate suggestion");
  }
}
