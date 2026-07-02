// server/assumption-export.ts
// Comprehensive assumption data export in Excel (ExcelJS) and JSON formats.
// Exports every reference table, formula definition, and scoring rule used
// by the ResearchApp calculation pipeline so analysts can audit every input.

import ExcelJS from 'exceljs';
import { STANDARDIZED_ROLES } from '../shared/standardizedRoles';
import { FUNCTION_TAXONOMY, AI_PRIMITIVES_CATALOG, STEP_COLUMN_ORDER } from '../shared/taxonomy';
import { DEFAULT_ASSUMPTIONS, CATEGORY_LABELS } from '../shared/schema';
import { INPUT_BOUNDS } from '../src/calc/formulas';

// ---------------------------------------------------------------------------
// Helper: auto-size columns based on header and cell content
// ---------------------------------------------------------------------------
function autoSizeColumns(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 60);
  });
}

// ---------------------------------------------------------------------------
// Helper: bold the header row
// ---------------------------------------------------------------------------
function boldHeaderRow(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.commit();
}

// ---------------------------------------------------------------------------
// Helper: add a sheet with headers, rows, and formatting
// ---------------------------------------------------------------------------
function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: (string | number | undefined | null)[][],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers);
  for (const row of rows) {
    ws.addRow(row);
  }
  boldHeaderRow(ws);
  autoSizeColumns(ws);
  return ws;
}

// ============================================================================
// 1. Standardized Roles
// ============================================================================
function standardizedRolesRows() {
  return STANDARDIZED_ROLES.map((r) => ({
    roleName: r.roleName,
    roleId: r.roleId,
    category: r.category,
    hourlyRate: r.defaultLoadedHourlyRate,
    functions: r.functionMapping.join(', '),
    description: r.description,
    aliases: r.aliases.join(', '),
  }));
}

// ============================================================================
// 2. Business Functions
// ============================================================================
function businessFunctionsRows() {
  const rows: { function_: string; subFunction: string; aliases: string }[] = [];
  for (const fn of FUNCTION_TAXONOMY) {
    // Parent row
    rows.push({
      function_: fn.name,
      subFunction: '',
      aliases: fn.aliases.join(', '),
    });
    // Sub-function rows
    for (const sf of fn.subFunctions) {
      rows.push({
        function_: fn.name,
        subFunction: sf.name,
        aliases: sf.aliases.join(', '),
      });
    }
  }
  return rows;
}

// ============================================================================
// 3. AI Primitives
// ============================================================================
function aiPrimitivesRows() {
  return AI_PRIMITIVES_CATALOG.map((p) => ({
    name: p.name,
    description: p.description,
    examples: p.examples.join(', '),
  }));
}

// ============================================================================
// 4. Default Assumptions
// ============================================================================
function defaultAssumptionsRows() {
  const rows: {
    category: string;
    fieldName: string;
    displayName: string;
    defaultValue: string;
    valueType: string;
    unit: string;
    description: string;
    usedInSteps: string;
  }[] = [];

  for (const [catKey, fields] of Object.entries(DEFAULT_ASSUMPTIONS)) {
    const label = CATEGORY_LABELS[catKey as keyof typeof CATEGORY_LABELS] ?? catKey;
    for (const f of fields) {
      rows.push({
        category: label,
        fieldName: f.fieldName,
        displayName: f.displayName,
        defaultValue: f.defaultValue,
        valueType: f.valueType,
        unit: f.unit ?? '',
        description: f.description,
        usedInSteps: f.usedInSteps?.join(', ') ?? '',
      });
    }
  }
  return rows;
}

// ============================================================================
// 5. Benefit Formulas (hardcoded descriptive reference)
// ============================================================================
function benefitFormulasRows() {
  return [
    {
      name: 'Cost Benefit',
      expression: 'Hours Saved x Loaded Rate x Benefits Loading x Adoption Rate x Data Maturity',
      components: 'Hours Saved, Loaded Hourly Rate, Benefits Loading (1.35), Adoption Rate, Data Maturity Multiplier',
      description:
        'Quantifies labor-cost savings by converting automated hours into dollar value, adjusted for employer overhead, user adoption, and data readiness.',
    },
    {
      name: 'Revenue Benefit',
      expression: 'Revenue Uplift % x Revenue at Risk x Realization Factor x Data Maturity',
      components: 'Revenue Uplift %, Baseline Revenue at Risk, Realization Factor (0.95), Data Maturity Multiplier',
      description:
        'Estimates incremental revenue from AI-driven improvements such as conversion rate lifts or cross-sell, tempered by a realization factor and data quality.',
    },
    {
      name: 'Cash Flow Benefit',
      expression: 'Days Improvement x (Annual Revenue / 365) x Cost of Capital x Realization Factor x Data Maturity',
      components: 'Days Improvement, Annual Revenue, Cost of Capital, Realization Factor (0.85), Data Maturity Multiplier',
      description:
        'Values the working-capital release from shortening cash-conversion cycles (e.g., DSO reduction), discounted by the cost of capital.',
    },
    {
      name: 'Risk Benefit',
      expression: '(Prob Before x Impact Before - Prob After x Impact After) x Realization Factor x Data Maturity',
      components:
        'Probability Before, Impact Before, Probability After, Impact After, Realization Factor (0.80), Data Maturity Multiplier',
      description:
        'Measures the expected-value reduction in risk exposure (probability x impact) between the current and AI-assisted states.',
    },
  ];
}

// ============================================================================
// 6. Readiness Scoring (hardcoded reference)
// ============================================================================
function readinessScoringRows() {
  return [
    {
      component: 'Organizational Capacity',
      weight: 30,
      scale: '1-10',
      description: 'AI talent, leadership buy-in, and change-management readiness.',
    },
    {
      component: 'Data Availability & Quality',
      weight: 30,
      scale: '1-10',
      description: 'System integration maturity, data governance, and data quality.',
    },
    {
      component: 'Technical Infrastructure',
      weight: 20,
      scale: '1-10',
      description: 'Cloud readiness, API availability, and compute capacity.',
    },
    {
      component: 'AI-Specific Governance',
      weight: 20,
      scale: '1-10',
      description: 'Ethics board, responsible-AI framework, and compliance guardrails.',
    },
    {
      component: 'Readiness Score (Composite)',
      weight: 100,
      scale: '1-10',
      description:
        'Formula: (OrgCap x 0.30) + (DataQual x 0.30) + (TechInfra x 0.20) + (Governance x 0.20). Weighted sum of the four components above.',
    },
  ];
}

// ============================================================================
// 7. Priority Scoring (hardcoded reference)
// ============================================================================
function priorityScoringRows() {
  return [
    {
      component: 'Readiness Score',
      weight: 50,
      formulaOrThreshold: '(OrgCap x 0.30) + (DataQual x 0.30) + (TechInfra x 0.20) + (Gov x 0.20)',
      description: 'Composite readiness from Step 6, weighted 50% in the priority formula.',
    },
    {
      component: 'Normalized Value Score',
      weight: 50,
      formulaOrThreshold: '1 + ((Value - Min) / (Max - Min)) x 9',
      description:
        'Min-max normalization of total annual benefit across all use cases. All equal values map to 5.5. Weighted 50% in the priority formula.',
    },
    {
      component: 'Priority Score',
      weight: 100,
      formulaOrThreshold: '(Readiness x 0.5) + (Normalized Value x 0.5)',
      description: 'Final composite score used to assign each use case to a priority tier.',
    },
    {
      component: 'Tier: Champions',
      weight: 0,
      formulaOrThreshold: 'Priority Score >= 7.5',
      description: 'Highest-impact, highest-readiness use cases. Deploy first.',
    },
    {
      component: 'Tier: Quick Wins',
      weight: 0,
      formulaOrThreshold: 'Value < 5.5 AND Readiness >= 5.5',
      description: 'High readiness but lower financial impact. Fast to implement.',
    },
    {
      component: 'Tier: Strategic',
      weight: 0,
      formulaOrThreshold: 'Value >= 5.5 AND Readiness < 5.5',
      description: 'High value but gaps in readiness. Invest in enablement first.',
    },
    {
      component: 'Tier: Foundation',
      weight: 0,
      formulaOrThreshold: 'Otherwise (Priority Score < 5.0)',
      description: 'Lower value and readiness. Build foundational capabilities before pursuing.',
    },
  ];
}

// ============================================================================
// 8. Input Bounds
// ============================================================================
function inputBoundsRows() {
  return Object.entries(INPUT_BOUNDS).map(([key, bound]) => ({
    field: key,
    label: bound.label,
    min: bound.min,
    max: bound.max,
  }));
}

// ============================================================================
// 9. Column Definitions (per step)
// ============================================================================
function columnDefinitionsRows() {
  const rows: { step: number; columnName: string }[] = [];
  for (const [stepStr, cols] of Object.entries(STEP_COLUMN_ORDER)) {
    const stepNum = Number(stepStr);
    for (const col of cols) {
      rows.push({ step: stepNum, columnName: col });
    }
  }
  return rows;
}

// ============================================================================
// 10. Report Assumptions (runtime parameter)
// ============================================================================
function reportAssumptionsRows(reportAssumptions?: any[]) {
  if (!reportAssumptions || reportAssumptions.length === 0) return [];
  return reportAssumptions.map((a: any) => ({
    category: a.category ?? '',
    fieldName: a.fieldName ?? '',
    displayName: a.displayName ?? '',
    value: a.value ?? '',
    valueType: a.valueType ?? '',
    unit: a.unit ?? '',
    description: a.description ?? '',
  }));
}

// ============================================================================
// PUBLIC: Build Excel Workbook
// ============================================================================
export function buildAssumptionExcelWorkbook(reportAssumptions?: any[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  // 1. Standardized Roles
  addSheet(
    wb,
    'Standardized Roles',
    ['Role Name', 'Role ID', 'Category', 'Hourly Rate ($)', 'Functions', 'Description'],
    standardizedRolesRows().map((r) => [r.roleName, r.roleId, r.category, r.hourlyRate, r.functions, r.description]),
  );

  // 2. Business Functions
  addSheet(
    wb,
    'Business Functions',
    ['Function', 'Sub-Function', 'Aliases'],
    businessFunctionsRows().map((r) => [r.function_, r.subFunction, r.aliases]),
  );

  // 3. AI Primitives
  addSheet(
    wb,
    'AI Primitives',
    ['Primitive Name', 'Description', 'Examples'],
    aiPrimitivesRows().map((r) => [r.name, r.description, r.examples]),
  );

  // 4. Default Assumptions
  addSheet(
    wb,
    'Default Assumptions',
    ['Category', 'Field Name', 'Display Name', 'Default Value', 'Type', 'Unit', 'Description', 'Used In Steps'],
    defaultAssumptionsRows().map((r) => [
      r.category,
      r.fieldName,
      r.displayName,
      r.defaultValue,
      r.valueType,
      r.unit,
      r.description,
      r.usedInSteps,
    ]),
  );

  // 5. Benefit Formulas
  addSheet(
    wb,
    'Benefit Formulas',
    ['Formula Name', 'Expression', 'Components', 'Description'],
    benefitFormulasRows().map((r) => [r.name, r.expression, r.components, r.description]),
  );

  // 6. Readiness Scoring
  addSheet(
    wb,
    'Readiness Scoring',
    ['Component', 'Weight (%)', 'Scale', 'Description'],
    readinessScoringRows().map((r) => [r.component, r.weight, r.scale, r.description]),
  );

  // 7. Priority Scoring
  addSheet(
    wb,
    'Priority Scoring',
    ['Component', 'Weight (%)', 'Formula/Threshold', 'Description'],
    priorityScoringRows().map((r) => [r.component, r.weight, r.formulaOrThreshold, r.description]),
  );

  // 8. Input Bounds
  addSheet(
    wb,
    'Input Bounds',
    ['Field', 'Label', 'Min', 'Max'],
    inputBoundsRows().map((r) => [r.field, r.label, r.min, r.max]),
  );

  // 9. Column Definitions
  addSheet(
    wb,
    'Column Definitions',
    ['Step', 'Column Name'],
    columnDefinitionsRows().map((r) => [r.step, r.columnName]),
  );

  // 10. Report Assumptions
  const raRows = reportAssumptionsRows(reportAssumptions);
  addSheet(
    wb,
    'Report Assumptions',
    ['Category', 'Field Name', 'Display Name', 'Value', 'Type', 'Unit', 'Description'],
    raRows.map((r) => [r.category, r.fieldName, r.displayName, r.value, r.valueType, r.unit, r.description]),
  );

  return wb;
}

// ============================================================================
// PUBLIC: Build JSON export
// ============================================================================
export function buildAssumptionJSON(reportAssumptions?: any[]): object {
  return {
    standardizedRoles: standardizedRolesRows(),
    businessFunctions: businessFunctionsRows().map((r) => ({
      function: r.function_,
      subFunction: r.subFunction,
      aliases: r.aliases,
    })),
    aiPrimitives: aiPrimitivesRows(),
    defaultAssumptions: defaultAssumptionsRows(),
    benefitFormulas: benefitFormulasRows(),
    readinessScoring: readinessScoringRows(),
    priorityScoring: priorityScoringRows(),
    inputBounds: inputBoundsRows(),
    columnDefinitions: columnDefinitionsRows(),
    reportAssumptions: reportAssumptionsRows(reportAssumptions),
  };
}
