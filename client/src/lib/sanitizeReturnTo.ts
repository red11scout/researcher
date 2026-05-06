// Sanitize a `returnTo` query-string value to a same-origin relative path.
//
// Defends against an open-redirect on the login bounce: any value that
// doesn't start with a single "/" — including absolute URLs
// ("https://evil.com"), protocol-relative URLs ("//evil.com"), and
// backslash-prefixed variants browsers sometimes normalize ("/\evil.com") —
// collapses to "/". Without this, an attacker could hand a victim a
// /login?returnTo=https://evil.com link and steal the post-login navigation.
//
// Lives in `client/src/lib/` (not in Login.tsx) so the page file can stay a
// "components only" module — mixing this kind of pure helper with a default
// component export breaks Vite + react-refresh Fast Refresh, see
// `client/src/components/admin/constants.ts` for the same pattern.
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (raw[0] !== "/") return "/";
  if (raw[1] === "/" || raw[1] === "\\") return "/";
  return raw;
}
