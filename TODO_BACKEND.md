# Backend TODO

This backlog is based on the current implementation in `apps/api`. The API already supports resumable uploads, ffprobe metadata, audio analysis/extraction, crop/trim/mobile/cut/subtitle transcodes, SQLite job persistence, bounded FFmpeg concurrency, SSE progress, range downloads, validation, startup cleanup, and builder tests. The items below extend those foundations rather than duplicating them.

## Backend Features

### 1. Declarative multi-input composition and transitions

**Why:** The current transcode endpoints accept one source file and either crop it, reframe it, cut segments, or overlay subtitle PNGs. `cutBuilder.ts` concatenates segments from one input, but there is no API contract for combining multiple uploaded assets, still images, audio files, or transitions.

**Scope:** Add a composition endpoint that accepts a versioned timeline document: input asset references, clip ranges, tracks, overlays, transitions, output canvas, and audio mix. Compile it into a validated FFmpeg filter graph while preserving the existing job/progress/download lifecycle. Start with cut, crossfade, image overlay, and audio mix; reject unsupported graph combinations before queuing.

**Acceptance criteria:**

- A request can reference multiple completed upload sessions without re-uploading their bytes.
- The API validates asset existence, clip ranges, transition overlap, stream availability, and output dimensions before creating a job.
- A composition has a stable, inspectable render plan including all input maps and filter labels.
- The output and progress events use the same job APIs as existing exports.

### 2. Persistent batch render submission and dependency-aware jobs

**Why:** The API has a bounded queue (`routes/video.ts`) and the frontend bulk flow submits files sequentially, but there is no backend batch request, durable queue ordering, or relationship between a group of renders.

**Scope:** Add batch creation and batch status endpoints. Persist batches, items, priority, dependencies, and aggregate progress in SQLite. Support submit-all, pause/resume, cancel batch, retry failed items, and continue-on-error. Keep the CPU concurrency limit while allowing the process to recover queued work after restart instead of marking every queued job failed.

**Acceptance criteria:**

- A batch can contain multiple render requests and returns item job IDs immediately.
- Batch progress reports completed, failed, cancelled, active, and queued counts plus byte/output metadata.
- Restart recovery safely requeues jobs whose inputs and render plans still exist; jobs with missing assets fail with a specific reason.
- Cancelling a batch cannot cancel unrelated jobs and releases queue capacity promptly.

### 3. Thumbnail, poster, and storyboard generation

**Why:** Metadata currently exposes technical ffprobe data, but the frontend generates some previews locally and has no backend service for reliable frame extraction from difficult codecs or long files.

**Scope:** Add asynchronous media preview jobs or a cached endpoint for a poster frame, contact sheet/storyboard, and optional scene-change timestamps. Accept an upload ID, time(s), size, image format, and quality. Store generated assets with an explicit lifecycle and serve them with cache headers/range-safe responses where useful.

**Acceptance criteria:**

- A caller can request a poster at a timestamp or a bounded storyboard for a source asset.
- Requests validate timestamps against probed duration and enforce practical count/dimension limits.
- Repeated requests for the same source fingerprint and parameters reuse cached output.
- Preview failures distinguish unsupported media, invalid timestamps, missing assets, and FFmpeg failures.

### 4. Caption file processing and timed-text export

**Why:** Subtitle burn-in currently depends on client-rendered PNGs and `mobileSubtitlesBuilder.ts`. The backend does not accept or emit interoperable SRT/WebVTT/TTML files.

**Scope:** Add caption parse/validate/normalize endpoints and a caption sidecar export path. Support SRT and WebVTT first, then TTML. Normalize cue ordering, timestamps, Unicode text, and overlapping intervals into a shared representation. Allow a transcode request to mux a compatible caption stream or burn it in through a server-side filter path when requested.

**Acceptance criteria:**

- Valid SRT/WebVTT can be parsed into a stable cue schema and exported without timing drift.
- Malformed timestamps, invalid cue ordering, and unsupported styling produce structured validation issues.
- Sidecar download and muxed output preserve the selected language/title metadata.
- Caption processing does not require one temporary PNG file per cue for the sidecar-only path.

### 5. Render preflight, estimates, and encoder profiles

**Why:** The builders choose codecs and filters directly from settings, while output-size/runtime expectations and hardware capabilities are not exposed before a job is queued.

**Scope:** Add a preflight endpoint that validates a render request without spawning a full export, returns normalized settings and a human-readable render plan, and estimates duration/output size. Add named encoder profiles for software H.264, VP9, ProRes, and detected hardware encoders, with safe capability probing and fallback behavior.

**Acceptance criteria:**

- Preflight returns normalized dimensions, duration, stream maps, codecs, warnings, and estimated resource cost.
- Unsupported combinations are rejected before consuming queue capacity.
- Encoder profiles are derived from the installed FFmpeg build and never assume hardware availability.
- The exact normalized preflight request can be submitted without changing the generated command.

## Architecture and Codebase Changes

### 1. Split HTTP routes from a render application/service layer

**Current seam:** `apps/api/src/routes/video.ts` is a single roughly 1,300-line module containing multipart resolution, validation, queue management, process lifecycle, progress parsing, cleanup, all export route orchestration, job queries, SSE, cancellation, and downloads.

**Change:** Extract application services with narrow interfaces: `AssetResolver`, `RenderRequestValidator`, `RenderPlanBuilder`, `RenderScheduler`, `ProcessRunner`, `JobRepository`, `ProgressPublisher`, and `ArtifactStore`. Keep Hono handlers responsible only for HTTP parsing, response mapping, and status codes. Make each existing route call the same service pipeline.

**Done when:** Route modules contain no direct FFmpeg spawning or SQL statements; crop, cut, mobile, and subtitle exports share job creation and terminal-state handling; services can be tested with fake repositories/process runners.

### 2. Make scheduling durable and isolate process execution

**Current seam:** Jobs are persisted in SQLite, but queue order, active process handles, and starter callbacks live in memory (`activeCount`, `waitQueue`, `procs`, and `starters` in `video.ts`). A restart sweep marks queued/processing jobs failed rather than recovering work.

**Change:** Persist a render plan, queue state, attempt count, priority, lease/heartbeat, and cancellation intent. Add a scheduler loop that claims jobs transactionally, limits concurrency, and runs FFmpeg in a dedicated worker module or worker process. On startup, reclaim expired leases and requeue safe jobs; keep process handles out of route modules.

**Done when:** Two scheduler ticks cannot claim the same job; restart behavior is deterministic; queue capacity and worker health are visible through `/health`; cancellation, retry, and shutdown do not leak child processes or slots.

### 3. Create a first-class asset and artifact lifecycle

**Current seam:** Uploads, direct request files, output files, subtitle PNGs, and extracted audio use several ad hoc temp-path conventions and cleanup paths. `db.ts` stores selected paths directly, and sweeps infer orphan files from filename regexes.

**Change:** Introduce an `AssetStore`/`ArtifactStore` abstraction with opaque IDs, metadata, reference counts or job ownership, byte size, MIME/extension, creation time, and expiration policy. Centralize safe filenames, atomic writes, deletion, disk quota checks, and startup reconciliation. Keep the local filesystem implementation, but avoid exposing temporary paths in API responses.

**Done when:** Every temp file is owned by a database record; cleanup is idempotent and observable; a failed request cannot leave an untracked input; downloads resolve artifacts by ID and preserve the keep-until-delete contract.

### 4. Share versioned schemas and normalize API errors

**Current seam:** `validation.ts` contains server-only Zod schemas and comments note that client/server schema sharing is still pending. Several endpoints use different multipart fields and error strings, while types in `packages/types` mostly cover reports, subtitles, layouts, and progress.

**Change:** Move request/response schemas, discriminated render kinds, job states, and error envelopes into a shared package. Add schema versioning/migrations for render plans and settings. Standardize errors as `{ code, message, issues?, requestId?, jobId? }`, including FFmpeg exit classification and asset errors.

**Done when:** The frontend can validate the same payload before upload; all routes return the common envelope; old supported plan versions are migrated or rejected explicitly; generated API documentation/examples match runtime behavior.

### 5. Strengthen media-engine verification and operational telemetry

**Current seam:** Builder tests assert argument strings and metadata fixtures cover pure parsing, but there are few route-level tests for uploads, queue transitions, cancellation, SSE disconnects, range downloads, cleanup, and real FFmpeg output. Logs are useful prefixes but not structured event records.

**Change:** Add deterministic integration tests with a fake process runner, plus a small generated media-fixture suite for video-only, multi-audio, subtitles, variable frame rate, malformed input, and long-running jobs. Add render-plan snapshots and a small number of real FFmpeg smoke tests. Emit structured job/upload events with durations, bytes, queue wait, encoder, exit code, cleanup results, and failure classification.

**Done when:** CI covers each job state transition and cancellation race; at least one end-to-end test covers upload → metadata → render → SSE → range download → delete; FFmpeg command arguments are tested for injection/structural safety; logs and `/health` expose enough data to diagnose disk, queue, and binary failures.

## Suggested Order

1. Split routes into render services and introduce shared error/schema contracts.
2. Create the asset/artifact lifecycle and durable scheduler boundary.
3. Add integration tests around existing upload, job, SSE, download, and cleanup behavior.
4. Implement preflight and encoder profiles.
5. Add persistent batch rendering.
6. Add thumbnails/storyboards and caption file processing.
7. Add multi-input composition after the render-plan model is stable.
