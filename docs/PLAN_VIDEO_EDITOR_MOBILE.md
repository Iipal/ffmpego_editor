# PLAN_VIDEO_EDITOR_MOBILE.md

# Mobile 9:16 Layout Editor for 16:9 Video

## 1. Purpose

Implement a mobile/portrait editing workflow that converts an existing **16:9 landscape video** into a **9:16 portrait/mobile version**.

The workflow should be inspired by Twitch's Clip Creator / Clip Editor behavior, especially its automatic portrait crop, manual layout adjustment, persistent layout preference, and the **Stacked** portrait layout where two source regions are displayed vertically.

Reference: Twitch's current Clips documentation describes automatic portrait crops that attempt to keep gameplay and camera in frame, manual portrait editing, and two portrait layouts: **Stacked** and **Full**. The Stacked layout divides the portrait canvas into two adjustable boxes. citeturn0search0turn0search5

This project should reproduce the **interaction model and editing concepts**, not Twitch's proprietary implementation.

---

# 2. Target User Experience

The editor starts with an existing 16:9 source video.

The user selects:

- `Mobile / 9:16` output
- `Full` layout, or
- `Stacked` layout with **two crop-area zones**

For the requested two-zone workflow, the primary editing mode is:

```text
16:9 SOURCE
┌──────────────────────────────────────────────┐
│                                              │
│             LANDSCAPE VIDEO                  │
│                                              │
└──────────────────────────────────────────────┘

                  ↓ adaptive crop

9:16 MOBILE
┌──────────────┐
│              │
│   ZONE 1     │
│              │
├──────────────┤
│              │
│   ZONE 2     │
│              │
└──────────────┘
```

Each zone represents an independently positioned crop window over the original 16:9 source.

Typical use case:

- Zone 1 → face camera
- Zone 2 → gameplay/content

The two zones are then composed vertically into one 9:16 mobile video.

---

# 3. Design Reference: Twitch

The implementation should follow the same high-level principles used by Twitch:

1. Keep the original landscape clip intact.
2. Generate a separate portrait representation.
3. Automatically suggest a useful crop.
4. Allow the user to manually adjust the portrait layout.
5. Support a two-region stacked layout.
6. Allow the split between the two regions to be adjusted.
7. Show a live portrait preview.
8. Preserve the selected layout for future clips when appropriate.
9. Avoid destructive modifications to the original landscape video.

Twitch currently describes its portrait workflow as automatically generating a portrait version and allowing the creator to accept, adjust, or dismiss the crop suggestion. Its Stacked layout uses two vertically arranged boxes, with an adjustable horizontal divider. citeturn0search0

---

# 4. Scope

## 4.1 Required

The first implementation MUST support:

- 16:9 source video
- 9:16 output
- Full layout
- Stacked two-zone layout
- Two independent crop zones
- Dragging crop zones
- Scaling/zooming crop zones
- Adjustable vertical split
- Live preview
- Timeline scrubbing
- Play/pause
- Reset crop
- Auto-crop suggestion
- Apply/save layout
- Non-destructive editing
- Export/rendering of the final 9:16 video

## 4.2 Recommended

Support:

- Crop-zone locking
- Per-zone zoom
- Per-zone horizontal/vertical positioning
- Safe-area visualization
- Snap-to-center
- Reset individual zone
- Copy layout
- Undo/redo
- Layout presets
- Persistent channel/project preference
- Background blur when the crop does not completely fill the output
- Keyboard shortcuts on desktop
- Touch gestures on mobile/tablet

## 4.3 Out of Scope for Phase 1

Do not initially implement:

- AI facial recognition
- Identity recognition
- Advanced object tracking
- Automatic scene understanding
- Multi-person tracking
- Arbitrary aspect ratios
- Complex motion graphics
- Full subtitle editor
- Audio editing

The first version should focus on robust **16:9 → 9:16 adaptive cropping**.

---

# 5. Core Data Model

The mobile layout should be represented independently from the source video.

```ts
type MobileLayoutMode = "full" | "stacked";

interface CropZone {
  id: "zone-1" | "zone-2";

  // Position in normalized 16:9 source coordinates.
  x: number;
  y: number;

  // Size in normalized source coordinates.
  width: number;
  height: number;

  // Optional presentation controls.
  zoom: number;

  // Optional semantic hint.
  role?: "camera" | "gameplay" | "content" | "custom";
}

interface MobileLayout {
  version: 1;

  sourceAspectRatio: 16 / 9;
  outputAspectRatio: 9 / 16;

  mode: MobileLayoutMode;

  zones: CropZone[];

  // For stacked layout.
  splitRatio?: number;

  background:
    | {
        type: "blur";
        intensity: number;
      }
    | {
        type: "solid";
        value: string;
      }
    | {
        type: "none";
      };
}
```

Coordinates MUST be normalized rather than stored as pixels.

This allows the same layout to work across:

- different source resolutions
- preview sizes
- device resolutions
- render resolutions

---

# 6. Coordinate System

Use normalized source coordinates:

```text
x = 0.0 → left edge
x = 1.0 → right edge

y = 0.0 → top edge
y = 1.0 → bottom edge
```

The source is always interpreted as:

```text
16:9
width  = 1.0
height = 0.5625
```

or equivalently as a normalized rectangle:

```text
[0, 0, 1, 1]
```

with the aspect-ratio constraint handled by the crop viewport.

Never store editor positions solely as rendered preview pixels.

---

# 7. 9:16 Crop Geometry

A 9:16 crop from a 16:9 source is substantially narrower.

For a source normalized to width `1` and height `1` with an actual aspect ratio of `16:9`, calculate the crop dimensions using the actual source dimensions.

For a source:

```text
1920 × 1080
```

a full-height 9:16 crop is:

```text
607.5 × 1080
```

The crop viewport should therefore be constrained to:

```text
cropWidth / cropHeight = 9 / 16
```

Do not hard-code `607.5`.

The implementation must calculate the crop rectangle from:

```ts
cropWidth = cropHeight * (9 / 16);
```

or the equivalent formulation depending on the active crop height.

---

# 8. Two-Zone Stacked Layout

The primary mobile mode is:

```text
┌──────────────────────┐
│                      │
│       ZONE 1         │
│                      │
│                      │
├──────────────────────┤ ← draggable split
│                      │
│       ZONE 2         │
│                      │
│                      │
└──────────────────────┘
```

Each zone occupies part of the 9:16 output.

The user can drag the horizontal divider.

Example:

```text
splitRatio = 0.50

Zone 1 = 50%
Zone 2 = 50%
```

or:

```text
splitRatio = 0.65

Zone 1 = 65%
Zone 2 = 35%
```

The split ratio MUST be constrained to prevent unusably small zones.

Recommended limits:

```text
min = 0.20
max = 0.80
```

These values should be configurable.

---

# 9. Independent Crop Zones

Each zone must have its own crop rectangle.

Example:

```text
Zone 1
role = camera
x = 0.72
y = 0.05
width = ...
height = ...

Zone 2
role = gameplay
x = 0.50
y = 0.00
width = ...
height = ...
```

The zones may overlap in the original 16:9 source.

This is expected.

They are NOT two pieces of a single crop.

They are two independent views of the same source video.

---

# 10. Editor Interaction

## 10.1 Main Editor

The editor should present:

```text
┌─────────────────────────────────────────────────────────┐
│ Mobile Layout                                            │
├──────────────────────────────┬──────────────────────────┤
│                              │                          │
│       16:9 SOURCE            │      9:16 PREVIEW        │
│                              │                          │
│  ┌──────────┐                │      ┌──────────┐        │
│  │ Zone 1   │                │      │ Zone 1   │        │
│  └──────────┘                │      ├──────────┤        │
│       ┌───────────────┐      │      │ Zone 2   │        │
│       │ Zone 2        │      │      └──────────┘        │
│       └───────────────┘      │                          │
│                              │                          │
├──────────────────────────────┴──────────────────────────┤
│ Timeline / Playback                                     │
├─────────────────────────────────────────────────────────┤
│ Layout: [Full] [Stacked]       [Reset] [Apply] [Cancel] │
└─────────────────────────────────────────────────────────┘
```

The exact UI can differ, but the workflow must remain equivalent.

---

# 11. Crop Zone Manipulation

Each zone must support:

### Move

Drag the crop rectangle horizontally/vertically over the 16:9 source.

### Resize / Zoom

Changing the crop size must preserve the target aspect ratio.

For a zone:

```text
width / height = output-zone-width / output-zone-height
```

The user must never accidentally create a non-9:16 crop.

### Boundary Constraints

The crop rectangle cannot move outside the source unless the selected background mode explicitly permits uncovered areas.

Default behavior:

```text
crop must remain inside source
```

---

# 12. Preview Rendering

The preview is always a true 9:16 representation.

For Stacked:

```text
Output:
1080 × 1920

Zone 1:
1080 × (1920 * splitRatio)

Zone 2:
1080 × (1920 * (1 - splitRatio))
```

Each zone samples its corresponding crop rectangle from the original video.

The preview must update immediately when:

- crop position changes
- crop zoom changes
- split changes
- playback time changes
- layout mode changes

---

# 13. Time Behavior

The crop zones are initially **static across the entire clip**.

This is important for Phase 1.

For example:

```text
00:00 → 00:60

Zone 1 = same crop
Zone 2 = same crop
```

The crop should not automatically track objects frame-by-frame.

Later phases MAY add:

```text
keyframes
motion tracking
face tracking
gameplay-region tracking
```

but these are not required for the initial implementation.

---

# 14. Adaptive Auto-Crop

The editor should provide an automatic suggestion before manual editing.

The objective is similar to Twitch's portrait crop suggestion: identify important regions such as camera and gameplay and use them to construct a useful portrait framing. Twitch notes that its crop suggestion attempts to keep camera and gameplay in frame, with a centered crop as fallback when those regions cannot be confidently identified. citeturn0search0

The application should implement this as:

```text
SOURCE
  ↓
Analyze frame
  ↓
Detect candidate regions
  ↓
Rank candidate regions
  ↓
Generate Zone 1
  ↓
Generate Zone 2
  ↓
Validate crop
  ↓
Present suggestion
```

---

# 15. Auto-Crop Detection Strategy

Do NOT make AI detection a hard dependency for the first working implementation.

Use a layered strategy.

## Level 1 — Existing Project Metadata

If the source already knows:

- webcam position
- gameplay region
- scene composition
- overlay regions

use that information first.

## Level 2 — Heuristic Detection

Use visual heuristics to identify:

- face-camera-like regions
- large gameplay regions
- high-information regions
- static UI regions

## Level 3 — Optional ML Detector

A future detector may produce:

```ts
interface DetectedRegion {
  type: "camera" | "gameplay" | "content" | "face" | "unknown";

  confidence: number;

  x: number;
  y: number;
  width: number;
  height: number;
}
```

The layout generator then converts these regions into crop zones.

---

# 16. Auto Layout Algorithm

Given detected regions:

```text
camera
gameplay
```

generate:

```text
Zone 1 = camera
Zone 2 = gameplay
```

If only gameplay exists:

```text
Zone 1 = gameplay
Zone 2 = gameplay
```

or automatically switch to:

```text
Full
```

If detection confidence is too low:

```text
Full + centered crop
```

This follows the important UX principle of **never presenting a confidently wrong automatic crop**.

---

# 17. Suggestion UX

When the editor opens:

```text
Automatic mobile layout suggested
```

Show the suggestion immediately.

Provide:

```text
[Accept]
[Adjust]
[Reset]
```

Do not force the user to manually create the crop.

The automatic result should always remain editable.

---

# 18. Full Layout

The Full layout contains one crop zone.

```text
┌──────────────┐
│              │
│              │
│    FULL      │
│    CROP      │
│              │
│              │
└──────────────┘
```

Use it when:

- only one region matters
- the content is already centered
- camera/gameplay splitting is undesirable
- automatic detection fails

---

# 19. Stacked Layout

The Stacked layout contains two zones.

```text
┌──────────────┐
│              │
│    ZONE 1    │
│              │
├──────────────┤
│              │
│    ZONE 2    │
│              │
└──────────────┘
```

The split handle must be draggable.

Recommended interaction:

```text
hover / touch
      ↓
split handle highlights
      ↓
drag
      ↓
preview updates continuously
      ↓
release
      ↓
save splitRatio
```

---

# 20. Mobile Interaction

The editor should support touch-first interaction.

### Crop movement

One-finger drag.

### Zoom

Pinch gesture.

### Split adjustment

Drag the horizontal divider.

### Timeline

Horizontal swipe/drag.

### Playback

Tap preview.

### Reset

Double-tap crop zone or use explicit Reset control.

Desktop mouse interactions must remain supported.

---

# 21. Safe Areas

The 9:16 preview should optionally display:

```text
┌────────────────────┐
│    SAFE AREA       │
│                    │
│                    │
│                    │
│                    │
│                    │
│                    │
└────────────────────┘
```

Safe-area overlays should be editor-only.

They MUST NOT be rendered into the final video.

The system should allow future platform-specific safe zones without changing the crop model.

---

# 22. Background Handling

If a crop cannot fill the entire output:

```text
Option A:
blurred source background

Option B:
solid background

Option C:
none
```

Default:

```text
blurred source background
```

The background should be generated from the source frame/video behind the crop.

It must not modify the original source.

---

# 23. Rendering Pipeline

Final rendering should follow:

```text
16:9 source
     │
     ├───────────────┐
     │               │
     ▼               ▼
  Zone 1           Zone 2
     │               │
     ▼               ▼
 crop/filter       crop/filter
     │               │
     └───────┬───────┘
             ▼
      vertical compositor
             │
             ▼
          9:16 frame
             │
             ▼
       encoder/export
```

For every output frame:

1. Decode source frame.
2. Resolve active mobile layout.
3. Calculate Zone 1 crop.
4. Calculate Zone 2 crop.
5. Render each crop to its output region.
6. Render optional background.
7. Composite the two zones.
8. Encode the resulting 9:16 frame.

---

# 24. Non-Destructive Editing

The editor MUST NOT modify the source video.

Store:

```text
source video
+
mobile layout metadata
```

instead of creating an intermediate video for every edit.

Only render/export when necessary.

This enables:

- instant layout changes
- undo/redo
- multiple layouts
- future re-rendering
- different output resolutions

---

# 25. Layout Persistence

The application should support a saved default layout.

Example:

```ts
interface MobileLayoutPreference {
  userId?: string;
  projectId?: string;

  layout: MobileLayout;

  updatedAt: string;
}
```

When creating another mobile clip from the same source/project:

```text
load previous preference
        ↓
apply layout
        ↓
allow adjustment
```

This follows the Twitch concept of allowing a portrait layout preference to be reused for future clips. citeturn0search0turn0search1

---

# 26. Versioned Layout Schema

Always version persisted layouts.

Example:

```json
{
  "version": 1,
  "mode": "stacked",
  "sourceAspectRatio": 1.7777777778,
  "outputAspectRatio": 0.5625,
  "splitRatio": 0.5,
  "zones": []
}
```

Future schema migrations MUST be possible.

Never assume old layouts can be interpreted by the latest editor without migration.

---

# 27. Undo / Redo

Every layout modification should be represented as an editor command.

Examples:

```text
MoveZone
ResizeZone
ChangeSplit
ChangeMode
ResetZone
ApplyAutoCrop
```

The editor should maintain:

```text
undoStack
redoStack
```

Dragging should preferably be grouped into one logical undo operation rather than creating hundreds of history entries.

---

# 28. Validation

Before saving:

### Source

- source exists
- source is readable
- source has valid dimensions
- source aspect ratio is known

### Layout

- mode is valid
- zones are present
- crop rectangles are valid
- crop aspect ratios are correct
- split ratio is within limits
- coordinates are normalized
- crop zones are inside source bounds

### Output

- aspect ratio is exactly 9:16
- output dimensions are valid
- encoder supports the requested output

Invalid layouts MUST be rejected before rendering.

---

# 29. Performance Requirements

The editing preview must not require full-resolution final rendering for every interaction.

Use:

```text
low-resolution proxy / preview frames
```

for editor interaction.

Final rendering uses:

```text
original source
```

The architecture should therefore separate:

```text
Preview Renderer
Final Renderer
```

They share the same layout model.

This guarantees that the preview and final renderer use identical crop geometry.

---

# 30. Preview / Final Consistency

The following must be identical between preview and final render:

- crop coordinates
- crop aspect ratio
- split ratio
- zone order
- background behavior
- output aspect ratio

Only rendering quality/resolution may differ.

A layout that looks correct in preview MUST produce the same composition in the exported video.

---

# 31. Export Presets

Initial required preset:

```text
Mobile 9:16
1080 × 1920
```

The architecture should allow:

```text
720 × 1280
1080 × 1920
1440 × 2560
```

without changing the layout model.

---

# 32. Audio

The mobile version should reuse the original clip audio by default.

Changing the crop/layout must NOT alter:

- audio timing
- duration
- sample synchronization

Unless a later feature explicitly introduces audio editing.

---

# 33. Clip Duration

The mobile layout operates on the existing clip duration.

For example:

```text
Landscape clip:
00:00 → 00:60

Mobile clip:
00:00 → 00:60
```

The layout transformation must not independently trim the clip.

If trimming exists elsewhere in the video editor, the mobile renderer should consume the already-defined clip time range.

---

# 34. State Machine

Recommended editor states:

```text
IDLE
  ↓
LOADING
  ↓
ANALYZING
  ↓
SUGGESTION_READY
  ↓
EDITING
  ↓
VALIDATING
  ↓
APPLYING
  ↓
SAVED
```

Error path:

```text
ANY STATE
   ↓
ERROR
   ↓
RETRY / RESET
```

---

# 35. Recommended UI State

```ts
interface MobileEditorState {
  sourceId: string;

  currentTime: number;

  isPlaying: boolean;

  layout: MobileLayout;

  selectedZone: "zone-1" | "zone-2" | null;

  isAutoCropRunning: boolean;

  hasUnsavedChanges: boolean;

  undoStack: EditorCommand[];

  redoStack: EditorCommand[];
}
```

---

# 36. API Boundary

The UI should not directly implement video rendering logic.

Recommended separation:

```text
MobileEditor UI
      ↓
MobileLayoutService
      ↓
Layout validation / normalization
      ↓
PreviewRenderer / RenderJob
      ↓
Video processing backend
```

The UI owns interaction.

The layout service owns geometry.

The renderer owns pixels.

---

# 37. Rendering Contract

The renderer should receive a fully resolved layout:

```ts
interface MobileRenderRequest {
  sourceId: string;

  startTime: number;
  endTime: number;

  output: {
    width: number;
    height: number;
    fps?: number;
  };

  layout: MobileLayout;

  audio: {
    source: "original";
  };
}
```

The renderer MUST NOT need to understand UI state.

---

# 38. Phase-Based Implementation

## Phase 1 — Layout Model

- [ ] Define `MobileLayout`
- [ ] Define `CropZone`
- [ ] Define normalized coordinates
- [ ] Define schema versioning
- [ ] Implement validation
- [ ] Add serialization/deserialization
- [ ] Add migration framework

**Exit criteria:** A valid mobile layout can be stored and restored without loss.

---

## Phase 2 — 9:16 Geometry Engine

- [ ] Implement 16:9 → 9:16 crop calculations
- [ ] Implement crop bounds
- [ ] Implement zoom
- [ ] Implement normalized coordinate conversion
- [ ] Implement split geometry
- [ ] Implement zone output rectangles

**Exit criteria:** Given the same layout, geometry calculations always produce deterministic output.

---

## Phase 3 — Static Preview

- [ ] Render a source frame
- [ ] Render Full layout
- [ ] Render Stacked layout
- [ ] Render Zone 1
- [ ] Render Zone 2
- [ ] Render divider
- [ ] Add background handling

**Exit criteria:** A still frame accurately represents the final 9:16 composition.

---

## Phase 4 — Interactive Crop Editor

- [ ] Add crop dragging
- [ ] Add zoom
- [ ] Add crop constraints
- [ ] Add zone selection
- [ ] Add split dragging
- [ ] Add reset controls
- [ ] Add touch interaction

**Exit criteria:** A user can manually build a complete two-zone mobile layout.

---

## Phase 5 — Video Preview

- [ ] Add video playback
- [ ] Connect currentTime to renderer
- [ ] Add timeline
- [ ] Add play/pause
- [ ] Add seeking
- [ ] Optimize preview rendering

**Exit criteria:** Crop/layout changes are visible during video playback.

---

## Phase 6 — Auto Crop

- [ ] Implement centered fallback
- [ ] Implement heuristic region detection
- [ ] Implement camera detection
- [ ] Implement gameplay detection
- [ ] Generate candidate zones
- [ ] Rank candidates
- [ ] Add Accept / Adjust / Reset workflow

**Exit criteria:** The system can generate a useful automatic portrait suggestion without preventing manual correction.

---

## Phase 7 — Persistence

- [ ] Save layout
- [ ] Load layout
- [ ] Store default preference
- [ ] Apply previous layout to new clips
- [ ] Add schema migration

**Exit criteria:** A previously configured mobile layout can be reused safely.

---

## Phase 8 — Final Renderer

- [ ] Implement full-resolution rendering
- [ ] Implement 1080×1920 output
- [ ] Preserve original audio
- [ ] Validate output
- [ ] Add render progress
- [ ] Add cancellation
- [ ] Add retry

**Exit criteria:** The final rendered video matches the editor preview.

---

## Phase 9 — Quality Assurance

Test:

- [ ] 16:9 1080p
- [ ] 16:9 1440p
- [ ] 16:9 4K
- [ ] short clips
- [ ] long clips
- [ ] camera + gameplay
- [ ] gameplay only
- [ ] camera only
- [ ] no detectable regions
- [ ] dark frames
- [ ] static scenes
- [ ] rapidly changing scenes
- [ ] crop at left edge
- [ ] crop at right edge
- [ ] crop at top edge
- [ ] crop at bottom edge
- [ ] minimum split
- [ ] maximum split
- [ ] overlapping source zones
- [ ] portrait export
- [ ] audio synchronization
- [ ] layout persistence
- [ ] schema migration

---

# 39. Acceptance Criteria

The feature is complete when all of the following are true:

1. A 16:9 source can produce a 9:16 mobile version.
2. The user can select Full or Stacked.
3. Stacked provides exactly two independently editable crop zones.
4. Each crop maintains the correct aspect ratio.
5. Each crop can be moved independently.
6. Each crop can be zoomed independently.
7. The horizontal split is draggable.
8. The preview updates interactively.
9. The layout is represented using normalized coordinates.
10. The original source remains untouched.
11. Auto-crop can produce a suggestion.
12. Auto-crop has a safe centered fallback.
13. The user can accept or manually adjust the suggestion.
14. Layouts can be saved and reused.
15. Preview and final rendering use the same geometry engine.
16. The final output is exactly 9:16.
17. Audio remains synchronized.
18. Invalid layouts cannot be rendered.
19. Undo/redo works for layout modifications.
20. The final exported video visually matches the editor preview.

---

# 40. Important Architectural Principle

Do not implement this as:

```text
"crop the video into a vertical rectangle"
```

Implement it as:

```text
16:9 source
      ↓
semantic / geometric regions
      ↓
mobile layout
      ↓
independent crop zones
      ↓
9:16 composition
      ↓
preview
      ↓
final render
```

The **mobile layout is the product feature**.

Video rendering is only the final execution of that layout.

This separation is what makes the system capable of reproducing the adaptive workflow demonstrated by Twitch: automatic portrait suggestions, editable crop regions, a two-region stacked composition, reusable preferences, and non-destructive generation of a mobile version alongside the original landscape clip. citeturn0search0turn0search1

---

# 41. Future Extensions

The architecture should leave room for:

```text
Keyframed crop positions
        ↓
Motion tracking
        ↓
Face tracking
        ↓
Gameplay tracking
        ↓
AI composition
        ↓
Platform-specific layouts
```

Potential future model:

```ts
interface CropKeyframe {
  time: number;
  zoneId: string;

  x: number;
  y: number;

  width: number;
  height: number;

  zoom: number;
}
```

This would allow a crop to follow a camera or gameplay region during the clip.

Do not introduce this complexity until the static two-zone workflow is stable.

---

# 42. Reference Behavior Summary

The Twitch reference establishes the following useful product patterns:

- portrait output is generated alongside the original landscape clip;
- automatic crop suggestions attempt to preserve important regions such as camera and gameplay;
- the suggestion can be accepted or manually adjusted;
- portrait editing includes a Full layout and a Stacked layout;
- Stacked places two boxes vertically;
- the divider between those boxes can be adjusted;
- portrait layout preferences can be reused for future clips;
- the original landscape clip remains available independently of the portrait representation. citeturn0search0turn0search1

Our implementation should adopt these **workflow principles**, while keeping the actual implementation, data model, detection logic, and rendering pipeline independent.

