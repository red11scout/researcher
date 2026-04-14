/**
 * Standardized Function/Sub-Function Taxonomy & AI Primitives Catalog
 *
 * This is the single source of truth for business function classification
 * and AI primitive labeling across all report sections.
 *
 * Used by:
 * - server/ai-service.ts (system prompt constraints)
 * - server/calculation-postprocessor.ts (normalization + verification)
 * - client/src/pages/Report.tsx (display consistency)
 */

// ============================================================================
// BUSINESS FUNCTION TAXONOMY
// ============================================================================

export interface SubFunctionDef {
  name: string;
  aliases: string[];  // Common variations the AI might generate
}

export interface FunctionDef {
  name: string;
  aliases: string[];  // Common variations (e.g., "Pro Sales" → "Sales")
  subFunctions: SubFunctionDef[];
  isIndustrySpecific?: boolean;  // If true, only used for certain verticals
}

export const FUNCTION_TAXONOMY: FunctionDef[] = [
  {
    name: "Sales",
    aliases: ["Pro Sales", "Sales & Business Development", "Revenue", "Commercial", "Business Development"],
    subFunctions: [
      { name: "Pipeline Management", aliases: ["Sales Pipeline", "Deal Management", "Opportunity Management"] },
      { name: "Account Management", aliases: ["Account Planning", "Key Accounts", "Client Management", "Customer Retention"] },
      { name: "Quote Management", aliases: ["Quoting", "Pricing", "Proposal Management", "CPQ", "Bid Management"] },
      { name: "Sales Operations", aliases: ["Sales Ops", "Revenue Operations", "RevOps"] },
      { name: "Channel Sales", aliases: ["Partner Sales", "Indirect Sales", "Reseller Management"] },
      { name: "Sales Enablement", aliases: ["Sales Training", "Sales Readiness", "Sales Tools"] },
    ],
  },
  {
    name: "Marketing",
    aliases: ["Marketing & Communications", "Growth Marketing", "Brand Marketing"],
    subFunctions: [
      { name: "Campaign Management", aliases: ["Campaign Ops", "Campaign Planning", "Campaign Execution", "Email Campaigns"] },
      { name: "Content Creation", aliases: ["Content Marketing", "Content Strategy", "Copywriting", "Creative"] },
      { name: "Demand Generation", aliases: ["Lead Generation", "Demand Gen", "Growth", "Acquisition"] },
      { name: "Market Research", aliases: ["Marketing Analytics", "Competitive Intelligence", "Market Intelligence"] },
      { name: "Brand Management", aliases: ["Brand Strategy", "Messaging & Positioning", "Brand Identity"] },
      { name: "Digital Marketing", aliases: ["SEO", "SEM", "Social Media", "Paid Media", "Performance Marketing"] },
    ],
  },
  {
    name: "Finance",
    aliases: ["Finance & Accounting", "Financial Services", "Corporate Finance"],
    subFunctions: [
      { name: "Accounts Payable", aliases: ["AP", "Invoice Processing", "Vendor Payments", "Payables"] },
      { name: "Accounts Receivable", aliases: ["AR", "Collections", "Billing", "Receivables"] },
      { name: "Financial Planning & Analysis", aliases: ["FP&A", "Budgeting", "Forecasting", "Financial Modeling"] },
      { name: "Treasury", aliases: ["Cash Management", "Treasury Operations", "Working Capital"] },
      { name: "Tax", aliases: ["Tax Compliance", "Tax Planning", "Tax Reporting"] },
      { name: "Financial Reporting", aliases: ["Financial Close", "Consolidation", "Reporting & Consolidation", "General Ledger"] },
    ],
  },
  {
    name: "Operations",
    aliases: ["Business Operations", "Operational Excellence", "Store Operations", "Field Operations", "Branch Operations"],
    subFunctions: [
      { name: "Process Optimization", aliases: ["Process Design", "Process Engineering", "Process Improvement", "Lean Operations"] },
      { name: "Quality Assurance", aliases: ["QA", "Quality Control", "Quality Management", "Inspection"] },
      { name: "Inventory Management", aliases: ["Inventory Control", "Stock Management", "Warehouse Management"] },
      { name: "Customer Service", aliases: ["Customer Support", "Client Services", "Help Desk", "Contact Center", "Customer Experience"] },
      { name: "Workforce Management", aliases: ["Scheduling", "Labor Management", "Staffing", "Shift Management"] },
      { name: "Facilities Management", aliases: ["Property Management", "Site Management", "Maintenance"] },
    ],
  },
  {
    name: "Human Resources",
    aliases: ["HR", "People Operations", "People & Culture", "Talent Management", "Human Capital"],
    subFunctions: [
      { name: "Talent Acquisition", aliases: ["Recruiting", "Recruitment", "Hiring", "Staffing", "Candidate Screening"] },
      { name: "Onboarding", aliases: ["New Hire Onboarding", "Employee Onboarding", "Orientation"] },
      { name: "Performance Management", aliases: ["Performance Reviews", "Goal Setting", "Employee Evaluation"] },
      { name: "Learning & Development", aliases: ["Training", "L&D", "Employee Development", "Skills Development"] },
      { name: "Compensation & Benefits", aliases: ["Total Rewards", "Payroll", "Benefits Administration"] },
      { name: "Employee Relations", aliases: ["Labor Relations", "Employee Engagement", "Workplace Culture", "HRBP"] },
    ],
  },
  {
    name: "Information Technology",
    aliases: ["IT", "Technology", "Engineering", "Tech Ops", "IT Operations"],
    subFunctions: [
      { name: "Infrastructure", aliases: ["Infrastructure Management", "Cloud Operations", "Network Management", "Platform Engineering"] },
      { name: "Application Support", aliases: ["App Support", "Application Management", "Software Maintenance"] },
      { name: "Security", aliases: ["Cybersecurity", "Information Security", "IT Security", "Security Operations", "Security & Compliance"] },
      { name: "Service Desk", aliases: ["Help Desk", "IT Support", "Technical Support", "Tier 1 Support", "End User Support"] },
      { name: "Data Management", aliases: ["Data Engineering", "Database Administration", "Data Architecture", "Data Governance"] },
      { name: "Change Management", aliases: ["Release Management", "Deployment", "IT Change Management", "Configuration Management"] },
    ],
  },
  {
    name: "Customer Service",
    aliases: ["Customer Support", "Customer Experience", "CX", "Client Services", "Contact Center"],
    subFunctions: [
      { name: "Ticket Management", aliases: ["Case Management", "Issue Tracking", "Service Requests", "Incident Management"] },
      { name: "Knowledge Management", aliases: ["Knowledge Base", "Self-Service", "FAQ Management", "Help Center"] },
      { name: "Escalation Handling", aliases: ["Tier 2/3 Support", "Complex Issue Resolution", "Specialist Routing"] },
      { name: "Customer Communication", aliases: ["Outreach", "Customer Notifications", "Proactive Communication"] },
      { name: "Service Quality", aliases: ["QA Monitoring", "CSAT", "NPS", "Customer Satisfaction", "Satisfaction Monitoring"] },
      { name: "Self-Service", aliases: ["Chatbot", "Virtual Assistant", "Automated Support", "Digital Self-Service"] },
    ],
  },
  {
    name: "Legal & Compliance",
    aliases: ["Legal", "Compliance", "Regulatory", "Legal & Regulatory", "Risk & Compliance", "GRC"],
    subFunctions: [
      { name: "Contract Management", aliases: ["Contract Review", "Contract Lifecycle", "CLM", "Contract Administration"] },
      { name: "Regulatory Filing", aliases: ["Regulatory Compliance", "Filing", "Regulatory Reporting", "Compliance Reporting"] },
      { name: "Compliance Monitoring", aliases: ["Compliance Management", "Audit Management", "Policy Compliance", "Monitoring & Controls"] },
      { name: "Legal Research", aliases: ["Case Research", "Legal Analysis", "Precedent Research"] },
      { name: "Risk Assessment", aliases: ["Risk Management", "Risk Analysis", "Enterprise Risk", "Risk Mitigation"] },
      { name: "Policy Management", aliases: ["Policy Development", "Policy Administration", "Governance"] },
    ],
  },
  {
    name: "Supply Chain",
    aliases: ["Supply Chain Management", "SCM", "Procurement & Supply Chain", "Sourcing"],
    subFunctions: [
      { name: "Demand Planning", aliases: ["Demand Forecasting", "Demand Management", "Sales & Operations Planning", "S&OP"] },
      { name: "Procurement", aliases: ["Sourcing", "Purchasing", "Vendor Management", "Supplier Selection"] },
      { name: "Logistics", aliases: ["Transportation", "Shipping", "Distribution", "Freight Management"] },
      { name: "Inventory Optimization", aliases: ["Inventory Planning", "Stock Optimization", "Replenishment"] },
      { name: "Supplier Management", aliases: ["Supplier Collaboration", "Vendor Relations", "Supplier Performance"] },
      { name: "Route Optimization", aliases: ["Route Planning", "Fleet Management", "Delivery Optimization", "Last-Mile Delivery"] },
    ],
  },
  {
    name: "Product Management",
    aliases: ["Product", "Product Development", "Product Engineering", "R&D"],
    subFunctions: [
      { name: "Product Strategy", aliases: ["Product Planning", "Roadmap Management", "Product Vision"] },
      { name: "Requirements", aliases: ["Product Requirements", "Feature Definition", "User Stories", "PRD"] },
      { name: "Assortment Planning", aliases: ["Category Management", "Merchandising", "Product Mix", "SKU Management"] },
      { name: "Documentation", aliases: ["Technical Documentation", "Product Documentation", "Spec Management", "Technical Specs"] },
      { name: "User Research", aliases: ["Customer Research", "UX Research", "Voice of Customer", "Market Validation"] },
      { name: "Analytics", aliases: ["Product Analytics", "Usage Analytics", "Feature Analytics", "Telemetry"] },
    ],
  },
  {
    name: "Digital Commerce",
    aliases: ["E-Commerce", "eCommerce", "Online Sales", "Digital Sales", "Digital Retail"],
    subFunctions: [
      { name: "Search & Discovery", aliases: ["Product Search", "Site Search", "Browse & Search", "Product Discovery"] },
      { name: "Checkout & Payments", aliases: ["Payment Processing", "Cart Management", "Order Processing"] },
      { name: "Personalization", aliases: ["Recommendations", "Product Recommendations", "Dynamic Content"] },
      { name: "Content Management", aliases: ["Product Content", "Digital Content", "CMS", "Catalog Management"] },
      { name: "Customer Experience", aliases: ["UX", "Digital Experience", "Conversion Optimization", "CRO"] },
      { name: "Order Fulfillment", aliases: ["Order Management", "Fulfillment", "Ship-from-Store", "BOPIS"] },
    ],
  },
  // Industry-specific functions (flagged as such)
  {
    name: "Merchandising",
    aliases: ["Category Management", "Assortment", "Buying"],
    isIndustrySpecific: true,
    subFunctions: [
      { name: "Assortment Planning", aliases: ["Category Planning", "Product Selection", "Range Planning"] },
      { name: "Pricing Strategy", aliases: ["Price Optimization", "Promotional Pricing", "Markdown Management"] },
      { name: "Visual Merchandising", aliases: ["Store Layout", "Planogram", "Display Management"] },
      { name: "Vendor Negotiation", aliases: ["Buying", "Supplier Negotiation", "Trade Terms"] },
      { name: "Trend Analysis", aliases: ["Market Trends", "Consumer Trends", "Fashion Forecasting"] },
    ],
  },
  {
    name: "Logistics",
    aliases: ["Logistics & Distribution", "Transportation", "Shipping & Delivery"],
    isIndustrySpecific: true,
    subFunctions: [
      { name: "Route Optimization", aliases: ["Route Planning", "Fleet Routing", "Dynamic Routing"] },
      { name: "Warehouse Operations", aliases: ["Distribution Center", "DC Operations", "Fulfillment Center"] },
      { name: "Fleet Management", aliases: ["Vehicle Management", "Driver Management", "Transportation Management"] },
      { name: "Last-Mile Delivery", aliases: ["Home Delivery", "Final Mile", "Customer Delivery"] },
      { name: "Returns Processing", aliases: ["Reverse Logistics", "Return Management", "RMA"] },
    ],
  },
];

// Build lookup maps for fast access
export const FUNCTION_NAMES = FUNCTION_TAXONOMY.map(f => f.name);

export const FUNCTION_BY_NAME: Record<string, FunctionDef> = {};
FUNCTION_TAXONOMY.forEach(f => {
  FUNCTION_BY_NAME[f.name] = f;
});

// ============================================================================
// AI PRIMITIVES CATALOG
// ============================================================================

export interface AIPrimitiveDef {
  name: string;
  aliases: string[];
  description: string;
  examples: string[];
}

export const AI_PRIMITIVES_CATALOG: AIPrimitiveDef[] = [
  {
    name: "Research & Information Retrieval",
    aliases: ["Research", "Information Retrieval", "RAG", "Knowledge Retrieval", "Search", "Lookup"],
    description: "Search and surface relevant information from knowledge bases, documents, or external sources",
    examples: ["Policy lookup", "Knowledge search", "Document discovery", "Regulatory research"],
  },
  {
    name: "Content Creation",
    aliases: ["Content Generation", "Generation", "Text Generation", "Document Generation", "Writing"],
    description: "Create new content, documents, reports, or communications from patterns or prompts",
    examples: ["Report drafting", "Email composition", "Template completion", "Product descriptions"],
  },
  {
    name: "Data Analysis",
    aliases: ["Analytics", "Data Processing", "Analysis", "Pattern Recognition", "Prediction", "Forecasting"],
    description: "Analyze, classify, extract patterns from, or predict outcomes based on structured/unstructured data",
    examples: ["Demand forecasting", "Anomaly detection", "Classification", "Extraction", "Scoring"],
  },
  {
    name: "Conversational Interfaces",
    aliases: ["Conversational AI", "Chatbot", "Virtual Assistant", "Natural Language Interface", "Dialog"],
    description: "Natural language interaction for queries, guidance, and task completion",
    examples: ["Customer support chat", "Internal help desk", "Product finder", "Navigation assistant"],
  },
  {
    name: "Workflow Automation",
    aliases: ["Process Automation", "Automation", "Orchestration", "RPA", "Task Automation", "Routing"],
    description: "Automate multi-step business processes, routing, approvals, and system integrations",
    examples: ["Invoice processing", "Approval routing", "Case escalation", "Order processing"],
  },
  {
    name: "Coding Assistance",
    aliases: ["Code Generation", "Development", "Engineering", "Software Development", "Code Review"],
    description: "Generate, review, debug, or optimize code and technical implementations",
    examples: ["Code generation", "Bug detection", "Code review", "Test generation"],
  },
];

export const AI_PRIMITIVE_NAMES = AI_PRIMITIVES_CATALOG.map(p => p.name);

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Compute simple similarity score between two strings (case-insensitive).
 * Uses word overlap + substring matching for fuzzy matching.
 */
function similarityScore(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  // Exact match
  if (aLower === bLower) return 1.0;

  // One contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;

  // Word overlap
  const aWords = new Set(aLower.split(/[\s&,\-\/]+/).filter(w => w.length > 1));
  const bWords = new Set(bLower.split(/[\s&,\-\/]+/).filter(w => w.length > 1));

  let overlap = 0;
  aWords.forEach(w => {
    if (bWords.has(w)) overlap++;
    else {
      // Check partial match
      bWords.forEach(bw => {
        if (bw.includes(w) || w.includes(bw)) overlap += 0.5;
      });
    }
  });

  const maxWords = Math.max(aWords.size, bWords.size);
  if (maxWords === 0) return 0;

  return overlap / maxWords;
}

/**
 * Find the best matching canonical function name for a given input.
 * Returns the canonical name, or the input unchanged if no good match found.
 */
export function normalizeFunctionName(input: string): string {
  if (!input) return input;

  let bestMatch = "";
  let bestScore = 0;

  for (const func of FUNCTION_TAXONOMY) {
    // Check against canonical name
    let score = similarityScore(input, func.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = func.name;
    }

    // Check against aliases
    for (const alias of func.aliases) {
      score = similarityScore(input, alias);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = func.name;
      }
    }
  }

  // Require minimum confidence threshold
  if (bestScore >= 0.5) {
    return bestMatch;
  }

  // No good match found - return input as-is
  console.warn(`[TAXONOMY] No match for function: "${input}" (best: "${bestMatch}" @ ${bestScore.toFixed(2)})`);
  return input;
}

/**
 * Find the best matching canonical sub-function name for a given function and input.
 */
export function normalizeSubFunction(functionName: string, input: string): string {
  if (!input || !functionName) return input;

  // Find the function definition
  const funcDef = FUNCTION_TAXONOMY.find(f => f.name === functionName);
  if (!funcDef) {
    // Try all functions if the function name itself wasn't normalized
    let bestMatch = input;
    let bestScore = 0;

    for (const func of FUNCTION_TAXONOMY) {
      for (const subFunc of func.subFunctions) {
        const score = Math.max(
          similarityScore(input, subFunc.name),
          ...subFunc.aliases.map(a => similarityScore(input, a))
        );
        if (score > bestScore) {
          bestScore = score;
          bestMatch = subFunc.name;
        }
      }
    }

    return bestScore >= 0.5 ? bestMatch : input;
  }

  let bestMatch = "";
  let bestScore = 0;

  for (const subFunc of funcDef.subFunctions) {
    let score = similarityScore(input, subFunc.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = subFunc.name;
    }

    for (const alias of subFunc.aliases) {
      score = similarityScore(input, alias);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = subFunc.name;
      }
    }
  }

  if (bestScore >= 0.4) {
    return bestMatch;
  }

  // Check across ALL functions as fallback
  for (const func of FUNCTION_TAXONOMY) {
    if (func.name === functionName) continue;
    for (const subFunc of func.subFunctions) {
      const score = Math.max(
        similarityScore(input, subFunc.name),
        ...subFunc.aliases.map(a => similarityScore(input, a))
      );
      if (score > bestScore) {
        bestScore = score;
        bestMatch = subFunc.name;
      }
    }
  }

  if (bestScore >= 0.5) {
    return bestMatch;
  }

  console.warn(`[TAXONOMY] No sub-function match for "${input}" under "${functionName}" (best: "${bestMatch}" @ ${bestScore.toFixed(2)})`);
  return input;
}

/**
 * Normalize an AI primitive label to canonical form.
 */
export function normalizeAIPrimitive(input: string): string {
  if (!input) return input;

  // Handle comma-separated primitives
  if (input.includes(",")) {
    return input.split(",").map(p => normalizeAIPrimitive(p.trim())).join(", ");
  }

  let bestMatch = "";
  let bestScore = 0;

  for (const prim of AI_PRIMITIVES_CATALOG) {
    let score = similarityScore(input, prim.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = prim.name;
    }

    for (const alias of prim.aliases) {
      score = similarityScore(input, alias);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = prim.name;
      }
    }
  }

  return bestScore >= 0.4 ? bestMatch : input;
}

// ============================================================================
// FORMULA ANNOTATION
// ============================================================================

export interface FormulaComponent {
  value: string;
  label: string;
}

export interface AnnotatedFormula {
  components: FormulaComponent[];
  result: string;
  rawFormula: string;
}

/**
 * Parse a benefit formula string and return labeled components.
 *
 * Patterns:
 * Revenue: "12% × $340M × 0.95 × 0.75 = $17.4M → $17.4M"
 *   → Revenue Uplift, Revenue at Risk, Realization Factor, Data Maturity
 *
 * Cost: "127,000 hours × $150/hr × 1.35 × 0.90 × 0.75 = $10.4M → $10.4M"
 *   → Hours Saved, Hourly Rate, Benefits Loading, Adoption Rate, Data Maturity
 *
 * Cash Flow: "153,000,000,000 × (10 / 365) × 0.08 × 0.85 × 0.75 = $128.3M → $128.2M"
 *   → Annual Revenue, Days Improved / 365, Cost of Capital, Realization Factor, Data Maturity
 *
 * Risk: "25% × $40M × 0.80 × 0.75 = $1.8M → $1.8M"
 *   → Risk Reduction %, Risk Exposure, Realization Factor, Data Maturity
 */
export function annotateFormula(formulaStr: string, formulaType: "revenue" | "cost" | "cashflow" | "risk"): AnnotatedFormula | null {
  if (!formulaStr || formulaStr.toLowerCase().includes("no ") || formulaStr.toLowerCase().includes("n/a")) {
    return null;
  }

  // Extract the parts before '=' and the result after '='
  const eqParts = formulaStr.split("=");
  if (eqParts.length < 2) return null;

  const lhs = eqParts[0].trim();
  // Get the first result (before any →)
  const resultPart = eqParts[1].trim();
  const result = resultPart.split("→")[0].trim();

  // Split LHS by × (multiplication)
  const parts = lhs.split("×").map(p => p.trim()).filter(p => p.length > 0);

  if (parts.length === 0) return null;

  const labels: Record<string, string[]> = {
    revenue: ["Revenue Uplift", "Revenue at Risk", "Realization Factor", "Data Maturity"],
    cost: ["Hours Saved", "Hourly Rate", "Benefits Loading", "Adoption Rate", "Data Maturity"],
    cashflow: ["Annual Revenue", "Days Improved / 365", "Cost of Capital", "Realization Factor", "Data Maturity"],
    risk: ["Risk Reduction %", "Risk Exposure", "Realization Factor", "Data Maturity"],
  };

  const typeLabels = labels[formulaType] || [];

  const components: FormulaComponent[] = parts.map((part, i) => ({
    value: part,
    label: i < typeLabels.length ? typeLabels[i] : `Factor ${i + 1}`,
  }));

  return {
    components,
    result,
    rawFormula: formulaStr,
  };
}

// ============================================================================
// CROSS-STEP VERIFICATION
// ============================================================================

export interface VerificationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Verify that Function/Sub-Function values are consistent across steps.
 */
export function verifyFunctionConsistency(
  step2Data: any[], // KPIs
  step3Data: any[], // Friction Points
  step4Data: any[], // Use Cases
): VerificationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Collect function sets from each step
  const step2Functions = new Set(step2Data.map(r => r["Function"]).filter(Boolean));
  const step3Functions = new Set(step3Data.map(r => r["Function"]).filter(Boolean));
  const step4Functions = new Set(step4Data.map(r => r["Function"]).filter(Boolean));

  // Every function in Step 3 should have at least one KPI in Step 2
  step3Functions.forEach(fn => {
    if (!step2Functions.has(fn)) {
      warnings.push(`Friction function "${fn}" (Step 3) has no corresponding KPI in Step 2`);
    }
  });

  // Every function in Step 4 should have a friction point in Step 3
  step4Functions.forEach(fn => {
    if (!step3Functions.has(fn)) {
      warnings.push(`Use case function "${fn}" (Step 4) has no corresponding friction point in Step 3`);
    }
  });

  // Check sub-function alignment
  const step2SubFuncs = new Map<string, Set<string>>();
  step2Data.forEach(r => {
    const fn = r["Function"];
    const sf = r["Sub-Function"];
    if (fn && sf) {
      if (!step2SubFuncs.has(fn)) step2SubFuncs.set(fn, new Set());
      step2SubFuncs.get(fn)!.add(sf);
    }
  });

  step3Data.forEach(r => {
    const fn = r["Function"];
    const sf = r["Sub-Function"];
    if (fn && sf && step2SubFuncs.has(fn)) {
      if (!step2SubFuncs.get(fn)!.has(sf)) {
        warnings.push(`Friction sub-function "${sf}" under "${fn}" (Step 3) not in Step 2 KPIs`);
      }
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
  };
}

// ============================================================================
// TAXONOMY FOR AI PROMPT INJECTION
// ============================================================================

/**
 * Generate a formatted string of the function taxonomy for inclusion in AI prompts.
 */
export function getTaxonomyPromptText(): string {
  let text = "STANDARDIZED BUSINESS FUNCTION TAXONOMY:\n";
  text += "You MUST use ONLY these Function and Sub-Function values. Map company-specific terminology to the nearest canonical function.\n\n";

  for (const func of FUNCTION_TAXONOMY) {
    const tag = func.isIndustrySpecific ? " [Industry-Specific]" : "";
    text += `• ${func.name}${tag}\n`;
    for (const sf of func.subFunctions) {
      text += `  - ${sf.name}\n`;
    }
    text += "\n";
  }

  return text;
}

/**
 * Generate a formatted string of AI primitives for inclusion in AI prompts.
 */
export function getAIPrimitivesPromptText(): string {
  let text = "STANDARDIZED AI PRIMITIVES:\n";
  text += "You MUST classify each use case using ONLY these AI primitives. List 2-3 most relevant per use case.\n\n";

  for (const prim of AI_PRIMITIVES_CATALOG) {
    text += `• ${prim.name}: ${prim.description}\n`;
    text += `  Examples: ${prim.examples.join(", ")}\n`;
  }

  return text;
}

// ============================================================================
// STEP COLUMN ORDERING
// ============================================================================

/**
 * Defines the exact column order for each report step's table.
 * Columns not listed here will be appended at the end.
 * Columns listed here but not in data will be skipped.
 */
export const STEP_COLUMN_ORDER: Record<number, string[]> = {
  1: [ // Strategic Anchoring & Business Drivers
    "Strategic Theme",
    "Current State",
    "Target State",
    "Primary Driver Impact",
    "Secondary Driver",
  ],
  2: [ // Business Function Inventory & KPI Baselines
    "KPI Name",
    "Function",
    "Sub-Function",
    "Baseline Value",
    "Direction",
    "Target Value",
    "Benchmark (Avg)",
    "Benchmark (Industry Best)",
    "Benchmark (Overall Best)",
    // Fallback for old-format data
    "Industry Benchmark",
    "Timeframe",
    "Strategic Theme",
  ],
  3: [ // Friction Point Mapping
    "Friction Point",
    "Friction Type",
    "Function",
    "Sub-Function",
    "Estimated Annual Cost ($)",
    "Severity",
    "Primary Driver Impact",
    "Strategic Theme",
    // Hidden columns (shown in expanded view)
    // "Cost Formula", "Annual Hours", "Hourly Rate"
  ],
  4: [ // AI Use Case Generation
    "ID",
    "Use Case Name",
    "Description",
    "Target Friction",
    "AI Primitives",
    "Primary Pattern",
    "Alternative Pattern",
    "Pattern Rationale",
    "EPOCH Flags",
    "Human-in-the-Loop Checkpoint",
    "Function",
    "Sub-Function",
    "Strategic Theme",
  ],
  5: [ // Benefits Quantification by Driver
    "ID",
    "Use Case",
    "Total Annual Value ($)",
    "Probability of Success",
    "Expected Value ($)",
    "Revenue Benefit ($)",
    "Cost Benefit ($)",
    "Cash Flow Benefit ($)",
    "Risk Benefit ($)",
  ],
  6: [ // Readiness & Token Modeling
    "ID",
    "Use Case",
    "Readiness Score",
    "Organizational Capacity",
    "Data Availability & Quality",
    "Technical Infrastructure",
    "Governance",
    "Time To Value",
    "Monthly Tokens",
    "Runs/Month",
    "Input Tokens/Run",
    "Output Tokens/Run",
  ],
  7: [ // Priority Scoring & Roadmap
    "ID",
    "Use Case",
    "Priority Tier",
    "Recommended Phase",
    "Priority Score",
    "Readiness Score",
    "Value Score",
    "TTV Score",
  ],
};

/**
 * Key normalization map: handles variations in column names from AI output.
 * Maps common AI-generated key names to the canonical column name.
 */
export const COLUMN_NAME_ALIASES: Record<string, string> = {
  // Step 1
  "Primary Driver": "Primary Driver Impact",
  // Step 3
  "Estimated Annual Cost": "Estimated Annual Cost ($)",
  // Step 4
  "HITL Checkpoint": "Human-in-the-Loop Checkpoint",
  "Human-in-the-Loop": "Human-in-the-Loop Checkpoint",
  // Step 6 — new 4-component readiness system
  "Organizational Capacity (1-10)": "Organizational Capacity",
  "Data Availability & Quality (1-10)": "Data Availability & Quality",
  "Technical Infrastructure (1-10)": "Technical Infrastructure",
  "Governance (1-10)": "Governance",
  "Feasibility Score (1-10)": "Readiness Score",
  "Readiness Score (1-10)": "Readiness Score",
  // Step 6 — legacy aliases (backward compat)
  "Data Readiness (1-5)": "Data Readiness",
  "Integration Complexity (1-5)": "Integration Complexity",
  "Effort Score (1-5)": "Effort Score",
  "Change Mgmt (1-5)": "Change Mgmt",
  "Time-to-Value (months)": "Time To Value",
  "Time-to-Value": "Time To Value",
  "Time to Value": "Time To Value",
  "TTV": "Time To Value",
  "TTV (months)": "Time To Value",
  // Step 7 — new priority system
  "Priority Score (1-10)": "Priority Score",
  "Feasibility Score": "Readiness Score",
  "Value Score (1-10)": "Value Score",
  "TTV Score (0-1)": "TTV Score",
  // Step 2 benchmark rename
  "Industry Benchmark": "Benchmark (Avg)",
  // Step 2 measurement method (hidden)
  "Measurement Method": "Measurement Method",
};

/**
 * Reorder the columns of data rows according to the step's defined column order.
 * Also normalizes column names using COLUMN_NAME_ALIASES.
 */
export function reorderColumns(data: any[], stepNum: number): any[] {
  if (!data || data.length === 0) return data;

  const desiredOrder = STEP_COLUMN_ORDER[stepNum];
  if (!desiredOrder || desiredOrder.length === 0) return data;

  return data.map(row => {
    // First, normalize column names
    const normalizedRow: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      let canonicalKey = COLUMN_NAME_ALIASES[key] || key;
      if (stepNum === 4 && canonicalKey === 'Use Case') {
        canonicalKey = 'Use Case Name';
      }
      normalizedRow[canonicalKey] = value;
    }

    // Compute Expected Value for Step 5 if not present
    if (stepNum === 5 && !('Expected Value ($)' in normalizedRow)) {
      const totalStr = String(normalizedRow['Total Annual Value ($)'] || 0);
      const totalVal = parseFloat(totalStr.replace(/[^0-9.-]/g, '')) || 0;
      const prob = normalizedRow['Probability of Success'] || 0;
      const probNum = typeof prob === 'number' ? prob : parseFloat(String(prob)) || 0;
      const adjustedProb = probNum > 1 ? probNum / 100 : probNum;
      const ev = totalVal * adjustedProb;
      normalizedRow['Expected Value ($)'] = `$${ev.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
    }

    // Then reorder
    const reorderedRow: Record<string, any> = {};

    // Add columns in desired order (only if they exist in data)
    for (const col of desiredOrder) {
      if (col in normalizedRow) {
        reorderedRow[col] = normalizedRow[col];
      }
    }

    // Add remaining columns not in desired order
    for (const [key, value] of Object.entries(normalizedRow)) {
      if (!(key in reorderedRow)) {
        reorderedRow[key] = value;
      }
    }

    return reorderedRow;
  });
}
