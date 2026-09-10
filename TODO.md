# TODO — apps/web Audit: New Features + Maintainability / Performance Fixes

Generated: 2026-09-10 from full `apps/web` analysis (7 routes, ~135 files in `components/`, 11 slices in `store/`, 18+3 files in `lib/`, 4 files in `hooks/`).
Current routes: `/` → `/editor/crop`, `/editor/mobile`, `/editor/mobile/subtitles`, `/editor/mobile/bulk`, `/editor/cut`, `/admin`.

Per each changes made update README.md and AGENTS.md respectfully.

---

## PART 1: New Features (gap-driven)

### 1. Expose backend already supported, UI missing

- [x] **Health / readiness dashboard:** `GET /health`, `GET /` never fetched. `lib/preflight.ts:168` probes heavy `GET /transcode/jobs`. Add status dot + `ffmpegVersion/diskFreeHuman/queue{active,queued}` in `AdminHeader/JobsArea`.
- [ ] **Storage / quota dashboard:** `GET /storage/stats` never called. Add disk bar + sweep button. Needed for `507 QUOTA_EXCEEDED/DISK_FULL` which today has no dedicated UI.
- [ ] **Upload session resume/abort UI:** `GET /upload/status/:uploadId`, `DELETE /upload/:uploadId` unused. Show resume progress, cancel orphan sessions (now left to 6h server sweep).
- [ ] **Alternate output download/compare:** `JobEntry.alternateFile` displayed in `components/admin/JobRow.tsx:140` but not downloadable. Wire `GET /files/:id/download` (currently 0 callers — only `/transcode/download/:jobId` used) + `openComparison`.
- [ ] **Full probe inspector:** `useExtendedVideoMetadataMutation` pins `?includeFrames=false&includePackets=false`. Add toggle for `true/true` + stream/frame/packet viewer using already-returned `ffprobeReport`.
- [ ] **`x-upload-id` reuse for audio:** `routes/audio.ts:resolveInput` supports it, but `useAudioAnalysis`, `useAudioPreview.ts:171`, `AudioControls.tsx:62` always re-upload raw `FormData{file}`. Reuse chunked `uploadId` → 3x upload saving on large files.
- [ ] **`audioTracks[]` on subtitles + bulk:** forwarded on crop/cut/mobile, omitted in `subtitles/useSubtitleExport.ts:57` and bulk per-track choice. Add track picker there in the BulkExpandedView per-video settings.
- [ ] **`customFFmpegArgs` everywhere:** only `Sidebar.tsx` has `Textarea`. Hardcoded `""` in `useMobileExport/useCutExport/useSubtitleExport/useBulkExport`. Add advanced collapsible.
- [ ] **`POST /transcode/clear` alias:** dead. Either use it or delete.

### 2. Editor UX — cross-cutting

- [ ] **URL-synced state:** Zero `useSearchParams` in `app/`. Admin `filter`, trim, `expandedId`, mode, cut list should sync to `?filter=&mode=&t=` for share/deep-link/back-button.
- [ ] **`loading.tsx` / `error.tsx` / `not-found.tsx` / `global-error.tsx`:** None exist. Any render throw blanks shell. Create ErroBoundary component.
- [ ] **Global undo/redo:** Only mobile has `mobileSlice` history. Add for crop rect, cuts, subtitles, filters.
- [ ] **Export filename centralization:** `stripExtension/sanitize` scattered in `video-file.ts`, `useExportName`, bulk. Add `lib/export-filename.ts` + live uniqueness check.
- [ ] **Unified `ExportSettingsSidebar` + `useExportBase(kind)`:** `Sidebar.tsx:114-1127`, `CutSettingsSidebar`, `BulkSettingsPanel`, `PreviewPanel` repeat format/fps/quality/preflight/queue badge. Same for 4x `use*Export` hooks — extract base (validate → enqueue → badge).
- [ ] **Unified `VideoStage`:** `VideoPlayer`, `SourceStage`, `PortraitPreview`, `CutPreview`, `CellPreview` repeat letterbox + overlay + `usePlaybackEngine` wiring.
- [ ] **Keyboard-accessible timelines:** `TimelineVisual`, `AudioWaveform.tsx:97`, `CropOverlay`, `useTimelineDrag.ts` are pointer-only. Add slider fallback + nudge (`←/→` 1 frame, `Shift` 10).
- [ ] **Command palette extensions:** `CommandPalette.tsx` only nav + transport. Add `Export now / Retry last / Toggle watermark / Apply preset / Go to admin filter`.
- [ ] **Shortcuts help overlay:** `?` opens palette but no cheatsheet dialog. Add `ShortcutsDialog`.
- [ ] **Notifications:** `saveBlobFile.save` + `openComparison` only. Add `Notification API` / sound on `completed/failed` for background bulk jobs.
- [ ] **Recent files / drag-drop anywhere:** Only `VideoUploader` handles drop. Add global drop target + `localStorage` recent (name/size, not bytes) + `UploadOtherButton` everywhere.

### 3. Page-specific

**Crop (`pageEditorCrop.tsx`):**

- [ ] Aspect presets (1:1, 4:5, 16:9, 9:16) + rotation/flip — `CropOverlay.tsx:1` (347 lines) only free-drag.
- [ ] Replace hardcoded `-vf eq=contrast=1.2` in `Sidebar.tsx:969` with `@repo/ffmpeg-filters` builder.

**Mobile (`pageEditorMobile.tsx`):**

- [ ] Custom watermark image upload (now boolean `Switch` only).
- [ ] Safe-area guides toggle already in `PreviewPanel` — persist per-layout.

**Subtitles (22 files):**

- [ ] SRT/VTT import/export — only PNG burn-in via `renderAllSubtitlesToPngs` exists.
- [ ] Template gallery search/share — `template-cache.ts` local only.
- [ ] Auto-distribute / retime already partially in `retimeSubtitlesToTrim` — add snap-to-scene, spellcheck.

**Bulk (`pageEditorMobileBulk.tsx`):**

- [ ] Per-item trim/crop override — now `trimRange:[0,duration], ignoreTrim:true` hardcoded in `useBulkExport.ts`.
- [ ] Per-item track + args picker, retry-selected, CSV manifest export.
- [ ] Folder sync diff (added/removed detection) — `onFolderChosen` only appends.

**Cut (`pageEditorCut.tsx`):**

- [ ] Ripple delete, snap-to-playhead, zoomable ruler, cut transitions/fades.
- [ ] Export-name free text already in `CutSettingsSidebar:184` — add validation + dedupe.

**Admin (`pageAdmin.tsx`):**

- [ ] Pagination/sorting/search (now single-loop `filteredAndCounts` + `useDeferredValue`, will break at scale).
- [ ] `logTail` viewer modal (SSE already returns it, `withLogTail` truncates to 2000ch with no UI).
- [ ] Bulk retry/re-queue from server `settingsJson` — now depends on local `exportHistorySlice` (unknown jobs un-retryable).
- [ ] Replace blocking `confirm()` in `useAdminJobs.ts:121` with Shadcn `AlertDialog` + undo toast.
- [ ] Queue graphs (active/queued over time from `/jobs/stream` 1s ticks).

---

## PART 2: Maintainability / Performance Fixes

### A. Decompose god files (highest ROI)

- [ ] `components/editor/Sidebar.tsx:114` **1127 lines** — merges `{...source,...crop,...cut}` in `:120` (any slice re-renders whole form) + file-pick `:178` + aspect `:227` + preflight `:294` + validate `:467` + zoom `:691`. Split → `ExportFormFields / FilePicker / PresetPicker / PreflightSummary / useCropExport`.
- [ ] `components/admin/useAdminJobs.ts:37` **444 lines**, 25 return keys → `useAdminDerived` + `useAdminHistoryActions`.
- [ ] Break up: `BulkExpandedView.tsx:1` 430, `CropOverlay.tsx:1` 347, `AudioControls.tsx:1` 331, `TimelineVisual.tsx:1` 326, `VisualFiltersPanel.tsx:1` 325, `MobilePreviewShared.tsx:1` 317, `GoogleFontPicker.tsx:1` 312, `JobRow.tsx:1` 290, `QueueDock.tsx:1` 276, `PreviewPane.tsx:1` 257, `useAudioPreview.ts:1` 247.

### B. Delete duplication

- [ ] `UploadOtherButton` x4 (`shared/` + `crop/` + `cut/` + `mobile/`) → keep shared only.
- [ ] `useVideoPlayer` == `usePlaybackEngine` alias + `subtitles/useVideoPlayback` + `cut/useCutPlayback` wrappers → collapse to engine + options.
- [ ] `editor/PlayerControls.tsx` vs `shared/VideoPlayerControls.tsx` → merge.
- [ ] `subtitles/pointer-bus.ts` + `admin/helpers.ts` scroll/touch buses vs `lib/global-listener-bus.ts` → migrate all to bus.
- [ ] `useVideoMetadataMutation` vs `useExtendedVideoMetadataMutation` (`hooks/useVideoMetadata.ts:33,139`, 80% dup) → `createMetadataMutation({extended})`.
- [ ] `selectActiveCount` vs `activeQueueCount` in `exportQueueSlice.ts` → delete one.
- [ ] `CutSettingsSidebar/ZoneSliders` vs `TrimSlider` vs `ZoneCard` sliders → unify via `mobileLayoutService.clamp`.
- [ ] `TabSwitcher.tsx` (default export, superseded by `AppNav`) — delete if no route imports. Same `subtitles/heavy-modules:NOOP` (use `@/lib/utils`), `admin/placeholders:DynamicCardProbe`, `admin/hooks:useLatest` dead ref.

### C. State architecture

- [ ] Split overloaded `store/cutSlice.ts` → `exportPrefsSlice` (format/fps/quality/speed/filename/args) vs `cutUiSlice`. It doubles as global prefs mutated by metadata race-guard.
- [ ] Fix anemic `store/mobileSlice.ts` (single `isLoopEnabled` bool; layout lives in `lib/mobile-layout.ts:522` + local hooks) — move layout into store or document why not.
- [ ] Fix `useSharedMobileLayout.ts` same-tab broadcast gap (only `storage/focus` listeners) — add bus or move to store.
- [ ] Document/enforce `playheadSlice.ts` duality (`playheadAtom` 60fps vs `source.currentTime` committed) — easy to misuse `getCommittedTime` vs `getPlayheadTime`.

### D. Next.js / bundle perf

- [ ] Remove `"use client"` noise on pure libs (`lib/subtitles/renderSubtitlePng.ts:1`, `googleFonts.ts:1`, `store/playheadSlice.ts:1`, `hooks/*`, `admin/helpers.ts`) + double wrapper `app/editor/*/page.tsx:1` + `app/pageEditor*.tsx:1`.
- [ ] `app/providers.tsx:37-39` mounts `CompareDialog+QueueDock+CommandHost` on every route + `layout.tsx:8-17` loads `Inter+JetBrains_Mono` + theme script globally — lazy-mount via `next/dynamic` + `preload` on intent.
- [ ] `next.config.ts:6` `transpilePackages:[contracts,types]` misses `@repo/ffmpeg-filters,@repo/ui` → dual copies risk. Add both.
- [ ] `package.json:12-30`: `shadcn@4.21` in runtime `dependencies` → `devDeps`; `@base-ui/react:1.8` + `cmdk:1.1` overlap → pick one; verify `lucide-react:1.44` major jump; `@radix-ui/react-icons` optimized in `next.config.ts:9` but not in deps — remove.
- [ ] Code-split inconsistency: `heavy-modules.tsx:48,73`, `crop/VideoPlayerLazy.tsx:5`, `admin/heavy.tsx:42,56` use `dynamic(ssr:false)` but `bulk/CellPreview.tsx`, `BulkExpandedView.tsx` statically import canvas; `useAdminJobs.ts:159,238` bare `import()` with no `preloadHeavy*` on hover — add intent preload like subtitles/mobile.
- [ ] Preview/export drift risk: 4x `drawImage` crop+split math (`MobilePreviewShared:43,312`, `usePortraitCanvas:86,151`, `CellPreview:43,107`, `BulkExpandedView:38,147` hardcodes `1080,1920*split`) vs exporter `mobile-layout.ts:427,433` with comment `:417 "Must match..."` but no shared helper — extract `drawZoneToCanvas()` tested against filter builder.

### E. Upload / SSE correctness

- [ ] **Double-send bug:** `export-queue.ts:276-279,368-392` builds `FormData{file}` then `fetch(endpoint,{headers:{x-upload-id}, body:form:385})` — 256MB+ buffered twice. Strip `file` when `x-upload-id` present / send settings-only.
- [ ] Chunked `upload-chunked.ts:107` sequential `for` + `blob.arrayBuffer():116` per 8MB chunk, no parallelism/resume/checksum/`Content-Range` — add 3-4 parallel workers + resume via `GET /upload/status`.
- [ ] `upload-chunked.ts:89` init error only reads `err.error`, misses `{message,issues}` envelope (`transcode-jobs.ts:82`) — unify.
- [ ] `transcode-progress.ts:124` `awaitCompletion` does `void dispose` → unleakable `EventSource` on unmount. Return `[promise,dispose]`. Add jitter to fixed `[2s,2s,2s]` backoff `:100`, don't swallow JSON `catch{}` `:98`.
- [ ] `useAdminJobs.ts:66` overrides global `staleTime:5s,refetchOnWindowFocus:false` with `staleTime:0,gcTime:0,refetchOnWindowFocus:true` → defeats SSE `setQueryData:77` no-flash path. Align.
- [ ] `URL.createObjectURL` churn (23 hits): `export-queue.ts:424`, `export-history.ts:83`, `Sidebar:189,429`, `VideoUploader:44`, `bulk/*` — add explicit revoke on `dismiss`/dialog-close (`compareSlice.ts:41,55` only covers compare).

### F. Errors / types / a11y / hygiene

- [ ] 20+ bare `}catch{}` (`mobile-layout:449`, `useSharedMobile:21`, `export-presets:142`, `sourceSlice:93,107`, `exportHistorySlice:47`, `subtitleStorage:76,98`, etc.) → at least `console.warn`.
- [ ] `api-client.ts:210 requestJson` loses `status/Retry-After/issues` (only XHR path shapes 429). Add `429/507/422` branches for `get/post/formPost`.
- [ ] Zero `*.test.*`, no `test` script (`package.json:5-11` only `dev/build/start/lint/typecheck`, `lint` bare `eslint`). Add `vitest` + `query-keys` + `mobile-layout` + `validate-settings` unit tests first.
- [ ] `eslint.config.mjs:12-15` globally disables `react-hooks/refs`, `set-state-in-effect` — re-enable (repo syncs media in effects heavily).
- [ ] `tsconfig.json:target ES2017` vs Next 16 + TS 7.0.2 + `skipLibCheck:true` hides `@repo/*` drift — bump to `ES2022`, un-skip for workspace packages.
- [ ] Centralize `lib/query-keys.ts` (`["admin-jobs"]` literal in 7 places, ad-hoc `["audio-analysis",...]`, no `mutationKey`) + replace `invalidateRef` (`useRef+useEffect`) with `useCallback([queryClient])`.
- [ ] Type safety: `api-client.ts:22` redefines `VideoMetadata/AudioAnalysis` vs `@repo/types`; casts `as VideoMetadata:68,174`, `as TranscodeResponse:392`, `as unknown as` x3 — `zod.parse` server payloads; import `MULTIPART_FIELDS, UPLOAD_ID_HEADER, migrateRenderPlan` (currently 0 hits in web); add `assertSubtitle/Bulk/AudioExtract` (now misusing `assertMobile`).
- [ ] A11y: `TrimControls.tsx:148` `aria-disabled` without `disabled`; `GoogleFontPicker:154,163` missing `aria-expanded/controls`; hidden bulk `<input tabIndex={-1}>` no label. Fix + add `label` associations.
- [ ] CSS: `globals.css:561` audit dead `kumo-*` tokens; extract arbitrary values (`CompareDialog:26 max-w-[calc...] h-[36vh]`, `AppSidebar:115 text-[10px]`, `JobsList:65 style opacity`) to tokens. Remove debug `toast.info(Updated store ${bitrateKbps})` in `useVideoMetadata.ts:124`.
