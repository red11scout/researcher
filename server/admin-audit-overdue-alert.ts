// Out-of-band push alert for the admin audit retention sweeper.
//
// Task #63 surfaced the "last run was too long ago" state on the Admin
// page, but that's a *pull* signal — nobody knows the sweeper has
// silently stopped firing until an admin happens to load /admin. This
// module turns it into a *push* signal: when the API observes the
// last successful sweep is overdue, we POST a JSON payload to a
// configured webhook (a generic HTTPS endpoint; Slack incoming
// webhooks are wire-compatible because they accept `{ "text": "..." }`).
//
// Two env vars drive it, both optional — the alerter is no-op when no
// URL is configured so existing deploys don't change behaviour:
//
//   ADMIN_AUDIT_OVERDUE_ALERT_URL        Webhook URL (POST target).
//   ADMIN_AUDIT_OVERDUE_ALERT_COOLDOWN_MS Min interval between dispatches.
//                                         Defaults to 6h. Prevents the
//                                         banner-poll request rate from
//                                         turning into a notification
//                                         storm.
//
// The cooldown is held in-process. Multi-instance deploys will dispatch
// once per instance per cooldown window, which is acceptable: the
// alternative (a DB-backed lock) adds writes on every read of the
// banner endpoint, which we want to keep cheap.

const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Module-scoped so repeated calls within the cooldown window are
// suppressed. Exported `__resetForTests` lets the test suite clear it
// between cases without exposing internals more broadly.
let lastDispatchedAtMs: number | null = null;

export function __resetAdminAuditOverdueAlertForTests(): void {
  lastDispatchedAtMs = null;
}

function readCooldownMs(): number {
  const raw = process.env.ADMIN_AUDIT_OVERDUE_ALERT_COOLDOWN_MS;
  if (!raw) return DEFAULT_COOLDOWN_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COOLDOWN_MS;
  return parsed;
}

function formatHours(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

export interface OverdueAlertInput {
  // When the last successful sweep ran.
  lastRanAt: Date;
  // Sweeper's configured interval. The "overdue" threshold is 2× this,
  // matching the Admin UI banner so push and pull stay in lock-step.
  intervalMs: number;
  // Effective retention window at the time of the last successful run.
  // Included in the alert payload so on-call has the full picture
  // without round-tripping to the dashboard.
  retentionDays: number;
  // Optional injection point for tests. Defaults to global fetch /
  // Date.now / process.env.
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export interface OverdueAlertResult {
  // True if a POST was actually attempted. False covers all skip
  // reasons: not overdue, no webhook configured, still in cooldown,
  // or fetch threw.
  dispatched: boolean;
  // Human-readable reason, useful for tests and debug logs.
  reason:
    | "no_webhook_configured"
    | "not_overdue"
    | "cooldown_active"
    | "dispatched"
    | "dispatch_failed";
}

// Inspect the most recent sweep timestamp and dispatch a webhook alert
// when the gap exceeds 2× the sweeper interval. Safe to call on every
// banner poll — the cooldown gate keeps the dispatch rate bounded
// regardless of caller frequency. Never throws; failures are logged
// and surfaced via the returned `reason`.
export async function maybeDispatchOverdueAlert(
  input: OverdueAlertInput,
): Promise<OverdueAlertResult> {
  const webhookUrl = process.env.ADMIN_AUDIT_OVERDUE_ALERT_URL;
  if (!webhookUrl) {
    return { dispatched: false, reason: "no_webhook_configured" };
  }

  const now = input.now ? input.now() : Date.now();
  const ageMs = now - input.lastRanAt.getTime();
  const overdueThresholdMs = input.intervalMs * 2;
  if (!Number.isFinite(ageMs) || ageMs <= overdueThresholdMs) {
    return { dispatched: false, reason: "not_overdue" };
  }

  const cooldownMs = readCooldownMs();
  if (
    lastDispatchedAtMs !== null &&
    now - lastDispatchedAtMs < cooldownMs
  ) {
    return { dispatched: false, reason: "cooldown_active" };
  }

  const text =
    `:rotating_light: BlueAlly admin audit log cleanup is overdue. ` +
    `Last successful sweep ran ${input.lastRanAt.toISOString()} ` +
    `(${formatHours(ageMs)} ago, threshold ${formatHours(overdueThresholdMs)}). ` +
    `Retention window: ${input.retentionDays} days. ` +
    `Investigate the scheduler — recent admin activity may not be getting pruned.`;

  const payload = {
    text,
    lastRanAt: input.lastRanAt.toISOString(),
    ageMs,
    overdueThresholdMs,
    intervalMs: input.intervalMs,
    retentionDays: input.retentionDays,
  };

  const fetchImpl = input.fetchImpl ?? fetch;
  // Reserve the cooldown slot *before* the network call so a slow
  // webhook server can't cause overlapping dispatches from concurrent
  // banner polls. Any failure logs but keeps the cooldown in place —
  // we'd rather miss one alert than spam a broken endpoint.
  lastDispatchedAtMs = now;
  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        `[admin-audit-overdue-alert] Webhook returned ${res.status} ${res.statusText}`,
      );
      return { dispatched: false, reason: "dispatch_failed" };
    }
    return { dispatched: true, reason: "dispatched" };
  } catch (err) {
    console.error(
      "[admin-audit-overdue-alert] Webhook dispatch failed:",
      err,
    );
    return { dispatched: false, reason: "dispatch_failed" };
  }
}
