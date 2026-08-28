# Research: Desktop Video Editing with Dual Crop Zones

## Overview
This document outlines the technical strategy for implementing a desktop-focused video editor that allows users to define two distinct cropping zones on a single video source. The implementation leverages mouse precision and keyboard shortcuts to provide a professional editing experience.

## 1. Frontend Implementation (React)

### UI/UX Strategy
On desktop, users expect high precision and the ability to use keyboard shortcuts for fine-tuning.

#### Recommended Libraries:
- **`react-rnd`**: Excellent for creating resizable and draggable components with mouse precision. It handles the complex math of dragging and resizing which can be implemented as the "crop zones".
- **`framer-motion`**: For smooth UI transitions, such as opening/closing property panels or animating zoom effects.
- **`lucide-react`**: For high-quality, scalable desktop icons.

#### Implementation Logic:
1.  **Video Layer**: A standard HTML5 `<video>` element acting as the background.
2.  **Overlay Layer**: A transparent `div` positioned absolutely over the video, matching its dimensions.
3.  **Crop Zones**: Two instances of a Resizable/Draggable component (using `react-rnd`) rendered within the Overlay Layer.
4.  **Coordinate Synchronization**: 
    *   The UI uses CSS pixels for the crop boxes.
    *   **Crucial Step**: You must map these CSS coordinates back to the **native video resolution**.
    *   *Formula*: `actual_x = (ui_x / overlay_width) * video_native_width`

### State Management:
- Use **TanStack Store** or standard React `useState` to manage an array of crop objects:
  ```typescript
  type CropZone = {
    id: string;
    x: number; // relative to video native width
    y: number; // relative to video native height
    width: number;
    height: number;
  };
  ```

## 2. Backend Processing (FFmpeg)

To process two different crops from a single input, the `filter_complex` flag is mandatory. This allows for branching and merging streams within a single command.

### Common Use Cases & FFmpeg Commands:

#### A. Side-by-Side (Split Screen)
Combines two cropped regions into one wide frame.
```bash
ffmpeg -i input.mp4 -filter_complex \
"[0:v]crop=w1:h1:x1:y1[v1]; \
 [0:v]crop=w2:h2:x2:y2[v2]; \
 [v1][v2]hstack=inputs=2[out]" \
-map "[out]" output.mp4
```

#### B. Picture-in-Picture (PiP)
Overlays one cropped region onto the original or another cropped region.
```bash
ffmpeg -i input.mp4 -filter_complex \
"[0:v]crop=w1:h1:x1:y1[bg]; \
 [0:v]crop=w2:h2:x2:y2[fg]; \
 [bg][fg]overlay=x=offset_x:y=offset_y[out]" \
-map "[out]" output.mp4
```

#### C. Creating Two Separate Files
If the user wants two different clips from one video.
```bash
ffmpeg -i input.mp4 -filter_complex \
"[0:v]crop=w1:h1:x1:y1[v1]; \
 [0:v]crop=w2:h2:x2:y2[v2]" \
-map "[v1]" output1.mp4 -map "[v2]" output2.mp4
```

## 3. Desktop Optimizations

### Performance
- **Debounced State Updates**: When dragging crop zones, debounce the state updates to prevent excessive re-renders of the video component and UI lag.
- **Hardware Acceleration**: Ensure the browser is utilizing hardware acceleration for the `<video>` element to maintain high frame rates during editing.

### UX Enhancements
- **Keyboard Shortcuts**: 
    *   `Arrow Keys`: Fine-tune crop position (1px increments).
    *   `Shift + Arrow Keys`: Fine-tune crop size.
    *   `+/-`: Zoom in/out of the video preview.
- **Mouse Precision**: Implement "Snap to Aspect Ratio" (e.g., 16:9, 4:3) that triggers when a user drags a corner, making it easier to get perfect crops.
- **Property Panel**: A sidebar for precise numerical input of X, Y, Width, and Height coordinates.

## 4. Best Practices Summary

| Category | Recommendation |
| :--- | :--- |
| **Accuracy** | Always calculate crop coordinates based on native video resolution, not DOM pixels. |
| **Performance** | Use debounced updates for UI elements to keep the editor responsive. |
| **Complexity** | Use FFmpeg `filter_complex` to perform all crops in a single pass to minimize CPU/GPU usage. |
| **UX** | Provide numerical input fields for precise coordinate control alongside mouse dragging. |
| **Reliability** | Validate crop boundaries (ensure $x + width \le video\_width$) before sending to the API. |
