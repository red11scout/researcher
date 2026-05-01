// @vitest-environment jsdom
//
// Component tests for `HeadlineNumberChangesPanel` — the cross-run
// summary on the Admin backfill review screen that buckets every
// "updated" report by which headline metric moved (total annual value,
// champion count, etc.) so admins can see at a glance which numbers a
// reprocessing run shifted, sorted by frequency.
//
// The grouping logic (deduping company examples in the bucket header,
// frequency-desc sort with `METRIC_ORDER` tie-breaker, the empty state,
// and the expand/collapse toggle) lives only inside the React component
// and was previously uncovered — only the upstream `computeMetricDeltas`
// had unit tests. These tests lock in the bucket counts, ordering, and
// expand behaviour so a future refactor can't silently double-count or
// drop a metric.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Required by React 18+/19's `act()` helper to suppress the
// "current testing environment is not configured for act()" warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `useToast` is mocked because the expanded bucket renders a "Copy IDs"
// button that calls `useToast()` even though we never click it here. The
// real toast provider would require wrapping the panel in a `<Toaster />`
// — mocking sidesteps that without losing any coverage of the bucketing
// logic this file is here to verify.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

// Imported AFTER the vi.mock above so the panel picks up the mocked
// `useToast`. The panel itself is exported from the page module purely
// for testability — it is not a public route.
import { HeadlineNumberChangesPanel } from "../client/src/pages/Admin";
import type { BackfillReportResult } from "../server/report-backfill";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
//
// We craft a synthetic mix of reports that exercises every branch of
// the bucket-builder:
//
//   - `total-annual-value` moves on THREE reports (A, B, C). Two of
//     those reports (A and C) are for the same company "Acme" so the
//     bucket header's example list must dedupe to {Acme, Beta} rather
//     than {Acme, Beta, Acme}. Highest count = top of the sort.
//   - `champion-count` moves on TWO reports (A, D). Mid count.
//   - `prototyping-candidates` and `quick-win-count` each move on ONE
//     report. They tie on frequency, so the canonical `METRIC_ORDER`
//     (which lists `prototyping-candidates` before `quick-win-count`)
//     determines that prototyping-candidates renders first. This
//     locks in the deterministic tie-breaker.
//   - One report (X) is updated but had NO metric movement
//     (empty `metricDeltas`). It must NOT contribute to any bucket
//     and must NOT trigger the empty state, since other reports DID
//     move headline numbers.
//
// Numbers are illustrative only — the panel doesn't recompute them,
// it just displays whatever `computeMetricDeltas` produced.
const updated: BackfillReportResult[] = [
  {
    id: "rep-A",
    companyName: "Acme",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [
      {
        code: "total-annual-value",
        label: "Total value $1.0M → $1.2M",
        before: 1_000_000,
        after: 1_200_000,
        delta: 200_000,
        unit: "money",
      },
      {
        code: "champion-count",
        label: "Champions 2 → 3",
        before: 2,
        after: 3,
        delta: 1,
        unit: "count",
      },
    ],
  },
  {
    id: "rep-B",
    companyName: "Beta",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [
      {
        code: "total-annual-value",
        label: "Total value $500K → $700K",
        before: 500_000,
        after: 700_000,
        delta: 200_000,
        unit: "money",
      },
    ],
  },
  {
    id: "rep-C",
    // Same company name as rep-A — exercises the dedupe in the bucket
    // header's example list. Without dedupe the header would read
    // "Acme, Beta, Acme" instead of "Acme, Beta".
    companyName: "Acme",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [
      {
        code: "total-annual-value",
        label: "Total value $2.0M → $1.8M",
        before: 2_000_000,
        after: 1_800_000,
        delta: -200_000,
        unit: "money",
      },
    ],
  },
  {
    id: "rep-D",
    companyName: "Delta",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [
      {
        code: "champion-count",
        label: "Champions 1 → 2",
        before: 1,
        after: 2,
        delta: 1,
        unit: "count",
      },
    ],
  },
  {
    id: "rep-E",
    companyName: "Echo",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [
      {
        code: "quick-win-count",
        label: "Quick Wins 1 → 2",
        before: 1,
        after: 2,
        delta: 1,
        unit: "count",
      },
    ],
  },
  {
    id: "rep-F",
    companyName: "Foxtrot",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [
      {
        code: "prototyping-candidates",
        label: "Prototyping candidates 3 → 5",
        before: 3,
        after: 5,
        delta: 2,
        unit: "count",
      },
    ],
  },
  // A "schema-only" updated report — included to verify it's silently
  // ignored by the bucket builder rather than landing in some catch-all
  // bucket or, worse, triggering the empty state.
  {
    id: "rep-X",
    companyName: "Xray",
    isWhatIf: false,
    status: "updated",
    durationMs: 10,
    upgrades: [],
    metricDeltas: [],
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  toastSpy.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function renderPanel(reports: BackfillReportResult[] = updated) {
  act(() => {
    root.render(<HeadlineNumberChangesPanel updated={reports} />);
  });
}

function clickByTestId(testId: string) {
  const el = container.querySelector(`[data-testid="${testId}"]`) as
    | HTMLElement
    | null;
  if (!el) throw new Error(`No element with data-testid="${testId}"`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

function allByTestIdPrefix(prefix: string): HTMLElement[] {
  // Querying by attribute-prefix lets us read the bucket rows in DOM
  // order without hard-coding the metric codes — that DOM order IS the
  // sort order the component decided on.
  return Array.from(
    container.querySelectorAll(`[data-testid^="${prefix}"]`),
  ) as HTMLElement[];
}

describe("HeadlineNumberChangesPanel — bucketing", () => {
  it("counts each bucket by the number of reports whose metric moved", () => {
    renderPanel();

    // total-annual-value moved on rep-A, rep-B, rep-C → 3
    expect(getByTestId("count-headline-total-annual-value")?.textContent).toBe("3");
    // champion-count moved on rep-A, rep-D → 2
    expect(getByTestId("count-headline-champion-count")?.textContent).toBe("2");
    // quick-win-count and prototyping-candidates each moved once
    expect(getByTestId("count-headline-quick-win-count")?.textContent).toBe("1");
    expect(getByTestId("count-headline-prototyping-candidates")?.textContent).toBe("1");

    // Metrics that nothing moved on must not get a bucket at all —
    // including `lead-champion-count`, which exists in METRIC_ORDER but
    // didn't appear in any report's metricDeltas.
    expect(getByTestId("count-headline-lead-champion-count")).toBeNull();
    expect(getByTestId("count-headline-foundation-count")).toBeNull();

    // The schema-only report (rep-X, empty metricDeltas) must NOT spawn
    // an empty/orphan bucket.
    expect(allByTestIdPrefix("row-headline-bucket-")).toHaveLength(4);
  });

  it("sorts buckets by frequency desc, then by canonical METRIC_ORDER on ties", () => {
    renderPanel();

    // Read the bucket rows in DOM order. The component sorts by entry
    // count desc; ties are broken by `METRIC_ORDER` (which lists
    // prototyping-candidates before quick-win-count). So we expect:
    //   total-annual-value (3) > champion-count (2) > prototyping-candidates (1) > quick-win-count (1)
    const orderedCodes = allByTestIdPrefix("row-headline-bucket-").map((el) =>
      el.getAttribute("data-testid")!.replace("row-headline-bucket-", ""),
    );

    expect(orderedCodes).toEqual([
      "total-annual-value",
      "champion-count",
      "prototyping-candidates",
      "quick-win-count",
    ]);
  });

  it("dedupes company names in the bucket-header example list", () => {
    renderPanel();

    // total-annual-value moved on Acme (twice — rep-A and rep-C) and
    // Beta. The header should list each company once: "Acme, Beta",
    // not "Acme, Beta, Acme".
    const examples = getByTestId("examples-headline-total-annual-value");
    expect(examples?.textContent ?? "").toBe("Acme, Beta");
  });

  it("renders the empty state when no updated report had any metric movement", () => {
    // Strip every metricDelta so the bucket map ends up empty. This is
    // the "every upgrade was schema-only" scenario the empty state
    // copy was designed for.
    const schemaOnly = updated.map((r) => ({ ...r, metricDeltas: [] }));
    renderPanel(schemaOnly);

    const empty = getByTestId("text-headline-changes-empty");
    expect(empty).not.toBeNull();
    expect(empty?.textContent ?? "").toContain(
      "No headline numbers moved across this run",
    );

    // No bucket rows should render alongside the empty state.
    expect(allByTestIdPrefix("row-headline-bucket-")).toHaveLength(0);
  });

  it("collapses bucket details by default and reveals the table when the toggle is clicked", () => {
    renderPanel();

    // Up front: every bucket toggle is present, but the per-report
    // detail tables (and the Copy IDs button inside them) are not
    // rendered yet because the buckets default to collapsed.
    expect(getByTestId("button-toggle-headline-total-annual-value")).not.toBeNull();
    expect(getByTestId("details-headline-total-annual-value")).toBeNull();
    expect(getByTestId("button-copy-ids-headline-total-annual-value")).toBeNull();
    expect(getByTestId("row-headline-report-total-annual-value-rep-A")).toBeNull();

    // Click the toggle and the detail table appears with one row per
    // entry in the bucket (rep-A, rep-B, rep-C — 3 rows).
    clickByTestId("button-toggle-headline-total-annual-value");

    expect(getByTestId("details-headline-total-annual-value")).not.toBeNull();
    expect(getByTestId("button-copy-ids-headline-total-annual-value")).not.toBeNull();
    expect(getByTestId("row-headline-report-total-annual-value-rep-A")).not.toBeNull();
    expect(getByTestId("row-headline-report-total-annual-value-rep-B")).not.toBeNull();
    expect(getByTestId("row-headline-report-total-annual-value-rep-C")).not.toBeNull();
    // Reports that aren't in this bucket must NOT bleed into the
    // expanded table — rep-D only moved champion-count.
    expect(getByTestId("row-headline-report-total-annual-value-rep-D")).toBeNull();

    // Clicking the toggle again collapses it back.
    clickByTestId("button-toggle-headline-total-annual-value");
    expect(getByTestId("details-headline-total-annual-value")).toBeNull();
    expect(getByTestId("row-headline-report-total-annual-value-rep-A")).toBeNull();
  });
});
