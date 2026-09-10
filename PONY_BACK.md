# PONY_WEB — frontend over-engineering audit (`apps/web/`)

Whole-tree scan, biggest cut first. Over-engineering only; correctness untouched.

- yagni ⌘K palette stack for 6 static links + shortcuts. Native `<nav>` list + keydown handler. [components/command/CommandPalette.tsx, useGlobalShortcuts.ts, paletteStore.ts, CommandHost.tsx, ui/command.tsx] DONE (~300 lines: palette dialog + store + host + sidebar trigger gone, shortcuts kept in `useGlobalShortcuts` mounted directly in providers; `cmdk`/`ui/command.tsx` stay — `GoogleFontPicker` uses them)
- yagni 5 `*Area` shells with identical top-bar/readout-grid/hint skeleton. One `AreaShell`. [components/crop/CropArea.tsx, components/mobile/MobileArea.tsx, components/bulk/BulkArea.tsx, components/subtitles/SubtitleArea.tsx, components/admin/JobsArea.tsx] DONE (new `shared/AreaShell.tsx`; wrappers keep names/props, chrome now single-source; dropped speculative `children` slot; `StorageArea` left alone — quota-bar body isn't the readout pattern; net ~+40 lines since per-area readout/badge JSX is content, not boilerplate — the win is structural)
- delete zero-importer nav/header: `TabSwitcher` (138), `AppHeader` (30), `FadeTransition` (7). [components/TabSwitcher.tsx, components/view-transition/AppHeader.tsx, components/view-transition/DirectionalTransition.tsx]
- shrink 4 subtitle style panels repeating Label+Slider+clamp rows. One generic `StyleField` row. [components/subtitles/SubtitleBasicsPanel.tsx, SubtitleFontPanel.tsx, SubtitleOutlinePanel.tsx, SubtitleShadowPanel.tsx, SubtitleBackgroundPanel.tsx]
- yagni 3 thin `UploadOtherButton` wrappers (1 caller each). Inline `reset` at call sites. [components/crop/UploadOtherButton.tsx, components/cut/UploadOtherButton.tsx, components/mobile/UploadOtherButton.tsx]
- shrink `resizeZoneAspectLocked` 4 corner branches repeating scale/clamp/edge-fix. Corner-sign table. [lib/mobile-layout.ts]
- shrink fetch timeout+`AbortError` shaping ×4. One `fetchWithTimeout(url, ms, label)`. [lib/health.ts, lib/storage.ts, lib/upload-sessions.ts]
- native custom `ThemeProvider` (74) duplicating installed `next-themes` (already consumed by `ui/sonner`). Mount `NextThemesProvider`, delete file. [providers/ThemeProvider.tsx]
- shrink `HEAVY_MODULES`+`ensurePreconnect`+preload ×3. One `lib/heavy.ts`. [components/admin/heavy.tsx, components/subtitles/heavy-modules.tsx, components/mobile/mobile-helpers.ts]
- delete client in-flight semaphore (`MAX_INFLIGHT_TASKS`/slot waiters) — server 429+Retry-After already bounds. [lib/export-queue.ts]
- shrink `try/catch` localStorage JSON ×5. One `readJSON`/`writeJSON` module. [lib/export-presets.ts, lib/subtitles/subtitleStorage.ts, lib/upload-sessions.ts, store/sourceSlice.ts, lib/mobile-layout.ts]
- shrink chunked-vs-direct upload branch ×3. One `submitWithUpload()` (audio-upload already models it). [lib/export-queue.ts, lib/export-history.ts, hooks/useVideoMetadata.ts]
- shrink playback indirection (`useVideoPlayer` passthrough, `pointer-bus` shim, `seekPlayerElement`/`useSeekTo` clones). Route through `seekVideoElement` + standardize slider `Array.isArray` read. [components/shared/useVideoPlayer.ts, components/subtitles/pointer-bus.ts, components/TrimControls.tsx, components/cut/useCutPlayback.ts]
- shrink `Map`+idle-callback memo caches around pure fns. Plain calls. [components/admin/helpers.ts, components/mobile/mobile-helpers.ts, components/subtitles/template-cache.ts]
- shrink cut-mode `<Select>` duplicated in preview + sidebar. Keep one. [components/cut/CutPreview.tsx, components/cut/CutSettingsSidebar.tsx]
- shrink Google Fonts dual catalog parse. One `fetchCatalog(url, filter)`. [lib/subtitles/googleFonts.ts]
- shrink `createDefaultLayout` dead arithmetic (`void h/w1/w2` leftovers). [lib/mobile-layout.ts]
- shrink `outputKindFor` ×2 + 4 ext parsers. One `extOf` + one kind helper. [lib/export-queue.ts, lib/export-history.ts, lib/video-file.ts]
- shrink `DynamicCardProbe` (renders null) + unused `DynamicProgress`. [components/admin/placeholders.tsx, components/admin/heavy.tsx]
- delete dead exports: `awaitCompletion`, `playbackBus.play/pause`, `subscribeToPlayhead`/`getCommittedTime`, `queuedLabel`/`HeaderGetter`, `setExportQueueState`/`selectActiveCount`, `fetchGoogleFontFamilies`/`fontFamilyToCss`, `apiClient.get`, `MobileLayoutService.defaultZone`, `useSharedMobileLayout` refresh/setLayout. [lib/transcode-progress.ts, lib/playback-bus.ts, store/playheadSlice.ts, lib/transcode-jobs.ts, store/exportQueueSlice.ts, lib/subtitles/googleFonts.ts, lib/api-client.ts, lib/mobile-layout.ts, hooks/useSharedMobileLayout.ts]
- delete single-use files: `mobileSlice` (one boolean → sourceSlice), `preload.ts` (inline import), `baseNameOf` (inline `stripExtension`). [store/mobileSlice.ts, lib/preload.ts, components/bulk/helpers.ts]
- delete speculative props/branches never passed: `showSeek`/`extraContent`, slider `playheadVariant="line"`, `TrimControls.disabled`, `formatNote`/`hint`/`label` defaults, `TRIM_TIME_RE`, scroll/touch bus. [components/shared/VideoPlayerControls.tsx, components/shared/TrimSlider.tsx, components/TrimControls.tsx, components/shared/EmptyState.tsx, components/admin/helpers.ts]
- native one-liners: `formatPct`, `newId` (use `crypto.randomUUID`), `clamp` service, `NOOP` re-export fan-out, `GlobalHandler` dup, `roundRect` polyfill, dead GB branch. [components/crop/helpers.ts, components/cut/helpers.ts, lib/mobile-layout.ts, lib/utils.ts, components/admin/types.ts, lib/subtitles/renderSubtitlePng.ts, lib/video-file.ts]
- delete unlinked `docs/DESIGN.md` (136, zero code references). [docs/DESIGN.md]

Net removable: ~1900 lines + 1 dependency (`cmdk`, if palette goes; `next-themes` stays as the surviving theme system).

Update README.md and AGENTS.md respectfully per changes made.
