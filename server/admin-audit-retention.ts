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
// Operators can override via ADMIN_AUDIT_RETENTION_DAYS. Values that
// don't parse as a positive number fall back to the default so a typo
// in the env doesn't accidentally disable retention.
const DEFAULT_RETENTION_DAYS = 90;

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

function resolveRetentionDays(): number {
  const raw = process.env.ADMIN_AUDIT_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    log(
      `Ignoring invalid ADMIN_AUDIT_RETENTION_DAYS="${raw}", using ${DEFAULT_RETENTION_DAYS}`,
    );
    return DEFAULT_RETENTION_DAYS;
  }
  return parsed;
}

// Single cleanup pass. Exported so tests / ad-hoc scripts can trigger a
// run without standing up the interval. Always returns the number of
// rows deleted (0 on failure) and never throws — a DB hiccup must not
// take the server down.
export async function runAdminAuditRetentionOnce(
  retentionDays = resolveRetentionDays(),
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  try {
    const removed = await storage.pruneOldAdminAuditEntries(cutoff);
    log(
      `Removed ${removed} admin audit row(s) older than ${retentionDays} days (cutoff ${cutoff.toISOString()})`,
    );
    return removed;
  } catch (err) {
    console.error(
      "[admin-audit-retention] Cleanup failed:",
      err,
    );
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
  const retentionDays = resolveRetentionDays();
  log(
    `Scheduling admin audit log cleanup every 24h (retention: ${retentionDays} days)`,
  );
  // Defer the first run so boot stays snappy and the DB isn't hammered
  // before the app is serving traffic.
  bootTimer = setTimeout(() => {
    void runAdminAuditRetentionOnce(retentionDays);
  }, BOOT_DELAY_MS);
  if (typeof bootTimer.unref === "function") bootTimer.unref();

  scheduledTimer = setInterval(() => {
    void runAdminAuditRetentionOnce(retentionDays);
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
