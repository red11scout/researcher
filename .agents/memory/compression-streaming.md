---
name: Gzip compression vs real-time streaming
description: Global compression() is enabled on the Express app; real-time streaming routes must opt out with Cache-Control no-transform or they get buffered.
---

- The Express app enables a **global `compression()` middleware** (registered in `server/index.ts`, right after security headers, before static mounts and routes).

- **Trap:** `compression` buffers chunked `res.write(...)` output. Any endpoint that must deliver bytes incrementally in real time (live progress UIs) will appear frozen until the whole response ends.

- **Rule:** Any real-time streaming response MUST set `Cache-Control: no-transform` — the `compression` module honors this directive and skips compression for that response. Pair it with `X-Accel-Buffering: no` so upstream proxies don't buffer either.

- **Why:** Without `no-transform`, the client sees nothing until the stream completes, defeating the point of streaming. The admin "backfill-reports" ndjson progress stream already does this correctly and is the reference example.

- **Exception:** File *downloads* streamed via `res.write` (e.g. the CSV audit-log export) are fine to compress — the browser only surfaces the final saved file, so buffering doesn't hurt and the download is smaller. Only live-display streams need the opt-out.
