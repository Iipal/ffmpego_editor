"use client";

import { memo, useEffect, useRef, useState } from "react";
import { NOOP } from "./mobile-helpers";
import type { PlaybackTimelineProps } from "./types";

export const PlaybackTimeline = memo(function PlaybackTimeline({
  videoRef,
  duration,
  trimRange,
  isLoopTrim,
  onTimeUpdate,
}: PlaybackTimelineProps) {
  const [localTime, setLocalTime] = useState(0);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);

  const trimRef = useRef(trimRange);
  const loopRef = useRef(isLoopTrim);
  const onTimeRef = useRef(onTimeUpdate);
  useEffect(() => {
    trimRef.current = trimRange;
    loopRef.current = isLoopTrim;
    onTimeRef.current = onTimeUpdate;
  }, [trimRange, isLoopTrim, onTimeUpdate]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlayingLocal(true);
    const onPause = () => setIsPlayingLocal(false);
    const onEnded = () => {
      if (loopRef.current && trimRef.current[1] > trimRef.current[0]) {
        v.currentTime = trimRef.current[0];
        v.play().catch(NOOP);
      } else {
        setIsPlayingLocal(false);
      }
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [videoRef]);

  useEffect(() => {
    if (!isPlayingLocal) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const t = v.currentTime;
        const [s, e] = trimRef.current;
        if (loopRef.current && e > s && t >= e - 0.02) {
          v.currentTime = s;
        }
        setLocalTime(v.currentTime);
        onTimeRef.current?.(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingLocal, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime;
      const [s, e] = trimRef.current;
      if (loopRef.current && e > s) {
        if (t >= e - 0.05 || t < s - 0.01) {
          v.currentTime = s;
          setLocalTime(s);
          return;
        }
      }
      setLocalTime(t);
      onTimeRef.current?.(t);
    };
    v.addEventListener("timeupdate", onTime, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, [videoRef]);

  void duration;
  return {
    localTime,
    isPlayingLocal,
    setIsPlayingLocal,
  } as unknown as React.ReactElement;
});

export function usePlaybackSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  duration: number,
  trimRange: [number, number],
  isLoopTrim: boolean,
) {
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const timeRef = useRef(0);
  const [, forceTick] = useState(0);
  const trimRef = useRef(trimRange);
  const loopRef = useRef(isLoopTrim);
  useEffect(() => {
    trimRef.current = trimRange;
    loopRef.current = isLoopTrim;
  }, [trimRange, isLoopTrim]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlayingLocal(true);
    const onPause = () => setIsPlayingLocal(false);
    const onEnded = () => {
      if (loopRef.current && trimRef.current[1] > trimRef.current[0]) {
        v.currentTime = trimRef.current[0];
        v.play().catch(NOOP);
      } else setIsPlayingLocal(false);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let running = false;
    let lastTick = 0;
    const loop = () => {
      if (!running) return;
      const cur = v.currentTime;
      const [s, e] = trimRef.current;
      if (loopRef.current && e > s && cur >= e - 0.02) v.currentTime = s;
      timeRef.current = v.currentTime;
      const now = performance.now();
      if (now - lastTick > 100) {
        lastTick = now;
        forceTick((t) => (t + 1) % 1000000);
      }
      if (!v.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay2 = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const onPause2 = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    v.addEventListener("play", onPlay2);
    v.addEventListener("pause", onPause2);
    if (!v.paused) onPlay2();
    const onTime = () => {
      timeRef.current = v.currentTime;
      forceTick((t) => (t + 1) % 1000000);
    };
    v.addEventListener("timeupdate", onTime, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("seeked", onTime);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay2);
      v.removeEventListener("pause", onPause2);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, [videoRef, duration]);

  return {
    isPlayingLocal,
    setIsPlayingLocal,
    currentTime: timeRef.current,
    timeRef,
  };
}
