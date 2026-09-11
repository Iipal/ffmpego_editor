# PLAN — apps/web implementation (merged TODO.md + TODO_NOTES.md)

Generated: 2026-09-11. Sources: `TODO.md` (2026-09-10) + `TODO_NOTES.md`
verification (2026-09-11) + ponytail over-engineering audit (scoped to TODO).
Verdicts: ✅ accurate · 🔄 stale/needs rewrite · ❌ wrong/dropped.
Rule (TODO line 6): update `README.md` + `AGENTS.md` per change made.
Refs below use `symbol` over `:line` — at least 10 TODO `:line` refs drifted.
Header stat fix: "11 slices" → 10 (`mobileSlice` merged into `sourceSlice`).
Task IDs: `1.xx` = Part 1, `2.xx` = Part 2. Refer as "task 1.07", "task 2.12".

## PART 1 §1 — done, no action ([x] ×9)

Collapsed. Corrections only: `preflight.ts` probes lightweight `GET /health`
(`:168`, not heavy jobs); quota bar + Sweep live in
`components/admin/StorageArea.tsx:26` (not `JobsArea`); `POST /transcode/clear`
deleted (`app.delete("/transcode/jobs"` `:1480`). Rest ✅ per NOTES.

## PART 1 §2 — cross-cutting

- [ ] **1.01** URL-synced state — ✅ gap real (0 `useSearchParams` in `app/`). Sync
      admin `filter`, trim, `expandedId`, mode, cut list to `?filter=&mode=&t=`.
      Ponytail: `delete` — local-only, drop unless share/deep-link demanded.
- [x] **1.02** `loading/error/not-found/global-error` — ✅ DONE 2026-09-11.
      `app/loading.tsx` (skeleton), `error.tsx` (`retry` prop, Next 16.3+
      stable), `not-found.tsx` (crop/admin links), `global-error.tsx` (own
      html/body, inline styles). Reuses installed Card/Button; no new deps.
- [ ] **1.03** Global undo/redo — 🔄 premise gone (`mobileSlice` deleted; only
      `useMobileEditor.ts:52` `undoOp/redoOp` remains). Rewrite without
      `mobileSlice`. Ponytail: `delete` — don't expand beyond mobile.
- [ ] **1.04** Export filename centralization — ✅ (`stripExtension`
      `video-file.ts:98`, 9 sites; `useExportName` `cut/useCutExport.ts:126`).
      Add `lib/export-filename.ts` + uniqueness check. Ponytail: `yagni` — skip
      new file, share helper inline.
- [ ] **1.05** Unified `ExportSettingsSidebar` + `useExportBase(kind)` — ✅
      (`Sidebar.tsx` 1123 lines, 4× `use*Export`). Ponytail: `yagni` — keep
      per-route panels, don't abstract.
- [ ] **1.06** Unified `VideoStage` — ✅ (5 previews × `usePlaybackEngine.ts:130`).
      Ponytail: `yagni` — keep separate overlays.
- [ ] **1.07** Keyboard-accessible timelines — ✅ (pointer-only;
      `useGlobalShortcuts.ts:76` transport only). Add slider fallback + nudge
      (`←/→` 1 frame, `Shift` 10). Keep — a11y, not speculative.
- [ ] **1.08** Command palette extensions — 🔄 premise deleted (`CommandPalette.tsx`
      gone, no `CommandHost`). Decision: DROP (ponytail `delete`). Re-add palette
      or close item.
- [ ] **1.09** Shortcuts help overlay — 🔄 same, depends on palette. Decision: DROP
      with palette.
- [ ] **1.10** Notifications — ✅ gap real (0 `Notification` hits). Ponytail: `delete`
      — `saveBlob` + compare toast suffice for local use.
- [ ] **1.11** Recent files / global drop — ✅ gap real (`onDrop` only
      `VideoUploader.tsx:104`); `UploadOtherButton` half DONE (single shared
      button, 3 headers import it). Ponytail: `delete` global-drop/recent part.

## PART 1 §3 — page-specific

- [ ] **1.12** Crop — 🔄 rewrite. Presets + rotation/flip EXIST (`CropOverlay.tsx:34`,
      `Sidebar.tsx:631`, `VisualFiltersPanel.tsx:213`); `-vf eq=contrast=1.2` ❌
      (only a `CustomArgsCollapsible.tsx:39` placeholder; `Sidebar.tsx:969` is a
      fps input). File new item around actual gap. Ponytail: `delete` expansion.
- [ ] **1.13** Mobile — ✅ (watermark Switch-only; safe-area toggle `PreviewPanel.tsx:97`
      prop-only unpersisted). Ponytail: `delete` — ship as-is.
- [ ] **1.14** Subtitles — ✅ gap, 🔄 ref (`template-cache.ts` DELETED → now
      `subtitleStorage.ts` + `useSubtitleTemplates.ts:19`). SRT/VTT
      import/export absent; `retimeSubtitlesToTrim` partial. Ponytail: `delete`.
- [ ] **1.15** Bulk — ✅ gap, ❌ detail fix: `trimRange:[0,duration]` + `ignoreTrim:true`
      confirmed (`useBulkExport.ts:75-76`); `onFolderChosen` REPLACES
      (`bulk/hooks.ts:96`), not appends; per-video audio picker EXISTS (narrow
      item to args-picker/retry-selected/CSV). Ponytail: `delete`.
- [ ] **1.16** Cut — ✅ (`CutSettingsSidebar.tsx:186` no validation/dedupe; no
      ripple/snap/zoom/fades). Ponytail: `delete` ripple/snap/zoom/fades; keep
      name validation only if cheap.
- [ ] **1.17** Admin — ✅ mostly, 🔄 one: scale risk ✅, `confirm()` ✅ at `:161` (+
      `JobRow.tsx:55,65` copies) → Shadcn `AlertDialog` + undo toast; graphs ✅
      absent; `logTail` is `<details>` polish (`JobRow.tsx:221`), not from-zero.
      Ponytail: `delete` pagination/graphs/server-requeue; keep `confirm()` fix.

## PART 2A — god files (refresh numbers, Sidebar done)

| File                                       | TODO said     | Now                                                                    |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------- |
| `editor/Sidebar.tsx`                       | 1127          | [x] DONE — 1123, thin composer + `crop/` cards + `useCropExport.ts`    |
| `admin/useAdminJobs.ts`                    | 444 / 25 keys | 511 / 36 keys (`:471-508`) → split `useAdminDerived` + history actions |
| `bulk/BulkExpandedView.tsx`                | 430           | 528                                                                    |
| `CropOverlay`                              | 347           | 347                                                                    |
| `AudioControls` (`editor/`, not `shared/`) | 331           | 332                                                                    |
| `TimelineVisual`                           | 326           | 326                                                                    |
| `VisualFiltersPanel`                       | 325           | 335                                                                    |
| `MobilePreviewShared`                      | 317           | 323                                                                    |
| `GoogleFontPicker`                         | 312           | 312                                                                    |
| `admin/JobRow`                             | 290           | 324                                                                    |
| `export/QueueDock`                         | 276           | 276                                                                    |
| `subtitles/PreviewPane`                    | 257           | 257                                                                    |
| `hooks/useAudioPreview`                    | 247           | 257                                                                    |

- [ ] **2.01** `useAdminJobs.ts` split + break-up list above, biggest first.

## PART 2B — duplication (keep 3, drop 5)

- 🔄 DONE, close: `UploadOtherButton` ×4 (single shared remains);
  `useVideoPlayer` alias (0 hits — keep `useVideoPlayback`/`useCutPlayback`
  wrapper half); pointer-bus shim (now `global-listener-bus.ts:3,78-84`);
  `selectActiveCount` (0 hits); `TabSwitcher` (gone); `DynamicCardProbe`
  (now `preloadHeavyCard` `admin/heavy.tsx:18`).
- ❌ DROP sub-claims: `heavy-modules:NOOP` (no NOOP there; canonical
  `lib/utils.ts:4`); `useLatest` dead ref (ALIVE — `admin/hooks.ts:6`, used
  `useAdminJobs.ts:96`, `useJobsLiveSync.ts:5`).
- [ ] **2.02** `PlayerControls` vs `VideoPlayerControls` merge (`:11,23` vs `:45`).
- [ ] **2.03** Metadata factory — soften (both share `fetchVideoMetadata:31`,
      refs `:72,159`, not "80% dup").
- [ ] **2.04** Slider unification (3 sliders; `clamp` at 30+ sites).

## PART 2C — state (close 3, keep 1.5)

- 🔄 DONE, delete items: overloaded `cutSlice` (45 lines, one bool);
  anemic `mobileSlice` (file deleted).
- [ ] **2.05** `useSharedMobileLayout.ts:20` same-tab broadcast gap (only
      `storage`+`focus`).
- [ ] **2.06** `playheadSlice` doc comment only, OPTIONAL (`getCommittedTime`/
      `subscribeToPlayhead` deleted; `getPlayheadTime`/`commit`/`set` remain).

## PART 2D — perf

- [ ] **2.07** `"use client"` noise — ✅ but ❌ drop "double wrapper" clause (single
      thin wrapper). Strip on pure libs (`renderSubtitlePng`, `googleFonts`,
      `playheadSlice`, `hooks/*`; `admin/helpers.ts:1` already clean).
- [ ] **2.08** Global mounts — ✅ minus 🔄 `CommandHost` (deleted with palette).
      Lazy-mount `CompareDialog`/`QueueDock`/fonts/theme via `next/dynamic` +
      intent preload.
- [ ] **2.09** `transpilePackages` — ✅ still `["@repo/contracts","@repo/types"]`
      (`next.config.ts:6`). Add `ffmpeg-filters` + `ui`.
- [ ] **2.10** Deps — ✅ (`shadcn` in deps `:28` → devDeps; `base-ui`+`cmdk` overlap →
      pick one; verify `lucide-react ^1.44`; drop absent `radix/react-icons`
      optimize). Ponytail: `native` — pick one command lib.
- [ ] **2.11** Code-split — ✅ with fixes: `useAdminJobs` hover-preload FIXED
      (`:21,450`); `admin/heavy.tsx` is import-map, not `dynamic()` — reword.
      Add intent preload for `CellPreview`/`BulkExpandedView` canvas.
- [ ] **2.12** Preview/export drift — ✅ (`mobile-layout.ts:342` "Must match canvas";
      `CellPreview:80`/`BulkExpandedView:124` hand-rolled `drawImage`; only
      `zoneToPixels` shared). Extract `drawZoneToCanvas()` tested vs filter
      builder.

## PART 2E — upload/SSE (close 3, keep 2, downgrade 1)

- 🔄 FIXED, delete: double-send (`export-queue.ts:351` `submitWithUpload` +
  `buildForm(includeFile)`); error envelope (`:205` `serverErrorMessage`,
  issues-aware); `awaitCompletion` leak (now `subscribe`; `:68` dispose
  correct — fold fixed `[2000,2000,2000]` backoff `:54` + bare `catch{}` `:96`
  into bare-catch item).
- [x] **2.13** Chunked parallelism — DONE 2026-09-11. `uploadFile` sends
      missing chunks via 4-worker pool (`concurrency` opt, clamped 1..8);
      fail-fast shared cursor, per-chunk retries kept.
      Server `POST /upload/chunk/:uploadId` re-reads the row after the write
      (sync = atomic) so concurrent PUTs can't lost-update `received`/`chunks`.
      Skipped: per-chunk checksum + `Content-Range` — server has no verify
      path and `complete()` already gates exact size; add when corruption is
      observed. Verified via stubbed-fetch pool check (4 in flight, each
      index once, failure rejects).
- [x] **2.14** `staleTime` override — DONE 2026-09-11.
      Deleted `staleTime: 0, gcTime: 0, refetchOnWindowFocus: true` from `useAdminJobs` (3 lines);
      inherits global `staleTime: 5s` + no-refocus so SSE `setQueryData`
      stays the no-flash path.
- [x] **2.15** `createObjectURL` spot-check — DONE 2026-09-11. Audited all
      ~11 sites: blob URLs flow into `compareSlice` (revoke on replace/close),
      bulk revokes on replace + unmount, uploader revokes previous, anchor
      revoke delayed, audio preview revokes on cleanup. No unrevoked path;
      no code change.

## PART 2F — hygiene

- [ ] **2.16** Bare `catch{}` — ✅ (~14: `transcode-progress:96`,
      `storage-json:48`, `renderSubtitlePng:70`) → at least `console.warn`.
- [ ] **2.17** `api-client` branches — ✅ (`requestJson :218` bare `Error`;
      429/507/422 only in `transcode-jobs.ts:106`).
- [ ] **2.18** Tests — ❌ premise half wrong (API has `bun test` + `api/test/*`,
      `contracts/test/*`). Rescope to web: add `vitest` + `query-keys` /
      `mobile-layout` / `validate-settings` coverage.
- [ ] **2.19** ESLint disables — ❌ no root `eslint.config.mjs`. Find real config,
      re-verify before touching.
- [ ] **2.20** `target ES2017` + `skipLibCheck` — ✅ (`tsconfig.json:3,6`). Bump
      `ES2022`, un-skip workspace packages.
- [ ] **2.21** Query keys — ✅ (no `lib/query-keys.ts`, ~7 `["admin-jobs"]` literals,
      `invalidateRef` at `useAdminJobs.ts:131`). Ponytail: `shrink` — inline
      unless file earns its keep.
- [ ] **2.22** Type safety — ✅ except ❌ `assertMobile` misuse (used correctly;
      asserts at `validate-settings:36,49,62`). Rest stands: casts,
      redefined types, 0 contract hits (`MULTIPART_FIELDS`, `UPLOAD_ID_HEADER`,
      `migrateRenderPlan`), missing `assertSubtitle/Bulk/AudioExtract`.
- [ ] **2.23** A11y — ✅ except 🔄 `TrimControls aria-disabled` already fixed.
      Keep: `GoogleFontPicker:135`, hidden bulk input `BulkEmptyState.tsx:38`,
      label associations.
- [ ] **2.24** CSS/hygiene — mixed: ❌ dead `kumo-*` tokens (ACTIVE `:543`, not dead
      — drop); ✅ arbitrary values (`CompareDialog:23`, `JobsList:69`) → tokens;
      debug `toast.info(Updated store…)` ✅ at `:141` → remove.

## Ponytail audit — do-not-build list (scoped to TODO)

Speculative TODO items to DROP (biggest avoidance first): global undo/redo;
unified sidebar/base-hook; unified stage; cut NLE features; admin
scale/graphs/server-requeue; subtitles import/gallery/spellcheck; bulk
overrides/CSV/sync-diff; palette/shortcuts/notifications/recent-drop;
URL-sync/filename-lib; crop/watermark/safe-area expansion. Dependency cuts:
`cmdk` vs `base-ui` pick one; `shadcn` → devDeps; drop absent
`radix/react-icons` optimize. Net: ~2500+ proposed lines avoided, -2 deps
possible. Full one-line ranking in `TODO_NOTES.md` § Ponytail audit.
