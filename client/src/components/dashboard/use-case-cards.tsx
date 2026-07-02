import { Users } from "lucide-react";
import { parseEpochFlags, getEpochBadge } from "@/lib/epoch-utils";

interface UseCaseCardsProps {
  data: any[]; // Step 4 data array
}

/**
 * Determines badge color based on agentic pattern type.
 * Single-agent patterns get navy (#001278), multi-agent patterns get blue (#02a2fd).
 */
function getPatternBadgeColor(pattern: string): string {
  const singleAgent = [
    "Reflection",
    "Tool Use",
    "Planning",
    "ReAct Loop",
    "Prompt Chaining",
    "Semantic Router",
    "Constitutional Guardrail",
  ];
  if (singleAgent.some((p) => pattern?.includes(p))) {
    return "bg-[#001278] text-white";
  }
  return "bg-[#02a2fd] text-white";
}


/**
 * Safely parses a value that may be a JSON array string, a plain comma-separated string, or an actual array.
 */
function parseArrayField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const str = String(value).trim();
  if (!str) return [];
  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v).trim()).filter(Boolean);
    } catch {
      // Fall through to comma split
    }
  }
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Groups rows by Strategic Theme field.
 */
function groupByStrategicTheme(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const theme = row["Strategic Theme"] || "Unassigned";
    if (!groups.has(theme)) groups.set(theme, []);
    groups.get(theme)!.push(row);
  }
  return groups;
}

function UseCaseCardList({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-4">
      {rows.map((row: any, i: number) => {
        const pattern = row["Primary Pattern"] || row["Agentic Pattern"] || "";
        const altPattern = row["Alternative Pattern"] || "";
        const desiredOutcomes = parseArrayField(row["Desired Outcomes"]);
        const dataTypes = parseArrayField(row["Data Types"]);
        const integrations = parseArrayField(row["Integrations"]);
        const primitives = row["AI Primitives"]
          ? String(row["AI Primitives"]).split(",").map((p: string) => p.trim()).filter(Boolean)
          : [];

        return (
          <div
            key={i}
            className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Card Header */}
            <div className="bg-slate-50 px-4 py-3 border-b flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-slate-400">
                {row["ID"]}
              </span>
              <span className="font-semibold text-sm md:text-base text-slate-800 flex-1">
                {row["Use Case Name"]}
              </span>
              {pattern && (
                <span
                  className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full font-medium ${getPatternBadgeColor(pattern)}`}
                >
                  {pattern}
                </span>
              )}
              {row["Function"] && (
                <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  {row["Function"]}
                </span>
              )}
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-3">
              {/* Description */}
              {row["Description"] && (
                <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                  {row["Description"]}
                </p>
              )}

              {/* Target Friction */}
              {row["Target Friction"] && (
                <div className="flex flex-wrap gap-4 text-xs md:text-sm">
                  <div>
                    <span className="text-slate-400 font-medium">Target Friction: </span>
                    <span className="text-slate-700">{row["Target Friction"]}</span>
                  </div>
                </div>
              )}

              {/* AI Primitives as tags */}
              {primitives.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {primitives.map((p: string, j: number) => (
                    <span
                      key={j}
                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}

              {/* Agentic Pattern Analysis */}
              {(pattern || altPattern) && (
                <div className="bg-slate-50 rounded-lg p-3 border space-y-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Agentic Pattern Analysis
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Primary Pattern */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 font-medium">
                        PRIMARY PATTERN
                      </div>
                      <span
                        className={`inline-block text-xs px-2.5 py-1 rounded-md font-medium ${getPatternBadgeColor(pattern)}`}
                      >
                        {pattern || "Not assigned"}
                      </span>
                    </div>
                    {/* Alternative Pattern */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 font-medium">
                        ALTERNATIVE PATTERN
                      </div>
                      <span
                        className={`inline-block text-xs px-2.5 py-1 rounded-md font-medium ${altPattern ? getPatternBadgeColor(altPattern) + ' opacity-75' : 'bg-slate-200 text-slate-500'}`}
                      >
                        {altPattern || "None"}
                      </span>
                    </div>
                  </div>
                  {/* Rationale */}
                  {row["Pattern Rationale"] && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <div className="text-[10px] text-slate-400 font-medium mb-1">
                        RATIONALE
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {row["Pattern Rationale"]}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* E.P.O.C.H. Flags */}
              {row["EPOCH Flags"] && (() => {
                const flags = parseEpochFlags(row["EPOCH Flags"]);
                return flags.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">E.P.O.C.H.:</span>
                    {flags.map((f: string, j: number) => {
                      const badge = getEpochBadge(f);
                      return (
                        <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                      );
                    })}
                  </div>
                ) : null;
              })()}

              {/* Desired Outcomes */}
              {desiredOutcomes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Desired Outcomes
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {desiredOutcomes.map((outcome, j) => (
                      <li key={j} className="text-xs text-slate-600 leading-relaxed">
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data Types */}
              {dataTypes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Data Types
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dataTypes.map((dt, j) => (
                      <span
                        key={j}
                        className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {dt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Integrations */}
              {integrations.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Integrations
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {integrations.map((intg, j) => (
                      <span
                        key={j}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                      >
                        {intg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* HITL Checkpoint */}
              {row["Human-in-the-Loop Checkpoint"] && (
                <div className="text-xs text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2 py-1.5 rounded border border-blue-200">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">HITL:</span>{" "}
                  {row["Human-in-the-Loop Checkpoint"]}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UseCaseCards({ data }: UseCaseCardsProps) {
  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500">
        No use cases available
      </div>
    );
  }

  const hasStrategicThemes = data.some((r: any) => r["Strategic Theme"]);

  if (!hasStrategicThemes) {
    return <UseCaseCardList rows={data} />;
  }

  const themeGroups = groupByStrategicTheme(data);
  const themeNames = Array.from(themeGroups.keys());

  return (
    <div className="space-y-3">
      {themeNames.map((theme, ti) => {
        const themeRows = themeGroups.get(theme) || [];
        return (
          <div key={ti}>
            <div className="flex items-center gap-2 mb-3 mt-4">
              <div className="h-1 w-4 rounded bg-[#001278]"></div>
              <h4 className="text-sm font-semibold text-[#001278]">{theme}</h4>
              <span className="text-xs text-slate-400">
                ({themeRows.length} use case{themeRows.length !== 1 ? "s" : ""})
              </span>
            </div>
            <UseCaseCardList rows={themeRows} />
          </div>
        );
      })}
    </div>
  );
}
