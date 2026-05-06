import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "../client/src/lib/sanitizeReturnTo";

// Locks in the open-redirect protections on /login?returnTo=… — the only
// thing standing between a victim clicking an attacker-supplied login link
// and being bounced to attacker.com after authenticating.
describe("sanitizeReturnTo", () => {
  it("passes through normal same-origin paths", () => {
    expect(sanitizeReturnTo("/")).toBe("/");
    expect(sanitizeReturnTo("/dashboard/abc-123")).toBe("/dashboard/abc-123");
    expect(sanitizeReturnTo("/admin?tab=audit&offset=25")).toBe(
      "/admin?tab=audit&offset=25",
    );
    expect(sanitizeReturnTo("/reports/r-1#section")).toBe(
      "/reports/r-1#section",
    );
  });

  it("collapses absolute URLs to '/'", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBe("/");
    expect(sanitizeReturnTo("http://evil.com/dashboard")).toBe("/");
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/");
    expect(sanitizeReturnTo("data:text/html,<script>alert(1)</script>")).toBe(
      "/",
    );
  });

  it("collapses protocol-relative URLs to '/'", () => {
    // Browsers resolve `//evil.com` against the current scheme — silently
    // becomes https://evil.com.
    expect(sanitizeReturnTo("//evil.com")).toBe("/");
    expect(sanitizeReturnTo("//evil.com/whatever")).toBe("/");
  });

  it("collapses backslash-tricks to '/'", () => {
    // Some browsers normalize backslashes to forward slashes during URL
    // parsing, turning `/\evil.com` into `//evil.com` (protocol-relative).
    expect(sanitizeReturnTo("/\\evil.com")).toBe("/");
    expect(sanitizeReturnTo("/\\\\evil.com")).toBe("/");
  });

  it("collapses paths that don't start with '/'", () => {
    expect(sanitizeReturnTo("dashboard")).toBe("/");
    expect(sanitizeReturnTo("evil.com")).toBe("/");
    expect(sanitizeReturnTo("\\evil.com")).toBe("/");
  });

  it("treats empty/null/undefined as '/'", () => {
    expect(sanitizeReturnTo("")).toBe("/");
    expect(sanitizeReturnTo(null)).toBe("/");
    expect(sanitizeReturnTo(undefined)).toBe("/");
  });
});
