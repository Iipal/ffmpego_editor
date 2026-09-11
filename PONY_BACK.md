# PONY_WEB — frontend over-engineering audit (`apps/web/`)

Whole-tree scan, biggest cut first. Over-engineering only; correctness untouched.
Status per item: ✅ done / ⬜ open. Update README.md and AGENTS.md respectfully per changes made.

## 1. ⌘K palette stack — ✅ done

- **Tag:** yagni
- **Problem:** A full cmdk palette dialog (~590 lines across 5 files) existed to search 6 static nav links plus playback/trim actions whose keyboard shortcuts already worked globally. The dialog added no capability beyond listing what the sidebar and shortcut handler already covered.
- **Do:** Delete the dialog + its store/host/trigger; keep the keydown handler and mount it directly in providers.
- **Files:** `components/command/CommandPalette.tsx`, `components/command/paletteStore.ts`, `components/command/CommandHost.tsx`, `components/command/useGlobalShortcuts.ts` (kept, decoupled), `components/view-transition/AppSidebar.tsx` (trigger removed), `app/providers.tsx`, `lib/playback-bus.ts` (comment updates), `apps/web/README.md`
- **Result:** ~300 lines removed. `cmdk`/`ui/command.tsx` stay — `GoogleFontPicker` uses them (audit correction: no dependency removed).

## 2. Five `*Area` shells — ✅ done

- **Tag:** yagni
- **Problem:** Crop/Mobile/Bulk/Subtitle/Jobs areas each hand-rolled the same card chrome: top bar (icon box + title + badges + actions), readout grid, `SlidersHorizontal` hint footer.
- **Do:** Extract the skeleton into `shared/AreaShell.tsx` (icon/title/subtitle/badges/actions/readouts/hint props); keep all 5 wrappers with identical names/props/classes.
- **Files:** new `components/shared/AreaShell.tsx`; `components/editor/{crop/CropArea,mobile/MobileArea,bulk/BulkArea,subtitles/SubtitleArea}.tsx`, `components/admin/JobsArea.tsx`, `apps/web/AGENTS.md` (shared list)
- **Result:** Chrome now single-source. Net ~+40 lines (per-area readout/badge JSX is content, not boilerplate — the win is structural). Dropped a speculative `children` slot; `StorageArea` left alone (quota-bar body isn't the readout pattern).

## 3. Zero-importer nav/header components — ✅ done

- **Tag:** delete
- **Problem:** `TabSwitcher` (138 lines), `AppHeader` (30), `FadeTransition` (7) had zero importers repo-wide (grep-verified). Dead code shipped to the bundle.
- **Do:** Delete the three dead exports. `DirectionalTransition` stays — 6 route pages use it.
- **Files:** deleted `components/editor/TabSwitcher.tsx` (audit listed wrong path `components/TabSwitcher.tsx`), `components/view-transition/AppHeader.tsx`, `FadeTransition` export in `components/view-transition/DirectionalTransition.tsx`; `apps/web/AGENTS.md` (shared list)
- **Result:** ~175 lines removed, 2 files deleted. `AppNav` untouched (still used inside sidebar).

## 4. Subtitle style panels — ✅ done

- **Tag:** shrink
- **Problem:** Outline/Shadow/Background panels repeated an identical enable-toggle header + dimmed body wrapper; 9 number fields across Font/Outline/Shadow/Background/Basics repeated the Label + `Input type=number` + parse-guard stanza. (Audit correction: no Sliders involved — the repetition was toggle headers and number inputs.)
- **Do:** New `StyleFields.tsx` with `ToggleSection` (title/enabled/onToggle + optional body grid classes) and `NumberField` (label/input/parse-guard, per-field validation stays in the `onValue` callback). All ids, aria-labels, and classes byte-identical.
- **Files:** new `components/editor/subtitles/StyleFields.tsx`; `SubtitleOutlinePanel.tsx`, `SubtitleShadowPanel.tsx`, `SubtitleBackgroundPanel.tsx`, `SubtitleFontPanel.tsx` (font-size only), `SubtitleBasicsPanel.tsx` (pos-x/pos-y only)
- **Result:** ~100 lines removed. Deliberately not unified: color rows (different fallbacks per field; background accepts `rgba()`), Basics timing/track/template blocks (interdependent clamps, bespoke selects) — a single `StyleField` covering those would need more knob props than the repetition it removes.

## 5. Thin `UploadOtherButton` wrappers — ✅ done

- **Tag:** yagni
- **Problem:** Cut/mobile wrappers had zero callers (dead files); the crop wrapper had exactly one caller (`CropEditorHeader`) and only forwarded a `reset` object. The shared button carried two props nobody used (`label` never overridden, `clearInputAfterPick` only used by the dead cut wrapper).
- **Do:** Delete all 3 wrapper files; inline `cropReset` at the single call site; drop the two dead props from the shared button.
- **Files:** deleted `components/editor/{crop,cut,mobile}/UploadOtherButton.tsx` (audit listed wrong paths `components/{crop,cut,mobile}/…`); `components/editor/crop/CropEditorHeader.tsx` (now uses shared button directly), `components/editor/shared/UploadOtherButton.tsx` (props trimmed)
- **Result:** 3 files deleted, ~50 lines net removed. Each header now renders the shared button directly with its own `reset` const. Correction: `clearInputAfterPick` was NOT dead (cut's header relies on it to re-pick the same file) — kept; only the never-overridden `label` prop was dropped. Lesson: the first pass broke cut/mobile headers — relative `./UploadOtherButton` imports didn't match the full-path importer grep. Fixed by inlining the resets at all 3 call sites; `tsc` clean.

## 6. `resizeZoneAspectLocked` corner branches — ✅ done

- **Tag:** shrink
- **Problem:** Four `se/nw/ne/sw` branches repeated the same scale → clamp → edge-fix stanza with only anchor signs differing (~145 lines → ~60).
- **Do:** Table-drive by corner sign (`RESIZE_CORNERS`: `fx`/`fy` drag signs + per-corner max scale). Single shared scale/clamp/edge-fix path.
- **Files:** `lib/mobile-layout.ts`
- **Result:** ~85 lines removed. Behavior verified identical, not just eyeballed: differential fuzz of original (from git) vs refactored over 7200 cases (6 handles incl. bogus, both modes, splits, random zones/deltas) — 0 mismatches. Preserved deliberately: `se` max-scale 2 (others 4), `se` ratio re-pin + unclamped anchor return. Sole caller `SourceStage.tsx` untouched; `tsc` clean.

## 7. Fetch timeout + error shaping ×4 — ✅ done

- **Tag:** shrink
- **Problem:** `fetchHealth`/`fetchStats`/`listSessions`/`fetchStatus` each hand-rolled the base-URL guard + `AbortController` timeout + "API unreachable…" shaping (~75 lines of repetition).
- **Do:** One `fetchJson(path, {timeoutMs, label, notFoundNull?})` funnel in `lib/fetch-json.ts`; the four methods are now one-liners.
- **Files:** new `lib/fetch-json.ts`; `lib/health.ts`, `lib/storage.ts`, `lib/upload-sessions.ts`, `apps/web/AGENTS.md` (lib list)
- **Result:** ~70 lines removed. Messages preserved verbatim except health's non-2xx text ("API responded…" → "Health check responded…" — no programmatic consumer, only toasts via preflight). Bonus fix: `fetchStatus` connection errors now get the human shaping too (previously rethrown raw) — safe, both callers (`upload-chunked`, `audio-upload`) swallow failures into fresh-upload fallback. Deliberately untouched: `runSweep`/`abortSession` (timeout-only, no shaping — different pattern), `fetchJobs` in `admin/helpers.ts` (richer error-body message, genuinely different).

## 8. Custom `ThemeProvider` — ✅ done

- **Tag:** native
- **Problem:** A 74-line hand-rolled theme context + `matchMedia` listener duplicated the installed `next-themes` package, which `ui/sonner.tsx` already consumed (against no mounted provider — functionally dead).
- **Do:** Mount `NextThemesProvider` (`attribute="class"`, system default), repoint `ThemeToggle` at it, delete the custom provider.
- **Files:** deleted `providers/ThemeProvider.tsx` (+ empty `providers/` dir); `app/providers.tsx`, `app/layout.tsx` (custom FOUC script gone — next-themes injects its own), `components/ui/ThemeToggle.tsx`, `app/globals.css`, `apps/web/README.md`
- **Result:** ~95 lines removed. ThemeToggle now persists via next-themes (was lost on system change); sonner's `useTheme` resolves against a real provider. Corrections after browser testing: (1) next-themes 0.4.6 unconditionally renders its blocking `<script>` — mounted in the client tree this trips Next 16's error, so `ThemeProvider` lives in server `app/layout.tsx` (script verified in prerendered HTML); (2) `ThemeToggle` gates its icon on `mounted` (pre-hydration `resolvedTheme` is undefined); (3) the `data-*` attributes were NOT redundant — kumo scopes dark tokens to `[data-mode="dark"]` (light covered by `:root`), so `attribute={["class","data-mode"]}` drives both; only `data-theme` stayed deleted (kumo needs no `data-theme` for either mode). The `.dark`-only simplification of local CSS stands.

## 9. Heavy/preconnect triplication — ✅ done

- **Tag:** shrink
- **Problem:** `HEAVY_MODULES` maps + `ensurePreconnect` guards + image preloads copy-pasted across admin/subtitles/mobile, including hover-intent warming for a localhost app.
- **Do:** One keyed `initAppOnce(key, urls)` funnel in `lib/heavy.ts` (per-feature keys so admin warming never steals subtitles' fonts warmup); per-feature `dynamic()` chunk maps stay put (chunk identity comes from the literal import path — moving them churns imports for zero bundle gain).
- **Files:** new `lib/heavy.ts`; `components/admin/heavy.tsx`, `components/editor/subtitles/heavy-modules.tsx`, `components/editor/mobile/mobile-helpers.ts`, `app/pageAdmin.tsx`, `components/admin/AdminHeader.tsx`, `components/editor/subtitles/useSubtitleEditor.ts`, `components/editor/mobile/useMobilePageState.ts`
- **Result:** ~60 lines removed. Dropped: 3× `didPreconnect` guards, 3× init-once flags, dead `preloadGoogleFontPicker` (zero callers), `ensureSweepHelper` + its hover handlers (preloaded `lib/video-file`, already in the main bundle — pure theater). Correction: mobile's preconnect pointed at bogus `https://api.local` — now `apiClient.baseUrl` like admin. Kept deliberately: per-feature `HEAVY_MODULES`/`Dynamic*` (genuinely different chunks), `NOOP`/`preloadUploadChunked` re-exports (items 21/23), mobile layout caches + pointer-bus re-exports (item 14/22 territory). `tsc` clean.

## 10. Client in-flight semaphore — ✅ done

- **Tag:** delete
- **Problem:** `MAX_INFLIGHT_TASKS`/slot-waiter gate second-guessed the server, which already bounds ffmpeg concurrency and answers 429+Retry-After (handled in the same file).
- **Do:** Delete the semaphore; rely on the 429 path. `execute` calls `runJob` directly.
- **Files:** `lib/export-queue.ts`
- **Result:** ~55 lines removed (`MAX_INFLIGHT_TASKS`, slot counter/waiters, `runGated`/`acquireTaskSlot`/`releaseTaskSlot`). Behavior notes: rows now go straight to "uploading" instead of flashing a local "queued 0" (gate theater — the server-side `queued` at progress 50 is untouched); cancel-while-waiting collapses into cancel-during-upload (same AbortError path, same cancelled row). 429 retry loop, orphan handling, and direct mode untouched. `tsc` clean.

## 11. LocalStorage JSON ceremony ×5 — ✅ done

- **Tag:** shrink
- **Problem:** Five copies of `try/catch` `localStorage.getItem/setItem` JSON round-trips (~40 lines).
- **Do:** One `readJSON`/`writeJSON`/`removeStored` module (`lib/storage-json.ts`, never throws incl. SSR); use everywhere. Shape validation stays at each call site.
- **Files:** `lib/storage-json.ts` (`StorageJSON` singleton service: `storageJSON.read/write/remove`, JSDoc per method — matches the repo's service convention; `key` is a `StorageKey` union of all localStorage literals app-wide, so unknown keys fail typecheck); `lib/export-presets.ts`, `lib/subtitles/subtitleStorage.ts`, `lib/upload-sessions.ts`, `store/sourceSlice.ts`, `lib/mobile-layout.ts`, `store/exportHistorySlice.ts` (bonus: identical ceremony, free), `components/admin/helpers.ts` (filter cache I/O via `storageJSON`, Map cache + idle writes kept), `apps/web/AGENTS.md` (lib list)
- **Result:** ~75 lines removed. Covered beyond the audit's 5: `exportHistorySlice` (same shape) + `UploadOtherButton` trim-cache clear (now `removeStored`). Deliberately untouched: `crop/hooks.ts` (distinguishes missing-vs-corrupt with different toasts — load-bearing UX), `admin/helpers.ts` filter cache (string values + idle-scheduled writes, item 14 territory), `AppSidebar` (plain string flags, not JSON). `tsc` clean.

## 12. Chunked-vs-direct upload branch ×3 — ✅ done

- **Tag:** shrink
- **Problem:** export-queue/export-history/useVideoMetadata each repeat the `shouldUseChunked ? uploadFile+x-upload-id : uploadForm` fork (~35–50 lines); `audio-upload` already solved this shape once.
- **Do:** One `submitWithUpload()` helper modeled on it.
- **Files:** `lib/upload-chunked.ts` (`SubmitWithUploadOptions` + `submitWithUpload`: chunked `uploadFile` → header-only/settings-only `fetch` with `x-upload-id`, else XHR `uploadForm`; default transcode error shaping incl. 429 Retry-After, overridable via `shapeError`; resume notice via `onResumed`); `lib/export-queue.ts` (`submitJob` now a builder closure — file part only in direct bodies), `lib/export-history.ts` (`submitWithCurrentFile` one-liner, `transcodeJobs` import gone), `hooks/useVideoMetadata.ts` (bodiless chunked probe via `buildForm(false) → null`, custom metadata error shaper, type-only `api-client` import)
- **Result:** ~60 lines removed, fork single-source. Behavior notes: export-queue's chunked body no longer double-sends the file bytes (server resolves input from the session header first and ignores the body — verified in `apps/api/src/routes/video.ts:resolveInputFile` + `metadata.ts`); resume toast, 429 retry shaping, metadata error text, and XHR progress callbacks all preserved verbatim.

## 13. Playback indirection — ✅ done

- **Tag:** shrink
- **Problem:** `useVideoPlayer` passthrough file, `pointer-bus` compat shim, and `seekPlayerElement`/`useSeekTo` clones all funnel into `seekVideoElement`; slider `Array.isArray` reads copied 6×.
- **Do:** Delete the passthrough + shim, merge the seek clones, standardize the slider read.
- **Files:** deleted `components/editor/shared/useVideoPlayer.ts` (callers `bulk/BulkExpandedView`, `mobile/useMobilePageState` now use `usePlaybackEngine` directly — identical options/result), deleted `components/editor/subtitles/pointer-bus.ts` (`PreviewPane`, `useTimelineDrag` import from `@/lib/global-listener-bus`); `seekPlayerElement` (zero external importers) replaced by `seekVideoElement` inside `TrimControls` (store `duration` as clamp fallback); `useSeekTo` moved from `cut/useCutPlayback` to `shared/usePlaybackEngine` (`pageEditorCut` repointed); new `readSliderValue` in `lib/utils.ts` standardizing 10 single-value reads (`VideoPlayerControls` ×2, `VisualFiltersPanel` ×3, `Sidebar` ×3, `ZoneSliders`, `AudioControls`, `PreviewPanel`, `ZoneCard`, `CutSettingsSidebar`); stale `useVideoPlayer` mentions fixed in `playback-bus.ts`/`SourceStage.tsx`/`VideoPlayerControls.tsx` comments
- **Result:** 2 files deleted, ~60 lines removed. Deliberately kept: `TrimSlider` dual-thumb read (range + minGap logic, not a single read), `ui/slider` thumb-count read (primitive wrapper), `subtitles/useVideoPlayback` (real hook, not a shim — audit's file list named the wrong layer). `tsc` + `lint` clean.

## 14. Memo-cache ceremony — ✅ done

- **Tag:** shrink
- **Problem:** `Map` + `requestIdleCallback` memo wrappers around pure fns (`formatAge`/`statusBadge`/layout/template caches) that cost nothing to recompute at this call volume (~50 lines).
- **Do:** Call the functions directly; delete the caches and idle fallbacks.
- **Files:** `components/admin/helpers.ts`, `components/editor/mobile/mobile-helpers.ts`, deleted `components/editor/subtitles/template-cache.ts` (audit listed wrong paths `components/mobile/mobile-helpers.ts`, `components/subtitles/template-cache.ts`)
- **Result:** 1 file deleted, ~110 lines removed. Admin: `formatAge`/`statusBadge` now pure (private `statusBadgeRaw` table kept); `getCachedFilter`/`setCachedFilter` wrappers gone — `useAdminJobs` reads/writes `ffmpego:admin_filters` via `storageJSON` directly (read once per mount, sync write on change). Subtitles: `useSubtitleTemplates` loads/saves via `subtitleStorage` directly (effect writes synchronously on template add/remove only — low frequency; cross-tab `storage`-event invalidation dropped, single-tab local app). Mobile: `useMobilePageState` calls `mobileLayoutService.buildMobileFilter` directly (already inside `useMemo`); `useMobileEditor` init reads `loadPref()`; `pageEditorMobile` saves via `savePref()` synchronously on explicit user save. Deliberately untouched: `googleFonts` catalog caches (network fetch, genuinely expensive), `audio-upload` transport cache (status-validated upload sessions), `subtitle-helpers` style cache (not in audit scope). `tsc` + `lint` clean.

## 15. Cut-mode selector duplication — ✅ done

- **Tag:** shrink
- **Problem:** Identical mode `<Select>` in both preview and settings sidebar.
- **Do:** Keep one (settings sidebar), drop the other.
- **Files:** `components/editor/cut/CutPreview.tsx`, `app/pageEditorCut.tsx` (audit listed wrong path `components/cut/…`)
- **Result:** ~20 lines removed. Preview keeps its `mode` prop (video visibility + layout branch still key off it) and the `modeBadge` in the title, so the current mode stays visible; only the `onModeChange` prop + Select JSX + now-dead header flex wrapper are gone. Single caller updated. `tsc` + `lint` clean.

## 16. Google Fonts dual catalog parse — ✅ done

- **Tag:** shrink
- **Problem:** Fontsource + gwfh catalog parsing repeated almost verbatim, differing only in URL + one filter (~30 lines).
- **Do:** One `fetchCatalog(url, filter)` helper.
- **Files:** `lib/subtitles/googleFonts.ts`
- **Result:** ~15 lines removed (both remote parses + all three cache-commit stanzas now single-source). New privates: `fetchRemoteCatalog(url, googleOnly)` (fetch → single-pass filter/dedup/sort, null when failed or under `MIN_CATALOG_SIZE` so a truncated payload never wipes the picker) and `commitCatalog(entries)` (fills `cachedMeta`/`cachedFamilies`/`familyToSubsets`); `fetchGoogleFontsMeta` is now try-fontsource → try-gwfh → curated fallback. One observable nuance: the fallback's `cachedFamilies` copy is now listed order instead of sorted — unobservable, its only consumer is the zero-caller `fetchGoogleFontFamilies` (item 20); the live `GoogleFontPicker` reads the return value, whose order is unchanged. `tsc` + `lint` clean.

## 17. `createDefaultLayout` dead arithmetic — ✅ done

- **Tag:** delete
- **Problem:** Leftover locals (`fullW/fullH`, `a1/a2/h1/w1/h2/w2`) silenced with `void`; only the final constants ship (~20 lines).
- **Do:** Delete the dead locals.
- **Files:** `lib/mobile-layout.ts`
- **Result:** ~15 lines removed (dead `fullAspect`/`fullH`/`fullW` → `w`/`h` chain in the full branch, dead `h1`/`w1`/`h2`/`w2` in the stacked branch, both `void`s, plus three stale thinking-out-loud comments). `a1`/`a2` stay — they feed the live `z1h`/`z2h`. Verified identical, not eyeballed: default layouts for full/stacked/stacked-custom-split+AR dumped before (git HEAD) vs after — byte-identical. `tsc` + `lint` clean.

## 18. `outputKindFor` + extension parsers — ✅ done

- **Tag:** shrink
- **Problem:** Kind mapping duplicated in 2 files; extension parsed 4 different ways.
- **Do:** One shared `extOf` + one kind helper.
- **Files:** `lib/export-queue.ts`, `lib/export-history.ts`, `lib/video-file.ts`, `hooks/useVideoMetadata.ts`
- **Result:** `VideoFileService` (already the filename-helper owner) now exposes public `getFileExtension` (was private) + new `outputKindForName` (gif→image, mp3/wav→audio, else video). Export-queue's private `extOf` deleted (both its uses — kind mapping + `pickerTypesForExt` — go through the service; the `audio-extract` task-kind pre-check stays, it's task state not filename); export-history's private `outputKindFor` deleted, call site uses the service; `useVideoMetadata` uses `getFileExtension`. Edge-case equivalence verified by execution (`noext`/`.hidden`/`a.`/multi-dot/uppercase): the old no-dot `split().pop()` returned the whole name where the service returns `""`, but every downstream mapping lands identically (video kind, mp4 default). Deliberately untouched: `Sidebar` + `useAdminJobs` one-off `split().pop()` reads (display-only/format-guess, outside the audit's file list). `tsc` + `lint` clean.

## 19. `DynamicCardProbe` + `DynamicProgress` — ✅ done

- **Tag:** delete
- **Problem:** A hidden probe renders a dynamically-imported card into `null` (ships a chunk for nothing); `DynamicProgress` is only mentioned in a comment.
- **Do:** Delete both + the probe import in `AdminHeader`.
- **Files:** `components/admin/placeholders.tsx`, `components/admin/heavy.tsx`, `components/admin/AdminHeader.tsx`
- **Result:** `DynamicCard`/`DynamicProgress` `dynamic()` wrappers deleted (grep-verified zero renders — probe's `{false ? … : null}` was the only `DynamicCard` render, `DynamicProgress` only a `JobRow` comment); `HEAVY_MODULES` preload map + `preloadHeavy*` fns kept (real hover/intent path used by `AdminHeader`/`pageAdmin`/`JobRow`/`useAdminJobs`). Stale comments fixed in `heavy.tsx`/`JobRow.tsx`. ~45 lines removed. `tsc` + `lint` clean. No AGENTS.md/README changes — neither documents the preload internals.

## 20. Dead exports batch — ⬜ open

- **Tag:** delete
- **Problem:** Grep-verified zero callers: `awaitCompletion`, `playbackBus.play/pause`, `subscribeToPlayhead`/`getCommittedTime`, `queuedLabel`/`HeaderGetter`, `setExportQueueState`/`selectActiveCount`, `fetchGoogleFontFamilies`/`fontFamilyToCss` (self-admitted), `apiClient.get` (all reads bypass it), `MobileLayoutService.defaultZone`, `useSharedMobileLayout` refresh/setLayout.
- **Do:** Delete each export (keep file structure otherwise).
- **Files:** `lib/transcode-progress.ts`, `lib/playback-bus.ts`, `store/playheadSlice.ts`, `lib/transcode-jobs.ts`, `store/exportQueueSlice.ts`, `lib/subtitles/googleFonts.ts`, `lib/api-client.ts`, `lib/mobile-layout.ts`, `hooks/useSharedMobileLayout.ts`

## 21. Single-use files — ⬜ open

- **Tag:** delete
- **Problem:** `mobileSlice` holds one boolean, `preload.ts` wraps one import, `baseNameOf` re-exports `stripExtension` under another name.
- **Do:** Merge the boolean into `sourceSlice`, inline the import at `AdminHeader`, inline `stripExtension`.
- **Files:** `store/mobileSlice.ts`, `lib/preload.ts`, `components/bulk/helpers.ts`

## 22. Speculative props/branches — ⬜ open

- **Tag:** delete
- **Problem:** Props/branches no caller ever exercises: `showSeek`/`extraContent`, slider `playheadVariant="line"`, `TrimControls.disabled`, `formatNote`/`hint`/`label` defaults, `TRIM_TIME_RE`, admin scroll/touch bus.
- **Do:** Delete them; keep only actually-passed props.
- **Files:** `components/shared/VideoPlayerControls.tsx`, `components/shared/TrimSlider.tsx`, `components/TrimControls.tsx`, `components/shared/EmptyState.tsx`, `components/admin/helpers.ts`

## 23. Native one-liners — ⬜ open

- **Tag:** native/stdlib
- **Problem:** `formatPct`, `newId` (vs `crypto.randomUUID`), `clamp` service method, triple `NOOP` re-exports, duplicated `GlobalHandler`, `roundRect` polyfill (ships natively), dead GB branch.
- **Do:** Inline or replace with the platform primitive in each case.
- **Files:** `components/crop/helpers.ts`, `components/cut/helpers.ts`, `lib/mobile-layout.ts`, `lib/utils.ts`, `components/admin/types.ts`, `lib/subtitles/renderSubtitlePng.ts`, `lib/video-file.ts`

## 24. Unlinked `docs/DESIGN.md` — ⬜ open

- **Tag:** delete
- **Problem:** 136-line spec with zero code references (only README/AGENTS prose mentions).
- **Do:** Delete, or link it from somewhere that earns its keep.
- **Files:** `docs/DESIGN.md`

## Totals

- Done: items 1–19. Open: items 20–24.
- Net removable (remaining): ~1600 lines + 0 dependencies (`cmdk` stays — `GoogleFontPicker` uses it; `next-themes` is the surviving theme system per item 8).
