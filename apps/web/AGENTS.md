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
   chunked (`uploadFileChunked`, >256 MB via `/upload/init-chunk-complete`)
   or direct (`uploadFormWithProgress`) upload → `POST /transcode*` →
   `subscribeTranscodeProgress` (SSE `progressUrl`) → `saveBlobFile` +
   `openComparison`. Fire-and-forget: progress lives in `exportQueueSlice`
   (QueueDock + AppNav badge); `uploadId` reuse means big files upload once.
4. **State split.** TanStack Store (`store/`) = sync UI (file, trim, crop,
   filters, cuts, subtitles, history, compare). TanStack Query (`hooks/`,
   `useAdminJobs`) = async server state + SSE live sync. Never swap them.

## Where methods live

| Area          | Key files                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes        | `app/editor/crop` \| mobile \| mobile/subtitles \| mobile/bulk \| `cut/page.tsx`→ thin `app/pageEditor*.tsx`+`app/admin/page.tsx`→`app/pageAdmin.tsx`                                                                                          |
| Crop          | `components/editor/crop/CropWorkspace.tsx`, `CropArea.tsx`/`CropOverlay.tsx`, `VideoPlayer.tsx` (+`crop/VideoPlayerLazy.tsx`), `editor/Sidebar.tsx` (export form), `TrimControls.tsx`, `VisualFiltersPanel.tsx`                                |
| Mobile        | `components/editor/mobile/MobileArea` \| SourcePanel \| PreviewPanel \| PortraitPreview \| ZoneCard \| ZoneOverlay \| `SourceStage.tsx`, `useMobilePageState.ts`, `useMobileExport.ts`                                                         |
| Subtitles     | `components/editor/subtitles/useSubtitleEditor.ts`, `PreviewPane.tsx`, `SubtitleListPanel.tsx`/`SubtitleRow.tsx`, `SubtitleSettingsPanel.tsx` (+Basics/Font/Outline/Shadow/Background), `TimelineSection.tsx`, `heavy-modules.tsx`             |
| Bulk          | `components/editor/bulk/hooks.ts` (`useBulkEditorState`), `useBulkExport.ts`, `BulkArea` \| Header \| ItemCard \| ExpandedView \| `SettingsPanel.tsx`, `CellPreview.tsx`                                                                       |
| Cut           | `components/editor/cut/useCutList` \| useCutPlayback \| useCutLayouts \| `useCutExport.ts`, `CutTimeline` \| CutList \| CutBlock \| CutPreview \| CutSettingsSidebar \| CutHeader \| `ZoneSliders.tsx`                                         |
| Admin         | `components/admin/useAdminJobs.ts`, `JobsArea` \| JobsList \| JobRow \| FilterBar \| AdminHeader \| `ExtractRows.tsx`, `components/export/CompareDialog.tsx` \| `components/export/QueueDock.tsx` (global, mounted in providers)               |
| Shared editor | `VideoPlayer.tsx`, `PlayerControls.tsx` (+`shared/VideoPlayerControls.tsx`), `AudioControls.tsx`, `AudioWaveform.tsx`, `VideoUploader.tsx`, `UploadProgress.tsx`, `TabSwitcher.tsx`, `shared/TrimSlider` \| EmptyState \| `CapabilityCard.tsx` |
| `lib/`        | One service/util per file — see `lib/` table below.                                                                                                                                                                                            |
| `hooks/`      | `useVideoMetadata.ts`, `useAudioAnalysis.ts`, `useAudioPreview.ts`, `useSharedMobileLayout.ts`                                                                                                                                                 |
| `store/`      | `sourceSlice` (file/mediaUrl/trim), `cropSlice`, `cutSlice`, `filterSlice` (visual filters), `audioSlice`, `subtitleSlice`, `mobileSlice`, `exportHistorySlice`, `exportQueueSlice` (export queue rows + dock), `compareSlice`                 |

### `lib/` services & utils

| File                     | Owns / exports                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `api-client.ts`          | `APIClient` service: `apiClient.url/get/post/formPost/patch/delete/postBlob`                   |
| `export-queue.ts`        | `ExportQueue` service: `exportQueue.enqueue/cancel/dismiss`                                    |
| `export-history.ts`      | `ExportHistory` service: `exportHistory.renameJob/retryEntry/openComparison/retryAudioExtract` |
| `export-presets.ts`      | `ExportPresets` service: `exportPresets.all/customs/save/remove/toPatch`                       |
| `global-listener-bus.ts` | `GlobalListenerBus` service: pointer move/up + admin scroll/touch buses                        |
| `upload-chunked.ts`      | `uploadFileChunked` (>256 MB), `uploadFormWithProgress` (XHR progress), `shouldUseChunked`     |
| `transcode-progress.ts`  | `subscribeTranscodeProgress` (SSE `progressUrl` fan-out)                                       |
| `transcode-jobs.ts`      | `cancelTranscodeJob`, envelope errors (`serverErrorMessage`, `throwTranscodeHttpError`)        |
| `preflight.ts`           | `preflightExport` (fail-fast summary), `probeApiConnectivity`                                  |
| `validate-settings.ts`   | contracts pre-validation before every `POST`                                                   |
| `playback-bus.ts`        | global transport bus (shortcuts/palette → active `<video>` + `sourceStore`)                    |
| `video-file.ts`          | accepted input attrs, size guards, filename helpers                                            |
| `mobile-layout.ts`       | mobile layout math shared with preview                                                         |
| `format-time.ts`         | `formatTime` display helper                                                                    |
| `save-blob-file.ts`      | `saveBlobFile` (picker), `fetchDownloadBlob`, `pickerTypesForExt`                              |
| `preload.ts`             | hover/focus intent preloads (`preloadUploadChunked`)                                           |
| `utils.ts`               | `cn` re-export, `NOOP` default callback                                                        |
| `subtitles/`             | PNG render, Google Fonts, defaults, storage, subtitle types                                    |

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
