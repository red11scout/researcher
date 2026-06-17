---
name: Report.tsx column pipeline + import-bypass sanitization
description: Two non-obvious traps when adding hidden structured fields (e.g. inline citations) to Step 2 / KPI tables in client/src/pages/Report.tsx.
---

# Hidden fields a cell renderer needs: use CARRY_THROUGH_COLUMNS

`reorderAndFilterColumns` in `client/src/pages/Report.tsx` DROPS any key in
`HIDDEN_COLUMNS` from the row object it returns. So if you add a hidden field
that a cell renderer must read at render time (e.g. a structured
`"Benchmark Sources"` object backing inline source links), the field is gone by
the time the table renders.

**Rule:** add such fields to BOTH `HIDDEN_COLUMNS` (so they never become their
own column) AND `CARRY_THROUGH_COLUMNS` (so the reorder loop keeps them on the
row). `visibleCols` is computed separately by filtering `HIDDEN_COLUMNS`, so the
field stays invisible as a column while remaining available on the row.

**Why:** the column pipeline conflates "don't show as a column" with "delete
from the row." They are different needs.

# Sanitize URLs client-side too — imports bypass the post-processor

Server-side normalization (`normalizeBenchmarkSources` /
`sanitizeBenchmarkUrl` in `src/calc/benchmarksRegistry.ts`, called from
`server/calculation-postprocessor.ts`) drops non-http(s) URLs. But
`importedFromJson` reports are persisted VERBATIM and never run through
`postProcessAnalysis`. A malicious/legacy import can therefore carry a
`javascript:`-style `url` straight to the client.

**Rule:** any React surface that turns stored data into an `href` (or any HTML
generator like `client/src/lib/htmlReportGenerator.ts`) MUST re-validate the
protocol itself (http/https only) before rendering an anchor — never trust a
stored URL just because the server "should have" sanitized it.

**Why:** the immutable-imports contract means the server sanitization pass is
skipped for a whole class of reports; the client is the last line of defense
against link-based XSS.
