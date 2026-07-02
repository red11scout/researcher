import { test, expect, request } from "@playwright/test";

// End-to-end coverage for the truncation branch of the admin audit-log
// CSV download (project task #89). The happy-path "CSV downloaded" toast
// is already covered by `admin-audit-csv-export.spec.ts` (task #60).
//
// The truncation branch fires only when the storage layer reports that
// the filter slice exceeded `AUDIT_EXPORT_MAX_ROWS` (10,000). Seeding
// >10k real audit rows just to flip a header bit would leave a large
// data footprint in the dev database and slow the suite down. Instead
// we drive the *real* UI flow (login → admin → click Download CSV) and
// intercept the export response with `page.route` so the browser sees a
// synthetic CSV with `X-Audit-Export-Truncated: 1`. This exercises the
// exact `exportAuditLog` handler branch in `client/src/pages/Admin.tsx`
// — header parse, toast variant, toast copy — without touching the DB.

const APP_PASSWORD = process.env.APP_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const FAKE_ROWS = "10000";
const FAKE_TOTAL = "12345";

test.describe("Admin audit-log CSV download truncation toast (task #89)", () => {
  test.skip(
    !APP_PASSWORD || !ADMIN_PASSWORD,
    "APP_PASSWORD / ADMIN_PASSWORD must be set to run the admin e2e flow",
  );

  test("shows the destructive 'CSV download truncated' toast when X-Audit-Export-Truncated=1", async ({
    page,
    baseURL,
  }) => {
    // 1. Authenticate via the public auth API so the browser starts
    //    already past gate + admin elevation, mirroring the sibling
    //    happy-path spec.
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

    // 2. Intercept the CSV export endpoint *before* navigating so the
    //    very first download attempt sees the synthetic truncation
    //    response. The real audit-log read endpoint stays untouched so
    //    the UI still hydrates a real total (and enables the button).
    await page.route("**/api/admin/audit-log/export*", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="admin-audit-truncated.csv"',
          "X-Audit-Export-Total": FAKE_TOTAL,
          "X-Audit-Export-Rows": FAKE_ROWS,
          "X-Audit-Export-Truncated": "1",
        },
        body:
          "when,action,status,statusCode,actorIp,path,errorMessage,outcome\n",
      });
    });

    // 3. Land on the admin page already authenticated.
    await page.goto("/admin");
    await expect(page.getByTestId("text-admin-title")).toBeVisible();

    // 4. The Download CSV button is enabled once the filtered audit-log
    //    query returns a non-zero total — our admin-login above wrote
    //    one. No filters needed; the route mock fires regardless of the
    //    query string the UI sends.
    const downloadBtn = page.getByTestId("button-download-audit-csv");
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    // 5. Click and capture the synthesized download so Playwright
    //    cleans up the temp file rather than leaving the page
    //    suspended on the anchor click.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);
    expect(download.suggestedFilename()).toBe("admin-audit-truncated.csv");

    // 6. Assert the destructive toast renders with the exact title +
    //    description from `exportAuditLog`'s truncation branch. The
    //    `destructive` variant adds a `destructive` class to the toast
    //    root (see `toastVariants` in `client/src/components/ui/toast.tsx`),
    //    which we use to lock the variant in place — a regression that
    //    silently swapped the toast to the default variant would still
    //    pass a text-only assertion, so we check both.
    const toastTitle = page.getByText("CSV download truncated", {
      exact: true,
    });
    await expect(toastTitle).toBeVisible();
    await expect(
      page.getByText(
        `Exported the first ${FAKE_ROWS} of ${FAKE_TOTAL} matching rows. Narrow the filters to capture more.`,
        { exact: true },
      ),
    ).toBeVisible();

    const toastRoot = page
      .locator(".destructive")
      .filter({ hasText: "CSV download truncated" })
      .first();
    await expect(toastRoot).toBeVisible();
  });
});
