# TODO — ffmpeg_editor Roadmap

Generated from architecture audit 2026-09-08. Source of truth for next features + critical fixes.
Conventions: `- [ ]` = pending. Priority `P0` (critical) → `P2` (nice-to-have).

## Part A — Top 5 Features

### 1. [P1] Local auto-transcription → editable subtitles
- [ ] Add `SRT/VTT` import/export in `apps/web/lib/subtitles/` + `components/editor/subtitles/`
- [ ] Add `POST /api/transcribe` in `apps/api/src/routes/` via `Bun.spawn(whisper.cpp tiny/base)` → word timestamps
- [ ] Wire transcription output into existing `Subtitle[]` store + PNG burn-in pipeline (`mobileSubtitlesBuilder.ts`)
- [ ] UI: Transcribe button + progress + editable word list in `/editor/mobile/subtitles`

### 2. [P1] Audio track: waveform + loudness + fades
- [ ] Backend: `ffprobe loudnorm` + waveform JSON endpoint (`apps/api/src/routes/metadata.ts` or new `audio.ts`)
- [ ] Frontend: canvas waveform in `apps/web/components/editor/Timeline.tsx` + shared `TrimControls`
- [ ] Controls: gain, `loudnorm -14 LUFS`, fade in/out, mute-segment, extract `mp3/wav` in `Sidebar.tsx` / `ffmpegBuilder.ts`
- [ ] Preview audio gain live via `<video>` / WebAudio without re-encode

### 3. [P1] Projects + export presets + persistent history
- [ ] Define `.vfproj.json` = `useVideoStore` snapshot; save/load via file + `localStorage recent`
- [ ] Add export presets `{name, format, fps, crf, speed, args}` in `apps/web/store/useVideoStore.ts` + Sidebar UI
- [ ] Persist job history (depends on B1 SQLite) — re-download / re-run from `/admin`

### 4. [P2] Visual filter stack (replace raw textarea)
- [ ] UI for `eq, hqdn3d, deshake, rotate/flip, speed-ramp` in `apps/web/components/editor/Sidebar.tsx`
- [ ] Live canvas `ctx.filter` preview matching server `-vf`; keep `customFFmpegArgs` as advanced accordion
- [ ] Unify with shared `@repo/ffmpeg-filters` (see B3) to prevent preview/builder drift

### 5. [P2] Smart outputs: HW accel + GIF/WebP + storyboard + merge
- [ ] Auto-detect `h264_nvenc/hevc_qsv/h264_videotoolbox` toggle in `apps/api/src/utils/ffmpegBuilder.ts`
- [ ] Add `GIF/WebP` export + thumbnail contact-sheet + `scene-detect` split
- [ ] Add concat-merge mode reusing `cutBuilder.ts` concat graph

## Part B — Top 5 Critical Architecture Fixes (P0)

### B1. [P0] Persistent job + upload registry + real output dir — DONE 2026-09-08
- [x] Replace `Map` in `apps/api/src/routes/video.ts` + `upload.ts` with `bun:sqlite` tables `jobs, uploads` (`apps/api/src/db.ts`, DB at `apps/api/.data/app.sqlite`, WAL mode)
- [x] Startup sweep: recover/expire jobs, clean orphan `os.tmpdir()/temp_*`, `<uuid>-*`, `<jobId>-sub*.png` (`startupSweep()` in `db.ts`, wired in `index.ts`)
- [x] Deprecated `~/ffmpego_edits` removed from `AGENTS.md`, `PLAN.md`, `ffmpegBuilder.ts`, `mobileSubtitlesBuilder.ts` (ephemeral `tmpdir` + keep-until-delete)
- [x] Keep outputs until user deletes; downloading does NOT delete (`GET /transcode/download/:jobId` serves bytes, row + files persist until `DELETE /transcode/jobs/:jobId`)

### B2. [P0] Bounded transcode queue with cancellation — DONE 2026-09-08
- [x] Bounded queue in `apps/api/src/routes/video.ts`: `maxConcurrent = min(2, cpu-1)`, `maxQueued = 50`, overflow → `429 + Retry-After: 10` (stats in `/health` + `/transcode/jobs`)
- [x] Graceful `SIGTERM → SIGKILL (2s)` per job, cooperative cancel (`DELETE ...?mode=cancel` → `cancelled`, row kept), SSE emits `queued/processing → completed/failed/cancelled` with `logTail` (last 50 lines / 20KB)

### B3. [P0] Split store + create shared packages, remove dead code
- [x] Split `apps/web/store/useVideoStore.ts` → `sourceSlice + cropSlice + cutSlice + mobileSlice + subtitleSlice` — 2026-09-08
- [x] Extract `@repo/types`, `@repo/ffmpeg-filters` (single source for shared filter math used by server builders), `@repo/ui` — 2026-09-08
- [x] Delete `store/ffmpeg-store.tsx` (unused), remove stale generated `apps/api/dist` artifacts, and add the `packages/ui` workspace boundary — 2026-09-08
- [ ] Add passing `tsc --noEmit` + `eslint` CI gate (`turbo lint`) — scripts added; existing web lint findings remain

### B4. [P0] Stream downloads, strict validation — DONE 2026-09-08
- [x] `GET /transcode/download/:id` streams from disk (`Bun.file` + `slice` for Range, `Content-Length`, `Accept-Ranges`, single-range `206`, per-ext `Content-Type` mp4/webm/mov) — verified `200` full + `206 bytes 0-99` live
- [x] `apps/api/src/validation.ts` (zod `4.5.4`): `genericSettingsSchema` (crop-or-mobile refine), `mobileSettingsSchema`, `cutSettingsSchema` (sorted non-overlap, zones, stack split), `parseSettingsJson` → `400 + issues`; client/server sharing deferred to B3 (`@repo/types`)
- [x] `parseCustomArgs` via `shell-quote`: rejects non-string operator tokens, structural deny-list (`-i/-ss/-to/-t/-progress/-nostats/-map/-filter_complex/-filter:a/-f/-y/-n`), bare positionals only after flags; `-vf` merges into `-vf` chain (generic path) else `400`; verified denied `-i → 400` + `-vf eq=… → accepted` live
- [x] `webm` keeps audio (`libopus`, respects `fps`/resolution — verified 128x128@10fps + opus live); `exitCode INTEGER` column (PRAGMA-guarded migration) surfaced in jobs payload + SSE + Admin `(exit N)` badge; per-job SSE heartbeat `: heartbeat` every 15s, 5m hard cap removed

### B5. [P0] Tests + observability for media engine — DONE 2026-09-08
- [x] `bun test` (25 tests, `apps/api/test/`): crop pixel clamp/overflow, split `0.2–0.8` + halves sum, cut sort/concat, subtitle `between(t)` trim+speed math, atempo chains, webm-opus, `-vf` merge/throw, fps/trim flags
- [x] Golden ffprobe fixtures (`test/fixtures/ffprobe-av.json` from real `testsrc+sine` probe, audio-only, empty) + `extractVideoMetadata` pure helper; routes differentiate `500 spawn fail` vs `422 rejected file (+stderr tail)` vs `422 no video stream`
- [x] `/health` reports `ffmpegVersion, tmpdir, diskFreeBytes/Human, queue`; jobId-tagged logs (`[job <id>]`, `[upload <id>]`, `[api]`, replaces `ARGS` dumps); disk-quota gate on `upload/init` → `507 + neededBytes`
- [x] Drive-by: `mobileSubtitlesBuilder` webm `-an` → `libopus` (B4 fix missed that builder); fixed `process.stderr/stdout` tsc union errors; added `"test": "bun test"` script (tests live outside `src/` so `tsc` build unaffected)

## Suggested Order
1. B1 + B2 (data loss / OOM)
2. B4 + B5 (correctness / debuggability)
3. B3 (refactor unlocks A4)
4. A1 → A2 → A3 → A4 → A5
