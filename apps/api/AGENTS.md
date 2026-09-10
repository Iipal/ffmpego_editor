# Backend instructions (`apps/api`) — for LLM agents

Local-only API: **Hono on Bun** (`bun run --watch src/index.ts`, default
`PORT=3100`, `Bun.serve` with 10 GB max body). Full diagrams + endpoint
reference: `apps/api/README.md` §1–§6. No auth/CORS/rate-limit by design.

## How it works

1. **Validate → reserve → enqueue.** Every `POST /transcode*` parses
   multipart `settings` (v1 `{version,kind,settings}` or legacy v0 via
   `migrateRenderPlan`), reserves an `ArtifactStore` output **before**
   spawning ffmpeg, inserts `jobs` as `queued`, then `enqueue()`.
2. **Bounded queue** (`routes/video.ts`): `active < min(2, cpu-1)`,
   `waitQueue ≤ 50`, else `429 + Retry-After: 10` with `rollbackQueuedJob()`.
   `pumpQueue()` advances on settle.
3. **ffmpeg via `Bun.spawn`.** stderr progress (`out_time_us/ms` vs duration,
   ~5 Hz DB throttle) into `jobs.{progress,logTail}`. Exit `0` → `completed`
   (+ `settleJobFiles()`); else `failed` with numeric `exitCode` + `[CODE]`
   (`classifyFfmpegExit`) + last-5-lines tail. `?mode=cancel` is cooperative:
   mark `cancelled` first so the runner no-ops its finish.
4. **Files are DB rows.** `FileStore`: `AssetStore` (inputs: `upload`,
   `request-input`) + `ArtifactStore` (outputs: `output`, `alternate-output`,
   `subtitle-png`, `ephemeral`) at `<tmp>/ffmpeg_editor_store/<id>.<ext>`.
   `reserve()` → write → `finalize()` → `share()`/`adopt()` → `release()`.
   Job outputs are keep-until-delete; downloads never delete. Responses carry
   `FileDescriptor` IDs only; `publicJob()` redacts paths to `<store>`/`<tmp>`.
5. **Reads are SSE.** `GET /progress/:jobId` (200 ms + 15 s heartbeat),
   `GET /jobs/stream` (1 s). Boot runs `startupSweep()` + `store.reconcile()`.

## Where methods live (`src/`)

### Entrypoint

- `index.ts` — wiring, `GET /`, `GET /health`, mount 5 modules under
  `/api`, boot sweep/reconcile

### Routes

- `routes/video.ts` — transcode core + jobs CRUD + SSE + download:
  `POST /transcode`, `/transcode/mobile`, `/transcode/mobile/subtitles`,
  `/transcode/cut`; `GET /transcode/jobs`, `/jobs/stream`,
  `/download/:jobId`, `/progress/:jobId`; `DELETE /jobs`, `/jobs/:jobId`;
  `PATCH /jobs/:jobId`. Internals: `enqueue/pumpQueue/dequeue`,
  `runTranscode`, `runWebmTgCrfSearch`, `publicJob`, `releaseJobFiles`,
  `getQueueStats`
- `routes/upload.ts` — `POST /upload/init`, `/upload/chunk/:uploadId`,
  `/upload/complete/:uploadId`, `GET /upload/sessions` (open-session list for
  Admin orphan UI), `GET /upload/status/:uploadId` (incl. `chunks[]` resume
  skip-set), `DELETE /upload/:uploadId`; `consumeUpload()`; 30 min stale sweep
- `routes/metadata.ts` — `POST /metadata` (ffprobe → summary,
  `?includeFrames&includePackets`; `packets_and_frames` split in
  `utils/metadata.ts`)
- `routes/audio.ts` — `POST /audio/analysis`, `POST /audio/extract`
  (`?format`, `?track`)
- `routes/files.ts` — `GET /storage/stats`, `POST /storage/sweep` (on-demand
  reconcile, pins live uploads), `GET /files/:id/download`; `streamFile()`
  with single-range support

### Persistence

- `db.ts` — `bun:sqlite` `.data/app.sqlite` (WAL): `jobs`/`uploads` CRUD,
  `startupSweep()`
- `storage/fileStore.ts` — `createFileStore`:
  `reserve/finalize/share/adopt/touch/release`,
  `sweepExpired/reconcile/stats/checkQuota`, `safeFilename/mimeForExt`,
  TTLs/quota
- `storage/index.ts` — process singleton (`db` + `STORE_ROOT`/
  `STORE_QUOTA_BYTES` env). **Tests: never import — use
  `createFileStore(new Database(":memory:"))`**

### Helpers & infra

- `utils/ffmpegBuilder.ts`, `cutBuilder.ts`, `mobileSubtitlesBuilder.ts`
  (incl. `audioTracks[]` → per-track `-map`, legacy `0:a[?]` when omitted),
  `metadata.ts` — pure arg builders + ffprobe parsing (unit-test without
  binaries)
- `validation.ts` — re-export contract schemas + `parseCustomArgs()`
  (shell-quote + structural denylist; `-vf` only where allowed)
- `http.ts` — `err()`/`errResponse()` — `ERROR_STATUS` is the single status
  source of truth
- `observability.ts` — `[api]/[job]/[upload]` prefixes, `getFfmpegVersion()`,
  `getDiskFreeBytes()`

## Shared packages used

- `@repo/contracts` — `settings.ts` (zod `generic/mobile/cutSettingsSchema`, `normalizeTrimAlias`, `flattenIssues`), `plans.ts` (`migrateRenderPlan`, `RenderKind`), `multipart.ts` (`MULTIPART_FIELDS`, `UPLOAD_ID_HEADER/QUERY`, `REQUEST_ID_HEADER`), `errors.ts` (`ERROR_STATUS`, `errorEnvelope`, `classifyFfmpegExit`). Single source of truth — web validates the same payloads pre-upload.
- `@repo/types` — `FFprobeReport` and shared media types (`TranscodeProgress/Response`, subtitles, mobile layout).
- `@repo/ffmpeg-filters` — `buildVisualVideoFilters`, `cropPercentToPixels`/`zoneToPixels`, `buildAtempoFilter`/`buildSetptsFilter`, `isVisualFiltersDefault`. Server and web preview must not drift.
- `@repo/config` — ts/eslint shared config. (`@repo/ui` is web-only.)

## Rules

- Bun only (`bun add/run`, `Bun.spawn`, `Bun.write/file`); Hono only, no Express/Nest.
- Record-before-bytes + quota gate (`507`) on every reserve; `release()` is idempotent — double-delete/crash-replay must be safe.
- Every error via `err(c, CODE, …)`; never leak absolute paths (use `scrubPaths`, generic `STORE_ERROR` text).
- Logs via `systemLog/jobLog/uploadLog` (+ `*Error` variants) so lines grep cleanly.
- `bun test` / `bun run lint` (`tsc --noEmit`) before finishing; keep `README.md` §6 endpoint list in sync when routes change.
