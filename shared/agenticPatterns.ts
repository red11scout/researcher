/**
 * Agentic Design Patterns Catalog
 *
 * A comprehensive reference of agentic AI design patterns used to classify,
 * compare, and recommend architectural approaches for AI use cases.
 *
 * Each pattern includes complexity ratings, cost multipliers, implementation
 * estimates, and suitability guidance to support automated recommendation engines.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgenticPatternType = "single-agent" | "multi-agent";

export type AgenticComplexity = "low" | "medium" | "high";

export type AgenticPrimitive =
  | "Natural Language Understanding"
  | "Natural Language Generation"
  | "Knowledge Retrieval"
  | "Planning"
  | "Tool Use"
  | "Memory"
  | "Reflection"
  | "Learning";

export interface AgenticPatternDefinition {
  /** Unique slug identifier (e.g. "reflection", "react-loop") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Whether the pattern uses a single agent or coordinates multiple agents */
  type: AgenticPatternType;
  /** 2-3 sentence description of the pattern */
  description: string;
  /** Relative implementation complexity */
  complexity: AgenticComplexity;
  /** Emoji icon for UI display */
  icon: string;
  /** Core AI primitives leveraged by this pattern */
  primitives: AgenticPrimitive[];
  /** Key advantages (3-4 points) */
  pros: string[];
  /** Key disadvantages (2-3 points) */
  cons: string[];
  /** Ideal use-case categories (2-3 examples) */
  bestFor: string[];
  /** Estimated months to implement a production-grade version */
  implementationMonths: number;
  /** Annual maintenance cost relative to baseline (1.0) */
  annualMaintenanceCostMultiplier: number;
  /** Token consumption relative to a single-pass baseline (1.0) */
  tokenMultiplier: number;
  /** Concrete use-case examples that benefit from this pattern */
  useCaseExamples: string[];
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const AGENTIC_PATTERN_CATALOG: Record<string, AgenticPatternDefinition> = {
  // ---- 1. Reflection -------------------------------------------------------
  reflection: {
    id: "reflection",
    name: "Reflection (Self-Critique)",
    type: "single-agent",
    description:
      "The agent generates an initial output, then critiques and iteratively refines it through one or more self-review passes. Each pass evaluates the output against quality criteria and produces a revised version. This yields measurably higher quality without requiring additional agents.",
    complexity: "low",
    icon: "\u{1FA9E}",
    primitives: [
      "Natural Language Generation",
      "Reflection",
      "Natural Language Understanding",
    ],
    pros: [
      "Significantly improves output quality with minimal architectural overhead",
      "Easy to implement as a wrapper around any existing LLM call",
      "Transparent reasoning trail makes debugging straightforward",
      "Works well with off-the-shelf models without fine-tuning",
    ],
    cons: [
      "Increases latency linearly with each refinement pass",
      "Higher token consumption from repeated generation and evaluation",
      "Diminishing returns after 2-3 refinement cycles in most scenarios",
    ],
    bestFor: [
      "Content generation requiring high accuracy or polish",
      "Code review and automated code improvement",
      "Any task where a first-draft-then-refine workflow is natural",
    ],
    implementationMonths: 1.5,
    annualMaintenanceCostMultiplier: 1.2,
    tokenMultiplier: 1.5,
    useCaseExamples: [
      "Automated blog post drafting with editorial self-review",
      "Code generation with built-in lint and logic checks",
      "Legal clause drafting with compliance self-audit",
      "Marketing copy refinement for tone and brand alignment",
    ],
  },

  // ---- 2. Tool Use ---------------------------------------------------------
  "tool-use": {
    id: "tool-use",
    name: "Tool Use (LLM + External Tools)",
    type: "single-agent",
    description:
      "The agent augments its reasoning by invoking external tools such as APIs, databases, calculators, or code interpreters during the generation process. The LLM decides which tool to call, interprets the result, and incorporates it into its response. This grounds outputs in real-time, factual data.",
    complexity: "medium",
    icon: "\u{1F6E0}\u{FE0F}",
    primitives: [
      "Tool Use",
      "Natural Language Understanding",
      "Natural Language Generation",
      "Knowledge Retrieval",
    ],
    pros: [
      "Grounds LLM output in real-time data, reducing hallucination",
      "Extends capabilities far beyond the model's training data",
      "Modular tool registry makes it easy to add new capabilities",
      "Enables actions in the real world (send email, update database, etc.)",
    ],
    cons: [
      "Requires robust error handling for tool failures and timeouts",
      "Security surface increases with each integrated tool",
      "Tool selection accuracy depends heavily on prompt engineering",
    ],
    bestFor: [
      "Research tasks requiring live data lookups",
      "Customer support with CRM and knowledge-base integration",
      "Data enrichment and validation workflows",
    ],
    implementationMonths: 2.5,
    annualMaintenanceCostMultiplier: 1.5,
    tokenMultiplier: 1.3,
    useCaseExamples: [
      "Financial analyst agent that queries market data APIs",
      "IT helpdesk bot that checks ticket status and system health",
      "Travel assistant that searches flights and hotels in real time",
      "Research agent that retrieves and summarizes academic papers",
    ],
  },

  // ---- 3. Planning ---------------------------------------------------------
  planning: {
    id: "planning",
    name: "Planning (Task Decomposition)",
    type: "single-agent",
    description:
      "The agent breaks a complex goal into an ordered sequence of sub-tasks, reasons about dependencies, and executes them step by step. Plans can be static (generated once) or dynamic (revised as new information emerges). This pattern excels when the problem space is too large for a single prompt.",
    complexity: "medium",
    icon: "\u{1F4CB}",
    primitives: [
      "Planning",
      "Natural Language Understanding",
      "Natural Language Generation",
      "Memory",
    ],
    pros: [
      "Handles complex, multi-step problems that overwhelm single prompts",
      "Produces an auditable execution plan before taking action",
      "Dynamic re-planning allows graceful recovery from failures",
      "Naturally supports progress tracking and partial results",
    ],
    cons: [
      "Plan quality is sensitive to initial goal clarity",
      "Over-decomposition can create unnecessary sub-task overhead",
      "Requires careful state management between planning and execution phases",
    ],
    bestFor: [
      "Strategic analysis and long-horizon research",
      "Multi-step data processing with conditional branching",
      "Project planning and task management automation",
    ],
    implementationMonths: 2.5,
    annualMaintenanceCostMultiplier: 1.4,
    tokenMultiplier: 1.4,
    useCaseExamples: [
      "Market research agent that plans data collection, analysis, and reporting phases",
      "Software architecture agent that decomposes feature requests into implementation tasks",
      "Due diligence agent that creates and executes a structured investigation plan",
      "Curriculum builder that decomposes learning objectives into lesson sequences",
    ],
  },

  // ---- 4. ReAct Loop -------------------------------------------------------
  "react-loop": {
    id: "react-loop",
    name: "ReAct Loop (Reason + Act)",
    type: "single-agent",
    description:
      "The agent alternates between reasoning (thinking about what to do next) and acting (executing a tool call or producing output) in an iterative loop. After each action, the agent observes the result and reasons about the next step. This tight feedback loop makes the agent highly adaptive to dynamic environments.",
    complexity: "medium",
    icon: "\u{1F504}",
    primitives: [
      "Planning",
      "Tool Use",
      "Reflection",
      "Natural Language Understanding",
      "Natural Language Generation",
    ],
    pros: [
      "Highly adaptive; each step is informed by the previous outcome",
      "Transparent chain-of-thought makes behavior easy to audit",
      "Naturally handles unexpected results and error recovery",
      "Combines reasoning depth with real-world action capability",
    ],
    cons: [
      "Can enter long loops on ambiguous or open-ended problems",
      "Token cost scales with number of reasoning-action cycles",
      "Requires careful loop termination logic to prevent runaway execution",
    ],
    bestFor: [
      "Diagnostics and troubleshooting with iterative investigation",
      "Interactive research that adapts to discovered information",
      "Complex question answering requiring multi-hop reasoning",
    ],
    implementationMonths: 3.5,
    annualMaintenanceCostMultiplier: 1.6,
    tokenMultiplier: 2.0,
    useCaseExamples: [
      "IT incident diagnosis agent that iteratively checks logs and systems",
      "Customer complaint resolution agent that gathers context step by step",
      "Competitive intelligence agent that follows leads across multiple sources",
      "Bug triage agent that reproduces issues and narrows root causes",
    ],
  },

  // ---- 5. Prompt Chaining --------------------------------------------------
  "prompt-chaining": {
    id: "prompt-chaining",
    name: "Prompt Chaining (Sequential)",
    type: "single-agent",
    description:
      "A fixed sequence of prompts where the output of one step becomes the input to the next. Each step has a focused, well-defined role (e.g., extract, transform, summarize). The pipeline is deterministic in structure, making it predictable and easy to test.",
    complexity: "low",
    icon: "\u{1F517}",
    primitives: [
      "Natural Language Understanding",
      "Natural Language Generation",
      "Knowledge Retrieval",
    ],
    pros: [
      "Simple to build, test, and debug due to deterministic flow",
      "Each step can be independently optimized and validated",
      "Low token overhead since each step uses a focused prompt",
      "Easy to extend by inserting new steps into the chain",
    ],
    cons: [
      "Rigid; cannot adapt to unexpected intermediate results without branching logic",
      "Errors in early steps propagate through the entire chain",
      "Not suitable for tasks requiring dynamic decision-making",
    ],
    bestFor: [
      "Structured data pipelines (extract, transform, load)",
      "Multi-stage report generation with predictable structure",
      "Content workflows with sequential editorial phases",
    ],
    implementationMonths: 1.5,
    annualMaintenanceCostMultiplier: 1.1,
    tokenMultiplier: 1.2,
    useCaseExamples: [
      "Document ingestion pipeline: parse, extract entities, summarize, classify",
      "Email processing chain: categorize, extract action items, draft response",
      "Financial report generator: gather data, compute metrics, narrate findings",
      "RFP response pipeline: parse requirements, match capabilities, draft sections",
    ],
  },

  // ---- 6. Semantic Router ---------------------------------------------------
  "semantic-router": {
    id: "semantic-router",
    name: "Semantic Router (Classification)",
    type: "single-agent",
    description:
      "An input classifier determines the intent or category of a user request and routes it to the most appropriate specialized handler, prompt, or downstream agent. This pattern is lightweight and acts as a front-door dispatcher that keeps individual handlers simple and focused.",
    complexity: "low",
    icon: "\u{1F6A6}",
    primitives: [
      "Natural Language Understanding",
      "Natural Language Generation",
    ],
    pros: [
      "Very low latency; classification adds minimal overhead",
      "Keeps downstream handlers simple and specialized",
      "Easy to add new routes without modifying existing ones",
      "Works well as the entry point for larger agentic systems",
    ],
    cons: [
      "Misclassification sends requests to the wrong handler",
      "Requires representative training examples or clear category definitions",
      "Struggles with ambiguous or multi-intent inputs",
    ],
    bestFor: [
      "Customer support triage and ticket routing",
      "Multi-skill assistant with distinct capability domains",
      "Content moderation and intent-based filtering",
    ],
    implementationMonths: 1.5,
    annualMaintenanceCostMultiplier: 1.1,
    tokenMultiplier: 1.1,
    useCaseExamples: [
      "Support chatbot that routes billing, technical, and account queries to specialized prompts",
      "HR assistant that classifies requests into payroll, benefits, time-off, and policy categories",
      "Internal knowledge base that routes questions to the relevant department's FAQ agent",
      "Content moderation system that classifies submissions by risk level for review",
    ],
  },

  // ---- 7. Orchestrator-Workers ---------------------------------------------
  "orchestrator-workers": {
    id: "orchestrator-workers",
    name: "Orchestrator-Workers",
    type: "multi-agent",
    description:
      "A central orchestrator agent receives a complex request, decomposes it into sub-tasks, delegates each sub-task to specialized worker agents, collects their results, and synthesizes a final output. The orchestrator manages state, handles failures, and ensures coherence across the workers' contributions.",
    complexity: "high",
    icon: "\u{1F3AF}",
    primitives: [
      "Planning",
      "Tool Use",
      "Natural Language Understanding",
      "Natural Language Generation",
      "Memory",
      "Reflection",
    ],
    pros: [
      "Handles highly complex, multi-domain tasks by leveraging specialist agents",
      "Central coordination ensures consistency and coherent final output",
      "Workers can be developed and scaled independently",
      "Failure in one worker can be isolated without collapsing the entire system",
    ],
    cons: [
      "Orchestrator is a single point of failure; requires robust error handling",
      "High token cost from orchestration prompts plus all worker prompts",
      "Significant implementation and testing effort for agent communication protocols",
    ],
    bestFor: [
      "Enterprise workflows spanning multiple departments or data sources",
      "Complex analytical tasks requiring diverse domain expertise",
      "Large-scale content production with multiple specialist contributors",
    ],
    implementationMonths: 5,
    annualMaintenanceCostMultiplier: 2.0,
    tokenMultiplier: 3.0,
    useCaseExamples: [
      "Due diligence platform with legal, financial, and market-analysis worker agents",
      "AI-powered IDE with code generation, test writing, and documentation workers",
      "Customer onboarding system that coordinates identity verification, account setup, and welcome messaging",
      "RFP response engine with technical, pricing, and compliance specialist agents",
    ],
  },

  // ---- 8. Agent Handoff ----------------------------------------------------
  "agent-handoff": {
    id: "agent-handoff",
    name: "Agent Handoff (Delegation)",
    type: "multi-agent",
    description:
      "Agents pass control to one another in a decentralized fashion, with each agent deciding when to hand off and to whom based on the current context. Unlike orchestrator-workers, there is no central coordinator; instead, handoff logic is embedded within each agent. This mirrors human escalation and referral workflows.",
    complexity: "medium",
    icon: "\u{1F91D}",
    primitives: [
      "Natural Language Understanding",
      "Natural Language Generation",
      "Planning",
      "Memory",
      "Tool Use",
    ],
    pros: [
      "Mirrors natural human escalation and referral patterns",
      "No single point of failure; resilient to individual agent issues",
      "Easy to add new specialist agents without changing the core architecture",
      "Each agent maintains focused expertise and smaller context windows",
    ],
    cons: [
      "Context can be lost or degraded during handoffs without careful state management",
      "Debugging multi-hop handoff chains is challenging",
      "Risk of infinite handoff loops if routing logic is ambiguous",
    ],
    bestFor: [
      "Customer service with tiered support levels",
      "Multi-step business processes with distinct ownership phases",
      "Healthcare triage where patients move between specialist assessments",
    ],
    implementationMonths: 3.5,
    annualMaintenanceCostMultiplier: 1.7,
    tokenMultiplier: 2.5,
    useCaseExamples: [
      "Customer support escalation: chatbot to tier-1 agent to specialist to supervisor",
      "Insurance claims processing: intake agent to adjuster agent to approval agent",
      "Patient intake system: triage agent to scheduling agent to specialist referral agent",
      "Sales pipeline: lead qualification agent to demo scheduling agent to proposal agent",
    ],
  },

  // ---- 9. Parallelization --------------------------------------------------
  parallelization: {
    id: "parallelization",
    name: "Parallelization (Concurrent)",
    type: "multi-agent",
    description:
      "Multiple agents execute concurrently on the same input or on different facets of a problem, and their results are merged or voted upon to produce a final output. This pattern dramatically reduces wall-clock time for independent sub-tasks and enables multi-perspective analysis where diverse viewpoints improve quality.",
    complexity: "high",
    icon: "\u{26A1}",
    primitives: [
      "Planning",
      "Natural Language Understanding",
      "Natural Language Generation",
      "Tool Use",
      "Memory",
    ],
    pros: [
      "Dramatically reduces wall-clock time for independent sub-tasks",
      "Multi-perspective analysis improves coverage and reduces blind spots",
      "Voting or aggregation mechanisms increase output reliability",
      "Scales horizontally by adding more parallel workers",
    ],
    cons: [
      "High aggregate token cost since all agents process simultaneously",
      "Result merging and conflict resolution logic can be complex",
      "Requires infrastructure for concurrent execution and synchronization",
    ],
    bestFor: [
      "Large-scale data analysis across multiple dimensions",
      "Multi-perspective evaluation (e.g., SWOT from different viewpoints)",
      "Batch processing where items are independent",
    ],
    implementationMonths: 4.5,
    annualMaintenanceCostMultiplier: 2.2,
    tokenMultiplier: 3.5,
    useCaseExamples: [
      "Investment analysis with parallel financial, market, and sentiment agents",
      "Document review with concurrent legal, compliance, and business impact assessors",
      "Multi-language content generation with parallel translation agents",
      "Security audit with concurrent vulnerability scanning agents across different attack surfaces",
    ],
  },

  // ---- 10. Generator-Critic ------------------------------------------------
  "generator-critic": {
    id: "generator-critic",
    name: "Generator-Critic (Review Loop)",
    type: "multi-agent",
    description:
      "A two-agent system where one agent generates content and a second agent reviews, critiques, and scores it. The generator revises based on feedback in an iterative loop until the critic approves or a maximum iteration count is reached. This separation of concerns produces higher-quality output than self-critique alone.",
    complexity: "medium",
    icon: "\u{1F3AD}",
    primitives: [
      "Natural Language Generation",
      "Reflection",
      "Natural Language Understanding",
      "Learning",
    ],
    pros: [
      "Clear separation of generation and evaluation improves objectivity",
      "Critic can enforce specific quality rubrics and compliance standards",
      "Iterative loop converges on measurably higher quality output",
      "Each agent can be independently tuned or swapped without affecting the other",
    ],
    cons: [
      "Multiple round-trips increase latency and token cost",
      "Critic must be well-calibrated to avoid over-rejection or rubber-stamping",
      "Convergence is not guaranteed for subjective quality criteria",
    ],
    bestFor: [
      "Content production with editorial quality standards",
      "Compliance-sensitive document generation",
      "Creative writing with iterative feedback cycles",
    ],
    implementationMonths: 2.5,
    annualMaintenanceCostMultiplier: 1.5,
    tokenMultiplier: 2.0,
    useCaseExamples: [
      "Marketing copy generator with brand-voice critic agent",
      "Contract drafting agent with legal compliance reviewer agent",
      "Code generation agent with security and style review agent",
      "Product description writer with SEO optimization critic",
    ],
  },

  // ---- 11. Constitutional Guardrail ----------------------------------------
  "constitutional-guardrail": {
    id: "constitutional-guardrail",
    name: "Constitutional Guardrail",
    type: "single-agent",
    description:
      "A set of inviolable principles (the 'constitution') is embedded into the agent's reasoning process, ensuring every output is checked against compliance rules, ethical guidelines, or regulatory requirements before delivery. The guardrail can operate as a pre-filter, post-filter, or both, and rejects or revises outputs that violate the constitution.",
    complexity: "medium",
    icon: "\u{1F6E1}\u{FE0F}",
    primitives: [
      "Natural Language Understanding",
      "Natural Language Generation",
      "Reflection",
      "Knowledge Retrieval",
    ],
    pros: [
      "Provides systematic compliance enforcement across all outputs",
      "Reduces legal and reputational risk in regulated industries",
      "Constitution rules are auditable and easy to update",
      "Can be layered onto any existing agent pattern as an add-on",
    ],
    cons: [
      "Over-restrictive rules can degrade output usefulness and creativity",
      "Maintaining and versioning the constitution requires governance effort",
      "Edge cases may not be captured by declarative rules alone",
    ],
    bestFor: [
      "Regulated industries (finance, healthcare, legal) requiring compliance",
      "Customer-facing applications with brand-safety requirements",
      "Any deployment where output liability is a concern",
    ],
    implementationMonths: 2.5,
    annualMaintenanceCostMultiplier: 1.4,
    tokenMultiplier: 1.6,
    useCaseExamples: [
      "Healthcare chatbot with HIPAA compliance guardrails on every response",
      "Financial advisory agent with SEC and FINRA regulatory checks",
      "HR policy assistant that ensures responses comply with employment law",
      "Content moderation agent that enforces community guidelines on user-generated content",
    ],
  },

  // ---- 12. Group Chat / Swarm ----------------------------------------------
  "group-chat": {
    id: "group-chat",
    name: "Group Chat / Swarm",
    type: "multi-agent",
    description:
      "A team of agents engages in collaborative dialogue within a shared conversation space, contributing different perspectives, debating options, and building on each other's ideas. A moderator agent may guide the discussion, but agents are free to contribute organically. This pattern excels at creative problem-solving and comprehensive strategic analysis.",
    complexity: "high",
    icon: "\u{1F4AC}",
    primitives: [
      "Natural Language Understanding",
      "Natural Language Generation",
      "Planning",
      "Reflection",
      "Memory",
      "Learning",
    ],
    pros: [
      "Produces richly diverse perspectives that no single agent can match",
      "Emergent insights arise from agent-to-agent interaction and debate",
      "Closely mirrors human brainstorming and committee deliberation",
      "Flexible; agents can join or leave the conversation dynamically",
    ],
    cons: [
      "Highest token cost of any pattern due to full conversational context",
      "Risk of circular or unproductive discussion without strong moderation",
      "Complex to orchestrate and debug multi-party conversations",
    ],
    bestFor: [
      "Strategic brainstorming and scenario planning",
      "Cross-functional analysis requiring multiple domain perspectives",
      "Creative ideation where diverse viewpoints drive innovation",
    ],
    implementationMonths: 5.5,
    annualMaintenanceCostMultiplier: 2.5,
    tokenMultiplier: 4.0,
    useCaseExamples: [
      "Strategy formulation with CEO, CFO, CTO, and CMO persona agents debating priorities",
      "Product design session with user researcher, engineer, and designer agents",
      "Risk assessment with legal, financial, operational, and reputational risk agents",
      "Innovation workshop with industry analyst, futurist, and domain expert agents",
    ],
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Retrieve a single pattern definition by its ID. */
export function getPatternById(id: string): AgenticPatternDefinition | undefined {
  return AGENTIC_PATTERN_CATALOG[id];
}

/** Retrieve all patterns matching the given type (single-agent or multi-agent). */
export function getPatternsByType(
  type: "single-agent" | "multi-agent",
): AgenticPatternDefinition[] {
  return Object.values(AGENTIC_PATTERN_CATALOG).filter((p) => p.type === type);
}

/** Retrieve all patterns matching the given complexity level. */
export function getPatternsByComplexity(
  complexity: "low" | "medium" | "high",
): AgenticPatternDefinition[] {
  return Object.values(AGENTIC_PATTERN_CATALOG).filter(
    (p) => p.complexity === complexity,
  );
}

// ---------------------------------------------------------------------------
// Derived constants
// ---------------------------------------------------------------------------

/** Ordered list of all pattern display names. */
export const AGENTIC_PATTERN_NAMES: string[] = Object.values(
  AGENTIC_PATTERN_CATALOG,
).map((p) => p.name);

/** Ordered list of all pattern IDs. */
export const AGENTIC_PATTERN_IDS: string[] = Object.keys(AGENTIC_PATTERN_CATALOG);
