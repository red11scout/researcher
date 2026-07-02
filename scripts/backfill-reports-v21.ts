/**
 * One-shot backfill of every saved report to the current v2.1 schema.
 *
 * Re-runs `postProcessAnalysis` over every report in storage so the upgraded
 * shape (flat diagnostic fields + Step 6 hard knock-out fields) is persisted
 * eagerly. Without this, each report incurs the same migration cost the first
 * time a user opens it (see staleness check at GET /api/reports/:id).
 *
 * Usage:
 *   tsx scripts/backfill-reports-v21.ts          # process stale reports only
 *   tsx scripts/backfill-reports-v21.ts --force  # reprocess every report
 *
 * Reads DATABASE_URL or EXTERNAL_DATABASE_URL from the environment (mirrors
 * the resolution rules in server/db.ts).
 */

// Validate environment BEFORE importing any DB-dependent module so a missing
// connection string fails with a friendly message instead of a stack trace
// from `server/db.ts` at import-time.
function hasDatabaseUrl(): boolean {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return true;
  }
  const ext = process.env.EXTERNAL_DATABASE_URL?.trim();
  if (
    ext &&
    (ext.startsWith("postgresql://") || ext.startsWith("postgres://"))
  ) {
    return true;
  }
  return false;
}

if (!hasDatabaseUrl()) {
  console.error(
    "[backfill-reports-v21] No database URL configured. Set DATABASE_URL or EXTERNAL_DATABASE_URL before running this script.",
  );
  process.exit(1);
}

async function main() {
  const force = process.argv.includes("--force");

  // Lazy import so the env check above runs first.
  const { backfillAllReports } = await import("../server/report-backfill");

  console.log(
    `[backfill-reports-v21] Starting backfill (force=${force})…`,
  );
  const summary = await backfillAllReports({
    force,
    onProgress: (i, total, result) => {
      const tag = result.status.toUpperCase().padEnd(7);
      const reasons = result.reasons ? ` [${result.reasons.join(",")}]` : "";
      const error = result.error ? ` ERROR: ${result.error}` : "";
      console.log(
        `[backfill-reports-v21] (${i}/${total}) ${tag} ${result.companyName} (${result.id})${reasons}${error} (${result.durationMs}ms)`,
      );
    },
  });

  console.log("");
  console.log(
    `[backfill-reports-v21] Done in ${summary.durationMs}ms — total=${summary.total}, updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed}`,
  );

  if (summary.failed > 0) {
    console.error("[backfill-reports-v21] Failures:");
    for (const r of summary.results.filter((x) => x.status === "failed")) {
      console.error(`  - ${r.companyName} (${r.id}): ${r.error}`);
    }
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-reports-v21] Fatal:", err);
  process.exit(1);
});
