# NEW_LATEST_TODO — Over-Engineering Removal Plan

Source: repo-wide ponytail-audit (2026-09-11), three parallel scans (web / api /
packages+root). Line counts are agent estimates — re-measure with `wc -l` before
cutting. Nothing below is applied; this is the work list.

## How to work this file (LLM instructions)

1. Do items **one at a time, in phase order**. Do not jump ahead.
2. Check an item off (`[ ]` → `[x]`) only after `bun run typecheck` +
   `bun run lint` pass, and `next build` (web) / `bun` API boot for the touched
   app. For web player/export changes, also smoke-test `/editor/crop` (200 +
   export a short clip).
3. Keep `apps/web/README.md` §2 map + `apps/web/AGENTS.md` in sync when pages,
   components, or endpoints change (repo rule).
4. Phase 5 (†) items delete shipped features — **ask the user first, default SKIP**.
   Phase 0 items are verified load-bearing — **never cut**.
5. Prefer deletion over rewrite. If a "shrink" turns into a redesign, stop and shrink less.

## Phase 0 — Do NOT cut (verified load-bearing)

- `cmdk` (`apps/web/package.json`) — used by `components/ui/command.tsx`, which
  powers `GoogleFontPicker.tsx`. The "unused" audit claim was wrong.
- `next-themes` — wires `app/layout.tsx` ThemeProvider + `ui/sonner.tsx` +
  `ui/ThemeToggle.tsx`. Real dark-mode infra, not a single toggle.
- `shell-quote` (`apps/api`) — tokenizes quoted values in `parseCustomArgs`
  for `CustomArgsCollapsible`. A naive whitespace split breaks quoted ffmpeg
  args (correctness regression, not a simplification).
- `useCropFilenameSync` saga (already resolved): the 26-line standalone hook
  duplicated `VideoUploader.tsx:71` + `CropEditorHeader.tsx:36` `cropReset` +
  `basename` fallbacks at enqueue, and its `Sidebar.tsx` import pointed at a
  module that never exported it (red typecheck). Deleted; do not reintroduce.

## Phase 1 — apps/web lib/hooks (async infra + services, biggest first)

- [x] **1.1 Merge playback engine + bus + trim hooks (~280).**
      `components/editor/shared/usePlaybackEngine.ts:130`.
      Why: three layers (engine, `playback-bus.ts`, trim-loop hooks) drive one transport.
      Steps: fold `playbackBus.togglePlay/seekBy/stepFrame/trim-loop` into the engine hook
      as plain functions; update crop/mobile/subtitles/bulk/cut callers to the single hook.
      Verify: typecheck + play/pause/step/trim-loop on crop and cut pages. Done when `playback-bus.ts` is deleted.
- [x] **1.2 Collapse upload triple layer (~160).**
      `lib/audio-upload.ts:44`. Why: chunked/session/audio-upload overlap
      (`uploadChunked` + `upload-sessions` memory + `audioUpload` fan-out).
      Steps: one upload module exposing `submitWithUpload`-style fork; keep the
      status-verified resume behavior, delete the fan-out variants.
      Verify: >256 MB upload resumes, audio analysis + preview still work.
- [x] **1.3 Fold SSE live-sync + progress + queue retry (~150).**
      `components/admin/useAdminJobs.ts:78`. Why: 444-line hook (TODO Part 2A item 2) mixes SSE subscribe,
      progress shaping, retry. Steps: extract one SSE helper (`subscribeProgress(url, onEvent)`),
      split derived state(`useAdminDerived`) from history actions per TODO.
      Verify: admin page live progress + retry works.
- [x] **1.4 Drop dual font catalog + cyrillic gate (~140).**
      `lib/subtitles/googleFonts.ts:138`. Why: two catalog paths + a script gate for one picker.
      Steps: single fetch + system-font fallback.
      Verify: font picker lists + applies fonts, offline shows fallback.
- [ ] **1.5 Inline WebAudio preview sync engine (~130).**
      `hooks/useAudioPreview.ts:56`. Why: hand-rolled sync engine for preview.
      Steps: drive preview with a plain `<audio>` element synced to playhead; delete engine.
      Verify: audio preview stays in sync ±100 ms on crop page.
- [ ] **1.6 Unwrap singleton service classes (~120).**
      `lib/mobile-layout.ts:50` (pattern repeats in other `lib/*` services).
      Why: `class X { ... } export const x = new X()` with no instance state.
      Steps: plain exported functions, same names where callers exist.
      Verify: typecheck + mobile layout clamping unchanged.
- [x] **1.7 Merge queue executor + history retry/compare (~110).**
      `lib/export-history.ts:28`. Why: retry/compare split across queue and history.
      Steps: queue owns retry; history keeps read/record only.
      Verify: QueueDock retry + compare dialog work.
- [x] **1.8 Collapse api-client verb wrappers (~100).**
      `lib/api-client.ts:67`. Why: per-verb methods over one fetch+envelope core.
      Steps: direct `fetchJson`-style calls + one envelope helper at call sites.
      Verify: uploads, transcodes, admin polls all still succeed.
- [ ] **1.9 Merge preflight + contracts validate gates (~85).**
      `lib/preflight.ts:49`. Why: two fail-fast gates (`preflight.check` + `validateSettings`).
      Steps: `validateSettings` only, keep the `GET /health` connectivity probe.
      Verify: blocked export still shows issues, 422 surfaces.
- [x] **1.10 Drop subtitle template migration/backfill (~80).**
      `lib/subtitles/subtitleStorage.ts:83`. Why: version-migration code for localStorage templates.
      Steps: plain read/write, drop backfill.
      Verify: subtitle settings persist across reload.
- [ ] **1.11 Fold transcode error/429/log-tail shapers (~75).**
      `lib/transcode-jobs.ts:53` (web lib). Why: error-shaping wrappers around throws.
      Steps: throw `Error` with `issues` attached, shape once at UI boundary.
      Verify: 429 respects Retry-After, 507 shows disk-full, no blind retry.
- [ ] **1.12 Merge storage/health/fetch-json funnels (~65).**
      `lib/storage.ts:41`. Why: three thin polling wrappers.
      Steps: one fetch + timeout helper, keep 30 s/10 s poll intervals.
      Verify: StorageArea + AdminHeader polls work.
- [ ] **1.13 Delete subtitle helper re-export barrel (~60).**
      `components/editor/subtitles/subtitle-helpers.ts:15`. Why: types/helpers/ props re-exports.
      Steps: colocate or infer at use sites.
      Verify: typecheck.
- [ ] **1.14 Merge save-picker + fetchDownload service (~30).**
      `lib/save-blob-file.ts:21`. Why: service around anchor download.
      Steps: small `downloadBlob` helper, keep File System Access picker path.
      Verify: export download works with and without picker API.
- [ ] **1.15 Replace clamp/formatTime/readSliderValue shims (~15).**
      `lib/mobile-layout.ts:84`. Why: trivial wrappers.
      Steps: `Math.min/max`, `toFixed`, `v[0]` inline.
      Verify: typecheck + slider behavior unchanged.
- [ ] **1.16 Drop NOOP/cn trivial re-exports (~8).**
      `lib/utils.ts:4`. Why: one-line re-exports.
      Steps: `() => {}` / inline classnames (keep Shadcn `buttonVariants` usage, only cut the re-export).
      Verify: typecheck + lint.

## Phase 2 — apps/web components/stores/app

- [ ] **2.1 Remove PlayerControls store-adapter wrapper (~60).**
      `components/editor/PlayerControls.tsx:23`.
      Steps: use `shared/VideoPlayerControls` directly at call sites.
      Verify: player controls on all editor pages.
- [ ] **2.2 Drop intent-preload heavy module maps (~55).**
      `components/editor/subtitles/heavy-modules.tsx:6`.
      Steps: dynamic-import at point of use.
      Verify: subtitles page loads, no waterfall regression noticed.
- [ ] **2.3 Fold six identical route page wrappers (~54).**
      `app/editor/crop/page.tsx:1` (pattern in all editor/admin pages).
      Steps: layout renders `DirectionalTransition` once; pages export composers directly.
      Verify: all routes render + transition works.
- [ ] **2.4 Collapse store boilerplate triples (~50).**
      `store/exportQueueSlice.ts:58` (pattern across slices).
      Steps: reduce setter triplets, keep Store-vs-Query split (never move async into store).
      Verify: typecheck + UI state updates.
- [ ] **2.5 Replace global pointer-bus abstraction (~45).**
      `lib/global-listener-bus.ts:16`.
      Steps: `window.addEventListener` at the two call sites (canvas drag, admin scroll).
      Verify: crop drag + admin scroll behave.
- [ ] **2.6 Remove AreaShell readout/hint/grid flags (~40).**
      `components/shared/AreaShell.tsx:29`.
      Steps: inline card JSX per area.
      Verify: crop/mobile/bulk/jobs areas render identically.
- [ ] **2.7 Cut sidebar collapse + optimistic nav extras (~35).**
      `components/view-transition/AppNav.tsx:56`.
      Steps: static nav links, keep export badge.
      Verify: nav + badge work.
- [ ] **2.8 Drop hoisted placeholder JSX modules (~32).**
      `components/admin/placeholders.tsx:6`.
      Steps: inline conditional JSX.
      Verify: admin empty states render.
- [ ] **2.9 Remove DirectionalTransition single wrapper (~22).**
      `components/view-transition/DirectionalTransition.tsx:4`.
      Steps: use ViewTransition inline (after 2.3).
      Verify: transitions work.
- [x] **2.10 Fold mobile-helpers re-export + preload shim (~18).**
      `components/editor/mobile/mobile-helpers.ts:3`.
      Steps: import bus directly.
      Verify: typecheck.
- [x] **2.11 Drop useLatest one-function module (~12).**
      `components/admin/hooks.ts:6`.
      Steps: `useRef` + `useEffect` inline.
      Verify: typecheck.

## Phase 3 — apps/api

- [x] **3.1 Four transcode endpoints repeat reserve/claim/enqueue/rollback (~60).**
      `src/routes/video.ts:770`.
      Steps: one `submitTranscode` helper; keep `active < min(2,cpu-1)` bound and wait-queue ≤ 50 semantics.
      Verify: enqueue + queue-full 429 + cancel paths.
- [x] **3.2 Bounded-queue pump/starters/dequeue/killProc (~60).**
      `src/routes/video.ts:64`.
      Steps: simple active counter + starter, same bounds as 3.1.
      Verify: two concurrent jobs max, third waits, cancel kills proc.
- [x] **3.3 Audio filter builders triplicated (~60).**
      `src/utils/ffmpegBuilder.ts:95`.
      Steps: one shared audio-filter helper across the three builders; preview/export must not drift.
      Verify: exports with audio filters byte-compare filters before/after (log the `-af` chain).
- [x] **3.4 Plan-field/plan-error/schema pipeline (~50).**
      `src/routes/video.ts:641`.
      Steps: inline `JSON.parse` + zod at handlers.
      Verify: invalid plans still 422 with `issues[]`.
- [x] **3.5 Hand-rolled dynamic SET builders (~45).**
      `src/db.ts:165`.
      Steps: static SQL updates per caller.
      Verify: job/upload updates persist.
- [x] **3.6 Triplicated resolveInput (~40).**
      `src/routes/audio.ts:32` (also in video/metadata routes).
      Steps: one shared resolver.
      Verify: all three routes resolve uploadId + direct uploads.
- [x] **3.7 Sparse preallocate ftruncate + trim/clamp (~35).**
      `src/routes/upload.ts:112`.
      Steps: plain sequential writes.
      Verify: chunked upload assembles byte-identical file.
- [x] **3.8 Legacy ensureColumn/dropColumn migration theater (~32).**
      `src/db.ts:77`.
      Steps: fresh CREATE TABLE (local-only DB, no prod to migrate).
      Verify: clean boot creates schema, jobs survive restart.
- [x] **3.9 Micro-wrappers exportBase/parseArgs/scrubPaths/settle (~30).**
      `src/routes/video.ts:90`.
      Steps: inline at callers.
      Verify: typecheck + one export per format.
- [x] **3.10 AssetStore/ArtifactStore factory duality (~28).**
      `src/storage/fileStore.ts:645`.
      Steps: single store object, keep reserve→finalize→release semantics.
      Verify: render + download + job delete.
- [x] **3.11 adopt() falling back to share() (~28).**
      `src/storage/fileStore.ts:380`.
      Steps: `share()` only.
      Verify: file downloads by opaque ID.
- [ ] **3.12 Subtitle PNG prefix scan/sort/fallback/clamp (~27).**
      `src/routes/video.ts:920`.
      Steps: single `subtitles[]` field.
      Verify: subtitle burn-in export works.
- [x] **3.13 checkQuota pre-check duplicating reserve gate (~25).**
      `src/storage/fileStore.ts:631`.
      Steps: reserve-throw only.
      Verify: disk-full still 507s, no blind retry client-side.
- [x] **3.14 percentZones/percentLayout scaling (~25).**
      `src/routes/video.ts:594`.
      Steps: builders accept 0-1 directly.
      Verify: mobile zone exports land in the same pixels.
- [x] **3.15 Hand-rolled Range parse in streamFile (~22).**
      `src/routes/files.ts:23`.
      Steps: Bun.file range response.
      Verify: ranged download resumes + video seeks.
- [ ] **3.16 systemLog/systemError/jobLog wrappers (~22).**
      `src/observability.ts:12`.
      Steps: `console.log` directly.
      Verify: logs still appear on export failure.
- [x] **3.17 30-min upload sweeper duplicating boot sweep (~16).**
      `src/routes/upload.ts:41`.
      Steps: boot sweep only.
      Verify: stale sessions cleared on restart.
- [x] **3.18 Audio-extract reserve/finalize/release dance (~15).**
      `src/routes/audio.ts:233`.
      Steps: direct temp file.
      Verify: mp3/wav extract downloads.
- [ ] **3.19 Validation re-export passthrough (~14).**
      `src/validation.ts:11`.
      Steps: import `@repo/contracts` directly.
      Verify: typecheck.
- [ ] **3.20 errResponse duplicating err envelope (~13).**
      `src/http.ts:45`.
      Steps: use `err` everywhere.
      Verify: error envelope shape unchanged (contract tests / client parsing).
- [x] **3.21 Remove @types/node (~1).**
      `apps/api/package.json:25` — covered by `@types/bun`. Verify: typecheck.

## Phase 4 — packages + root configs

- [x] **4.1 Move 6 hardcoded presets out of contracts (~72).**
      `packages/contracts/src/presets.ts:113`.
      Steps: schemas stay, preset data moves to web `lib/export-presets.ts`.
      Verify: preset select unchanged, API validation unchanged.
- [x] **4.2 Dead RENDER_KINDS/JOB_STATES/migration types (~50).**
      `packages/contracts/src/plans.ts:18`.
      Steps: keep `RenderKind` + migrate only.
      Verify: typecheck both apps.
- [x] **4.3 Inline filter interfaces (~40).**
      `packages/ffmpeg-filters/src/index.ts:1`.
      Steps: single `VisualFilters` interface.
      Verify: preview/export filter parity.
- [x] **4.4 Fold unexported granular builders (~38).**
      `packages/ffmpeg-filters/src/index.ts:190`.
      Steps: fold into `buildVisualVideoFilters`.
      Verify: same `-vf` output for a filtered export.
- [x] **4.5 Drop @repo/ui cn-only wrapper (~31).**
      `packages/ui/src/index.ts:1`.
      Steps: inline 1-line `cn` in web (Shadcn _components_ rule unaffected — only the re-export package goes).
      Verify: typecheck + lint.
- [x] **4.6 Drop @repo/config single-tsconfig wrapper (~29).**
      `packages/config/tsconfig.json:1`.
      Steps: extend root tsconfig directly.
      Verify: typecheck all workspaces.
- [ ] **4.7 Remove unused preset sub-schemas/result union (~17).**
      `packages/contracts/src/presets.ts:18`.
      Steps: validate via `exportPresetSchema` only.
      Verify: typecheck.
- [x] **4.8 Remove test-only message/issues helpers (~16).**
      `packages/contracts/src/errors.ts:124`.
      Steps: assert envelope directly in tests.
      Verify: contract tests pass.
- [x] **4.9 Remove dead CutSegment/CutZone duplicates (~13).**
      `packages/types/src/index.ts:76`.
      Steps: single source (API cutBuilder shape).
      Verify: typecheck.
- [x] **4.10 Remove shadowed MobileLayout interface (~12).**
      `packages/types/src/index.ts:63`.
      Steps: use web mobile-layout type.
      Verify: typecheck.
- [x] **4.11 Cut ignoreTrimSettings alias + normalizer (~10).**
      `packages/contracts/src/settings.ts:116`.
      Steps: send `ignoreTrim` only.
      Verify: ignore-trim exports unchanged.
- [x] **4.12 Remove unused MultipartField export (~2).**
      `packages/contracts/src/multipart.ts:29`.
      Steps: use `MULTIPART_FIELDS` directly.
      Verify: typecheck.
- [x] **4.13 Remove duplicate VisualFiltersInput zod type (~1).**
      `packages/contracts/src/settings.ts:100`.
      Steps: use ffmpeg-filters `VisualFilters`.
      Verify: typecheck.
- [x] **4.14 Root dep hygiene (0 lines, correctness of graph).**
      `package.json:20,24` + `apps/web/package.json:28`.
      Steps: drop root typescript peerDep (single root tsconfig per 4.6),
      move misplaced kumo dep to `apps/web`, move Shadcn CLI to devDependencies.
      Verify: clean `bun install` + typecheck.

## Phase 5 — Product decisions (ASK FIRST, default SKIP)

Each deletes or degrades a user-visible feature. Confirm with the user before
touching; skipping is the correct default.

- [ ] **5.1 Watermark search/cache/overlay (~40).**
      `apps/api/src/utils/ffmpegBuilder.ts:16`. Kills the Watermark export switch.
- [ ] **5.2 Waveform RMS + loudnorm second pass (~40).**
      `apps/api/src/routes/audio.ts:151`. Degrades waveform/loudness data to
      peaks-only.
- [ ] **5.3 Chunked-resume skip-set/dedup (~38).**
      `apps/api/src/routes/upload.ts:156`. Weakens >256 MB resume (opaque retry
      instead of chunk skip). Opposed by the upload-resume feature; simplify
      internals only if resume tests stay green.
- [ ] **5.4 Deep-probe flags + frame/packet merge (~25).**
      `apps/api/src/utils/metadata.ts:30`. Kills the Frames/Packets tabs in the
      ProbeInspector dialog.
- [ ] **5.5 /health snapshot + probes (~27).**
      `apps/api/src/index.ts:70`. Kills AdminHeader readiness (ffmpeg/disk/queue
      line) — contradicts the TODO Part 1 health fix; skip unless admin readiness
      is redesigned.
- [ ] **5.6 storage/stats + storage/sweep endpoints (~20).**
      `apps/api/src/routes/files.ts:91`. Kills the StorageArea quota bar + Sweep
      button in admin.
- [ ] **5.7 Custom preset store + migration (~90).**
      `apps/web/lib/export-presets.ts:40`. Kills user-saved custom presets
      (builtins only); the Export card "Save current as preset" UI goes with it.

## Net tally

- Phases 1–4 (pure complexity, safe to work): ~2,900 lines removable.
- Phase 5 (product decisions, default SKIP): ~549 lines.
- Deps: -2 (`@types/node`, root typescript peerDep) + 2 moves (kumo → web,
  shadcn CLI → devDependencies).
- Rejected, do not re-litigate: `cmdk`, `next-themes`, `shell-quote`
  (see Phase 0).
