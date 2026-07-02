/**
 * Standardized Loaded Hourly Rate Table
 *
 * Single source of truth for role classifications and fully-loaded hourly rates
 * used across all friction point calculations and benefit modeling.
 *
 * Rates are FULLY LOADED — they include:
 *   - Base wages
 *   - Benefits (health, retirement, PTO) — ~30% of base per BLS ECEC Q2 2025
 *   - Employer payroll taxes (FICA, FUTA, SUTA) — ~7.65%
 *   - Overhead (facilities, equipment, management) — ~15-25%
 *
 * Sources:
 *   - BLS Occupational Employment & Wage Statistics (OEWS), May 2024
 *   - BLS Employer Costs for Employee Compensation (ECEC), Q2 2025
 *   - Industry-specific salary surveys (Glassdoor, Salary.com, PayScale 2025)
 *   - Standard burden multiplier: 1.35–1.45x base wage (BLS private industry avg)
 *
 * Used by:
 *   - server/ai-service.ts (AI prompt injection — constrains role selection)
 *   - server/calculation-postprocessor.ts (role normalization & rate enforcement)
 *   - src/calc/formulas.ts (cost benefit calculations)
 *   - client/src/pages/WhatIfAnalysis.tsx (user rate adjustment UI)
 *   - All report generators (HTML, PDF, Dashboard)
 *
 * IMPORTANT: When using standardized rates, the benefitsLoading multiplier
 * should be set to 1.0 since these rates already include benefits.
 */

// ============================================================================
// TYPES
// ============================================================================

export type RoleCategory = 'operational' | 'professional' | 'specialized' | 'management';

export interface StandardizedRole {
  /** Unique identifier, e.g., "ROLE_OPS_CUST_SVC_REP" */
  roleId: string;
  /** Display name, e.g., "Customer Service Representative" */
  roleName: string;
  /** Short description of the role's responsibilities */
  description: string;
  /** Maps to canonical FUNCTION_TAXONOMY function names */
  functionMapping: string[];
  /** Fully-loaded hourly rate (USD) including all benefits and overhead */
  defaultLoadedHourlyRate: number;
  /** Whether this role is specific to certain industries */
  isIndustrySpecific: boolean;
  /** Which industries this role applies to (if industry-specific) */
  industryApplicability?: string[];
  /** Role tier for reporting grouping */
  category: RoleCategory;
  /** Common aliases the AI might generate instead of the canonical name */
  aliases: string[];
}

// ============================================================================
// STANDARDIZED ROLE TABLE (~25 roles)
// ============================================================================

export const STANDARDIZED_ROLES: StandardizedRole[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // OPERATIONAL ROLES ($45–$75/hr loaded)
  // Entry-level and front-line positions with routine task execution
  // ─────────────────────────────────────────────────────────────────────────
  {
    roleId: "ROLE_OPS_ADMIN_COORD",
    roleName: "Administrative Coordinator",
    description: "Handles scheduling, data entry, filing, correspondence, and general office administration",
    functionMapping: ["Operations", "Human Resources", "Finance"],
    defaultLoadedHourlyRate: 55,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["Admin Assistant", "Administrative Assistant", "Office Coordinator", "Office Admin", "Clerical Staff", "Secretary"],
  },
  {
    roleId: "ROLE_OPS_CUST_SVC_REP",
    roleName: "Customer Service Representative",
    description: "Handles inbound inquiries, complaints, order issues, and first-level customer support",
    functionMapping: ["Customer Service", "Operations"],
    defaultLoadedHourlyRate: 50,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["Customer Support Rep", "CSR", "Call Center Agent", "Contact Center Agent", "Support Agent", "Service Agent"],
  },
  {
    roleId: "ROLE_OPS_DATA_ENTRY",
    roleName: "Data Entry Specialist",
    description: "Manual data input, form processing, record maintenance, and data cleanup tasks",
    functionMapping: ["Operations", "Finance", "Information Technology"],
    defaultLoadedHourlyRate: 45,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["Data Entry Clerk", "Data Processing Clerk", "Records Clerk", "Data Input Specialist"],
  },
  {
    roleId: "ROLE_OPS_WAREHOUSE",
    roleName: "Warehouse Associate",
    description: "Receiving, picking, packing, shipping, and inventory management in distribution facilities",
    functionMapping: ["Supply Chain", "Logistics", "Operations"],
    defaultLoadedHourlyRate: 55,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["Warehouse Worker", "Distribution Associate", "Fulfillment Associate", "DC Associate", "Picker/Packer"],
  },
  {
    roleId: "ROLE_OPS_STORE_ASSOC",
    roleName: "Store Associate",
    description: "In-store customer assistance, shelf stocking, register operations, and store maintenance",
    functionMapping: ["Operations", "Customer Service", "Sales"],
    defaultLoadedHourlyRate: 50,
    isIndustrySpecific: true,
    industryApplicability: ["Retail", "Grocery", "Home Improvement", "Specialty Retail"],
    category: "operational",
    aliases: ["Retail Associate", "Sales Associate", "Store Clerk", "Retail Clerk", "Floor Associate", "Store Staff"],
  },
  {
    roleId: "ROLE_OPS_HELP_DESK",
    roleName: "Help Desk Technician",
    description: "Tier 1 IT support, password resets, hardware/software troubleshooting, ticket management",
    functionMapping: ["Information Technology", "Operations"],
    defaultLoadedHourlyRate: 60,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["IT Support", "Service Desk Analyst", "Help Desk Analyst", "IT Support Specialist", "Tier 1 Support", "Desktop Support"],
  },
  {
    roleId: "ROLE_OPS_QA_INSPECTOR",
    roleName: "Quality Inspector",
    description: "Product/process quality checks, compliance auditing, defect tracking, and inspection documentation",
    functionMapping: ["Operations", "Supply Chain"],
    defaultLoadedHourlyRate: 60,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["QA Inspector", "Quality Control", "Quality Assurance Technician", "Inspection Specialist", "Quality Checker"],
  },
  {
    roleId: "ROLE_OPS_INVENTORY",
    roleName: "Inventory Clerk",
    description: "Cycle counts, stock reconciliation, inventory audits, and shrinkage tracking",
    functionMapping: ["Operations", "Supply Chain", "Merchandising"],
    defaultLoadedHourlyRate: 50,
    isIndustrySpecific: false,
    category: "operational",
    aliases: ["Inventory Specialist", "Stock Clerk", "Inventory Associate", "Inventory Controller", "Stockroom Clerk"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PROFESSIONAL ROLES ($75–$110/hr loaded)
  // Knowledge workers requiring specialized education or training
  // ─────────────────────────────────────────────────────────────────────────
  {
    roleId: "ROLE_PRO_BIZ_ANALYST",
    roleName: "Business Analyst",
    description: "Requirements gathering, process analysis, data analysis, reporting, and stakeholder communication",
    functionMapping: ["Operations", "Finance", "Information Technology", "Product Management"],
    defaultLoadedHourlyRate: 95,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["BA", "Business Systems Analyst", "Management Analyst", "Process Analyst", "Business Intelligence Analyst"],
  },
  {
    roleId: "ROLE_PRO_FIN_ANALYST",
    roleName: "Financial Analyst",
    description: "Budgeting, forecasting, variance analysis, financial modeling, and management reporting",
    functionMapping: ["Finance"],
    defaultLoadedHourlyRate: 100,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Finance Analyst", "FP&A Analyst", "Budget Analyst", "Financial Planning Analyst", "Corporate Finance Analyst"],
  },
  {
    roleId: "ROLE_PRO_MKTG_SPEC",
    roleName: "Marketing Specialist",
    description: "Campaign execution, content creation, social media management, email marketing, and analytics",
    functionMapping: ["Marketing", "Digital Commerce"],
    defaultLoadedHourlyRate: 85,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Marketing Coordinator", "Digital Marketing Specialist", "Content Specialist", "Marketing Analyst", "Campaign Manager"],
  },
  {
    roleId: "ROLE_PRO_SALES_REP",
    roleName: "Sales Representative",
    description: "Lead qualification, demos, proposal creation, negotiation, and account management",
    functionMapping: ["Sales"],
    defaultLoadedHourlyRate: 90,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Account Executive", "Sales Associate", "Sales Consultant", "Business Development Rep", "BDR", "SDR", "Sales Agent"],
  },
  {
    roleId: "ROLE_PRO_HR_SPEC",
    roleName: "HR Specialist",
    description: "Recruiting, onboarding, benefits administration, employee relations, and compliance",
    functionMapping: ["Human Resources"],
    defaultLoadedHourlyRate: 80,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["HR Coordinator", "Recruiter", "Talent Acquisition Specialist", "HR Generalist", "People Operations"],
  },
  {
    roleId: "ROLE_PRO_PROCUREMENT",
    roleName: "Procurement Specialist",
    description: "Vendor selection, purchase orders, contract negotiation, and supplier relationship management",
    functionMapping: ["Supply Chain", "Operations", "Finance"],
    defaultLoadedHourlyRate: 85,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Buyer", "Purchasing Agent", "Sourcing Specialist", "Procurement Analyst", "Supply Chain Coordinator"],
  },
  {
    roleId: "ROLE_PRO_ACCOUNTANT",
    roleName: "Accountant",
    description: "Journal entries, reconciliations, month-end close, financial reporting, and audit support",
    functionMapping: ["Finance"],
    defaultLoadedHourlyRate: 90,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Staff Accountant", "Senior Accountant", "GL Accountant", "AP/AR Specialist", "Bookkeeper"],
  },
  {
    roleId: "ROLE_PRO_TECH_WRITER",
    roleName: "Technical Writer",
    description: "Documentation creation, process documentation, knowledge base articles, and training materials",
    functionMapping: ["Information Technology", "Operations", "Product Management"],
    defaultLoadedHourlyRate: 80,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Documentation Specialist", "Content Writer", "Knowledge Manager", "Technical Communicator"],
  },
  {
    roleId: "ROLE_PRO_CUST_SVC_SPEC",
    roleName: "Customer Support Specialist",
    description: "Tier 2 escalation handling, complex issue resolution, product expertise, and customer advocacy",
    functionMapping: ["Customer Service", "Operations"],
    defaultLoadedHourlyRate: 65,
    isIndustrySpecific: false,
    category: "professional",
    aliases: ["Customer Experience Specialist", "Senior Customer Service", "Escalation Specialist", "Customer Success Associate"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SPECIALIZED ROLES ($100–$140/hr loaded)
  // Require deep domain expertise, certifications, or advanced skills
  // ─────────────────────────────────────────────────────────────────────────
  {
    roleId: "ROLE_SPEC_SOFTWARE_DEV",
    roleName: "Software Developer",
    description: "Application development, API integration, code review, and technical architecture",
    functionMapping: ["Information Technology", "Digital Commerce"],
    defaultLoadedHourlyRate: 125,
    isIndustrySpecific: false,
    category: "specialized",
    aliases: ["Software Engineer", "Developer", "Programmer", "Full-Stack Developer", "Application Developer"],
  },
  {
    roleId: "ROLE_SPEC_SC_ANALYST",
    roleName: "Supply Chain Analyst",
    description: "Demand forecasting, inventory optimization, logistics analysis, and S&OP planning",
    functionMapping: ["Supply Chain", "Logistics", "Operations"],
    defaultLoadedHourlyRate: 100,
    isIndustrySpecific: false,
    category: "specialized",
    aliases: ["Demand Planner", "Logistics Analyst", "Supply Planning Analyst", "Inventory Analyst", "S&OP Analyst"],
  },
  {
    roleId: "ROLE_SPEC_MERCH_ANALYST",
    roleName: "Merchandising Analyst",
    description: "Assortment planning, SKU rationalization, pricing analysis, and vendor performance",
    functionMapping: ["Merchandising", "Product Management", "Operations"],
    defaultLoadedHourlyRate: 100,
    isIndustrySpecific: true,
    industryApplicability: ["Retail", "Grocery", "Home Improvement", "Fashion", "Specialty Retail"],
    category: "specialized",
    aliases: ["Category Analyst", "Merchandise Planner", "Assortment Planner", "Retail Analyst", "Category Manager"],
  },
  {
    roleId: "ROLE_SPEC_COMPLIANCE",
    roleName: "Compliance Officer",
    description: "Regulatory monitoring, policy enforcement, audit support, and risk assessment",
    functionMapping: ["Legal & Compliance", "Finance"],
    defaultLoadedHourlyRate: 110,
    isIndustrySpecific: false,
    category: "specialized",
    aliases: ["Compliance Analyst", "Regulatory Specialist", "Risk & Compliance Officer", "GRC Analyst", "Audit Specialist"],
  },
  {
    roleId: "ROLE_SPEC_PROJECT_MGR",
    roleName: "Project Manager",
    description: "Project planning, resource coordination, timeline management, risk mitigation, and stakeholder reporting",
    functionMapping: ["Operations", "Information Technology", "Product Management"],
    defaultLoadedHourlyRate: 115,
    isIndustrySpecific: false,
    category: "specialized",
    aliases: ["PM", "Program Manager", "Delivery Manager", "Engagement Manager", "Implementation Manager"],
  },
  {
    roleId: "ROLE_SPEC_DATA_ANALYST",
    roleName: "Data Analyst",
    description: "Data extraction, transformation, visualization, statistical analysis, and reporting",
    functionMapping: ["Information Technology", "Operations", "Finance", "Marketing"],
    defaultLoadedHourlyRate: 100,
    isIndustrySpecific: false,
    category: "specialized",
    aliases: ["Data Scientist", "Analytics Specialist", "BI Analyst", "Reporting Analyst", "Insights Analyst"],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MANAGEMENT ROLES ($130–$175/hr loaded)
  // Leadership positions with P&L or team management responsibility
  // ─────────────────────────────────────────────────────────────────────────
  {
    roleId: "ROLE_MGT_OPS_MGR",
    roleName: "Operations Manager",
    description: "Department P&L ownership, team leadership, process governance, and cross-functional coordination",
    functionMapping: ["Operations", "Supply Chain", "Customer Service"],
    defaultLoadedHourlyRate: 140,
    isIndustrySpecific: false,
    category: "management",
    aliases: ["General Manager", "Department Manager", "Ops Manager", "Regional Manager", "Store Manager", "Branch Manager"],
  },
  {
    roleId: "ROLE_MGT_DIRECTOR",
    roleName: "Department Director",
    description: "Strategic planning, budget ownership, organizational design, and executive reporting",
    functionMapping: ["Operations", "Finance", "Marketing", "Sales", "Human Resources", "Information Technology"],
    defaultLoadedHourlyRate: 175,
    isIndustrySpecific: false,
    category: "management",
    aliases: ["Director", "VP", "Vice President", "Senior Director", "Head of Department", "AVP"],
  },
  {
    roleId: "ROLE_MGT_TECH_LEAD",
    roleName: "Senior Technical Lead",
    description: "Architecture decisions, technical strategy, team mentoring, and system design review",
    functionMapping: ["Information Technology", "Digital Commerce"],
    defaultLoadedHourlyRate: 155,
    isIndustrySpecific: false,
    category: "management",
    aliases: ["Tech Lead", "Principal Engineer", "Staff Engineer", "Solutions Architect", "Technical Architect", "Engineering Manager"],
  },
];

// ============================================================================
// LOOKUP MAPS & HELPER FUNCTIONS
// ============================================================================

/** Map of roleId → StandardizedRole for O(1) lookup */
const ROLE_BY_ID = new Map<string, StandardizedRole>();
STANDARDIZED_ROLES.forEach(r => ROLE_BY_ID.set(r.roleId, r));

/** Map of lowercase roleName → StandardizedRole for name-based lookup */
const ROLE_BY_NAME = new Map<string, StandardizedRole>();
STANDARDIZED_ROLES.forEach(r => {
  ROLE_BY_NAME.set(r.roleName.toLowerCase(), r);
  // Also index aliases
  r.aliases.forEach(alias => ROLE_BY_NAME.set(alias.toLowerCase(), r));
});

/**
 * Get a role by its ID.
 */
export function getRoleById(roleId: string): StandardizedRole | undefined {
  return ROLE_BY_ID.get(roleId);
}

/**
 * Get the loaded hourly rate for a given role ID.
 * Returns the default rate from the standardized table.
 */
export function getRoleRate(roleId: string): number {
  const role = ROLE_BY_ID.get(roleId);
  return role ? role.defaultLoadedHourlyRate : 75; // Default fallback
}

/**
 * Find the best matching role for a given function name.
 * Returns the first role whose functionMapping includes the given function.
 * If multiple matches, prefers 'professional' category.
 */
export function getRoleByFunction(functionName: string): StandardizedRole | undefined {
  const matches = STANDARDIZED_ROLES.filter(r =>
    r.functionMapping.some(fn => fn.toLowerCase() === functionName.toLowerCase())
  );

  if (matches.length === 0) return undefined;

  // Prefer professional > specialized > operational > management
  const preferenceOrder: RoleCategory[] = ['professional', 'specialized', 'operational', 'management'];
  for (const cat of preferenceOrder) {
    const match = matches.find(r => r.category === cat);
    if (match) return match;
  }

  return matches[0];
}

/**
 * Get all roles applicable to a specific industry.
 * Returns all non-industry-specific roles plus industry-specific ones that match.
 */
export function getRolesForIndustry(industry?: string): StandardizedRole[] {
  if (!industry) return STANDARDIZED_ROLES.filter(r => !r.isIndustrySpecific);

  return STANDARDIZED_ROLES.filter(r => {
    if (!r.isIndustrySpecific) return true;
    if (!r.industryApplicability) return false;
    return r.industryApplicability.some(ind =>
      ind.toLowerCase() === industry.toLowerCase() ||
      industry.toLowerCase().includes(ind.toLowerCase())
    );
  });
}

/**
 * Normalize a role name input to the canonical standardized role.
 * Uses exact match, alias match, and fuzzy matching.
 *
 * @param input - The role name to normalize (e.g., "store clerk", "Professional Services Staff")
 * @param functionHint - Optional function name to help disambiguate
 * @returns The matched StandardizedRole, or undefined if no match
 */
export function normalizeRoleName(input: string, functionHint?: string): StandardizedRole | undefined {
  if (!input) return undefined;

  const inputLower = input.toLowerCase().trim();

  // 1. Exact match on role name or alias
  const exactMatch = ROLE_BY_NAME.get(inputLower);
  if (exactMatch) return exactMatch;

  // 2. Substring/contains matching
  for (const role of STANDARDIZED_ROLES) {
    if (inputLower.includes(role.roleName.toLowerCase()) ||
        role.roleName.toLowerCase().includes(inputLower)) {
      return role;
    }
    for (const alias of role.aliases) {
      if (inputLower.includes(alias.toLowerCase()) ||
          alias.toLowerCase().includes(inputLower)) {
        return role;
      }
    }
  }

  // 3. Word overlap fuzzy matching
  const inputWords = new Set(inputLower.split(/[\s&,\-\/]+/).filter(w => w.length > 2));
  let bestMatch: StandardizedRole | undefined;
  let bestScore = 0;

  for (const role of STANDARDIZED_ROLES) {
    // Score against role name
    const roleWords = new Set(role.roleName.toLowerCase().split(/[\s&,\-\/]+/).filter(w => w.length > 2));
    let overlap = 0;
    inputWords.forEach(w => {
      roleWords.forEach(rw => {
        if (rw === w) overlap += 1;
        else if (rw.includes(w) || w.includes(rw)) overlap += 0.5;
      });
    });
    const score = overlap / Math.max(inputWords.size, roleWords.size, 1);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = role;
    }

    // Also score against aliases
    for (const alias of role.aliases) {
      const aliasWords = new Set(alias.toLowerCase().split(/[\s&,\-\/]+/).filter(w => w.length > 2));
      let aliasOverlap = 0;
      inputWords.forEach(w => {
        aliasWords.forEach(aw => {
          if (aw === w) aliasOverlap += 1;
          else if (aw.includes(w) || w.includes(aw)) aliasOverlap += 0.5;
        });
      });
      const aliasScore = aliasOverlap / Math.max(inputWords.size, aliasWords.size, 1);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        bestMatch = role;
      }
    }
  }

  // Require minimum confidence
  if (bestScore >= 0.4 && bestMatch) {
    return bestMatch;
  }

  // 4. Fallback: try to match by function hint
  if (functionHint) {
    return getRoleByFunction(functionHint);
  }

  return undefined;
}

/**
 * Get the loaded rate for a role, with override support.
 * Checks user overrides first, then falls back to standardized rate.
 *
 * @param roleId - The standardized role ID
 * @param overrides - Optional map of roleId → overridden rate from user assumptions
 * @returns The loaded hourly rate to use in calculations
 */
export function getEffectiveRate(roleId: string, overrides?: Record<string, number>): number {
  if (overrides && overrides[roleId] !== undefined) {
    return overrides[roleId];
  }
  return getRoleRate(roleId);
}

/**
 * Generate a formatted string of standardized roles for AI prompt injection.
 * Used in ai-service.ts to constrain role selection in Step 3.
 */
export function getStandardizedRolesPromptText(): string {
  let text = "\nSTANDARDIZED ROLES & LOADED HOURLY RATES:\n";
  text += "For each friction point, assign the MOST APPROPRIATE role from this list.\n";
  text += "Use the exact Role Name. The loaded hourly rate already includes wages, benefits, and overhead.\n\n";

  const categories: RoleCategory[] = ['operational', 'professional', 'specialized', 'management'];
  const categoryLabels: Record<RoleCategory, string> = {
    operational: "Operational Roles",
    professional: "Professional Roles",
    specialized: "Specialized Roles",
    management: "Management Roles",
  };

  for (const cat of categories) {
    const roles = STANDARDIZED_ROLES.filter(r => r.category === cat);
    text += `${categoryLabels[cat]}:\n`;
    for (const role of roles) {
      const tag = role.isIndustrySpecific ? ` [Industry: ${role.industryApplicability?.join(', ')}]` : '';
      text += `  • ${role.roleName} — $${role.defaultLoadedHourlyRate}/hr${tag}\n`;
      text += `    Functions: ${role.functionMapping.join(', ')}\n`;
    }
    text += "\n";
  }

  return text;
}

/**
 * Get all roles grouped by category for display in the UI.
 */
export function getRolesGroupedByCategory(): Record<RoleCategory, StandardizedRole[]> {
  return {
    operational: STANDARDIZED_ROLES.filter(r => r.category === 'operational'),
    professional: STANDARDIZED_ROLES.filter(r => r.category === 'professional'),
    specialized: STANDARDIZED_ROLES.filter(r => r.category === 'specialized'),
    management: STANDARDIZED_ROLES.filter(r => r.category === 'management'),
  };
}

/**
 * Benefits loading constant for standardized roles.
 * Since standardized rates are already fully loaded, this should be 1.0.
 */
export const STANDARDIZED_BENEFITS_LOADING = 1.0;

/**
 * Verify that all friction points in a dataset use standardized roles.
 * Returns verification results for audit trail.
 */
export interface RoleVerificationEntry {
  frictionPoint: string;
  originalRole?: string;
  originalRate?: number;
  matchedRole: string;
  matchedRoleId: string;
  standardizedRate: number;
  wasNormalized: boolean;
  confidence: 'exact' | 'alias' | 'fuzzy' | 'function-fallback' | 'default';
}

export function verifyAndNormalizeRoles(
  frictionPoints: any[],
  functionField: string = 'Function',
  rateField: string = 'Hourly Rate',
): RoleVerificationEntry[] {
  const entries: RoleVerificationEntry[] = [];

  for (const fp of frictionPoints) {
    const frictionName = fp['Friction Point'] || fp['frictionPoint'] || 'Unknown';
    const originalRole = fp['Role'] || fp['role'];
    const originalRate = typeof fp[rateField] === 'number' ? fp[rateField] : parseFloat(String(fp[rateField] || '0'));
    const functionName = fp[functionField] || '';

    // Try to normalize the role
    let matched: StandardizedRole | undefined;
    let confidence: RoleVerificationEntry['confidence'] = 'default';

    if (originalRole) {
      matched = normalizeRoleName(originalRole, functionName);
      if (matched) {
        // Determine confidence level
        if (matched.roleName.toLowerCase() === originalRole.toLowerCase() ||
            matched.aliases.some(a => a.toLowerCase() === originalRole.toLowerCase())) {
          confidence = 'exact';
        } else {
          confidence = 'fuzzy';
        }
      }
    }

    if (!matched && functionName) {
      matched = getRoleByFunction(functionName);
      confidence = matched ? 'function-fallback' : 'default';
    }

    // Fallback to a generic professional role
    if (!matched) {
      matched = STANDARDIZED_ROLES.find(r => r.roleId === 'ROLE_PRO_BIZ_ANALYST')!;
      confidence = 'default';
    }

    entries.push({
      frictionPoint: frictionName,
      originalRole,
      originalRate,
      matchedRole: matched.roleName,
      matchedRoleId: matched.roleId,
      standardizedRate: matched.defaultLoadedHourlyRate,
      wasNormalized: confidence !== 'exact',
      confidence,
    });

    // Update the friction point data with standardized values
    fp['Role'] = matched.roleName;
    fp[rateField] = matched.defaultLoadedHourlyRate;
    fp['Role ID'] = matched.roleId;
  }

  return entries;
}
