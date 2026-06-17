---
name: Step 2 benchmark citations
description: How Step-2 KPI benchmark sources are resolved/rendered honestly across all report surfaces, and the non-obvious facts that bite a future agent.
---

# Step 2 benchmark citations

Step 2 ("Business Function Inventory & KPI Baselines") benchmark figures (Avg /
Industry Best / Overall Best) must each show a CITED, VERIFIABLE, CLICKABLE
source on every surface: in-app Report page, Boardroom HTML (Professional +
Editorial), downloadable JSON — including OLD/IMPORTED reports that have no
stored `Benchmark Sources` field. The resolver lives in `shared/benchmarkSources.ts`
(pure, dependency-free, importable client + server).

## Honesty contract (why it is built this way)
- **Never fabricate a URL.** Every URL comes from a curated registry of REAL,
  web-verified authorities. `verificationStatus` discloses strength:
  `publisherLanding` (figure NAMES the publisher → link its data page) vs
  `authorityReference` (only a generic domain hint → link the industry body as a
  GENERAL reference, label "X — industry ref", NOT a claim it published the exact
  number).
- **APQC is the cross-industry last-resort fallback** (Open Standards
  Benchmarking genuinely spans industries) — honest as a general reference.
- **INPO is deliberately NOT in the registry** (members-only, no public data
  page) so nuclear KPIs fall back to NEI, not a dead/paywalled link.
- **Placeholders get NO citation.** `isMeaningfulBenchmarkValue()` rejects
  "N/A", "na", "—", "-", "none", "null", "tbd", "unknown", "?", empty. Attaching
  an authority to a non-benchmark value would be misleading. This gate is applied
  in the resolver, the per-record resolver, AND client `renderBenchmarkCell`.

## Non-obvious facts that will bite you
- **The Editorial Boardroom HTML renders NO Step-2 benchmark table at all** — it
  is a narrative executive briefing (only Professional renders the KPI/benchmark
  table). The `augmentAnalysisBenchmarkSourcesForPresentation` call at the top of
  `generateEditorialHTMLReport` is therefore a deliberate **no-op / defensive
  insurance**, not a bug. Do NOT "fix" it by assuming Editorial shows benchmarks;
  if you ever need benchmarks there, you must ADD the rendering, not just augment.
- **Both HTML generators destructure `reportData.analysisData.steps`**, while the
  Report page / JSON export use top-level `steps`. The augment helper handles
  BOTH shapes — keep it that way.

## Imports: augment-for-view, never persist
Imported reports (`importedFromJson: true`) are immutable in storage. The
benchmark augmentation is always done on a CLONE and never written back to the
DB: the post-processor only persists for NON-imported reports, but the EXPORTED
view (client `generateJSON` and server bulk-JSON `case "json"`) augments a clone
for ALL reports incl. imports, so downloads carry citations without mutating the
stored record.

**How to apply:** any NEW Step-2 normalization that mutates stored data must be
gated on `!analysis.importedFromJson`; view/export augmentation on a clone is
fine for everyone. Keep `server/export-formatters.ts` a pure pass-through —
enrich the clone UPSTREAM of `formatReportAsJson`, never inside it.
