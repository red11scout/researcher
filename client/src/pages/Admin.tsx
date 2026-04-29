import { useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface BackfillReportResult {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "updated" | "skipped" | "failed";
  reasons?: string[];
  error?: string;
  durationMs: number;
}

type BackfillFailure = BackfillReportResult & { status: "failed" };

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

interface ProgressState {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  recent: BackfillReportResult[];
}

type StreamEvent =
  | { type: "start"; total: number; force: boolean }
  | {
      type: "progress";
      index: number;
      total: number;
      result: BackfillReportResult;
    }
  | ({ type: "complete" } & BackfillResponse)
  | { type: "error"; success: false; error: string };

function isStreamEvent(value: unknown): value is StreamEvent {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === "start" || t === "progress" || t === "complete" || t === "error"
  );
}

// How many recent reports to keep in the live activity feed.
const MAX_RECENT = 25;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds - mins * 60);
  return `${mins}m ${remSec}s`;
}

export default function Admin() {
  const { isAdmin, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <Layout>
        <div
          className="container px-3 md:px-6 py-12 md:py-16 max-w-3xl flex items-center justify-center"
          data-testid="state-admin-loading"
        >
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return <AdminNoAccess />;
  }

  return <AdminPanel />;
}

function AdminNoAccess() {
  const { toast } = useToast();
  const { adminAvailable, adminLogin } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminLogin(password);
      if (result.success) {
        toast({
          title: "Admin access granted",
          description: "You can now run operator-only tools.",
        });
        setPassword("");
      } else {
        setError(result.message || "Invalid admin password");
        setPassword("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to elevate session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="container px-3 md:px-6 py-6 md:py-10 max-w-2xl">
        <Card data-testid="card-admin-no-access">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Admin access required
            </CardTitle>
            <CardDescription className="mt-1">
              The Admin tools can rewrite analysis data for every saved report,
              so they're locked behind a separate operator password. Your
              regular sign-in does not grant access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {adminAvailable ? (
              <form
                onSubmit={handleSubmit}
                className="space-y-3"
                data-testid="form-admin-elevate"
              >
                <Label
                  htmlFor="input-admin-password"
                  className="text-sm font-medium text-slate-900"
                >
                  Admin password
                </Label>
                <Input
                  id="input-admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="Enter ADMIN_PASSWORD"
                  data-testid="input-admin-password"
                />
                {error && (
                  <div
                    className="text-sm text-red-600 flex items-start gap-2"
                    data-testid="text-admin-elevate-error"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={submitting || !password.trim()}
                  data-testid="button-admin-elevate"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Unlock admin tools
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
                data-testid="text-admin-not-configured"
              >
                Admin access has not been configured for this deployment. Set
                the <code className="font-mono">ADMIN_PASSWORD</code>{" "}
                environment variable on the server to enable operator tools.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function AdminPanel() {
  const { toast } = useToast();
  const { adminLogout } = useAuth();
  const [force, setForce] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<BackfillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  // Buffer progress updates so we don't re-render on every single line of
  // NDJSON when the stream is firing rapidly.
  const flushTimer = useRef<number | null>(null);
  const pendingProgress = useRef<ProgressState | null>(null);

  const scheduleFlush = () => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      if (pendingProgress.current) {
        setProgress(pendingProgress.current);
      }
    }, 80);
  };

  const runBackfill = async () => {
    setRunning(true);
    setStartedAt(Date.now());
    setResult(null);
    setError(null);
    setProgress(null);
    pendingProgress.current = null;

    try {
      const params = new URLSearchParams({ stream: "1" });
      if (force) params.set("force", "1");
      const res = await fetch(
        `/api/admin/backfill-reports?${params.toString()}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!res.ok || !res.body) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Wrap mutable values in a single object so TypeScript keeps the
      // declared types after they're reassigned inside the closure below
      // (without an indirection it narrows to `never`).
      const state: {
        completion: BackfillResponse | null;
        streamError: string | null;
      } = { completion: null, streamError: null };

      const handleEvent = (event: StreamEvent) => {
        if (event.type === "start") {
          const initial: ProgressState = {
            total: event.total,
            processed: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
            recent: [],
          };
          pendingProgress.current = initial;
          setProgress(initial);
        } else if (event.type === "progress") {
          const prev =
            pendingProgress.current ?? {
              total: event.total,
              processed: 0,
              updated: 0,
              skipped: 0,
              failed: 0,
              recent: [],
            };
          const r = event.result;
          const next: ProgressState = {
            total: event.total,
            processed: event.index,
            updated: prev.updated + (r.status === "updated" ? 1 : 0),
            skipped: prev.skipped + (r.status === "skipped" ? 1 : 0),
            failed: prev.failed + (r.status === "failed" ? 1 : 0),
            recent: [r, ...prev.recent].slice(0, MAX_RECENT),
          };
          pendingProgress.current = next;
          scheduleFlush();
        } else if (event.type === "complete") {
          const { type: _type, ...rest } = event;
          state.completion = rest;
        } else if (event.type === "error") {
          state.streamError = event.error || "Unknown error";
        }
      };

      const consumeLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }
        if (!isStreamEvent(parsed)) return;
        handleEvent(parsed);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx = buffer.indexOf("\n");
        while (newlineIdx !== -1) {
          consumeLine(buffer.slice(0, newlineIdx));
          buffer = buffer.slice(newlineIdx + 1);
          newlineIdx = buffer.indexOf("\n");
        }
      }
      // Flush any trailing bytes the decoder is still holding, plus any
      // residual buffered line that was not newline-terminated.
      buffer += decoder.decode();
      if (buffer.length > 0) {
        consumeLine(buffer);
        buffer = "";
      }

      // Flush any pending progress updates before showing the summary.
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      if (pendingProgress.current) {
        setProgress(pendingProgress.current);
      }

      if (state.streamError) {
        throw new Error(state.streamError);
      }

      const completion = state.completion;
      if (!completion) {
        throw new Error("Stream ended before a completion event was received.");
      }

      setResult(completion);
      toast({
        title: "Upgrade complete",
        description: `Updated ${completion.updated} of ${completion.total} reports (${completion.failed} failed) in ${formatDuration(completion.durationMs)}.`,
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
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      setRunning(false);
    }
  };

  return (
    <Layout>
      <div className="container px-3 md:px-6 py-6 md:py-10 max-w-5xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
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
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="border-emerald-300 text-emerald-700 bg-emerald-50"
              data-testid="badge-admin-active"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Admin
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void adminLogout();
                toast({
                  title: "Stepped down from admin",
                  description: "Your session is no longer elevated.",
                });
              }}
              disabled={running}
              data-testid="button-admin-step-down"
            >
              Step down
            </Button>
          </div>
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

            {progress && !result && (
              <LiveProgressPanel progress={progress} running={running} />
            )}

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

interface LiveProgressPanelProps {
  progress: ProgressState;
  running: boolean;
}

function LiveProgressPanel({ progress, running }: LiveProgressPanelProps) {
  const { total, processed, updated, skipped, failed, recent } = progress;
  const pct = total > 0 ? Math.min(100, (processed / total) * 100) : 0;

  return (
    <div className="space-y-4" data-testid="panel-live-progress">
      <Separator />
      <div className="flex items-center gap-2">
        {running ? (
          <Loader2 className="h-5 w-5 text-brand-navy animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        )}
        <h3 className="text-base font-semibold text-slate-900">
          {running ? "Upgrade in progress" : "Upgrade finishing…"}
        </h3>
      </div>

      <div>
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-700 font-medium" data-testid="text-progress-label">
            {processed} of {total} reports processed
          </span>
          <span className="text-slate-500 tabular-nums" data-testid="text-progress-pct">
            {Math.round(pct)}%
          </span>
        </div>
        <Progress value={pct} data-testid="progress-bar-backfill" />
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
          <span
            className="flex items-center gap-1"
            data-testid="text-live-updated"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-emerald-700">{updated}</span>{" "}
            updated
          </span>
          <span
            className="flex items-center gap-1"
            data-testid="text-live-skipped"
          >
            <SkipForward className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-medium text-slate-700">{skipped}</span>{" "}
            skipped
          </span>
          <span
            className="flex items-center gap-1"
            data-testid="text-live-failed"
          >
            <XCircle className="h-3.5 w-3.5 text-red-600" />
            <span
              className={`font-medium ${failed > 0 ? "text-red-700" : "text-slate-700"}`}
            >
              {failed}
            </span>{" "}
            failed
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-200">
          <Clock className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">
            Recent reports
          </span>
          <span className="text-xs text-slate-500">
            (most recent first, last {MAX_RECENT})
          </span>
        </div>
        {recent.length === 0 ? (
          <div
            className="px-4 py-6 text-sm text-slate-500 text-center"
            data-testid="text-recent-empty"
          >
            Waiting for the first report to finish…
          </div>
        ) : (
          <ul
            className="divide-y divide-slate-100 max-h-72 overflow-y-auto"
            data-testid="list-recent-reports"
          >
            {recent.map((r, idx) => (
              <li
                key={`${r.id}-${idx}`}
                className="px-4 py-2 flex items-center gap-3 text-sm"
                data-testid={`row-recent-${r.id}`}
              >
                <StatusIcon status={r.status} />
                <span
                  className="font-medium text-slate-900 truncate flex-1 min-w-0"
                  data-testid={`text-recent-company-${r.id}`}
                >
                  {r.companyName}
                </span>
                {r.isWhatIf && (
                  <Badge variant="outline" className="text-[10px] py-0">
                    what-if
                  </Badge>
                )}
                <StatusBadge status={r.status} />
                <span
                  className="text-xs text-slate-500 tabular-nums w-16 text-right"
                  data-testid={`text-recent-duration-${r.id}`}
                >
                  {formatDuration(r.durationMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: BackfillReportResult["status"] }) {
  if (status === "updated") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
  }
  return <SkipForward className="h-4 w-4 text-slate-400 shrink-0" />;
}

function StatusBadge({ status }: { status: BackfillReportResult["status"] }) {
  if (status === "updated") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] py-0">
        updated
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px] py-0">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] py-0">
      skipped
    </Badge>
  );
}
