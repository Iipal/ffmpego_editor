"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { formatTime } from "@/lib/format-time";
import { clamp } from "@/lib/mobile-layout";
import { useSharedMobileLayout } from "@/hooks/useSharedMobileLayout";
import { MobilePreviewShared } from "@/components/editor/MobilePreviewShared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { renderAllSubtitlesToPngs } from "@/lib/subtitles/renderSubtitlePng";
import type {
  Subtitle,
  SubtitleStyle,
  SubtitleTemplate,
} from "@/lib/subtitles/subtitleTypes";
import {
  DEFAULT_SUBTITLE_STYLE,
  FONT_FAMILY_OPTIONS,
  MIN_SUBTITLE_DURATION,
} from "@/lib/subtitles/subtitleDefaults";
import {
  SUBTITLE_TEMPLATES_STORAGE_KEY,
  loadSubtitleTemplates,
  saveSubtitleTemplates,
} from "@/lib/subtitles/subtitleStorage";

// helpers
function timeToPercent(time: number, start: number, end: number): number {
  if (end <= start) return 0;
  return clamp(((time - start) / (end - start)) * 100, 0, 100);
}
function percentToTime(percent: number, start: number, end: number): number {
  const p = clamp(percent, 0, 100) / 100;
  return start + p * (end - start);
}
function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
function isValidHexColor(v: string): boolean {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(v.trim());
}
function normalizeHex(v: string): string {
  const t = v.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toUpperCase();
  return t;
}
function getSubtitleTrack(s: Subtitle): number {
  return typeof (s as unknown as { track?: number }).track === "number"
    ? (s as unknown as { track: number }).track
    : 0;
}
function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
function findFirstFreeTrack(
  subtitles: Subtitle[],
  start: number,
  end: number,
  excludeId?: string,
): number {
  const existingTracks = new Set<number>();
  subtitles.forEach((s) => {
    if (excludeId && s.id === excludeId) return;
    existingTracks.add(getSubtitleTrack(s));
  });
  const sorted = Array.from(existingTracks).sort((a, b) => a - b);
  const maxTrack = sorted.length ? Math.max(...sorted) : -1;
  // check 0..maxTrack inclusive (fills gaps), then maxTrack+1
  for (let t = 0; t <= maxTrack; t++) {
    const overlaps = subtitles.some((s) => {
      if (excludeId && s.id === excludeId) return false;
      if (getSubtitleTrack(s) !== t) return false;
      return intervalsOverlap(s.startTime, s.endTime, start, end);
    });
    if (!overlaps) return t;
  }
  return maxTrack + 1;
}

function renderSubtitleStyle(style: SubtitleStyle): React.CSSProperties {
  const hasOutline = style.outlineEnabled && style.outlineThickness > 0;
  const hasShadow = style.shadowEnabled && style.shadowSize > 0;
  const hasBackground = style.backgroundEnabled;
  const shadow = hasShadow
    ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowSize}px ${style.shadowColor}`
    : undefined;
  return {
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize / 4}px`,
    color: style.color,
    WebkitTextStroke: hasOutline
      ? `${style.outlineThickness}px ${style.outlineColor}`
      : undefined,
    textShadow: shadow
      ? hasOutline
        ? `${shadow}, -${style.outlineThickness}px -${style.outlineThickness}px 0 ${style.outlineColor}, ${style.outlineThickness}px -${style.outlineThickness}px 0 ${style.outlineColor}, -${style.outlineThickness}px ${style.outlineThickness}px 0 ${style.outlineColor}, ${style.outlineThickness}px ${style.outlineThickness}px 0 ${style.outlineColor}`
        : shadow
      : hasOutline
        ? `-1px -1px 0 ${style.outlineColor}, 1px -1px 0 ${style.outlineColor}, -1px 1px 0 ${style.outlineColor}, 1px 1px 0 ${style.outlineColor}`
        : undefined,
    backgroundColor: hasBackground ? style.backgroundColor : "transparent",
    padding: hasBackground
      ? `${style.backgroundPadding / 3}px ${style.backgroundPadding / 2}px`
      : "0",
    borderRadius: hasBackground ? `${style.backgroundBorderRadius}px` : "0",
    border: hasBackground ? undefined : "none",
    outline: hasBackground ? undefined : "none",
    boxShadow: hasBackground ? undefined : "none",
    lineHeight: 1.2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    paintOrder: "stroke fill" as unknown as string,
  } as React.CSSProperties;
}

export default function PageEditorSubtitles() {
  const videoStore = useVideoStore();
  const videoState = useVideoState();
  const {
    mediaUrl,
    duration: srcDuration,
    file,
    sourceWidth,
    sourceHeight,
    subtitles: rawSubtitles,
    selectedSubtitleId: rawSelectedId,
    subtitleTrackCountExplicit: rawTrackCount,
  } = videoState as typeof videoState & {
    subtitles?: Subtitle[];
    selectedSubtitleId?: string | null;
    subtitleTrackCountExplicit?: number;
  };
  const subtitles = rawSubtitles ?? [];
  const selectedId = rawSelectedId ?? null;
  const trackCountExplicit = rawTrackCount ?? 1;
  const { layout } = useSharedMobileLayout();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Migrate old store instances (HMR) that were created before subtitles fields existed
  useEffect(() => {
    const s = (videoStore.state ?? (videoStore as unknown as { get: () => unknown }).get?.()) as unknown as {
      subtitles?: Subtitle[];
      selectedSubtitleId?: string | null;
      subtitleTrackCountExplicit?: number;
    };
    if (
      s.subtitles === undefined ||
      s.selectedSubtitleId === undefined ||
      s.subtitleTrackCountExplicit === undefined
    ) {
      videoStore.setState((prev) => {
        const p = prev as unknown as {
          subtitles?: Subtitle[];
          selectedSubtitleId?: string | null;
          subtitleTrackCountExplicit?: number;
        };
        return {
          ...prev,
          subtitles: p.subtitles ?? [],
          selectedSubtitleId: p.selectedSubtitleId ?? null,
          subtitleTrackCountExplicit: p.subtitleTrackCountExplicit ?? 1,
        };
      });
    }
  }, [videoStore]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

  const setSubtitles = useCallback(
    (
      updater:
        | Subtitle[]
        | ((prev: Subtitle[]) => Subtitle[]),
    ) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { subtitles?: Subtitle[] };
        const cur = p.subtitles ?? [];
        return {
          ...prev,
          subtitles:
            typeof updater === "function"
              ? (updater as (x: Subtitle[]) => Subtitle[])(cur)
              : updater,
        };
      });
    },
    [videoStore],
  );
  const setSelectedId = useCallback(
    (id: string | null | ((prev: string | null) => string | null)) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { selectedSubtitleId?: string | null };
        const cur = p.selectedSubtitleId ?? null;
        return {
          ...prev,
          selectedSubtitleId:
            typeof id === "function"
              ? (id as (x: string | null) => string | null)(cur)
              : id,
        };
      });
    },
    [videoStore],
  );
  const setTrackCountExplicit = useCallback(
    (value: number | ((prev: number) => number)) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { subtitleTrackCountExplicit?: number };
        const cur = p.subtitleTrackCountExplicit ?? 1;
        return {
          ...prev,
          subtitleTrackCountExplicit:
            typeof value === "function"
              ? (value as (x: number) => number)(cur)
              : value,
        };
      });
    },
    [videoStore],
  );

  const [templates, setTemplates] = useState<SubtitleTemplate[]>(() => {
    try {
      return loadSubtitleTemplates();
    } catch {
      return [];
    }
  });
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const hasVideo = !!mediaUrl && !!file;
  const effectiveDuration = duration || srcDuration || 0;

  const maxTrackFromSubtitles = useMemo(() => {
    if (subtitles.length === 0) return -1;
    return Math.max(...subtitles.map((s) => getSubtitleTrack(s)));
  }, [subtitles]);
  const trackCount = useMemo(() => {
    return Math.max(trackCountExplicit, maxTrackFromSubtitles + 1, 1);
  }, [trackCountExplicit, maxTrackFromSubtitles]);

  // keep explicit count in sync if subtitles need more tracks
  useEffect(() => {
    if (maxTrackFromSubtitles + 1 > trackCountExplicit) {
      setTrackCountExplicit(maxTrackFromSubtitles + 1);
    }
  }, [maxTrackFromSubtitles, trackCountExplicit, setTrackCountExplicit]);

  // init trim when duration available
  useEffect(() => {
    if (effectiveDuration > 0 && trimEnd === 0) {
      setTrimStart(0);
      setTrimEnd(effectiveDuration);
    }
    if (effectiveDuration > 0 && trimEnd > effectiveDuration) {
      setTrimEnd(effectiveDuration);
      if (trimStart >= effectiveDuration)
        setTrimStart(Math.max(0, effectiveDuration - 1));
    }
  }, [effectiveDuration, trimEnd, trimStart]);

  // templates persistence lifecycle: load on mount already, save on change
  useEffect(() => {
    // load is done in initializer; also handle malformed via storage util
    // ensure we write only when templates change (skip initial empty if not needed)
  }, []);
  useEffect(() => {
    saveSubtitleTemplates(templates);
  }, [templates]);

  // video event handling
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoadedMetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        setDuration(d);
        if (trimEnd === 0) {
          setTrimStart(0);
          setTrimEnd(d);
        }
      }
    };
    const onTimeUpdate = () => {
      const t = v.currentTime;
      // loop / stop at trimEnd
      if (isLooping && trimEnd > trimStart) {
        if (t >= trimEnd - 0.02) {
          v.currentTime = trimStart;
          setCurrentTime(trimStart);
          return;
        }
        if (t < trimStart - 0.01) {
          v.currentTime = trimStart;
          setCurrentTime(trimStart);
          return;
        }
      } else {
        if (t >= trimEnd - 0.01 && trimEnd > 0) {
          v.pause();
          v.currentTime = trimEnd;
          setCurrentTime(trimEnd);
          setIsPlaying(false);
          return;
        }
      }
      setCurrentTime(t);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      if (isLooping && trimEnd > trimStart) {
        v.currentTime = trimStart;
        v.play().catch(() => {});
      } else {
        setIsPlaying(false);
      }
    };
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    // if metadata already loaded
    if (
      v.readyState >= 1 &&
      Number.isFinite(v.duration) &&
      v.duration !== duration
    ) {
      setDuration(v.duration);
    }
    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [mediaUrl, isLooping, trimStart, trimEnd, duration]);

  // RAF sync for smooth playhead
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const t = v.currentTime;
        if (isLooping && trimEnd > trimStart && t >= trimEnd - 0.02) {
          v.currentTime = trimStart;
        }
        setCurrentTime(v.currentTime);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, isLooping, trimStart, trimEnd]);

  // sync play/pause to video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => setIsPlaying(false));
    else v.pause();
  }, [isPlaying]);

  const selectedSubtitle = useMemo(
    () => subtitles.find((s) => s.id === selectedId) ?? null,
    [subtitles, selectedId],
  );

  const activeSubtitles = useMemo(
    () =>
      subtitles.filter(
        (s) => currentTime >= s.startTime && currentTime < s.endTime,
      ),
    [subtitles, currentTime],
  );

  const updateSubtitle = useCallback(
    (id: string, patch: Partial<Subtitle> | ((s: Subtitle) => Subtitle)) => {
      setSubtitles((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          if (typeof patch === "function")
            return (patch as (x: Subtitle) => Subtitle)(s);
          return { ...s, ...patch };
        }),
      );
    },
    [],
  );

  const updateSelectedStyle = useCallback(
    (patch: Partial<SubtitleStyle>) => {
      if (!selectedId) return;
      setSubtitles((prev) =>
        prev.map((s) =>
          s.id === selectedId ? { ...s, style: { ...s.style, ...patch } } : s,
        ),
      );
    },
    [selectedId],
  );

  // Add subtitle
  const handleAddSubtitle = useCallback(() => {
    if (!hasVideo || effectiveDuration === 0) return;
    const t = clamp(
      currentTime,
      trimStart,
      Math.max(trimStart, trimEnd - MIN_SUBTITLE_DURATION),
    );
    const start = clamp(t, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
    const end = clamp(start + 1, start + MIN_SUBTITLE_DURATION, trimEnd);
    const id = generateId();
    setSubtitles((prev) => {
      const track = findFirstFreeTrack(prev, start, end);
      const newSub: Subtitle = {
        id,
        text: "New subtitle",
        startTime: start,
        endTime: end,
        track,
        position: { x: 50, y: 80 },
        style: { ...DEFAULT_SUBTITLE_STYLE },
      };
      // ensure trackCountExplicit will grow via effect, but also bump now if needed
      if (track + 1 > trackCountExplicit) {
        // defer but sync quickly
        setTrackCountExplicit(track + 1);
      }
      return [...prev, newSub];
    });
    setSelectedId(id);
  }, [hasVideo, effectiveDuration, currentTime, trimStart, trimEnd, trackCountExplicit]);

  const handleDeleteSubtitle = useCallback(() => {
    if (!selectedId) return;
    setSubtitles((prev) => {
      const idx = prev.findIndex((s) => s.id === selectedId);
      const next = prev.filter((s) => s.id !== selectedId);
      // select neighbor
      if (next.length === 0) setSelectedId(null);
      else {
        const newIdx = Math.min(idx, next.length - 1);
        setSelectedId(next[newIdx].id);
      }
      return next;
    });
  }, [selectedId]);

  const handleMoveSubtitleToTrack = useCallback(
    (id: string, newTrack: number) => {
      const t = clamp(Math.round(newTrack), 0, 99);
      if (t >= trackCount) {
        setTrackCountExplicit(t + 1);
      }
      setSubtitles((prev) =>
        prev.map((s) => (s.id === id ? { ...s, track: t } : s)),
      );
    },
    [trackCount],
  );

  const handleAddTrack = useCallback(() => {
    setTrackCountExplicit((c) => c + 1);
  }, []);

  // Player controls
  const playFromTrimStart = useCallback(async () => {
    const v = videoRef.current;
    if (!v || effectiveDuration === 0) return;
    if (currentTime < trimStart || currentTime > trimEnd) {
      v.currentTime = trimStart;
      setCurrentTime(trimStart);
    } else if (v.currentTime < trimStart) {
      v.currentTime = trimStart;
      setCurrentTime(trimStart);
    } else {
      // if already at trimStart region, ensure seek to trimStart when explicitly requested via button? spec says start from trim start when starting playback, so we seek
      v.currentTime = trimStart;
      setCurrentTime(trimStart);
    }
    setIsPlaying(true);
  }, [currentTime, trimStart, trimEnd, effectiveDuration]);

  const togglePlayback = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    // if starting playback and before trimStart, seek to trimStart
    if (!isPlaying) {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) {
        v.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isPlaying, trimStart, trimEnd]);

  // Seek via progress bar (trim range normalized)
  const handleProgressSeek = useCallback(
    (value: number) => {
      const v = videoRef.current;
      if (!v || effectiveDuration === 0) return;
      // value is absolute time if we use full duration slider, but spec prefers trim range normalized
      // We'll implement as absolute time within trim range when isTrimProgress true? For simplicity we map progress bar to trimStart->trimEnd
      // But PlayerControls spec says progress = (currentTime - trimStart)/(trimEnd-trimStart), so we handle both.
      // Here we receive absolute time from slider that spans trimStart..trimEnd if we set min/max accordingly
      const t = clamp(value, trimStart, trimEnd);
      v.currentTime = t;
      setCurrentTime(t);
    },
    [trimStart, trimEnd, effectiveDuration],
  );

  // Timeline seek (click on full duration)
  const handleTimelineSeek = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      const t = clamp(time, 0, effectiveDuration);
      v.currentTime = t;
      setCurrentTime(t);
    },
    [effectiveDuration],
  );

  // Template apply
  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (!selectedId) return;
      const tmpl = templates.find((t) => t.id === templateId);
      if (!tmpl) return;
      setSubtitles((prev) =>
        prev.map((s) =>
          s.id === selectedId ? { ...s, style: { ...tmpl.style } } : s,
        ),
      );
    },
    [selectedId, templates],
  );

  const handleSaveTemplate = useCallback(() => {
    if (!selectedSubtitle) return;
    const name = newTemplateName.trim();
    if (!name) return;
    const newTmpl: SubtitleTemplate = {
      id: generateId(),
      name,
      style: { ...selectedSubtitle.style },
    };
    setTemplates((prev) => [...prev, newTmpl]);
    setNewTemplateName("");
  }, [selectedSubtitle, newTemplateName]);

  // Helpers for input validation
  const handleTrimChange = useCallback(
    (newStart: number, newEnd: number) => {
      const d = effectiveDuration || 30;
      let s = clamp(newStart, 0, d - MIN_SUBTITLE_DURATION);
      let e = clamp(newEnd, 0, d);
      if (e - s < MIN_SUBTITLE_DURATION) return;
      // ensure within duration
      if (s < 0) s = 0;
      if (e > d) e = d;
      if (s >= e) return;
      setTrimStart(s);
      setTrimEnd(e);
      // clamp subtitles inside
      setSubtitles((prev) =>
        prev.map((sub) => {
          let ns = sub.startTime;
          let ne = sub.endTime;
          const dur = ne - ns;
          if (ns < s) {
            ns = s;
            ne = ns + dur;
          }
          if (ne > e) {
            ne = e;
            ns = Math.max(s, ne - dur);
          }
          if (ne - ns < MIN_SUBTITLE_DURATION) {
            ne = Math.min(e, ns + MIN_SUBTITLE_DURATION);
          }
          ns = clamp(ns, s, e - MIN_SUBTITLE_DURATION);
          ne = clamp(ne, ns + MIN_SUBTITLE_DURATION, e);
          return { ...sub, startTime: ns, endTime: ne };
        }),
      );
    },
    [effectiveDuration],
  );

  const handleExport = useCallback(async () => {
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (trimEnd <= trimStart + 0.05) {
      toast.error("Invalid trim range");
      return;
    }
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const baseName = (file.name.replace(/\.[^.]+$/, "") || "video") + "_mobile_subtitles_1080x1920";
    const outName = baseName + ".mp4";
    setIsExporting(true);
    toast.loading(subtitles.length ? `Rendering ${subtitles.length} subtitle PNGs…` : "Exporting mobile mp4 (CRF 10)…", { id: "subtitles-export" });
    try {
      const { API_BASE_URL } = await import("@/lib/api-client");
      // Render PNGs: front-end bakes text style into fitted images
      const rendered = subtitles.length ? await renderAllSubtitlesToPngs(subtitles) : [];
      toast.loading(`Exporting ${rendered.length} subtitles + 9:16…`, { id: "subtitles-export" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "settings",
        JSON.stringify({
          mobileLayout: layout,
          sourceWidth: sw,
          sourceHeight: sh,
          trimRange: [trimStart, trimEnd],
          exportFormat: "mp4",
          exportFps: 30,
          exportFilename: baseName,
          exportQuality: 10,
          exportSpeed: 1,
          customFFmpegArgs: "",
        }),
      );
      // subtitles meta aligned with PNG order
      const subtitlesMeta = rendered.map((r) => ({
        startTime: r.meta.startTime,
        endTime: r.meta.endTime,
        x: r.meta.x,
        y: r.meta.y,
        width: r.meta.width,
        height: r.meta.height,
      }));
      fd.append("subtitles", JSON.stringify(subtitlesMeta));
      rendered.forEach((r, i) => {
        const f = new File([r.blob], `subtitle_${i}.png`, { type: "image/png" });
        fd.append(`subtitle_${i}`, f);
      });
      const res = await fetch(`${API_BASE_URL}/api/transcode/mobile/subtitles`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Export failed: ${res.status}`);
      }
      const j = (await res.json()) as { jobId: string; progressUrl: string };
      const progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
      await new Promise<void>((resolve, reject) => {
        const source = new EventSource(progressUrl);
        source.onmessage = (event) => {
          try {
            const progress = JSON.parse(event.data) as { status: string; progress: number; error?: string };
            if (progress.status === "processing") {
              toast.loading(`Exporting… ${Math.round(progress.progress)}%`, { id: "subtitles-export" });
            }
            if (progress.status === "completed") {
              source.close();
              resolve();
            }
            if (progress.status === "failed") {
              source.close();
              reject(new Error(progress.error ?? "Export failed"));
            }
          } catch {}
        };
        source.onerror = () => {
          source.close();
          reject(new Error("Lost connection to export progress"));
        };
      });
      toast.loading("Downloading file…", { id: "subtitles-export" });
      const downloadUrl = `${API_BASE_URL}/api/transcode/download/${j.jobId}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const mimeType = "video/mp4";
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (
            window as unknown as {
              showSaveFilePicker: (o: {
                suggestedName?: string;
                types?: Array<{ description?: string; accept: Record<string, string[]> }>;
              }) => Promise<FileSystemFileHandle>;
            }
          ).showSaveFilePicker({
            suggestedName: outName,
            types: [{ description: "MP4 video", accept: { [mimeType]: [".mp4"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success("Video saved", { id: "subtitles-export", description: handle.name });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") {
            toast.dismiss("subtitles-export");
            return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Video saved", { id: "subtitles-export", description: outName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      if ((e as DOMException)?.name === "AbortError") toast.dismiss("subtitles-export");
      else toast.error(msg, { id: "subtitles-export" });
    } finally {
      setIsExporting(false);
    }
  }, [file, trimStart, trimEnd, sourceWidth, sourceHeight, layout, subtitles]);

  if (!hasVideo) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Subtitles Editor</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create, edit and style subtitles over your 9:16 mobile preview. Uses
            the same crop layout as Mobile editor.
          </p>
          <div className="mt-6">
            <VideoUploader />
          </div>
        </Card>
        <Card className="p-4 opacity-60">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="aspect-video rounded-lg bg-muted flex items-center justify-center text-xs">
              Video preview
            </div>
            <div className="aspect-9/16 w-40 mx-auto rounded-lg bg-muted flex items-center justify-center text-xs">
              9:16 Preview
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hidden source video for decoding */}
      <video
        ref={videoRef}
        src={mediaUrl ?? undefined}
        className="hidden"
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Subtitles · Mobile 9:16</h2>
          <p className="text-xs text-muted-foreground">
            {effectiveDuration
              ? `${formatTime(effectiveDuration)} · ${subtitles.length} subtitles`
              : "Loading…"}{" "}
            · Shared mobile layout
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new Event("focus"));
            }}
          >
            Refresh layout
          </Button>
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting…" : `Export 9:16 + ${subtitles.length} subtitles`}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_360px] items-start">
        {/* Left: Player + Timeline */}
        <div className="space-y-4">
          {/* Video Player 9:16 */}
          <Card className="overflow-hidden">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                9:16 Preview · {layout.mode === "stacked" ? "Stacked" : "Full"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MobilePreviewShared
                layout={layout}
                videoRef={videoRef}
                safe
                showBg
                overlay={
                  <div className="absolute inset-0">
                    {activeSubtitles.map((sub) => {
                      const isSelected = sub.id === selectedId;
                      return (
                        <div
                          key={sub.id}
                          onClick={() => setSelectedId(sub.id)}
                          className={cn(
                            "absolute pointer-events-auto cursor-pointer select-none max-w-[90%] text-center leading-tight",
                            isSelected &&
                              "ring-1 ring-dashed ring-blue-500 rounded",
                          )}
                          style={{
                            left: `${clamp(sub.position.x, 0, 100)}%`,
                            top: `${clamp(sub.position.y, 0, 100)}%`,
                            transform: "translate(-50%, -50%)",
                          }}
                          aria-label={`Subtitle ${sub.text}`}
                        >
                          <span
                            style={{
                              ...renderSubtitleStyle(sub.style),
                              display: "inline-block",
                            }}
                          >
                            {sub.text || "New subtitle"}
                          </span>
                        </div>
                      );
                    })}
                    {selectedSubtitle && (
                      <div
                        className="absolute size-2 rounded-full bg-primary border border-white shadow pointer-events-none"
                        style={{
                          left: `${clamp(selectedSubtitle.position.x, 0, 100)}%`,
                          top: `${clamp(selectedSubtitle.position.y, 0, 100)}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        aria-hidden
                      />
                    )}
                  </div>
                }
              />

              {/* Player Controls */}
              <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={playFromTrimStart}
                    aria-label="Play from trim start"
                  >
                    ⏮ From Trim Start
                  </Button>
                  <Button
                    size="sm"
                    variant={isPlaying ? "secondary" : "default"}
                    onClick={togglePlayback}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "⏸ Pause" : "▶ Play"}
                  </Button>
                  <Button
                    size="sm"
                    variant={isLooping ? "default" : "outline"}
                    onClick={() => setIsLooping(!isLooping)}
                    aria-label={isLooping ? "Disable loop" : "Enable loop"}
                  >
                    Loop {isLooping ? "On" : "Off"}
                  </Button>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {formatTime(currentTime)} / {formatTime(effectiveDuration)}
                    {" · "}
                    Trim {formatTime(trimStart)} → {formatTime(trimEnd)}
                  </span>
                </div>
                {/* Progress bar: trimStart..trimEnd */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progress (trim range)</span>
                    <span className="tabular-nums">
                      {trimEnd > trimStart
                        ? `${Math.round(clamp(((currentTime - trimStart) / (trimEnd - trimStart)) * 100, 0, 100))}%`
                        : "0%"}
                    </span>
                  </div>
                  <Slider
                    value={[
                      clamp(
                        trimEnd > trimStart
                          ? clamp(
                              ((currentTime - trimStart) /
                                (trimEnd - trimStart)) *
                                100,
                              0,
                              100,
                            )
                          : 0,
                        0,
                        100,
                      ),
                    ]}
                    min={0}
                    max={100}
                    step={0.1}
                    onValueChange={(v) => {
                      const pct = Array.isArray(v)
                        ? (v[0] as number)
                        : (v as number);
                      if (trimEnd <= trimStart) return;
                      const t = percentToTime(pct, trimStart, trimEnd);
                      handleProgressSeek(t);
                    }}
                    aria-label="Seek within trim range"
                  />
                  {/* Absolute timeline progress (full duration) */}
                  <Slider
                    value={[currentTime]}
                    min={0}
                    max={Math.max(effectiveDuration, 0.01)}
                    step={0.01}
                    onValueChange={(v) => {
                      const t = Array.isArray(v)
                        ? (v[0] as number)
                        : (v as number);
                      handleTimelineSeek(t);
                    }}
                    aria-label="Seek video"
                    className="opacity-60"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Editor */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Timeline Editor</CardTitle>
              <p className="text-xs text-muted-foreground">
                Drag subtitle blocks or edges. Click timeline to seek. Trim
                defines editable region.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Trim controls */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Trim</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
                    {formatTime(Math.max(0, trimEnd - trimStart))}
                  </span>
                </div>
                <Slider
                  value={[trimStart, trimEnd]}
                  min={0}
                  max={Math.max(effectiveDuration, 0.01)}
                  step={0.05}
                  onValueChange={(v) => {
                    const arr = Array.isArray(v)
                      ? (v as number[])
                      : [v as number, effectiveDuration];
                    const [ns, ne] = arr as [number, number];
                    if (ne - ns >= MIN_SUBTITLE_DURATION)
                      handleTrimChange(ns, ne);
                  }}
                  aria-label="Trim range"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="trim-start" className="text-[11px]">
                      Trim Start
                    </Label>
                    <Input
                      id="trim-start"
                      type="number"
                      step="0.1"
                      value={trimStart.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) handleTrimChange(v, trimEnd);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="trim-end" className="text-[11px]">
                      Trim End
                    </Label>
                    <Input
                      id="trim-end"
                      type="number"
                      step="0.1"
                      value={trimEnd.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) handleTrimChange(trimStart, v);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Visual timeline with subtitles */}
              <TimelineVisual
                duration={effectiveDuration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                currentTime={currentTime}
                subtitles={subtitles}
                selectedId={selectedId}
                trackCount={trackCount}
                onSeek={handleTimelineSeek}
                onSelect={setSelectedId}
                onUpdateSubtitle={(id, ns, ne) => {
                  // clamp by trim + duration constraints
                  const d = effectiveDuration;
                  let s = clamp(ns, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
                  let e = clamp(ne, s + MIN_SUBTITLE_DURATION, trimEnd);
                  if (s < 0) s = 0;
                  if (e > d) e = d;
                  if (e - s < MIN_SUBTITLE_DURATION) return;
                  setSubtitles((prev) =>
                    prev.map((sub) =>
                      sub.id === id
                        ? { ...sub, startTime: s, endTime: e }
                        : sub,
                    ),
                  );
                }}
                onUpdateTrack={handleMoveSubtitleToTrack}
                onAddTrack={handleAddTrack}
              />
              <div className="text-[11px] text-muted-foreground flex justify-between tabular-nums">
                <span>0:00</span>
                <span className="flex items-center gap-1">
                  <span className="size-2 bg-primary rounded-sm inline-block" />{" "}
                  subtitle
                  <span className="size-2 bg-primary/60 rounded-sm inline-block ml-2" />{" "}
                  selected
                </span>
                <span>{formatTime(effectiveDuration)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Subtitles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={handleAddSubtitle}
                aria-label="Add Subtitle"
                disabled={!hasVideo || effectiveDuration === 0}
              >
                + Add Subtitle at {formatTime(currentTime)}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                New subtitle starts at current time, lasts 1s (clamped to Trim
                End).
              </p>
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {subtitles.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                    No subtitles yet
                  </p>
                )}
                {subtitles
                  .slice()
                  .sort((a, b) => a.startTime - b.startTime)
                  .map((sub) => {
                    const isActive = sub.id === selectedId;
                    const isVisible =
                      currentTime >= sub.startTime && currentTime < sub.endTime;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setSelectedId(sub.id)}
                        className={cn(
                          "w-full text-left rounded-lg border p-2.5 space-y-1 transition-colors",
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:bg-muted/50",
                          isVisible && "ring-1 ring-primary/20",
                        )}
                        aria-label={`Select subtitle ${sub.text}`}
                        aria-selected={isActive}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium line-clamp-2 flex-1">
                            {sub.text || "(empty)"}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] bg-muted border px-1 rounded">
                              T{getSubtitleTrack(sub) + 1}
                            </span>
                            {isVisible && (
                              <span className="text-[10px] bg-primary text-primary-foreground px-1 rounded">
                                ON
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-[11px] tabular-nums text-muted-foreground flex gap-2">
                          <span>{formatTime(sub.startTime)}</span>
                          <span>–</span>
                          <span>{formatTime(sub.endTime)}</span>
                          <span className="ml-auto">
                            {(sub.endTime - sub.startTime).toFixed(2)}s
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Track {getSubtitleTrack(sub) + 1} · Pos {sub.position.x.toFixed(0)},{" "}
                          {sub.position.y.toFixed(0)} ·{" "}
                          {sub.style.fontFamily.split(",")[0]}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          {selectedSubtitle ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Subtitle Settings</CardTitle>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedSubtitle.text || "New subtitle"} ·{" "}
                  {formatTime(selectedSubtitle.startTime)} –{" "}
                  {formatTime(selectedSubtitle.endTime)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Template selector */}
                <div className="space-y-2">
                  <Label htmlFor="template-select">Template</Label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v) handleApplyTemplate(v as string);
                    }}
                  >
                    <SelectTrigger id="template-select" aria-label="Template">
                      <SelectValue
                        placeholder={
                          templates.length
                            ? "Select template to apply"
                            : "No templates saved"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Template name"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      aria-label="New template name"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveTemplate}
                      disabled={!newTemplateName.trim() || !selectedSubtitle}
                      aria-label="Save Current Style as Template"
                    >
                      Save Style as Template
                    </Button>
                  </div>
                  {templates.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Applying a template replaces all 15 style fields
                      (including outline/shadow/background toggles).
                      Text/timing/position are preserved.
                    </p>
                  )}
                </div>

                <div className="h-px bg-border" />

                {/* Text */}
                <div className="space-y-2">
                  <Label htmlFor="sub-text">Text</Label>
                  <Textarea
                    id="sub-text"
                    value={selectedSubtitle.text}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        text: e.target.value,
                      })
                    }
                    placeholder="Subtitle text"
                    rows={2}
                    aria-label="Subtitle text"
                  />
                </div>

                {/* Timing */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="sub-start" className="text-xs">
                      Start (s)
                    </Label>
                    <Input
                      id="sub-start"
                      type="number"
                      step="0.05"
                      value={selectedSubtitle.startTime.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isFinite(v)) return;
                        let ns = clamp(
                          v,
                          trimStart,
                          trimEnd - MIN_SUBTITLE_DURATION,
                        );
                        let ne = selectedSubtitle.endTime;
                        if (ns >= ne)
                          ne = clamp(
                            ns + MIN_SUBTITLE_DURATION,
                            ns + MIN_SUBTITLE_DURATION,
                            trimEnd,
                          );
                        updateSubtitle(selectedSubtitle.id, {
                          startTime: ns,
                          endTime: ne,
                        });
                      }}
                      aria-label="Subtitle start time"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sub-end" className="text-xs">
                      End (s)
                    </Label>
                    <Input
                      id="sub-end"
                      type="number"
                      step="0.05"
                      value={selectedSubtitle.endTime.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isFinite(v)) return;
                        let ne = clamp(
                          v,
                          trimStart + MIN_SUBTITLE_DURATION,
                          trimEnd,
                        );
                        let ns = selectedSubtitle.startTime;
                        if (ne <= ns)
                          ns = clamp(
                            ne - MIN_SUBTITLE_DURATION,
                            trimStart,
                            ne - MIN_SUBTITLE_DURATION,
                          );
                        updateSubtitle(selectedSubtitle.id, {
                          startTime: ns,
                          endTime: ne,
                        });
                      }}
                      aria-label="Subtitle end time"
                    />
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSubtitle}
                  aria-label="Delete Subtitle"
                  className="w-full"
                >
                  Delete Subtitle
                </Button>

                {/* Track */}
                <div className="space-y-2">
                  <Label htmlFor="sub-track">Track</Label>
                  <div className="flex gap-2">
                    <Select
                      value={String(getSubtitleTrack(selectedSubtitle))}
                      onValueChange={(v) => {
                        if (v === null) return;
                        handleMoveSubtitleToTrack(
                          selectedSubtitle.id,
                          parseInt(v as string, 10),
                        );
                      }}
                    >
                      <SelectTrigger id="sub-track" aria-label="Track" className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: trackCount }).map((_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Track {i + 1}
                          </SelectItem>
                        ))}
                        <SelectItem value={String(trackCount)}>
                          + New Track {trackCount + 1}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddTrack}
                      aria-label="Add Track"
                    >
                      + Track
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Move between tracks to avoid overlap. New subtitles at overlapping time auto-create a new track.
                  </p>
                </div>

                <div className="h-px bg-border" />

                {/* Position */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Position</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="pos-x" className="text-[11px]">
                        X (0-100)
                      </Label>
                      <Input
                        id="pos-x"
                        type="number"
                        min={0}
                        max={100}
                        value={selectedSubtitle.position.x}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const x = clamp(v, 0, 100);
                          updateSubtitle(selectedSubtitle.id, {
                            position: { ...selectedSubtitle.position, x },
                          });
                        }}
                        aria-label="Position X"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pos-y" className="text-[11px]">
                        Y (0-100)
                      </Label>
                      <Input
                        id="pos-y"
                        type="number"
                        min={0}
                        max={100}
                        value={selectedSubtitle.position.y}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const y = clamp(v, 0, 100);
                          updateSubtitle(selectedSubtitle.id, {
                            position: { ...selectedSubtitle.position, y },
                          });
                        }}
                        aria-label="Position Y"
                      />
                    </div>
                  </div>
                </div>

                {/* Font Family */}
                <div className="space-y-2">
                  <Label htmlFor="font-family">Font Family</Label>
                  <Select
                    value={selectedSubtitle.style.fontFamily}
                    onValueChange={(v) => {
                      if (v) updateSelectedStyle({ fontFamily: v as string });
                    }}
                  >
                    <SelectTrigger id="font-family" aria-label="Font Family">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_FAMILY_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f.split(",")[0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Font Size */}
                <div className="space-y-2">
                  <Label htmlFor="font-size" className="text-xs">
                    Font Size
                  </Label>
                  <Input
                    id="font-size"
                    type="number"
                    min={1}
                    value={selectedSubtitle.style.fontSize}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isFinite(v) || v <= 0) return;
                      updateSelectedStyle({ fontSize: v });
                    }}
                    aria-label="Font Size"
                  />
                </div>

                {/* Text Color */}
                <div className="space-y-2">
                  <Label className="text-xs">Text Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={
                        selectedSubtitle.style.color.length === 7
                          ? selectedSubtitle.style.color
                          : "#FFFFFF"
                      }
                      onChange={(e) =>
                        updateSelectedStyle({ color: e.target.value })
                      }
                      className="size-9 p-1 cursor-pointer"
                      aria-label="Text Color picker"
                    />
                    <Input
                      value={selectedSubtitle.style.color}
                      onChange={(e) => {
                        const v = e.target.value;
                        // allow typing, only commit if valid or keep typed
                        updateSelectedStyle({ color: v });
                      }}
                      onBlur={(e) => {
                        const v = normalizeHex(e.target.value);
                        if (isValidHexColor(v))
                          updateSelectedStyle({ color: v });
                      }}
                      placeholder="#FFFFFF"
                      aria-label="Text Color HEX"
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Outline */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Outline</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {selectedSubtitle.style.outlineEnabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={selectedSubtitle.style.outlineEnabled}
                        onCheckedChange={(checked) =>
                          updateSelectedStyle({ outlineEnabled: checked })
                        }
                        aria-label="Toggle outline"
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      "grid grid-cols-2 gap-2",
                      !selectedSubtitle.style.outlineEnabled &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="outline-thick" className="text-[11px]">
                        Thickness
                      </Label>
                      <Input
                        id="outline-thick"
                        type="number"
                        min={0}
                        step={0.5}
                        value={selectedSubtitle.style.outlineThickness}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v < 0) return;
                          updateSelectedStyle({ outlineThickness: v });
                        }}
                        aria-label="Outline Thickness"
                        disabled={!selectedSubtitle.style.outlineEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="outline-color" className="text-[11px]">
                        Color
                      </Label>
                      <div className="flex gap-1">
                        <Input
                          id="outline-color"
                          type="color"
                          value={
                            isValidHexColor(selectedSubtitle.style.outlineColor)
                              ? selectedSubtitle.style.outlineColor
                              : "#000000"
                          }
                          onChange={(e) =>
                            updateSelectedStyle({
                              outlineColor: e.target.value,
                            })
                          }
                          className="size-8 p-1"
                          aria-label="Outline Color"
                          disabled={!selectedSubtitle.style.outlineEnabled}
                        />
                        <Input
                          value={selectedSubtitle.style.outlineColor}
                          onChange={(e) =>
                            updateSelectedStyle({
                              outlineColor: e.target.value,
                            })
                          }
                          className="flex-1 text-xs"
                          aria-label="Outline Color HEX"
                          disabled={!selectedSubtitle.style.outlineEnabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shadow */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Shadow</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {selectedSubtitle.style.shadowEnabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={selectedSubtitle.style.shadowEnabled}
                        onCheckedChange={(checked) =>
                          updateSelectedStyle({ shadowEnabled: checked })
                        }
                        aria-label="Toggle shadow"
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      "grid grid-cols-2 gap-2",
                      !selectedSubtitle.style.shadowEnabled &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="shadow-size" className="text-[11px]">
                        Size
                      </Label>
                      <Input
                        id="shadow-size"
                        type="number"
                        min={0}
                        value={selectedSubtitle.style.shadowSize}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v < 0) return;
                          updateSelectedStyle({ shadowSize: v });
                        }}
                        aria-label="Shadow Size"
                        disabled={!selectedSubtitle.style.shadowEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shadow-color" className="text-[11px]">
                        Color
                      </Label>
                      <div className="flex gap-1">
                        <Input
                          id="shadow-color"
                          type="color"
                          value={
                            isValidHexColor(
                              selectedSubtitle.style.shadowColor,
                            ) && selectedSubtitle.style.shadowColor.length === 7
                              ? selectedSubtitle.style.shadowColor
                              : "#000000"
                          }
                          onChange={(e) =>
                            updateSelectedStyle({ shadowColor: e.target.value })
                          }
                          className="size-8 p-1"
                          aria-label="Shadow Color"
                          disabled={!selectedSubtitle.style.shadowEnabled}
                        />
                        <Input
                          value={selectedSubtitle.style.shadowColor}
                          onChange={(e) =>
                            updateSelectedStyle({ shadowColor: e.target.value })
                          }
                          className="flex-1 text-xs"
                          aria-label="Shadow Color HEX"
                          disabled={!selectedSubtitle.style.shadowEnabled}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shadow-x" className="text-[11px]">
                        Offset X
                      </Label>
                      <Input
                        id="shadow-x"
                        type="number"
                        value={selectedSubtitle.style.shadowOffsetX}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateSelectedStyle({ shadowOffsetX: v });
                        }}
                        aria-label="Shadow Offset X"
                        disabled={!selectedSubtitle.style.shadowEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shadow-y" className="text-[11px]">
                        Offset Y
                      </Label>
                      <Input
                        id="shadow-y"
                        type="number"
                        value={selectedSubtitle.style.shadowOffsetY}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateSelectedStyle({ shadowOffsetY: v });
                        }}
                        aria-label="Shadow Offset Y"
                        disabled={!selectedSubtitle.style.shadowEnabled}
                      />
                    </div>
                  </div>
                </div>

                {/* Background */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Background</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {selectedSubtitle.style.backgroundEnabled
                          ? "On"
                          : "Off"}
                      </span>
                      <Switch
                        checked={selectedSubtitle.style.backgroundEnabled}
                        onCheckedChange={(checked) =>
                          updateSelectedStyle({ backgroundEnabled: checked })
                        }
                        aria-label="Toggle background"
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      !selectedSubtitle.style.backgroundEnabled &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="bg-color" className="text-[11px]">
                          Color
                        </Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            id="bg-color"
                            type="color"
                            value={(() => {
                              const c = selectedSubtitle.style.backgroundColor;
                              if (
                                c.startsWith("#") &&
                                (c.length === 7 || c.length === 4)
                              )
                                return c.length === 4
                                  ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
                                  : c;
                              return "#000000";
                            })()}
                            onChange={(e) => {
                              updateSelectedStyle({
                                backgroundColor: e.target.value,
                              });
                            }}
                            className="size-8 p-1"
                            aria-label="Background Color"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                          <Input
                            value={selectedSubtitle.style.backgroundColor}
                            onChange={(e) =>
                              updateSelectedStyle({
                                backgroundColor: e.target.value,
                              })
                            }
                            placeholder="rgba(0,0,0,0.5) or #000000"
                            className="flex-1 text-xs"
                            aria-label="Background Color value"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="bg-pad" className="text-[11px]">
                            Padding
                          </Label>
                          <Input
                            id="bg-pad"
                            type="number"
                            min={0}
                            value={selectedSubtitle.style.backgroundPadding}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isFinite(v) || v < 0) return;
                              updateSelectedStyle({ backgroundPadding: v });
                            }}
                            aria-label="Background Padding"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="bg-radius" className="text-[11px]">
                            Corner Radius
                          </Label>
                          <Input
                            id="bg-radius"
                            type="number"
                            min={0}
                            value={
                              selectedSubtitle.style.backgroundBorderRadius
                            }
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isFinite(v) || v < 0) return;
                              updateSelectedStyle({
                                backgroundBorderRadius: v,
                              });
                            }}
                            aria-label="Background Corner Radius"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-xs text-muted-foreground">
                Select a subtitle to edit its style, position and timing.
                Changes appear live in the preview.
              </p>
            </Card>
          )}
          <Card className="p-3">
            <div className="text-xs font-medium">
              Templates stored: {templates.length}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Key: {SUBTITLE_TEMPLATES_STORAGE_KEY} · Invalid localStorage data
              is ignored.
            </p>
            {templates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {templates.map((t) => (
                  <span
                    key={t.id}
                    className="text-[10px] bg-muted px-1.5 py-0.5 rounded border"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineVisual({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  subtitles,
  selectedId,
  trackCount,
  onSeek,
  onSelect,
  onUpdateSubtitle,
  onUpdateTrack,
  onAddTrack,
}: {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  subtitles: Subtitle[];
  selectedId: string | null;
  trackCount: number;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onUpdateSubtitle: (id: string, start: number, end: number) => void;
  onUpdateTrack: (id: string, newTrack: number) => void;
  onAddTrack: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ROW_H = 32;
  const HEADER_H = 22;
  const [drag, setDrag] = useState<null | {
    id: string;
    mode: "move" | "left" | "right";
    startX: number;
    startY: number;
    origStart: number;
    origEnd: number;
    origTrack: number;
  }>(null);

  const toTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      return pct * duration;
    },
    [duration],
  );

  const onPointerDownTrack = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.dataset.role === "track" ||
      target.dataset.role === "track-bg" ||
      target.dataset.role === "track-row"
    ) {
      const t = toTime(e.clientX);
      onSeek(t);
    }
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const deltaTime = toTime(e.clientX) - toTime(drag.startX);
      if (drag.mode === "move") {
        const dur = drag.origEnd - drag.origStart;
        let ns = drag.origStart + deltaTime;
        let ne = drag.origEnd + deltaTime;
        if (ns < trimStart) {
          ns = trimStart;
          ne = ns + dur;
        }
        if (ne > trimEnd) {
          ne = trimEnd;
          ns = ne - dur;
        }
        ns = clamp(ns, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
        ne = clamp(ne, ns + MIN_SUBTITLE_DURATION, trimEnd);
        onUpdateSubtitle(drag.id, ns, ne);
        // vertical track move
        const deltaY = e.clientY - drag.startY;
        const trackDelta = Math.round(deltaY / ROW_H);
        let newTrack = clamp(drag.origTrack + trackDelta, 0, 99);
        // allow creating one new track beyond current count if dragged below last lane
        // cap to trackCount (creates new) if beyond
        if (newTrack > trackCount) newTrack = trackCount;
        if (newTrack !== drag.origTrack) {
          // we update track directly; parent will expand trackCount via onUpdateTrack
          onUpdateTrack(drag.id, newTrack);
          // update drag origTrack to newTrack to avoid repeated jumps? keep origTrack stable and rely on delta, so not updating drag state.
          // To avoid jitter, we could keep origTrack fixed and compute from delta; that's already stable.
        }
      } else if (drag.mode === "left") {
        let ns = clamp(
          drag.origStart + deltaTime,
          trimStart,
          drag.origEnd - MIN_SUBTITLE_DURATION,
        );
        onUpdateSubtitle(drag.id, ns, drag.origEnd);
      } else if (drag.mode === "right") {
        let ne = clamp(
          drag.origEnd + deltaTime,
          drag.origStart + MIN_SUBTITLE_DURATION,
          trimEnd,
        );
        onUpdateSubtitle(drag.id, drag.origStart, ne);
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, toTime, trimStart, trimEnd, onUpdateSubtitle, onUpdateTrack, trackCount]);

  const playheadPct =
    duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  const trimLeftPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimWidthPct =
    duration > 0 ? ((trimEnd - trimStart) / duration) * 100 : 100;
  const totalHeight = HEADER_H + trackCount * ROW_H;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          Tracks · {trackCount} {trackCount === 1 ? "lane" : "lanes"}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            Drag vertically to move between tracks
          </span>
          <Button size="sm" variant="outline" onClick={onAddTrack} aria-label="Add Track">
            + Add Track
          </Button>
        </div>
      </div>
      <div
        ref={trackRef}
        data-role="track"
        onPointerDown={onPointerDownTrack}
        className="relative rounded-lg border bg-muted/30 overflow-hidden select-none"
        style={{ height: totalHeight }}
        aria-label="Subtitle timeline with tracks"
      >
        {/* trim background spans all tracks */}
        <div
          className="absolute bg-primary/10 border-x border-primary/20"
          style={{
            left: `${trimLeftPct}%`,
            width: `${trimWidthPct}%`,
            top: HEADER_H,
            bottom: 0,
          }}
          data-role="track-bg"
        />
        {/* header ticks */}
        <div
          className="absolute left-0 right-0 flex justify-between px-2 pt-1 pointer-events-none border-b border-border/40 bg-muted/20"
          style={{ height: HEADER_H, top: 0 }}
        >
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {formatTime(trimStart)}
          </span>
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {formatTime(trimEnd)}
          </span>
        </div>
        {/* track rows background + labels */}
        {Array.from({ length: trackCount }).map((_, ti) => (
          <div
            key={ti}
            data-role="track-row"
            data-track={ti}
            className={cn(
              "absolute left-0 right-0 border-b border-border/30 flex items-center",
              ti % 2 === 0 ? "bg-card/40" : "bg-muted/10",
            )}
            style={{ top: HEADER_H + ti * ROW_H, height: ROW_H }}
          >
            <span className="absolute left-1.5 text-[9px] font-medium text-muted-foreground tabular-nums w-10 select-none">
              Track {ti + 1}
            </span>
            <div className="absolute left-12 right-1 top-0 bottom-0 border-l border-dashed border-border/20" />
          </div>
        ))}
        {/* subtitle blocks per track */}
        {subtitles.map((sub) => {
          const left = duration > 0 ? (sub.startTime / duration) * 100 : 0;
          const width =
            duration > 0
              ? ((sub.endTime - sub.startTime) / duration) * 100
              : 0;
          const isSelected = sub.id === selectedId;
          const isActive =
            currentTime >= sub.startTime && currentTime < sub.endTime;
          const trackIdx = getSubtitleTrack(sub);
          const clampedTrack = clamp(trackIdx, 0, Math.max(trackCount - 1, 0));
          const top = HEADER_H + clampedTrack * ROW_H + 3;
          return (
            <div
              key={sub.id}
              className={cn(
                "absolute rounded border flex items-center overflow-hidden group",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary z-10 shadow"
                  : "bg-card border-border hover:border-primary/40",
                isActive && !isSelected && "ring-1 ring-primary/30",
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.8)}%`,
                top,
                height: ROW_H - 6,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(sub.id);
              }}
              onClick={() => onSelect(sub.id)}
              role="button"
              aria-label={`Subtitle ${sub.text} track ${clampedTrack + 1} ${formatTime(sub.startTime)} to ${formatTime(sub.endTime)}`}
              aria-selected={isSelected}
              title={`Track ${clampedTrack + 1} · drag vertically to move`}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-primary/30 flex items-center justify-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "left",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
                aria-label="Drag to change start time"
              >
                <span className="w-0.5 h-4 bg-white/60 rounded" />
              </div>
              <div
                className="flex-1 px-3 text-[10px] truncate cursor-grab active:cursor-grabbing select-none flex items-center gap-1"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
              >
                <span className="text-[8px] opacity-70">↕</span>
                <span className="truncate">{sub.text || "…"}</span>
              </div>
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-primary/30 flex items-center justify-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "right",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
                aria-label="Drag to change end time"
              >
                <span className="w-0.5 h-4 bg-white/60 rounded" />
              </div>
            </div>
          );
        })}
        {/* playhead spans full height */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
          aria-hidden
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-2.5 bg-primary rotate-45 border border-white shadow" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] bg-primary text-primary-foreground px-1 rounded translate-y-0 tabular-nums">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>Trim Start {formatTime(trimStart)}</span>
        <span>Playhead {formatTime(currentTime)}</span>
        <span>Trim End {formatTime(trimEnd)}</span>
      </div>
    </div>
  );
}
