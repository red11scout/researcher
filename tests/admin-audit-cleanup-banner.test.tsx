// @vitest-environment jsdom
//
// Tests for the AuditCleanupBanner on the Admin page. Task #63 added an
// amber "overdue" variant that fires when the most recent successful
// retention sweep is older than ~2× the sweeper's configured interval —
// this suite locks in that variant alongside the existing success /
// failure / none / load-error states.
//
// We render the banner directly (it's exported from `client/src/pages/Admin`)
// so we can drive every code path without booting the full AdminPanel.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  AuditCleanupBanner,
  type AuditCleanupStatus,
} from "../client/src/pages/Admin";

// Fixed wall-clock so the relative-age strings are deterministic.
const NOW = new Date("2026-05-06T12:00:00.000Z").getTime();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Standard sweeper interval used in production: once a day. The banner
// considers a successful run "overdue" once it's older than 2× this.
const INTERVAL_MS = DAY_MS;

function isoMsAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function makeSuccess(overrides: Partial<AuditCleanupStatus> = {}): AuditCleanupStatus {
  return {
    status: "success",
    removedCount: 12,
    retentionDays: 90,
    cutoff: new Date(NOW - 90 * DAY_MS).toISOString(),
    errorMessage: null,
    durationMs: 42,
    ranAt: isoMsAgo(2 * HOUR_MS),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
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

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

describe("AuditCleanupBanner — overdue (amber) variant", () => {
  it("renders the amber overdue banner when ranAt is older than 2× intervalMs for a success run", () => {
    // 3 days old vs a 1-day interval → 3× the interval → overdue.
    const cleanup = makeSuccess({ ranAt: isoMsAgo(3 * DAY_MS) });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });

    const overdue = getByTestId("status-audit-cleanup-overdue");
    expect(overdue).not.toBeNull();
    // Amber outline / background — never the green success styling.
    expect(overdue!.className).toContain("border-amber-200");
    expect(overdue!.className).toContain("bg-amber-50");
    expect(overdue!.textContent).toContain("Audit log cleanup overdue");
    // Relative-age text is a "Xd ago"-style string from formatRelativeAge.
    expect(overdue!.textContent).toContain("3 days ago");
    // Cap explanation references the sweeper interval (~24h) and the
    // overdue threshold (~48h).
    expect(overdue!.textContent).toContain("24h");
    expect(overdue!.textContent).toContain("48h");
    // The success / failure / none variants must not also be present.
    expect(getByTestId("status-audit-cleanup-success")).toBeNull();
    expect(getByTestId("status-audit-cleanup-failure")).toBeNull();
    expect(getByTestId("status-audit-cleanup-none")).toBeNull();
  });

  it("does NOT mark a run as overdue at exactly 2× intervalMs (boundary)", () => {
    // Exactly 2× the interval: ageMs > overdueThresholdMs is strict, so
    // this still renders the green success banner.
    const cleanup = makeSuccess({ ranAt: isoMsAgo(2 * INTERVAL_MS) });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    expect(getByTestId("status-audit-cleanup-overdue")).toBeNull();
    expect(getByTestId("status-audit-cleanup-success")).not.toBeNull();
  });
});

describe("AuditCleanupBanner — success (green) variant within window", () => {
  it("renders the green success banner when ranAt is within 2× intervalMs", () => {
    // 2 hours old vs a 24h interval → well inside the window.
    const cleanup = makeSuccess({ ranAt: isoMsAgo(2 * HOUR_MS), removedCount: 7 });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    const success = getByTestId("status-audit-cleanup-success");
    expect(success).not.toBeNull();
    expect(success!.className).toContain("border-emerald-200");
    expect(success!.textContent).toContain("Audit log last cleaned up");
    expect(success!.textContent).toContain("2 hours ago");
    expect(getByTestId("text-audit-cleanup-removed")!.textContent).toBe("7 rows removed");
    expect(success!.textContent).toContain("Retention window: 90 days");
    expect(getByTestId("status-audit-cleanup-overdue")).toBeNull();
  });

  it("uses singular '1 row removed' when removedCount === 1", () => {
    const cleanup = makeSuccess({ removedCount: 1 });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    expect(getByTestId("text-audit-cleanup-removed")!.textContent).toBe("1 row removed");
  });
});

describe("AuditCleanupBanner — overdue check skipped when intervalMs is missing", () => {
  it("renders the green success banner even for an ancient run when intervalMs is null", () => {
    // 30 days old: would be overdue under any sane interval, but the
    // server didn't supply intervalMs (older payload shape) so the
    // overdue check is disabled and we fall back to the success banner.
    const cleanup = makeSuccess({ ranAt: isoMsAgo(30 * DAY_MS) });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={null}
        />,
      );
    });
    expect(getByTestId("status-audit-cleanup-overdue")).toBeNull();
    const success = getByTestId("status-audit-cleanup-success");
    expect(success).not.toBeNull();
    expect(success!.textContent).toContain("1 month ago");
  });

  it("renders the green success banner when intervalMs is zero or negative", () => {
    // The component guards against intervalMs <= 0 the same way it
    // guards against null — overdue check disabled, success banner wins.
    const cleanup = makeSuccess({ ranAt: isoMsAgo(7 * DAY_MS) });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={0}
        />,
      );
    });
    expect(getByTestId("status-audit-cleanup-overdue")).toBeNull();
    expect(getByTestId("status-audit-cleanup-success")).not.toBeNull();
  });
});

describe("AuditCleanupBanner — other variants still render", () => {
  it("renders the failure (red) banner regardless of intervalMs / age", () => {
    const cleanup = makeSuccess({
      status: "failure",
      ranAt: isoMsAgo(5 * DAY_MS),
      errorMessage: "connection refused",
    });
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={false}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    const failure = getByTestId("status-audit-cleanup-failure");
    expect(failure).not.toBeNull();
    expect(failure!.className).toContain("border-red-200");
    expect(failure!.textContent).toContain("Audit log cleanup failed");
    expect(getByTestId("text-audit-cleanup-error")!.textContent).toBe("connection refused");
    // Overdue check must NOT fire on top of a failure run.
    expect(getByTestId("status-audit-cleanup-overdue")).toBeNull();
  });

  it("renders the 'never run yet' banner when cleanup is null and not loading", () => {
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={null}
          loading={false}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    const none = getByTestId("status-audit-cleanup-none");
    expect(none).not.toBeNull();
    expect(none!.textContent).toContain("No audit log cleanup recorded yet");
  });

  it("renders the load-error banner when cleanup is null and error is set", () => {
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={null}
          loading={false}
          error="500 internal server error"
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    const loadErr = getByTestId("status-audit-cleanup-load-error");
    expect(loadErr).not.toBeNull();
    expect(loadErr!.textContent).toContain("Unable to load cleanup status");
    expect(getByTestId("text-audit-cleanup-load-error")!.textContent).toBe(
      "500 internal server error",
    );
  });

  it("renders the loading spinner when loading and no cleanup / error are present", () => {
    act(() => {
      root.render(
        <AuditCleanupBanner
          cleanup={null}
          loading={true}
          error={null}
          intervalMs={INTERVAL_MS}
        />,
      );
    });
    expect(getByTestId("status-audit-cleanup-loading")).not.toBeNull();
  });
});
