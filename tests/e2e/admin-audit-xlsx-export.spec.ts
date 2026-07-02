import { test, expect, request } from "@playwright/test";
import { readFile } from "node:fs/promises";

// End-to-end verification of the admin audit-log "Download Excel" flow
// (project task #88). Sibling of admin-audit-csv-export.spec.ts (#60):
// drives a real browser against the running dev server, logs in via
// the gate password + admin elevation, applies action + status filters
// in the UI, clicks Download Excel, captures the browser download, and
// asserts the filename pattern + that the saved file actually opens as
// a valid .xlsx workbook with the canonical first-sheet header row.

const APP_PASSWORD = process.env.APP_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const EXPECTED_HEADER_ROW = [
  "id",
  "when",
  "action",
  "status",
  "statusCode",
  "actorIp",
  "path",
  "errorMessage",
  "outcome",
];

test.describe("Admin audit-log Excel download (task #88)", () => {
  test.skip(
    !APP_PASSWORD || !ADMIN_PASSWORD,
    "APP_PASSWORD / ADMIN_PASSWORD must be set to run the admin e2e flow",
  );

  test("downloads a filter-tagged .xlsx workbook with the canonical header row", async ({
    page,
    baseURL,
  }) => {
    // 1. Authenticate via the public auth API so the browser starts
    //    the UI flow already past both the gate and admin elevation.
    //    This mirrors the CSV e2e test and keeps the focus on the
    //    download wiring rather than the password form.
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

    // 4. The Download Excel button is only enabled once the filtered
    //    audit-log query returns a non-zero total. Our own
    //    /api/auth/admin-login call above wrote an admin-login/success
    //    row, so this is a hard assertion — flipping it to a skip
    //    would let real wiring regressions slip through silently.
    const downloadBtn = page.getByTestId("button-download-audit-xlsx");
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
      /^admin-audit-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-action_admin-login-status_success\.xlsx$/,
    );

    // 7. Read the actual saved file off disk. .xlsx files are zip
    //    archives — the first two bytes must be the local-file header
    //    signature "PK". A renamed CSV would never start with 0x50 0x4B.
    const path = await download.path();
    expect(path, "playwright should save the download to disk").toBeTruthy();
    const body = await readFile(path!);
    expect(body.length).toBeGreaterThan(100);
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);

    // 8. Open the workbook with the same library the server uses to
    //    write it and assert the first sheet ("Audit Log") starts with
    //    the canonical header row. This catches any drift between the
    //    server's column contract and what actually lands on disk.
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    const main = wb.getWorksheet("Audit Log");
    expect(main, 'workbook should contain an "Audit Log" sheet').toBeTruthy();
    const headerRow = main!.getRow(1);
    const headerValues = (headerRow.values as Array<unknown>)
      .slice(1) // exceljs row.values is 1-indexed; index 0 is always undefined
      .map((v) => (v == null ? "" : String(v)));
    expect(headerValues).toEqual(EXPECTED_HEADER_ROW);
  });
});
