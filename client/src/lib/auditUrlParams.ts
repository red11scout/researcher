// Helpers for syncing the "Recent admin activity" filter + paging state with
// the URL query string so a filtered view is shareable and survives a refresh
// or browser back/forward navigation.
//
// The shape mirrors `AuditFilters` in `client/src/pages/Admin.tsx` — keep them
// in sync. The URL form is intentionally human-readable (e.g. raw YYYY-MM-DD
// for date pickers, the lowercase action code) so a link can be eyeballed and
// edited by hand if needed.

export interface AuditFilters {
  action: string;
  status: string;
  since: string;
  until: string;
  ip: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  action: "all",
  status: "all",
  since: "",
  until: "",
  ip: "",
};

export interface AuditUrlState {
  filters: AuditFilters;
  offset: number;
}

// `<input type="date">` produces YYYY-MM-DD strings; only accept that exact
// format from the URL too so a malformed/legacy ISO string doesn't quietly
// poison the date picker.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditUrlParams(search: string): AuditUrlState {
  const sp = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const filters: AuditFilters = { ...EMPTY_AUDIT_FILTERS };

  const action = sp.get("action");
  if (action) filters.action = action;
  const status = sp.get("status");
  if (status) filters.status = status;
  const since = sp.get("since");
  if (since && DATE_RE.test(since)) filters.since = since;
  const until = sp.get("until");
  if (until && DATE_RE.test(until)) filters.until = until;
  const ip = sp.get("ip");
  if (ip) filters.ip = ip;

  let offset = 0;
  const offsetStr = sp.get("offset");
  if (offsetStr) {
    const n = Number(offsetStr);
    if (Number.isFinite(n) && n >= 0) offset = Math.floor(n);
  }

  return { filters, offset };
}

// Build the canonical URLSearchParams for a filter+offset state. Empty /
// "all" / 0 values are omitted so a default view yields a clean `/admin` URL
// (no `?action=all&offset=0` noise to share).
export function buildAuditUrlParams(
  filters: AuditFilters,
  offset: number,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.action && filters.action !== "all") {
    sp.set("action", filters.action);
  }
  if (filters.status && filters.status !== "all") {
    sp.set("status", filters.status);
  }
  if (filters.since) sp.set("since", filters.since);
  if (filters.until) sp.set("until", filters.until);
  if (filters.ip.trim()) sp.set("ip", filters.ip.trim());
  if (offset > 0) sp.set("offset", String(offset));
  return sp;
}

// Convenience: the trailing `?…` (or empty string) suitable for appending to
// a path like `/admin`. Stable ordering comes from `buildAuditUrlParams`.
export function buildAuditSearchString(
  filters: AuditFilters,
  offset: number,
): string {
  const sp = buildAuditUrlParams(filters, offset);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
