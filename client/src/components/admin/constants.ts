// Non-component admin constants. Kept in their own module so the parent
// `pages/Admin.tsx` file stays a "components only" module — mixing constant
// exports with component exports breaks Vite + react-refresh Fast Refresh
// (the dev server has to do a full reload on every Admin.tsx edit).

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
  { value: "update-admin-settings", label: "Update admin settings" },
  { value: "clear-last-backfill", label: "Clear last run" },
];
