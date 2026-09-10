# Frontend TODO (`apps/web`)

Derived from an architecture/feature audit (2026-09-10). Keep in sync with
`apps/web/README.md` §2 when items land.

## Features

- [ ] **SRT/VTT import + export (subtitles editor).**
  - `components/editor/subtitles/` — cues are manual-only today; `@repo/types` already has `Subtitle/*`.
  - Add parser/serializer in `lib/subtitles/`, drag-drop `.srt`/`.vtt`, and a "download sidecar" (no burn-in) option beside `useSubtitleExport.ts`.
- [x] **Command palette + keyboard shortcuts.**
  - `cmdk` palette (`components/command/CommandPalette.tsx`, opened with
    `⌘K`/`Ctrl+K`/`?` or the sidebar "Commands" button) with Go to /
    Playback / Trim groups; global keys (`useGlobalShortcuts.ts`) drive the
    shared `lib/playback-bus.ts` transport: Space/K play-pause, J/L ±10 s,
    ←/→ ±5 s (⇧ = frame step, also `,`/`.`), `I`/`O` trim in/out, `X` reset
    trim, `M` mute, `1..6` navigation across crop/mobile/subtitles/bulk/cut.
  - Done 2026-09-10.
- [ ] **Global undo/redo.**
  - Only mobile has partial undo (`components/editor/mobile/useMobileEditor.ts`).
  - History middleware over TanStack store slices: `cropSlice`, `cutSlice`, `filterSlice`, `subtitleSlice`.
- [x] **Non-blocking export queue in-editor.**
  - `awaitTranscodeCompletion` (`lib/transcode-progress.ts`) blocks the page; `useBulkExport.ts` loops jobs serially.
  - Fire-and-forget exports, live SSE progress in `AppNav`, mini queue panel; bulk submits all at once and lets the API queue bound concurrency.
  - Done: `lib/export-queue.ts` engine + `store/exportQueueSlice.ts` + `components/export/QueueDock.tsx`; crop/mobile/subtitles/cut/bulk all enqueue; serial bulk loop and blocking SSE waits removed.
- [ ] **Before/after split comparison in the preview.**
  - `CompareDialog` (`components/export/CompareDialog.tsx`) is admin-only.
  - Reuse it (or a wipe slider) inside `VideoPlayer`/`PortraitPreview`; preview math is already shared via `@repo/ffmpeg-filters`.

## Architecture / maintainability / performance

- [ ] **Add tests (currently zero repo-wide).**
  - Vitest (bun) on pure logic first: `lib/mobile-layout.ts` (zone math), `lib/upload-chunked.ts`, `lib/transcode-jobs.ts`, `lib/validate-settings.ts`, store slices.
  - Playwright smoke on the upload → transcode → download path.
- [x] **Unify duplicated player code.**
  - Three playback implementations: `components/editor/shared/useVideoPlayer.ts`, `subtitles/useVideoPlayback.ts`, `cut/useCutPlayback.ts` → one `usePlaybackEngine`.
  - Done 2026-09-10: new `components/editor/shared/usePlaybackEngine.ts` owns element transport, isolated playhead clock, trim clamp (unconditional `loopRange` + `trimRange`/`trimLoop` pause-at-end policy), throttle+rAF sync, volume/muted/rate/loop sync, WebAudio preview, plus shared `seekVideoElement` helper. `useVideoPlayer` is a compat alias; `subtitles/useVideoPlayback` keeps its public API (trim-aware seeks, preview-height observer) over the engine with direct-drive transport; `cut/useCutPlayback`(+`useSeekTo`) delegates to the engine; crop `VideoPlayer` dropped its inline wiring for the engine.
- [ ] **Unify duplicated uploader code**
  - Four near-identical `UploadOtherButton.tsx` copies (crop/cut/mobile/shared) → one shared component.
- [x] **Fix render-path playhead clock**
  - `currentTime` ticks through `sourceSlice` and re-renders subscribers (throttled store writes per frame); move playhead to a transient/rAF subscription.
  - Done 2026-09-10: isolated `store/playheadSlice.ts` (`playheadAtom` via `createAtom<number>`, `usePlayheadTime`, `setPlayheadTime` per-frame transient, `commitPlayheadTime` for seek/pause/ended/file-reset snapshots into `sourceStore.currentTime`); writers migrated (`useVideoPlayer`, `VideoPlayer`, `subtitles/useVideoPlayback`, `lib/playback-bus`, `PlayerControls`, `TrimControls`, `AudioControls`, cut `useCutPlayback`, file-reset paths); live readers (`VideoPlayerControls`, `TrimSlider`, `AudioWaveform`, `SourcePanel`, `PreviewPane`, `CutTimeline`) fed via parents; `sourceSlice.currentTime` documented as committed snapshot only.
- [ ] **list scaling**
  - Real virtualization for `JobsList`, subtitle rows, `BulkArea` grids (only `content-visibility` today).
- [ ] **Break up mega-files**
  - `components/editor/Sidebar.tsx` (1143 LOC) → split export form sections;
  - `components/admin/useAdminJobs.ts` (479 LOC) → split query/mutations/actions.
- [x] **prune dead deps**
  - Removed unused root deps: `framer-motion`, `react-rnd`, `@phosphor-icons/react` (zero imports in `apps/`/`packages/`; remaining copies are transitive via `@cloudflare/kumo`). Kept `@cloudflare/kumo` — actively used via `@import "@cloudflare/kumo/styles/tailwind"` in `apps/web/app/globals.css`. Also pruned unused web deps: `hono` (api-only), `cn`/`clsx`/`tailwind-merge` (still present transitively via `shadcn`/`@repo/ui`).
  - Done 2026-09-10.
- [ ] **Error boundaries**
  - No `ErrorBoundary` in `app/` — add route-level boundaries + one central API-envelope→toast mapper replacing ad-hoc try/catches per hook.
