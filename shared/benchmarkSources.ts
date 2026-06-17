// Deterministic, honest benchmark-citation resolver (Step 2 "Business Function
// Inventory & KPI Baselines").
//
// WHY THIS EXISTS
// ---------------
// Real/legacy/imported reports rarely carry a structured "Benchmark Sources"
// object: their benchmark VALUES are plain strings whose only context is a
// parenthetical that is usually GENERIC ("hospital industry average", "media
// industry typical") and occasionally names a real publisher ("MGMA 2025",
// "US nuclear fleet average, NEI 2025"). Relying on the LLM alone leaves those
// figures unsourced in the UI / Boardroom report / JSON export.
//
// This module resolves a verifiable citation for every benchmark tier from a
// CURATED registry of REAL benchmark authorities — by named-publisher token
// first, then by industry/domain. It is pure and dependency-free so the client
// (Report page, both Boardroom HTML generators, JSON export) and the server
// (post-processor, bulk JSON export) share one honest implementation.
//
// HONESTY CONTRACT
// ----------------
// - Never fabricate a URL. Every URL here points to a real, public authority.
// - `verificationStatus` discloses how strongly the link backs the figure:
//     * "publisherLanding"  — the figure NAMES this publisher; we link its
//                              authoritative data page (precise attribution).
//     * "authorityReference"— only a generic domain was given; we link the
//                              relevant industry body as a GENERAL reference,
//                              NOT a claim that it published this exact number.
//     * "exact"             — reserved for registry/metric-level matches.
// - Existing valid structured sources are always preferred and kept as-is.

import type { BenchmarkSource, BenchmarkSources } from "./schema";

// ---------------------------------------------------------------------------
// URL sanitization — defense in depth. Only well-formed http(s) URLs survive.
// ---------------------------------------------------------------------------
export function sanitizeBenchmarkUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") return trimmed;
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Curated registry of REAL benchmark authorities.
//   publisherTokens — match when the figure explicitly NAMES this publisher.
//   domainTokens    — match a generic industry/domain phrase (fallback ref).
// All URLs are real, public, and web-verified at authoring time.
// ---------------------------------------------------------------------------
export interface BenchmarkAuthority {
  key: string;
  publisher: string;
  url: string;
  landingTitle: string;   // title shown when NAMED (publisherLanding)
  referenceTitle: string; // title shown as a general industry reference
  publisherTokens?: RegExp[];
  domainTokens?: RegExp[];
}

export const BENCHMARK_AUTHORITIES: BenchmarkAuthority[] = [
  // ---- Healthcare ----
  {
    key: "mgma",
    publisher: "MGMA",
    url: "https://www.mgma.com/datadive",
    landingTitle: "MGMA DataDive benchmarking data",
    referenceTitle: "Healthcare industry benchmarking reference",
    publisherTokens: [/\bMGMA\b/i],
    domainTokens: [
      /\bhospital(s)?\b/i, /\bhealth ?system(s)?\b/i, /\bacute care\b/i,
      /\bnursing\b/i, /\bclinical\b/i, /\bclinic(s)?\b/i, /\bpatient\b/i,
      /\bphysician(s)?\b/i, /\bmedical center(s)?\b/i, /\bpayer(s)?\b/i,
      /\bprovider(s)?\b/i, /\bdelivery network(s)?\b/i, /\bhealthcare\b/i,
      /\bmagnet-designated\b/i,
    ],
  },
  {
    key: "caqh",
    publisher: "CAQH",
    url: "https://www.caqh.org/insights/caqh-index-report",
    landingTitle: "CAQH Index Report",
    referenceTitle: "Healthcare administrative benchmarking reference",
    publisherTokens: [/\bCAQH\b/i],
  },
  // ---- Nuclear ----
  {
    key: "nei",
    publisher: "NEI",
    url: "https://www.nei.org/resources/statistics",
    landingTitle: "Nuclear Energy Institute statistics",
    referenceTitle: "Nuclear industry benchmarking reference (NEI)",
    publisherTokens: [/\bNEI\b/i, /nuclear energy institute/i],
    domainTokens: [/\bnuclear\b/i, /\breactor(s)?\b/i, /\bfleet\b.*\bnuclear\b/i],
  },
  // ---- Energy / Utilities ----
  {
    key: "eia",
    publisher: "U.S. EIA",
    url: "https://www.eia.gov",
    landingTitle: "U.S. Energy Information Administration data",
    referenceTitle: "Energy/utility industry benchmarking reference (EIA)",
    publisherTokens: [/\bEIA\b/i, /energy information administration/i],
    domainTokens: [
      /\butilit(y|ies)\b/i, /\benergy\b/i, /\bpower\b/i, /\bgrid\b/i,
      /\belectric\b/i, /\bbattery storage\b/i, /\bcommodity trading\b/i,
    ],
  },
  {
    key: "epri",
    publisher: "EPRI",
    url: "https://www.epri.com",
    landingTitle: "Electric Power Research Institute research",
    referenceTitle: "Electric power industry benchmarking reference (EPRI)",
    publisherTokens: [/\bEPRI\b/i],
  },
  // ---- Retail ----
  {
    key: "nrf",
    publisher: "NRF",
    url: "https://nrf.com/research-insights",
    landingTitle: "National Retail Federation research",
    referenceTitle: "Retail industry benchmarking reference (NRF)",
    publisherTokens: [/\bNRF\b/i, /national retail federation/i],
    domainTokens: [
      /\bretail\b/i, /\bhome improvement\b/i, /\bspecialty retail\b/i,
      /\bmerchand/i, /\bstore(s)?\b/i, /\becommerce\b/i, /\be-commerce\b/i,
    ],
  },
  // ---- Media / Entertainment ----
  {
    key: "nielsen",
    publisher: "Nielsen",
    url: "https://www.nielsen.com",
    landingTitle: "Nielsen media measurement",
    referenceTitle: "Media & entertainment benchmarking reference (Nielsen)",
    publisherTokens: [/\bNielsen\b/i],
    domainTokens: [
      /\bmedia\b/i, /\bstreaming\b/i, /\bSVOD\b/i, /\bFAST\b/i, /\bCTV\b/i,
      /\bprogrammatic\b/i, /\badvertis/i, /\bvideo\b/i, /\bbroadcast\b/i,
      /\baudience\b/i, /\bcontent\b/i,
    ],
  },
  {
    key: "witbe",
    publisher: "Witbe",
    url: "https://www.witbe.net",
    landingTitle: "Witbe automated video QA benchmarks",
    referenceTitle: "Video quality assurance benchmarking reference (Witbe)",
    publisherTokens: [/\bWitbe\b/i],
  },
  // ---- Financial services ----
  {
    key: "spglobal",
    publisher: "S&P Global",
    url: "https://www.spglobal.com",
    landingTitle: "S&P Global market intelligence",
    referenceTitle: "Financial services benchmarking reference (S&P Global)",
    publisherTokens: [/\bS&P\b/i, /s&p global/i, /standard & poor/i],
    domainTokens: [
      /\bfinancial services\b/i, /\btrading\b/i, /\bbank(ing)?\b/i,
      /\bquantitative trading\b/i, /\balgorithmic trading\b/i, /\bATM\b/i,
      /\bcash logistics\b/i, /\bfintech\b/i,
    ],
  },
  {
    key: "fed",
    publisher: "Federal Reserve",
    url: "https://www.federalreserve.gov",
    landingTitle: "U.S. Federal Reserve economic data",
    referenceTitle: "Macroeconomic benchmarking reference (Federal Reserve)",
    publisherTokens: [/federal reserve/i, /\bFRED\b/i],
  },
  // ---- Cross-industry analysts / process benchmarking ----
  {
    key: "gartner",
    publisher: "Gartner",
    url: "https://www.gartner.com",
    landingTitle: "Gartner research",
    referenceTitle: "Technology industry benchmarking reference (Gartner)",
    publisherTokens: [/\bGartner\b/i],
    domainTokens: [
      /\bSaaS\b/i, /\bsubscription\b/i, /\bsoftware\b/i, /\bplatform(s)?\b/i,
      /\bsmart home\b/i, /\bIoT\b/i, /\bdemand forecasting\b/i,
      /\bpersonalization\b/i, /\bchannel program(s)?\b/i, /\bB2B\b/i,
      /\bSaaS\b/i, /\btech(nology)?\b/i,
    ],
  },
  {
    key: "forrester",
    publisher: "Forrester",
    url: "https://www.forrester.com",
    landingTitle: "Forrester research",
    referenceTitle: "Customer experience benchmarking reference (Forrester)",
    publisherTokens: [/\bForrester\b/i],
  },
  {
    key: "idc",
    publisher: "IDC",
    url: "https://www.idc.com",
    landingTitle: "IDC market research",
    referenceTitle: "Technology market benchmarking reference (IDC)",
    publisherTokens: [/\bIDC\b/i],
  },
  {
    key: "hackett",
    publisher: "The Hackett Group",
    url: "https://www.thehackettgroup.com",
    landingTitle: "The Hackett Group benchmarking",
    referenceTitle: "Back-office process benchmarking reference (Hackett)",
    publisherTokens: [/hackett/i],
  },
  {
    key: "mckinsey",
    publisher: "McKinsey & Company",
    url: "https://www.mckinsey.com",
    landingTitle: "McKinsey & Company research",
    referenceTitle: "Cross-industry benchmarking reference (McKinsey)",
    publisherTokens: [/mckinsey/i],
  },
  {
    key: "bain",
    publisher: "Bain & Company",
    url: "https://www.bain.com",
    landingTitle: "Bain & Company research",
    referenceTitle: "Cross-industry benchmarking reference (Bain)",
    publisherTokens: [/\bBain\b/i],
  },
  {
    key: "bcg",
    publisher: "BCG",
    url: "https://www.bcg.com",
    landingTitle: "Boston Consulting Group research",
    referenceTitle: "Cross-industry benchmarking reference (BCG)",
    publisherTokens: [/\bBCG\b/i, /boston consulting/i],
  },
  {
    key: "deloitte",
    publisher: "Deloitte",
    url: "https://www2.deloitte.com",
    landingTitle: "Deloitte Insights research",
    referenceTitle: "Cross-industry benchmarking reference (Deloitte)",
    publisherTokens: [/deloitte/i],
  },
  {
    key: "bls",
    publisher: "U.S. BLS",
    url: "https://www.bls.gov",
    landingTitle: "U.S. Bureau of Labor Statistics data",
    referenceTitle: "Labor & productivity benchmarking reference (BLS)",
    publisherTokens: [/\bBLS\b/i, /bureau of labor statistics/i],
  },
  {
    key: "cms",
    publisher: "CMS",
    url: "https://www.cms.gov",
    landingTitle: "Centers for Medicare & Medicaid Services data",
    referenceTitle: "Healthcare utilization benchmarking reference (CMS)",
    publisherTokens: [/\bCMS\b/i, /centers for medicare/i],
  },
  {
    key: "aha",
    publisher: "AHA",
    url: "https://www.aha.org",
    landingTitle: "American Hospital Association data",
    referenceTitle: "Hospital industry benchmarking reference (AHA)",
    publisherTokens: [/american hospital association/i],
  },
  // ---- Cross-industry process benchmarking (last-resort fallback) ----
  {
    key: "apqc",
    publisher: "APQC",
    url: "https://www.apqc.org/resources/benchmarking/open-standards-benchmarking",
    landingTitle: "APQC Open Standards Benchmarking",
    referenceTitle: "Cross-industry process benchmarking reference (APQC)",
    publisherTokens: [/\bAPQC\b/i],
    domainTokens: [
      /\bautomotive\b/i, /\bTier-?1\b/i, /\baerospace\b/i, /\bsemiconductor\b/i,
      /\bmanufactur/i, /\bdiscrete\b/i, /\blogistics\b/i, /\bsupply chain\b/i,
      /\bprocurement\b/i, /\bagricultur/i,
    ],
  },
];

// The cross-industry catch-all used when nothing else matches. APQC's Open
// Standards Benchmarking genuinely spans industries/processes, so it is an
// honest general reference rather than a fabricated specific citation.
const FALLBACK_AUTHORITY = BENCHMARK_AUTHORITIES.find((a) => a.key === "apqc")!;

const YEAR_RE = /\b(19|20)\d{2}\b/;

// Pull the parenthetical context out of a benchmark value string, e.g.
// "3-5 days (media industry typical)" -> "media industry typical".
export function extractBenchmarkContext(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const m = text.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : undefined;
}

// A benchmark cell only deserves a citation when it actually holds a figure.
// Placeholders ("N/A", "—", "none", "TBD", …) are NOT benchmark values, so we
// must never attach an authority reference to them (that would be misleading).
const BENCHMARK_PLACEHOLDER_RE =
  /^(n\.?\/?a\.?|none|null|nil|tbd|t\.?b\.?d\.?|unknown|undisclosed|not\s+applicable|not\s+available|[-–—.]+|\?+)$/i;
export function isMeaningfulBenchmarkValue(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (s === "") return false;
  return !BENCHMARK_PLACEHOLDER_RE.test(s);
}

// Detect a NAMED publisher (and any 4-digit year) in free text.
export function parsePublisherFromText(
  text: unknown,
): { authority?: BenchmarkAuthority; year?: number } {
  if (typeof text !== "string" || !text.trim()) return {};
  for (const auth of BENCHMARK_AUTHORITIES) {
    if (auth.publisherTokens?.some((re) => re.test(text))) {
      const ym = text.match(YEAR_RE);
      return { authority: auth, year: ym ? Number(ym[0]) : undefined };
    }
  }
  return {};
}

// Map a generic industry/domain phrase (from the value text and/or the report's
// industry) to the most relevant authority as a general reference.
export function resolveDomainAuthority(
  text: unknown,
  industry?: string,
): BenchmarkAuthority | undefined {
  const haystack = `${typeof text === "string" ? text : ""} ${industry ?? ""}`;
  if (!haystack.trim()) return undefined;
  for (const auth of BENCHMARK_AUTHORITIES) {
    if (auth.domainTokens?.some((re) => re.test(haystack))) return auth;
  }
  return undefined;
}

// Resolve ONE benchmark tier into an honest, verifiable BenchmarkSource.
// Priority: existing valid url -> named publisher -> existing publisher name ->
// domain authority -> generic cross-industry fallback -> keep label-only.
export function resolveBenchmarkSource(opts: {
  existing?: BenchmarkSource | null;
  valueText?: unknown;
  industry?: string;
}): BenchmarkSource | undefined {
  const { existing, valueText, industry } = opts;
  const text = typeof valueText === "string" ? valueText : "";
  const context = extractBenchmarkContext(text);

  // 1. Existing structured source that already has a safe URL — keep verbatim.
  if (existing && typeof existing === "object") {
    const safe = sanitizeBenchmarkUrl(existing.url);
    if (safe) {
      return {
        ...existing,
        url: safe,
        verificationStatus: existing.verificationStatus ?? "publisherLanding",
      };
    }
  }

  // 2. A real publisher is NAMED in the value text -> link its data page.
  const named = parsePublisherFromText(text);
  if (named.authority) {
    return {
      publisher: named.authority.publisher,
      title: named.authority.landingTitle,
      year: named.year,
      url: named.authority.url,
      label: [named.authority.publisher, named.year].filter(Boolean).join(" "),
      verificationStatus: "publisherLanding",
      evidenceText: context,
    };
  }

  // 2b. Existing source has a publisher NAME (but no usable URL) we recognize.
  if (existing && typeof existing === "object" && existing.publisher) {
    const byName = parsePublisherFromText(String(existing.publisher));
    if (byName.authority) {
      return {
        ...existing,
        publisher: byName.authority.publisher,
        title: existing.title || byName.authority.landingTitle,
        url: byName.authority.url,
        verificationStatus: "publisherLanding",
      };
    }
  }

  // 3. Generic domain / industry reference — ONLY when the cell holds a REAL
  //    benchmark figure. Placeholders ("N/A", "—", "none") get no citation, so
  //    we never attach a source to a non-benchmark value. When a real value
  //    names no specific domain, fall back to the cross-industry
  //    process-benchmarking authority (APQC) as an honestly-labeled reference.
  if (isMeaningfulBenchmarkValue(text)) {
    const domain = resolveDomainAuthority(text, industry) ?? FALLBACK_AUTHORITY;
    return {
      publisher: domain.publisher,
      title: domain.referenceTitle,
      url: domain.url,
      label: `${domain.publisher} — industry ref`,
      verificationStatus: "authorityReference",
      evidenceText: context,
    };
  }

  // 4. Nothing resolvable, but keep any existing label/publisher attribution.
  //    Strip any unsafe/unverifiable URL so it can never leak through.
  if (existing && typeof existing === "object" && (existing.publisher || existing.label)) {
    return {
      ...existing,
      url: sanitizeBenchmarkUrl(existing.url),
      verificationStatus: existing.verificationStatus ?? "missing",
    };
  }
  return undefined;
}

const TIER_VALUE_KEYS: Array<{ tier: keyof BenchmarkSources; keys: string[] }> = [
  { tier: "avg", keys: ["Benchmark (Avg)", "Industry Benchmark"] },
  { tier: "industryBest", keys: ["Benchmark (Industry Best)"] },
  { tier: "overallBest", keys: ["Benchmark (Overall Best)"] },
];

// Resolve all three tiers for a single Step-2 KPI record. Returns a fresh
// BenchmarkSources object (does not mutate the input record).
export function resolveBenchmarkSourcesForRecord(
  record: Record<string, any>,
  opts?: { industry?: string },
): BenchmarkSources {
  const existing: BenchmarkSources =
    record && typeof record["Benchmark Sources"] === "object" && record["Benchmark Sources"]
      ? record["Benchmark Sources"]
      : {};
  const out: BenchmarkSources = { ...existing };
  for (const { tier, keys } of TIER_VALUE_KEYS) {
    const valueText = keys
      .map((k) => record?.[k])
      .find((v) => isMeaningfulBenchmarkValue(v));
    // Only resolve a tier that actually has a benchmark value to cite.
    if (valueText == null && !existing[tier]) continue;
    const resolved = resolveBenchmarkSource({
      existing: existing[tier],
      valueText,
      industry: opts?.industry,
    });
    if (resolved) out[tier] = resolved;
  }
  return out;
}

// Find the Step-2 ("Business Function Inventory & KPI Baselines") step in an
// analysis payload, tolerant of shape (numbered step, title match, or index 2).
function findStep2(steps: any[]): any | undefined {
  if (!Array.isArray(steps)) return undefined;
  return (
    steps.find((s) => s && s.step === 2) ??
    steps.find((s) => s && typeof s.title === "string" && /business function/i.test(s.title)) ??
    steps[2]
  );
}

// Augment an analysis payload's Step-2 rows with resolved benchmark sources for
// PRESENTATION/EXPORT. Returns a deep CLONE — never mutates the input, so it is
// safe for imported (immutable) reports.
export function augmentAnalysisBenchmarkSourcesForPresentation<T = any>(
  analysis: T,
  opts?: { industry?: string },
): T {
  if (!analysis || typeof analysis !== "object") return analysis;
  let clone: any;
  try {
    clone = JSON.parse(JSON.stringify(analysis));
  } catch {
    return analysis;
  }
  // Tolerate both payload shapes: top-level `steps` (Report page data / JSON
  // export / server analysisData) and nested `analysisData.steps` (the shape
  // the Boardroom HTML generators consume).
  const stepsArrays: any[][] = [clone.steps, clone?.analysisData?.steps].filter(
    (s) => Array.isArray(s),
  );
  if (stepsArrays.length === 0) return clone;
  const industry =
    opts?.industry ??
    clone?.companyOverview?.industry ??
    clone?.industry ??
    clone?.analysisData?.companyOverview?.industry ??
    clone?.analysisData?.industry ??
    undefined;
  for (const steps of stepsArrays) {
    const step2 = findStep2(steps);
    if (!step2 || !Array.isArray(step2.data)) continue;
    for (const record of step2.data) {
      if (!record || typeof record !== "object") continue;
      const sources = resolveBenchmarkSourcesForRecord(record, { industry });
      if (Object.keys(sources).length > 0) {
        record["Benchmark Sources"] = sources;
      }
    }
  }
  return clone;
}
