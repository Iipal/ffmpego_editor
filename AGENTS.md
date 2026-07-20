# AI Developer System Instructions

## 1. Project Topology & Role
You are an expert full-stack developer managing a local-only Turborepo monorepo powered entirely by the Bun runtime.

**Workspace Architecture:**
*   `apps/web`: Next.js frontend (running with Turbopack).
*   `apps/api`: Hono backend (running natively on Bun).
*   `packages/ui`: Shared Shadcn UI components.
*   `packages/*`: Shared configs (TypeScript, Tailwind, ESLint).

## 2. Core Technology Stack
*   **Package Manager & Runtime:** Bun (Use `bun add`, `bun run`, `bunx` exclusively. Do NOT use npm, pnpm, or yarn).
*   **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS.
*   **Backend:** Hono (Bun runtime). 
*   **Data Fetching:** TanStack Query (`@tanstack/react-query`).
*   **State Management:** TanStack Store (`@tanstack/react-store`).

## 3. The Shadcn Hard Rule
You are strictly forbidden from writing custom UI components (like buttons, dropdowns, modals, inputs, or toasts) from scratch. 
1.  When a new UI element is needed, you MUST first look up if Shadcn provides it.
2.  If it exists, you MUST install it via CLI: `bunx --bun shadcn@latest add <component_name>`.
3.  ONLY AFTER installing the Shadcn component are you allowed to implement it into the page layout.
4.  Base preset rules used: Style "Rhea", Theme "Teal", Font "Inter", Radius "Default". Do not override these core design tokens manually.

## 4. Backend & FFmpeg Execution Rules
*   **Performance:** The API must run on Bun using Hono. Do not use Express or NestJS. 
*   **Execution:** Use `Bun.spawn()` or `Bun.$` for invoking the locally installed `ffmpeg` binary. Ensure non-blocking execution so the API remains responsive.
*   **Output Path:** The absolute destination for all processed files MUST BE `~/ffmpego_edits/${filename}.${fileExt}`. Expand the `~` to the local user's home directory programmatically using Node's `os.homedir()`.
*   **Security:** This app is designed EXCLUSIVELY for local deployment. Ignore standard security protocols (CORS restrictions, rate limiting, JWT auth, payload size limits). Optimize purely for speed and local developer experience.

## 5. Development Workflow
*   Always verify imports are correctly referencing the monorepo workspaces (e.g., `@repo/ui`, `@repo/eslint-config`).
*   Separate server state from client state: Use TanStack Query exclusively for asynchronous API requests/mutations. Use TanStack Store exclusively for synchronous client-side UI state (e.g., tracking which menu is open, or local form drafts).
*   When executing tasks from `PLAN.md`, complete them one by one. Do not jump ahead. Check off tasks as you verify they are working.
