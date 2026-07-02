// Token estimator for agentic Claude workloads.
//
// The previous flat default of 800 input + 800 output tokens per run grossly
// undercounts realistic agentic patterns. Real production multi-agent systems
// on Claude burn 15K-40K input tokens per run (system prompts + tool schemas
// + retrieved context + intermediate reasoning). This estimator produces a
// defensible token estimate from a small set of structural inputs and is
// also used as the post-processor fallback when the LLM omits Step 6 data.

export type Complexity = "low" | "medium" | "high";

export interface TokenEstimateInputs {
  agentHops?: number;       // # of agent / sub-agent calls per run
  retrievedDocs?: number;   // # of RAG documents pulled into context
  hasToolSchemas?: boolean; // whether tool/function schemas are in the prompt
  complexity?: Complexity;  // overall task complexity multiplier
}

export interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
  rationale: string;
}

export const TOKEN_ESTIMATOR_DEFAULTS = {
  baseInput: 5000,           // system prompt + framing + minimal user input
  baseOutput: 1500,          // structured JSON / multi-paragraph reasoning
  perAgentHopInput: 3000,    // each sub-agent call adds context + scratchpad
  perAgentHopOutput: 400,    // each sub-agent emits intermediate output
  perRetrievedDocInput: 2000,// each RAG chunk adds ~2K tokens
  toolSchemaInput: 1500,     // typical Anthropic tool-use schema overhead
  complexity: { low: 1.0, medium: 1.5, high: 2.5 } as Record<Complexity, number>,
} as const;

export function estimateTokensPerRun(inputs: TokenEstimateInputs = {}): TokenEstimate {
  const d = TOKEN_ESTIMATOR_DEFAULTS;
  const hops = Math.max(0, inputs.agentHops ?? 0);
  const docs = Math.max(0, inputs.retrievedDocs ?? 0);
  const tools = inputs.hasToolSchemas ? d.toolSchemaInput : 0;
  const complexity: Complexity = inputs.complexity ?? "medium";
  const mult = d.complexity[complexity];

  const rawInput =
    d.baseInput + hops * d.perAgentHopInput + docs * d.perRetrievedDocInput + tools;
  const rawOutput = d.baseOutput + hops * d.perAgentHopOutput;

  return {
    inputTokens: Math.round(rawInput * mult),
    outputTokens: Math.round(rawOutput * mult),
    rationale:
      `base ${d.baseInput}/${d.baseOutput} + ${hops} agent hops + ${docs} retrieved docs ` +
      `+ tools=${tools > 0 ? "yes" : "no"} × ${complexity} (${mult}x)`,
  };
}

// Heuristic estimator that infers structural inputs from a free-form Step 5
// or Step 6 use-case record. Used as the post-processor fallback when the LLM
// omits explicit token counts. Always returns a value in the realistic range
// (>= 5K input) — it is intentionally never < the legacy 800/800 default.
export function estimateFromUseCaseRecord(record: Record<string, any>): TokenEstimate {
  const blob = JSON.stringify(record).toLowerCase();

  const isMultiAgent =
    /multi.?agent|orchestrator|handoff|generator.?critic|group.?chat|parallelization/.test(blob);
  const isAgentic =
    isMultiAgent ||
    /react|reflection|tool.?use|planning|prompt.?chain|semantic.?router|constitutional|guardrail|\bagent/.test(
      blob,
    );
  const hasRag = /\brag\b|retriev|vector|semantic.?search|knowledge.?base|document.?lookup/.test(blob);
  const hasTools = /\btool\b|function.?call|api.?call|\bmcp\b/.test(blob);

  const agentHops = isMultiAgent ? 4 : isAgentic ? 2 : 1;
  const retrievedDocs = hasRag ? 5 : 0;

  const highSignals =
    /forecast|optimi[sz]|reasoning|synthesi[sz]|orchestrat|multi.?step|complex|advanced|long.?context/.test(
      blob,
    );
  const lowSignals = /classif|sentiment|template|simple|extract\s|tagging|routing.?only/.test(blob);
  const complexity: Complexity = highSignals ? "high" : lowSignals ? "low" : "medium";

  return estimateTokensPerRun({
    agentHops,
    retrievedDocs,
    hasToolSchemas: hasTools,
    complexity,
  });
}
