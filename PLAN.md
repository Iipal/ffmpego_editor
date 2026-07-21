# Feature Implementation Plan: Local Video Editor

### Architectural Strategy & State Model

```
 1. File Input (MP4 / WebM)
          │
          ▼
┌───────────────────────────────────┐
│       Phase 7: API Metadata       │
│   (ffprobe via Bun.spawn/Hono)    │
└─────────────────┬─────────────────┘
                  │ Extracts: exact resolution, native FPS,
                  │ precise duration, and video/audio codecs
                  ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 TanStack Store                                   │
│  - videoFile / URL         - metadata (width, height, native FPS, codecs)        │
│  - currentTime / duration  - isPlaying / isMuted / volume                        │
│  - trimRange [start, end]  - cropBounds {x, y, w, h} (calculated in px from %)   │
│  - exportFormat (default: source) - exportFps (default: source)                  │
│  - customFFmpegArgs                                                              │
└─────────────────────────────────┬────────────────────────────────────────────────┘
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
┌────────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│    Video Player    │  │ Timeline Control  │  │ Settings Sidebar  │
│ - Custom Controls  │  │ - Interactive     │  │ - Aspect Ratio    │
│ - Crop Overlay     │  │   Trim Handles    │  │ - Export Config   │
│   (bounded by px)  │  │ - Time Display    │  │   (defaults auto- │
│ - Auto-Zoom View   │  │   (sub-second)    │  │    filled from    │
└──────────┬─────────┘  └─────────┬─────────┘  │    metadata)      │
           │                      │            └─────────┬─────────┘
           └──────────────────────┼──────────────────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │   Task 6.1-6.3 Execution │
                     │ (FFmpeg Transcode Engine)│
                     └──────────────────────────┘

```

---

### Sequential Data Flow

1. **User Selects File** $\rightarrow$ `VideoUploader.tsx` generates a local browser Blob URL for instant video player preview.
2. **Metadata Inspection (Task 6.4)** $\rightarrow$ The file is sent to Hono `/api/metadata`. `ffprobe` extracts exact native specs (e.g., $1920 \times 1080$, $59.94\text{ fps}$, $128.42\text{s}$) and returns them to the frontend.
3. **Store Hydration** $\rightarrow$ `TanStack Store` initializes the editor state:
* Sets exact crop bounds using real pixel dimensions.
* Sets default export format and framerate to match source metadata.
* Sets precise trim duration bounds.


4. **User Interacts** $\rightarrow$ Player controls, trim handles, crop boxes, and settings panels react to and update the `TanStack Store` in real-time.
5. **Transcode Execution** $\rightarrow$ User hits export, sending the store state + source file to the Hono backend to build and run the final `ffmpeg` command.

---

## Task Execution Steps

### Phase 1: Video Import & Base Player Engine

- [x] **Task 1.1: Shadcn Component Installation**
  - Execute: `cd apps/web && bunx --bun shadcn@latest add card button input slider select label textarea tooltip`
- [x] **Task 1.2: Global Store Setup**
 - Create `apps/web/store/useVideoStore.ts` using `@tanstack/react-store`.
 - Define state properties:
   - `file: File | null`
   - `mediaUrl: string | null`
   - `currentTime: number`
   - `duration: number`
   - `isPlaying: boolean`
   - `isMuted: boolean`
   - `volume: number` (0 to 1)
- [x] **Task 1.3: Drag-and-Drop Video Uploader**
  - Create `apps/web/components/editor/VideoUploader.tsx`.
  - Restrict accepted MIME types strictly to `video/mp4` and `video/webm`.
  - On file selection, invoke `URL.createObjectURL(file)` and store both the raw `File` and the `mediaUrl` in `useVideoStore`.
- [x] **Task 1.4: Base Video Canvas Component**
  - Create `apps/web/components/editor/VideoPlayer.tsx` using a native HTML `<video>` element wrapped in a relative container.
  - Bind `ref` to the video element to handle programmatic `play()`, `pause()`, volume, and `currentTime` updates.
  - Implement a `timeupdate` event listener on the video element to keep `useVideoStore.currentTime` synchronized.



---

### Phase 2: Custom Controls Overlay

- [x] **Task 2.1: Controls Bar Component**
  - Create `apps/web/components/editor/PlayerControls.tsx` overlaid over the bottom of the video player.
  - Use Lucide icons (`Play`, `Pause`, `Volume2`, `VolumeX`, `Maximize`).
- [x] **Task 2.2: Time Tracking & Seek Slider**
  - Implement a Shadcn `Slider` for progress scrub mapping from `0` to `duration`.
  - Create a helper utility `formatTime(seconds: number)` -> `MM:SS.ss`.
  - Display the formatted time string: `${formatTime(currentTime)} / ${formatTime(duration)}`.
- [x] **Task 2.3: Volume & Mute Controls**
  - Add a toggle button for mute/unmute.
  - Add a collapsible or inline `Slider` (0 to 100) bound to `video.volume`.
- [x] **Task 2.4: Native Fullscreen Integration**
  - Implement a Fullscreen handler targeting the wrapper `div` of the Video Player using the standard HTML Fullscreen API (`requestFullscreen()`).



---

### Phase 3: Interactive Timeline & Trim Controller

- [x] **Task 3.1: Trim State Expansion**
  - Update `useVideoStore.ts` with:
  - `trimRange: [number, number]` (Default: `[0, duration]`).
- [x] **Task 3.2: Timeline Track Component**
  - Create `apps/web/components/editor/Timeline.tsx` directly underneath the main Video Player.
  - Render a dual-handle range slider (or custom drag handles) representing `trimStart` and `trimEnd`.
  - Render a playhead bar showing `currentTime` relative to the track width.
- [x] **Task 3.3: Sync Video Playback with Trim Range**
  -  Write an effect inside `VideoPlayer.tsx` listening to `currentTime`.
  -  **Rule:** If `currentTime` exceeds `trimRange[1]`, reset `currentTime` to `trimRange[0]`.
  -  **Rule:** If the user clicks play when `currentTime` is outside the `trimRange`, automatically seek to `trimRange[0]` before playing.



---

### Phase 4: Crop Engine & Visual Overlay

- [x] **Task 4.1: Crop State Expansion**
  - Update `useVideoStore.ts` with:
  - `crop: { x: number, y: number, width: number, height: number }` (percentages 0-100 relative to source resolution).
  - `aspectRatio: 'custom' | '1:1' | '16:9' | '21:9'` (Default: `'custom'`).
- [x] **Task 4.2: Interactive Crop Box Component**
  - Create `apps/web/components/editor/CropOverlay.tsx`.
  - Overlay a resizable, draggable bounding box over the video element with 8 handle points (corners + sides).
  - Enforce aspect ratio constraints on drag based on the selected `aspectRatio` state:
  - `1:1` -> Enforce `width === height`
  - `16:9` -> Enforce `width === height * (16 / 9)`
  - `21:9` -> Enforce `width === height * (21 / 9)`
  - `custom` -> Unconstrained dragging.
- [x] **Task 4.3: Auto-Zoom View Engine**
  - Apply dynamic CSS transforms (`transform: scale(...) translate(...)`) to the container `<video>` element based on the current crop bounding box.
  - When the user finishes cropping, smoothly transition the view so the selected crop area fills the active player view space.



---

### Phase 5: Editor Sidebar & Configuration Panels

- [x] **Task 5.1: Sidebar Layout**
  - Create `apps/web/components/editor/Sidebar.tsx` on the right side of the main workspace using Shadcn `Card` and layout utilities.
- [x] **Task 5.2: Crop Settings Controls**
  - Add a Shadcn `Select` component for aspect ratio choices (`Custom`, `1:1`, `16:9`, `21:9`).
  - Add a toggle button to enable/disable crop mode on the video player canvas.
- [x] **Task 5.3: Export Configuration Controls**
  - Add a Shadcn `Select` for Output Format:
    - `Same as source` (Default)
    - `mp4`
    - `webm`
  - Add a Shadcn `Select` / `Input` for Framerate:
    - `Same as source` (Default)
    - `30 fps`
    - `60 fps`
    - Custom numeric input.


- [x] **Task 5.4: FFmpeg Raw Arguments Input**
  - Add a Shadcn `Textarea` for optional custom FFmpeg CLI flags (e.g., `-vf eq=contrast=1.2 -b:v 2M`).



---

### Phase 6: Hono API Integration & FFmpeg Execution

- [x] **Task 6.1: Command Builder Utility**
  - Create `apps/api/src/utils/ffmpegBuilder.ts`.
  - Function `buildFFmpegArgs(options)` must transform state into valid CLI arguments:
  - Trim: `-ss <start>` and `-to <end>`
  - Crop: `-vf crop=w:h:x:y` (convert percentage values to actual pixel bounds based on source resolution)
  - FPS: `-r <fps>`
  - Custom args: Append raw string values passed from the user textarea.
  - Output path: Ensure output is sent strictly to `~/ffmpego_edits/${filename}.${fileExt}`.
  - Lossless MP4: `-c:v libx264 -crf 0 -pix_fmt yuv444p`.


- [x] **Task 6.2: Hono Transcode Endpoint**
  - In `apps/api/src/index.ts`, expose a POST endpoint `/api/transcode`.
  - Receive the file payload and execution settings.
  - Use `Bun.spawn()` to invoke local `ffmpeg`.
  - Stream progress output (parsed from FFmpeg stderr) back via SSE (`/api/transcode/progress`).


- [x] **Task 6.3: Client Mutation & Progress Bar**
 - In `apps/web`, create a TanStack Query mutation to trigger processing.
 - Display a Shadcn `Progress` bar and toaster notification (`Sonner`) when processing starts, finishes, or errors out.

Here is the addition for your `PLAN.md`. This task introduces an inspection endpoint using `ffprobe` (which comes bundled alongside `ffmpeg`) to inspect the video right when the user selects or uploads it.

### Phase 7: Video Metadata Inspection Endpoint (`ffprobe`)**
- [x] **Backend metadata inspection**
- **Objective:** Read and return source video technical specifications (exact duration, dimensions, native framerate, bitrates, video/audio codecs) directly to the frontend state as soon as a video file is loaded.
- **Backend Implementation (`apps/api/src/routes/metadata.ts`):**
- Create a Hono POST endpoint `/api/metadata`.
- Receive the temporary local file path or raw file buffer.
- Spawn `ffprobe` via `Bun.spawn()` to extract JSON metadata without decoding the media:
```bash
ffprobe -v quiet -print_format json -show_format -show_streams <inputFile>

```

- Parse the `stdout` buffer and structure the JSON response:
```ts
interface VideoMetadata {
  filename: string;
  containerFormat: string; // e.g., "mov,mp4,m4a,3gp,3g2,mj2"
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;       // calculated from r_frame_rate (e.g., "60/1" -> 60)
  videoCodec: string;      // e.g., "h264", "vp9"
  audioCodec?: string;     // e.g., "aac", "opus"
  bitrateKbps: number;
}

```
- **Frontend Integration (`apps/web`):**
- [x] **Frontend metadata hydration**
- Create a TanStack Query hook `useVideoMetadataMutation()` in `apps/web/hooks/useVideoMetadata.ts`.
- Trigger this query automatically upon file selection in `VideoUploader.tsx`.
- Hydrate the global TanStack Store with the extracted native specifications:
- Set `duration` to the precise sub-second `ffprobe` duration rather than the native HTML5 player estimate.
- Store source resolution (`width`, `height`) so the Crop Overlay accurately converts target percentage coordinates ($x, y, w, h$) into exact pixel bounds for the FFmpeg filter graph (`-vf crop=w:h:x:y`).
- Pre-fill the Export Settings sidebar with default fallbacks matching the exact source framerate ($30, 60, \text{or custom}$) and file format extension.
