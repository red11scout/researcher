import { test, expect, request } from "@playwright/test";

// End-to-end verification of the *failure* branch of `exportAuditLog`
// in client/src/pages/Admin.tsx (project task #90). Sibling to
// `admin-audit-csv-export.spec.ts`, which covers the happy path.
//
// The third branch in `exportAuditLog` runs when the CSV endpoint
// returns a non-OK response: it parses the JSON error body and shows a
// destructive "CSV download failed" toast carrying the server-provided
// message. If a future change to the route's pre-stream error handling
// stops returning JSON (e.g. switches to plain text or HTML), the
// description would silently degrade to "[object Blob]" or a bare
// status string — and nothing in the suite would catch it.
//
// To force the failure deterministically (without relying on flaky
// network conditions or a contrived backend invariant), we intercept
// the export request in the browser via `page.route` and reply with
// the same `{ error: string }` shape the real route emits from its
// `if (!res.headersSent)` branch. That keeps the test focused on the
// UI contract: "server returns 500 + JSON error → destructive toast
// with the server's message in the description".

const APP_PASSWORD = process.env.APP_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const FORCED_ERROR_MESSAGE =
  "Forced export failure for task #90 e2e coverage";

test.describe("Admin audit-log CSV download failure toast (task #90)", () => {
  test.skip(
    !APP_PASSWORD || !ADMIN_PASSWORD,
    "APP_PASSWORD / ADMIN_PASSWORD must be set to run the admin e2e flow",
  );

  test("shows a destructive toast with the server's error message when the CSV endpoint fails", async ({
    page,
    baseURL,
  }) => {
    // 1. Authenticate via the public auth API so the browser starts
    //    the UI flow already past the gate + admin elevation. Same
    //    setup pattern as admin-audit-csv-export.spec.ts.
    const api = await request.newContext({ baseURL });
    const gate = await api.post("/api/auth/login", {
      data: { password: APP_PASSWORD },
    });
    expect(gate.ok(), `gate login failed: ${gate.status()}`).toBeTruthy();
    const elevate = await api.post("/api/auth/admin-login", {
      data: { password: ADMIN_PASSWORD },
    });
    expect(
      elevate.ok(),
      `admin elevation failed: ${elevate.status()}`,
    ).toBeTruthy();
    const cookies = (await api.storageState()).cookies;
    await page.context().addCookies(cookies);

    // 2. Land on the admin page already authenticated.
    await page.goto("/admin");
    await expect(page.getByTestId("text-admin-title")).toBeVisible();

    // 3. Apply the same Action + Status filters the happy-path test
    //    uses so the Download CSV button enables (it requires the
    //    filtered audit query to return >0 rows). The /api/auth/admin-login
    //    call above wrote an admin-login/success row that satisfies it.
    await page.getByTestId("select-audit-action").click();
    await page
      .getByRole("option", { name: "Admin login", exact: true })
      .click();

    await page.getByTestId("select-audit-status").click();
    await page.getByRole("option", { name: "Success", exact: true }).click();

    const downloadBtn = page.getByTestId("button-download-audit-csv");
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    // 4. Intercept the CSV export request in the browser and force it
    //    to fail with the same 500 + JSON error shape the real route
    //    emits from its pre-stream error branch. Match the path
    //    prefix only (the UI appends a query string of active filters).
    await page.route("**/api/admin/audit-log/export?**", (route) => {
      void route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: FORCED_ERROR_MESSAGE }),
      });
    });

    // 5. Click Download CSV. We intentionally do NOT
    //    `waitForEvent("download")` here — the failure branch never
    //    triggers a browser download, so waiting for one would just
    //    time out and mask the toast assertion below.
    await downloadBtn.click();

    // 6. The destructive toast must surface with the canonical title
    //    AND the server's `error` string as the description. Asserting
    //    both pieces is what locks in the contract: if a future change
    //    swallows the JSON parse (so description falls back to
    //    "500: Internal Server Error") or stops setting `variant:
    //    "destructive"`, this assertion will fail.
    const toast = page.getByRole("status").filter({
      hasText: "CSV download failed",
    });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(FORCED_ERROR_MESSAGE);

    // The destructive variant is the visual cue operators rely on to
    // distinguish a real failure from a neutral info toast. The cva
    // definition in client/src/components/ui/toast.tsx applies the
    // literal class `destructive` (plus `border-destructive`,
    // `bg-destructive`, `text-destructive-foreground`) only on this
    // variant, so a regression that flipped the call to the default
    // variant would drop the class entirely. Assert against the
    // `destructive` token directly so a Tailwind utility rename can't
    // accidentally pass.
    await expect(toast).toHaveClass(/(^|\s)destructive(\s|$)/);

    // 7. The button must re-enable after the failed export so the
    //    operator can retry — `setAuditExporting(null)` runs in the
    //    `finally` block. A regression that left it stuck disabled
    //    would trap them in a dead-end.
    await expect(downloadBtn).toBeEnabled();
  });
});
