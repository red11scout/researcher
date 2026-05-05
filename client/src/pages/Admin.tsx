import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/Layout";
import {
  buildAuditSearchString,
  parseAuditUrlParams,
  type AuditFilters as AuditFiltersHelper,
} from "@/lib/auditUrlParams";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Filter,
  History,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  Trash2,
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

// How old (in ms) a rehydrated summary needs to be before we visually
// distinguish it as "stale". Operators returning to /admin after a long
// break shouldn't mistake a week-old summary for a freshly-completed run.
const STALE_RUN_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Compact, human-friendly relative time ("just now", "2h ago", "5d ago")
// for the rehydrated last-run chip on the Admin page. We deliberately
// keep it short so it fits as a badge next to the summary header without
// wrapping; the absolute timestamp is still available via `title`.
function formatRelativeTime(fromIso: string, now: number = Date.now()): string {
  const then = new Date(fromIso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Math.max(0, now - then);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
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
  total?: number;
  error?: string;
}

// Operator-tunable admin settings, served by `/api/admin/settings` and
// rendered/edited by `AuditRetentionSettings`. `settings.auditRetentionDays`
// is the persisted override (null when none stored); `effective.auditRetentionDays`
// is the value the scheduler would use right now (folds in the env-var
// fallback so the UI always shows what's actually in force).
interface AdminSettingsResponse {
  settings: {
    auditRetentionDays: number | null;
    updatedAt: string | null;
  };
  effective: {
    auditRetentionDays: number;
  };
  error?: string;
}

// Most recent admin_audit_log retention sweep, served by
// `/api/admin/last-audit-cleanup` and rendered by AuditCleanupBanner.
interface AuditCleanupStatus {
  status: "success" | "failure" | string;
  removedCount: number;
  retentionDays: number;
  cutoff: string;
  errorMessage: string | null;
  durationMs: number | null;
  ranAt: string;
}

// Filter state for the "Recent admin activity" panel. All fields optional —
// a value of "" / "all" means "do not constrain". `since`/`until` are bound
// to <input type="date"> so the UI value is a YYYY-MM-DD string; we widen
// `since` to start-of-day and `until` to end-of-day before sending to the
// server so a single-day range like "since=2026-04-29, until=2026-04-29"
// does what an operator expects.
//
// The shape lives in `@/lib/auditUrlParams` so the URL ↔ state syncing
// helpers can reuse it; we just re-export under the page-local name for
// readability of the rest of this file.
type AuditFilters = AuditFiltersHelper;

export const AUDIT_PAGE_SIZE = 25;

// Action codes recorded by the server. Mirrored in the dropdown so the
// operator can pick from a finite list instead of typing a free-form string
// they'd have to know exists.
export const AUDIT_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "backfill-reports", label: "Upgrade all reports" },
  { value: "admin-login", label: "Admin login" },
  { value: "admin-login-failed", label: "Admin login (failed)" },
  { value: "admin-access-denied", label: "Admin access denied" },
];

export function AdminPanel() {
  const { toast } = useToast();
  const { adminLogout } = useAuth();
  const [force, setForce] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // "Clear last run" affordance state. Open the confirmation dialog
  // separately from the upgrade-confirm dialog above — this is a
  // destructive admin action (drops the persisted singleton) that
  // shouldn't be one click away from the routine "Run upgrade" button.
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
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
  // Report IDs that are currently being retried via a per-row "Retry"
  // button. We track them so the affected row can show a spinner without
  // wiping the rest of the failures table out from under the operator
  // (which is what happens for the batch "Retry these" button).
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // "Recent admin activity" panel — fetched on mount and refreshed after
  // every backfill run so the operator can immediately see their own action
  // appear in the audit trail.
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  // Last admin_audit_log retention sweep. `auditCleanup === null` with
  // no `auditCleanupError` means "no sweep has run yet"; with an error
  // it means "we couldn't read the status" — distinct UI states.
  const [auditCleanup, setAuditCleanup] = useState<AuditCleanupStatus | null>(
    null,
  );
  const [auditCleanupLoading, setAuditCleanupLoading] = useState(true);
  const [auditCleanupError, setAuditCleanupError] = useState<string | null>(
    null,
  );
  // Operator-tunable settings (currently just audit retention). Loaded
  // on mount and refreshed after a successful save so the "currently in
  // force" display always reflects what the next sweep will use.
  const [adminSettings, setAdminSettings] =
    useState<AdminSettingsResponse | null>(null);
  const [adminSettingsLoading, setAdminSettingsLoading] = useState(true);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(
    null,
  );
  // Filters + offset are persisted in the URL query string so a filtered view
  // can be shared via link, restored after a refresh, and walked through with
  // the browser's back/forward buttons. We derive the live state from
  // wouter's `useSearch()` (which subscribes to history navigations) rather
  // than mirroring it into `useState`, so popstate events from
  // back/forward automatically refresh the panel without a custom listener.
  const [, navigate] = useLocation();
  const search = useSearch();
  const { filters: auditFilters, offset: auditOffset } = useMemo(
    () => parseAuditUrlParams(search),
    [search],
  );
  // A ref of the current URL state so the navigation callbacks below can
  // stay referentially stable (no `[auditFilters]` deps). Stable callbacks
  // matter because the IP-input debounce effect inside
  // `RecentAdminActivity` depends on `onChangeFilters` — a new identity each
  // render would restart the timer on every keystroke.
  const auditUrlStateRef = useRef({
    filters: auditFilters,
    offset: auditOffset,
  });
  auditUrlStateRef.current = { filters: auditFilters, offset: auditOffset };

  const loadAuditLog = useCallback(
    async (filters: AuditFilters, offset: number) => {
      setAuditLoading(true);
      setAuditError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(AUDIT_PAGE_SIZE));
        params.set("offset", String(offset));
        if (filters.action && filters.action !== "all") {
          params.set("action", filters.action);
        }
        if (filters.status && filters.status !== "all") {
          params.set("status", filters.status);
        }
        // <input type="date"> gives a YYYY-MM-DD string. Widen to start- and
        // end-of-day in the operator's local timezone so a single-day range
        // captures every entry from that day, regardless of when in the day
        // it was logged.
        if (filters.since) {
          const d = new Date(`${filters.since}T00:00:00`);
          if (!Number.isNaN(d.getTime())) {
            params.set("since", d.toISOString());
          }
        }
        if (filters.until) {
          const d = new Date(`${filters.until}T23:59:59.999`);
          if (!Number.isNaN(d.getTime())) {
            params.set("until", d.toISOString());
          }
        }
        if (filters.ip.trim()) {
          params.set("ip", filters.ip.trim());
        }
        const res = await fetch(`/api/admin/audit-log?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        const data: AuditLogResponse = await res.json();
        setAuditEntries(data.entries ?? []);
        setAuditTotal(typeof data.total === "number" ? data.total : 0);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setAuditError(message);
      } finally {
        setAuditLoading(false);
      }
    },
    [],
  );

  // Reload whenever the operator changes filters or pages. The text-input
  // filter (IP) is debounced via the input's own onChange + a 300ms timer
  // inside the panel; this effect just tracks the canonical state.
  useEffect(() => {
    void loadAuditLog(auditFilters, auditOffset);
  }, [loadAuditLog, auditFilters, auditOffset]);

  // Whenever filters change, jump back to page 0 so the operator isn't
  // stranded on (say) page 5 of a now-much-smaller filtered set. We push a
  // new history entry (no `replace` flag) so the browser's back button
  // walks the operator through their previous filter states.
  const updateAuditFilters = useCallback(
    (next: Partial<AuditFilters>) => {
      const merged = { ...auditUrlStateRef.current.filters, ...next };
      navigate(`/admin${buildAuditSearchString(merged, 0)}`);
    },
    [navigate],
  );

  const updateAuditOffset = useCallback(
    (nextOffset: number) => {
      navigate(
        `/admin${buildAuditSearchString(
          auditUrlStateRef.current.filters,
          nextOffset,
        )}`,
      );
    },
    [navigate],
  );

  const resetAuditFilters = useCallback(() => {
    // "Clear filters" should also clear the URL params so a shared link
    // doesn't drag stale query state along after the operator resets.
    navigate("/admin");
  }, [navigate]);

  const loadAuditCleanup = useCallback(async () => {
    setAuditCleanupLoading(true);
    try {
      const res = await fetch("/api/admin/last-audit-cleanup", {
        credentials: "include",
      });
      if (!res.ok) {
        setAuditCleanup(null);
        setAuditCleanupError(`HTTP ${res.status}`);
        return;
      }
      const data: { cleanup: AuditCleanupStatus | null; error?: string } =
        await res.json();
      setAuditCleanup(data.cleanup ?? null);
      setAuditCleanupError(data.error ?? null);
    } catch (err) {
      setAuditCleanup(null);
      setAuditCleanupError(
        err instanceof Error ? err.message : "Failed to load cleanup status",
      );
    } finally {
      setAuditCleanupLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuditCleanup();
  }, [loadAuditCleanup]);

  const loadAdminSettings = useCallback(async () => {
    setAdminSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        credentials: "include",
      });
      if (!res.ok) {
        setAdminSettingsError(`HTTP ${res.status}`);
        setAdminSettings(null);
        return;
      }
      const data: AdminSettingsResponse = await res.json();
      setAdminSettings(data);
      setAdminSettingsError(null);
    } catch (err) {
      setAdminSettings(null);
      setAdminSettingsError(
        err instanceof Error ? err.message : "Failed to load admin settings",
      );
    } finally {
      setAdminSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminSettings();
  }, [loadAdminSettings]);

  // Save handler returned to the form component. Throws on validation /
  // network failure so the form can surface a per-field error inline,
  // and refreshes both the settings + cleanup banner on success so the
  // "Retention window: N days" line updates the moment the next sweep
  // would pick the new value up.
  const saveAdminSettings = useCallback(
    async (next: { auditRetentionDays: number | null }): Promise<void> => {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        let message = `${res.status}: ${res.statusText}`;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") message = body.error;
        } catch {
          /* fall through */
        }
        throw new Error(message);
      }
      const data: AdminSettingsResponse = await res.json();
      setAdminSettings(data);
      setAdminSettingsError(null);
      // The cleanup banner shows the retention window on its second
      // line — refresh it so it doesn't lag behind the new value.
      void loadAuditCleanup();
    },
    [loadAuditCleanup],
  );

  const refreshAuditLog = useCallback(() => {
    void loadAuditLog(auditFilters, auditOffset);
    void loadAuditCleanup();
  }, [loadAuditLog, loadAuditCleanup, auditFilters, auditOffset]);

  // Export handler — downloads every row matching the current filters
  // (not just the visible page), capped server-side at 10k rows. Used by
  // the "Download CSV" / "Download Excel" buttons next to Refresh on the
  // audit panel so an operator can attach a slice of the trail to an
  // incident ticket or pivot it in a spreadsheet without screenshotting
  // page-by-page. The `format` arg picks between the two routes; the
  // toast/filename labels follow it so the user-facing copy reads right.
  const [auditExporting, setAuditExporting] = useState<null | "csv" | "xlsx">(
    null,
  );
  const exportAuditLog = useCallback(
    async (format: "csv" | "xlsx") => {
      setAuditExporting(format);
      const formatLabel = format === "xlsx" ? "Excel" : "CSV";
      try {
        // Mirror the same filter→query-param translation as `loadAuditLog`
        // so the download contains exactly what the panel is showing.
        // No `limit`/`offset` — the server caps at AUDIT_EXPORT_MAX_ROWS
        // (10k) rather than the read endpoint's per-page limit.
        const params = new URLSearchParams();
        if (auditFilters.action && auditFilters.action !== "all") {
          params.set("action", auditFilters.action);
        }
        if (auditFilters.status && auditFilters.status !== "all") {
          params.set("status", auditFilters.status);
        }
        if (auditFilters.since) {
          const d = new Date(`${auditFilters.since}T00:00:00`);
          if (!Number.isNaN(d.getTime())) params.set("since", d.toISOString());
        }
        if (auditFilters.until) {
          const d = new Date(`${auditFilters.until}T23:59:59.999`);
          if (!Number.isNaN(d.getTime())) params.set("until", d.toISOString());
        }
        if (auditFilters.ip.trim()) params.set("ip", auditFilters.ip.trim());

        const path =
          format === "xlsx"
            ? "/api/admin/audit-log/export.xlsx"
            : "/api/admin/audit-log/export";
        const res = await fetch(`${path}?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) {
          // The server emits JSON on pre-stream failures so we can surface
          // a meaningful toast instead of "[object Blob]".
          let message = `${res.status}: ${res.statusText}`;
          try {
            const body = await res.json();
            if (body && typeof body.error === "string") message = body.error;
          } catch {
            /* response wasn't JSON; fall back to status text */
          }
          throw new Error(message);
        }
        // Pull the server-suggested filename out of Content-Disposition so
        // the file lands with the timestamp + filter tags baked in.
        const cd = res.headers.get("content-disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(cd);
        const filename = match?.[1] ?? `admin-audit.${format}`;
        const truncated = res.headers.get("x-audit-export-truncated") === "1";
        const rows = res.headers.get("x-audit-export-rows");
        const total = res.headers.get("x-audit-export-total");

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }

        if (truncated && rows && total) {
          // Warn (not error) — they got a file, just not the whole slice.
          toast({
            title: `${formatLabel} download truncated`,
            description: `Exported the first ${rows} of ${total} matching rows. Narrow the filters to capture more.`,
            variant: "destructive",
          });
        } else if (rows) {
          toast({
            title: `${formatLabel} downloaded`,
            description: `${rows} row${rows === "1" ? "" : "s"} saved as ${filename}`,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toast({
          title: `${formatLabel} download failed`,
          description: message,
          variant: "destructive",
        });
      } finally {
        setAuditExporting(null);
      }
    },
    [auditFilters, toast],
  );

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
        const hydratedUpdated = data.updatedReports ?? [];
        setUpdatedReports(hydratedUpdated);
        // Keep the ref in sync with hydrated state so that any code which
        // appends to it later (e.g. a preserve-mode per-row retry that
        // surfaces a newly-fixed report) doesn't overwrite the hydrated
        // upgrades history with only the newly-appended entries.
        updatedReportsRef.current = hydratedUpdated.slice();
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

  // Drop the persisted last-run singleton on the server, then collapse
  // the rehydrated panel locally so the operator doesn't have to refresh
  // to see the change. The audit panel will pick up the new
  // `clear-last-backfill` row on its next poll/refresh — we don't force
  // an extra refetch here to avoid extra round-trips on a benign action.
  const clearLastRun = useCallback(async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/last-backfill", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      // Mirror the empty-baseline state so the panel disappears
      // without a round-trip — matches what the next page-load
      // hydration would render against `{ summary: null }`.
      setResult(null);
      setUpdatedReports([]);
      updatedReportsRef.current = [];
      setHydratedAt(null);
      toast({
        title: "Last run cleared",
        description:
          "The saved summary has been removed. The panel will stay empty until the next upgrade run.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Could not clear last run",
        description: message,
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  }, [toast]);

  const scheduleFlush = () => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      if (pendingProgress.current) {
        setProgress(pendingProgress.current);
      }
    }, 80);
  };

  const runBackfill = async (opts?: {
    onlyIds?: string[];
    preserveResult?: boolean;
  }) => {
    const onlyIds = opts?.onlyIds;
    // A retry-only run always forces reprocessing — the operator just saw
    // these reports fail, so respecting the staleness short-circuit (which
    // could mark them as "already-v2.1" and skip them) would defeat the
    // whole point of the button.
    const isRetry = !!onlyIds && onlyIds.length > 0;
    const useForce = force || isRetry;
    // Preserve mode is used by per-row retries. The operator is triaging
    // failures one at a time and would lose the rest of the failures table
    // (and the live progress / upgrades panels) if we wiped state at the
    // start of the run. Instead, we keep the current `result`/`updatedReports`
    // in place, just mark the row as retrying, and merge the per-ID result
    // back into the existing `result.failures` once the stream completes.
    const preserve = !!opts?.preserveResult && isRetry;
    // Per-ID results accumulated from this run's progress events, used in
    // preserve mode to splice the new statuses back into the existing
    // failures table.
    const perIdResults: BackfillReportResult[] = [];

    setRunning(true);
    setStartedAt(Date.now());
    if (preserve) {
      // Mark the targeted rows as retrying so their per-row Retry button
      // can show a spinner without disturbing anything else on the page.
      setRetryingIds(new Set(onlyIds));
    } else {
      setResult(null);
      setUpdatedReports([]);
      // We're about to produce a fresh result — once this run completes,
      // the displayed summary is "live" again, not a hydrated snapshot
      // from the previous run, so drop the "from previous run completed …"
      // hint.
      setHydratedAt(null);
      setProgress(null);
      pendingProgress.current = null;
      updatedReportsRef.current = [];
    }
    setError(null);

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
          // In preserve mode the live progress panel is intentionally not
          // shown (the existing summary stays in place), so there's no
          // reason to seed `progress` state from this run.
          if (preserve) return;
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
          const r = event.result;
          // Always capture per-ID results so preserve mode can merge them
          // back into the failures table once the stream completes.
          perIdResults.push(r);
          if (preserve) return;
          const prev =
            pendingProgress.current ?? {
              total: event.total,
              processed: 0,
              updated: 0,
              skipped: 0,
              failed: 0,
              recent: [],
            };
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

      if (preserve) {
        // Per-row retry: splice the per-ID results back into the existing
        // failures table instead of replacing the whole summary. Rows that
        // weren't part of this retry stay exactly where they were.
        const resultsById = new Map(perIdResults.map((r) => [r.id, r]));
        let updatedDelta = 0;
        let skippedDelta = 0;
        let failedDelta = 0;
        const newlyUpdated: BackfillReportResult[] = [];
        setResult((prev) => {
          if (!prev) return prev;
          const nextFailures: BackfillFailure[] = [];
          for (const f of prev.failures ?? []) {
            const r = resultsById.get(f.id);
            if (!r) {
              // Not retried in this run — leave the failure row untouched.
              nextFailures.push(f);
              continue;
            }
            if (r.status === "failed") {
              // Still failing, but with possibly-new error text/duration.
              nextFailures.push(r as BackfillFailure);
            } else if (r.status === "updated") {
              updatedDelta += 1;
              failedDelta -= 1;
              newlyUpdated.push(r);
            } else {
              skippedDelta += 1;
              failedDelta -= 1;
            }
          }
          return {
            ...prev,
            failures: nextFailures,
            updated: prev.updated + updatedDelta,
            skipped: prev.skipped + skippedDelta,
            failed: prev.failed + failedDelta,
          };
        });
        if (newlyUpdated.length > 0) {
          // Surface the newly-fixed reports in the "Upgrades applied" and
          // "Headline number changes" panels alongside whatever was already
          // there from the original run. Use a functional setState so we
          // append to the latest committed `updatedReports` (including any
          // hydrated history from the persisted last run) instead of relying
          // solely on the ref, which is only kept in sync from the streaming
          // path.
          updatedReportsRef.current = [
            ...updatedReportsRef.current,
            ...newlyUpdated,
          ];
          setUpdatedReports((prev) => [...prev, ...newlyUpdated]);
        }
        setRetryingIds(new Set());
        const succeeded = perIdResults.filter(
          (r) => r.status === "updated" || r.status === "skipped",
        ).length;
        const failedAgain = perIdResults.filter(
          (r) => r.status === "failed",
        ).length;
        toast({
          title: "Retry complete",
          description:
            failedAgain === 0
              ? `Retried ${perIdResults.length} report${perIdResults.length === 1 ? "" : "s"} — all succeeded.`
              : `Retried ${perIdResults.length} report${perIdResults.length === 1 ? "" : "s"} — ${succeeded} succeeded, ${failedAgain} still failing.`,
        });
      } else {
        setResult(completion);
        setUpdatedReports(updatedReportsRef.current.slice());
        toast({
          title: "Upgrade complete",
          description: `Updated ${completion.updated} of ${completion.total} reports (${completion.failed} failed) in ${formatDuration(completion.durationMs)}.`,
        });
      }
      // Pull the audit log again so the run we just finished shows up at the
      // top of the "Recent admin activity" panel.
      refreshAuditLog();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (preserve) {
        // Don't surface an inline page-level "Upgrade failed" banner for a
        // single-row retry — that would obscure the failures table the
        // operator is still trying to read. The toast is enough.
        toast({
          title: "Retry failed",
          description: message,
          variant: "destructive",
        });
      } else {
        setError(message);
        toast({
          title: "Upgrade failed",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      if (preserve) {
        // Always clear the per-row spinner state on the way out, even if
        // the network request errored mid-flight, so a stuck row can't
        // permanently disable its own Retry button.
        setRetryingIds(new Set());
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

            {result && (() => {
              const hydratedAge = hydratedAt
                ? Date.now() - new Date(hydratedAt).getTime()
                : 0;
              const isStale =
                !!hydratedAt &&
                Number.isFinite(hydratedAge) &&
                hydratedAge >= STALE_RUN_THRESHOLD_MS;
              return (
              <div
                className={`space-y-4 ${isStale ? "opacity-70" : ""}`}
                data-testid="panel-backfill-result"
                data-stale={isStale ? "true" : "false"}
              >
                <Separator />
                {isStale && (
                  <div
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 flex items-start gap-2 text-sm text-amber-800"
                    data-testid="banner-last-run-stale"
                  >
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <span>
                      This summary is from a previous run completed{" "}
                      {formatRelativeTime(hydratedAt!)} — re-run the upgrade to
                      see fresh results.
                    </span>
                  </div>
                )}
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
                    <Badge
                      variant={isStale ? "outline" : "secondary"}
                      className={
                        isStale
                          ? "border-amber-300 bg-amber-50 text-amber-800 gap-1"
                          : "gap-1"
                      }
                      data-testid="chip-last-run-relative"
                      title={`Last run completed ${new Date(hydratedAt).toLocaleString()}`}
                    >
                      <Clock className="h-3 w-3" />
                      Last run · {formatRelativeTime(hydratedAt)}
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto gap-1"
                    onClick={() => setClearConfirmOpen(true)}
                    disabled={running || clearing}
                    data-testid="button-clear-last-run"
                    title="Drop the saved last-run summary so this panel collapses until the next upgrade."
                  >
                    {clearing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Clear last run
                  </Button>
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

                {updatedReports.length > 0 && (
                  <HeadlineNumberChangesPanel updated={updatedReports} />
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
                        disabled={result.failures.length === 0}
                        onClick={async () => {
                          const ids = (result.failures ?? []).map((f) => f.id);
                          if (ids.length === 0) return;
                          const text = ids.join("\n");
                          try {
                            await navigator.clipboard.writeText(text);
                            toast({
                              title: "Copied to clipboard",
                              description: `${ids.length} failed report ID${ids.length === 1 ? "" : "s"} copied.`,
                            });
                          } catch {
                            toast({
                              title: "Copy failed",
                              description:
                                "Your browser blocked clipboard access. Please copy manually.",
                              variant: "destructive",
                            });
                          }
                        }}
                        data-testid="button-copy-ids-failures"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy IDs
                      </Button>
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
                            <TableCell className="font-mono text-xs text-slate-600 select-all">
                              <a
                                href={`/reports/${f.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                title={
                                  f.isWhatIf
                                    ? "Open what-if report in new tab"
                                    : "Open report in new tab"
                                }
                                onClick={(e) => {
                                  // Preserve manual text selection: if the
                                  // admin is mid-drag selecting the ID to
                                  // copy it, don't hijack the click into a
                                  // navigation.
                                  const sel = window.getSelection();
                                  if (!sel || sel.toString().length === 0) {
                                    return;
                                  }
                                  const link = e.currentTarget;
                                  const inAnchor =
                                    sel.anchorNode &&
                                    link.contains(sel.anchorNode);
                                  const inFocus =
                                    sel.focusNode &&
                                    link.contains(sel.focusNode);
                                  if (inAnchor || inFocus) {
                                    e.preventDefault();
                                  }
                                }}
                                data-testid={`link-failure-report-${f.id}`}
                              >
                                {f.id}
                              </a>
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
                                  // triage the rest one at a time. Pass
                                  // `preserveResult` so the rest of the
                                  // failures table stays visible while this
                                  // single row is re-run.
                                  void runBackfill({
                                    onlyIds: [f.id],
                                    preserveResult: true,
                                  });
                                }}
                                data-testid={`button-retry-failure-${f.id}`}
                              >
                                {retryingIds.has(f.id) ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    Retrying…
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                    Retry
                                  </>
                                )}
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
              );
            })()}
          </CardContent>
        </Card>

        <RecentAdminActivity
          entries={auditEntries}
          total={auditTotal}
          loading={auditLoading}
          error={auditError}
          filters={auditFilters}
          offset={auditOffset}
          pageSize={AUDIT_PAGE_SIZE}
          onChangeFilters={updateAuditFilters}
          onResetFilters={resetAuditFilters}
          onChangeOffset={updateAuditOffset}
          onRefresh={refreshAuditLog}
          onExport={(format) => void exportAuditLog(format)}
          exporting={auditExporting}
          cleanup={auditCleanup}
          cleanupLoading={auditCleanupLoading}
          cleanupError={auditCleanupError}
        />

        <AuditRetentionSettings
          data={adminSettings}
          loading={adminSettingsLoading}
          loadError={adminSettingsError}
          onSave={saveAdminSettings}
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

      <AlertDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
      >
        <AlertDialogContent data-testid="dialog-confirm-clear-last-run">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-amber-600" />
              Clear the saved last-run summary?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This drops the persisted record of the most recent upgrade run,
              so the summary, failures table, and "Retry these" button on this
              page will disappear until the next run completes. The reports
              themselves are not affected — only the saved summary view is
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-last-run">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClearConfirmOpen(false);
                void clearLastRun();
              }}
              data-testid="button-confirm-clear-last-run"
            >
              Clear last run
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
export function UpgradesAppliedPanel({ updated }: UpgradesAppliedPanelProps) {
  const { toast } = useToast();
  const copyIds = async (ids: string[], bucketLabel: string) => {
    const text = ids.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${ids.length} report ID${ids.length === 1 ? "" : "s"} from "${bucketLabel}" copied.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access. Please copy manually.",
        variant: "destructive",
      });
    }
  };

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

  // When on, hide reports inside each upgrade bucket whose `metricDeltas`
  // is empty (the "schema-only" rows already labeled inline) so admins can
  // focus on the reports that actually moved a headline number. The state
  // lives on the panel itself so it survives expanding/collapsing buckets.
  const [hideSchemaOnly, setHideSchemaOnly] = useState(false);

  const filterReports = (reports: BackfillReportResult[]) =>
    hideSchemaOnly
      ? reports.filter((r) => r.metricDeltas && r.metricDeltas.length > 0)
      : reports;

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
        <div className="ml-auto flex items-center gap-2">
          <Switch
            id="toggle-hide-schema-only-upgrades"
            checked={hideSchemaOnly}
            onCheckedChange={setHideSchemaOnly}
            data-testid="switch-hide-schema-only-upgrades"
          />
          <Label
            htmlFor="toggle-hide-schema-only-upgrades"
            className="text-xs text-slate-600 cursor-pointer"
            data-testid="label-hide-schema-only-upgrades"
          >
            Show only reports with headline changes
          </Label>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {sorted.map((bucket) => {
          const visibleReports = filterReports(bucket.reports);
          const examples = visibleReports.slice(0, 3);
          const remaining = visibleReports.length - examples.length;
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
                  {hideSchemaOnly
                    ? `${visibleReports.length} of ${bucket.reports.length}`
                    : bucket.reports.length}
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
                    {examples.length === 0
                      ? hideSchemaOnly
                        ? "No reports moved a headline number"
                        : ""
                      : examples.map((r) => r.companyName).join(", ")}
                    {remaining > 0 && ` and ${remaining} more`}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div
                  className="px-4 pb-3 pl-11"
                  data-testid={`details-upgrade-${bucket.code}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">
                      {hideSchemaOnly
                        ? `${visibleReports.length} of ${bucket.reports.length} report${bucket.reports.length === 1 ? "" : "s"} moved a headline number`
                        : `${bucket.reports.length} report${bucket.reports.length === 1 ? "" : "s"} in this bucket`}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() =>
                        copyIds(
                          visibleReports.map((r) => r.id),
                          bucket.label,
                        )
                      }
                      disabled={visibleReports.length === 0}
                      data-testid={`button-copy-ids-upgrade-${bucket.code}`}
                    >
                      <Copy className="h-3 w-3" />
                      Copy IDs
                    </Button>
                  </div>
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
                        {visibleReports.length === 0 && (
                          <tr
                            data-testid={`row-upgrade-empty-${bucket.code}`}
                          >
                            <td
                              colSpan={4}
                              className="px-3 py-3 text-center text-slate-400 italic"
                            >
                              All {bucket.reports.length} report
                              {bucket.reports.length === 1 ? "" : "s"} in this
                              bucket were schema-only — toggle off the filter
                              above to see them.
                            </td>
                          </tr>
                        )}
                        {visibleReports.map((r) => (
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
                              <a
                                href={
                                  r.isWhatIf
                                    ? `/whatif/${r.id}`
                                    : `/reports/${r.id}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                                title={
                                  r.isWhatIf
                                    ? "Open what-if report in new tab"
                                    : "Open report in new tab"
                                }
                                onClick={(e) => {
                                  const sel = window.getSelection();
                                  if (!sel || sel.toString().length === 0) {
                                    return;
                                  }
                                  const link = e.currentTarget;
                                  const inAnchor =
                                    sel.anchorNode &&
                                    link.contains(sel.anchorNode);
                                  const inFocus =
                                    sel.focusNode &&
                                    link.contains(sel.focusNode);
                                  if (inAnchor || inFocus) {
                                    e.preventDefault();
                                  }
                                }}
                                data-testid={`link-upgrade-report-${bucket.code}-${r.id}`}
                              >
                                {r.id}
                              </a>
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
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    {reprocessedWithMetricChange.length} report
                    {reprocessedWithMetricChange.length === 1 ? "" : "s"} in
                    this bucket
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() =>
                      copyIds(
                        reprocessedWithMetricChange.map((r) => r.id),
                        "Reprocessed — headline numbers moved (no schema change)",
                      )
                    }
                    data-testid="button-copy-ids-upgrade-metric-only"
                  >
                    <Copy className="h-3 w-3" />
                    Copy IDs
                  </Button>
                </div>
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

// Display labels for each headline-metric code, mirrored from the `name`
// column in `computeMetricDeltas` in server/report-backfill.ts. Kept here
// (rather than read off the per-report delta labels, which embed numbers
// like "Total value $1.2M → $1.4M") so the cross-run bucket header reads
// as a clean metric name even before any row is expanded.
const METRIC_LABELS: Record<ReportMetricDelta["code"], string> = {
  "total-annual-value": "Total value",
  "prototyping-candidates": "Prototyping candidates",
  "lead-champion-count": "Lead Champions",
  "champion-count": "Champions",
  "conditional-champion-count": "Conditional Champions",
  "quick-win-count": "Quick Wins",
  "strategic-count": "Strategic",
  "foundation-count": "Foundation",
  "total-use-cases": "Total use cases",
};

// Stable display order for headline-metric buckets when two metrics moved
// on exactly the same number of reports. Mirrors the field order used by
// `computeMetricDeltas` (money first, then portfolio counts in roughly
// "most useful" order) so the cross-run panel and the per-report chip row
// stay visually aligned.
const METRIC_ORDER: ReportMetricDelta["code"][] = [
  "total-annual-value",
  "prototyping-candidates",
  "lead-champion-count",
  "champion-count",
  "conditional-champion-count",
  "quick-win-count",
  "strategic-count",
  "foundation-count",
  "total-use-cases",
];

interface HeadlineNumberChangesPanelProps {
  updated: BackfillReportResult[];
}

/**
 * Cross-run summary panel that buckets every "updated" report by *which
 * headline number moved* — the orthogonal view to `UpgradesAppliedPanel`,
 * which buckets by which schema upgrade was applied. Answers "across this
 * whole run, how many reports had Total value move? how many lost Lead
 * Champions?" without requiring the admin to expand every schema bucket
 * and scan the per-report delta chips by hand.
 *
 * Buckets are sorted by frequency desc, then by the canonical
 * `METRIC_ORDER` for deterministic ties. A report can contribute to
 * multiple buckets when more than one headline number moved (a v2.0
 * → v2.2 migration that synthesizes the diagnostic block usually moves
 * Total value AND a portfolio count).
 *
 * Empty state: when no updated report had any headline number move (every
 * upgrade was schema-only), we render a single info row instead of
 * hiding — the *absence* of bottom-line movement is itself useful info
 * for the admin reviewing the run.
 */
export function HeadlineNumberChangesPanel({
  updated,
}: HeadlineNumberChangesPanelProps) {
  const { toast } = useToast();
  const copyIds = async (ids: string[], bucketLabel: string) => {
    const text = ids.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${ids.length} report ID${ids.length === 1 ? "" : "s"} from "${bucketLabel}" copied.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description:
          "Your browser blocked clipboard access. Please copy manually.",
        variant: "destructive",
      });
    }
  };

  // Aggregate by metric code across every updated report. We keep the
  // full delta (not just the report) so the expanded table can render the
  // before/after columns and the colored chip without a second lookup.
  const buckets = new Map<
    ReportMetricDelta["code"],
    { label: string; entries: Array<{ report: BackfillReportResult; delta: ReportMetricDelta }> }
  >();
  for (const r of updated) {
    for (const d of r.metricDeltas ?? []) {
      // Defensive: a delta with `delta === 0` should never reach the UI
      // (the server filters those out in `computeMetricDeltas`), but
      // double-check here so a future server bug can't silently inflate
      // the bucket counts.
      if (d.delta === 0) continue;
      const existing = buckets.get(d.code);
      if (existing) {
        existing.entries.push({ report: r, delta: d });
      } else {
        buckets.set(d.code, {
          label: METRIC_LABELS[d.code] ?? d.code,
          entries: [{ report: r, delta: d }],
        });
      }
    }
  }

  const sorted = Array.from(buckets.entries())
    .map(([code, value]) => ({ code, ...value }))
    .sort((a, b) => {
      if (b.entries.length !== a.entries.length) {
        return b.entries.length - a.entries.length;
      }
      return METRIC_ORDER.indexOf(a.code) - METRIC_ORDER.indexOf(b.code);
    });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div
      className="rounded-lg border border-slate-200 overflow-hidden"
      data-testid="panel-headline-changes"
    >
      <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-200">
        <CheckCircle2 className="h-4 w-4 text-sky-600" />
        <span className="text-sm font-medium text-slate-700">
          Headline number changes
        </span>
        <span className="text-xs text-slate-500">
          (grouped by which metric moved, most common first — click a row to
          see every report)
        </span>
      </div>
      {sorted.length === 0 ? (
        <div
          className="px-4 py-3 text-sm text-slate-600"
          data-testid="text-headline-changes-empty"
        >
          No headline numbers moved across this run — every upgrade was
          schema-only.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((bucket) => {
            const exampleCompanies = Array.from(
              new Set(bucket.entries.map((e) => e.report.companyName)),
            ).slice(0, 3);
            const totalCompanies = new Set(
              bucket.entries.map((e) => e.report.companyName),
            ).size;
            const remaining = totalCompanies - exampleCompanies.length;
            const isOpen = expanded.has(bucket.code);
            // Direction split: how many reports moved this metric upward vs.
            // downward. Surfaced inline in the bucket header so admins can
            // spot regressions (e.g. a "bumped schema" upgrade that DROPS
            // Total value across 5 reports) without expanding the row to
            // scan the colored chips. Each side collapses when zero so a
            // run with strictly-positive movement reads as a single up
            // counter rather than a misleading "+12 / -0".
            const upCount = bucket.entries.filter(
              (e) => e.delta.delta > 0,
            ).length;
            const downCount = bucket.entries.filter(
              (e) => e.delta.delta < 0,
            ).length;
            return (
              <li
                key={bucket.code}
                data-testid={`row-headline-bucket-${bucket.code}`}
              >
                <button
                  type="button"
                  onClick={() => toggle(bucket.code)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-inset"
                  data-testid={`button-toggle-headline-${bucket.code}`}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  )}
                  <Badge
                    variant="outline"
                    className="border-sky-200 bg-sky-50 text-sky-700 font-medium tabular-nums shrink-0"
                    data-testid={`count-headline-${bucket.code}`}
                  >
                    {bucket.entries.length}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium text-slate-900"
                      data-testid={`label-headline-${bucket.code}`}
                    >
                      {bucket.label}
                    </div>
                    <div
                      className="text-xs text-slate-500 mt-0.5 truncate"
                      data-testid={`examples-headline-${bucket.code}`}
                    >
                      {exampleCompanies.join(", ")}
                      {remaining > 0 && ` and ${remaining} more`}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1.5 shrink-0 mt-0.5"
                    data-testid={`split-headline-${bucket.code}`}
                  >
                    {upCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-sky-700 tabular-nums"
                        title={`${upCount} report${upCount === 1 ? "" : "s"} moved up`}
                        data-testid={`count-headline-up-${bucket.code}`}
                      >
                        <ArrowUp
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {upCount}
                      </span>
                    )}
                    {downCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 tabular-nums"
                        title={`${downCount} report${downCount === 1 ? "" : "s"} moved down`}
                        data-testid={`count-headline-down-${bucket.code}`}
                      >
                        <ArrowDown
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {downCount}
                      </span>
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div
                    className="px-4 pb-3 pl-11"
                    data-testid={`details-headline-${bucket.code}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500">
                        {bucket.entries.length} report
                        {bucket.entries.length === 1 ? "" : "s"} in this
                        bucket
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() =>
                          copyIds(
                            bucket.entries.map((e) => e.report.id),
                            bucket.label,
                          )
                        }
                        data-testid={`button-copy-ids-headline-${bucket.code}`}
                      >
                        <Copy className="h-3 w-3" />
                        Copy IDs
                      </Button>
                    </div>
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
                            <th className="text-right px-3 py-1.5 font-medium">
                              Before
                            </th>
                            <th className="text-right px-3 py-1.5 font-medium">
                              After
                            </th>
                            <th className="text-left px-3 py-1.5 font-medium">
                              Delta
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bucket.entries.map(({ report: r, delta: d }) => (
                            <tr
                              key={`${bucket.code}-${r.id}`}
                              className="hover:bg-slate-50 align-top"
                              data-testid={`row-headline-report-${bucket.code}-${r.id}`}
                            >
                              <td
                                className="px-3 py-1.5 text-slate-700 select-text"
                                data-testid={`text-headline-company-${bucket.code}-${r.id}`}
                              >
                                {r.companyName}
                              </td>
                              <td
                                className="px-3 py-1.5 text-slate-600 select-all"
                                data-testid={`text-headline-report-id-${bucket.code}-${r.id}`}
                              >
                                <a
                                  href={
                                    r.isWhatIf
                                      ? `/whatif/${r.id}`
                                      : `/reports/${r.id}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline"
                                  title={
                                    r.isWhatIf
                                      ? "Open what-if report in new tab"
                                      : "Open report in new tab"
                                  }
                                  onClick={(e) => {
                                    const sel = window.getSelection();
                                    if (!sel || sel.toString().length === 0) {
                                      return;
                                    }
                                    const link = e.currentTarget;
                                    const inAnchor =
                                      sel.anchorNode &&
                                      link.contains(sel.anchorNode);
                                    const inFocus =
                                      sel.focusNode &&
                                      link.contains(sel.focusNode);
                                    if (inAnchor || inFocus) {
                                      e.preventDefault();
                                    }
                                  }}
                                  data-testid={`link-headline-report-${bucket.code}-${r.id}`}
                                >
                                  {r.id}
                                </a>
                              </td>
                              <td
                                className="px-3 py-1.5 text-right text-slate-600 tabular-nums"
                                data-testid={`text-headline-before-${bucket.code}-${r.id}`}
                              >
                                {formatMetricValue(d.before, d.unit)}
                              </td>
                              <td
                                className="px-3 py-1.5 text-right text-slate-700 tabular-nums"
                                data-testid={`text-headline-after-${bucket.code}-${r.id}`}
                              >
                                {formatMetricValue(d.after, d.unit)}
                              </td>
                              <td
                                className="px-3 py-1.5"
                                data-testid={`text-headline-delta-${bucket.code}-${r.id}`}
                              >
                                <MetricDeltaChip delta={d} />
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
        </ul>
      )}
    </div>
  );
}

// Render a single before/after value for the headline-changes table, using
// the same compact $K/$M/$B convention as `MetricDeltaChip` for money and
// a plain integer for counts. Kept local to this file because it only
// renders a single magnitude (no sign) — the colored chip in the next
// column already carries the directional information.
function formatMetricValue(value: number, unit: ReportMetricDelta["unit"]): string {
  if (unit === "money") {
    const abs = Math.abs(Math.round(value));
    if (abs >= 1_000_000_000) {
      const b = abs / 1_000_000_000;
      const formatted =
        b === Math.floor(b) ? `$${Math.floor(b)}B` : `$${b.toFixed(1)}B`;
      return value < 0 ? `-${formatted}` : formatted;
    }
    if (abs >= 1_000_000) {
      const m = abs / 1_000_000;
      const formatted =
        m === Math.floor(m) ? `$${Math.floor(m)}M` : `$${m.toFixed(1)}M`;
      return value < 0 ? `-${formatted}` : formatted;
    }
    if (abs >= 1_000) {
      const k = `$${Math.round(abs / 1_000)}K`;
      return value < 0 ? `-${k}` : k;
    }
    return value < 0 ? `-$${abs}` : `$${abs}`;
  }
  return `${value}`;
}

// Status banner above the audit log table summarising the most recent
// retention sweep (success / failure / never run / load-error / loading).
function AuditCleanupBanner({
  cleanup,
  loading,
  error,
}: {
  cleanup: AuditCleanupStatus | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !cleanup && !error) {
    return (
      <div
        className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 flex items-center gap-2"
        data-testid="status-audit-cleanup-loading"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading audit cleanup status…
      </div>
    );
  }

  if (!cleanup && error) {
    return (
      <div
        className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2"
        data-testid="status-audit-cleanup-load-error"
      >
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">Unable to load cleanup status.</div>
          <div
            className="text-amber-700 mt-0.5 break-words"
            data-testid="text-audit-cleanup-load-error"
          >
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!cleanup) {
    return (
      <div
        className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex items-center gap-2"
        data-testid="status-audit-cleanup-none"
      >
        <Clock className="h-3.5 w-3.5 text-slate-500" />
        <span>
          No audit log cleanup recorded yet. The retention sweeper runs
          shortly after boot and once a day after that.
        </span>
      </div>
    );
  }

  const ranAtDate = new Date(cleanup.ranAt);
  const ranAtAbsolute = formatAuditTimestamp(cleanup.ranAt);
  const ranAtRelative = formatRelativeAge(ranAtDate);
  const cutoffAbsolute = formatAuditTimestamp(cleanup.cutoff);

  if (cleanup.status === "failure") {
    return (
      <div
        className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2"
        data-testid="status-audit-cleanup-failure"
      >
        <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">
            Audit log cleanup failed{" "}
            <span
              className="text-red-600 font-normal"
              data-testid="text-audit-cleanup-ran-relative"
              title={ranAtAbsolute}
            >
              ({ranAtRelative})
            </span>
          </div>
          {cleanup.errorMessage && (
            <div
              className="text-red-600 mt-0.5 break-words"
              data-testid="text-audit-cleanup-error"
            >
              {cleanup.errorMessage}
            </div>
          )}
          <div className="text-red-500 mt-0.5">
            Retention window: {cleanup.retentionDays} days. The sweeper will
            retry on its next run; investigate if failures persist.
          </div>
        </div>
      </div>
    );
  }

  const removedLabel =
    cleanup.removedCount === 1
      ? "1 row removed"
      : `${cleanup.removedCount.toLocaleString()} rows removed`;
  return (
    <div
      className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2"
      data-testid="status-audit-cleanup-success"
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
      <div>
        <div>
          <span className="font-medium">Audit log last cleaned up</span>{" "}
          <span
            data-testid="text-audit-cleanup-ran-relative"
            title={ranAtAbsolute}
          >
            {ranAtRelative}
          </span>
          {" — "}
          <span data-testid="text-audit-cleanup-removed">{removedLabel}</span>
        </div>
        <div className="text-emerald-700 mt-0.5">
          Retention window: {cleanup.retentionDays} days (cutoff{" "}
          {cutoffAbsolute}).
        </div>
      </div>
    </div>
  );
}

// Relative-age string ("just now", "12 minutes ago", …) for the
// cleanup banner's `ranAt`. Falls back to the absolute timestamp on
// invalid input or future dates.
function formatRelativeAge(when: Date): string {
  const diffMs = Date.now() - when.getTime();
  if (!Number.isFinite(diffMs)) return "at an unknown time";
  if (diffMs < 0) return formatAuditTimestamp(when.toISOString());
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// Operator-tunable retention window for the admin audit log. Saving an
// integer here persists an override that wins over the
// ADMIN_AUDIT_RETENTION_DAYS env var, so a non-engineer admin can shorten
// retention for a noisy environment (or extend it during an investigation)
// without a deploy. Clearing the input restores the env / default fallback.
//
// Validation mirrors the server's Zod schema (positive integer, ≤ 3650
// days). We surface the same error inline so the operator sees what's
// wrong without watching the network tab — and crucially, an invalid
// value never reaches the storage layer where it could disable retention.
function AuditRetentionSettings({
  data,
  loading,
  loadError,
  onSave,
}: {
  data: AdminSettingsResponse | null;
  loading: boolean;
  loadError: string | null;
  onSave: (next: { auditRetentionDays: number | null }) => Promise<void>;
}) {
  const { toast } = useToast();
  const stored = data?.settings.auditRetentionDays ?? null;
  const effective = data?.effective.auditRetentionDays ?? null;

  // Local draft so the input mirrors what the operator typed (incl.
  // empty string = clear override) without round-tripping through the
  // server on every keystroke. We re-sync from `stored` whenever the
  // upstream value changes (initial load, or after a successful save).
  const [draft, setDraft] = useState<string>(
    stored == null ? "" : String(stored),
  );
  useEffect(() => {
    setDraft(stored == null ? "" : String(stored));
  }, [stored]);

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Mirror the server-side Zod rules so an obviously-invalid value
  // never even leaves the browser. Empty string is "clear override",
  // not an error.
  const parseDraft = (
    raw: string,
  ): { ok: true; value: number | null } | { ok: false; error: string } => {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, value: null };
    if (!/^-?\d+$/.test(trimmed)) {
      return {
        ok: false,
        error: "Enter a whole number of days, or leave blank to use the default.",
      };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "Enter a whole number of days." };
    }
    if (n <= 0) return { ok: false, error: "Must be at least 1 day." };
    if (n > 3650) {
      return { ok: false, error: "Must be 3650 days (10 years) or fewer." };
    }
    return { ok: true, value: n };
  };

  const draftMatchesStored =
    (stored === null && draft.trim() === "") ||
    (stored !== null && draft.trim() === String(stored));

  const handleSave = async () => {
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    setValidationError(null);
    setSaving(true);
    try {
      await onSave({ auditRetentionDays: parsed.value });
      toast({
        title: "Retention window saved",
        description:
          parsed.value === null
            ? "Cleared the override — falling back to the default."
            : `Audit log will keep entries for ${parsed.value} day${parsed.value === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      setValidationError(message);
      toast({
        title: "Could not save settings",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6" data-testid="card-audit-retention-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand-navy" />
          Audit log retention
        </CardTitle>
        <CardDescription className="mt-1">
          Set how many days of admin audit history to keep before the daily
          sweeper deletes older entries. Shorten it for noisy environments;
          extend it during an investigation. Leave blank to fall back to the
          deploy-time default.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div
            className="flex items-center gap-2 text-sm text-slate-500"
            data-testid="state-admin-settings-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading current settings…
          </div>
        ) : loadError && !data ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-2"
            data-testid="alert-admin-settings-load-error"
          >
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-red-700">
              <div className="font-medium">Could not load admin settings</div>
              <div className="text-red-600">{loadError}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 max-w-xs">
                <Label
                  htmlFor="input-audit-retention-days"
                  className="text-sm font-medium text-slate-900"
                >
                  Retention window (days)
                </Label>
                <Input
                  id="input-audit-retention-days"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  inputMode="numeric"
                  placeholder="Use default"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  disabled={saving}
                  className="mt-1"
                  data-testid="input-audit-retention-days"
                />
              </div>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || draftMatchesStored}
                data-testid="button-save-audit-retention"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>

            {validationError && (
              <div
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2"
                data-testid="text-audit-retention-error"
              >
                <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div
              className="text-xs text-slate-600"
              data-testid="text-audit-retention-effective"
            >
              {stored !== null ? (
                <>
                  Override saved:{" "}
                  <span className="font-medium tabular-nums">{stored}</span>{" "}
                  day{stored === 1 ? "" : "s"}. The next sweep will use this
                  value.
                </>
              ) : effective !== null ? (
                <>
                  No override stored. The scheduler is currently using{" "}
                  <span className="font-medium tabular-nums">{effective}</span>{" "}
                  day{effective === 1 ? "" : "s"} (from
                  {" ADMIN_AUDIT_RETENTION_DAYS"} or the built-in default).
                </>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RecentAdminActivityProps {
  entries: AdminAuditEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  filters: AuditFilters;
  offset: number;
  pageSize: number;
  onChangeFilters: (next: Partial<AuditFilters>) => void;
  onResetFilters: () => void;
  onChangeOffset: (next: number) => void;
  onRefresh: () => void;
  // Export of the currently-filtered slice. The CSV/Excel buttons next
  // to Refresh trigger `onExport(format)`; `exporting` is the format
  // currently in flight (or null) so the spinner only spins on the
  // pressed button and a second download can't be queued mid-flight.
  onExport: (format: "csv" | "xlsx") => void;
  exporting: null | "csv" | "xlsx";
  cleanup: AuditCleanupStatus | null;
  cleanupLoading: boolean;
  cleanupError: string | null;
}

/**
 * "Recent admin activity" panel: filtered, paginated view of the admin
 * audit trail. By default shows the most recent page of activity; the
 * operator can narrow by action, status, date range, or actor-IP substring
 * and page through the matching results. Filters are managed by the parent
 * so a backfill-triggered refresh re-fetches the current slice instead of
 * resetting back to "most recent 25".
 */
export function RecentAdminActivity({
  entries,
  total,
  loading,
  error,
  filters,
  offset,
  pageSize,
  onChangeFilters,
  onResetFilters,
  onChangeOffset,
  onRefresh,
  onExport,
  exporting,
  cleanup,
  cleanupLoading,
  cleanupError,
}: RecentAdminActivityProps) {
  // Local mirror of the IP filter so we can debounce keystrokes — without
  // this, every typed character would fire a fresh /api/admin/audit-log
  // request. The committed value is pushed to the parent (and thus to the
  // server) 300ms after the operator stops typing.
  const [ipDraft, setIpDraft] = useState(filters.ip);
  useEffect(() => {
    // Keep the draft in sync if the parent resets filters externally
    // (e.g. via the "Clear" button).
    setIpDraft(filters.ip);
  }, [filters.ip]);
  useEffect(() => {
    if (ipDraft === filters.ip) return;
    const handle = window.setTimeout(() => {
      onChangeFilters({ ip: ipDraft });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [ipDraft, filters.ip, onChangeFilters]);

  const hasActiveFilter =
    (filters.action && filters.action !== "all") ||
    (filters.status && filters.status !== "all") ||
    Boolean(filters.since) ||
    Boolean(filters.until) ||
    Boolean(filters.ip.trim());

  // Page boundaries for the Prev/Next controls. We compute against `total`
  // rather than the page size so the operator can't page past the end of
  // the filtered set even if the last page is short.
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + entries.length, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

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
              who triggered what, from where, and when. Use the filters to
              investigate "who overwrote report X two weeks ago?" or to spot
              brute-force attempts on the admin password.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExport("csv")}
              disabled={exporting !== null || total === 0}
              title={
                total === 0
                  ? "No rows match the current filters"
                  : "Download every row matching the current filters as CSV"
              }
              data-testid="button-download-audit-csv"
            >
              {exporting === "csv" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Download CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExport("xlsx")}
              disabled={exporting !== null || total === 0}
              title={
                total === 0
                  ? "No rows match the current filters"
                  : "Download every row matching the current filters as an Excel workbook (real datetime + numeric cells, structured outcome on its own sheet)"
              }
              data-testid="button-download-audit-xlsx"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Download Excel
            </Button>
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
        </div>
      </CardHeader>
      <CardContent>
        <AuditCleanupBanner
          cleanup={cleanup}
          loading={cleanupLoading}
          error={cleanupError}
        />
        <div
          className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3"
          data-testid="audit-filters"
        >
          <div className="flex items-center gap-2 mb-3 text-xs font-medium text-slate-600 uppercase tracking-wide">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label
                htmlFor="audit-filter-action"
                className="text-xs text-slate-600"
              >
                Action
              </Label>
              <Select
                value={filters.action}
                onValueChange={(v) => onChangeFilters({ action: v })}
              >
                <SelectTrigger
                  id="audit-filter-action"
                  className="mt-1 h-9"
                  data-testid="select-audit-action"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label
                htmlFor="audit-filter-status"
                className="text-xs text-slate-600"
              >
                Status
              </Label>
              <Select
                value={filters.status}
                onValueChange={(v) => onChangeFilters({ status: v })}
              >
                <SelectTrigger
                  id="audit-filter-status"
                  className="mt-1 h-9"
                  data-testid="select-audit-status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label
                htmlFor="audit-filter-since"
                className="text-xs text-slate-600"
              >
                From
              </Label>
              <Input
                id="audit-filter-since"
                type="date"
                value={filters.since}
                max={filters.until || undefined}
                onChange={(e) => onChangeFilters({ since: e.target.value })}
                className="mt-1 h-9"
                data-testid="input-audit-since"
              />
            </div>
            <div>
              <Label
                htmlFor="audit-filter-until"
                className="text-xs text-slate-600"
              >
                To
              </Label>
              <Input
                id="audit-filter-until"
                type="date"
                value={filters.until}
                min={filters.since || undefined}
                onChange={(e) => onChangeFilters({ until: e.target.value })}
                className="mt-1 h-9"
                data-testid="input-audit-until"
              />
            </div>
            <div>
              <Label
                htmlFor="audit-filter-ip"
                className="text-xs text-slate-600"
              >
                Actor IP contains
              </Label>
              <Input
                id="audit-filter-ip"
                type="text"
                value={ipDraft}
                onChange={(e) => setIpDraft(e.target.value)}
                placeholder="e.g. 10.0."
                className="mt-1 h-9"
                data-testid="input-audit-ip"
              />
            </div>
          </div>
          {hasActiveFilter && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetFilters}
                data-testid="button-clear-audit-filters"
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

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
            {hasActiveFilter
              ? "No activity matches the current filters."
              : "No admin activity recorded yet. Run an action above to populate the trail."}
          </div>
        ) : (
          <>
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
            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <div data-testid="text-audit-range">
                Showing{" "}
                <span className="font-medium tabular-nums">
                  {rangeStart}–{rangeEnd}
                </span>{" "}
                of{" "}
                <span className="font-medium tabular-nums">{total}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChangeOffset(Math.max(0, offset - pageSize))
                  }
                  disabled={!canPrev || loading}
                  data-testid="button-audit-prev"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onChangeOffset(offset + pageSize)}
                  disabled={!canNext || loading}
                  data-testid="button-audit-next"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </>
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
