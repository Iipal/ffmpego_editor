# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo local creator working with their own footage on their own machine. Opens the Crop Editor to trim, crop/reframe, and export a single video without uploading anything. Desktop-first; mobile must not break.

## Product Purpose

Local-only video editor (trim, crop, reframe 16:9 → 9:16, burn subtitles, batch-convert). The Crop Editor (home page, `/` → `/editor/crop`) trims, crops, canvas-zooms, filters, and exports one video via local ffmpeg. Success = correct export produced locally with live preview matching the exporter.

## Positioning

100% local and private: videos never leave the machine; server renders only on export via local `ffmpeg`/`ffprobe` (Hono on Bun). Non-destructive edits, original untouched. Precision over templates — exact crop boxes, ffmpeg readouts, codec control.

## Operating Context

Single-file workflow: pick file → `POST /metadata` (ffprobe) → edit locally with canvas/CSS preview → chunked-or-direct upload (`uploadId` reused) → `POST /transcode*` → SSE progress → download by opaque file ID. Frequent iterative loop: adjust crop/trim → preview → export → compare.

## Capabilities and Constraints

Confirmed functionality (Crop Editor): trim slider with loop, crop overlay (drag/handles, aspect lock 1:1/16:9/21:9/custom, pixel + percent readouts, ffmpeg `crop=` string), canvas zoom/pan, visual filters, speed, export card (format/fps/quality/custom ffmpeg args), probe inspector, upload progress, export queue + compare dialog.
Technical: Next.js App Router (all client), TanStack Query = async/server state, TanStack Store = sync UI; preview/export share `@repo/ffmpeg-filters` math so they cannot drift; API validates with `@repo/contracts` zod schemas.
Undecided: none material for this refresh.

## Brand Commitments

Name: FFmpeg Editor. Voice: terse, technical, local-first. No logo/assets beyond `/icon.svg`. Kumo-based UI is incumbent implementation, not a pinned brand. Scope for this refresh: Crop Editor page only; simplification/merging of secondary panels is allowed, core controls must stay reachable.

## Evidence on Hand

Live dev server `http://localhost:3050`; API `http://localhost:3100`. Routes: crop, mobile, mobile/subtitles, mobile/bulk, cut, admin. Crop composition: `app/pageEditorCrop.tsx` → `CropEditorHeader` + `CropWorkspace` (→ `CropArea` + `VideoPlayer` + `Sidebar`: Info/Crop/Speed/Filters/Export cards). No testimonials, benchmarks, or marketing claims — do not fabricate any.

## Product Principles

1. Preview is truth: what the canvas shows is what ffmpeg renders.
2. Local and instant: no uploads, no waiting, no cloud ceremony.
3. Precision over decoration: numbers, readouts, and exact boxes beat chrome.
4. Non-destructive by default: original file is never altered.
5. One surface, one job: the Crop page trims, crops, and exports — nothing else competes for attention.
