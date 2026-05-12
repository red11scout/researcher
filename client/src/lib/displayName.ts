export { resolveDisplayName } from "@shared/schema";

import { resolveDisplayName as _resolve } from "@shared/schema";

export function resolveReportDisplayName(
  source:
    | {
        displayName?: string | null;
        companyName?: string | null;
        data?: { displayName?: string | null; companyName?: string | null } | null;
      }
    | null
    | undefined,
  fallback?: string,
): string {
  if (!source) return fallback ?? "";
  const fromTop = _resolve({
    displayName: source.displayName ?? source.data?.displayName ?? null,
    companyName: source.companyName ?? source.data?.companyName ?? null,
  });
  if (fromTop) return fromTop;
  return fallback ?? "";
}
