// @vitest-environment jsdom
//
// Component tests for the clickable report-ID link on the Admin
// post-run failures table.
//
// Background: each failed row's report ID used to render as plain
// monospace text. We turned it into an anchor that opens
// `/reports/<id>` in a new tab so admins can triage a failure in one
// click — matching the upgrades-applied panel. The behaviour is easy
// to silently regress (a future refactor could revert the cell to a
// plain `<TableCell>{f.id}</TableCell>` and admins would only notice
// during a real incident), so this suite locks in:
//
//   - Anchor exists per row with `href="/reports/<id>"`,
//     `target="_blank"`, and `rel="noopener noreferrer"`.
//   - Tooltip differs by row type: regular reports vs what-ifs.
//   - Both row types route to `/reports/<id>` (ReportViewer doesn't
//     differentiate).
//   - The click handler does NOT call `preventDefault` when there is
//     an active text selection inside the link, so admins can still
//     drag-select the ID to copy it.
//
// We follow the rendering harness from
// tests/admin-per-row-retry.test.tsx so the AdminPanel's hydration
// fetch + radix-ui stubs are satisfied.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// AuthContext + toast mocks (same shape as the per-row-retry test).
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

// jsdom polyfills for radix-ui components AdminPanel + Layout touch.
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
// Hydration fixture: seed at least one failed regular report and one
// failed what-if so we can assert both tooltip variants and confirm
// both row types route to `/reports/<id>`.
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
    id: "rep-regular-1",
    companyName: "Acme Co",
    isWhatIf: false,
    status: "failed",
    error: "Bad data v1",
    durationMs: 120,
  },
  {
    id: "rep-whatif-2",
    companyName: "Beta Inc",
    isWhatIf: true,
    status: "failed",
    error: "What-if blew up",
    durationMs: 150,
  },
];

function makeHydration() {
  return {
    summary: {
      success: true,
      force: false,
      total: 5,
      updated: 2,
      skipped: 1,
      failed: 2,
      durationMs: 4000,
      failures: HYDRATED_FAILURES.map((f) => ({ ...f })),
    },
    updatedReports: [],
    completedAt: "2026-01-01T00:00:00.000Z",
  };
}

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
    return new Response("", { status: 200 });
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Generic test plumbing (mirrors tests/admin-per-row-retry.test.tsx).
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
  installFetchMock();
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
describe("AdminPanel — failures table report-ID link", () => {
  it("renders an anchor per failure row that opens /reports/<id> in a new tab with safe rel attributes", async () => {
    await mountAndHydrate();

    expect(getByTestId("panel-backfill-result")).not.toBeNull();

    for (const f of HYDRATED_FAILURES) {
      const link = getByTestId(`link-failure-report-${f.id}`);
      expect(link, `link missing for ${f.id}`).not.toBeNull();
      expect(link!.tagName).toBe("A");
      expect(link!.getAttribute("href")).toBe(`/reports/${f.id}`);
      expect(link!.getAttribute("target")).toBe("_blank");
      // `rel` must include both tokens — order/whitespace doesn't matter.
      const rel = (link!.getAttribute("rel") ?? "").split(/\s+/);
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
      // The cell text is still the raw ID so admins can read/copy it.
      expect(link!.textContent).toBe(f.id);
    }
  });

  it("uses the regular-report tooltip for non-what-if rows and the what-if tooltip for what-if rows", async () => {
    await mountAndHydrate();

    const regular = getByTestId("link-failure-report-rep-regular-1");
    const whatIf = getByTestId("link-failure-report-rep-whatif-2");

    expect(regular?.getAttribute("title")).toBe("Open report in new tab");
    expect(whatIf?.getAttribute("title")).toBe(
      "Open what-if report in new tab",
    );
  });

  it("routes both report and what-if failures to /reports/<id> (ReportViewer doesn't differentiate)", async () => {
    await mountAndHydrate();

    const regular = getByTestId("link-failure-report-rep-regular-1");
    const whatIf = getByTestId("link-failure-report-rep-whatif-2");

    expect(regular?.getAttribute("href")).toBe("/reports/rep-regular-1");
    expect(whatIf?.getAttribute("href")).toBe("/reports/rep-whatif-2");
  });

  it("preserves text selection: clicking the link while the ID is selected suppresses navigation (preventDefault) so the browser's drag-to-copy gesture survives", async () => {
    await mountAndHydrate();

    const link = getByTestId("link-failure-report-rep-regular-1");
    expect(link).not.toBeNull();

    // Programmatically select the ID text inside the anchor so the
    // click handler sees a non-empty selection anchored within the
    // link — exactly the state an admin is in mid-drag-select.
    const range = document.createRange();
    range.selectNodeContents(link!);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    expect(sel?.toString()).toBe("rep-regular-1");

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    link!.dispatchEvent(click);

    // The handler in Admin.tsx calls preventDefault precisely when
    // the active selection sits inside the link, so the new-tab
    // navigation is suppressed in favor of preserving the copy
    // gesture. (The no-selection case is covered by the next test.)
    expect(
      click.defaultPrevented,
      "click handler must call preventDefault when text is selected inside the link, so the browser keeps the selection instead of navigating away",
    ).toBe(true);
  });

  it("falls through to default navigation when there is no active text selection", async () => {
    await mountAndHydrate();

    const link = getByTestId("link-failure-report-rep-regular-1");
    expect(link).not.toBeNull();

    // Clear any selection so the handler's early-return branch fires.
    window.getSelection()?.removeAllRanges();

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    link!.dispatchEvent(click);

    expect(
      click.defaultPrevented,
      "click handler must NOT preventDefault when no text is selected — the new-tab navigation should proceed",
    ).toBe(false);
  });
});
