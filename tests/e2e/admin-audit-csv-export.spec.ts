import { test, expect, request } from "@playwright/test";
import { readFile } from "node:fs/promises";

// End-to-end verification of the admin audit-log "Download CSV" flow
// (project task #60). Drives a real browser against the running dev
// server: logs in via the gate password, elevates to admin, applies
// action + status filters in the UI, clicks Download CSV, captures the
// browser download, and asserts the filename pattern + the CSV header
// row in the actual downloaded file on disk.

const APP_PASSWORD = process.env.APP_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const EXPECTED_HEADER =
  "when,action,status,statusCode,actorIp,path,errorMessage,outcome";

test.describe("Admin audit-log CSV download (task #60)", () => {
  test.skip(
    !APP_PASSWORD || !ADMIN_PASSWORD,
    "APP_PASSWORD / ADMIN_PASSWORD must be set to run the admin e2e flow",
  );

  test("downloads a filter-tagged CSV with the canonical header row", async ({
    page,
    baseURL,
  }) => {
    // 1. Authenticate via the public auth API so the browser starts the
    //    UI flow already past both the gate and admin elevation. This
    //    keeps the test focused on the download itself rather than on
    //    the password form, while still exercising the same session
    //    cookies the UI uses.
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

    // 3. Apply Action + Status filters via the real Radix Select
    //    components.
    await page.getByTestId("select-audit-action").click();
    await page.getByRole("option", { name: "Admin login", exact: true }).click();

    await page.getByTestId("select-audit-status").click();
    await page.getByRole("option", { name: "Success", exact: true }).click();

    // 4. The Download CSV button is only enabled once the filtered
    //    audit-log query returns a non-zero total. Our own
    //    /api/auth/admin-login call above wrote an admin-login/success
    //    row, so this is a hard assertion — flipping it to a skip
    //    would let real wiring regressions slip through silently.
    const downloadBtn = page.getByTestId("button-download-audit-csv");
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    // 5. Click the button and capture the resulting browser download.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);

    // 6. Filename must match the server's deterministic pattern and
    //    encode the active filters as tags. See `buildAuditExportFilename`
    //    in server/routes.ts for the contract.
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(
      /^admin-audit-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-action_admin-login-status_success\.csv$/,
    );

    // 7. Read the actual saved file off disk and assert the canonical
    //    header row is the first line.
    const path = await download.path();
    expect(path, "playwright should save the download to disk").toBeTruthy();
    const body = await readFile(path!, "utf8");
    const firstLine = body.split(/\r?\n/, 1)[0];
    expect(firstLine).toBe(EXPECTED_HEADER);
  });
});
