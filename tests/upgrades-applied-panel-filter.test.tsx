// @vitest-environment jsdom
//
// Component tests for the "Show only reports with headline changes"
// toggle on the Admin backfill summary's `UpgradesAppliedPanel`
// (introduced in task #48).
//
// The toggle (`switch-hide-schema-only-upgrades`) hides reports inside
// every upgrade bucket whose `metricDeltas` array is empty, and rewrites
// the bucket count badge from a single number ("47") to a two-number
// "X of Y" form ("12 of 47") so admins can see at a glance how many
// reports in each bucket actually moved a headline figure. When a bucket
// is filtered down to zero rows, the expanded table shows a dedicated
// empty-state row (`row-upgrade-empty-<code>`) and the Copy IDs button
// is disabled.
//
// These tests render the real `UpgradesAppliedPanel` in jsdom, click the
// Switch via a synthetic mouse click (Radix Switch wires `onClick` to
// the `onCheckedChange` callback — see node_modules/@radix-ui/react-switch),
// and assert the badge text, the Copy IDs payload, the empty-state row,
// and that the toggle state persists across expand/collapse cycles. The
// `useToast` hook is mocked the same way as in
// `tests/upgrades-applied-panel.test.tsx` so the clipboard assertion
// doesn't have to render a live `<Toaster />`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// React 18+/19's `act()` requires this flag to suppress the
// "current testing environment is not configured to support act(...)"
// warning emitted on every state update.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock `useToast` so the Copy IDs assertion doesn't need a live Toaster.
// `vi.hoisted` ensures the spy is created before the `vi.mock` factory
// (which vitest hoists to the top of the module) runs.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

import { UpgradesAppliedPanel } from "../client/src/pages/Admin";
import { HIDE_SCHEMA_ONLY_STORAGE_KEY } from "../client/src/components/admin/UpgradesAppliedPanel";

// ---------------------------------------------------------------------------
// Test fixtures
//
// Two upgrade-code buckets are built so we can exercise both interesting
// shapes of the filter:
//   - `added-diagnostic` (3 reports) — a *mixed* bucket: 2 reports moved
//     a headline number and 1 is schema-only. Filtering should drop the
//     schema-only one and rewrite the badge to "2 of 3".
//   - `bumped-schema` (2 reports) — a *fully schema-only* bucket: every
//     report has empty `metricDeltas`. Filtering should drop both rows,
//     surface the `row-upgrade-empty-bumped-schema` placeholder, and
//     disable the Copy IDs button.
//
// Buckets are sorted by report count descending in the panel, so the
// 3-report `added-diagnostic` bucket renders first and the 2-report
// `bumped-schema` bucket second — that ordering is what our `clickByTestId`
// calls below assume.
// ---------------------------------------------------------------------------
const updated = [
  // Mixed bucket: rep-A1 + rep-A2 moved headline numbers, rep-A3 did not.
  {
    id: "rep-A1",
    companyName: "Acme Co",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [
      { code: "added-diagnostic" as const, label: "Added diagnostic block" },
    ],
    metricDeltas: [
      {
        code: "total-annual-value" as const,
        label: "Total value $1.0M → $1.2M",
        before: 1_000_000,
        after: 1_200_000,
        delta: 200_000,
        unit: "money" as const,
      },
    ],
  },
  {
    id: "rep-A2",
    companyName: "Beta Corp",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [
      { code: "added-diagnostic" as const, label: "Added diagnostic block" },
    ],
    metricDeltas: [
      {
        code: "champion-count" as const,
        label: "Champion count 2 → 3",
        before: 2,
        after: 3,
        delta: 1,
        unit: "count" as const,
      },
    ],
  },
  // Schema-only row inside the mixed `added-diagnostic` bucket — must be
  // hidden when the toggle is on, but the bucket itself must NOT
  // disappear (it still has 2 visible reports).
  {
    id: "rep-A3",
    companyName: "Gamma LLC",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [
      { code: "added-diagnostic" as const, label: "Added diagnostic block" },
    ],
    metricDeltas: [],
  },
  // Fully schema-only bucket: both reports have empty metricDeltas.
  {
    id: "rep-B1",
    companyName: "Delta Inc",
    isWhatIf: true,
    status: "updated" as const,
    upgrades: [
      { code: "bumped-schema" as const, label: "Bumped schema 2.0 → 2.2" },
    ],
    metricDeltas: [],
  },
  {
    id: "rep-B2",
    companyName: "Epsilon Ltd",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [
      { code: "bumped-schema" as const, label: "Bumped schema 2.0 → 2.2" },
    ],
    metricDeltas: [],
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  toastSpy.mockReset();
  // Each test starts with a clean localStorage so the persisted-toggle
  // tests below don't leak state into the existing default-off
  // assertions (and vice-versa).
  window.localStorage.clear();
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

function renderPanel() {
  act(() => {
    root.render(<UpgradesAppliedPanel updated={updated} />);
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

function textOf(testId: string): string {
  return (getByTestId(testId)?.textContent ?? "").trim();
}

describe("UpgradesAppliedPanel — schema-only filter toggle", () => {
  it("renders bare report counts on the bucket badges with the toggle off", () => {
    renderPanel();

    // Toggle is unchecked by default.
    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("false");

    // Bare counts: 3 in the mixed bucket, 2 in the all-schema-only bucket.
    expect(textOf("count-upgrade-added-diagnostic")).toBe("3");
    expect(textOf("count-upgrade-bumped-schema")).toBe("2");
  });

  it("flips badges to 'X of Y' and updates the examples line when the toggle is on", () => {
    renderPanel();
    clickByTestId("switch-hide-schema-only-upgrades");

    // Radix wires the click into onCheckedChange — sanity-check the new
    // state before we assert the downstream rendering.
    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("true");

    // Mixed bucket: 2 of 3 reports moved a headline number.
    expect(textOf("count-upgrade-added-diagnostic")).toBe("2 of 3");
    // All-schema-only bucket: 0 of 2 reports moved a headline number.
    expect(textOf("count-upgrade-bumped-schema")).toBe("0 of 2");

    // Mixed bucket's example list drops the schema-only company (Gamma)
    // and only shows the two with metric deltas.
    const mixedExamples = textOf("examples-upgrade-added-diagnostic");
    expect(mixedExamples).toContain("Acme Co");
    expect(mixedExamples).toContain("Beta Corp");
    expect(mixedExamples).not.toContain("Gamma LLC");

    // All-schema-only bucket: zero examples → dedicated copy.
    expect(textOf("examples-upgrade-bumped-schema")).toBe(
      "No reports moved a headline number",
    );
  });

  it("shows the row-upgrade-empty-<code> placeholder and disables Copy IDs for an all-schema-only bucket when filtered", () => {
    renderPanel();
    clickByTestId("switch-hide-schema-only-upgrades");
    clickByTestId("button-toggle-upgrade-bumped-schema");

    // The dedicated empty-state row for this bucket is in the DOM.
    const emptyRow = getByTestId("row-upgrade-empty-bumped-schema");
    expect(emptyRow).not.toBeNull();
    expect(emptyRow?.textContent ?? "").toContain("schema-only");

    // None of the actual report rows are rendered.
    expect(getByTestId("row-upgrade-report-bumped-schema-rep-B1")).toBeNull();
    expect(getByTestId("row-upgrade-report-bumped-schema-rep-B2")).toBeNull();

    // Copy IDs button is disabled (no IDs to copy).
    const copyBtn = getByTestId("button-copy-ids-upgrade-bumped-schema");
    expect(copyBtn).not.toBeNull();
    expect((copyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Copy IDs only emits the report IDs that actually moved a number when the filter is on", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    clickByTestId("switch-hide-schema-only-upgrades");
    clickByTestId("button-toggle-upgrade-added-diagnostic");

    // The schema-only row in this bucket (rep-A3 / Gamma LLC) is not
    // rendered when the filter is on.
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A3"),
    ).toBeNull();
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A1"),
    ).not.toBeNull();
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A2"),
    ).not.toBeNull();

    clickByTestId("button-copy-ids-upgrade-added-diagnostic");

    // Flush the clipboard promise so the toast call has actually happened.
    await act(async () => {
      await Promise.resolve();
    });

    // Only rep-A1 and rep-A2 — rep-A3 (schema-only) must be excluded.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("rep-A1\nrep-A2");

    expect(toastSpy).toHaveBeenCalledTimes(1);
    const payload = toastSpy.mock.calls[0][0];
    expect(payload.title).toBe("Copied to clipboard");
    expect(payload.description).toContain("2 report IDs");
    expect(payload.description).toContain('"Added diagnostic block"');
  });

  it("preserves the toggle state across collapsing and re-expanding a bucket", () => {
    renderPanel();
    clickByTestId("switch-hide-schema-only-upgrades");
    clickByTestId("button-toggle-upgrade-added-diagnostic");

    // Filtered view is in effect on first expand: schema-only row hidden.
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A3"),
    ).toBeNull();
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A1"),
    ).not.toBeNull();

    // Collapse the bucket. The details section disappears entirely.
    clickByTestId("button-toggle-upgrade-added-diagnostic");
    expect(getByTestId("details-upgrade-added-diagnostic")).toBeNull();

    // Toggle is still on while collapsed — the badge proves it.
    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("true");
    expect(textOf("count-upgrade-added-diagnostic")).toBe("2 of 3");

    // Re-expand: the filtered view should still be in effect — rep-A3
    // (schema-only) must still be hidden.
    clickByTestId("button-toggle-upgrade-added-diagnostic");
    expect(getByTestId("details-upgrade-added-diagnostic")).not.toBeNull();
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A3"),
    ).toBeNull();
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A1"),
    ).not.toBeNull();
    expect(
      getByTestId("row-upgrade-report-added-diagnostic-rep-A2"),
    ).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Persistence: the toggle's checked state is stored in localStorage under
// `admin.upgrades.hideSchemaOnly` so admins who consistently want the
// filter on don't have to flip it back on every visit (task #75).
// ---------------------------------------------------------------------------
describe("UpgradesAppliedPanel — persisted hide-schema-only preference", () => {
  it("defaults to off for first-time visitors (no localStorage entry)", () => {
    expect(window.localStorage.getItem(HIDE_SCHEMA_ONLY_STORAGE_KEY)).toBeNull();
    renderPanel();

    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("false");
    // Bare counts confirm the filter is off.
    expect(textOf("count-upgrade-added-diagnostic")).toBe("3");
  });

  it("writes the preference to localStorage when the toggle is flipped", () => {
    renderPanel();
    clickByTestId("switch-hide-schema-only-upgrades");

    expect(window.localStorage.getItem(HIDE_SCHEMA_ONLY_STORAGE_KEY)).toBe("true");

    clickByTestId("switch-hide-schema-only-upgrades");
    expect(window.localStorage.getItem(HIDE_SCHEMA_ONLY_STORAGE_KEY)).toBe("false");
  });

  it("reads the persisted preference on mount and survives a remount", () => {
    // Simulate a previous visit that left the filter on.
    window.localStorage.setItem(HIDE_SCHEMA_ONLY_STORAGE_KEY, "true");

    renderPanel();

    // Toggle starts checked because we read from localStorage on mount.
    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("true");
    // Filter is in effect: badge flips to "X of Y" form.
    expect(textOf("count-upgrade-added-diagnostic")).toBe("2 of 3");

    // Unmount and remount in a fresh container — the equivalent of an
    // admin reloading the page or navigating away and back. The persisted
    // preference must still be honored on the second mount.
    act(() => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    renderPanel();

    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("true");
    expect(textOf("count-upgrade-added-diagnostic")).toBe("2 of 3");
  });

  it("ignores unrelated values in localStorage and stays off", () => {
    // Anything other than the literal string "true" should be treated as off.
    window.localStorage.setItem(HIDE_SCHEMA_ONLY_STORAGE_KEY, "yes");
    renderPanel();
    expect(getByTestId("switch-hide-schema-only-upgrades")?.getAttribute("aria-checked"))
      .toBe("false");
  });
});
