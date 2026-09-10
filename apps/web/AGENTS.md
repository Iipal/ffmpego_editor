<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Frontend instructions (`apps/web`) — for LLM agents

Next.js App Router, all pages `"use client"`, `next dev -p 3050`.
Full diagrams + page→component maps: `apps/web/README.md` §1–§2.
API at `http://localhost:3100` (`NEXT_PUBLIC_API_URL`); details in
`apps/api/README.md` + `apps/api/AGENTS.md`.

## How it works

1. **Shell.** `app/layout.tsx` (fonts/css) → `app/providers.tsx`
   (Theme + QueryClient `staleTime` 5 s + Tooltip + global `CompareDialog`) →
   `AppSidebar`/`AppNav` → route page → `DirectionalTransition`.
   `/` redirects to `/editor/crop`. Nav order: crop → mobile →
   mobile/subtitles → mobile/bulk → cut → admin.
2. **Page pattern.** Thin composer (`app/pageEditor*.tsx`, `app/pageAdmin.tsx`)
   - colocated state hooks + `components/` UI. No-video → `*EmptyState`
     (`VideoUploader`); with video → header + area + panels.
3. **Export path.** `VideoUploader` pick → `useVideoMetadataMutation`
   (`POST /metadata`) → editors call `exportQueue.enqueue` (`lib/export-queue.ts` service):
   chunked (`uploadChunked.uploadFile`, >256 MB via `/upload/init-chunk-complete`)
   or direct (`uploadChunked.uploadForm`) upload → `POST /transcode*` →
   `transcodeProgress.subscribe` (SSE `progressUrl`) → `saveBlobFile` +
   `openComparison`. Fire-and-forget: progress lives in `exportQueueSlice`
   (QueueDock + AppNav badge); `uploadId` reuse means big files upload once.
4. **State split.** TanStack Store (`store/`) = sync UI (file, trim, crop,
   filters, cuts, subtitles, history, compare). TanStack Query (`hooks/`,
   `useAdminJobs`) = async server state + SSE live sync. Never swap them.

## Where methods live

### Routes

- `app/editor/crop` | mobile | mobile/subtitles | mobile/bulk |
  `cut/page.tsx` → thin `app/pageEditor*.tsx` + `app/admin/page.tsx` →
  `app/pageAdmin.tsx`

### Crop

- `components/editor/crop/CropWorkspace.tsx`, `CropArea.tsx`/`CropOverlay.tsx`,
  `VideoPlayer.tsx` (+`crop/VideoPlayerLazy.tsx`), `editor/Sidebar.tsx`
  (export form + Info section: deep-probe toggle → `useExtendedVideoMetadataMutation`
  with `includeFrames/includePackets` → `ProbeInspector` stream/format/frame/
  packet dialog over the returned `ffprobeReport`),
  `TrimControls.tsx`, `VisualFiltersPanel.tsx`

### Mobile

- `components/editor/mobile/MobileArea` | SourcePanel | PreviewPanel |
  PortraitPreview | ZoneCard | ZoneOverlay | `SourceStage.tsx`,
  `useMobilePageState.ts`, `useMobileExport.ts`

### Subtitles

- `components/editor/subtitles/useSubtitleEditor.ts`, `PreviewPane.tsx`,
  `SubtitleListPanel.tsx`/`SubtitleRow.tsx`, `SubtitleSettingsPanel.tsx`
  (+Basics/Font/Outline/Shadow/Background), `TimelineSection.tsx`,
  `heavy-modules.tsx`, `useSubtitleExport.ts` (forwards `audioTracks[]` from
  `audioStore`, v1 `mobile-subtitles` envelope)

### Bulk

- `components/editor/bulk/hooks.ts` (`useBulkEditorState`),
  `useBulkExport.ts` (per-item `BulkItem.audioTracks[]` → `POST /mobile`),
  `BulkArea` | Header | ItemCard | ExpandedView (per-video audio picker) |
  `SettingsPanel.tsx`, `CellPreview.tsx`

### Cut

- `components/editor/cut/useCutList` | useCutPlayback | useCutLayouts |
  `useCutExport.ts`, `CutTimeline` | CutList | CutBlock | CutPreview |
  CutSettingsSidebar | CutHeader | `ZoneSliders.tsx`

### Admin

- Jobs: `components/admin/useAdminJobs.ts`, `JobsArea` | JobsList | JobRow
  (incl. alternate output Alt download via `GET /api/files/:id/download` +
  Alt compare via `exportHistory.openFileComparison`) | FilterBar
- Readiness: AdminHeader (`GET /health` via `useHealthQuery`) — status dot +
  ffmpeg/disk/queue line
- Storage: `StorageArea` quota bar + Sweep (`GET /storage/stats` via
  `useStorageStatsQuery`, `POST /storage/sweep` mutation)
- Upload sessions: `UploadSessions` orphan/resume-progress list + Abort
  (`GET /upload/sessions` via `useUploadSessionsQuery`,
  `DELETE /upload/:id` mutation)
- Local extracts: `ExtractRows.tsx` (audio-extract history, no server job)
- Shared export UI: `components/export/CompareDialog.tsx` |
  `components/export/QueueDock.tsx` (global, mounted in providers)

## Shared editor components

- `VideoPlayer.tsx`, `PlayerControls.tsx`
  (+`shared/VideoPlayerControls.tsx`), `AudioControls.tsx`,
  `AudioWaveform.tsx`, `VideoUploader.tsx`, `UploadProgress.tsx`,
  `TabSwitcher.tsx`, `shared/AreaShell` (top-bar/readout-grid/hint card shell
  for Crop/Mobile/Bulk/Subtitle/Jobs areas) | `shared/TrimSlider` | EmptyState | `CapabilityCard.tsx`
- `CustomArgsCollapsible.tsx` — shared Advanced `customFFmpegArgs`
  free-text field (crop `Sidebar`, mobile `PreviewPanel`,
  `CutSettingsSidebar`, subtitles `SubtitleSettingsPanel`, bulk
  `BulkSettingsPanel`); backend `parseCustomArgs` denylist rejects managed
  flags with a 4xx the export error paths surface

### `hooks/` — async server state (TanStack Query + SSE live sync)

- `useVideoMetadata.ts` (initial + extended probe; extended takes
  `{file,includeFrames,includePackets}`), `useAudioAnalysis.ts`,
  `useAudioPreview.ts` (both via `audio-upload` session reuse, not raw
  FormData), `useSharedMobileLayout.ts`
- `useHealth.ts` (`GET /health` readiness poll)
- `useStorageStats.ts` (`GET /storage/stats` 30 s poll + sweep mutation)
- `useUploadSessions.ts` (`GET /upload/sessions` 10 s poll + abort mutation)

### `store/` — sync UI state (TanStack Store)

- `sourceSlice` (file/mediaUrl/trim), `cropSlice`, `cutSlice`,
  `filterSlice` (visual filters), `audioSlice`, `subtitleSlice`,
  `mobileSlice`, `playheadSlice`, `exportHistorySlice`,
  `exportQueueSlice` (export queue rows + dock), `compareSlice`

### `lib/` services & utils — one service/util per file

#### Transport & export pipeline

- `api-client.ts` — `APIClient` service:
  `apiClient.url/get/post/formPost/postWithUploadId/patch/delete/postBlob/postBlobWithUploadId`
- `export-queue.ts` — `ExportQueue` service:
  `exportQueue.enqueue/cancel/dismiss`
- `export-history.ts` — `ExportHistory` service:
  `exportHistory.renameJob/retryEntry/openComparison/openFileComparison/retryAudioExtract`
- `export-presets.ts` — `ExportPresets` service:
  `exportPresets.all/customs/save/remove/toPatch`
- `transcode-progress.ts` — `TranscodeProgress` service:
  `transcodeProgress.subscribe/awaitCompletion`
- `transcode-jobs.ts` — `TranscodeJobs` service:
  `transcodeJobs.cancelTranscodeJob/serverErrorMessage`
- `preflight.ts` — `Preflight` service: `preflight.check` (fail-fast gate),
  `probeApiConnectivity` via lightweight `GET /health`
- `save-blob-file.ts` — `SaveBlobFile` service:
  `saveBlobFile.save/fetchDownload/pickerTypesForExt`

#### Upload

- `upload-chunked.ts` — `UploadChunked` service:
  `uploadChunked.shouldUseChunked/uploadFile/uploadForm` (+ transparent
  resume via `upload-sessions` memory: status-verified `chunks[]` skip-set,
  `resumed/resumedBytes` result)
- `upload-sessions.ts` — session list/status/abort client + `localStorage`
  resume memory (name+size+lastModified key, 6 h TTL)
- `audio-upload.ts` — `AudioUpload` service:
  `audioUpload.ensureTransport/postJson/postBlob` (+ `postJsonWith`/
  `postBlobWith` fan-out variants): one chunked upload (>256 MB) cached per
  file serves analysis + preview pulls + extracts via `x-upload-id`
  (status-validated, evict + retry once on FILE_REQUIRED); small files keep
  direct FormData

#### Readiness & storage snapshots

- `health.ts` — `Health` service: `health.fetchHealth` (`GET /health`
  readiness snapshot: ffmpeg, disk, queue)
- `storage.ts` — `Storage` service: `storage.fetchStats`
  (`GET /api/storage/stats` census) + `runSweep`
  (`POST /api/storage/sweep`)

#### Validation, layout & media

- `validate-settings.ts` — `ValidateSettings` service:
  `validateSettings.assertGeneric/assertMobile/assertCut`
- `mobile-layout.ts` — `MobileLayoutService`:
  `mobileLayoutService.clamp/normalizeLayout/...`,
  `MobileLayoutService.OUTPUT_W/H`
- `video-file.ts` — `VideoFileService`:
  `videoFileService.isAcceptedVideoFile/formatFileSize/...`,
  `VideoFileService.MAX_UPLOAD_BYTES`
- `format-time.ts` — `formatTime` display helper
- `subtitles/` — PNG render, `GoogleFonts` + `SubtitleStorage` services

#### Playback & UI infra

- `playback-bus.ts` — `PlaybackBus` service:
  `playbackBus.togglePlay/seekBy/stepFrame/trim-loop`
- `global-listener-bus.ts` — `GlobalListenerBus` service: pointer move/up +
  admin scroll/touch buses
- `preload.ts` — hover/focus intent preloads (`preloadUploadChunked`)
- `utils.ts` — `cn` re-export, `NOOP` default callback

## Shared packages used

- `@repo/contracts` — validate with the same zod schemas the API enforces
  (`generic/mobile/cutSettingsSchema`, `normalizeTrimAlias`,
  `migrateRenderPlan`, `MULTIPART_FIELDS`, `UPLOAD_ID_*`, error envelope);
  used in `lib/validate-settings.ts`, `lib/export-presets.ts`.
- `@repo/types` — `TranscodeProgress/Response`, `FFprobeReport`,
  `MobileLayout/CropZone`, `Subtitle/*`, `CutSegment`; used in
  `lib/api-client.ts`, `lib/mobile-layout.ts`, `lib/subtitles/`.
- `@repo/ffmpeg-filters` — `zoneToPixels`, `cropPercentToPixels`,
  visual-filter builders shared with the server so canvas/CSS preview and
  the exporter never drift.
- `@repo/ui` — Shadcn primitives (`components/ui/*` re-export/wrap).
  **Hard rule:** `bunx --bun shadcn@latest add <c>` before any new UI element;
  never hand-roll button/dialog/slider/select/toast.
- `@repo/config` — shared ts/tailwind/eslint configs.

## Rules

- Query for async/server state, Store for sync UI — never inverted.
- Pre-validate via contracts before every `POST`; surface `issues[]` on 422;
  `429` → respect `Retry-After`; `507` → disk-full message, no blind retry.
- Downloads by opaque ID only (`/files/:id/download`,
  `/transcode/download/:jobId`, Range OK); never expect server paths.
- Keep `README.md` §2 page→component map in sync when pages change;
  `bun run typecheck` + `bun run lint` before finishing.
