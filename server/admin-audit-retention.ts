import { storage } from "./storage";

// Local logger so we don't take a dependency on `./index` (which imports
// this module) and risk a circular import. Keeps the prefix consistent
// with the rest of the server's structured-ish console logging.
function log(message: string): void {
  console.log(`[admin-audit-retention] ${message}`);
}

// How long admin_audit_log rows are retained before the scheduler
// deletes them. Defaults to 90 days, which is long enough to investigate
// recent incidents (who hit /api/admin/backfill-reports last week? was
// there a brute-force burst against /api/auth/admin-login?) without
// letting the table grow forever — and bot-driven login failures could
// otherwise add thousands of rows per day with no upper bound.
//
// Resolution order, evaluated *per cleanup run* (not at scheduler start)
// so an admin who shortens the window via the Admin UI sees the change
// take effect on the next sweep without a server restart:
//   1. Persisted override in `admin_settings.audit_retention_days`
//   2. ADMIN_AUDIT_RETENTION_DAYS env var (kept as a deploy-time fallback)
//   3. The hard-coded default below
// Values that don't parse as a positive number at any layer fall through
// to the next one — a typo never disables retention silently.
export const DEFAULT_RETENTION_DAYS = 90;

// How often the cleanup runs once the process is up. Daily is plenty:
// the table is append-only, so running more frequently doesn't reclaim
// meaningfully more space, and running less frequently risks letting
// the table balloon if the process happens to stay alive for weeks.
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Delay before the boot-time cleanup fires, so we don't compete with
// route registration / DB warmup for the very first request. 30s is
// long enough to be off the hot path and short enough that operators
// restarting the box still see the cleanup land that day.
const BOOT_DELAY_MS = 30 * 1000;

// Pull the env-var fallback. Returns `null` when unset or invalid so the
// caller can decide whether to drop down to the hard-coded default.
function readEnvRetentionDays(): number | null {
  const raw = process.env.ADMIN_AUDIT_RETENTION_DAYS;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    log(
      `Ignoring invalid ADMIN_AUDIT_RETENTION_DAYS="${raw}", falling back to default`,
    );
    return null;
  }
  return parsed;
}

// Resolve the effective retention window for the next sweep. Reads the
// persisted override first, then the env var, then the hard-coded
// default. A storage failure (DB hiccup) is logged and treated as "no
// override" so retention keeps running on the env / default — never
// disabled.
export async function resolveRetentionDays(): Promise<number> {
  try {
    const settings = await storage.getAdminSettings();
    const stored = settings?.auditRetentionDays;
    if (typeof stored === "number" && Number.isFinite(stored) && stored > 0) {
      return stored;
    }
  } catch (err) {
    console.error(
      "[admin-audit-retention] Failed to read admin settings, falling back to env/default:",
      err,
    );
  }
  const envValue = readEnvRetentionDays();
  if (envValue !== null) return envValue;
  return DEFAULT_RETENTION_DAYS;
}

// Single cleanup pass. Exported so tests / ad-hoc scripts can trigger a
// run without standing up the interval. Always returns the number of
// rows deleted (0 on failure) and never throws — a DB hiccup must not
// take the server down. Each run persists its outcome (success or
// failure) via `storage.recordAdminAuditCleanup` for the Admin UI.
//
// `retentionDays` is optional: callers (typically the scheduler) leave
// it out so the function re-resolves the effective value on every run,
// which is what lets a UI-side change take effect without a restart.
// Tests pass an explicit value to pin the behaviour.
export async function runAdminAuditRetentionOnce(
  retentionDays?: number,
): Promise<number> {
  const effectiveDays =
    typeof retentionDays === "number" && Number.isFinite(retentionDays) && retentionDays > 0
      ? retentionDays
      : await resolveRetentionDays();
  const cutoff = new Date(Date.now() - effectiveDays * 24 * 60 * 60 * 1000);
  const startedAt = Date.now();
  try {
    const removed = await storage.pruneOldAdminAuditEntries(cutoff);
    log(
      `Removed ${removed} admin audit row(s) older than ${effectiveDays} days (cutoff ${cutoff.toISOString()})`,
    );
    await storage.recordAdminAuditCleanup({
      status: "success",
      removedCount: removed,
      retentionDays: effectiveDays,
      cutoff,
      durationMs: Date.now() - startedAt,
    });
    return removed;
  } catch (err) {
    console.error(
      "[admin-audit-retention] Cleanup failed:",
      err,
    );
    await storage.recordAdminAuditCleanup({
      status: "failure",
      removedCount: 0,
      retentionDays: effectiveDays,
      cutoff,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    });
    return 0;
  }
}

let scheduledTimer: NodeJS.Timeout | null = null;
let bootTimer: NodeJS.Timeout | null = null;

// Wire up the recurring cleanup. Idempotent — calling it twice is a
// no-op, which keeps tests / hot-reload scenarios from doubling up the
// interval. Returns a stop() function for tests that need to tear down
// the timers cleanly.
export function startAdminAuditRetentionScheduler(): () => void {
  if (scheduledTimer) {
    return stopAdminAuditRetentionScheduler;
  }
  log(
    `Scheduling admin audit log cleanup every 24h (retention resolved per run from admin settings → env → ${DEFAULT_RETENTION_DAYS}d default)`,
  );
  // Defer the first run so boot stays snappy and the DB isn't hammered
  // before the app is serving traffic. Each tick re-resolves the window
  // so an admin shortening retention via the UI takes effect on the
  // next sweep — no restart required.
  bootTimer = setTimeout(() => {
    void runAdminAuditRetentionOnce();
  }, BOOT_DELAY_MS);
  if (typeof bootTimer.unref === "function") bootTimer.unref();

  scheduledTimer = setInterval(() => {
    void runAdminAuditRetentionOnce();
  }, CLEANUP_INTERVAL_MS);
  // unref so the scheduler timer never keeps the process alive on its
  // own — Express's listening socket is the source of truth for liveness.
  if (typeof scheduledTimer.unref === "function") scheduledTimer.unref();

  return stopAdminAuditRetentionScheduler;
}

export function stopAdminAuditRetentionScheduler(): void {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}
