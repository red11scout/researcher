// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/admin" }
//
// Component test for the URL ↔ filter-state syncing wired into
// `AdminPanel`. The pure helper at `client/src/lib/auditUrlParams.ts`
// is exercised by `tests/audit-url-params.test.ts`; this suite proves
// the WIRING — that selecting a filter pushes a new history entry,
// that "Clear filters" navigates to `/admin` with no query string,
// that mounting at `/admin?action=…&offset=25` restores the matching
// filter + page, and that browser back/forward (popstate) re-derives
// filters from the URL. A regression where someone reverts to
// `useState` for the filter state — or forgets to thread
// `onChangeOffset` through `navigate` — would silently break the
// "shareable filter link" promise; this test would catch it.
//
// We render the real `AdminPanel` under wouter's default browser
// location hook (which subscribes to pushState/replaceState/popstate),
// stubbing the heavy peripheral pieces (Layout, useAuth, useToast,
// global fetch) and replacing Radix's portal-based <Select> with a
// native <select> the same way `admin-audit-filter-form.test.tsx`
// does. That keeps the test focused on URL behaviour, not on the
// whole admin page.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Module mocks ----------------------------------------------------------
// Layout pulls in the auth-aware shell (sidebar, brand). We don't need any
// of that to test URL sync, and rendering it would just require even more
// mocks. Make it a passthrough.
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    adminLogout: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

// Same Radix Select mock used by tests/admin-audit-filter-form.test.tsx —
// Radix's Select uses pointer events + a portal that won't open in jsdom,
// so we replace it with a native <select>/<option> tree that preserves the
// `value` / `onValueChange` / `<SelectItem value>` API surface.
vi.mock("@/components/ui/select", () => {
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => {
    const options: { value: string; label: ReactNode }[] = [];
    const walk = (node: ReactNode): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== "object") return;
      const el = node as {
        type?: { displayName?: string; name?: string };
        props?: { value?: string; children?: ReactNode };
      };
      const name = el.type?.displayName ?? el.type?.name;
      if (name === "SelectItem" && typeof el.props?.value === "string") {
        options.push({ value: el.props.value, label: el.props.children });
      }
      if (el.props?.children) walk(el.props.children);
    };
    walk(children);

    let triggerTestId: string | undefined;
    const findTrigger = (node: ReactNode): void => {
      if (Array.isArray(node)) {
        node.forEach(findTrigger);
        return;
      }
      if (!node || typeof node !== "object") return;
      const el = node as {
        type?: { displayName?: string; name?: string };
        props?: { ["data-testid"]?: string; children?: ReactNode };
      };
      const name = el.type?.displayName ?? el.type?.name;
      if (name === "SelectTrigger" && el.props?.["data-testid"]) {
        triggerTestId = el.props["data-testid"];
      }
      if (el.props?.children) findTrigger(el.props.children);
    };
    findTrigger(children);

    return (
      <select
        value={value}
        data-testid={triggerTestId}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {typeof opt.label === "string" ? opt.label : opt.value}
          </option>
        ))}
      </select>
    );
  };
  const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const SelectTrigger = ({ children }: { children?: ReactNode; ["data-testid"]?: string }) => <>{children}</>;
  SelectTrigger.displayName = "SelectTrigger";
  const SelectContent = ({ children }: { children?: ReactNode }) => <>{children}</>;
  SelectContent.displayName = "SelectContent";
  const SelectItem = ({ value, children }: { value: string; children?: ReactNode }) => (
    <option value={value}>{children}</option>
  );
  SelectItem.displayName = "SelectItem";
  const SelectValue = passthrough;
  SelectValue.displayName = "SelectValue";
  const SelectGroup = passthrough;
  SelectGroup.displayName = "SelectGroup";
  const SelectLabel = passthrough;
  SelectLabel.displayName = "SelectLabel";
  const SelectSeparator = passthrough;
  SelectSeparator.displayName = "SelectSeparator";
  return {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
    SelectGroup,
    SelectLabel,
    SelectSeparator,
  };
});

import { Router } from "wouter";
import { AdminPanel } from "../client/src/pages/Admin";

// --- Test scaffolding ------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

// Reset the URL back to `/admin` (with no query) before each test so the
// browser-history-backed wouter hook starts from a known state. jsdom's
// `history.replaceState` only allows same-origin URLs; the env-options
// directive at the top of this file boots jsdom at `http://localhost/admin`
// to make that legal.
function resetUrl(path = "/admin") {
  window.history.replaceState(null, "", path);
}

function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    let body: unknown = {};
    if (url.includes("/api/admin/audit-log")) {
      body = { entries: [], total: 0 };
    } else if (url.includes("/api/admin/last-audit-cleanup")) {
      body = { cleanup: null };
    } else if (url.includes("/api/admin/last-backfill")) {
      body = { summary: null };
    } else if (url.includes("/api/admin/settings")) {
      body = {
        settings: { auditRetentionDays: null, updatedAt: null },
        effective: { auditRetentionDays: 90 },
      };
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

beforeEach(() => {
  resetUrl();
  fetchMock = makeFetchMock();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUrl();
});

function render() {
  act(() => {
    root.render(
      <Router>
        <AdminPanel />
      </Router>,
    );
  });
}

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

// React tracks controlled-input values via a hidden `_valueTracker`, so
// setting `.value` directly is silently dropped. Use the prototype setter.
function fireChange(el: HTMLElement, value: string) {
  const input = el as HTMLInputElement | HTMLSelectElement;
  const proto =
    input instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    if (setter) setter.call(input, value);
    else (input as { value: string }).value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

// --- Tests -----------------------------------------------------------------

describe("AdminPanel — URL-shareable audit filter view", () => {
  it("toggling the action dropdown pushes the new filter into window.location.search", () => {
    render();
    expect(window.location.search).toBe("");

    fireChange(getByTestId("select-audit-action")!, "admin-login-failed");

    expect(window.location.pathname).toBe("/admin");
    expect(window.location.search).toBe("?action=admin-login-failed");
  });

  it("toggling the status dropdown pushes the new filter into the URL", () => {
    render();
    fireChange(getByTestId("select-audit-status")!, "failure");
    expect(window.location.search).toBe("?status=failure");
  });

  it("typing into the IP filter pushes the (debounced + trimmed) value into the URL", () => {
    vi.useFakeTimers();
    try {
      render();

      // Two keystrokes in quick succession — the debounce inside
      // `RecentAdminActivity` (300ms) should hold the URL stable until the
      // operator stops typing.
      fireChange(getByTestId("input-audit-ip")!, "10.");
      fireChange(getByTestId("input-audit-ip")!, "  10.0.0.1  ");
      expect(window.location.search).toBe("");

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(window.location.search).toBe("");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      // Whitespace must be trimmed before being persisted to the URL,
      // matching `buildAuditUrlParams`'s contract.
      expect(window.location.search).toBe("?ip=10.0.0.1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("typing a date into the From / To pickers pushes YYYY-MM-DD into the URL", () => {
    render();

    fireChange(getByTestId("input-audit-since")!, "2026-04-01");
    expect(window.location.search).toBe("?since=2026-04-01");

    fireChange(getByTestId("input-audit-until")!, "2026-04-29");
    // Changing one filter merges, not replaces — the previous `since`
    // must still be in the URL.
    const sp = new URLSearchParams(window.location.search);
    expect(sp.get("since")).toBe("2026-04-01");
    expect(sp.get("until")).toBe("2026-04-29");
  });

  it("each filter change pushes a NEW history entry (so back/forward walks them)", () => {
    render();
    const before = window.history.length;

    fireChange(getByTestId("select-audit-action")!, "admin-login-failed");
    fireChange(getByTestId("select-audit-status")!, "failure");

    // Two pushState calls → two new history entries. We assert >= because
    // jsdom's history length is shared across the test runner.
    expect(window.history.length).toBeGreaterThanOrEqual(before + 2);
    expect(window.location.search).toBe(
      "?action=admin-login-failed&status=failure",
    );
  });

  it("changing a filter resets offset to 0 (so the operator isn't stranded mid-page)", () => {
    // Mount on page 2 of a filtered set …
    resetUrl("/admin?action=admin-login-failed&offset=25");
    render();
    expect(window.location.search).toBe(
      "?action=admin-login-failed&offset=25",
    );

    // … then change a different filter. The URL must drop `offset` so
    // the canonical value (page 0) is in force again.
    fireChange(getByTestId("select-audit-status")!, "failure");
    const sp = new URLSearchParams(window.location.search);
    expect(sp.get("status")).toBe("failure");
    expect(sp.get("action")).toBe("admin-login-failed");
    expect(sp.get("offset")).toBeNull();
  });

  it("'Clear filters' navigates to /admin with no query string", () => {
    resetUrl("/admin?action=admin-login-failed&status=failure&offset=25");
    render();

    const clearBtn = getByTestId("button-clear-audit-filters");
    expect(clearBtn).not.toBeNull();
    click(clearBtn!);

    expect(window.location.pathname).toBe("/admin");
    expect(window.location.search).toBe("");
  });

  it("mounting at /admin?action=…&offset=25 restores the matching filter + page", () => {
    resetUrl("/admin?action=admin-login-failed&offset=25");
    render();

    // The action select reflects the URL value …
    const actionSelect = getByTestId("select-audit-action") as HTMLSelectElement;
    expect(actionSelect.value).toBe("admin-login-failed");

    // … and the audit-log fetch was issued with the same filter + offset.
    const fetchedUrl = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api/admin/audit-log"));
    expect(fetchedUrl).toBeDefined();
    const params = new URLSearchParams(fetchedUrl!.split("?")[1]);
    expect(params.get("action")).toBe("admin-login-failed");
    expect(params.get("offset")).toBe("25");
    expect(params.get("limit")).toBe("25");
  });

  it("simulated back/forward (popstate) re-derives filters from the URL", () => {
    render();

    // Navigate forward through two filter states …
    fireChange(getByTestId("select-audit-action")!, "admin-login-failed");
    fireChange(getByTestId("select-audit-status")!, "failure");
    expect((getByTestId("select-audit-action") as HTMLSelectElement).value).toBe(
      "admin-login-failed",
    );
    expect((getByTestId("select-audit-status") as HTMLSelectElement).value).toBe(
      "failure",
    );

    // … then simulate the browser's Back button. We swap the URL to the
    // prior state and dispatch `popstate` ourselves — this is exactly what
    // `history.back()` does once jsdom's microtask queue settles, and it's
    // the path wouter's `useBrowserLocation` hook subscribes to.
    act(() => {
      window.history.replaceState(null, "", "/admin?action=admin-login-failed");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    // The status dropdown should snap back to "all" (it's no longer in the
    // URL), and the action dropdown should still hold the prior value.
    expect((getByTestId("select-audit-status") as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((getByTestId("select-audit-action") as HTMLSelectElement).value).toBe(
      "admin-login-failed",
    );

    // Back again to the empty state.
    act(() => {
      window.history.replaceState(null, "", "/admin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect((getByTestId("select-audit-action") as HTMLSelectElement).value).toBe(
      "all",
    );
    expect((getByTestId("select-audit-status") as HTMLSelectElement).value).toBe(
      "all",
    );
    // And "Clear filters" disappears once nothing is active.
    expect(getByTestId("button-clear-audit-filters")).toBeNull();
  });
});
