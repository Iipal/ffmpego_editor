# FFmpeg Editor — Desktop Migration Plan

## Tauri 2 + React + Vite + TanStack Router + Rust + SQLite + FFmpeg

---

# 0. Purpose

This document describes the complete migration of the existing **FFmpeg Editor** from a local web application into a native desktop application.

The current application is:

```text
Next.js frontend
        │
        │ HTTP
        ▼
Bun + Hono backend
        │
        ├── bun:sqlite
        ├── filesystem
        ├── Bun.spawn()
        │
        ▼
    FFmpeg / FFprobe
```

The target application is:

```text
Tauri 2
│
├── React + Vite frontend
│
│      │ Tauri IPC
│      ▼
│
└── Rust backend
       │
       ├── SQLite
       ├── filesystem
       ├── job manager / render queue
       ├── FFmpeg process manager
       ├── FFprobe
       └── application/project storage
```

The application remains **100% local**.

No video, audio, project, render, or metadata information should be sent to an external server.

---

# 1. Critical Instructions for the Implementing LLM

## 1.1 Mandatory web research rule

**Before making any change involving a library, framework, API, plugin, build system, or platform integration, the implementing LLM MUST use web search to retrieve the latest official documentation and current usage information.**

This rule is mandatory.

Do not rely on:

- remembered APIs;
- knowledge from previous versions;
- old Stack Overflow answers;
- old tutorials;
- outdated blog posts;
- generated examples from model memory;
- deprecated APIs;
- assumptions based on older Tauri versions;
- assumptions based on older TanStack versions;
- assumptions based on older Vite versions;
- assumptions based on older Rust crates.

Before implementing or modifying anything involving a dependency, search the web first.

Prefer sources in this order:

1. Official documentation.
2. Official GitHub repository/documentation.
3. Official migration guides/changelogs.
4. Official package/crate documentation.
5. High-quality technical sources only when official documentation is insufficient.

Examples of things that MUST trigger web research:

```text
Tauri APIs
Tauri plugins
Tauri IPC
Tauri events
Tauri filesystem APIs
Tauri dialogs
Tauri application directories
Tauri sidecars
Tauri bundling
Tauri capabilities/permissions

Vite configuration
Vite plugins
React integration

TanStack Router
TanStack Store
TanStack Query

Rust
Tokio
Serde
thiserror
tracing
SQLite crates
rusqlite
SQLx
FFmpeg process management

FFmpeg command syntax
FFprobe output format
FFmpeg progress reporting

Windows WebView2
Windows application directories
Windows process management
Windows file permissions
```

If the LLM is unsure how a library currently works, **search the web before coding**.

If an API appears deprecated, **search the latest documentation before replacing it**.

If documentation differs between versions, determine which version is currently installed/selected and follow the current version's documentation.

---

# 2. Version Rule

Do not hardcode old versions from this document.

The implementing LLM must determine the latest stable compatible versions at implementation time.

Before installing a dependency:

```text
1. Search the official documentation.
2. Check the current stable release.
3. Check compatibility with the rest of the stack.
4. Install the current compatible version.
5. Record the selected version in package manifests / Cargo.toml.
```

Do not blindly use:

```text
latest
```

inside dependency manifests.

Resolve the actual version and commit it to the repository.

---

# 3. Do Not Rewrite the Application Unnecessarily

This migration is an architectural migration, not a request to redesign the editor.

Preserve existing functionality unless explicitly changed by this document.

Preserve:

- editor behavior;
- timeline behavior;
- crop behavior;
- mobile/reframe behavior;
- subtitle behavior;
- cut behavior;
- bulk conversion;
- preview behavior;
- existing render-plan concepts;
- existing FFmpeg filter mathematics;
- existing validation rules;
- existing UI where possible;
- existing shared TypeScript types where they remain useful.

Do not rewrite working React components simply because the application is moving to Tauri.

The goal is:

```text
same editor
+
better desktop architecture
```

not:

```text
completely new editor
```

---

# 4. Current Application

The current repository is a Turbo monorepo.

Current application structure:

```text
apps/
├── web/
└── api/

packages/
├── contracts/
├── types/
├── ffmpeg-filters/
└── ui/config/
```

Current runtime:

```text
apps/web
    Next.js
    React
    TypeScript

apps/api
    Bun
    Hono
    bun:sqlite
    Bun.spawn()
    FFmpeg
    FFprobe
```

The current frontend communicates with the backend through HTTP.

The backend owns:

- jobs;
- files;
- uploads;
- render queue;
- FFmpeg;
- FFprobe;
- SQLite;
- temporary files;
- artifact management.

---

# 5. Target Architecture

The final application should have one desktop application.

Recommended structure:

```text
apps/
└── desktop/
    ├── src/
    │   ├── components/
    │   ├── features/
    │   ├── routes/
    │   ├── stores/
    │   ├── lib/
    │   └── main.tsx
    │
    └── src-tauri/
        ├── src/
        │   ├── commands/
        │   ├── media/
        │   ├── jobs/
        │   ├── storage/
        │   ├── project/
        │   ├── settings/
        │   └── main.rs
        │
        ├── capabilities/
        └── tauri.conf.json
```

Shared packages can remain:

```text
packages/
├── editor-types/
├── ffmpeg-filters/
├── ui/
└── contracts/
```

The final application should no longer require:

```text
apps/api
Hono
localhost API
SSE
HTTP multipart upload protocol
Bun server
Next.js server
```

---

# 6. Target Technology Stack

Use:

```text
Desktop:
    Tauri 2

Frontend:
    React
    TypeScript
    Vite

Routing:
    TanStack Router

State:
    Existing TanStack Store usage where appropriate

Backend:
    Rust

Async/process orchestration:
    Tokio if required by the selected architecture

Serialization:
    Serde / serde_json

Error handling:
    thiserror for internal/domain errors
    explicit serializable IPC errors

Logging:
    tracing

Database:
    SQLite

SQLite Rust library:
    Prefer rusqlite unless research shows a better fit.
    SQLx may be used if there is a concrete architectural reason.

Video:
    FFmpeg

Metadata:
    FFprobe

Desktop IPC:
    Tauri commands

Long-running notifications:
    Tauri events

Build:
    Vite + Tauri

Monorepo:
    Turbo/Bun may remain as the repository task runner if useful,
    but Bun must not be required at runtime by the desktop application.
```

---

# 7. Important Architectural Decision

## Do not reproduce the HTTP API inside Tauri.

Do NOT implement:

```text
React
 ↓
localhost HTTP
 ↓
Rust HTTP server
 ↓
FFmpeg
```

Do NOT replace Hono with another local HTTP framework unless a future requirement explicitly requires an HTTP server.

The target is:

```text
React
 ↓
Tauri IPC
 ↓
Rust application services
 ↓
FFmpeg / filesystem / SQLite
```

IPC is the native application boundary.

---

# 8. Do Not Translate HTTP Endpoints 1:1

The current API contains endpoints such as:

```text
POST /metadata
POST /transcode
POST /transcode/mobile
POST /transcode/mobile/subtitles
POST /transcode/cut

GET /jobs
GET /jobs/stream
GET /progress/:id
GET /download/:id

POST /upload/init
POST /upload/chunk
POST /upload/complete
```

Do not create:

```text
invoke("post_transcode")
invoke("get_jobs")
invoke("get_progress")
```

as a direct translation.

Instead expose application capabilities.

Recommended command concepts:

```text
probe_media
analyze_audio
extract_audio

create_render_job
cancel_render_job
get_render_job
list_render_jobs
delete_render_job

get_storage_stats

import_file
import_folder

get_project
save_project
create_project

get_settings
update_settings
```

The exact command names may differ if current Tauri conventions recommend better names.

Research the current Tauri command conventions before implementation.

---

# 9. Core Application Architecture

The Rust backend should be divided into services.

Recommended conceptual structure:

```text
Tauri IPC commands
        │
        ▼
Application services
        │
        ├── MediaService
        ├── RenderManager
        ├── AssetStore
        ├── ArtifactStore
        ├── TempStore
        ├── ProjectManager
        ├── JobRepository
        └── SettingsManager
```

Tauri commands are only the adapter layer.

Do not put complex business logic directly into command functions.

Example:

```text
commands/render.rs
        │
        ▼
RenderManager
        │
        ├── JobRepository
        ├── ArtifactStore
        ├── TempStore
        └── FFmpegRunner
```

This makes the backend independently testable.

---

# PHASE 1 — Repository Audit

## Goal

Understand the existing application completely before modifying it.

Do not start the migration by immediately creating Tauri files.

---

## Step 1.1 — Read all existing project documentation

Read:

```text
README.md
apps/web/README.md
apps/api/README.md
apps/web/AGENTS.md
apps/api/AGENTS.md
```

Also inspect:

```text
package.json
turbo.json
bun.lock
tsconfig files
Next.js configuration
Hono application entry
API modules
database code
storage code
queue code
FFmpeg code
FFprobe code
shared packages
```

---

## Step 1.2 — Map all API usage

Find every frontend reference to:

```text
fetch()
EventSource
SSE
FormData
multipart
NEXT_PUBLIC_API_URL
API URL constants
upload endpoints
download endpoints
job endpoints
metadata endpoints
```

Create a migration table:

```text
Current API
→ Current frontend caller
→ Current backend implementation
→ New Tauri command/event
→ Migration status
```

Do not delete anything yet.

---

## Step 1.3 — Map the filesystem model

Document:

```text
asset storage
artifact storage
temporary storage
upload storage
render output storage
cleanup logic
```

Determine:

- where files are created;
- when they are created;
- who owns them;
- when they are deleted;
- which database row references them;
- what happens after application restart;
- what happens when a render crashes;
- what happens when a user cancels a render.

---

## Step 1.4 — Map the database schema

Document all SQLite tables.

For each table record:

```text
table
columns
primary key
foreign keys
indexes
status fields
timestamps
filesystem references
cleanup behavior
```

Do not migrate the schema blindly.

Determine which tables are still required in the desktop architecture.

---

## Step 1.5 — Map the job lifecycle

Document the existing state machine:

```text
queued
  ↓
processing
  ↓
completed

queued
  ↓
cancelled

processing
  ↓
cancelled

processing
  ↓
failed
```

Document:

- maximum concurrent jobs;
- queue size;
- progress behavior;
- cancellation;
- process cleanup;
- artifact creation;
- failure handling.

This state machine becomes the basis for the Rust RenderManager.

---

## Step 1.6 — Acceptance criteria

Phase 1 is complete when the implementing LLM can explain:

```text
How a file enters the application.
How media metadata is obtained.
How a render is created.
How a render enters the queue.
How FFmpeg is started.
How progress is reported.
How cancellation works.
How artifacts are stored.
How jobs are persisted.
How temporary files are cleaned.
How the frontend obtains the final artifact.
```

Do not proceed until this is understood.

---

# PHASE 2 — Mandatory Technology Research

## Goal

Research the current versions and APIs before selecting implementation details.

---

## Step 2.1 — Research Tauri

Search the official Tauri documentation for:

```text
Tauri 2 project structure
Tauri 2 React
Tauri commands
Tauri events
Tauri state management
Tauri filesystem
Tauri path APIs
Tauri dialogs
Tauri capabilities
Tauri permissions
Tauri resources
Tauri sidecars
Tauri bundling
Tauri application data directories
Tauri Windows support
Tauri WebView2
```

Use current documentation.

---

## Step 2.2 — Research Vite

Search:

```text
current Vite React TypeScript setup
Vite Tauri integration
Vite environment variables
Vite production build
Vite asset handling
```

Determine the current recommended Tauri + Vite configuration.

---

## Step 2.3 — Research TanStack Router

Search the official documentation for:

```text
current TanStack Router setup
Vite integration
file-based routing
code-based routing
route trees
type-safe navigation
route layouts
navigation
search parameters
```

Choose the current recommended approach.

Do not assume old TanStack Router APIs.

---

## Step 2.4 — Research TanStack Store

The existing project already uses TanStack Store.

Search the current documentation for:

```text
current TanStack Store API
React integration
selectors
subscriptions
deprecated hooks
```

Do not reintroduce APIs that are currently deprecated.

Preserve existing store architecture where possible.

---

## Step 2.5 — Research Rust libraries

Research current stable documentation for:

```text
Tokio
Serde
serde_json
thiserror
anyhow
tracing
tracing-subscriber
rusqlite
SQLx
uuid
```

Do not automatically install all of these.

Only add dependencies that are required.

---

## Step 2.6 — Choose SQLite library

Default preference:

```text
rusqlite
```

because this application needs a local job/state database rather than a complex database abstraction.

Before implementation, compare current:

```text
rusqlite
SQLx
```

documentation and compatibility.

Choose one and document why.

Do not use both unless there is a concrete reason.

---

# PHASE 3 — Create the Desktop Application Shell

## Goal

Create Tauri + React + Vite without migrating backend functionality yet.

---

## Step 3.1 — Create `apps/desktop`

Create:

```text
apps/desktop/
```

with:

```text
React
TypeScript
Vite
Tauri 2
```

Use the current official Tauri project creation procedure.

Do not copy an old tutorial.

---

## Step 3.2 — Make the application launch

The application must:

```text
bun/turbo development command
        ↓
Vite
        ↓
Tauri
        ↓
desktop window
```

The application should display a basic React screen.

---

## Step 3.3 — Configure monorepo integration

Integrate the desktop app into Turbo.

The repository should support commands conceptually equivalent to:

```text
dev
build
lint
typecheck
```

Do not preserve obsolete Next.js-specific commands.

---

## Step 3.4 — Establish Rust formatting/linting

Configure:

```text
cargo fmt
cargo clippy
cargo test
```

Use current Rust recommendations.

---

## Step 3.5 — Acceptance criteria

The desktop shell must:

- launch successfully;
- open a Tauri window;
- render React;
- build successfully;
- work from the monorepo;
- not require the Hono server.

---

# PHASE 4 — Migrate Next.js to React + Vite

## Goal

Move the existing frontend into the new Vite application while preserving behavior.

---

## Step 4.1 — Move reusable React code

Move/reuse:

```text
components
editor components
stores
hooks
UI
styles
shared types
filter math
```

Do not rewrite components unnecessarily.

---

## Step 4.2 — Remove Next.js-specific APIs

Find and replace all use of:

```text
next/router
next/navigation
next/link
next/image
Next.js server APIs
Next.js API routes
Next.js environment conventions
```

Do not perform blind replacements.

Research the current equivalent before changing each category.

---

## Step 4.3 — Replace environment variables

Remove:

```text
NEXT_PUBLIC_API_URL
```

and other server/API-specific variables that are no longer necessary.

Desktop-specific configuration must not contain a localhost API URL.

---

# PHASE 5 — Introduce TanStack Router

## Goal

Replace Next.js routing.

Recommended routes:

```text
/
 /editor/crop
 /editor/mobile
 /editor/subtitles
 /editor/bulk
 /editor/cut
 /admin
```

The exact route hierarchy may follow the current UI architecture.

---

## Step 5.1 — Install and research TanStack Router

Before implementation:

- search official documentation;
- determine current Vite integration;
- determine current recommended route configuration;
- determine whether file-based or code-based routing is preferable for this repository.

---

## Step 5.2 — Create routes

Create routes for all existing application pages.

Every existing page must remain reachable.

---

## Step 5.3 — Migrate navigation

Replace Next.js navigation.

Preserve:

- route semantics;
- URL behavior where useful;
- route-specific state;
- nested layouts.

---

## Step 5.4 — Remove Next.js routing

Only after all routes work:

```text
remove Next.js router
remove Next.js dependencies
```

---

# PHASE 6 — Create the Native Backend Foundation

## Goal

Create the Rust application backend without connecting all frontend functionality yet.

Recommended structure:

```text
src-tauri/src/
├── commands/
├── media/
├── jobs/
├── storage/
├── project/
├── settings/
├── error.rs
├── state.rs
└── main.rs
```

---

## Step 6.1 — Application state

Create one application state object that owns long-lived services.

Conceptually:

```text
AppState
├── database
├── render_manager
├── asset_store
├── artifact_store
├── temp_store
├── project_manager
└── settings
```

Do not create independent global singletons for every service.

Use the current Tauri state-management mechanism documented by Tauri.

---

## Step 6.2 — Error architecture

Create structured Rust errors.

Use:

```text
thiserror
```

where appropriate.

Separate:

```text
internal error
domain error
IPC-safe error
```

Do not return arbitrary Rust debug strings to the frontend.

The frontend should receive stable error information such as:

```text
code
message
details/issues
```

Preserve useful concepts from the existing error envelope, but remove HTTP status semantics.

---

# PHASE 7 — Replace `bun:sqlite`

## Goal

Move persistent job/application state from Bun SQLite to native Rust SQLite.

---

## Step 7.1 — Keep SQLite

Do not replace SQLite with:

```text
JSON files
IndexedDB
browser localStorage
```

unless there is a compelling new requirement.

SQLite is appropriate for:

- jobs;
- render history;
- project metadata;
- asset metadata;
- artifact metadata;
- settings where appropriate.

---

## Step 7.2 — Create the Rust database layer

Create:

```text
storage/database.rs
```

or an equivalent structure.

Responsibilities:

```text
open database
initialize database
run migrations
execute queries
transactions
cleanup
```

Use the selected current SQLite crate.

---

## Step 7.3 — Database location

The database must be stored in the platform-appropriate Tauri application data directory.

Do not hardcode:

```text
C:\...
```

Do not store the production database inside the application bundle.

---

## Step 7.4 — Migrate schema

Recreate only the required tables.

Potential conceptual schema:

```text
jobs
assets
artifacts
projects
project_assets
settings
```

Exact schema must be based on the existing implementation.

Do not invent fields without checking the existing application.

---

## Step 7.5 — Job persistence

Persist enough state to recover from application restart.

At minimum:

```text
id
type
status
created_at
started_at
completed_at
error
input references
output references
render plan
```

Determine whether the render plan should be stored as JSON.

Prefer storing the exact immutable render configuration used by a job so that a job remains reproducible.

---

# PHASE 8 — Replace File Storage

## Goal

Create native application-managed storage.

---

# 8.1 Storage categories

Separate:

```text
Assets
Artifacts
Temporary files
Cache
Projects
```

Recommended conceptual layout:

```text
ApplicationData/
└── FFmpegEditor/
    ├── database.sqlite
    ├── assets/
    ├── artifacts/
    ├── temp/
    ├── cache/
    └── projects/
```

Use Tauri's current path APIs to determine the actual platform-specific location.

---

# 8.2 AssetStore

Preserve the existing AssetStore concept.

Responsibilities:

```text
register external asset
import asset
probe asset
get asset
release asset
```

An asset should have a stable ID:

```text
asset_xxx
```

The React application should use the ID rather than directly depending on internal storage paths whenever possible.

---

# 8.3 ArtifactStore

Preserve the existing ArtifactStore concept.

Responsibilities:

```text
reserve
finalize
get
release
delete
```

A completed render should produce an artifact:

```text
artifact_xxx
```

The artifact metadata should identify:

```text
job
path
format
size
created time
```

---

# 8.4 TempStore

Create a dedicated temporary-file manager.

Responsibilities:

```text
create temporary workspace
create temporary filename
track temporary resources
cleanup job temp directory
cleanup abandoned temp directories
```

Each render job should preferably have an isolated workspace:

```text
temp/
└── job_xxx/
    ├── intermediate files
    ├── subtitle assets
    ├── generated PNGs
    └── FFmpeg temporary output
```

When a job completes or fails, cleanup should occur.

---

# 8.5 Garbage collection

The application must handle abandoned files.

On application startup:

```text
scan temp/
find abandoned job directories
compare with active jobs
remove safe abandoned temporary data
```

Do not delete files that may still belong to active jobs.

Use conservative cleanup rules.

---

# PHASE 9 — Remove Browser Upload Architecture

## Goal

Remove unnecessary HTTP upload/chunking.

The current application has:

```text
upload/init
upload/chunk
upload/complete
```

This exists primarily because a browser communicates with a server.

A native desktop application does not need this architecture.

---

## Step 9.1 — File picker

Use the current Tauri dialog/file APIs.

The frontend selects a file.

The native backend receives the path/reference according to the current Tauri security model.

---

## Step 9.2 — Direct FFprobe

For an external video:

```text
selected file
     ↓
Rust
     ↓
FFprobe
```

Do not copy a 10 GB file just to inspect it.

---

## Step 9.3 — Direct FFmpeg access

For rendering:

```text
original file
     ↓
FFmpeg
```

when safe and appropriate.

Do not duplicate source media unnecessarily.

---

## Step 9.4 — Optional managed import

Support an optional workflow:

```text
Use original location
```

or:

```text
Copy into project/application storage
```

The initial migration may implement only the simplest reliable behavior, but the architecture should allow both.

---

# PHASE 10 — Implement MediaService

## Goal

Move FFprobe and media-inspection functionality into Rust.

Create a service conceptually equivalent to:

```text
MediaService
```

Responsibilities:

```text
probe_media
analyze_audio
extract_audio
waveform-related processing
```

---

## Step 10.1 — FFprobe

Execute FFprobe through Rust process management.

Do not parse human-readable FFprobe output if machine-readable output is available.

Prefer the current stable JSON output format.

Validate the actual FFprobe version and output behavior through official/current documentation.

---

## Step 10.2 — FFprobe model

Create strongly typed Rust models for the information the application actually uses.

Do not deserialize the entire FFprobe output if unnecessary.

The frontend should receive a stable application-level:

```text
MediaInfo
FFprobeReport
```

rather than raw arbitrary FFprobe output.

---

# PHASE 11 — Implement FFmpegRunner

## Goal

Create one reusable abstraction around FFmpeg execution.

Conceptually:

```text
FFmpegRunner
├── run()
├── spawn()
├── cancel()
├── parse_progress()
└── collect_result()
```

Do not allow every feature to independently implement FFmpeg process spawning.

---

## Step 11.1 — FFmpeg binary resolution

Development may use:

```text
PATH
```

but production should support bundled FFmpeg/FFprobe binaries.

Create:

```text
BinaryResolver
```

or equivalent.

It should determine:

```text
development executable
production bundled executable
```

using the current Tauri resource/bundling mechanism.

Research the latest official Tauri resource/sidecar recommendations before implementation.

---

## Step 11.2 — FFmpeg arguments

Do not construct shell command strings.

Use argument arrays.

Conceptually:

```text
ffmpeg
-ss
...
-i
...
-filter_complex
...
```

The Rust process API should receive arguments individually.

Do not build:

```text
"ffmpeg -i file.mp4 ..."
```

and pass it through a shell.

This avoids quoting and injection problems.

---

## Step 11.3 — FFmpeg progress

Use FFmpeg's machine-readable progress mechanism where appropriate.

Do not parse terminal UI output if a stable progress protocol is available.

The runner should normalize FFmpeg progress into:

```text
RenderProgress
```

---

# PHASE 12 — Create RenderPlan as the Central Rendering Contract

## Goal

Make `RenderPlan` the central contract between editor state and the renderer.

The frontend should not need to know how FFmpeg commands are constructed.

Architecture:

```text
Crop editor ───────┐
Mobile editor ─────┤
Subtitle editor ───┼──→ RenderPlan
Cut editor ────────┤       │
Bulk editor ───────┘       ▼
                         Rust
                           │
                           ▼
                    FFmpeg compiler
                           │
                           ▼
                        FFmpeg
```

---

## Step 12.1 — Preserve existing RenderPlan

Inspect the existing:

```text
migrateRenderPlan
```

and related types.

Do not discard existing render-plan compatibility.

---

## Step 12.2 — Remove HTTP-specific information

The render plan must not contain:

```text
HTTP endpoint
multipart field
upload ID
SSE URL
download URL
```

It should describe the actual media operation.

---

## Step 12.3 — Rust render compiler

Create a Rust component responsible for turning:

```text
RenderPlan
```

into:

```text
FFmpeg arguments
```

The exact structure should depend on existing FFmpeg filter-generation logic.

---

## Step 12.4 — Prevent preview/export drift

The existing:

```text
@repo/ffmpeg-filters
```

must remain the single source of truth for filter mathematics wherever practical.

Important functions include concepts such as:

```text
cropPercentToPixels
zoneToPixels
```

Do not create a second incompatible implementation in Rust unless required.

If the Rust renderer must reproduce the calculations, add explicit tests comparing the expected values.

---

# PHASE 13 — Implement RenderManager

## Goal

Replace the Bun/Hono render queue with a native Rust render manager.

---

## Step 13.1 — Job lifecycle

Implement:

```text
queued
processing
completed
failed
cancelled
```

with explicit state transitions.

Invalid transitions must be rejected.

---

## Step 13.2 — Concurrency

Preserve the current behavior:

```text
maximum active FFmpeg processes = 2
```

unless configuration makes this adjustable.

Do not assume that more FFmpeg processes are always faster.

The system should eventually allow:

```text
max_concurrent_renders
```

as a configurable value.

---

## Step 13.3 — Queue

Create:

```text
RenderQueue
```

and:

```text
RenderWorker
```

or equivalent.

Conceptually:

```text
RenderManager
      │
      ▼
   Queue
      │
      ├──── Worker 1 → FFmpeg
      │
      └──── Worker 2 → FFmpeg
```

---

## Step 13.4 — Persistent jobs

When a job is submitted:

```text
1. Create database row.
2. Reserve output/artifact state.
3. Put job into queue.
4. Start worker when capacity exists.
```

Do not start FFmpeg before the job is safely represented in persistent state.

---

# PHASE 14 — Tauri IPC Commands

## Goal

Expose only application-level operations to React.

Potential API:

```text
media
├── probeMedia
├── analyzeAudio
└── extractAudio

render
├── createRenderJob
├── cancelRenderJob
├── getRenderJob
├── listRenderJobs
└── deleteRenderJob

storage
├── getStorageStats
└── cleanup

project
├── createProject
├── openProject
├── saveProject
└── saveProjectAs
```

The exact command naming must follow current Tauri conventions.

---

## Step 14.1 — Typed arguments

Every command must have strongly typed input.

Avoid:

```text
any
Record<string, unknown>
JSON string containing arbitrary data
```

unless there is a concrete reason.

---

## Step 14.2 — Typed results

Every command should return a stable type.

Example:

```text
CreateRenderJobResponse
MediaInfo
RenderJob
StorageStats
```

---

## Step 14.3 — Long-running operations

Do not block IPC calls while FFmpeg runs.

The command should:

```text
create job
return job ID
```

Then RenderManager handles the long-running process.

---

# PHASE 15 — Tauri Events for Progress

## Goal

Replace SSE with Tauri events.

Flow:

```text
FFmpeg
   ↓
FFmpegRunner
   ↓
RenderManager
   ↓
Tauri event
   ↓
React
```

Potential event:

```text
render-progress
```

Payload:

```text
{
    jobId,
    phase,
    progress,
    elapsedMs,
    outputBytes
}
```

Use strongly typed frontend representations.

---

## Step 15.1 — Event lifecycle

Events should be emitted when:

```text
job starts
progress changes
job completes
job fails
job is cancelled
```

---

## Step 15.2 — Avoid excessive event frequency

Do not emit thousands of UI events per second.

Throttle/coalesce progress updates.

The UI only needs smooth progress, not every FFmpeg progress line.

Choose an appropriate update interval after testing.

---

# PHASE 16 — Render Cancellation

## Goal

Implement proper cancellation.

The cancellation flow should be:

```text
React
 ↓
cancelRenderJob(jobId)
 ↓
RenderManager
 ↓
find running FFmpeg process
 ↓
terminate FFmpeg safely
 ↓
wait for process termination
 ↓
cleanup temp files
 ↓
update SQLite
 ↓
emit cancelled event
```

Do not simply mark the job as cancelled while leaving FFmpeg running.

The process must actually terminate.

Research current cross-platform process termination behavior before implementing this.

---

# PHASE 17 — Implement Projects

## Goal

Introduce first-class project persistence.

A project should contain editor state rather than rendered media.

Conceptually:

```text
Project
├── project ID
├── project name
├── version
├── assets
├── timeline
├── crop settings
├── mobile settings
├── subtitles
├── cuts
├── filters
└── application/editor metadata
```

---

## Step 17.1 — Project format

Prefer a versioned JSON project representation.

Example conceptual structure:

```json
{
  "version": 1,
  "assets": [],
  "timeline": {},
  "settings": {}
}
```

The exact schema must follow existing editor state.

---

## Step 17.2 — Version migrations

Project files must contain a schema version.

Future migrations should look conceptually like:

```text
version 1
 ↓
migrate
 ↓
version 2
 ↓
migrate
 ↓
current
```

Do not silently reinterpret old project files.

---

# PHASE 18 — Autosave and Recovery

## Goal

Make the desktop application resilient to crashes.

Implement:

```text
autosave
temporary project state
render-job recovery
temporary-file cleanup
```

Do not lose editor state because FFmpeg crashes.

---

## Step 18.1 — Render recovery

On startup:

```text
read jobs
find processing jobs
determine whether the associated process still exists
```

A process from a previous application instance should generally be treated as dead.

Update orphaned processing jobs to an appropriate recoverable/failed state.

Do not pretend the old FFmpeg process is still running.

---

# PHASE 19 — Migrate Each Existing Feature

Migrate features individually.

Order:

```text
1. metadata
2. crop
3. mobile/reframe
4. subtitles
5. cut
6. bulk conversion
7. audio analysis
8. audio extraction
9. jobs/admin
```

Do not migrate all features simultaneously.

---

# PHASE 20 — Crop Editor

The crop editor must:

```text
create RenderPlan
submit RenderPlan
receive JobId
observe progress
display result
```

Remove:

```text
POST /transcode
SSE
download URL
```

Replace with native operations.

---

# PHASE 21 — Mobile/Reframe Editor

Preserve:

```text
9:16 layout
crop zones
source 16:9
preview
trim
render
```

The editor produces a RenderPlan.

The Rust backend executes it.

Do not duplicate mobile crop mathematics.

---

# PHASE 22 — Subtitle Editor

Preserve all existing subtitle behavior.

The RenderPlan must represent:

```text
subtitle text
start
end
position
font
font size
color
outline
shadow
background
padding
rounded corners
```

If subtitle rendering currently generates PNG assets or temporary files:

```text
subtitle render assets
        ↓
TempStore/job workspace
        ↓
FFmpeg
```

Ensure all generated files are cleaned up.

---

# PHASE 23 — Cut Editor

Preserve multi-cut behavior.

Represent cuts in the RenderPlan.

Do not let the frontend construct raw FFmpeg command lines.

---

# PHASE 24 — Bulk Conversion

Bulk conversion must use the same RenderManager architecture.

Conceptually:

```text
Folder
 ↓
discover files
 ↓
create jobs
 ↓
queue
 ↓
RenderManager
 ↓
FFmpeg workers
```

Do not create a second independent queue implementation for bulk conversion.

All rendering must use the same RenderManager.

---

# PHASE 25 — Admin / Jobs Inspector

The existing admin page should become a desktop jobs inspector.

It should display:

```text
job ID
type
status
progress
created
started
completed
error
input
output
```

Potential actions:

```text
cancel
delete
open output
retry
```

Only implement actions that are safe and supported by the current backend.

---

# PHASE 26 — File Opening and Saving

Use the current Tauri file/dialog APIs.

Support:

```text
Open video
Open project
Save project
Save project as
Select output location
Open output folder
```

Do not use browser download APIs as the primary desktop mechanism.

For example, replace:

```text
download()
saveBlobFile()
```

with native filesystem operations where appropriate.

---

# PHASE 27 — Remove the Download Architecture

The current:

```text
/download/:id
```

endpoint should disappear.

The native application already owns the filesystem.

Instead:

```text
ArtifactStore
    ↓
artifact path
    ↓
Open / Reveal / Save As
```

The frontend should not need to download a render over HTTP.

---

# PHASE 28 — Storage Settings

Add configurable working storage.

At minimum consider:

```text
Application data location
Temporary/render location
```

A video editor may require hundreds of GB of temporary space.

Do not assume the system drive is appropriate.

The setting should be persisted.

Changing storage location must not silently invalidate existing projects.

---

# PHASE 29 — FFmpeg Bundling

## Goal

Production builds should not require the user to manually install FFmpeg.

Research the current Tauri 2 recommended mechanism for bundling external binaries/resources.

Bundle:

```text
ffmpeg
ffprobe
```

for supported platforms.

Development may continue to support:

```text
FFmpeg from PATH
```

---

# PHASE 30 — FFmpeg Version Management

Record the bundled FFmpeg version.

Expose it through a diagnostic/about screen if useful.

The application should be able to report:

```text
FFmpeg version
FFprobe version
build configuration
```

This will make troubleshooting considerably easier.

---

# PHASE 31 — Security Model

Even though the application is local, treat filesystem access carefully.

The frontend should not have unrestricted native access if it is unnecessary.

Use Tauri capabilities/permissions according to the current Tauri security model.

The architecture should be:

```text
React
 ↓
restricted IPC
 ↓
Rust
 ↓
filesystem
```

not:

```text
React
 ↓
unrestricted filesystem
```

---

# PHASE 32 — Path Handling

Never construct paths using string concatenation.

Do not do:

```text
base + "/" + filename
```

Use the native Rust path APIs.

All paths must be handled as platform-aware paths.

Consider:

```text
Windows drive letters
UNC paths
Unicode filenames
spaces
non-ASCII filenames
long paths
symlinks where applicable
```

Test Ukrainian and other Unicode filenames explicitly.

---

# PHASE 33 — Process Safety

Never invoke FFmpeg through a shell unless there is a documented reason and the implementation has been carefully secured.

Prefer:

```text
Command
  + argument array
```

rather than:

```text
shell("ffmpeg ...")
```

All user-controlled paths must be passed as individual arguments.

---

# PHASE 34 — Logging and Diagnostics

Use Rust's current recommended logging stack.

Prefer:

```text
tracing
```

for backend logging.

Log:

```text
application startup
database initialization
FFmpeg discovery
FFprobe discovery
job creation
job start
job completion
job failure
job cancellation
cleanup
unexpected errors
```

Do not log sensitive or unnecessary full file contents.

Paths may be logged where useful for debugging, but avoid excessive information.

---

# PHASE 35 — Frontend Error Handling

The frontend must distinguish:

```text
validation error
media error
FFmpeg error
filesystem error
database error
cancelled job
unknown/internal error
```

Do not show raw Rust stack traces to users.

Provide useful messages.

Keep detailed diagnostic information in logs.

---

# PHASE 36 — Testing Strategy

Testing must be introduced during migration rather than at the end.

---

## Rust unit tests

Test:

```text
RenderPlan conversion
job state transitions
queue behavior
path generation
storage lifecycle
cleanup
FFmpeg argument construction
progress parsing
```

---

## Integration tests

Test:

```text
FFprobe actual video
FFmpeg actual render
SQLite initialization
job persistence
cancellation
artifact creation
temporary cleanup
```

Use small deterministic media fixtures.

Do not use huge production videos in automated tests.

---

## Frontend tests

Test:

```text
routing
editor state
render-plan generation
progress UI
job UI
project serialization
project migration
```

---

# PHASE 37 — End-to-End Test Matrix

At minimum verify:

```text
Open application
Open video
Probe video
Preview video
Crop
Render crop
Cancel crop render

Open mobile editor
Configure zones
Render mobile video

Open subtitles
Add subtitle
Edit subtitle
Render subtitle video

Open cut editor
Create cuts
Render cuts

Bulk conversion
Multiple files
Queue behavior

Open jobs inspector
Observe progress
Cancel job
Delete job

Save project
Close application
Reopen project
Verify state

Application crash simulation
Restart
Verify database consistency

Temporary-file cleanup
Artifact persistence
Storage statistics
```

---

# PHASE 38 — Performance Validation

The migration must not introduce unnecessary copies of large media files.

Test with:

```text
500 MB
2 GB
10 GB
large-resolution videos
long-duration videos
multiple simultaneous renders
```

Measure:

```text
startup memory
idle memory
preview memory
render memory
CPU usage
GPU usage
disk usage
temporary disk growth
render throughput
```

Compare the desktop application with the old architecture where useful.

---

# PHASE 39 — Memory Efficiency

The main reason for choosing Tauri is to avoid shipping a complete Electron runtime.

Do not undermine this by starting unnecessary background processes.

The production architecture should not contain:

```text
Bun server
Hono server
localhost HTTP server
Node runtime
Next.js server
duplicate FFmpeg processes
unnecessary worker processes
```

The expected runtime architecture is:

```text
Tauri process
WebView2/WebView
Rust services
FFmpeg only while needed
```

---

# PHASE 40 — Do Not Optimize Prematurely

Do not introduce:

```text
Redis
RabbitMQ
Docker
remote workers
HTTP microservices
heavy ORMs
external databases
```

This is a local desktop application.

Prefer simple local primitives:

```text
SQLite
filesystem
Rust channels
Tokio where needed
FFmpeg processes
Tauri IPC
```

---

# PHASE 41 — Decide Whether Async Rust Is Needed

Research current Rust/Tauri runtime behavior before implementation.

Use async where it benefits:

```text
IPC
job orchestration
process monitoring
events
filesystem operations
```

SQLite operations may need careful handling if the chosen SQLite library is synchronous.

Do not block the Tauri main thread with:

```text
long FFmpeg waits
large filesystem operations
large database operations
```

FFmpeg must always run as an external process.

---

# PHASE 42 — Shared Type Strategy

The project currently has:

```text
@repo/types
@repo/contracts
```

Do not immediately delete these.

Separate their contents into:

```text
frontend/domain types
render-plan types
IPC types
HTTP-only types
```

Delete HTTP-only concepts.

Preserve shared editor/render concepts.

---

# PHASE 43 — IPC Type Strategy

Avoid manually duplicating every Rust type in TypeScript if a reliable current type-generation approach is available.

Before implementation:

```text
search current Tauri/Rust/TypeScript type-generation options
```

Choose a maintainable strategy.

The final project must have a clear source of truth.

At minimum, the following should remain strongly typed:

```text
MediaInfo
FFprobeReport
RenderPlan
RenderJob
RenderProgress
RenderResult
StorageStats
Project
ApplicationError
```

---

# PHASE 44 — Remove HTTP-Specific Contracts

After all frontend features use IPC, remove obsolete concepts:

```text
multipart field constants
upload IDs
SSE URLs
HTTP status mapping
API URL configuration
download endpoints
Hono request/response types
HTTP-specific error envelopes
```

Only remove them after verifying there are no remaining consumers.

---

# PHASE 45 — Remove Bun Runtime Dependency

The final desktop application must not require Bun at runtime.

Bun may still be used for:

```text
repository package management
Turbo scripts
development tooling
TypeScript tooling
```

if the project chooses to retain it.

But the installed desktop application must contain:

```text
Tauri
React/Vite assets
Rust backend
SQLite
FFmpeg/FFprobe
```

and must not start:

```text
bun
hono
next
```

as application runtime services.

---

# PHASE 46 — Remove `apps/api`

Only remove:

```text
apps/api
```

after all functionality has been migrated and verified.

Do not delete it at the beginning.

Migration order:

```text
existing API
      ↓
Rust equivalent
      ↓
frontend switched to IPC
      ↓
tests pass
      ↓
old API becomes unused
      ↓
delete apps/api
```

---

# PHASE 47 — Remove Next.js

Only remove Next.js after:

```text
all routes migrated
all components migrated
all environment variables migrated
all Next.js APIs removed
Vite production build works
Tauri production build works
```

Then remove:

```text
next
Next.js config
Next.js scripts
Next.js-specific files
```

---

# PHASE 48 — Update Monorepo

Final conceptual structure:

```text
apps/
└── desktop/
    ├── src/
    └── src-tauri/

packages/
├── editor-types/
├── ffmpeg-filters/
├── ui/
└── config/
```

Do not retain empty compatibility packages.

Update Turbo configuration.

Update root scripts.

Update documentation.

---

# PHASE 49 — Development Commands

The final repository should provide simple commands.

Conceptually:

```text
bun install

bun run dev
```

or the repository's existing Turbo equivalent.

The desktop development command should start:

```text
Vite
+
Tauri
```

not:

```text
Next.js
+
Hono
```

Production:

```text
build
```

must produce the desktop application installer/bundle.

---

# PHASE 50 — Documentation Migration

Rewrite the root README.

Remove:

```text
localhost:3050
localhost:3100
Hono
SSE
HTTP API
upload endpoints
```

Document:

```text
Tauri
React
Vite
Rust
SQLite
FFmpeg
FFprobe
desktop storage
project files
development
production build
FFmpeg version
supported platforms
```

Create/update:

```text
apps/desktop/README.md
apps/desktop/AGENTS.md
```

if the repository uses these agent-oriented documents.

---

# PHASE 51 — Architecture Documentation

Create a desktop architecture section showing:

```text
React
 ↓
TanStack Router / Store
 ↓
Tauri IPC
 ↓
Rust application services
 ↓
RenderManager
 ↓
FFmpeg
```

Also document:

```text
SQLite
Filesystem
Assets
Artifacts
Temp
Projects
```

Explain ownership clearly.

---

# PHASE 52 — Ownership Rules

Use these rules throughout the implementation.

## React owns

```text
UI
editor interaction
preview
editor state
navigation
render-plan construction
progress presentation
```

## Rust owns

```text
filesystem
FFmpeg
FFprobe
SQLite
jobs
queue
process lifecycle
temporary files
artifact lifecycle
project filesystem access
native dialogs where appropriate
```

## SQLite owns

```text
persistent metadata/state
```

## Filesystem owns

```text
actual video/audio/project/render data
```

## FFmpeg owns

```text
media processing
```

---

# PHASE 53 — No Business Logic Duplication

Do not implement the same behavior in:

```text
React
Rust
```

when only one side should own it.

For example:

React:

```text
"progress = 72%"
```

Rust:

```text
actual FFmpeg progress calculation
```

React should not independently calculate FFmpeg's true render progress.

Similarly:

Rust:

```text
FFmpeg command construction
```

React should produce:

```text
RenderPlan
```

not raw FFmpeg arguments.

---

# PHASE 54 — RenderPlan Validation

Before starting FFmpeg:

```text
Rust validates RenderPlan
```

Validation should check:

```text
required input
valid trim range
valid dimensions
valid crop
valid output configuration
valid subtitle ranges
valid cut ranges
valid paths
```

Do not trust frontend validation alone.

The desktop boundary is still a trust boundary.

---

# PHASE 55 — Prevent Path Leakage

React may need to select or display filenames, but internal storage paths should remain controlled by Rust.

Use:

```text
AssetId
ArtifactId
JobId
ProjectId
```

as stable application identifiers.

Only expose paths when a specific desktop operation requires them.

---

# PHASE 56 — UUID / ID Strategy

Use a stable ID mechanism for:

```text
assets
artifacts
jobs
projects
```

Before choosing a Rust crate, search current documentation and determine the appropriate current UUID/ID strategy.

Do not use timestamps as IDs.

IDs should remain stable across application restarts.

---

# PHASE 57 — Database Transactions

Operations affecting both SQLite and filesystem must consider consistency.

For example:

```text
create job
reserve artifact
write temporary data
finalize artifact
update job
```

The database and filesystem cannot participate in one atomic transaction.

Therefore implement explicit state transitions.

Example:

```text
job = processing
artifact = reserved

FFmpeg succeeds

artifact = finalized
job = completed
```

If FFmpeg fails:

```text
job = failed
artifact = released
temp = cleaned
```

If the application crashes:

```text
startup recovery
```

must reconcile incomplete states.

---

# PHASE 58 — Startup Recovery

At application startup:

```text
1. Initialize application directories.
2. Open SQLite.
3. Run migrations.
4. Validate database.
5. Recover orphaned jobs.
6. Clean safe temporary files.
7. Initialize RenderManager.
8. Register Tauri commands.
9. Start frontend.
```

Do not run FFmpeg jobs before the application state has been initialized.

---

# PHASE 59 — Shutdown

Implement graceful application shutdown.

When closing:

```text
1. Stop accepting new jobs.
2. Notify RenderManager.
3. Decide how running FFmpeg jobs are handled.
4. Persist appropriate state.
5. Cleanup safe temporary resources.
6. Close database.
```

The exact policy for active renders must be explicit.

Recommended initial behavior:

```text
application closes
→ running FFmpeg processes are terminated
→ jobs are marked interrupted/failed/cancelled
→ temporary job directories cleaned on next startup
```

Do not leave orphan FFmpeg processes unintentionally.

---

# PHASE 60 — Windows First

The initial target is Windows.

Test:

```text
Windows 11
WebView2
Unicode paths
Ukrainian filenames
spaces in paths
large files
GPU-accelerated FFmpeg builds
FFmpeg process termination
file dialogs
application data paths
```

Do not assume Linux/macOS behavior is identical.

The architecture should remain portable, but Windows is the primary target unless project requirements change.

---

# PHASE 61 — Hardware Acceleration

Do not hardcode GPU assumptions.

FFmpeg should use whatever hardware-acceleration configuration the existing editor supports.

The migration must preserve the ability to use:

```text
NVENC
CUDA-related filters where applicable
CPU encoding
```

depending on the installed FFmpeg build and render configuration.

The Rust layer should orchestrate FFmpeg rather than implementing GPU encoding itself.

---

# PHASE 62 — Large File Handling

Explicitly test:

```text
>4 GB files
10 GB files
Unicode filenames
long paths
large output files
```

Do not use 32-bit file-size assumptions.

Use Rust's current filesystem APIs and integer types appropriate for large files.

---

# PHASE 63 — Temporary Storage Requirements

The current application requires:

```text
10 GB+
```

in the OS temp directory.

The new application should instead expose/own its working storage.

Document that temporary storage requirements depend on:

```text
input size
output size
codec
filters
intermediate files
subtitle generation
FFmpeg behavior
```

Do not promise a fixed amount of required space.

---

# PHASE 64 — Migration Strategy for Existing Users

If the application has existing user data, define a migration strategy.

Potential existing data:

```text
SQLite database
assets
artifacts
projects
```

Do not assume old filesystem paths remain valid.

If compatibility is required:

```text
detect old storage
migrate metadata
re-link files
validate artifacts
```

If no production users exist yet, migration can be simpler and the old database can be treated as development-only data.

Determine this before deleting the old database code.

---

# PHASE 65 — Dependency Cleanup

After migration:

```text
remove unused npm packages
remove unused Rust crates
remove Hono
remove Next.js
remove Bun server dependencies
remove HTTP-only libraries
remove SSE-specific code
remove multipart upload code
```

Run dependency analysis.

Do not remove packages merely because their names appear unused; verify actual usage.

---

# PHASE 66 — Final Repository Validation

Run:

```text
typecheck
lint
format
unit tests
Rust tests
integration tests
production build
Tauri bundle
```

Verify there are no references to:

```text
localhost:3050
localhost:3100
NEXT_PUBLIC_API_URL
Hono
EventSource
SSE
/api/
upload/chunk
upload/init
upload/complete
download endpoint
Next.js server
Bun.spawn
bun:sqlite
```

unless a specific compatibility feature intentionally requires them.

---

# PHASE 67 — Final Runtime Validation

Install the built application on a clean Windows machine/environment.

The user should be able to:

```text
install application
launch application
select video
edit video
render video
cancel render
open output
save project
reopen project
```

without manually installing:

```text
Node.js
Bun
Next.js
Hono
FFmpeg
```

if FFmpeg is bundled with the application.

---

# PHASE 68 — Final Architecture

The completed application should look conceptually like:

```text
┌─────────────────────────────────────────────────────────┐
│                    FFmpeg Editor                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                 React + Vite                      │  │
│  │                                                   │  │
│  │  TanStack Router                                 │  │
│  │  TanStack Store                                  │  │
│  │                                                   │  │
│  │  Crop                                             │  │
│  │  Mobile/Reframe                                  │  │
│  │  Subtitles                                       │  │
│  │  Cut                                             │  │
│  │  Bulk                                            │  │
│  │  Admin/Jobs                                      │  │
│  │                                                   │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
│                    Tauri IPC                            │
│                         │                               │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │                    Rust                           │  │
│  │                                                   │  │
│  │  Commands                                         │  │
│  │      │                                            │  │
│  │      ▼                                            │  │
│  │  Application Services                            │  │
│  │      │                                            │  │
│  │      ├── MediaService                            │  │
│  │      ├── RenderManager                           │  │
│  │      ├── AssetStore                              │  │
│  │      ├── ArtifactStore                           │  │
│  │      ├── TempStore                               │  │
│  │      ├── ProjectManager                          │  │
│  │      └── SettingsManager                         │  │
│  │                                                   │  │
│  └──────────────┬──────────────┬─────────────────────┘  │
│                 │              │                        │
│                 ▼              ▼                        │
│              SQLite       Filesystem                    │
│                                │                        │
│                  ┌─────────────┼─────────────┐          │
│                  ▼             ▼             ▼          │
│                Assets        Temp        Artifacts      │
│                                │                        │
│                                ▼                        │
│                         FFmpeg / FFprobe                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

# PHASE 69 — Final Architecture Rules

The following rules are mandatory.

## Rule 1

The application is local-only.

No external server is required.

---

## Rule 2

Do not recreate the old Hono HTTP API.

Use Tauri IPC.

---

## Rule 3

Do not run Bun as the desktop backend.

Bun may remain development tooling, but it must not be part of the production runtime architecture.

---

## Rule 4

Do not run Next.js in production.

Use React + Vite.

---

## Rule 5

Use TanStack Router for application navigation unless current research demonstrates a concrete reason to choose another router.

---

## Rule 6

Keep TanStack Store if it continues to fit the application's existing state architecture.

Do not migrate state management unnecessarily.

---

## Rule 7

SQLite remains the persistent local database.

Use one Rust SQLite solution.

---

## Rule 8

Filesystem data must not be stored inside SQLite.

SQLite stores metadata/state.

The filesystem stores actual media and render data.

---

## Rule 9

FFmpeg remains the media engine.

Rust orchestrates FFmpeg.

Rust does not replace FFmpeg's codec/filter functionality.

---

## Rule 10

FFmpeg must run as an external process.

Do not execute FFmpeg synchronously on the UI thread.

---

## Rule 11

Use one RenderManager.

Crop, mobile, subtitles, cut, and bulk conversion must all use it.

Do not create separate rendering queues.

---

## Rule 12

Use RenderPlan as the central rendering abstraction.

Editors produce plans.

Rust validates and executes plans.

---

## Rule 13

Use Tauri events for long-running progress.

Do not recreate SSE.

---

## Rule 14

Use native filesystem access.

Do not upload files to localhost merely because the old architecture did so.

---

## Rule 15

Do not duplicate huge source files unnecessarily.

A 10 GB source file should not be copied simply to pass it from React to Rust.

---

## Rule 16

Do not expose unrestricted filesystem access to the frontend.

Use Tauri's current capability/permission system.

---

## Rule 17

Do not construct shell command strings.

Pass FFmpeg arguments individually.

---

## Rule 18

All IPC input/output must be strongly typed.

Avoid `any`.

---

## Rule 19

All long-lived application state belongs in explicit Rust services managed through application state.

Avoid uncontrolled global singletons.

---

## Rule 20

Temporary files must have ownership and cleanup rules.

Every render job should have an identifiable temporary workspace.

---

## Rule 21

The application must recover safely after crashes.

Do not assume a `processing` job is still running after the application restarts.

---

## Rule 22

Production should bundle FFmpeg/FFprobe unless distribution/licensing constraints require another mechanism.

Development may continue using PATH.

---

## Rule 23

Do not hardcode platform-specific application paths.

Use the current Tauri path APIs.

---

## Rule 24

Do not assume APIs from memory.

Search the web first.

---

# PHASE 70 — Mandatory Research Protocol During Implementation

For **every phase**, before modifying a dependency or API, perform this sequence:

```text
STEP A
Identify the library/API involved.

STEP B
Search the web.

STEP C
Prefer official documentation.

STEP D
Determine the current stable API.

STEP E
Check migration/deprecation notes.

STEP F
Implement using the current API.

STEP G
Run typecheck/build/tests.

STEP H
If an error occurs and the cause is unclear,
search the web again before attempting a speculative fix.
```

The LLM must not do:

```text
"I remember Tauri uses..."
```

without checking.

The LLM must not do:

```text
"I think this API still exists..."
```

without checking.

The LLM must not downgrade a dependency merely because an old tutorial uses a different API.

The LLM must not introduce a compatibility workaround without first checking whether the current official API already solves the problem.

---

# PHASE 71 — Required Search Targets

At minimum, research the official documentation for:

```text
Tauri 2
Vite
React
TanStack Router
TanStack Store
Rust
Tokio
Serde
thiserror
tracing
SQLite
rusqlite or SQLx
FFmpeg
FFprobe
```

Also research when needed:

```text
Tauri filesystem plugin
Tauri dialog plugin
Tauri shell/process/sidecar functionality
Tauri capabilities
Tauri resource bundling
Tauri Windows/WebView2
Rust process management
Windows process termination
```

Do not assume a plugin is necessary.

Check current Tauri core/plugin capabilities first.

---

# PHASE 72 — Implementation Order Summary

The implementation order is:

```text
PHASE 1
Repository audit

PHASE 2
Technology research

PHASE 3
Tauri shell

PHASE 4
Next.js → React/Vite

PHASE 5
TanStack Router

PHASE 6
Rust backend foundation

PHASE 7
SQLite migration

PHASE 8
Filesystem/storage migration

PHASE 9
Remove browser upload architecture

PHASE 10
MediaService / FFprobe

PHASE 11
FFmpegRunner

PHASE 12
RenderPlan

PHASE 13
RenderManager

PHASE 14
Tauri IPC

PHASE 15
Tauri progress events

PHASE 16
Cancellation

PHASE 17
Projects

PHASE 18
Recovery/autosave

PHASE 19
Feature migration

PHASE 20
Crop

PHASE 21
Mobile

PHASE 22
Subtitles

PHASE 23
Cut

PHASE 24
Bulk

PHASE 25
Jobs inspector

PHASE 26
Native file operations

PHASE 27
Remove downloads

PHASE 28
Storage settings

PHASE 29
FFmpeg bundling

PHASE 30
FFmpeg version management

PHASE 31
Security

PHASE 32
Path handling

PHASE 33
Process safety

PHASE 34
Logging

PHASE 35
Errors

PHASE 36
Testing

PHASE 37
E2E testing

PHASE 38
Performance

PHASE 39
Memory validation

PHASE 40
Avoid unnecessary infrastructure

PHASE 41
Async validation

PHASE 42
Shared types

PHASE 43
IPC types

PHASE 44
Remove HTTP contracts

PHASE 45
Remove Bun runtime

PHASE 46
Delete apps/api

PHASE 47
Delete Next.js

PHASE 48
Finalize monorepo

PHASE 49
Development commands

PHASE 50
Documentation

PHASE 51
Architecture docs

PHASE 52
Ownership validation

PHASE 53
Duplication validation

PHASE 54
RenderPlan validation

PHASE 55
Path security

PHASE 56
ID strategy

PHASE 57
Database/filesystem consistency

PHASE 58
Startup recovery

PHASE 59
Graceful shutdown

PHASE 60
Windows validation

PHASE 61
Hardware acceleration

PHASE 62
Large-file validation

PHASE 63
Storage validation

PHASE 64
Existing-data migration

PHASE 65
Dependency cleanup

PHASE 66
Repository validation

PHASE 67
Clean-machine validation
```

---

# PHASE 73 — Definition of Done

The migration is complete only when all of the following are true.

## Architecture

```text
Tauri 2
React
Vite
TanStack Router
Rust
SQLite
FFmpeg
FFprobe
```

are the production architecture.

---

## Removed

```text
Next.js server
Hono
localhost API
SSE
HTTP uploads
HTTP downloads
Bun runtime backend
bun:sqlite
Bun.spawn()
```

are no longer required by the desktop application.

---

## Rendering

All render types use:

```text
RenderPlan
    ↓
RenderManager
    ↓
FFmpegRunner
    ↓
FFmpeg
```

---

## Storage

The application has:

```text
SQLite
Assets
Artifacts
Temp
Projects
```

with explicit ownership and cleanup.

---

## Jobs

Jobs survive application restarts as persistent metadata.

Orphaned jobs are detected and handled safely.

---

## UI

All existing editor functionality works:

```text
crop
mobile/reframe
subtitles
cut
bulk
preview
jobs
admin
```

---

## Files

Large local files can be processed without unnecessary browser uploads/copies.

---

## Production

A clean Windows machine can install and run the application without requiring:

```text
Bun
Node.js
Next.js
Hono
manual FFmpeg installation
```

assuming bundled FFmpeg/FFprobe is part of the selected release configuration.

---

# Final Instruction to the Implementing LLM

**Do not attempt to complete the migration in one giant rewrite.**

Work phase-by-phase.

For every phase:

```text
1. Inspect existing implementation.
2. Search official/current documentation for every relevant library/API.
3. Write down the implementation decision if it affects architecture.
4. Implement the smallest coherent change.
5. Run typecheck/lint/tests/build.
6. Fix failures.
7. Search the web again for unclear/deprecated API issues.
8. Verify the phase acceptance criteria.
9. Only then proceed to the next phase.
```

Never delete the old implementation before its replacement is working.

Never migrate multiple unrelated subsystems simultaneously when they can be migrated independently.

Prefer small, reversible changes.

The final goal is **not a web application running inside a desktop window**.

The final goal is a proper local desktop video editor:

```text
React/Vite
     │
     │ Tauri IPC
     ▼
Rust
     │
     ├── SQLite
     ├── Filesystem
     ├── RenderManager
     ├── MediaService
     └── FFmpeg/FFprobe
```

while preserving the existing editor functionality and avoiding unnecessary runtime layers.
