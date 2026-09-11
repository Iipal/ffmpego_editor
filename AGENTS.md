# AI Developer System Instructions

## 0. Project Architecture (brief)

Local-only video editor. `apps/web` (Next.js, `:3050`) previews/edits in the
browser; `apps/api` (Hono on Bun, `:3100`) validates, queues, and renders via
local `ffmpeg`/`ffprobe`. Flow: pick file → `POST /metadata` → edit locally →
chunked-or-direct upload (`uploadId` reused) → `POST /transcode*` → SSE
progress → download by opaque file ID. Full pictures: `README.md`,
`apps/web/README.md`, `apps/api/README.md`.

- **Frontend:** Next.js 16 App Router (all `"use client"`), React 19, Tailwind 4.
  TanStack Query = async/server state (+ SSE live sync); TanStack Store = sync
  UI state. Pages: crop, mobile, mobile/subtitles, mobile/bulk, cut, admin.
  Details: `apps/web/AGENTS.md`.
- **Backend:** Hono on Bun, `bun:sqlite` (jobs/uploads/files), FileStore
  (`AssetStore` inputs + `ArtifactStore` outputs, reserve→finalize→release),
  bounded ffmpeg queue (`active < min(2,cpu-1)`, wait ≤ 50). Five route modules:
  upload, video (transcode+jobs+SSE), metadata, audio, files.
  Details: `apps/api/AGENTS.md`.
- **Shared:** `@repo/contracts` (zod schemas, plans, multipart keys, error
  envelope — web pre-validates what API enforces), `@repo/types` (shared
  media types), `@repo/ffmpeg-filters` (preview and exporter share filter math).

## 1. Project Topology & Role

You are an expert full-stack developer managing a local-only Turborepo monorepo powered entirely by the Bun runtime.

**Workspace Architecture:**

- `apps/web`: Next.js frontend (running with Turbopack).
- `apps/api`: Hono backend (running natively on Bun).
- `packages/contracts` (`@repo/contracts`): zod schemas, render plans, multipart keys, error envelope shared by web + API.
- `packages/types` (`@repo/types`): shared media/editor TypeScript types.
- `packages/ffmpeg-filters` (`@repo/ffmpeg-filters`): filter math shared by web preview and API exporter.

## 2. Core Technology Stack

- **Package Manager & Runtime:** Bun (Use `bun add`, `bun run`, `bunx` exclusively. Do NOT use npm, pnpm, or yarn).
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS.
- **Backend:** Hono (Bun runtime).
- **Data Fetching:** TanStack Query (`@tanstack/react-query`).
- **State Management:** TanStack Store (`@tanstack/react-store`).

## 3. The Shadcn Hard Rule

You are strictly forbidden from writing custom UI components (like buttons, dropdowns, modals, inputs, or toasts) from scratch.

1.  When a new UI element is needed, you MUST first look up if Shadcn provides it.
2.  If it exists, you MUST install it via CLI: `bunx --bun shadcn@latest add <component_name>`.
3.  ONLY AFTER installing the Shadcn component are you allowed to implement it into the page layout.
4.  Base preset rules used: Style "Rhea", Theme "Teal", Font "Inter", Radius "Default". Do not override these core design tokens manually.

## 4. Backend & FFmpeg Execution Rules

- **Performance:** The API must run on Bun using Hono. Do not use Express or NestJS.
- **Execution:** Use `Bun.spawn()` or `Bun.$` for invoking the locally installed `ffmpeg` binary. Ensure non-blocking execution so the API remains responsive.
- **Output Path:** Rendered files go to the OS temp dir (`os.tmpdir()/temp_<jobId>.<ext>`) and are kept until the user explicitly deletes the job (`DELETE /api/transcode/jobs/:jobId`). Downloading does NOT delete anything.
- **Security:** This app is designed EXCLUSIVELY for local deployment. Ignore standard security protocols (CORS restrictions, rate limiting, JWT auth, payload size limits). Optimize purely for speed and local developer experience.

## 5. Development Workflow

- Always verify imports are correctly referencing the monorepo workspaces (e.g., `@repo/contracts`, `@repo/types`).
- Separate server state from client state: Use TanStack Query exclusively for asynchronous API requests/mutations. Use TanStack Store exclusively for synchronous client-side UI state (e.g., tracking which menu is open, or local form drafts).
- When executing tasks from `PLAN.md`, complete them one by one. Do not jump ahead. Check off tasks as you verify they are working.
- Read `apps/web/AGENTS.md` before frontend work and `apps/api/AGENTS.md` before backend work; keep the corresponding `README.md` maps in sync when routes, pages, or endpoints change.
