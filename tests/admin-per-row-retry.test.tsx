// @vitest-environment jsdom
//
// Component tests for the per-row "Retry" button on the Admin backfill
// failures table.
//
// Background: when an operator clicks "Retry" on a single failed row,
// the Admin page enters its "preserve mode" branch of `runBackfill` —
// the rest of the failures table stays mounted, only the targeted row
// shows a spinner, and the per-ID stream result is merged back into
// the existing summary instead of replacing it. This is in contrast to
// the batch "Retry these" button, which still uses the original
// reset-and-replace path (clears `result`, hands control to the live
// progress panel, and ultimately swaps in the new run's summary).
//
// Both paths are easy to regress silently:
//   - Re-introducing `setResult(null)` on the per-row path would wipe
//     the table out from under the operator.
//   - A bad merge would leave dead "failed" rows in the table after a
//     successful retry, or fail to update the headline stats.
//   - Accidentally routing the batch button through preserve mode
//     would silently double-count failures across runs.
//
// These tests render the real `AdminPanel` against a controllable
// streaming `fetch` mock and lock in all four behaviours.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks for the surrounding context. AdminPanel pulls in `useAuth` (for
// the "Step down" button) and `useToast` (for the per-row + batch retry
// completion toasts). We mock both so we don't need to wrap the panel
// in `<AuthProvider>` + `<Toaster>` and so we can spy on toast payloads
// without scraping a portal-rendered DOM.
// ---------------------------------------------------------------------------
const { toastSpy, adminLogoutSpy } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  adminLogoutSpy: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isAdmin: true,
    adminAvailable: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    adminLogin: vi.fn(),
    adminLogout: adminLogoutSpy,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// jsdom doesn't ship a few APIs that radix-ui components touch on
// mount (Select, AlertDialog, Tooltip, etc). Stub the ones we know
// AdminPanel + Layout will hit so a render doesn't throw mid-test.
if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  // @ts-expect-error – jsdom doesn't define this method.
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  // @ts-expect-error – jsdom doesn't define this method.
  Element.prototype.releasePointerCapture = () => {};
}

import { AdminPanel } from "../client/src/pages/Admin";

// ---------------------------------------------------------------------------
// Hydration fixture: the Admin page calls GET /api/admin/last-backfill
// on mount and renders the persisted summary before the operator does
// anything. We seed it with three failures so we can verify per-row
// retries leave the *other* rows untouched.
// ---------------------------------------------------------------------------
interface HydratedFailure {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "failed";
  error: string;
  durationMs: number;
}

const HYDRATED_FAILURES: HydratedFailure[] = [
  {
    id: "rep-1",
    companyName: "Acme Co",
    isWhatIf: false,
    status: "failed",
    error: "Bad data v1",
    durationMs: 120,
  },
  {
    id: "rep-2",
    companyName: "Beta Inc",
    isWhatIf: false,
    status: "failed",
    error: "Network blip",
    durationMs: 150,
  },
  {
    id: "rep-3",
    companyName: "Gamma LLC",
    isWhatIf: false,
    status: "failed",
    error: "Other failure",
    durationMs: 90,
  },
];

function makeHydration() {
  return {
    summary: {
      success: true,
      force: false,
      total: 10,
      updated: 5,
      skipped: 2,
      failed: 3,
      durationMs: 5000,
      failures: HYDRATED_FAILURES.map((f) => ({ ...f })),
    },
    updatedReports: [],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Streaming-fetch harness. POST /api/admin/backfill-reports returns an
// NDJSON stream that AdminPanel consumes one line at a time. We expose
// a `pendingStream` handle so each test can push events at the moment
// it wants the run to advance, then close the stream to let
// `runBackfill` finish.
// ---------------------------------------------------------------------------
interface PendingStream {
  controller: ReadableStreamDefaultController<Uint8Array>;
  request: { url: string; init?: RequestInit };
}

let pendingStream: PendingStream | null = null;

function pushStreamEvent(obj: unknown) {
  if (!pendingStream) throw new Error("No pending backfill stream");
  pendingStream.controller.enqueue(
    new TextEncoder().encode(`${JSON.stringify(obj)}\n`),
  );
}

function closeStream() {
  if (!pendingStream) throw new Error("No pending backfill stream");
  pendingStream.controller.close();
  pendingStream = null;
}

function installFetchMock() {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      if (url.startsWith("/api/admin/last-backfill")) {
        return new Response(JSON.stringify(makeHydration()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/admin/audit-log/export")) {
        return new Response("", { status: 200 });
      }
      if (url.startsWith("/api/admin/audit-log")) {
        return new Response(JSON.stringify({ entries: [], total: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/admin/last-audit-cleanup")) {
        return new Response(JSON.stringify({ cleanup: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/admin/settings")) {
        return new Response(
          JSON.stringify({
            settings: { auditRetentionDays: null, updatedAt: null },
            effective: { auditRetentionDays: 90 },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.startsWith("/api/admin/backfill-reports")) {
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
          },
        });
        pendingStream = { controller, request: { url, init } };
        return new Response(body, { status: 200 });
      }
      return new Response("", { status: 200 });
    },
  );
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Generic test plumbing.
// ---------------------------------------------------------------------------
let container: HTMLDivElement;
let root: Root;

async function flush() {
  // A few interleaved microtask + macrotask turns let any pending
  // stream reads + React commits settle.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(
    `[data-testid="${testId}"]`,
  ) as HTMLElement | null;
}

function clickByTestId(testId: string) {
  const el = getByTestId(testId);
  if (!el) throw new Error(`No element with data-testid="${testId}"`);
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

async function mountAndHydrate() {
  await act(async () => {
    root.render(<AdminPanel />);
  });
  await act(async () => {
    await flush();
  });
}

beforeEach(() => {
  toastSpy.mockReset();
  adminLogoutSpy.mockReset();
  pendingStream = null;
  installFetchMock();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  // If a test forgot to drain the in-flight stream, close it now so
  // the detached `runBackfill` promise can settle before we unmount.
  if (pendingStream) {
    try {
      pendingStream.controller.close();
    } catch {
      /* already closed */
    }
    pendingStream = null;
    await act(async () => {
      await flush();
    });
  }
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AdminPanel — per-row retry preserves the failures table", () => {
  it("keeps the other failure rows visible and shows a 'Retrying…' spinner on the targeted row while the run is in flight", async () => {
    await mountAndHydrate();

    // Sanity: hydration produced all three rows + the summary panel.
    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();
    expect(getByTestId("row-failure-rep-2")).not.toBeNull();
    expect(getByTestId("row-failure-rep-3")).not.toBeNull();

    // Click "Retry" on rep-2 only and let the fetch + first reader
    // tick happen. We deliberately don't push any stream events yet —
    // this is the in-flight intermediate state.
    await act(async () => {
      clickByTestId("button-retry-failure-rep-2");
      await flush();
    });

    // Other rows are still mounted (preserve mode left them alone).
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();
    expect(getByTestId("row-failure-rep-2")).not.toBeNull();
    expect(getByTestId("row-failure-rep-3")).not.toBeNull();
    // The summary panel itself stays in place — preserve mode must
    // NOT hand control to the live progress panel.
    expect(getByTestId("panel-backfill-result")).not.toBeNull();

    // Only the targeted row shows the "Retrying…" copy; the other
    // rows' Retry buttons keep their default label.
    expect(
      getByTestId("button-retry-failure-rep-2")?.textContent ?? "",
    ).toContain("Retrying…");
    expect(
      getByTestId("button-retry-failure-rep-1")?.textContent ?? "",
    ).not.toContain("Retrying…");
    expect(
      getByTestId("button-retry-failure-rep-3")?.textContent ?? "",
    ).not.toContain("Retrying…");

    // Headline stats untouched mid-flight.
    expect(getByTestId("stat-failed")?.textContent ?? "").toContain("3");
    expect(getByTestId("stat-updated")?.textContent ?? "").toContain("5");

    // The request body carried only the single targeted ID — proves
    // we hit the per-row path, not the batch path.
    const init = pendingStream?.request.init;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
      onlyIds: ["rep-2"],
    });
  });

  it("removes the row, increments 'Updated' and decrements 'Failed' when the per-row retry succeeds", async () => {
    await mountAndHydrate();

    expect(getByTestId("stat-updated")?.textContent ?? "").toContain("5");
    expect(getByTestId("stat-failed")?.textContent ?? "").toContain("3");

    await act(async () => {
      clickByTestId("button-retry-failure-rep-2");
      await flush();
    });

    // Stream a successful per-row result, the matching `complete`
    // event, then close so `runBackfill` exits its read loop and
    // applies the merge.
    await act(async () => {
      pushStreamEvent({
        type: "progress",
        index: 1,
        total: 1,
        result: {
          id: "rep-2",
          companyName: "Beta Inc",
          isWhatIf: false,
          status: "updated",
          upgrades: [
            { code: "bumped-schema", label: "Bumped schema 2.0 → 2.2" },
          ],
          metricDeltas: [],
          durationMs: 60,
        },
      });
      pushStreamEvent({
        type: "complete",
        success: true,
        force: true,
        total: 1,
        updated: 1,
        skipped: 0,
        failed: 0,
        durationMs: 60,
      });
      closeStream();
      await flush();
    });

    // rep-2 was merged out of the failures table…
    expect(getByTestId("row-failure-rep-2")).toBeNull();
    // …and the other two rows are untouched.
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();
    expect(getByTestId("row-failure-rep-3")).not.toBeNull();
    // The other rows kept their original error text — proves the
    // merge didn't accidentally rewrite untouched rows.
    expect(getByTestId("text-failure-error-rep-1")?.textContent ?? "").toContain(
      "Bad data v1",
    );
    expect(getByTestId("text-failure-error-rep-3")?.textContent ?? "").toContain(
      "Other failure",
    );

    // Headline stats: updated 5 → 6, failed 3 → 2. Skipped + total
    // unchanged.
    expect(getByTestId("stat-updated")?.textContent ?? "").toContain("6");
    expect(getByTestId("stat-failed")?.textContent ?? "").toContain("2");
    expect(getByTestId("stat-skipped")?.textContent ?? "").toContain("2");
    expect(getByTestId("stat-total")?.textContent ?? "").toContain("10");

    // The retry spinner has cleared on every row (no stuck spinners).
    expect(
      getByTestId("button-retry-failure-rep-1")?.textContent ?? "",
    ).not.toContain("Retrying…");
    expect(
      getByTestId("button-retry-failure-rep-3")?.textContent ?? "",
    ).not.toContain("Retrying…");
  });

  it("updates the row's error text in place and leaves the row in the table when the per-row retry fails again", async () => {
    await mountAndHydrate();

    expect(getByTestId("text-failure-error-rep-2")?.textContent ?? "").toContain(
      "Network blip",
    );

    await act(async () => {
      clickByTestId("button-retry-failure-rep-2");
      await flush();
    });

    await act(async () => {
      pushStreamEvent({
        type: "progress",
        index: 1,
        total: 1,
        result: {
          id: "rep-2",
          companyName: "Beta Inc",
          isWhatIf: false,
          status: "failed",
          error: "Still broken — second attempt",
          durationMs: 70,
        },
      });
      pushStreamEvent({
        type: "complete",
        success: true,
        force: true,
        total: 1,
        updated: 0,
        skipped: 0,
        failed: 1,
        durationMs: 70,
      });
      closeStream();
      await flush();
    });

    // Row is still in the table…
    expect(getByTestId("row-failure-rep-2")).not.toBeNull();
    // …with its error text replaced in place.
    const updatedError =
      getByTestId("text-failure-error-rep-2")?.textContent ?? "";
    expect(updatedError).toContain("Still broken — second attempt");
    expect(updatedError).not.toContain("Network blip");

    // Other rows untouched, headline stats unchanged (still 5 / 3).
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();
    expect(getByTestId("row-failure-rep-3")).not.toBeNull();
    expect(getByTestId("stat-updated")?.textContent ?? "").toContain("5");
    expect(getByTestId("stat-failed")?.textContent ?? "").toContain("3");

    // Spinner cleared on the retried row.
    expect(
      getByTestId("button-retry-failure-rep-2")?.textContent ?? "",
    ).not.toContain("Retrying…");
  });
});

describe("AdminPanel — batch 'Retry these' keeps the reset-and-replace path", () => {
  it("clears the existing failures table immediately and replaces the summary with the new run's result", async () => {
    await mountAndHydrate();

    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();
    expect(getByTestId("row-failure-rep-2")).not.toBeNull();
    expect(getByTestId("row-failure-rep-3")).not.toBeNull();

    await act(async () => {
      clickByTestId("button-retry-failures");
      await flush();
    });

    // Reset-and-replace: the old summary is gone the moment the run
    // starts. (preserve mode would have left the panel mounted —
    // this assertion is what stops a future refactor from quietly
    // merging the two paths.)
    expect(getByTestId("panel-backfill-result")).toBeNull();
    expect(getByTestId("row-failure-rep-1")).toBeNull();
    expect(getByTestId("row-failure-rep-2")).toBeNull();
    expect(getByTestId("row-failure-rep-3")).toBeNull();

    // The batch path posts every failed ID, not just one.
    const init = pendingStream?.request.init;
    expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
      onlyIds: ["rep-1", "rep-2", "rep-3"],
    });

    // Finish the run with one success and two still-failing — the
    // new summary should fully replace the old one (not merge).
    await act(async () => {
      pushStreamEvent({ type: "start", total: 3, force: true });
      pushStreamEvent({
        type: "progress",
        index: 1,
        total: 3,
        result: {
          id: "rep-1",
          companyName: "Acme Co",
          isWhatIf: false,
          status: "updated",
          upgrades: [],
          metricDeltas: [],
          durationMs: 50,
        },
      });
      pushStreamEvent({
        type: "progress",
        index: 2,
        total: 3,
        result: {
          ...HYDRATED_FAILURES[1],
          error: "still down",
          durationMs: 50,
        },
      });
      pushStreamEvent({
        type: "progress",
        index: 3,
        total: 3,
        result: {
          ...HYDRATED_FAILURES[2],
          error: "still down",
          durationMs: 50,
        },
      });
      pushStreamEvent({
        type: "complete",
        success: true,
        force: true,
        total: 3,
        updated: 1,
        skipped: 0,
        failed: 2,
        durationMs: 150,
        failures: [
          { ...HYDRATED_FAILURES[1], error: "still down", durationMs: 50 },
          { ...HYDRATED_FAILURES[2], error: "still down", durationMs: 50 },
        ],
      });
      closeStream();
      await flush();
    });

    // The new summary is the ONLY summary — headline stats reflect
    // the new run (1 updated / 2 failed / 3 total), not the merge of
    // the old run's 5 updated / 3 failed.
    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    expect(getByTestId("stat-total")?.textContent ?? "").toContain("3");
    expect(getByTestId("stat-updated")?.textContent ?? "").toContain("1");
    expect(getByTestId("stat-failed")?.textContent ?? "").toContain("2");

    // rep-1 succeeded, so it's gone; rep-2 + rep-3 are back with
    // their new error text.
    expect(getByTestId("row-failure-rep-1")).toBeNull();
    expect(getByTestId("row-failure-rep-2")).not.toBeNull();
    expect(getByTestId("row-failure-rep-3")).not.toBeNull();
    expect(getByTestId("text-failure-error-rep-2")?.textContent ?? "").toContain(
      "still down",
    );
    expect(getByTestId("text-failure-error-rep-3")?.textContent ?? "").toContain(
      "still down",
    );
  });
});
