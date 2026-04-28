import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BackfillFailure {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "failed";
  error?: string;
  durationMs: number;
}

interface BackfillResponse {
  success: boolean;
  force: boolean;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  failures?: BackfillFailure[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds - mins * 60);
  return `${mins}m ${remSec}s`;
}

export default function Admin() {
  const { toast } = useToast();
  const [force, setForce] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<BackfillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBackfill = async () => {
    setRunning(true);
    setStartedAt(Date.now());
    setResult(null);
    setError(null);
    try {
      const url = `/api/admin/backfill-reports${force ? "?force=1" : ""}`;
      const res = await apiRequest("POST", url);
      const body: BackfillResponse = await res.json();
      setResult(body);
      toast({
        title: "Upgrade complete",
        description: `Updated ${body.updated} of ${body.total} reports (${body.failed} failed) in ${formatDuration(body.durationMs)}.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast({
        title: "Upgrade failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Layout>
      <div className="container px-3 md:px-6 py-6 md:py-10 max-w-5xl">
        <div className="mb-6">
          <h1
            className="text-2xl md:text-3xl font-bold text-brand-navy"
            data-testid="text-admin-title"
          >
            Admin
          </h1>
          <p className="text-sm md:text-base text-slate-600 mt-1">
            Operator tools for maintaining saved reports.
          </p>
        </div>

        <Card data-testid="card-upgrade-reports">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-brand-navy" />
                  Upgrade all reports
                </CardTitle>
                <CardDescription className="mt-1">
                  Re-runs the v2.1 post-processor over every saved report so
                  they all carry the latest schema, diagnostic flat fields, and
                  Step 6 hard knockout fields. Reports that already match the
                  current shape are skipped unless you force a reprocess.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <Label
                  htmlFor="switch-force"
                  className="text-sm font-medium text-slate-900"
                >
                  Force reprocess (force=1)
                </Label>
                <p className="text-xs text-slate-600 mt-0.5">
                  Ignore the staleness check and reprocess every report,
                  including ones already on v2.1.
                </p>
              </div>
              <Switch
                id="switch-force"
                checked={force}
                onCheckedChange={setForce}
                disabled={running}
                data-testid="switch-force"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={running}
                size="lg"
                data-testid="button-run-upgrade"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Upgrading…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Upgrade all reports
                  </>
                )}
              </Button>
              {running && startedAt && (
                <span
                  className="text-xs text-slate-500 flex items-center gap-1"
                  data-testid="text-running-status"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Started {new Date(startedAt).toLocaleTimeString()} — this can
                  take a while for large datasets.
                </span>
              )}
            </div>

            {error && (
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-2"
                data-testid="alert-backfill-error"
              >
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div className="text-sm text-red-700">
                  <div className="font-medium">Upgrade failed</div>
                  <div className="text-red-600">{error}</div>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4" data-testid="panel-backfill-result">
                <Separator />
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-semibold text-slate-900">
                    Last run summary
                  </h3>
                  {result.force && (
                    <Badge variant="secondary" data-testid="badge-forced">
                      forced
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <SummaryStat
                    label="Total"
                    value={result.total}
                    testId="stat-total"
                  />
                  <SummaryStat
                    label="Updated"
                    value={result.updated}
                    tone="success"
                    testId="stat-updated"
                  />
                  <SummaryStat
                    label="Skipped"
                    value={result.skipped}
                    tone="muted"
                    testId="stat-skipped"
                  />
                  <SummaryStat
                    label="Failed"
                    value={result.failed}
                    tone={result.failed > 0 ? "danger" : "muted"}
                    testId="stat-failed"
                  />
                  <SummaryStat
                    label="Duration"
                    value={formatDuration(result.durationMs)}
                    testId="stat-duration"
                  />
                </div>

                {result.failures && result.failures.length > 0 ? (
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <div className="bg-red-50 px-4 py-2 flex items-center gap-2 border-b border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700">
                        {result.failures.length} failure
                        {result.failures.length === 1 ? "" : "s"} — review and
                        retry as needed
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead>Report ID</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.failures.map((f) => (
                          <TableRow
                            key={f.id}
                            data-testid={`row-failure-${f.id}`}
                          >
                            <TableCell
                              className="font-medium"
                              data-testid={`text-failure-company-${f.id}`}
                            >
                              {f.companyName}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-600">
                              {f.id}
                            </TableCell>
                            <TableCell>
                              {f.isWhatIf ? (
                                <Badge variant="outline">what-if</Badge>
                              ) : (
                                <Badge variant="outline">report</Badge>
                              )}
                            </TableCell>
                            <TableCell
                              className="text-sm text-red-600 max-w-md break-words"
                              data-testid={`text-failure-error-${f.id}`}
                            >
                              {f.error ?? "Unknown error"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-slate-500">
                              {formatDuration(f.durationMs)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-700"
                    data-testid="text-no-failures"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    No failures — every report was processed successfully.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-confirm-upgrade">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Upgrade every saved report?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {force ? (
                <>
                  This will <strong>force-reprocess every report</strong>,
                  including ones already on v2.1. Existing analysis data will be
                  re-run through the v2.1 post-processor and overwritten in
                  place.
                </>
              ) : (
                <>
                  This will re-run the v2.1 post-processor over every saved
                  report that doesn't already match the current schema.
                  Up-to-date reports will be skipped.
                </>
              )}{" "}
              The run can take several minutes on large datasets and cannot be
              cancelled mid-flight.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-upgrade">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void runBackfill();
              }}
              data-testid="button-confirm-upgrade"
            >
              {force ? "Force upgrade all reports" : "Upgrade all reports"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

interface SummaryStatProps {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "danger" | "muted";
  testId: string;
}

function SummaryStat({ label, value, tone = "default", testId }: SummaryStatProps) {
  const toneClasses: Record<NonNullable<SummaryStatProps["tone"]>, string> = {
    default: "text-slate-900",
    success: "text-emerald-600",
    danger: "text-red-600",
    muted: "text-slate-500",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold mt-1 ${toneClasses[tone]}`}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}
