# Frontend TODO (`apps/web`)

Derived from an architecture/feature audit (2026-09-10). Keep in sync with
`apps/web/README.md` §2 when items land.

## Features

- [ ] **SRT/VTT import + export (subtitles editor).**
  - `components/editor/subtitles/` — cues are manual-only today; `@repo/types` already has `Subtitle/*`.
  - Add parser/serializer in `lib/subtitles/`, drag-drop `.srt`/`.vtt`, and a "download sidecar" (no burn-in) option beside `useSubtitleExport.ts`.
- [ ] **Command palette + keyboard shortcuts.**
  - `cmdk` is already installed (`components/ui/command.tsx`); only `TabSwitcher.tsx` handles keys today.
  - J/K/L, frame-step, `I`/`O` trim in/out, space, `⌘K` navigation across crop/mobile/subtitles/bulk/cut.
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
- [ ] **Unify duplicated player/uploader code.**
  - Three playback implementations: `components/editor/shared/useVideoPlayer.ts`, `subtitles/useVideoPlayback.ts`, `cut/useCutPlayback.ts` → one `usePlaybackEngine`.
  - Four near-identical `UploadOtherButton.tsx` copies (crop/cut/mobile/shared) → one shared component.
- [ ] **Fix render-path playhead clock + list scaling.**
  - `currentTime` ticks through `sourceSlice` and re-renders subscribers (throttled store writes per frame); move playhead to a transient/rAF subscription.
  - Real virtualization for `JobsList`, subtitle rows, `BulkArea` grids (only `content-visibility` today).
- [ ] **Break up mega-files and prune dead deps.**
  - `components/editor/Sidebar.tsx` (1143 LOC) → split export form sections; `components/admin/useAdminJobs.ts` (479 LOC) → split query/mutations/actions.
  - Remove unused root deps: `framer-motion`, `react-rnd`, `@phosphor-icons/react`, `@cloudflare/kumo` (no code imports in `apps/`/`packages/`).
- [ ] **Error boundaries + CI.**
  - No `ErrorBoundary` in `app/` — add route-level boundaries + one central API-envelope→toast mapper replacing ad-hoc try/catches per hook.
  - Add `.github/workflows` running turbo `typecheck + lint + test`.
