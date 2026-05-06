// @vitest-environment jsdom
//
// Component tests for the "Clear last run" button on the Admin
// backfill panel.
//
// Background: the Admin page hydrates a persisted last-run summary on
// mount via GET /api/admin/last-backfill. Operators can drop that
// persisted summary with a confirmation-protected "Clear last run"
// button which fires DELETE /api/admin/last-backfill and then
// collapses the rehydrated panel locally so the change is visible
// without a refresh.
//
// The server-side route + storage layers already have unit tests, but
// none of the React wiring is covered: the button → dialog → confirm
// → DELETE flow, the disabled-while-running guard, and the
// failure-toast path could all silently regress in production. These
// tests render the real `AdminPanel` against a controllable `fetch`
// mock and lock in those behaviours.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks for the surrounding context. AdminPanel pulls in `useAuth`
// (for the "Step down" button) and `useToast` (for the clear-run
// success/failure toasts). We mock both so we don't need to wrap the
// panel in `<AuthProvider>` + `<Toaster>` and so we can spy on toast
// payloads directly without scraping a portal-rendered DOM.
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
// mount (Select, AlertDialog, Tooltip, etc). Stub the ones AdminPanel
// + Layout will hit so a render doesn't throw mid-test.
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
// Hydration fixture. The Admin page calls GET /api/admin/last-backfill
// on mount and renders the persisted summary before the operator does
// anything; we seed it with one failure row so we can assert the
// whole panel — stats + failures table — collapses on a successful
// clear.
// ---------------------------------------------------------------------------
function makeHydration() {
  return {
    summary: {
      success: true,
      force: false,
      total: 4,
      updated: 2,
      skipped: 1,
      failed: 1,
      durationMs: 4000,
      failures: [
        {
          id: "rep-1",
          companyName: "Acme Co",
          isWhatIf: false,
          status: "failed" as const,
          error: "Bad data v1",
          durationMs: 120,
        },
      ],
    },
    updatedReports: [],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Fetch mock. The clear-last-run flow only cares about
// DELETE /api/admin/last-backfill, but AdminPanel fires several other
// requests on mount (audit log, settings, etc) and uses a streaming
// NDJSON response for backfill runs. We answer all of them so the
// mount doesn't throw, and expose a `pendingStream` handle so the
// disabled-while-running test can park a backfill mid-flight without
// finishing it.
// ---------------------------------------------------------------------------
interface DeleteCall {
  url: string;
  init?: RequestInit;
}

interface PendingStream {
  controller: ReadableStreamDefaultController<Uint8Array>;
}

let deleteCalls: DeleteCall[] = [];
let deleteResponse: () => Response = () =>
  new Response("", { status: 200 });
let pendingStream: PendingStream | null = null;

function pushStreamEvent(obj: unknown) {
  if (!pendingStream) throw new Error("No pending backfill stream");
  pendingStream.controller.enqueue(
    new TextEncoder().encode(`${JSON.stringify(obj)}\n`),
  );
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
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.startsWith("/api/admin/last-backfill")) {
        if (method === "DELETE") {
          deleteCalls.push({ url, init });
          return deleteResponse();
        }
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
        pendingStream = { controller };
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
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

function getByTestId(testId: string): HTMLElement | null {
  // Radix's AlertDialog renders into a portal attached to
  // document.body, so the dialog content lives outside the test
  // container. Walk the whole document so both in-tree and portalled
  // elements resolve.
  return document.querySelector(
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
  deleteCalls = [];
  deleteResponse = () => new Response("", { status: 200 });
  pendingStream = null;
  installFetchMock();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  // Drain any in-flight backfill stream so the detached `runBackfill`
  // promise can settle before we unmount.
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
  // Strip any portalled dialog content Radix left attached to body.
  document.body.querySelectorAll("[data-testid^='dialog-']").forEach((n) => {
    n.parentNode?.removeChild(n);
  });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AdminPanel — Clear last run button", () => {
  it("opens the confirmation dialog, posts DELETE on confirm, collapses the rehydrated panel and shows a success toast", async () => {
    await mountAndHydrate();

    // Hydration produced the summary panel + failure row.
    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();
    expect(getByTestId("button-clear-last-run")).not.toBeNull();
    // Dialog isn't mounted until the operator opens it.
    expect(getByTestId("dialog-confirm-clear-last-run")).toBeNull();
    expect(deleteCalls).toHaveLength(0);

    // Click the trigger — dialog opens, no DELETE yet.
    await act(async () => {
      clickByTestId("button-clear-last-run");
      await flush();
    });
    expect(getByTestId("dialog-confirm-clear-last-run")).not.toBeNull();
    expect(deleteCalls).toHaveLength(0);
    expect(getByTestId("panel-backfill-result")).not.toBeNull();

    // Confirm — DELETE fires, panel + failure row collapse, success
    // toast surfaces.
    await act(async () => {
      clickByTestId("button-confirm-clear-last-run");
      await flush();
    });

    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.init?.method).toBe("DELETE");
    expect(deleteCalls[0]?.url).toMatch(/\/api\/admin\/last-backfill$/);

    expect(getByTestId("panel-backfill-result")).toBeNull();
    expect(getByTestId("row-failure-rep-1")).toBeNull();
    expect(getByTestId("button-clear-last-run")).toBeNull();

    const successToast = toastSpy.mock.calls.find(
      (c) => (c[0] as { title?: string })?.title === "Last run cleared",
    );
    expect(successToast).toBeDefined();
    expect(
      (successToast?.[0] as { variant?: string })?.variant,
    ).not.toBe("destructive");
  });

  it("disables the Clear last run button while a backfill is in flight", async () => {
    await mountAndHydrate();

    const clearBtn = getByTestId(
      "button-clear-last-run",
    ) as HTMLButtonElement | null;
    expect(clearBtn).not.toBeNull();
    expect(clearBtn?.disabled).toBe(false);

    // Start a per-row retry so `running` flips to true. We don't push
    // any stream events — the run is parked mid-flight.
    await act(async () => {
      clickByTestId("button-retry-failure-rep-1");
      await flush();
    });

    const clearBtnDuring = getByTestId(
      "button-clear-last-run",
    ) as HTMLButtonElement | null;
    expect(clearBtnDuring).not.toBeNull();
    expect(clearBtnDuring?.disabled).toBe(true);

    // Clicking the disabled trigger must not open the dialog.
    await act(async () => {
      clickByTestId("button-clear-last-run");
      await flush();
    });
    expect(getByTestId("dialog-confirm-clear-last-run")).toBeNull();
    expect(deleteCalls).toHaveLength(0);

    // Drain the stream — `running` clears and the button re-enables,
    // proving the disabled state is bound to the in-flight run, not a
    // permanent latch.
    await act(async () => {
      pushStreamEvent({
        type: "complete",
        success: true,
        force: true,
        total: 1,
        updated: 0,
        skipped: 0,
        failed: 1,
        durationMs: 50,
      });
      pendingStream?.controller.close();
      pendingStream = null;
      await flush();
    });

    const clearBtnAfter = getByTestId(
      "button-clear-last-run",
    ) as HTMLButtonElement | null;
    expect(clearBtnAfter).not.toBeNull();
    expect(clearBtnAfter?.disabled).toBe(false);
  });

  it("shows a destructive failure toast and keeps the panel mounted when the DELETE returns 500", async () => {
    deleteResponse = () =>
      new Response("internal explosion", {
        status: 500,
        statusText: "Internal Server Error",
      });

    await mountAndHydrate();
    expect(getByTestId("panel-backfill-result")).not.toBeNull();

    await act(async () => {
      clickByTestId("button-clear-last-run");
      await flush();
    });
    expect(getByTestId("dialog-confirm-clear-last-run")).not.toBeNull();

    await act(async () => {
      clickByTestId("button-confirm-clear-last-run");
      await flush();
    });

    // DELETE was attempted exactly once.
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.init?.method).toBe("DELETE");

    // Panel + failure row stay mounted — local state must NOT be
    // wiped on a failed clear.
    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    expect(getByTestId("row-failure-rep-1")).not.toBeNull();

    // Trigger re-enables (no stuck spinner) so the operator can retry.
    const clearBtn = getByTestId(
      "button-clear-last-run",
    ) as HTMLButtonElement | null;
    expect(clearBtn?.disabled).toBe(false);

    // Destructive failure toast surfaced; success toast did not.
    const failureToast = toastSpy.mock.calls.find(
      (c) =>
        (c[0] as { title?: string })?.title === "Could not clear last run",
    );
    expect(failureToast).toBeDefined();
    expect((failureToast?.[0] as { variant?: string })?.variant).toBe(
      "destructive",
    );
    expect(
      (failureToast?.[0] as { description?: string })?.description ?? "",
    ).toContain("500");
    const successToast = toastSpy.mock.calls.find(
      (c) => (c[0] as { title?: string })?.title === "Last run cleared",
    );
    expect(successToast).toBeUndefined();
  });
});
