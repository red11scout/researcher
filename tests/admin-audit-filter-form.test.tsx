// @vitest-environment jsdom
//
// Component tests for the audit-log filter form on the Admin page —
// the action / status dropdowns, the since/until date pickers, the
// IP-substring input, the prev/next pager, and the "showing N of M"
// range copy that together drive `GET /api/admin/audit-log`.
//
// Task #39 already locked down the SERVER half of that contract
// (filter/pagination behaviour of the route). The CLIENT half — the
// form that builds the request — was uncovered. A regression like
// "we forgot to send `offset` when paging" or "an unselected dropdown
// now sends an empty string instead of being omitted" or "paging
// dropped the active filters" would have shipped silently. These
// tests render the real `RecentAdminActivity` panel in jsdom and
// assert the exact shape passed to its `onChangeFilters` /
// `onChangeOffset` callbacks (the same values the parent
// `AdminPanel` then folds into its `loadAuditLog` URL).
//
// Notes on the rendering setup:
//   - Radix's `<Select>` doesn't drive a native <select> in jsdom
//     (it uses pointer events + a portal), so we mock
//     `@/components/ui/select` to a native <select>/<option> tree.
//     The mock preserves `value`, `onValueChange`, and the option
//     children — everything the form actually depends on.
//   - The Input/Label/Button/Card/Table primitives are real; they
//     all render plain DOM under the hood and behave fine in jsdom.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

// React 18+/19's `act()` requires this flag to suppress the
// "current testing environment is not configured to support act(...)"
// warning emitted on every state update.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock Radix's Select wrapper to a plain native <select>. The real
// component is a popover that won't open in jsdom, so we'd never be
// able to fire a value-change event on it. The mock keeps the same
// API surface (`value`, `onValueChange`, `<SelectItem value>`) so
// the panel under test is unchanged.
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
    // Walk the children tree to find every <SelectItem value="..." />
    // and re-render them as native <option>s. The component nests
    // SelectTrigger > SelectValue and SelectContent > SelectItem, so
    // we collect items recursively.
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

    // We forward the testid from SelectTrigger so test queries that
    // look for `select-audit-action` etc. still find the form control.
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
  // Each component needs a stable `name` so the `walk()` above can
  // identify SelectItem by `el.type.name`.
  const SelectTrigger = ({
    children,
    ...rest
  }: {
    children?: ReactNode;
    ["data-testid"]?: string;
  }) => <>{children}</>;
  SelectTrigger.displayName = "SelectTrigger";
  const SelectContent = ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  );
  SelectContent.displayName = "SelectContent";
  const SelectItem = ({
    value,
    children,
  }: {
    value: string;
    children?: ReactNode;
  }) => <option value={value}>{children}</option>;
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

import {
  AUDIT_PAGE_SIZE,
  RecentAdminActivity,
} from "../client/src/pages/Admin";
import { EMPTY_AUDIT_FILTERS, type AuditFilters } from "@/lib/auditUrlParams";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// One synthetic entry — we don't care about the row contents in this
// suite, only that `entries.length` is non-zero so the table (and the
// "showing N of M" footer + pager) actually renders.
function makeEntries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i + 1}`,
    action: "backfill-reports",
    status: "success" as const,
    statusCode: 200,
    actorIp: "10.0.0.1",
    actorUserAgent: "test-agent",
    path: "/api/admin/upgrade-reports",
    params: null,
    outcome: { total: 1, updated: 1, skipped: 0, failed: 0, durationMs: 1000 },
    errorMessage: null,
    createdAt: "2026-04-29T12:00:00.000Z",
  }));
}

interface RenderOpts {
  filters?: Partial<AuditFilters>;
  offset?: number;
  total?: number;
  entryCount?: number;
}

interface Handlers {
  onChangeFilters: ReturnType<typeof vi.fn>;
  onChangeOffset: ReturnType<typeof vi.fn>;
  onResetFilters: ReturnType<typeof vi.fn>;
  onRefresh: ReturnType<typeof vi.fn>;
  onExport: ReturnType<typeof vi.fn>;
}

function renderPanel(opts: RenderOpts = {}): Handlers {
  const filters: AuditFilters = { ...EMPTY_AUDIT_FILTERS, ...opts.filters };
  const total = opts.total ?? 100;
  const entryCount = opts.entryCount ?? Math.min(total, AUDIT_PAGE_SIZE);
  const handlers: Handlers = {
    onChangeFilters: vi.fn(),
    onChangeOffset: vi.fn(),
    onResetFilters: vi.fn(),
    onRefresh: vi.fn(),
    onExport: vi.fn(),
  };
  act(() => {
    root.render(
      <RecentAdminActivity
        entries={makeEntries(entryCount)}
        total={total}
        loading={false}
        error={null}
        filters={filters}
        offset={opts.offset ?? 0}
        pageSize={AUDIT_PAGE_SIZE}
        onChangeFilters={handlers.onChangeFilters}
        onResetFilters={handlers.onResetFilters}
        onChangeOffset={handlers.onChangeOffset}
        onRefresh={handlers.onRefresh}
        onExport={handlers.onExport}
        exporting={null}
        cleanup={null}
        cleanupLoading={false}
        cleanupError={null}
      />,
    );
  });
  return handlers;
}

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

function fireChange(el: HTMLElement, value: string) {
  const input = el as HTMLInputElement | HTMLSelectElement;
  // React tracks the previous value of controlled inputs via a hidden
  // `_valueTracker` on the DOM node so it can short-circuit no-op
  // changes. Setting `.value` directly bypasses that tracker, which
  // makes React conclude "value didn't change" and silently drop the
  // synthetic onChange. The fix is to call the prototype's value
  // setter, which triggers React's tracker correctly. See:
  // https://github.com/facebook/react/issues/10135
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RecentAdminActivity — filter form", () => {
  it("emits `{ action }` when the action dropdown changes", () => {
    const { onChangeFilters } = renderPanel();
    const select = getByTestId("select-audit-action");
    expect(select).not.toBeNull();
    fireChange(select!, "backfill-reports");
    expect(onChangeFilters).toHaveBeenCalledTimes(1);
    // The form sends a PARTIAL update — only the field that changed —
    // so the parent can merge it into existing state. That contract is
    // load-bearing for the "paging preserves filters" behaviour, so we
    // assert it explicitly.
    expect(onChangeFilters).toHaveBeenCalledWith({ action: "backfill-reports" });
  });

  it("emits `{ status }` when the status dropdown changes", () => {
    const { onChangeFilters } = renderPanel();
    fireChange(getByTestId("select-audit-status")!, "failure");
    expect(onChangeFilters).toHaveBeenCalledWith({ status: "failure" });
  });

  it("emits `{ since }` / `{ until }` from the date pickers as YYYY-MM-DD strings", () => {
    const { onChangeFilters } = renderPanel();

    fireChange(getByTestId("input-audit-since")!, "2026-04-01");
    expect(onChangeFilters).toHaveBeenLastCalledWith({ since: "2026-04-01" });

    fireChange(getByTestId("input-audit-until")!, "2026-04-29");
    expect(onChangeFilters).toHaveBeenLastCalledWith({ until: "2026-04-29" });
  });

  it("debounces the IP input and trims whitespace before notifying the parent", () => {
    const { onChangeFilters } = renderPanel();

    // Two keystrokes in quick succession — only the LAST value should
    // be flushed once the 300ms debounce elapses, and not before.
    fireChange(getByTestId("input-audit-ip")!, "10.");
    fireChange(getByTestId("input-audit-ip")!, "10.0.0.1");
    expect(onChangeFilters).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onChangeFilters).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChangeFilters).toHaveBeenCalledTimes(1);
    expect(onChangeFilters).toHaveBeenCalledWith({ ip: "10.0.0.1" });
  });

  it("clearing a filter sends the empty value (not the previous value)", () => {
    // Start with a populated action filter so the operator can clear it.
    const { onChangeFilters, onResetFilters } = renderPanel({
      filters: { action: "admin-login" },
    });

    // Per-field clear: switching the action select back to "all" must
    // emit `action: "all"` so the parent's URL builder strips it from
    // the canonical query string (see `buildAuditUrlParams`).
    fireChange(getByTestId("select-audit-action")!, "all");
    expect(onChangeFilters).toHaveBeenLastCalledWith({ action: "all" });

    // The "Clear filters" affordance only renders when at least one
    // filter is active — verify it's present and routes to the
    // dedicated `onResetFilters` callback (not `onChangeFilters` with
    // an empty payload).
    const clearBtn = getByTestId("button-clear-audit-filters");
    expect(clearBtn).not.toBeNull();
    click(clearBtn!);
    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });

  it("hides the 'Clear filters' affordance when no filter is active", () => {
    renderPanel(); // EMPTY_AUDIT_FILTERS — nothing to clear.
    expect(getByTestId("button-clear-audit-filters")).toBeNull();
  });
});

describe("RecentAdminActivity — pager", () => {
  it("Next adds one page worth of offset (and Previous subtracts it)", () => {
    const { onChangeOffset } = renderPanel({ offset: 0, total: 100 });

    click(getByTestId("button-audit-next")!);
    expect(onChangeOffset).toHaveBeenLastCalledWith(AUDIT_PAGE_SIZE);

    // Re-render at offset=AUDIT_PAGE_SIZE so Previous is enabled.
    const { onChangeOffset: onChangeOffset2 } = renderPanel({
      offset: AUDIT_PAGE_SIZE,
      total: 100,
    });
    click(getByTestId("button-audit-prev")!);
    expect(onChangeOffset2).toHaveBeenLastCalledWith(0);
  });

  it("Previous is disabled on the first page; Next is disabled on the last page", () => {
    renderPanel({ offset: 0, total: 100 });
    expect((getByTestId("button-audit-prev") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByTestId("button-audit-next") as HTMLButtonElement).disabled).toBe(
      false,
    );

    // Tear down + re-render on the LAST page (offset+pageSize >= total).
    act(() => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    renderPanel({ offset: 75, total: 100, entryCount: 25 });
    expect((getByTestId("button-audit-prev") as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((getByTestId("button-audit-next") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("clamps Previous at zero so paging can't drop below offset=0", () => {
    // pageSize=25, offset=10 (an unusual mid-page state): clicking
    // Previous should snap to 0, not produce a negative offset that
    // the server would 400.
    const { onChangeOffset } = renderPanel({ offset: 10, total: 100 });
    click(getByTestId("button-audit-prev")!);
    expect(onChangeOffset).toHaveBeenLastCalledWith(0);
  });

  it("paging does NOT touch the filter state (callbacks stay separate)", () => {
    const { onChangeFilters, onChangeOffset } = renderPanel({
      offset: 0,
      total: 100,
      filters: { action: "backfill-reports", status: "failure" },
    });
    click(getByTestId("button-audit-next")!);
    // The pager calls onChangeOffset only — it must NOT also re-emit
    // the active filters, otherwise we'd double-fetch on every page.
    expect(onChangeOffset).toHaveBeenCalledTimes(1);
    expect(onChangeFilters).not.toHaveBeenCalled();
  });
});

describe("RecentAdminActivity — 'showing N of M' range", () => {
  it("reflects the response total on the first page", () => {
    renderPanel({ offset: 0, total: 137, entryCount: AUDIT_PAGE_SIZE });
    const range = getByTestId("text-audit-range");
    expect(range).not.toBeNull();
    // 25 visible rows of 137 total → "Showing 1–25 of 137"
    expect(range!.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Showing 1–25 of 137",
    );
  });

  it("reflects a short final page", () => {
    // offset=125 + 12 returned entries of 137 total → "Showing 126–137 of 137"
    renderPanel({ offset: 125, total: 137, entryCount: 12 });
    const range = getByTestId("text-audit-range");
    expect(range!.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Showing 126–137 of 137",
    );
  });
});
