# Local Monorepo Execution Plan: FFmpeg Web-App

## Phase 1: Monorepo Foundation ✅
- [x] Initialize an empty directory (you are currently in it `~/Code/ffmpeg_editor`) and run `bun init -y`.
- [x] Configure `package.json` with Bun workspaces: `"workspaces": ["apps/*", "packages/*"]`.
- [x] Install Turborepo locally: `bun add -d turbo`.
- [x] Create `turbo.json` with pipeline definitions for `build`, `dev`, and `lint`.
- [x] Create folder structure: `apps/web`, `apps/api`, `packages/ui`, `packages/config`.

## Phase 2: Backend Setup (Bun + Hono) ✅
- [x] Navigate to `apps/api`.
- [x] Initialize a Hono project targeting Bun: `bun create hono api`.
- [x] Set up the core API route to accept local file paths or uploads.
- [x] Implement the FFmpeg execution utility using native `Bun.spawn()` or `Bun.$` for maximum performance.
- [x] Ensure the API automatically creates the directory `~/ffmpego_edits/` if it does not exist using Node's `fs` or Bun's `mkdir` API.
- [x] Write the route logic to execute FFmpeg and save the output strictly to `~/ffmpego_edits/${filename}.${fileExt}`.
- [x] Implement a lightweight SSE (Server-Sent Events) or polling endpoint to report FFmpeg processing progress back to the client.

## Phase 3: Frontend Setup (Next.js) ✅
- [x] Navigate to `apps/web`.
- [x] Initialize Next.js: `bunx create-next-app@latest . --typescript --tailwind --eslint --app --turbopack`.
- [x] Clear boilerplate from `app/page.tsx` and `app/globals.css`.
- [x] Install state and data fetching libraries: `bun add @tanstack/react-query @tanstack/react-store`.
- [x] Configure the TanStack Query provider in a client-side layout wrapper (`app/providers.tsx`).
- [x] Establish an RPC client instance using `hono/client` to connect to the `apps/api` workspace for end-to-end type safety (`lib/api-client.ts`).

## Phase 4: UI System & Styling
- [ ] Navigate to the root directory (or `apps/web` depending on standard monorepo tooling).
- [ ] Execute the exact Shadcn initialization preset:
      `bunx --bun shadcn@latest init --preset b5eaOLEjD --template next --monorepo --pointer`
- [ ] Verify `components.json` is configured to route UI components to `packages/ui` (or local `components/ui` if restricted).
- [ ] Install baseline required components: `bunx --bun shadcn@latest add button input card`.

## Phase 5: Feature Implementation
- [ ] **TanStack Store**: Create a local store in `apps/web/store/` to hold UI state (e.g., active file selection, selected FFmpeg parameters).
- [ ] **TanStack Query**: Write mutations to send file data to the Hono API and queries to listen to the SSE progress endpoint.
- [ ] **Interface**: Build the main dashboard using Shadcn components:
      - A file dropzone/input area.
      - Parameter selection toggles (format, quality, trim).
      - A submit button mapped to the Hono API mutation.
      - A progress bar (Shadcn `progress` component) linked to the SSE stream.
      - A success notification indicating the file is available in `~/ffmpego_edits/`.

## Phase 6: Testing & Optimization
- [ ] Run `bun run dev` from the root to start Next.js (Turbopack) and Hono simultaneously.
- [ ] Test a sample video file through the entire pipeline.
- [ ] Verify the output file exists in the exact `~/ffmpego_edits/` local path.
