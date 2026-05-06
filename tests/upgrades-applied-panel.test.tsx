// @vitest-environment jsdom
//
// Component tests for the "Copy IDs" button on every expanded bucket of
// the Admin backfill summary's `UpgradesAppliedPanel` (introduced in
// task #32, hardened in task #46).
//
// The panel groups every "updated" report into buckets:
//   - One bucket per schema upgrade code (e.g. `bumped-schema`,
//     `added-diagnostic`)
//   - A special "metric-only" bucket for reports that had no schema
//     upgrades but whose headline numbers still moved
// Each bucket is collapsed by default. When the admin expands one, a
// "Copy IDs" button appears that copies the newline-separated report IDs
// for that bucket to the clipboard and shows a success toast (or a
// destructive "Copy failed" toast on clipboard rejection).
//
// These tests render the real `UpgradesAppliedPanel` in jsdom, stub
// `navigator.clipboard.writeText`, click each Copy IDs button, and
// assert both the clipboard payload and the toast call. `useToast` is
// mocked so we can spy on the toast function without rendering a
// `<Toaster />`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Required by React 18+/19's `act()` helper to confirm we're inside a
// proper test environment — without this flag every `act(...)` call
// logs a noisy "The current testing environment is not configured..."
// warning to stderr.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `@/hooks/use-toast` is mocked so each test can assert the exact
// `{ title, description, variant? }` payload the panel emitted without
// having to render the live Toaster and scrape the DOM. `vi.hoisted`
// is used so the spy is initialised before the `vi.mock` factory (which
// vitest hoists to the very top of the file) runs.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

// Imported AFTER the vi.mock above so the panel picks up the mocked
// `useToast`. The panel itself is exported from the page module purely
// for testability — it is not a public route.
import { UpgradesAppliedPanel } from "../client/src/components/admin/UpgradesAppliedPanel";

// ---------------------------------------------------------------------------
// Test fixtures: a representative mix of buckets so a single render
// exercises (a) a bucket keyed by an upgrade code, (b) the special
// `metric-only` bucket, and (c) a schema-only / no-change bucket that
// should NOT get a Copy IDs button.
// ---------------------------------------------------------------------------
const updated = [
  // Two reports share the `bumped-schema` upgrade and both moved a
  // headline number. They form a 2-report bucket keyed by code
  // `bumped-schema`. Including two reports lets us assert that the
  // clipboard payload is a newline-joined list (not just the first id).
  {
    id: "rep-001",
    companyName: "Acme Co",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [{ code: "bumped-schema" as const, label: "Bumped schema 2.0 → 2.2" }],
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
    id: "rep-002",
    companyName: "Beta Corp",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [{ code: "bumped-schema" as const, label: "Bumped schema 2.0 → 2.2" }],
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
  // A report with NO upgrades but whose metrics still moved — populates
  // the special `metric-only` bucket whose Copy IDs button uses the
  // testid `button-copy-ids-upgrade-metric-only`.
  {
    id: "rep-003",
    companyName: "Gamma LLC",
    isWhatIf: true,
    status: "updated" as const,
    upgrades: [],
    metricDeltas: [
      {
        code: "quick-win-count" as const,
        label: "Quick wins 1 → 2",
        before: 1,
        after: 2,
        delta: 1,
        unit: "count" as const,
      },
    ],
  },
  // A report with NO upgrades and NO metric movement — drops into the
  // expandable "Reprocessed (no schema changes)" bucket and exposes a
  // `button-copy-ids-upgrade-no-change` button when expanded.
  {
    id: "rep-004",
    companyName: "Delta Inc",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [],
    metricDeltas: [],
  },
  // Two reports with schema upgrades but NO metric movement — populate
  // the expandable "Schema-only (no headline numbers moved)" bucket
  // and let us assert the Copy IDs button concatenates both ids with
  // a newline separator.
  {
    id: "rep-005",
    companyName: "Epsilon Ltd",
    isWhatIf: false,
    status: "updated" as const,
    upgrades: [{ code: "added-diagnostic" as const, label: "Added diagnostic" }],
    metricDeltas: [],
  },
  {
    id: "rep-006",
    companyName: "Zeta GmbH",
    isWhatIf: true,
    status: "updated" as const,
    upgrades: [{ code: "added-diagnostic" as const, label: "Added diagnostic" }],
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

describe("UpgradesAppliedPanel — Copy IDs buttons", () => {
  it("hides Copy IDs buttons until a bucket is expanded", () => {
    renderPanel();

    // Both Copy IDs buttons should exist only after their bucket is
    // expanded. Up front, the buckets are collapsed so the buttons
    // must be absent from the DOM.
    expect(getByTestId("button-copy-ids-upgrade-bumped-schema")).toBeNull();
    expect(getByTestId("button-copy-ids-upgrade-metric-only")).toBeNull();

    // Both bucket toggle headers must, however, be present so the
    // admin can click into them.
    expect(getByTestId("button-toggle-upgrade-bumped-schema")).not.toBeNull();
    expect(getByTestId("button-toggle-upgrade-metric-only")).not.toBeNull();
  });

  it("reveals button-copy-ids-upgrade-<code> when an upgrade bucket expands", () => {
    renderPanel();
    clickByTestId("button-toggle-upgrade-bumped-schema");

    const copyBtn = getByTestId("button-copy-ids-upgrade-bumped-schema");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent ?? "").toContain("Copy IDs");
  });

  it("reveals button-copy-ids-upgrade-metric-only when the metric-only bucket expands", () => {
    renderPanel();
    clickByTestId("button-toggle-upgrade-metric-only");

    const copyBtn = getByTestId("button-copy-ids-upgrade-metric-only");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent ?? "").toContain("Copy IDs");
  });

  it("copies newline-separated IDs and shows a success toast for an upgrade bucket", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    clickByTestId("button-toggle-upgrade-bumped-schema");
    clickByTestId("button-copy-ids-upgrade-bumped-schema");

    // copyIds is async (awaits navigator.clipboard.writeText) — flush
    // microtasks so the toast call has actually happened before we
    // assert on it.
    await act(async () => {
      await Promise.resolve();
    });

    // The bucket has rep-001 and rep-002, in insertion order.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("rep-001\nrep-002");

    // Success toast: count + bucket label, no destructive variant.
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const payload = toastSpy.mock.calls[0][0];
    expect(payload.title).toBe("Copied to clipboard");
    expect(payload.description).toContain("2 report IDs");
    expect(payload.description).toContain('"Bumped schema 2.0 → 2.2"');
    expect(payload.variant).toBeUndefined();
  });

  it("copies the single metric-only ID and pluralizes the toast as 'report ID' (singular)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    clickByTestId("button-toggle-upgrade-metric-only");
    clickByTestId("button-copy-ids-upgrade-metric-only");

    await act(async () => {
      await Promise.resolve();
    });

    // Only rep-003 is in the metric-only bucket — single id, no
    // trailing newline.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("rep-003");

    expect(toastSpy).toHaveBeenCalledTimes(1);
    const payload = toastSpy.mock.calls[0][0];
    expect(payload.title).toBe("Copied to clipboard");
    // Note the SINGULAR form — exercises the `ids.length === 1` branch
    // of the pluralization helper inline in `copyIds`.
    expect(payload.description).toContain("1 report ID ");
    expect(payload.description).toContain(
      '"Reprocessed — headline numbers moved (no schema change)"',
    );
    expect(payload.variant).toBeUndefined();
  });

  it("reveals button-copy-ids-upgrade-schema-only when the schema-only bucket expands", () => {
    renderPanel();

    // Header is present from first paint, button is hidden until expand.
    expect(getByTestId("button-toggle-upgrade-schema-only")).not.toBeNull();
    expect(getByTestId("button-copy-ids-upgrade-schema-only")).toBeNull();

    clickByTestId("button-toggle-upgrade-schema-only");

    const copyBtn = getByTestId("button-copy-ids-upgrade-schema-only");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent ?? "").toContain("Copy IDs");
  });

  it("reveals button-copy-ids-upgrade-no-change when the no-change bucket expands", () => {
    renderPanel();

    expect(getByTestId("button-toggle-upgrade-no-change")).not.toBeNull();
    expect(getByTestId("button-copy-ids-upgrade-no-change")).toBeNull();

    clickByTestId("button-toggle-upgrade-no-change");

    const copyBtn = getByTestId("button-copy-ids-upgrade-no-change");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent ?? "").toContain("Copy IDs");
  });

  it("copies newline-separated IDs and shows a success toast for the schema-only bucket", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    clickByTestId("button-toggle-upgrade-schema-only");
    clickByTestId("button-copy-ids-upgrade-schema-only");

    await act(async () => {
      await Promise.resolve();
    });

    // rep-005 and rep-006 both have a schema upgrade with no metric
    // movement, so they form the schema-only bucket in insertion order.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("rep-005\nrep-006");

    expect(toastSpy).toHaveBeenCalledTimes(1);
    const payload = toastSpy.mock.calls[0][0];
    expect(payload.title).toBe("Copied to clipboard");
    expect(payload.description).toContain("2 report IDs");
    expect(payload.description).toContain(
      '"Schema-only (no headline numbers moved)"',
    );
    expect(payload.variant).toBeUndefined();
  });

  it("copies the single no-change ID and pluralizes as 'report ID' (singular)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    clickByTestId("button-toggle-upgrade-no-change");
    clickByTestId("button-copy-ids-upgrade-no-change");

    await act(async () => {
      await Promise.resolve();
    });

    // Only rep-004 ended up in the no-change bucket.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("rep-004");

    expect(toastSpy).toHaveBeenCalledTimes(1);
    const payload = toastSpy.mock.calls[0][0];
    expect(payload.title).toBe("Copied to clipboard");
    expect(payload.description).toContain("1 report ID ");
    expect(payload.description).toContain(
      '"Reprocessed (no schema changes)"',
    );
    expect(payload.variant).toBeUndefined();
  });

  it("disables Copy IDs when the headline-changes filter hides every report in a bucket", async () => {
    // The `added-diagnostic` bucket holds rep-005 and rep-006, both of
    // which have empty `metricDeltas`. With the
    // `switch-hide-schema-only-upgrades` toggle ON, `filterReports`
    // strips both reports, leaving `visibleReports.length === 0` and
    // forcing the Copy IDs button into its disabled state. This test
    // locks in that behavior so a future refactor can't silently let
    // admins copy an empty list.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();

    // Flip the "Show only reports with headline changes" toggle on.
    clickByTestId("switch-hide-schema-only-upgrades");

    // Expand the schema-only-upgrades bucket (`added-diagnostic`).
    clickByTestId("button-toggle-upgrade-added-diagnostic");

    const copyBtn = getByTestId("button-copy-ids-upgrade-added-diagnostic");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.hasAttribute("disabled")).toBe(true);

    // Clicking the disabled button must be a no-op: neither the
    // clipboard nor the toast spy should fire.
    clickByTestId("button-copy-ids-upgrade-added-diagnostic");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("shows a destructive 'Copy failed' toast when clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked by browser"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();
    clickByTestId("button-toggle-upgrade-bumped-schema");
    clickByTestId("button-copy-ids-upgrade-bumped-schema");

    // Wait two microtask turns: one for the writeText promise to
    // reject, another for the catch block's `toast(...)` to run.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("rep-001\nrep-002");
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const payload = toastSpy.mock.calls[0][0];
    expect(payload.title).toBe("Copy failed");
    expect(payload.description).toContain("clipboard access");
    expect(payload.variant).toBe("destructive");
  });
});
