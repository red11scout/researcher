// @vitest-environment jsdom
//
// Tests for the rehydrated "Last run" affordances on the Admin page that
// task #54 introduced: the relative-time chip ("Last run · 2h ago") next
// to the summary header, the amber "this summary is stale" banner above
// the summary, and the muted (opacity-70 + data-stale="true") panel
// treatment that kicks in once the saved completedAt crosses the 24h
// threshold.
//
// Each affordance is exposed as its own export from `client/src/pages/Admin`
// so we can render it in isolation without booting the full AdminPanel
// (which depends on the auth provider, react-query client, fetch, etc.).
// We also unit-test `formatRelativeTime` against every boundary bucket so
// future tweaks to the wording can't silently flip "59m ago" to "1h ago"
// or collapse "30d ago" into "0mo ago".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Required by React 18+/19's `act()` helper to suppress the
// "current testing environment is not configured for act()" warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  STALE_RUN_THRESHOLD_MS,
  formatRelativeTime,
  isStaleRun,
  LastRunRelativeChip,
  LastRunStaleBanner,
  LastRunSummaryPanel,
} from "../client/src/pages/Admin";

// Fixed "now" so every relative-time assertion is deterministic and
// independent of the real wall clock the test runner happens to be on.
// Picked to be safely far from any DST boundary so date math doesn't
// surprise us with off-by-one-hour answers.
const NOW = new Date("2026-05-06T12:00:00.000Z").getTime();

// Convenience helper: build an ISO completedAt that is exactly `ms`
// milliseconds older than NOW.
function isoMsAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

function getByTestId(testId: string): HTMLElement | null {
  return container.querySelector(
    `[data-testid="${testId}"]`,
  ) as HTMLElement | null;
}

// -------------------------------------------------------------------------
// formatRelativeTime — boundary-bucket coverage
// -------------------------------------------------------------------------
//
// The helper bins elapsed time into "just now" (<45s), minutes (<60m),
// hours (<24h), days (<30d), months (<12mo), and years. We assert one
// value safely inside each bucket plus the boundary on either side so a
// future change to the cutoffs has to update the test on purpose.
describe("formatRelativeTime", () => {
  it("returns 'just now' for fresh runs under the 45s cutoff", () => {
    expect(formatRelativeTime(isoMsAgo(0), NOW)).toBe("just now");
    expect(formatRelativeTime(isoMsAgo(44_000), NOW)).toBe("just now");
  });

  it("switches to minutes once 45s has elapsed", () => {
    expect(formatRelativeTime(isoMsAgo(45_000), NOW)).toBe("0m ago");
    expect(formatRelativeTime(isoMsAgo(2 * 60_000), NOW)).toBe("2m ago");
    // Just under one hour stays in the minutes bucket.
    expect(formatRelativeTime(isoMsAgo(59 * 60_000), NOW)).toBe("59m ago");
  });

  it("switches to hours at the 60m boundary", () => {
    expect(formatRelativeTime(isoMsAgo(60 * 60_000), NOW)).toBe("1h ago");
    expect(formatRelativeTime(isoMsAgo(2 * 60 * 60_000), NOW)).toBe("2h ago");
    // 23h59m still rounds to 23h, not 1d.
    expect(formatRelativeTime(isoMsAgo((24 * 60 - 1) * 60_000), NOW)).toBe(
      "23h ago",
    );
  });

  it("switches to days at the 24h boundary", () => {
    expect(formatRelativeTime(isoMsAgo(24 * 60 * 60_000), NOW)).toBe("1d ago");
    expect(formatRelativeTime(isoMsAgo(5 * 24 * 60 * 60_000), NOW)).toBe(
      "5d ago",
    );
    expect(formatRelativeTime(isoMsAgo(29 * 24 * 60 * 60_000), NOW)).toBe(
      "29d ago",
    );
  });

  it("switches to months at the 30d boundary", () => {
    expect(formatRelativeTime(isoMsAgo(30 * 24 * 60 * 60_000), NOW)).toBe(
      "1mo ago",
    );
    expect(formatRelativeTime(isoMsAgo(180 * 24 * 60 * 60_000), NOW)).toBe(
      "6mo ago",
    );
  });

  it("switches to years once a full 365 days have elapsed", () => {
    expect(formatRelativeTime(isoMsAgo(365 * 24 * 60 * 60_000), NOW)).toBe(
      "1y ago",
    );
    expect(formatRelativeTime(isoMsAgo(3 * 365 * 24 * 60 * 60_000), NOW)).toBe(
      "3y ago",
    );
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });

  it("clamps future timestamps to 'just now' instead of negative durations", () => {
    // A clock-skew situation where the saved completedAt is slightly in
    // the future shouldn't render "-5m ago".
    expect(formatRelativeTime(isoMsAgo(-5 * 60_000), NOW)).toBe("just now");
  });
});

// -------------------------------------------------------------------------
// isStaleRun — pure staleness predicate
// -------------------------------------------------------------------------
describe("isStaleRun", () => {
  it("treats a missing completedAt as fresh (not stale)", () => {
    expect(isStaleRun(null, NOW)).toBe(false);
    expect(isStaleRun(undefined, NOW)).toBe(false);
  });

  it("returns false strictly under the 24h threshold", () => {
    // Threshold is currently 24h; assert the boundary minus 1ms is fresh.
    expect(isStaleRun(isoMsAgo(STALE_RUN_THRESHOLD_MS - 1), NOW)).toBe(false);
  });

  it("returns true exactly at and beyond the 24h threshold", () => {
    expect(isStaleRun(isoMsAgo(STALE_RUN_THRESHOLD_MS), NOW)).toBe(true);
    expect(isStaleRun(isoMsAgo(STALE_RUN_THRESHOLD_MS + 1), NOW)).toBe(true);
    expect(isStaleRun(isoMsAgo(7 * 24 * 60 * 60_000), NOW)).toBe(true);
  });

  it("treats unparseable timestamps as not stale", () => {
    expect(isStaleRun("garbage", NOW)).toBe(false);
  });
});

// -------------------------------------------------------------------------
// LastRunRelativeChip
// -------------------------------------------------------------------------
describe("LastRunRelativeChip", () => {
  it("renders the chip with the formatted age for a fresh run", () => {
    act(() => {
      root.render(
        <LastRunRelativeChip hydratedAt={isoMsAgo(2 * 60 * 60_000)} now={NOW} />,
      );
    });
    const chip = getByTestId("chip-last-run-relative");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("Last run · 2h ago");
    // Fresh chip uses the default secondary styling — no amber outline.
    expect(chip!.className).not.toContain("amber");
    // Absolute timestamp is preserved on the title attribute as a
    // hover-tooltip so operators can still see the precise moment.
    expect(chip!.getAttribute("title")).toContain("Last run completed");
    // No banner should accompany the chip when the run is fresh.
    expect(getByTestId("banner-last-run-stale")).toBeNull();
  });

  it("uses amber styling once the underlying run is stale", () => {
    act(() => {
      root.render(
        <LastRunRelativeChip
          hydratedAt={isoMsAgo(3 * 24 * 60 * 60_000)}
          now={NOW}
        />,
      );
    });
    const chip = getByTestId("chip-last-run-relative");
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("Last run · 3d ago");
    // Stale chip swaps to the amber outline treatment so it stays
    // visually distinct from a freshly-completed run.
    expect(chip!.className).toContain("border-amber-300");
    expect(chip!.className).toContain("text-amber-800");
  });

  it("renders nothing when no run has ever completed", () => {
    act(() => {
      root.render(<LastRunRelativeChip hydratedAt={null} now={NOW} />);
    });
    expect(getByTestId("chip-last-run-relative")).toBeNull();
  });
});

// -------------------------------------------------------------------------
// LastRunStaleBanner
// -------------------------------------------------------------------------
describe("LastRunStaleBanner", () => {
  it("renders the amber banner with the relative age when stale", () => {
    act(() => {
      root.render(
        <LastRunStaleBanner
          hydratedAt={isoMsAgo(2 * 24 * 60 * 60_000)}
          now={NOW}
        />,
      );
    });
    const banner = getByTestId("banner-last-run-stale");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("2d ago");
    expect(banner!.textContent).toContain(
      "re-run the upgrade to see fresh results",
    );
  });

  it("renders nothing when the run is still fresh", () => {
    act(() => {
      root.render(
        <LastRunStaleBanner hydratedAt={isoMsAgo(60 * 60_000)} now={NOW} />,
      );
    });
    expect(getByTestId("banner-last-run-stale")).toBeNull();
  });

  it("renders nothing when no run has ever completed", () => {
    act(() => {
      root.render(<LastRunStaleBanner hydratedAt={null} now={NOW} />);
    });
    expect(getByTestId("banner-last-run-stale")).toBeNull();
  });
});

// -------------------------------------------------------------------------
// LastRunSummaryPanel — wires staleness onto the panel container
// -------------------------------------------------------------------------
describe("LastRunSummaryPanel", () => {
  it("marks the panel as not stale and omits the banner for a fresh run", () => {
    act(() => {
      root.render(
        <LastRunSummaryPanel
          hydratedAt={isoMsAgo(2 * 60 * 60_000)}
          now={NOW}
        >
          <div data-testid="child-content">child</div>
        </LastRunSummaryPanel>,
      );
    });
    const panel = getByTestId("panel-backfill-result");
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("data-stale")).toBe("false");
    // Muted styling (opacity-70) only applies to stale runs.
    expect(panel!.className).not.toContain("opacity-70");
    expect(getByTestId("banner-last-run-stale")).toBeNull();
    expect(getByTestId("child-content")).not.toBeNull();
  });

  it("marks the panel as stale, mutes it, and renders the banner once aged out", () => {
    act(() => {
      root.render(
        <LastRunSummaryPanel
          hydratedAt={isoMsAgo(5 * 24 * 60 * 60_000)}
          now={NOW}
        >
          <div data-testid="child-content">child</div>
        </LastRunSummaryPanel>,
      );
    });
    const panel = getByTestId("panel-backfill-result");
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("data-stale")).toBe("true");
    expect(panel!.className).toContain("opacity-70");
    const banner = getByTestId("banner-last-run-stale");
    expect(banner).not.toBeNull();
    // Banner sits inside the panel, not as a sibling — so removing the
    // panel collapses the banner with it.
    expect(panel!.contains(banner!)).toBe(true);
    expect(banner!.textContent).toContain("5d ago");
  });

  it("baseline: no run yet renders an un-stale panel with no banner", () => {
    // The wrapper still renders (the parent only mounts it when there's
    // a `result`), but the chip and banner sub-components both bail out.
    act(() => {
      root.render(
        <LastRunSummaryPanel hydratedAt={null} now={NOW}>
          <div data-testid="child-content">child</div>
          <LastRunRelativeChip hydratedAt={null} now={NOW} />
        </LastRunSummaryPanel>,
      );
    });
    const panel = getByTestId("panel-backfill-result");
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("data-stale")).toBe("false");
    expect(getByTestId("banner-last-run-stale")).toBeNull();
    expect(getByTestId("chip-last-run-relative")).toBeNull();
  });
});
