import { RUBRIC, COMPONENT_NAMES, type ComponentKey } from "@shared/vrm-v2";

interface HowWeScoreReadinessProps {
  className?: string;
  compact?: boolean;
}

const COMPONENT_ORDER: ComponentKey[] = [
  "orgCapacity",
  "dataReadiness",
  "techInfrastructure",
  "governance",
];

const ACCENTS: Record<ComponentKey, { ring: string; chip: string; label: string }> = {
  orgCapacity:       { ring: "ring-emerald-300", chip: "bg-emerald-50 text-emerald-700",  label: "text-emerald-700" },
  dataReadiness:     { ring: "ring-cyan-300",    chip: "bg-cyan-50 text-cyan-700",        label: "text-cyan-700" },
  techInfrastructure:{ ring: "ring-indigo-300",  chip: "bg-indigo-50 text-indigo-700",    label: "text-indigo-700" },
  governance:        { ring: "ring-slate-300",   chip: "bg-slate-100 text-slate-700",     label: "text-slate-700" },
};

export function HowWeScoreReadiness({ className, compact = false }: HowWeScoreReadinessProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-6 ${className ?? ""}`}
      data-testid="section-how-we-score-readiness"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900" data-testid="text-how-we-score-title">
          How We Score Readiness — 1&ndash;10 Scoring Guidance
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Each of the four readiness pillars is scored on a 1&ndash;10 behaviorally anchored
          rating scale (BARS). The cards below give you the verbatim anchors at{" "}
          <span className="font-semibold text-slate-700">levels 1, 3, 5, 7, and 10</span>{" "}
          &mdash; intermediate scores (2, 4, 6, 8, 9) are interpolated from the closest anchors.
          The italic <span className="font-semibold text-slate-700">3-vs-6 guidance</span> at
          the bottom of each card is the most important reading: it marks the line between
          &ldquo;pilot-grade&rdquo; (3) and &ldquo;enterprise-grade&rdquo; (6) capability,
          which is the primary driver of whether a use case lands in Champions / Quick Wins or
          Strategic / Foundation on the Value-Readiness Matrix.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {COMPONENT_ORDER.map((key) => {
          const r = RUBRIC[key];
          const accent = ACCENTS[key];
          return (
            <article
              key={key}
              className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ring-1 ${accent.ring}`}
              data-testid={`card-rubric-${key}`}
            >
              <h3 className={`text-sm font-semibold ${accent.label}`}>
                {COMPONENT_NAMES[key]}
              </h3>

              <ul className="mt-3 space-y-2">
                {r.anchors.map((a) => (
                  <li key={a.level} className="flex gap-2 text-xs text-slate-700" data-testid={`rubric-anchor-${key}-${a.level}`}>
                    <span className={`inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${accent.chip}`}>
                      {a.level}
                    </span>
                    <span className="leading-snug">
                      <span className="font-semibold text-slate-900">{a.label}.</span>{" "}
                      {compact && a.description.length > 240
                        ? a.description.slice(0, 235) + "…"
                        : a.description}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] italic leading-snug text-slate-600">
                <span className="font-semibold not-italic text-slate-700">3 vs 6:</span>{" "}
                {r.threeVsSixGuidance}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
