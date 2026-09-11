# TODO_NOTES — verification of TODO.md against the live tree

Generated: 2026-09-11. Every claim in TODO.md checked against the code.
Verdicts: ✅ accurate · 🔄 stale (code moved on, TODO needs edit) · ❌ wrong.

## PART 1 §1 — marked done ([x]): 7× ✅, 2× 🔄 (refs drifted, features real)

1. Health dashboard — 🔄 refs drifted. `lib/preflight.ts:157` now probes
   lightweight `GET /health`, not "heavy `GET /transcode/jobs`" (`:168`).
   Status dot + ffmpeg/disk/queue line in AdminHeader/JobsArea: ✅.
   Fix: update the `preflight.ts:168` ref.
2. Storage dashboard — 🔄 location drifted. Quota bar + Sweep now live in
   `components/admin/StorageArea.tsx:26`, extracted out of `JobsArea`.
   30 s poll, 90% warn: ✅. Fix: `JobsArea` → `StorageArea`.
3. Upload resume UI — ✅ (`export-queue.ts:347` "Resumed upload from …%").
4. Alternate output — ✅ (`JobRow.tsx:150` `alternateFile`, `-alt` suffix,
   `openFileComparison`, `downloadPlan` in `useAdminJobs`).
5. Probe inspector — ✅ (`metadata.ts:36` `splitPacketsAndFrames` + unit test,
   `ProbeInspector` tabs, `{file,includeFrames,includePackets}` vars).
6. `x-upload-id` audio — ✅ (`audio-upload.ts:56` `ensureTransport`, all
   five consumers wired).
7. `audioTracks[]` subtitles+bulk — ✅ (`mobileSubtitlesBuilder.ts:54`,
   route forwards `settings.audioTracks`, per-video bulk picker).
8. `customFFmpegArgs` everywhere — ✅ (shared `CustomArgsCollapsible` in all
   five forms, `CUSTOM_ARGS_INVALID` at `routes/video.ts:800`).
9. `POST /transcode/clear` deleted — ✅ (only `app.delete("/transcode/jobs"`,
   `:1480`; no stale README mentions).

## PART 1 §2 — cross-cutting gaps: 8× ✅, 1× 🔄, 2× 🔄 (premise deleted)

- URL-synced state — ✅ gap real (0 `useSearchParams` in `app/`).
- `loading/error/not-found/global-error` — ✅ gap real. Bonus: TODO itself
  has a typo, "Create ErroBoundary component".
- Global undo/redo — 🔄 premise gone. `store/mobileSlice.ts` no longer
  exists (merged into `sourceSlice`); only history left is mobile
  `useMobileEditor.ts:52` `undoOp`/`redoOp`. Rewrite item without
  `mobileSlice`.
- Export filename centralization — ✅ (`stripExtension` in `video-file.ts:98`
  - 9 call sites, `useExportName` in `cut/useCutExport.ts:126`,
    no `lib/export-filename.ts`).
- Unified `ExportSettingsSidebar`/`useExportBase` — ✅ (`Sidebar.tsx` 1123
  lines, 4× `use*Export`, 0 hits for either name).
- Unified `VideoStage` — ✅ (5 separate previews, each wires
  `shared/usePlaybackEngine.ts:130`).
- Keyboard timelines — ✅ (pointer-only; only global `ArrowLeft/Right`
  transport in `useGlobalShortcuts.ts:76`).
- Command palette extensions — 🔄 premise deleted. `CommandPalette.tsx` is
  gone (only `useGlobalShortcuts.ts` remains, no `CommandHost` in
  providers). Decide: re-add a palette or drop the item.
- Shortcuts help overlay — 🔄 same: no `?` binding, no palette/cheatsheet.
  Depends on the palette decision above.
- Notifications — ✅ gap real (0 `Notification` hits; completion is
  `saveBlobFile.save` + `openComparison` only).
- Recent files / global drop — ✅ gap real (`onDrop` only in
  `VideoUploader.tsx:104`). Note: `UploadOtherButton` is already the single
  shared button (3 headers import it) — that half of the item is done.

## PART 1 §3 — page-specific: 4× ✅, 3× 🔄/❌

- Crop — 🔄 half done, half mispointed. Aspect presets + rotation/flip
  EXIST (`CropOverlay.tsx:34`, `Sidebar.tsx:631`, `VisualFiltersPanel.tsx:213`)
  — "only free-drag" is stale. The `-vf eq=contrast=1.2` ref is ❌:
  `eq=contrast` survives only as a `CustomArgsCollapsible.tsx:39`
  placeholder; `Sidebar.tsx:969` is now a custom-fps input. Rewrite item
  around what is actually missing.
- Mobile — ✅ (watermark Switch-only ×3 files, safe-area toggle
  `PreviewPanel.tsx:97` prop-only, unpersisted).
- Subtitles — ✅ gap, 🔄 ref. SRT/VTT import/export still absent (only PNG
  burn-in); `retimeSubtitlesToTrim` still partial. But `template-cache.ts`
  is DELETED (now `subtitleStorage.ts` + `useSubtitleTemplates.ts:19`) —
  fix the "local only" ref.
- Bulk — ✅ gap, ❌ detail. `trimRange:[0,duration]` + `ignoreTrim:true`
  hardcode confirmed (`useBulkExport.ts:75-76`). But `onFolderChosen`
  REPLACES (`bulk/hooks.ts:96`), it does not "only append". Also note:
  per-video audio-track picker already exists (Part 1 §1 item 7) — narrow
  "per-item track + args picker" to args-picker/retry-selected/CSV.
- Cut — ✅ (`CutSettingsSidebar.tsx:186` name input, no validation/dedupe;
  no ripple/snap/zoom/fades).
- Admin — ✅ mostly, 🔄 one. Scale risk (`useDeferredValue` +
  `filteredAndCounts`) ✅, `confirm()` ✅ but line moved `:121` → `:161`
  (plus copies in `JobRow.tsx:55,65`), graphs ✅ absent. But "logTail …
  with no UI" is 🔄: `JobRow.tsx:221` renders it in a `<details>` block —
  a modal/polish upgrade, not a from-zero viewer.

## PART 2A — god files: all ✅, and all worse than stated — refresh numbers

| File                        | TODO says           | Tree now                                               |
| --------------------------- | ------------------- | ------------------------------------------------------ |
| `editor/Sidebar.tsx`        | 1127                | 1123 (`{...source,...crop,...cut}` merge alive `:121`) |
| `admin/useAdminJobs.ts`     | 444 lines / 25 keys | **511 lines / 36 keys** (`:471-508`)                   |
| `bulk/BulkExpandedView.tsx` | 430                 | **528**                                                |
| `CropOverlay.tsx`           | 347                 | 347                                                    |
| `AudioControls.tsx`         | 331 (`shared/`)     | 332 (lives in `editor/`, not `shared/`)                |
| `TimelineVisual.tsx`        | 326                 | 326                                                    |
| `VisualFiltersPanel.tsx`    | 325                 | 335                                                    |
| `MobilePreviewShared.tsx`   | 317                 | 323                                                    |
| `GoogleFontPicker.tsx`      | 312                 | 312                                                    |
| `admin/JobRow.tsx`          | 290                 | **324**                                                |
| `export/QueueDock.tsx`      | 276                 | 276                                                    |
| `subtitles/PreviewPane.tsx` | 257                 | 257                                                    |
| `hooks/useAudioPreview.ts`  | 247                 | 257                                                    |

## PART 2B — duplication: 5× 🔄 done, 3× ✅ open, 2× ❌ misattributed

- `UploadOtherButton` ×4 — 🔄 done: only `shared/UploadOtherButton.tsx:59`
  remains, 3 headers import it.
- `useVideoPlayer` alias — 🔄 done (0 hits). But `subtitles/useVideoPlayback`
  - `cut/useCutPlayback` wrappers still wrap the engine — keep that half.
- `PlayerControls` vs `VideoPlayerControls` — ✅ open (store-adapter over
  shared controls, `:11,23` vs `:45`).
- `pointer-bus` + admin scroll/touch buses — 🔄 done (shim gone,
  `global-listener-bus.ts:3,78-84` owns pointer+scroll/touch).
- Metadata mutation dup — ✅ open but overstated: refs moved `:33,139` →
  `:72,159`, no factory, yet both share `fetchVideoMetadata:31` — not
  "80% dup" anymore. Soften the claim.
- `selectActiveCount` vs `activeQueueCount` — 🔄 done (0 hits for the
  former; `exportQueueSlice.ts:107` keeps the latter).
- Slider unification — ✅ open (3 separate sliders; `clamp` already at
  30+ call sites but no unification).
- `TabSwitcher` — 🔄 done (file gone). `DynamicCardProbe` — 🔄 done (now
  `preloadHeavyCard` in `admin/heavy.tsx:18`). `heavy-modules:NOOP` —
  ❌ misattributed (`heavy-modules.tsx:1-65` has no NOOP; canonical `NOOP`
  is `lib/utils.ts:4`). `useLatest` dead ref — ❌ alive
  (`admin/hooks.ts:6`, used in `useAdminJobs.ts:96`, `useJobsLiveSync.ts:5`).

## PART 2C — state: 3× 🔄 done, 1× ✅

- Overloaded `cutSlice` — 🔄 done: 45 lines, single `isSidebarOpen` bool.
  Delete the item.
- Anemic `mobileSlice` — 🔄 done: file deleted (folded into `sourceSlice`).
  Delete the item.
- Same-tab broadcast gap — ✅ open (`useSharedMobileLayout.ts:20` only
  `storage`+`focus`).
- `playheadSlice` duality — 🔄 half done: `getCommittedTime`/
  `subscribeToPlayhead` deleted (only `getPlayheadTime`/`commit`/`set`
  remain). Keep only if a doc comment on the 60fps-vs-committed duality is
  still wanted.

## PART 2D — perf: 5× ✅, 2× 🔄/❌

- `"use client"` on pure libs — ✅ (`renderSubtitlePng`, `googleFonts`,
  `playheadSlice`, `hooks/*` all carry it; `admin/helpers.ts:1` clean).
  But "double wrapper `page.tsx` + `pageEditor*`" is ❌: single thin wrapper.
- Global mounts (dialog/dock/fonts/theme) — ✅, minus `CommandHost`
  (🔄 deleted with the palette).
- `transpilePackages` — ✅ still `["@repo/contracts","@repo/types"]`
  (`next.config.ts:6`), missing `ffmpeg-filters` + `ui`.
- `package.json` deps — ✅ (`shadcn` in deps `:28`, `base-ui`+`cmdk`
  overlap, `lucide-react ^1.44.0`, `radix/react-icons` optimized but absent).
- Code-split — ✅ with two corrections: `useAdminJobs` hover-preload gap is
  🔄 fixed (`:21,450`); `admin/heavy.tsx` is an import-map, not a
  `dynamic()` site — reword that clause.
- Preview/export drift — ✅ (`mobile-layout.ts:342` "Must match canvas",
  hand-rolled `drawImage` split math in `CellPreview:80`/
  `BulkExpandedView:124`, only `zoneToPixels` shared).

## PART 2E — upload/SSE: 3× 🔄 fixed, 2× ✅, 1× ❌

- Double-send — 🔄 fixed (`export-queue.ts:351` `submitWithUpload` +
  `buildForm(includeFile)`; chunked omits the file). Delete the item.
- Chunked parallelism/checksum — ✅ open (sequential `for :176`,
  `arrayBuffer() :188`, no workers/checksum/`Content-Range`). Note:
  resume + retry have since been added (`:114,188`) — scope the item to
  parallelism/integrity.
- Error envelope — 🔄 fixed (`:205` uses `serverErrorMessage`,
  issues-aware). Delete the item.
- `awaitCompletion` leak/backoff — 🔄 fixed by deletion (API is now
  `subscribe`; `:68` dispose clears timer + closes; backoff still fixed
  `[2000,2000,2000]` `:54`, bare `catch{}` `:96` — fold remnants into the
  bare-catch item below).
- Query `staleTime` override — ✅ (`useAdminJobs.ts:110-113`).
- `createObjectURL` churn — ❌ overstated: ~11 sites (not 23), revokes
  widespread (`useAudioPreview:189`, `compareSlice:41`,
  `save-blob-file:143`, `bulk/hooks:49`, `VideoUploader:48`). Downgrade to
  a spot-check of the remaining unrevoked paths, if any.

## PART 2F — hygiene: 5× ✅, 2× 🔄, 3× ❌

- Bare `catch{}` — ✅ (~14: `transcode-progress:96`,
  `storage-json:48`, `renderSubtitlePng:70`).
- `api-client` error branches — ✅ (`requestJson :218` throws bare `Error`;
  429/507/422 live only in `transcode-jobs.ts:106`).
- Zero tests — ❌ half wrong: web still has none, but the API has
  `bun test` + `api/test/*.test.ts` and `contracts/test/*.test.ts`.
  Rescope to web (or add query-keys/mobile-layout/validate-settings API-side
  coverage first — those modules the item names are web-side, so keep the
  ask, fix the premise).
- `eslint.config.mjs` disables — ❌ no such file at root. Find the real
  eslint config and re-verify before touching.
- `target ES2017` + `skipLibCheck` — ✅ (`tsconfig.json:3,6`).
- Query keys — ✅ (no `lib/query-keys.ts`, ~7 `["admin-jobs"]` literals,
  `invalidateRef` pattern at `useAdminJobs.ts:131`).
- Type safety — ✅ except one sub-claim: `assertMobile` misuse ❌ (correctly
  used; only generic/mobile/cut asserts exist at `validate-settings:36,49,62`).
  Casts/redefinitions/0 contract hits confirmed.
- A11y — ✅ except `TrimControls` `aria-disabled` 🔄 already fixed (prop
  deleted). `GoogleFontPicker:135` (label only, no expanded/controls) ✅,
  hidden bulk input `BulkEmptyState.tsx:38` ✅.
- CSS/hygiene — mixed: dead `kumo-*` tokens ❌ (active at `:543`, not dead);
  arbitrary values ✅ (`CompareDialog:23`, `JobsList:69`); debug
  `toast.info(Updated store…)` ✅ but moved `:124` → `:141`.

## Meta-fixes for TODO.md itself

- Header stats (line 3): "11 slices" → 10 (`mobileSlice` merged); re-count
  `components/`/`lib/` files if the numbers matter.
- Line 6 ("update README/AGENTS per changes") still stands.
- Sweep all `file:line` refs — at least 10 drifted (list above). Prefer
  `symbol` refs over `:line` where churn is high.
- Highest-value TODO edits: delete/close ~10 resolved Part-2 items
  (B×5, C×2.5, E×3, F-`useLatest`/dead-tokens), rewrite the 3
  premise-deleted items (palette ×2, undo), fix the 4 factually-wrong
  details (Crop eq-contrast, folder-append, logTail-UI, objectURL-23).
