# REPLIT AGENT: Fix Step 4 Crash — "IE.default.buildEmpty is not a function"

**Status:** Previous fixes worked — pipeline is now 4 steps, retry logic works, per-step error reporting works. But Step 4 "Readiness, Roadmap & Summary" crashes 100% of the time with a JavaScript runtime error.

**Exact error:**
```
Analysis failed at 'Readiness, Roadmap & Summary' after 3 attempts:
IE.default.buildEmpty is not a function
```

---

## ROOT CAUSE: HYPERFORMULA IMPORT IS BROKEN

`IE.default.buildEmpty` is the **minified/bundled** form of `HyperFormula.buildEmpty()`. The `IE` variable is what the JavaScript bundler (webpack/esbuild/vite) renamed `HyperFormula` to during minification. The `.default` property means the code is trying to access the default export, but it's not resolving correctly.

This is the calculation engine used in Step 4 to compute:
- Benefits quantification formulas (cost, revenue, risk, cash flow)
- Readiness scores (4-dimension weighted calculation)
- Token cost modeling
- Priority scores and tier assignment
- Scenario analysis (conservative/moderate/aggressive)

**The HyperFormula library is either not installed, incorrectly imported, or had a breaking version change.**

---

## DIAGNOSTIC STEPS — RUN THESE FIRST

### 1. Check if HyperFormula is installed
```bash
npm ls hyperformula 2>/dev/null || echo "NOT FOUND"
cat package.json | grep -i hyperformula
```

### 2. Find all HyperFormula imports in the codebase
```bash
grep -rn "hyperformula\|HyperFormula\|buildEmpty" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs"
```

### 3. Check the import style
```bash
grep -rn "import.*hyperformula\|require.*hyperformula" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

### 4. Check the HyperFormula version
```bash
cat node_modules/hyperformula/package.json 2>/dev/null | grep '"version"'
```

---

## FIX BASED ON WHAT YOU FIND

### Scenario A: HyperFormula is NOT installed

```bash
npm install hyperformula
```

Then verify the import works:
```typescript
import { HyperFormula } from 'hyperformula';
const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });
console.log('HyperFormula initialized:', hf !== null);
```

### Scenario B: HyperFormula is installed but import style is wrong

The `IE.default.buildEmpty` error means the code is doing one of these broken patterns:

```typescript
// ❌ BROKEN — default import on a named export module
import HyperFormula from 'hyperformula';
HyperFormula.buildEmpty(...); // → "IE.default.buildEmpty is not a function"

// ❌ BROKEN — require without destructuring
const HyperFormula = require('hyperformula');
HyperFormula.buildEmpty(...); // → undefined, it's on HyperFormula.HyperFormula.buildEmpty

// ❌ BROKEN — dynamic import with wrong access
const HF = await import('hyperformula');
HF.buildEmpty(...); // → undefined, it's on HF.HyperFormula.buildEmpty
```

**The correct import patterns:**

```typescript
// ✅ CORRECT — Named import (ESM / TypeScript)
import { HyperFormula } from 'hyperformula';
const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });

// ✅ CORRECT — Require with destructuring (CommonJS)
const { HyperFormula } = require('hyperformula');
const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });

// ✅ CORRECT — Dynamic import
const { HyperFormula } = await import('hyperformula');
const hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });
```

**Find every file that imports HyperFormula and fix the import to use the NAMED import pattern:**
```bash
grep -rn "import.*hyperformula\|require.*hyperformula" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

Replace ALL instances with:
```typescript
import { HyperFormula } from 'hyperformula';
```

### Scenario C: HyperFormula had a breaking version change

HyperFormula v2.x changed the export structure from v1.x. If you recently upgraded:

```bash
# Check current version
cat node_modules/hyperformula/package.json | grep '"version"'

# If v2.x+ and code was written for v1.x, the API may have changed
# Pin to a working version:
npm install hyperformula@2.7.5
```

If version issues persist, check the actual export:
```bash
node -e "const hf = require('hyperformula'); console.log(Object.keys(hf))"
```

This will show you what's actually exported and whether `HyperFormula` is a named export or nested differently.

### Scenario D: Server-side vs. Client-side execution mismatch

HyperFormula may work in the browser but fail on the server (Node.js) due to missing DOM APIs. If the calculation engine is running server-side in an API route:

```typescript
// HyperFormula needs no DOM, but check if it's being imported in a context
// that triggers browser-only code paths.
// If so, ensure the import is in a server-only file, not a shared component.
```

### Scenario E: The Replit agent broke the import during previous refactoring

When the pipeline was refactored from 8 steps to 4, the HyperFormula code may have been moved to a new file or the import path may have been accidentally removed. Check the git diff:

```bash
git log --oneline -10
git diff HEAD~5 -- "**/*calc*" "**/*formula*" "**/*hyperformula*" "**/*engine*" "**/*benefit*"
```

---

## ALTERNATIVE: REPLACE HYPERFORMULA WITH PLAIN MATH

If HyperFormula continues to cause import issues, the calculations in this app are simple enough to implement with plain JavaScript math. HyperFormula is overkill for what's needed:

```typescript
// lib/calc/benefitsEngine.ts — No external dependencies needed

export function calculateBenefits(useCase: UseCase, assumptions: Assumptions): BenefitResult {
  const { adoptionRate = 0.90, benefitsLoading = 1.35, costOfCapital = 0.08 } = assumptions;
  const dataMaturity = DATA_MATURITY_MULTIPLIERS[assumptions.dataMaturityLevel || 2];

  let costBenefit = 0, revenueBenefit = 0, riskBenefit = 0, cashFlowBenefit = 0;

  if (useCase.primaryDriver === 'Cost Reduction') {
    costBenefit = useCase.annualHours * useCase.loadedHourlyRate * benefitsLoading * adoptionRate * dataMaturity;
  }
  if (useCase.primaryDriver === 'Revenue Growth') {
    revenueBenefit = useCase.revenueUpliftPct * useCase.revenueAtRisk * useCase.realizationFactor * dataMaturity;
  }
  if (useCase.primaryDriver === 'Risk Mitigation') {
    riskBenefit = useCase.riskReductionPct * useCase.riskExposure * useCase.realizationFactor * dataMaturity;
  }
  if (useCase.primaryDriver === 'Cash Flow Acceleration') {
    cashFlowBenefit = useCase.annualRevenue * (useCase.daysImproved / 365) * costOfCapital * useCase.realizationFactor * dataMaturity;
  }

  const totalAnnualValue = costBenefit + revenueBenefit + riskBenefit + cashFlowBenefit;
  const expectedValue = totalAnnualValue * useCase.probabilityOfSuccess;

  return { costBenefit, revenueBenefit, riskBenefit, cashFlowBenefit, totalAnnualValue, expectedValue };
}

export function calculateReadiness(dimensions: ReadinessDimensions): number {
  return (
    dimensions.dataAvailability * 0.35 +
    dimensions.technicalInfrastructure * 0.25 +
    dimensions.organizationalCapacity * 0.20 +
    dimensions.governance * 0.20
  );
}

export function calculatePriority(expectedValue: number, maxExpectedValue: number, readinessScore: number, timeToValueMonths: number): PriorityResult {
  const valueScore = (expectedValue / maxExpectedValue) * 10;
  const ttvScore = ((24 - timeToValueMonths) / 24) * 10;
  const priorityScore = (valueScore * 0.40) + (readinessScore * 0.35) + (ttvScore * 0.25);

  let tier: string;
  if (priorityScore >= 7.5) tier = 'Tier 1 — Champions';
  else if (priorityScore >= 5.5) tier = 'Tier 2 — Quick Wins';
  else if (priorityScore >= 4.0) tier = 'Tier 3 — Strategic Bets';
  else tier = 'Tier 4 — Foundation';

  return { valueScore, ttvScore, priorityScore, tier };
}

export function calculateScenarios(totalAnnualBenefit: number, projectionYears: number = 5) {
  const scenarios = {
    conservative: { factor: 0.60, discountRate: 0.12 },
    moderate:     { factor: 1.00, discountRate: 0.10 },
    aggressive:   { factor: 1.30, discountRate: 0.08 },
  };

  return Object.fromEntries(
    Object.entries(scenarios).map(([name, { factor, discountRate }]) => {
      const annualBenefit = totalAnnualBenefit * factor;
      const npv = annualBenefit * ((1 - Math.pow(1 + discountRate, -projectionYears)) / discountRate);
      const paybackMonths = annualBenefit > 0 ? Math.round((totalAnnualBenefit * 0.15) / (annualBenefit / 12)) : 0;
      return [name, { annualBenefit, npv, paybackMonths }];
    })
  );
}

const DATA_MATURITY_MULTIPLIERS: Record<number, number> = {
  1: 0.50,  // Initial
  2: 0.75,  // Repeatable
  3: 0.90,  // Defined
  4: 1.00,  // Managed
};
```

This is zero-dependency, runs identically on server and client, and cannot fail due to import issues. If HyperFormula is only used for these formulas (not for spreadsheet-grade cell dependency resolution), replace it entirely.

---

## IMPLEMENTATION ORDER

1. Run the diagnostic commands above to identify which scenario applies
2. Fix the HyperFormula import (Scenario A, B, or C) OR replace with plain math (Alternative)
3. Test by hitting "Retry from Step 4" on the existing failed report — it should now complete
4. Generate a fresh report for "Truist Financial" end-to-end — all 4 steps should complete
5. Verify benefits values are reasonable (under 3% of company revenue total)

## SUCCESS CRITERIA

- [ ] Step 4 "Readiness, Roadmap & Summary" completes without errors
- [ ] Full reports generate end-to-end for at least 3 different companies
- [ ] No `buildEmpty is not a function` errors in console
- [ ] Benefits calculations produce realistic numbers (portfolio < 3% of revenue)
- [ ] "Retry from Step 4" button works on previously failed reports
