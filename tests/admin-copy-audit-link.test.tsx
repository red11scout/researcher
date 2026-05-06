// @vitest-environment jsdom
//
// Component tests for the "Copy link" button in the Recent admin
// activity header (added in task #62).
//
// The button copies `window.location.href` to the clipboard so an
// admin can share their currently-filtered audit view with a teammate.
// It is intentionally disabled when no filter is active — sharing the
// default unfiltered URL is a useless link, and the title attribute
// nudges the operator to pick a filter first.
//
// Three behaviours worth locking in so a future refactor can't quietly
// regress the disabled gate or the toast wiring:
//
//   1. The button is disabled when filters are at their defaults, and
//      becomes enabled once any single filter is applied.
//   2. Clicking it writes `window.location.href` to the clipboard and
//      surfaces the "Link copied" success toast.
//   3. A clipboard rejection surfaces the destructive "Copy failed"
//      toast instead of silently swallowing the error.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Toast spy — RecentAdminActivity calls `useToast()` at the top of its
// body, so we intercept the hook to capture every toast payload the
// Copy link click path produces.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
  toast: toastSpy,
}));

// Radix's Select doesn't render a native <select> in jsdom, so the
// header's action/status dropdowns never reach the DOM in a usable
// form without this stub. We don't drive them in this suite, but the
// panel renders them on every mount and would crash trying to wire
// portals / pointer-capture in jsdom otherwise.
vi.mock("@/components/ui/select", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Select = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Select,
    SelectTrigger: passthrough,
    SelectContent: passthrough,
    SelectItem: passthrough,
    SelectValue: passthrough,
    SelectGroup: passthrough,
    SelectLabel: passthrough,
    SelectSeparator: passthrough,
  };
});

import { RecentAdminActivity } from "../client/src/pages/Admin";
import { AUDIT_PAGE_SIZE } from "../client/src/components/admin/constants";
import { EMPTY_AUDIT_FILTERS, type AuditFilters } from "@/lib/auditUrlParams";

// ---------------------------------------------------------------------------
// Clipboard mock — jsdom does not implement `navigator.clipboard`, so
// we install a writable spy and swap its implementation per test.
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
// Render plumbing
// ---------------------------------------------------------------------------
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  toastSpy.mockReset();
  installClipboardMock();
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

function renderPanel(filters: Partial<AuditFilters> = {}) {
  const merged: AuditFilters = { ...EMPTY_AUDIT_FILTERS, ...filters };
  act(() => {
    root.render(
      <RecentAdminActivity
        entries={[]}
        total={0}
        loading={false}
        error={null}
        filters={merged}
        offset={0}
        pageSize={AUDIT_PAGE_SIZE}
        onChangeFilters={vi.fn()}
        onResetFilters={vi.fn()}
        onChangeOffset={vi.fn()}
        onRefresh={vi.fn()}
        onExport={vi.fn()}
        exporting={null}
        cleanup={null}
        cleanupLoading={false}
        cleanupError={null}
      />,
    );
  });
}

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RecentAdminActivity — Copy link button (disabled gate)", () => {
  it("is disabled when no filter is active (defaults)", () => {
    renderPanel();
    const btn = getByTestId("button-copy-audit-link") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
    // The disabled-state title nudges the operator toward applying a
    // filter rather than just being mute about why the click is dead.
    expect(btn!.getAttribute("title")).toMatch(/apply at least one filter/i);
  });

  // hasActiveFilter unions five fields — exercise each one to make
  // sure none of them get dropped from the predicate in a refactor.
  it.each<[string, Partial<AuditFilters>]>([
    ["action", { action: "admin-login" }],
    ["status", { status: "failure" }],
    ["since", { since: "2026-04-01" }],
    ["until", { until: "2026-04-29" }],
    ["ip", { ip: "10.0.0.1" }],
  ])("is enabled once the %s filter is applied", (_label, filters) => {
    renderPanel(filters);
    const btn = getByTestId("button-copy-audit-link") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
    expect(btn!.getAttribute("title")).toMatch(/copy a shareable url/i);
  });

  it("treats a whitespace-only IP filter as inactive (still disabled)", () => {
    // The `hasActiveFilter` predicate trims the IP value so a stray
    // space typed into the input doesn't enable a "share this filter"
    // link that actually hits the unfiltered URL.
    renderPanel({ ip: "   " });
    const btn = getByTestId("button-copy-audit-link") as HTMLButtonElement | null;
    expect(btn!.disabled).toBe(true);
  });
});

describe("RecentAdminActivity — Copy link button (clipboard wiring)", () => {
  it("writes window.location.href to the clipboard and shows 'Link copied'", async () => {
    renderPanel({ action: "admin-login" });

    // Pin the URL so the assertion is exact rather than coupled to
    // whatever jsdom defaults to (about:blank-style URLs change).
    const sharedUrl = "http://localhost/admin?action=admin-login";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, href: sharedUrl },
    });

    const btn = getByTestId("button-copy-audit-link") as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await flush();
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith(sharedUrl);

    const successCalls = toastSpy.mock.calls.filter(
      ([arg]) => arg && arg.title === "Link copied",
    );
    expect(successCalls).toHaveLength(1);
    // The destructive variant must not slip through on the happy path.
    expect(
      toastSpy.mock.calls.find(
        ([arg]) => arg && arg.variant === "destructive",
      ),
    ).toBeUndefined();
  });

  it("surfaces a destructive 'Copy failed' toast when the clipboard write rejects", async () => {
    renderPanel({ status: "failure" });

    clipboardWriteText.mockRejectedValueOnce(new Error("blocked by browser"));

    const btn = getByTestId("button-copy-audit-link") as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
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
        ([arg]) => arg && arg.title === "Link copied",
      ),
    ).toBeUndefined();
  });
});
