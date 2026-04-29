import { useCallback, useEffect, useRef, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  Clock,
  History,
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

interface ReportUpgrade {
  code:
    | "added-step6"
    | "bumped-schema"
    | "added-diagnostic"
    | "added-flat-fields"
    | "added-step6-ko-fields";
  label: string;
}

// Mirrors `ReportMetricDelta` in server/report-backfill.ts. Each entry is
// one headline number that changed during the backfill (Total annual value,
// Lead Champion count, etc.) so admins can tell whether a "bumped schema"
// migration actually moved the bottom line or was just cosmetic.
interface ReportMetricDelta {
  code:
    | "total-annual-value"
    | "champion-count"
    | "lead-champion-count"
    | "conditional-champion-count"
    | "quick-win-count"
    | "strategic-count"
    | "foundation-count"
    | "prototyping-candidates"
    | "total-use-cases";
  label: string;
  before: number;
  after: number;
  delta: number;
  unit: "money" | "count";
}

interface BackfillReportResult {
  id: string;
  companyName: string;
  isWhatIf: boolean;
  status: "updated" | "skipped" | "failed";
  reasons?: string[];
  upgrades?: ReportUpgrade[];
  metricDeltas?: ReportMetricDelta[];
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

// One row from /api/admin/audit-log. Mirrors the shape of `adminAuditLog`
// in shared/schema.ts but kept local to avoid pulling server types into the
// client bundle.
interface AdminAuditEntry {
  id: string;
  action: string;
  status: "success" | "failure" | string;
  statusCode: number | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  path: string | null;
  params: Record<string, unknown> | null;
  outcome: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  entries: AdminAuditEntry[];
  error?: string;
}

function AdminPanel() {
  const { toast } = useToast();
  const { adminLogout } = useAuth();
  const [force, setForce] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<BackfillResponse | null>(null);
  const [updatedReports, setUpdatedReports] = useState<BackfillReportResult[]>(
    [],
  );
  // Wall-clock timestamp of the persisted run we hydrated from on page load.
  // Null when the displayed result is from a run completed in *this* browser
  // session (no need to label it — the operator just watched it finish) or
  // before any run has ever happened. Used to render a small "from previous
  // run completed …" hint above the summary so an operator returning the
  // next day knows they're looking at yesterday's data, not a stale render
  // bug.
  const [hydratedAt, setHydratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  // Buffer progress updates so we don't re-render on every single line of
  // NDJSON when the stream is firing rapidly.
  const flushTimer = useRef<number | null>(null);
  const pendingProgress = useRef<ProgressState | null>(null);
  // Accumulate every "updated" result (uncapped) so the post-run summary
  // can group reports by which upgrade was applied. The progress feed only
  // keeps the last MAX_RECENT entries, which is too narrow for grouping.
  const updatedReportsRef = useRef<BackfillReportResult[]>([]);

  // "Recent admin activity" panel — fetched on mount and refreshed after
  // every backfill run so the operator can immediately see their own action
  // appear in the audit trail.
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadAuditLog = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch("/api/admin/audit-log?limit=25", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      const data: AuditLogResponse = await res.json();
      setAuditEntries(data.entries ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAuditError(message);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuditLog();
  }, [loadAuditLog]);

  // Hydrate the post-run summary from the server on page load. The Admin
  // page used to keep `result` and `updatedReports` purely in component
  // state, which meant a refresh (or coming back the next day) wiped the
  // failures table, retry button, and "Upgrades applied" panel — forcing
  // an operator to re-run the whole upgrade just to surface failures they
  // saw yesterday. The server now persists the most recent completed run
  // (see `/api/admin/last-backfill`) so we can render the same summary
  // immediately on mount, even before the operator clicks anything.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/last-backfill", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: {
          summary: BackfillResponse | null;
          updatedReports?: BackfillReportResult[];
          completedAt?: string;
        } = await res.json();
        if (cancelled || !data.summary) return;
        setResult(data.summary);
        setUpdatedReports(data.updatedReports ?? []);
        setHydratedAt(data.completedAt ?? null);
      } catch {
        // Hydration is a nice-to-have — if the GET fails, the page still
        // works (it just won't show the previous run until the operator
        // triggers a new one). No toast: this would be noise on every
        // mount when the DB is unreachable for unrelated reasons.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleFlush = () => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      if (pendingProgress.current) {
        setProgress(pendingProgress.current);
      }
    }, 80);
  };

  const runBackfill = async (opts?: { onlyIds?: string[] }) => {
    const onlyIds = opts?.onlyIds;
    // A retry-only run always forces reprocessing — the operator just saw
    // these reports fail, so respecting the staleness short-circuit (which
    // could mark them as "already-v2.1" and skip them) would defeat the
    // whole point of the button.
    const isRetry = !!onlyIds && onlyIds.length > 0;
    const useForce = force || isRetry;

    setRunning(true);
    setStartedAt(Date.now());
    setResult(null);
    setUpdatedReports([]);
    // We're about to produce a fresh result — once this run completes, the
    // displayed summary is "live" again, not a hydrated snapshot from the
    // previous run, so drop the "from previous run completed …" hint.
    setHydratedAt(null);
    setError(null);
    setProgress(null);
    pendingProgress.current = null;
    updatedReportsRef.current = [];

    try {
      const params = new URLSearchParams({ stream: "1" });
      if (useForce) params.set("force", "1");
      const res = await fetch(
        `/api/admin/backfill-reports?${params.toString()}`,
        {
          method: "POST",
          credentials: "include",
          headers: isRetry ? { "Content-Type": "application/json" } : undefined,
          body: isRetry ? JSON.stringify({ onlyIds }) : undefined,
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
          if (r.status === "updated") {
            updatedReportsRef.current.push(r);
          }
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
      setUpdatedReports(updatedReportsRef.current.slice());
      toast({
        title: "Upgrade complete",
        description: `Updated ${completion.updated} of ${completion.total} reports (${completion.failed} failed) in ${formatDuration(completion.durationMs)}.`,
      });
      // Pull the audit log again so the run we just finished shows up at the
      // top of the "Recent admin activity" panel.
      void loadAuditLog();
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
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-semibold text-slate-900">
                    Last run summary
                  </h3>
                  {result.force && (
                    <Badge variant="secondary" data-testid="badge-forced">
                      forced
                    </Badge>
                  )}
                  {hydratedAt && (
                    <span
                      className="text-xs text-slate-500 flex items-center gap-1"
                      data-testid="text-hydrated-from-previous-run"
                      title={new Date(hydratedAt).toLocaleString()}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      from previous run completed{" "}
                      {new Date(hydratedAt).toLocaleString()}
                    </span>
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

                {updatedReports.length > 0 && (
                  <UpgradesAppliedPanel updated={updatedReports} />
                )}

                {result.failures && result.failures.length > 0 ? (
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <div className="bg-red-50 px-4 py-2 flex items-center gap-2 border-b border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700 flex-1">
                        {result.failures.length} failure
                        {result.failures.length === 1 ? "" : "s"} — review and
                        retry as needed
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                        disabled={running}
                        onClick={() => {
                          // Capture the failure IDs before kicking off the
                          // retry — `runBackfill` clears `result` immediately
                          // so the failures table disappears while the live
                          // progress panel takes over.
                          const ids = (result.failures ?? []).map((f) => f.id);
                          if (ids.length === 0) return;
                          void runBackfill({ onlyIds: ids });
                        }}
                        data-testid="button-retry-failures"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Retry these
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead>Report ID</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="text-right">Duration</TableHead>
                          <TableHead className="text-right">Action</TableHead>
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
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                                disabled={running}
                                onClick={() => {
                                  // Per-row retry: re-run the upgrade for
                                  // just this one report ID so operators can
                                  // skip a known-broken legacy report and
                                  // triage the rest one at a time.
                                  void runBackfill({ onlyIds: [f.id] });
                                }}
                                data-testid={`button-retry-failure-${f.id}`}
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Retry
                              </Button>
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

        <RecentAdminActivity
          entries={auditEntries}
          loading={auditLoading}
          error={auditError}
          onRefresh={loadAuditLog}
        />
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
                className="px-4 py-2 text-sm"
                data-testid={`row-recent-${r.id}`}
              >
                <div className="flex items-center gap-3">
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
                </div>
                {r.status === "updated" &&
                  r.upgrades &&
                  r.upgrades.length > 0 && (
                    <div
                      className="mt-1 ml-7 flex flex-wrap gap-1"
                      data-testid={`upgrades-recent-${r.id}`}
                    >
                      {r.upgrades.map((u) => (
                        <UpgradeChip key={u.code} upgrade={u} />
                      ))}
                    </div>
                  )}
                {r.status === "updated" &&
                  r.metricDeltas &&
                  r.metricDeltas.length > 0 && (
                    <div
                      className="mt-1 ml-7 flex flex-wrap gap-1"
                      data-testid={`metric-deltas-recent-${r.id}`}
                    >
                      {r.metricDeltas.map((d) => (
                        <MetricDeltaChip key={d.code} delta={d} />
                      ))}
                    </div>
                  )}
                {r.status === "updated" &&
                  r.upgrades &&
                  r.upgrades.length > 0 &&
                  (!r.metricDeltas || r.metricDeltas.length === 0) && (
                    <div
                      className="mt-1 ml-7 text-[11px] text-slate-500 italic"
                      data-testid={`metric-deltas-recent-empty-${r.id}`}
                    >
                      Schema-only — no headline numbers moved
                    </div>
                  )}
                {r.status === "updated" &&
                  (!r.upgrades || r.upgrades.length === 0) &&
                  (!r.metricDeltas || r.metricDeltas.length === 0) && (
                    <div
                      className="mt-1 ml-7 text-[11px] text-slate-500 italic"
                      data-testid={`upgrades-recent-empty-${r.id}`}
                    >
                      Reprocessed (no schema changes)
                    </div>
                  )}
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

/**
 * Compact pill summarizing one schema-level upgrade applied during backfill
 * (e.g. "Bumped schema 2.0 → 2.2"). Used both in the live recent-reports feed
 * and in the post-run grouping panel.
 */
function UpgradeChip({ upgrade }: { upgrade: ReportUpgrade }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] py-0 px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 font-normal"
      data-testid={`chip-upgrade-${upgrade.code}`}
    >
      {upgrade.label}
    </Badge>
  );
}

/**
 * Compact pill summarizing one headline-number movement applied during the
 * backfill (e.g. "Total value $1.2M → $1.4M (+$200K)" or "Lead Champions 0
 * → 1 (+1)"). Tinted blue for a positive delta and amber for a negative one
 * so admins can spot regressions at a glance — a "bumped schema" upgrade
 * that DROPS Champion count from 3 to 1 is a story they want to see.
 */
function MetricDeltaChip({ delta }: { delta: ReportMetricDelta }) {
  const tone =
    delta.delta > 0
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <Badge
      variant="outline"
      className={`text-[10px] py-0 px-1.5 font-normal ${tone}`}
      data-testid={`chip-metric-delta-${delta.code}`}
    >
      {delta.label}
    </Badge>
  );
}

interface UpgradesAppliedPanelProps {
  updated: BackfillReportResult[];
}

/**
 * Post-run summary panel that groups every "updated" report by which schema
 * upgrades were applied. Each upgrade code lists its count and a few example
 * companies so admins can spot patterns (e.g. "every legacy report needed
 * the diagnostic added"). Reports that got `force=true`-reprocessed without
 * any schema-level diff are surfaced in their own bucket so they don't look
 * like a missing case.
 */
function UpgradesAppliedPanel({ updated }: UpgradesAppliedPanelProps) {
  // Aggregate by upgrade code. One report can contribute to multiple buckets
  // (e.g. a v2.0 → v2.2 migration usually adds the diagnostic AND bumps the
  // schema AND synthesizes Step 6 KO fields).
  const buckets = new Map<
    string,
    { label: string; reports: BackfillReportResult[] }
  >();
  let reprocessedNoChange = 0;
  // Reports that had at least one schema upgrade applied but where every
  // headline number stayed the same — surfaced separately so admins can
  // immediately ignore them ("the schema bumped but the bottom line did
  // not move, no need to re-read the report").
  let schemaOnlyCount = 0;
  // Reports that had NO schema upgrades but whose headline numbers still
  // moved — typically a force=true rerun where the post-processor's
  // calculation logic shifted since the report was last persisted. These
  // are the most surprising case (no schema diff would suggest "nothing
  // changed") so we surface them in their own bucket with full delta
  // chips, not buried inside the generic "Reprocessed (no schema
  // changes)" count.
  const reprocessedWithMetricChange: BackfillReportResult[] = [];

  for (const r of updated) {
    const upgrades = r.upgrades ?? [];
    if (upgrades.length === 0) {
      if (r.metricDeltas && r.metricDeltas.length > 0) {
        reprocessedWithMetricChange.push(r);
      } else {
        reprocessedNoChange++;
      }
      continue;
    }
    if (!r.metricDeltas || r.metricDeltas.length === 0) {
      schemaOnlyCount++;
    }
    for (const u of upgrades) {
      const existing = buckets.get(u.code);
      if (existing) {
        existing.reports.push(r);
      } else {
        buckets.set(u.code, { label: u.label, reports: [r] });
      }
    }
  }

  // Sort by frequency desc so the most common upgrade is at the top — that's
  // the "pattern" the admin most likely wants to see first.
  const sorted = Array.from(buckets.entries())
    .map(([code, value]) => ({ code, ...value }))
    .sort((a, b) => b.reports.length - a.reports.length);

  // Track which buckets are expanded. Buckets are collapsed by default so the
  // panel stays compact; admins can click the header to drill into the full
  // list of reports in that bucket without leaving the page.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  if (
    sorted.length === 0 &&
    reprocessedNoChange === 0 &&
    reprocessedWithMetricChange.length === 0
  )
    return null;

  return (
    <div
      className="rounded-lg border border-slate-200 overflow-hidden"
      data-testid="panel-upgrades-applied"
    >
      <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-200">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-slate-700">
          Upgrades applied
        </span>
        <span className="text-xs text-slate-500">
          (grouped by change, most common first — click a row to see every
          report)
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {sorted.map((bucket) => {
          const examples = bucket.reports.slice(0, 3);
          const remaining = bucket.reports.length - examples.length;
          const isOpen = expanded.has(bucket.code);
          return (
            <li
              key={bucket.code}
              data-testid={`row-upgrade-bucket-${bucket.code}`}
            >
              <button
                type="button"
                onClick={() => toggle(bucket.code)}
                aria-expanded={isOpen}
                className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
                data-testid={`button-toggle-upgrade-${bucket.code}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                )}
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 font-medium tabular-nums shrink-0"
                  data-testid={`count-upgrade-${bucket.code}`}
                >
                  {bucket.reports.length}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium text-slate-900"
                    data-testid={`label-upgrade-${bucket.code}`}
                  >
                    {bucket.label}
                  </div>
                  <div
                    className="text-xs text-slate-500 mt-0.5 truncate"
                    data-testid={`examples-upgrade-${bucket.code}`}
                  >
                    {examples.map((r) => r.companyName).join(", ")}
                    {remaining > 0 && ` and ${remaining} more`}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div
                  className="px-4 pb-3 pl-11"
                  data-testid={`details-upgrade-${bucket.code}`}
                >
                  <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-auto">
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">
                            Company
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            Report ID
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            What-if
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium">
                            Headline changes
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bucket.reports.map((r) => (
                          <tr
                            key={r.id}
                            className="hover:bg-slate-50 align-top"
                            data-testid={`row-upgrade-report-${bucket.code}-${r.id}`}
                          >
                            <td
                              className="px-3 py-1.5 text-slate-700 select-text"
                              data-testid={`text-upgrade-company-${bucket.code}-${r.id}`}
                            >
                              {r.companyName}
                            </td>
                            <td
                              className="px-3 py-1.5 text-slate-600 select-all"
                              data-testid={`text-upgrade-report-id-${bucket.code}-${r.id}`}
                            >
                              {r.id}
                            </td>
                            <td
                              className="px-3 py-1.5 text-slate-500"
                              data-testid={`text-upgrade-whatif-${bucket.code}-${r.id}`}
                            >
                              {r.isWhatIf ? "yes" : "no"}
                            </td>
                            <td
                              className="px-3 py-1.5"
                              data-testid={`text-upgrade-deltas-${bucket.code}-${r.id}`}
                            >
                              {r.metricDeltas && r.metricDeltas.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {r.metricDeltas.map((d) => (
                                    <MetricDeltaChip
                                      key={`${r.id}-${d.code}`}
                                      delta={d}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <span
                                  className="text-slate-400 italic"
                                  data-testid={`text-upgrade-deltas-empty-${bucket.code}-${r.id}`}
                                >
                                  schema-only
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {reprocessedWithMetricChange.length > 0 && (
          <li
            data-testid="row-upgrade-bucket-metric-only"
          >
            <button
              type="button"
              onClick={() => toggle("__metric_only__")}
              aria-expanded={expanded.has("__metric_only__")}
              className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
              data-testid="button-toggle-upgrade-metric-only"
            >
              {expanded.has("__metric_only__") ? (
                <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              )}
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-sky-700 font-medium tabular-nums shrink-0"
                data-testid="count-upgrade-metric-only"
              >
                {reprocessedWithMetricChange.length}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  Reprocessed — headline numbers moved (no schema change)
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  No schema/diagnostic shape changed, but the post-processor
                  produced different totals or counts on rerun — usually means
                  a calculation rule shifted since this report was last
                  persisted. Worth a closer look.
                </div>
              </div>
            </button>
            {expanded.has("__metric_only__") && (
              <div
                className="px-4 pb-3 pl-11"
                data-testid="details-upgrade-metric-only"
              >
                <div className="rounded-md border border-slate-200 bg-white max-h-64 overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Company
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Report ID
                        </th>
                        <th className="text-left px-3 py-1.5 font-medium">
                          Headline changes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reprocessedWithMetricChange.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50 align-top"
                          data-testid={`row-upgrade-metric-only-${r.id}`}
                        >
                          <td
                            className="px-3 py-1.5 text-slate-700 select-text"
                            data-testid={`text-upgrade-metric-only-company-${r.id}`}
                          >
                            {r.companyName}
                          </td>
                          <td
                            className="px-3 py-1.5 text-slate-600 select-all"
                            data-testid={`text-upgrade-metric-only-report-id-${r.id}`}
                          >
                            {r.id}
                          </td>
                          <td
                            className="px-3 py-1.5"
                            data-testid={`text-upgrade-metric-only-deltas-${r.id}`}
                          >
                            <div className="flex flex-wrap gap-1">
                              {(r.metricDeltas ?? []).map((d) => (
                                <MetricDeltaChip
                                  key={`${r.id}-${d.code}`}
                                  delta={d}
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </li>
        )}
        {schemaOnlyCount > 0 && (
          <li
            className="px-4 py-3 flex items-start gap-3"
            data-testid="row-upgrade-bucket-schema-only"
          >
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-slate-600 font-medium tabular-nums shrink-0"
              data-testid="count-upgrade-schema-only"
            >
              {schemaOnlyCount}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-700">
                Schema-only (no headline numbers moved)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                The schema/diagnostic shape changed but the executive
                dashboard totals and portfolio counts stayed the same — safe
                to ignore unless you specifically want to audit the new
                shape. (Counted across the upgrade buckets above.)
              </div>
            </div>
          </li>
        )}
        {reprocessedNoChange > 0 && (
          <li
            className="px-4 py-3 flex items-start gap-3"
            data-testid="row-upgrade-bucket-no-change"
          >
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-slate-600 font-medium tabular-nums shrink-0"
              data-testid="count-upgrade-no-change"
            >
              {reprocessedNoChange}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-700">
                Reprocessed (no schema changes)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Re-ran the post-processor without changing the staleness
                signals — typical for forced reruns of already-fresh reports.
              </div>
            </div>
          </li>
        )}
      </ul>
    </div>
  );
}

interface RecentAdminActivityProps {
  entries: AdminAuditEntry[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/**
 * "Recent admin activity" panel: most recent N rows from the admin audit
 * trail, including successful backfill runs, admin login attempts, and
 * 401/403 denials. Renders one row per audit entry with timestamp, action,
 * actor IP, and a compact summary of the outcome (counts on success, error
 * message on failure).
 */
function RecentAdminActivity({
  entries,
  loading,
  error,
  onRefresh,
}: RecentAdminActivityProps) {
  return (
    <Card className="mt-6" data-testid="card-recent-admin-activity">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-brand-navy" />
              Recent admin activity
            </CardTitle>
            <CardDescription className="mt-1">
              Append-only trail of admin endpoint usage and access attempts —
              who triggered what, from where, and when. Use this to investigate
              "who overwrote report X yesterday at 3pm?" or to spot brute-force
              attempts on the admin password.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            data-testid="button-refresh-audit-log"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-2"
            data-testid="alert-audit-error"
          >
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-red-700">
              <div className="font-medium">Could not load audit log</div>
              <div className="text-red-600">{error}</div>
            </div>
          </div>
        ) : loading && entries.length === 0 ? (
          <div
            className="flex items-center gap-2 text-sm text-slate-500 py-4"
            data-testid="state-audit-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recent activity…
          </div>
        ) : entries.length === 0 ? (
          <div
            className="text-sm text-slate-500 text-center py-6"
            data-testid="text-audit-empty"
          >
            No admin activity recorded yet. Run an action above to populate the
            trail.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actor IP</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <AuditLogRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Format an ISO timestamp like "Apr 29, 12:34:56 PM" using the browser's
// locale. Falls back to the raw string if Date construction fails.
function formatAuditTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Human-readable label for the audit action codes recorded server-side.
function actionLabel(action: string): string {
  switch (action) {
    case "backfill-reports":
      return "Upgrade all reports";
    case "admin-login":
      return "Admin login";
    case "admin-login-failed":
      return "Admin login (failed)";
    case "admin-access-denied":
      return "Admin access denied";
    default:
      return action;
  }
}

function AuditLogRow({ entry }: { entry: AdminAuditEntry }) {
  const isFailure = entry.status === "failure";
  return (
    <TableRow data-testid={`row-audit-${entry.id}`}>
      <TableCell
        className="text-xs text-slate-600 tabular-nums whitespace-nowrap"
        data-testid={`text-audit-when-${entry.id}`}
      >
        {formatAuditTimestamp(entry.createdAt)}
      </TableCell>
      <TableCell
        className="text-sm font-medium text-slate-900"
        data-testid={`text-audit-action-${entry.id}`}
      >
        {actionLabel(entry.action)}
      </TableCell>
      <TableCell data-testid={`text-audit-status-${entry.id}`}>
        {isFailure ? (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px] py-0">
            {entry.statusCode ?? "fail"}
          </Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] py-0">
            {entry.statusCode ?? "ok"}
          </Badge>
        )}
      </TableCell>
      <TableCell
        className="font-mono text-xs text-slate-600"
        data-testid={`text-audit-ip-${entry.id}`}
      >
        {entry.actorIp || "—"}
      </TableCell>
      <TableCell
        className="text-xs text-slate-600 max-w-xl break-words"
        data-testid={`text-audit-details-${entry.id}`}
      >
        <AuditDetails entry={entry} />
      </TableCell>
    </TableRow>
  );
}

// Inline summary of an audit row's params/outcome/error so the operator
// gets the gist without expanding raw JSON. Tailored per-action so each
// row reads naturally:
//   - backfill-reports success → "12 updated, 1 failed in 4.2s (force=1)"
//   - backfill-reports failure → the error message
//   - admin-login (failure)    → the error message
function AuditDetails({ entry }: { entry: AdminAuditEntry }) {
  if (entry.status === "failure") {
    return (
      <span className="text-red-600">
        {entry.errorMessage || "Failed"}
      </span>
    );
  }
  if (entry.action === "backfill-reports" && entry.outcome) {
    const o = entry.outcome as {
      total?: number;
      updated?: number;
      skipped?: number;
      failed?: number;
      durationMs?: number;
    };
    const params = (entry.params ?? {}) as {
      force?: boolean;
      onlyIdsCount?: number;
    };
    const flags: string[] = [];
    if (params.force) flags.push("force=1");
    if (params.onlyIdsCount && params.onlyIdsCount > 0) {
      flags.push(`retry ${params.onlyIdsCount}`);
    }
    const flagSuffix = flags.length ? ` (${flags.join(", ")})` : "";
    const duration =
      typeof o.durationMs === "number" ? formatDuration(o.durationMs) : "—";
    return (
      <span>
        {o.updated ?? 0} updated, {o.skipped ?? 0} skipped, {o.failed ?? 0}{" "}
        failed of {o.total ?? 0} in {duration}
        {flagSuffix}
      </span>
    );
  }
  if (entry.action === "admin-login") {
    return <span className="text-emerald-700">Elevated to admin</span>;
  }
  return <span className="text-slate-500">—</span>;
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
