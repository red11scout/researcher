// tests/admin-audit-log.test.ts
//
// Coverage for the admin audit-log read path added in task #29:
// `DatabaseStorage.getRecentAdminAuditEntries` (filters + pagination +
// total count) and the `/api/admin/audit-log` HTTP handler that parses
// query-string parameters into the storage call.
//
// Two layers are exercised:
//
//   1. Storage filtering — `DatabaseStorage.getRecentAdminAuditEntries`
//      against an in-memory `@db` shim plus a tag-based mock of the
//      drizzle operator helpers (`eq`, `and`, `gte`, `lte`, `ilike`,
//      `desc`). Each filter is exercised in isolation, then in
//      combination, then we cover pagination (limit + offset), the
//      `total` count under filters, and the documented edge cases
//      (invalid status silently ignored, IP substring case-insensitive,
//      since/until inclusive bounds, limit clamped to [1, 200]).
//
//   2. HTTP route — `GET /api/admin/audit-log`. The real
//      `registerRoutes` is mounted via the same pattern as
//      tests/last-backfill-persistence.test.ts so a regression in the
//      handler's query-string parsing (e.g. forwarding NaN as a limit,
//      crashing on bad dates, dropping the IP filter) fails this
//      suite. The storage singleton is replaced with a spy that
//      records the parsed `AdminAuditLogQuery` object so we can assert
//      exactly what shape the route produced.

import express from "express";
import { createServer } from "http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminAuditLog } from "../shared/schema";
import type {
  AdminAuditLogEntry,
  InsertAdminAuditLog,
} from "../shared/schema";

// ---------------------------------------------------------------------------
// Tag-based mock of the drizzle operator helpers used by
// `getRecentAdminAuditEntries`. Each helper returns a plain JS object
// describing what it wants; the `@db` mock below interprets them.
//
// We keep the rest of `drizzle-orm` real (via `vi.importActual`) so any
// other storage method that happens to load alongside (and pulls `sql`,
// `like`, `isNull`, `lt`, etc.) keeps its real behaviour. Only the
// operators actually used by the audit-log query are intercepted.
// ---------------------------------------------------------------------------
type Cond =
  | { kind: "eq"; column: unknown; value: unknown }
  | { kind: "gte"; column: unknown; value: unknown }
  | { kind: "lte"; column: unknown; value: unknown }
  | { kind: "ilike"; column: unknown; value: string }
  | { kind: "and"; items: Cond[] };

type OrderBy = { kind: "desc"; column: unknown };

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return {
    ...actual,
    eq: (column: unknown, value: unknown): Cond => ({
      kind: "eq",
      column,
      value,
    }),
    gte: (column: unknown, value: unknown): Cond => ({
      kind: "gte",
      column,
      value,
    }),
    lte: (column: unknown, value: unknown): Cond => ({
      kind: "lte",
      column,
      value,
    }),
    ilike: (column: unknown, value: string): Cond => ({
      kind: "ilike",
      column,
      value,
    }),
    and: (...items: Cond[]): Cond => ({ kind: "and", items }),
    desc: (column: unknown): OrderBy => ({ kind: "desc", column }),
  };
});

// ---------------------------------------------------------------------------
// In-memory `@db` shim. Maintains a list of audit-log rows and
// implements just enough of drizzle's chained query builder to
// service `createAdminAuditEntry` and `getRecentAdminAuditEntries`:
//
//   db.insert(table).values(v).returning()
//   db.select().from(table).orderBy(desc(...)).limit(n).offset(m).where(c)
//   db.select({ count: ... }).from(table).where(c)
//
// `select()` (no projection) yields the page-of-rows shape; `select({...})`
// yields the count-row shape `[{ count: <number> }]`.
//
// `where(...)` is optional — `getRecentAdminAuditEntries` skips it entirely
// when the caller supplied no filters, so the chain itself must already be
// thenable before `.where(...)` is appended.
// ---------------------------------------------------------------------------
type StoredRow = AdminAuditLogEntry;
const dbState: { entries: StoredRow[] } = { entries: [] };

function getColumnValue(column: unknown, row: StoredRow): unknown {
  if (column === adminAuditLog.action) return row.action;
  if (column === adminAuditLog.status) return row.status;
  if (column === adminAuditLog.statusCode) return row.statusCode;
  if (column === adminAuditLog.actorIp) return row.actorIp;
  if (column === adminAuditLog.actorUserAgent) return row.actorUserAgent;
  if (column === adminAuditLog.path) return row.path;
  if (column === adminAuditLog.createdAt) return row.createdAt;
  return undefined;
}

function evaluateCondition(cond: Cond | null | undefined, row: StoredRow): boolean {
  if (!cond) return true;
  switch (cond.kind) {
    case "and":
      return cond.items.every((c) => evaluateCondition(c, row));
    case "eq":
      return getColumnValue(cond.column, row) === cond.value;
    case "gte": {
      const v = getColumnValue(cond.column, row);
      if (v instanceof Date && cond.value instanceof Date) {
        return v.getTime() >= cond.value.getTime();
      }
      return (v as number) >= (cond.value as number);
    }
    case "lte": {
      const v = getColumnValue(cond.column, row);
      if (v instanceof Date && cond.value instanceof Date) {
        return v.getTime() <= cond.value.getTime();
      }
      return (v as number) <= (cond.value as number);
    }
    case "ilike": {
      const v = getColumnValue(cond.column, row);
      if (typeof v !== "string") return false;
      // Storage only ever passes `%${trimmed}%`; drop the surrounding
      // wildcards and substring-match case-insensitively.
      const needle = cond.value.replace(/^%/, "").replace(/%$/, "").toLowerCase();
      return v.toLowerCase().includes(needle);
    }
    default:
      return false;
  }
}

interface PageBuilder extends PromiseLike<StoredRow[]> {
  from(t: unknown): PageBuilder;
  orderBy(o: OrderBy): PageBuilder;
  limit(n: number): PageBuilder;
  offset(n: number): PageBuilder;
  where(c: Cond): PageBuilder;
}
interface CountBuilder extends PromiseLike<Array<{ count: number }>> {
  from(t: unknown): CountBuilder;
  where(c: Cond): CountBuilder;
}

function makePageBuilder(): PageBuilder {
  const state: {
    order: OrderBy | null;
    limit: number | null;
    offset: number;
    where: Cond | null;
  } = { order: null, limit: null, offset: 0, where: null };
  const resolveRows = (): StoredRow[] => {
    let rows = dbState.entries.filter((r) => evaluateCondition(state.where, r));
    if (state.order && state.order.kind === "desc") {
      rows = [...rows].sort((a, b) => {
        const av = getColumnValue(state.order!.column, a);
        const bv = getColumnValue(state.order!.column, b);
        const an = av instanceof Date ? av.getTime() : (av as number);
        const bn = bv instanceof Date ? bv.getTime() : (bv as number);
        return bn - an;
      });
    }
    const start = state.offset;
    const end = state.limit !== null ? start + state.limit : undefined;
    return rows.slice(start, end);
  };
  const builder: PageBuilder = {
    from() {
      return builder;
    },
    orderBy(o) {
      state.order = o;
      return builder;
    },
    limit(n) {
      state.limit = n;
      return builder;
    },
    offset(n) {
      state.offset = n;
      return builder;
    },
    where(c) {
      state.where = c;
      return builder;
    },
    then(resolve, reject) {
      try {
        return Promise.resolve(resolveRows()).then(resolve, reject);
      } catch (e) {
        if (reject) return Promise.reject(e).then(undefined, reject);
        throw e;
      }
    },
  };
  return builder;
}

function makeCountBuilder(): CountBuilder {
  const state: { where: Cond | null } = { where: null };
  const resolveCount = () => {
    const n = dbState.entries.filter((r) =>
      evaluateCondition(state.where, r),
    ).length;
    return [{ count: n }];
  };
  const builder: CountBuilder = {
    from() {
      return builder;
    },
    where(c) {
      state.where = c;
      return builder;
    },
    then(resolve, reject) {
      try {
        return Promise.resolve(resolveCount()).then(resolve, reject);
      } catch (e) {
        if (reject) return Promise.reject(e).then(undefined, reject);
        throw e;
      }
    },
  };
  return builder;
}

vi.mock("@db", () => {
  let nextId = 1;
  const db = {
    insert: (_table: unknown) => ({
      values: (val: InsertAdminAuditLog) => ({
        returning: async (): Promise<StoredRow[]> => {
          const row: StoredRow = {
            id: `audit-${nextId++}`,
            action: val.action,
            status: val.status,
            statusCode: val.statusCode ?? null,
            actorIp: val.actorIp ?? null,
            actorUserAgent: val.actorUserAgent ?? null,
            path: val.path ?? null,
            params: (val.params as unknown) ?? null,
            outcome: (val.outcome as unknown) ?? null,
            errorMessage: val.errorMessage ?? null,
            createdAt: new Date(),
          };
          dbState.entries.push(row);
          return [row];
        },
      }),
    }),
    select: (proj?: unknown): PageBuilder | CountBuilder => {
      if (proj === undefined) return makePageBuilder();
      return makeCountBuilder();
    },
  };
  return { db };
});

// ---------------------------------------------------------------------------
// Server-side dependencies that `server/routes.ts` pulls in at module
// load. We stub them out so the route module can be imported without
// standing up Anthropic, Dub, ExcelJS, multer's PDF parser, or the
// formula engine. None of these are exercised by the audit-log handler.
// ---------------------------------------------------------------------------
vi.mock("../server/ai-service", () => ({
  generateCompanyAnalysis: vi.fn(),
  generateWhatIfSuggestion: vi.fn(),
  checkProductionConfig: vi.fn(() => ({ ok: true, message: "ok" })),
  executePipelineCall: vi.fn(),
}));
vi.mock("../server/formula-service", () => ({
  validateFormula: vi.fn(),
  evaluateFormula: vi.fn(),
  previewFormula: vi.fn(),
  getInputsByCategory: vi.fn(() => ({})),
  AVAILABLE_INPUTS: {},
}));
vi.mock("../server/dub-service", () => ({ dubService: {} }));
vi.mock("../server/assumption-export", () => ({
  buildAssumptionExcelWorkbook: vi.fn(),
  buildAssumptionJSON: vi.fn(() => ({})),
}));
// Bypass auth so we can exercise the audit-log handler without standing
// up sessions / passport. `recordAdminAudit` would otherwise try to hit
// our fake storage on every request.
vi.mock("../server/auth", () => ({
  recordAdminAudit: vi.fn(),
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  setupAuth: () => {},
}));

// ---------------------------------------------------------------------------
// Route-layer fake storage. We don't reuse `DatabaseStorage` here because
// the goal of the route tests is to assert exactly what `AdminAuditLogQuery`
// shape the handler hands to `getRecentAdminAuditEntries` for each
// query-string permutation. Recording the call directly is precise and
// avoids re-testing the storage filtering twice.
// ---------------------------------------------------------------------------
type Captured = {
  options: unknown;
};
const routeCalls: Captured[] = [];
let routeReturn: { entries: AdminAuditLogEntry[]; total: number } = {
  entries: [],
  total: 0,
};
// Error injection knob — set to a non-null Error to make the next
// route invocations throw from inside `getRecentAdminAuditEntries`,
// so the real handler's catch branch is exercised end-to-end.
let routeThrow: Error | null = null;

vi.mock("../server/storage", async () => {
  const actual =
    await vi.importActual<typeof import("../server/storage")>(
      "../server/storage",
    );
  return {
    ...actual,
    storage: {
      getRecentAdminAuditEntries: async (options: unknown) => {
        routeCalls.push({ options });
        if (routeThrow) throw routeThrow;
        return routeReturn;
      },
      // Other methods touched by unrelated routes loaded alongside;
      // stubbed so the handler module doesn't trip during registration.
      createAdminAuditEntry: async () => undefined,
      getAllReports: async () => [],
      getLastBackfillSummary: async () => null,
      saveLastBackfillSummary: async () => {},
    },
  };
});

// Imported AFTER mocks above so they take effect.
const { DatabaseStorage } = await import("../server/storage");
const { registerRoutes } = await import("../server/routes");

// ---------------------------------------------------------------------------
// Helpers: seed the in-memory `@db` with a deterministic spread of audit
// rows (different actions, statuses, IPs, timestamps) so each filter has
// at least one matching and one non-matching row to discriminate against.
// ---------------------------------------------------------------------------
async function seed(): Promise<void> {
  const storage = new DatabaseStorage();
  // Insert in chronological order so we can assert ordering later by
  // checking the desc(createdAt) sort ourselves. Each entry sleeps a
  // millisecond in test time? No — we just stamp createdAt explicitly
  // below by manipulating the stored row after insert.
  const rows: Array<Omit<InsertAdminAuditLog, "createdAt"> & { at: Date }> = [
    {
      action: "admin-login",
      status: "success",
      statusCode: 200,
      actorIp: "10.0.0.5",
      actorUserAgent: "Mozilla/5.0",
      path: "/api/auth/admin-login",
      at: new Date("2026-04-01T08:00:00Z"),
    },
    {
      action: "admin-login-failed",
      status: "failure",
      statusCode: 401,
      actorIp: "203.0.113.7",
      actorUserAgent: "curl/8",
      path: "/api/auth/admin-login",
      errorMessage: "Invalid admin password",
      at: new Date("2026-04-02T09:30:00Z"),
    },
    {
      action: "backfill-reports",
      status: "success",
      statusCode: 200,
      actorIp: "10.0.0.5",
      actorUserAgent: "Mozilla/5.0",
      path: "/api/admin/backfill-reports",
      at: new Date("2026-04-03T12:00:00Z"),
    },
    {
      action: "backfill-reports",
      status: "failure",
      statusCode: 500,
      actorIp: "10.0.0.6",
      actorUserAgent: "Mozilla/5.0",
      path: "/api/admin/backfill-reports",
      errorMessage: "boom",
      at: new Date("2026-04-04T15:45:00Z"),
    },
    {
      action: "admin-access-denied",
      status: "failure",
      statusCode: 403,
      actorIp: "2001:db8::1",
      actorUserAgent: "Mozilla/5.0",
      path: "/api/admin/audit-log",
      at: new Date("2026-04-05T18:15:00Z"),
    },
  ];
  for (const r of rows) {
    const { at, ...entry } = r;
    await storage.createAdminAuditEntry(entry as InsertAdminAuditLog);
    // Stamp createdAt deterministically — the in-memory db's default
    // `new Date()` would otherwise smear the rows over a sub-millisecond
    // window and make ordering assertions flaky.
    dbState.entries[dbState.entries.length - 1].createdAt = at;
  }
}

// ===========================================================================
// 1. DatabaseStorage.getRecentAdminAuditEntries — filters + pagination
// ===========================================================================
describe("DatabaseStorage.getRecentAdminAuditEntries — filters", () => {
  beforeEach(async () => {
    dbState.entries = [];
    await seed();
  });

  it("returns the most-recent page (default limit) when no filters are set", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries();
    // 5 seeded rows, default limit 25 — all surface; total matches.
    expect(out.entries).toHaveLength(5);
    expect(out.total).toBe(5);
    // desc(createdAt) ordering: newest first.
    expect(out.entries[0].action).toBe("admin-access-denied");
    expect(out.entries[4].action).toBe("admin-login");
  });

  it("filters by exact action", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      action: "backfill-reports",
    });
    expect(out.entries).toHaveLength(2);
    expect(out.total).toBe(2);
    expect(out.entries.every((e) => e.action === "backfill-reports")).toBe(
      true,
    );
  });

  it("trims whitespace around the action filter", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      action: "  backfill-reports  ",
    });
    expect(out.total).toBe(2);
  });

  it("ignores an empty/whitespace-only action string", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ action: "   " });
    // No constraint added — all rows surface.
    expect(out.total).toBe(5);
  });

  it("filters by status=success", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ status: "success" });
    expect(out.total).toBe(2);
    expect(out.entries.every((e) => e.status === "success")).toBe(true);
  });

  it("filters by status=failure", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ status: "failure" });
    expect(out.total).toBe(3);
    expect(out.entries.every((e) => e.status === "failure")).toBe(true);
  });

  it("silently ignores an unknown status (any value other than success/failure)", async () => {
    const storage = new DatabaseStorage();
    // `pending` is not a recognised status — must NOT add a constraint
    // that would yield zero rows; the filter is simply dropped.
    const out = await storage.getRecentAdminAuditEntries({ status: "pending" });
    expect(out.total).toBe(5);
  });

  it("treats since as an inclusive lower bound on createdAt", async () => {
    const storage = new DatabaseStorage();
    // The 2026-04-03 row sits exactly on the boundary; it must be
    // included. The two rows on 2026-04-01 and 2026-04-02 must not.
    const out = await storage.getRecentAdminAuditEntries({
      since: new Date("2026-04-03T12:00:00Z"),
    });
    expect(out.total).toBe(3);
    const actions = out.entries.map((e) => e.action).sort();
    expect(actions).toEqual(
      ["admin-access-denied", "backfill-reports", "backfill-reports"].sort(),
    );
  });

  it("treats until as an inclusive upper bound on createdAt", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      until: new Date("2026-04-02T09:30:00Z"),
    });
    expect(out.total).toBe(2);
    const actions = out.entries.map((e) => e.action).sort();
    expect(actions).toEqual(["admin-login", "admin-login-failed"]);
  });

  it("ignores invalid since/until Date values", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      since: new Date("not-a-date"),
      until: new Date("also-bogus"),
    });
    // Both bounds are NaN-valued Dates — neither constraint should be
    // added, so the full set surfaces.
    expect(out.total).toBe(5);
  });

  it("filters by IP substring (case-insensitive partial match)", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ ip: "10.0." });
    expect(out.total).toBe(3);
    expect(out.entries.every((e) => e.actorIp?.startsWith("10.0."))).toBe(
      true,
    );
  });

  it("matches IPv6 substrings irrespective of casing", async () => {
    const storage = new DatabaseStorage();
    // Stored value is "2001:db8::1"; query in upper case still matches.
    const out = await storage.getRecentAdminAuditEntries({ ip: "DB8" });
    expect(out.total).toBe(1);
    expect(out.entries[0].actorIp).toBe("2001:db8::1");
  });

  it("trims the IP filter and ignores empty/whitespace values", async () => {
    const storage = new DatabaseStorage();
    const trimmed = await storage.getRecentAdminAuditEntries({
      ip: "  10.0.  ",
    });
    expect(trimmed.total).toBe(3);
    const empty = await storage.getRecentAdminAuditEntries({ ip: "   " });
    expect(empty.total).toBe(5);
  });

  it("combines all filters with AND semantics", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      action: "backfill-reports",
      status: "failure",
      since: new Date("2026-04-04T00:00:00Z"),
      until: new Date("2026-04-05T00:00:00Z"),
      ip: "10.0.0.6",
    });
    expect(out.total).toBe(1);
    expect(out.entries[0].action).toBe("backfill-reports");
    expect(out.entries[0].status).toBe("failure");
    expect(out.entries[0].actorIp).toBe("10.0.0.6");
  });

  it("returns the unfiltered total alongside a filtered page", async () => {
    const storage = new DatabaseStorage();
    // Sanity: the contract is that `total` matches the FILTER, not the
    // table size. (Otherwise paginated UIs lie about how many rows they
    // can scroll through.)
    const out = await storage.getRecentAdminAuditEntries({ status: "failure" });
    expect(out.total).toBe(3);
    expect(out.entries).toHaveLength(3);
  });
});

describe("DatabaseStorage.getRecentAdminAuditEntries — pagination", () => {
  beforeEach(async () => {
    dbState.entries = [];
    await seed();
  });

  it("respects limit and surfaces the newest page first", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ limit: 2 });
    expect(out.entries).toHaveLength(2);
    expect(out.total).toBe(5);
    // desc(createdAt): the two most recent rows.
    expect(out.entries[0].action).toBe("admin-access-denied");
    expect(out.entries[1].action).toBe("backfill-reports");
    expect(out.entries[1].status).toBe("failure");
  });

  it("respects offset to walk backward through older rows", async () => {
    const storage = new DatabaseStorage();
    const page1 = await storage.getRecentAdminAuditEntries({
      limit: 2,
      offset: 0,
    });
    const page2 = await storage.getRecentAdminAuditEntries({
      limit: 2,
      offset: 2,
    });
    const page3 = await storage.getRecentAdminAuditEntries({
      limit: 2,
      offset: 4,
    });
    expect(page1.entries.map((e) => e.action)).toEqual([
      "admin-access-denied",
      "backfill-reports",
    ]);
    expect(page2.entries.map((e) => e.action)).toEqual([
      "backfill-reports",
      "admin-login-failed",
    ]);
    // The last page has only one row left.
    expect(page3.entries.map((e) => e.action)).toEqual(["admin-login"]);
    // total stays constant across pages — the UI uses it for "showing N
    // of M".
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);
    expect(page3.total).toBe(5);
  });

  it("reports total as the FILTERED count, independent of limit", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      status: "failure",
      limit: 1,
    });
    expect(out.entries).toHaveLength(1);
    // 3 failures total even though only one is on the page.
    expect(out.total).toBe(3);
  });

  it("clamps limit upward (limit 0 ⇒ default 25)", async () => {
    const storage = new DatabaseStorage();
    // 0 is falsy — the storage treats it as "use the default 25".
    const out = await storage.getRecentAdminAuditEntries({ limit: 0 });
    expect(out.entries).toHaveLength(5);
  });

  it("clamps limit upward (negative ⇒ at least 1)", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ limit: -10 });
    // Must surface at least one row instead of silently returning none
    // or asking Postgres for a negative LIMIT.
    expect(out.entries).toHaveLength(1);
    expect(out.total).toBe(5);
  });

  it("clamps limit downward (200 max even when caller asks for more)", async () => {
    // Seed 250 extra rows so a caller asking for 5_000 can be cleanly
    // distinguished from a caller asking for 200: the page must contain
    // exactly 200 rows even though 255 (5 from `seed()` + 250 here)
    // exist in the table. Without the clamp this test would return 255.
    for (let i = 0; i < 250; i++) {
      const storage = new DatabaseStorage();
      await storage.createAdminAuditEntry({
        action: "synthetic",
        status: "success",
        statusCode: 200,
        actorIp: "127.0.0.1",
        actorUserAgent: "ua",
        path: "/api/admin/synthetic",
      });
    }
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({ limit: 5_000 });
    expect(out.total).toBe(255);
    // The hard cap kicks in regardless of caller intent — this is what
    // protects the table from a single callable getting the entire log
    // dumped to the wire.
    expect(out.entries).toHaveLength(200);
  });

  it("clamps offset to >= 0", async () => {
    const storage = new DatabaseStorage();
    // Negative offsets must not cause SQL errors; they collapse to 0.
    const out = await storage.getRecentAdminAuditEntries({ offset: -5 });
    expect(out.entries).toHaveLength(5);
  });

  it("returns an empty page when offset is past the end", async () => {
    const storage = new DatabaseStorage();
    const out = await storage.getRecentAdminAuditEntries({
      limit: 2,
      offset: 100,
    });
    expect(out.entries).toEqual([]);
    // total still reflects the underlying matching count so the UI can
    // render "page out of range" without re-querying.
    expect(out.total).toBe(5);
  });
});

// ===========================================================================
// 2. GET /api/admin/audit-log — query-param parsing
// ===========================================================================
async function buildRealApp(): Promise<express.Express> {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

function lastCall(): Record<string, unknown> {
  expect(routeCalls.length).toBeGreaterThan(0);
  return routeCalls[routeCalls.length - 1].options as Record<string, unknown>;
}

describe("GET /api/admin/audit-log — query-param parsing", () => {
  beforeEach(() => {
    routeCalls.length = 0;
    routeReturn = { entries: [], total: 0 };
    routeThrow = null;
  });

  it("returns 200 with { entries, total } shape and forwards defaults", async () => {
    const app = await buildRealApp();
    routeReturn = { entries: [], total: 7 };
    const res = await request(app).get("/api/admin/audit-log");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [], total: 7 });
    // No query params ⇒ default limit/offset, all filters undefined.
    const opts = lastCall();
    expect(opts.limit).toBe(25);
    expect(opts.offset).toBe(0);
    expect(opts.action).toBeUndefined();
    expect(opts.status).toBeUndefined();
    expect(opts.since).toBeUndefined();
    expect(opts.until).toBeUndefined();
    expect(opts.ip).toBeUndefined();
  });

  it("parses numeric limit + offset", async () => {
    const app = await buildRealApp();
    await request(app).get("/api/admin/audit-log?limit=50&offset=100");
    const opts = lastCall();
    expect(opts.limit).toBe(50);
    expect(opts.offset).toBe(100);
  });

  it("falls back to defaults on non-numeric limit/offset", async () => {
    const app = await buildRealApp();
    await request(app).get("/api/admin/audit-log?limit=abc&offset=xyz");
    const opts = lastCall();
    expect(opts.limit).toBe(25);
    expect(opts.offset).toBe(0);
  });

  it("forwards action, status, and ip as strings", async () => {
    const app = await buildRealApp();
    await request(app).get(
      "/api/admin/audit-log?action=backfill-reports&status=failure&ip=10.0.",
    );
    const opts = lastCall();
    expect(opts.action).toBe("backfill-reports");
    expect(opts.status).toBe("failure");
    expect(opts.ip).toBe("10.0.");
  });

  it("ignores empty-string filters", async () => {
    const app = await buildRealApp();
    // The `asString` helper drops empty/whitespace strings so the
    // storage layer doesn't have to special-case them.
    await request(app).get(
      "/api/admin/audit-log?action=&status=&ip=%20%20%20",
    );
    const opts = lastCall();
    expect(opts.action).toBeUndefined();
    expect(opts.status).toBeUndefined();
    expect(opts.ip).toBeUndefined();
  });

  it("parses ISO-8601 since/until into Date objects", async () => {
    const app = await buildRealApp();
    await request(app).get(
      "/api/admin/audit-log?since=2026-04-03T12:00:00Z&until=2026-04-05T18:15:00Z",
    );
    const opts = lastCall();
    expect(opts.since).toBeInstanceOf(Date);
    expect(opts.until).toBeInstanceOf(Date);
    expect((opts.since as Date).toISOString()).toBe("2026-04-03T12:00:00.000Z");
    expect((opts.until as Date).toISOString()).toBe("2026-04-05T18:15:00.000Z");
  });

  it("silently ignores invalid since/until values", async () => {
    const app = await buildRealApp();
    // Garbage date strings must NOT cause a 400 — the handler is
    // intentionally permissive so a partial query in the URL bar still
    // returns useful data instead of an opaque error.
    const res = await request(app).get(
      "/api/admin/audit-log?since=not-a-date&until=also-bogus",
    );
    expect(res.status).toBe(200);
    const opts = lastCall();
    expect(opts.since).toBeUndefined();
    expect(opts.until).toBeUndefined();
  });

  it("passes any status value straight through (unknown values are filtered out by storage)", async () => {
    const app = await buildRealApp();
    // Per the route docstring, unknown statuses are silently ignored
    // **at the storage layer** — the route just forwards the raw string.
    await request(app).get("/api/admin/audit-log?status=pending");
    const opts = lastCall();
    expect(opts.status).toBe("pending");
  });

  it("handles a thrown storage error by returning 500 with { entries: [], total: 0, error }", async () => {
    // Inject a real failure into the spy storage so the actual route
    // handler's catch branch executes — this is what guards against a
    // future refactor changing the error response shape and causing
    // the Admin UI's error toast to show "[object Object]" instead of
    // a useful message.
    const app = await buildRealApp();
    routeThrow = new Error("db dead");
    try {
      const res = await request(app).get("/api/admin/audit-log");
      expect(res.status).toBe(500);
      expect(res.body.entries).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(typeof res.body.error).toBe("string");
      expect(res.body.error).toContain("db dead");
      // The handler still routed the request through storage exactly
      // once before failing — the spy recorded the parsed options.
      expect(routeCalls).toHaveLength(1);
    } finally {
      // Reset so subsequent tests don't inherit the failure mode.
      routeThrow = null;
    }
  });

  it("forwards a combined query through to storage exactly once", async () => {
    const app = await buildRealApp();
    routeReturn = { entries: [], total: 1 };
    const res = await request(app).get(
      "/api/admin/audit-log?action=backfill-reports&status=failure&since=2026-04-04T00:00:00Z&until=2026-04-05T00:00:00Z&ip=10.0.0.6&limit=10&offset=0",
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    // One call, one parsed-options object — the handler must not split
    // the query into multiple storage calls.
    expect(routeCalls).toHaveLength(1);
    const opts = lastCall();
    expect(opts.action).toBe("backfill-reports");
    expect(opts.status).toBe("failure");
    expect(opts.ip).toBe("10.0.0.6");
    expect(opts.limit).toBe(10);
    expect(opts.offset).toBe(0);
    expect((opts.since as Date).toISOString()).toBe(
      "2026-04-04T00:00:00.000Z",
    );
    expect((opts.until as Date).toISOString()).toBe(
      "2026-04-05T00:00:00.000Z",
    );
  });
});
