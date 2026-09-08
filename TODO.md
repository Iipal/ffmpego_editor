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
- [ ] Split `apps/web/store/useVideoStore.ts` → `sourceSlice + cropSlice + cutSlice + mobileSlice + subtitleSlice`
- [ ] Extract `@repo/types`, `@repo/ffmpeg-filters` (single source for client preview string + server builders), `@repo/ui`
- [ ] Delete `store/ffmpeg-store.tsx` (unused), stale `apps/api/dist/ffmpeg.js` (no source), fix `packages/ui` missing vs README
- [ ] Add `tsc --noEmit` + `eslint` to CI (`turbo lint`)

### B4. [P0] Stream downloads, strict validation
- [ ] Replace `Bun.file().arrayBuffer()` in `GET /transcode/download/:id` with `stream() + Content-Length + Range` (10GB OOM today)
- [ ] Shared `zod` schemas client/server for `trim/crop/zones/cuts/fps/crf/speed`; `shell-quote` parsing for `customArgs`
- [ ] Fix `webm` silent force `fps=30,scale=512:-1 -an`; return `exitCode + last 50 stderr lines`; SSE heartbeat (currently 5m hard cap)

### B5. [P0] Tests + observability for media engine
- [ ] `bun test` for `buildFFmpegArgs/buildCutArgs/buildSubtitlesArgs`: pixel clamp, split `0.2–0.8`, overlap, timed overlay math
- [ ] `ffprobe` golden JSON fixtures; differentiate `422 no video stream` vs `500 spawn fail`
- [ ] `/health` reports `ffmpeg version, disk free, queue depth`; structured `jobId`-tagged logs; disk-quota check before `init/complete`

## Suggested Order
1. B1 + B2 (data loss / OOM)
2. B4 + B5 (correctness / debuggability)
3. B3 (refactor unlocks A4)
4. A1 → A2 → A3 → A4 → A5
