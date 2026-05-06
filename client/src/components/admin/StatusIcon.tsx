import { CheckCircle2, SkipForward, XCircle } from "lucide-react";
import type { BackfillReportResult } from "./types";

export function StatusIcon({
  status,
}: {
  status: BackfillReportResult["status"];
}) {
  if (status === "updated") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
  }
  return <SkipForward className="h-4 w-4 text-slate-400 shrink-0" />;
}
