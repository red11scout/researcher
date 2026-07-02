// tests/admin-audit-overdue-alert.test.ts
//
// Coverage for task #93 (Email or alert admins when audit cleanup goes
// overdue). Three behaviours matter:
//
//   1. No webhook configured → no dispatch (back-compat: existing
//      deploys without the env var see no behavioural change).
//   2. Recent successful run → no dispatch (the banner stays green,
//      we don't cry wolf).
//   3. Overdue run → dispatch once, then suppressed by the cooldown
//      until the cooldown window elapses.
//
// We inject `now` and `fetchImpl` so the test doesn't depend on real
// time or real network. The module's in-process cooldown state is
// reset between cases via the exported test hook.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAdminAuditOverdueAlertForTests,
  maybeDispatchOverdueAlert,
} from "../server/admin-audit-overdue-alert";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetAdminAuditOverdueAlertForTests();
  delete process.env.ADMIN_AUDIT_OVERDUE_ALERT_URL;
  delete process.env.ADMIN_AUDIT_OVERDUE_ALERT_COOLDOWN_MS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("maybeDispatchOverdueAlert", () => {
  it("no-ops when no webhook URL is configured", async () => {
    const fetchImpl = vi.fn();
    const result = await maybeDispatchOverdueAlert({
      lastRanAt: new Date(0),
      intervalMs: DAY,
      retentionDays: 90,
      now: () => 10 * DAY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      dispatched: false,
      reason: "no_webhook_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not dispatch when the last run is within 2× the interval", async () => {
    process.env.ADMIN_AUDIT_OVERDUE_ALERT_URL = "https://hooks.example/alert";
    const fetchImpl = vi.fn();
    const now = 10 * DAY;
    const result = await maybeDispatchOverdueAlert({
      lastRanAt: new Date(now - DAY - HOUR), // 25h ago, < 48h threshold
      intervalMs: DAY,
      retentionDays: 90,
      now: () => now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.dispatched).toBe(false);
    expect(result.reason).toBe("not_overdue");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dispatches a webhook POST when the run is overdue", async () => {
    process.env.ADMIN_AUDIT_OVERDUE_ALERT_URL = "https://hooks.example/alert";
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const now = 10 * DAY;
    const lastRanAt = new Date(now - 3 * DAY); // 72h ago, > 48h threshold
    const result = await maybeDispatchOverdueAlert({
      lastRanAt,
      intervalMs: DAY,
      retentionDays: 90,
      now: () => now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.dispatched).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://hooks.example/alert");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.lastRanAt).toBe(lastRanAt.toISOString());
    expect(body.retentionDays).toBe(90);
    expect(body.intervalMs).toBe(DAY);
    expect(body.overdueThresholdMs).toBe(2 * DAY);
    expect(typeof body.text).toBe("string");
    expect(body.text).toMatch(/overdue/i);
  });

  it("rate-limits repeated overdue dispatches inside the cooldown window", async () => {
    process.env.ADMIN_AUDIT_OVERDUE_ALERT_URL = "https://hooks.example/alert";
    process.env.ADMIN_AUDIT_OVERDUE_ALERT_COOLDOWN_MS = String(6 * HOUR);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const baseNow = 10 * DAY;
    const lastRanAt = new Date(baseNow - 3 * DAY);

    const first = await maybeDispatchOverdueAlert({
      lastRanAt,
      intervalMs: DAY,
      retentionDays: 90,
      now: () => baseNow,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.dispatched).toBe(true);

    // 1h later — well inside the 6h cooldown — should be suppressed.
    const second = await maybeDispatchOverdueAlert({
      lastRanAt,
      intervalMs: DAY,
      retentionDays: 90,
      now: () => baseNow + HOUR,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(second.dispatched).toBe(false);
    expect(second.reason).toBe("cooldown_active");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 7h after the first dispatch — past the cooldown — fires again.
    const third = await maybeDispatchOverdueAlert({
      lastRanAt,
      intervalMs: DAY,
      retentionDays: 90,
      now: () => baseNow + 7 * HOUR,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(third.dispatched).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports dispatch_failed when the webhook returns non-2xx and keeps the cooldown engaged", async () => {
    process.env.ADMIN_AUDIT_OVERDUE_ALERT_URL = "https://hooks.example/alert";
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 500 }));
    const now = 10 * DAY;
    const lastRanAt = new Date(now - 3 * DAY);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await maybeDispatchOverdueAlert({
      lastRanAt,
      intervalMs: DAY,
      retentionDays: 90,
      now: () => now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.dispatched).toBe(false);
    expect(first.reason).toBe("dispatch_failed");

    // Cooldown is reserved before the network call, so a failing
    // webhook can't be retried on every poll — exactly the behaviour
    // we want for a broken endpoint.
    const second = await maybeDispatchOverdueAlert({
      lastRanAt,
      intervalMs: DAY,
      retentionDays: 90,
      now: () => now + HOUR,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(second.reason).toBe("cooldown_active");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
