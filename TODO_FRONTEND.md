# Frontend TODO

This backlog is based on the current implementation in `apps/web`. The frontend already has crop/trim, multi-cut, 9:16 reframing, subtitles, bulk processing, audio analysis controls, and an admin job view. The items below are intended to extend those capabilities without duplicating work that already exists.

## Product Features

### 1. Saveable projects and session recovery

**Why:** Editor state is currently spread across TanStack Store slices, while selected `File` objects and most settings are ephemeral. Some preferences use `localStorage` (`sourceSlice.ts`, crop hooks, mobile layout, subtitle templates), but there is no complete project that can be reopened after a refresh or shared between editor modes.

**Scope:** Add a project model containing the source fingerprint/metadata, trim, crop, cuts, mobile zones, subtitles, audio settings, export settings, and a project name. Save drafts automatically to IndexedDB and provide New, Open, Duplicate, Rename, and Recover actions. Keep media files local and show a clear missing-source flow when the original file is unavailable.

**Acceptance criteria:**

- Refreshing the browser restores the last active project and its editor mode.
- A project can be exported/imported as a versioned JSON project file without embedding the video.
- Reopening a project validates the selected source by size/name/hash before applying edits.
- Autosave failures are surfaced without interrupting playback or editing.

### 2. Full audio timeline and mixing

**Why:** `audioSlice.ts`, `useAudioAnalysis.ts`, `AudioWaveform.tsx`, and `AudioControls.tsx` already provide waveform/loudness foundations, but audio is not represented as a first-class timeline alongside cuts and subtitles.

**Scope:** Add a visible waveform track with audio stream selection, gain, fades, mute ranges, loudness normalization, and a separate replacement/music track. Support snapping audio edits to the trim range and previewing the effective mix before export.

**Acceptance criteria:**

- Users can select, disable, and reorder available source audio tracks.
- Gain, fade, normalization, and mute changes are visible in the waveform and reflected in export settings.
- Audio remains synchronized when trim or multi-cut ranges change.
- Export preview and final FFmpeg output use the same audio configuration.

### 3. Multi-source timeline with transitions and overlays

**Why:** The current cut workflow operates on non-overlapping segments of one source (`components/editor/cut`); there is no composition model for combining multiple videos, images, or branded overlays.

**Scope:** Introduce a lightweight timeline that can contain multiple video clips, still images, text/watermark layers, and simple transitions such as cut, fade, and crossfade. Reuse the existing crop, mobile-zone, subtitle, and audio controls per clip where possible.

**Acceptance criteria:**

- Multiple imported sources can be ordered, trimmed, and previewed on one timeline.
- Clip boundaries and transition durations have validation that prevents invalid overlaps.
- The preview displays the active clip/layer at the playhead and degrades gracefully for unsupported codecs.
- The render request describes the composition declaratively and produces the same result as the preview.

### 4. Subtitle import, transcript alignment, and caption export

**Why:** The subtitle editor has strong styling and PNG burn-in support, but subtitles are currently authored inside the app. There is no interoperable path for existing caption files or a text-first editing workflow.

**Scope:** Support importing and exporting SRT, WebVTT, and TTML. Add a transcript/list view with search, split/merge, timing nudges, and optional word-level timing input. Keep styled burn-in and add an option to export captions without burning them into the video.

**Acceptance criteria:**

- Imported captions preserve timing, ordering, and Unicode text, including RTL text where supported.
- Invalid or overlapping cues are reported with actionable row-level errors.
- Users can export both a caption file and a video with burned-in captions.
- Existing subtitle templates continue to apply to imported cues.

### 5. Export presets, render comparison, and queue actions

**Why:** Export controls are distributed between crop, cut, mobile, subtitle, and bulk flows. The admin page can inspect jobs, but the editor does not provide a unified export history or a quick way to compare quality/output settings.

**Scope:** Add named export presets for common targets such as source-quality archive, YouTube, Shorts/Reels, GIF preview, and audio-only. Add a preflight summary, estimated output dimensions/duration, and a side-by-side source/output comparison when a render completes. Allow exports to be queued from any editor mode and downloaded or deleted from one history panel.

**Acceptance criteria:**

- Presets are versioned, editable, and stored locally without replacing explicit per-export overrides.
- Preflight catches missing source, invalid ranges, unsupported output combinations, and missing API connectivity before upload.
- A completed render can be previewed, downloaded, renamed, or deleted without leaving the editor.
- Queue state survives navigation and has clear retry/cancel behavior.

## Architecture and Codebase Changes

### 1. Define a canonical editor session model and action API

**Current seam:** State is split across `sourceSlice.ts`, `cropSlice.ts`, `cutSlice.ts`, `mobileSlice.ts`, `subtitleSlice.ts`, and `audioSlice.ts`. Components frequently update stores directly, and mode-specific state is not consistently modeled as a single session.

**Change:** Create a versioned `EditorSession` type in a shared frontend/domain module, with explicit `EditorAction` commands and selectors. Keep TanStack Store as the synchronous runtime store, but expose domain actions such as `setTrimRange`, `updateZone`, `replaceSubtitles`, and `resetSession` rather than ad hoc object updates. Separate durable edit state from transient playback, upload, and render state.

**Done when:** Crop, cut, mobile, subtitles, and bulk all consume the same source/session contract; project serialization has no component-specific shape conversions; selectors prevent unrelated panels from rerendering.

### 2. Centralize the typed API, upload, and SSE transport layer

**Current seam:** `lib/api-client.ts` exists, but feature hooks still contain direct `fetch` and `EventSource` implementations (`use-ffmpeg-mutations.ts`, mobile/bulk/subtitle export hooks, `transcode-progress.ts`, and admin live sync).

**Change:** Add typed endpoint functions for metadata, chunked uploads, transcode variants, jobs, downloads, and progress streams. Standardize error decoding, abort signals, retry policy, progress events, and cleanup on unmount. Build TanStack Query hooks on top of that client rather than mixing transport logic into UI hooks.

**Done when:** No feature component or feature hook constructs API URLs directly; all long-running requests can be cancelled; API errors expose a stable code/message/details shape; SSE reconnect and terminal-event behavior is covered by tests.

### 3. Consolidate editor shells and make modes configuration-driven

**Current seam:** Route-level implementations (`pageEditorCrop.tsx`, `pageEditorCut.tsx`, `pageEditorMobile.tsx`, and `pageEditorSubtitles.tsx`) share concepts such as upload, player controls, trim, headers, empty states, and export progress, but composition is duplicated across mode directories.

**Change:** Introduce a shared `EditorShell` with slots for source panel, preview, timeline, inspector, and export status. Define a mode configuration describing capabilities, sidebar sections, keyboard shortcuts, and export adapter. Keep mode-specific components focused on their unique editing surface.

**Done when:** Shared behaviors have one implementation; adding a new mode requires a configuration plus mode-specific panels; responsive/mobile layout behavior is tested at the shell boundary; route files are thin entry points.

### 4. Introduce a unified render-job controller

**Current seam:** Each export flow maintains its own status/progress/error handling, while `cutSlice.ts` also stores render fields that are not clearly separated from editor state. Progress is delivered through more than one local implementation.

**Change:** Create a single client-side render-job controller backed by a normalized job record: request, source project revision, status, progress, queue position, output metadata, error, and cancellation state. Use one mutation and one progress subscription abstraction for crop, cut, mobile, subtitles, and bulk; retain a job ID when navigating between routes and invalidate admin/history queries consistently.

**Done when:** Every export renders through the same lifecycle; stale progress cannot overwrite a newer job; cancellation and retry are consistent; output cleanup is explicit and independent from download UI.

### 5. Add domain tests, media fixtures, and performance boundaries

**Current seam:** The editor contains timing, geometry, FFmpeg-filter, upload, persistence, and pointer-interaction logic, but the frontend package currently exposes only lint, build, and typecheck scripts. Many regressions would require manual browser/media testing.

**Change:** Add a test setup for pure domain utilities first: crop/aspect math, trim and cut validation, mobile zone normalization, subtitle timing, project migrations, upload chunk planning, and render-request serialization. Add small deterministic media fixtures and browser tests for critical flows. Move expensive waveform analysis, subtitle PNG generation, and thumbnail extraction behind worker or idle-task boundaries where profiling shows main-thread impact.

**Done when:** Pure editor rules run in CI without a browser; at least one end-to-end test covers import → edit → export-progress → download; large-file and long-subtitle cases have fixtures; performance budgets exist for initial route load and interactive scrubbing.

## Suggested Order

1. Canonical editor session model and typed transport layer.
2. Unified render-job controller and export history.
3. Saveable projects and session recovery.
4. Audio timeline and mixing.
5. Subtitle import/export.
6. Shared editor shell and multi-source timeline.
7. Presets, comparison, test coverage, and performance hardening in parallel with each feature.
