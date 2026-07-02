// @vitest-environment jsdom
//
// Component tests for the "Copy IDs" button on the Admin backfill
// failures table (added in task #45).
//
// The button lets an operator grab every failed report ID with one
// click. There are four behaviours worth locking in so we don't
// silently regress back to "highlight the cells one by one":
//
//   1. Clicking it writes the failed IDs, joined by newlines, to the
//      system clipboard.
//   2. The success toast tells the operator how many IDs were copied
//      (with correct singular/plural wording).
//   3. The whole failures panel — and therefore the button — is not
//      rendered when `result.failures` is empty.
//   4. A clipboard rejection surfaces the destructive "Copy failed"
//      toast instead of silently swallowing the error.
//
// These tests render the real `AdminPanel` against a controllable
// `fetch` + `navigator.clipboard.writeText` mock. The harness is
// modelled on `tests/admin-per-row-retry.test.tsx`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks for the surrounding context.
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
// Hydration fixtures: the Admin page calls GET /api/admin/last-backfill on
// mount and renders the persisted summary before the operator does
// anything. We provide two variants — one with three failures, one with
// none — so each test gets the precondition it needs without having to
// drive a streaming run.
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

function makeHydrationWithFailures() {
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

function makeHydrationWithoutFailures() {
  return {
    summary: {
      success: true,
      force: false,
      total: 10,
      updated: 8,
      skipped: 2,
      failed: 0,
      durationMs: 5000,
      failures: [],
    },
    updatedReports: [],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Fetch mock — matches the surface AdminPanel touches on mount.
// ---------------------------------------------------------------------------
let hydrationPayload: ReturnType<typeof makeHydrationWithFailures> = makeHydrationWithFailures();

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    if (url.startsWith("/api/admin/last-backfill")) {
      return new Response(JSON.stringify(hydrationPayload), {
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
    return new Response("", { status: 200 });
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Clipboard mock. jsdom does not implement `navigator.clipboard`, so we
// install our own writable spy and swap its implementation per test.
// ---------------------------------------------------------------------------
let clipboardWriteText: ReturnType<typeof vi.fn>;

function installClipboardMock() {
  clipboardWriteText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
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
  hydrationPayload = makeHydrationWithFailures();
  installFetchMock();
  installClipboardMock();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AdminPanel — 'Copy IDs' on the failures table", () => {
  it("writes every failed report ID to the clipboard, joined by newlines", async () => {
    await mountAndHydrate();

    // Sanity: hydration produced the failures panel + the button.
    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    const button = getByTestId("button-copy-ids-failures");
    expect(button).not.toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      clickByTestId("button-copy-ids-failures");
      await flush();
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith("rep-1\nrep-2\nrep-3");
  });

  it("shows a success toast that reflects the number of copied IDs", async () => {
    await mountAndHydrate();

    await act(async () => {
      clickByTestId("button-copy-ids-failures");
      await flush();
    });

    // We expect exactly one toast call from the click — the success
    // toast — with both the count and the pluralised wording baked in.
    const successCalls = toastSpy.mock.calls.filter(
      ([arg]) => arg && arg.title === "Copied to clipboard",
    );
    expect(successCalls).toHaveLength(1);
    expect(successCalls[0][0]).toMatchObject({
      title: "Copied to clipboard",
      description: "3 failed report IDs copied.",
    });
    // No destructive toast slipped through on the happy path.
    expect(
      toastSpy.mock.calls.find(
        ([arg]) => arg && arg.variant === "destructive",
      ),
    ).toBeUndefined();
  });

  it("does not render the failures panel (and therefore the Copy IDs button) when there are no failures", async () => {
    hydrationPayload = makeHydrationWithoutFailures();

    await mountAndHydrate();

    // The summary panel itself still renders (the run completed).
    expect(getByTestId("panel-backfill-result")).not.toBeNull();
    // But with `failures: []`, the failures table — and the Copy IDs
    // button living in its header — must not be in the DOM at all.
    expect(getByTestId("button-copy-ids-failures")).toBeNull();
    expect(getByTestId("button-retry-failures")).toBeNull();
  });

  it("surfaces a destructive 'Copy failed' toast when the clipboard write rejects", async () => {
    await mountAndHydrate();

    clipboardWriteText.mockRejectedValueOnce(new Error("blocked by browser"));

    await act(async () => {
      clickByTestId("button-copy-ids-failures");
      await flush();
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);

    const failureCalls = toastSpy.mock.calls.filter(
      ([arg]) => arg && arg.title === "Copy failed",
    );
    expect(failureCalls).toHaveLength(1);
    expect(failureCalls[0][0]).toMatchObject({
      title: "Copy failed",
      variant: "destructive",
    });
    // The success toast must not have fired on the failure path.
    expect(
      toastSpy.mock.calls.find(
        ([arg]) => arg && arg.title === "Copied to clipboard",
      ),
    ).toBeUndefined();
  });
});
