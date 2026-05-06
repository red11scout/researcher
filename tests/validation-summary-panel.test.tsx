// @vitest-environment jsdom
//
// Component tests for the admin Validation Summary panel rollup
// (task #77). The panel takes the canonical `validationSummary` block
// produced by `postProcessAnalysis` and renders, alongside the existing
// "X use cases capped" line from task #51, a rolled-up "X of Y use cases
// had revenue uplift capped" line plus an expandable per-UC drill-down
// of the IDs flagged by the structured warnings introduced in task #52
// (revenue) and task #76 (risk).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  ValidationSummaryPanel,
  summarizeCapWarnings,
} from "../client/src/components/admin/ValidationSummaryPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => {
    root.render(node);
  });
}

function clickToggle(testId: string) {
  const btn = container.querySelector<HTMLButtonElement>(
    `[data-testid="button-toggle-${testId}"]`,
  );
  if (!btn) throw new Error(`toggle ${testId} not found`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("summarizeCapWarnings", () => {
  it("groups revenue and risk cap warnings by use case ID and dedupes repeats", () => {
    const details = [
      "UC-REV revenue uplift capped from 8% to 5%",
      "UC-REV-2 revenue uplift capped from 12% to 5%",
      // Same UC appearing twice (e.g. structured + legacy branch both
      // fired) must only count once in the rollup so admins don't see
      // an inflated tally vs the per-UC drill-down.
      "UC-REV revenue uplift capped from 8% to 5%",
      "UC-RISK risk reduction capped from 20% to 8%",
      // Unrelated detail lines should be ignored entirely.
      "Revenue derived from Step 3 driver impact: $123,456",
    ];
    const out = summarizeCapWarnings(details);
    expect(out.revenue.count).toBe(2);
    expect(out.revenue.ids).toEqual(["UC-REV", "UC-REV-2"]);
    expect(out.risk.count).toBe(1);
    expect(out.risk.ids).toEqual(["UC-RISK"]);
  });

  it("returns empty breakdowns when there are no cap warnings (or no details at all)", () => {
    expect(summarizeCapWarnings(undefined)).toEqual({
      revenue: { ids: [], count: 0 },
      risk: { ids: [], count: 0 },
    });
    expect(summarizeCapWarnings(["Some unrelated note"])).toEqual({
      revenue: { ids: [], count: 0 },
      risk: { ids: [], count: 0 },
    });
  });
});

describe("ValidationSummaryPanel", () => {
  it("shows the rolled-up revenue & risk cap counts with X-of-Y denominator and a per-UC drill-down on expand", () => {
    render(
      <ValidationSummaryPanel
        summary={{
          useCasesCapped: 2,
          parametersClamped: 0,
          portfolioScaleFactor: 1,
          originalTotal: 1_000_000,
          validatedTotal: 1_000_000,
          details: [
            "UC-REV revenue uplift capped from 8% to 5%",
            "UC-REV-2 revenue uplift capped from 9% to 5%",
            "UC-RISK risk reduction capped from 20% to 8%",
          ],
        }}
        benefitsCapped={true}
        totalUseCases={5}
      />,
    );

    // Existing task-#51 line is preserved.
    const capLine = container.querySelector('[data-testid="text-use-cases-capped"]');
    expect(capLine?.textContent).toContain("2 use cases capped");

    // New rollup lines (count + denominator) for both branches.
    const revCount = container.querySelector(
      '[data-testid="text-revenue-uplift-capped-count"]',
    );
    expect(revCount?.textContent).toContain("2 of 5 use cases");
    const riskCount = container.querySelector(
      '[data-testid="text-risk-reduction-capped-count"]',
    );
    expect(riskCount?.textContent).toContain("1 of 5 use case");

    // Per-UC drill-down is collapsed by default.
    expect(
      container.querySelector('[data-testid="list-revenue-uplift-capped-ids"]'),
    ).toBeNull();

    // Expand the revenue rollup → both UC IDs render as list items.
    clickToggle("revenue-uplift-capped");
    expect(
      container.querySelector('[data-testid="item-revenue-uplift-capped-UC-REV"]')
        ?.textContent,
    ).toBe("UC-REV");
    expect(
      container.querySelector('[data-testid="item-revenue-uplift-capped-UC-REV-2"]')
        ?.textContent,
    ).toBe("UC-REV-2");
    // The risk drill-down is independent and remains collapsed.
    expect(
      container.querySelector('[data-testid="list-risk-reduction-capped-ids"]'),
    ).toBeNull();
  });

  it("renders the panel even when only engine-cap warnings are present (no portfolio cap, no useCasesCapped count)", () => {
    // Edge case: a portfolio that didn't trip the post-process portfolio
    // cap (`benefitsCapped=false`) and where `useCasesCapped` happens to
    // be 0 must still surface the structured engine-cap warnings, since
    // those are exactly the signal the rollup exists to expose.
    render(
      <ValidationSummaryPanel
        summary={{
          useCasesCapped: 0,
          parametersClamped: 0,
          portfolioScaleFactor: 1,
          originalTotal: 0,
          validatedTotal: 0,
          details: ["UC-REV revenue uplift capped from 8% to 5%"],
        }}
        benefitsCapped={false}
        totalUseCases={3}
      />,
    );
    expect(container.querySelector('[data-testid="validation-summary"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="text-revenue-uplift-capped-count"]')
        ?.textContent,
    ).toContain("1 of 3 use case");
    // The "X use cases capped" line is suppressed when the count is 0,
    // so the rollup is the only signal in this scenario.
    expect(container.querySelector('[data-testid="text-use-cases-capped"]')).toBeNull();
  });

  it("omits the X-of-Y denominator when the total use case count is unknown or smaller than the capped count", () => {
    render(
      <ValidationSummaryPanel
        summary={{
          details: ["UC-A revenue uplift capped from 8% to 5%"],
        }}
        benefitsCapped={false}
      />,
    );
    const txt = container.querySelector(
      '[data-testid="text-revenue-uplift-capped-count"]',
    )?.textContent;
    expect(txt).toContain("1 use case");
    expect(txt).not.toContain(" of ");
  });

  it("renders nothing when no validation was applied and no cap warnings are present", () => {
    render(
      <ValidationSummaryPanel
        summary={{
          useCasesCapped: 0,
          parametersClamped: 0,
          portfolioScaleFactor: 1,
          originalTotal: 0,
          validatedTotal: 0,
          details: [],
        }}
        benefitsCapped={false}
      />,
    );
    expect(container.querySelector('[data-testid="validation-summary"]')).toBeNull();
  });
});
