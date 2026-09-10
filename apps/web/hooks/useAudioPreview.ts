"use client";

import { useEffect, useRef } from "react";
import { apiClient } from "@/lib/api-client";
import type { AudioTrackState } from "@/store/audioSlice";

type AudioEntry = {
  trackIndex: number;
  element: HTMLAudioElement;
  gain: GainNode;
  objectUrl: string;
  lastGain: number;
};

function isMutedAt(track: AudioTrackState, time: number) {
  return track.muteSegments.some(
    (segment) => time >= segment.start && time <= segment.end,
  );
}

export function useAudioPreview({
  file,
  mediaUrl,
  videoRef,
  tracks,
  volume,
  muted,
}: {
  file: File | null;
  mediaUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  tracks: AudioTrackState[];
  volume: number;
  muted: boolean;
}) {
  const tracksRef = useRef(tracks);
  const tracksByIndexRef = useRef(
    new Map(tracks.map((track) => [track.trackIndex, track])),
  );
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const entriesRef = useRef<AudioEntry[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  tracksRef.current = tracks;
  tracksByIndexRef.current = new Map(
    tracks.map((track) => [track.trackIndex, track]),
  );
  volumeRef.current = volume;
  mutedRef.current = muted;

  const topologyKey = `${mediaUrl ?? ""}|${tracks
    .filter((track) => track.enabled)
    .map((track) => track.trackIndex)
    .join(",")}`;

  useEffect(() => {
    let disposed = false;
    const video = videoRef.current;
    if (!video || !file || !mediaUrl) return;

    const activeTracks = tracksRef.current.filter((track) => track.enabled);
    video.muted = tracksRef.current.length > 0;
    if (activeTracks.length === 0)
      return () => {
        video.muted = true;
      };

    const context = new AudioContext();
    contextRef.current = context;
    const entries: AudioEntry[] = [];
    entriesRef.current = entries;
    let animationFrame = 0;
    let lastCorrectionAt = 0;
    let lastVideoTime = video.currentTime;
    let seeking = false;

    const syncPosition = (force = false) => {
      const time = video.currentTime;
      for (const entry of entries) {
        entry.element.playbackRate = video.playbackRate;
        if (force || Math.abs(entry.element.currentTime - time) > 0.045) {
          try {
            entry.element.currentTime = time;
          } catch {}
        }
      }
      lastCorrectionAt = performance.now();
    };
    const updateGains = (schedule = true) => {
      const time = video.currentTime;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const playbackVolume = mutedRef.current ? 0 : volumeRef.current;
      for (const entry of entries) {
        const track = tracksByIndexRef.current.get(entry.trackIndex);
        if (!track) continue;
        let multiplier = playbackVolume * 10 ** (track.gainDb / 20);
        if (isMutedAt(track, time)) multiplier = 0;
        if (track.fadeInSeconds > 0)
          multiplier *= Math.min(1, time / track.fadeInSeconds);
        if (track.fadeOutSeconds > 0 && duration > 0)
          multiplier *= Math.min(
            1,
            Math.max(0, (duration - time) / track.fadeOutSeconds),
          );
        const nextGain = Math.max(0, multiplier);
        if (Math.abs(entry.lastGain - nextGain) > 0.005) {
          entry.gain.gain.setTargetAtTime(nextGain, context.currentTime, 0.015);
          entry.lastGain = nextGain;
        }
      }
      if (schedule && !video.paused) {
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(() => {
          const now = performance.now();
          const looped = time + 0.2 < lastVideoTime;
          lastVideoTime = time;
          if (!seeking && (looped || now - lastCorrectionAt > 80))
            syncPosition(looped);
          updateGains();
        });
      }
    };
    const playAudio = async () => {
      await context.resume();
      syncPosition(true);
      await Promise.all(
        entries.map((entry) => entry.element.play().catch(() => undefined)),
      );
      updateGains();
    };
    const pauseAudio = () => {
      for (const entry of entries) entry.element.pause();
      cancelAnimationFrame(animationFrame);
      updateGains();
    };
    const onSeeking = () => {
      seeking = true;
      cancelAnimationFrame(animationFrame);
      for (const entry of entries) entry.element.pause();
    };
    const onSeeked = () => {
      seeking = false;
      syncPosition(true);
      updateGains(false);
      if (!video.paused) void playAudio();
    };
    const onTimeUpdate = () => {
      if (seeking) return;
      const looped = video.currentTime + 0.2 < lastVideoTime;
      lastVideoTime = video.currentTime;
      if (looped) syncPosition(true);
      updateGains();
    };
    const onEnded = () => {
      if (!video.loop) return;
      syncPosition(true);
      void playAudio();
    };

    video.addEventListener("play", playAudio);
    video.addEventListener("pause", pauseAudio);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    void Promise.all(
      activeTracks.map(async (track) => {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(
          apiClient.url(
            `/api/audio/extract?format=wav&track=${track.trackIndex}`,
          ),
          { method: "POST", body: form },
        );
        if (!response.ok || disposed) return;
        const objectUrl = URL.createObjectURL(await response.blob());
        if (disposed) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const element = new Audio(objectUrl);
        element.preload = "auto";
        const gain = context.createGain();
        context
          .createMediaElementSource(element)
          .connect(gain)
          .connect(context.destination);
        entries.push({
          trackIndex: track.trackIndex,
          element,
          gain,
          objectUrl,
          lastGain: -1,
        });
        if (!video.paused) void playAudio();
      }),
    );

    return () => {
      disposed = true;
      video.removeEventListener("play", playAudio);
      video.removeEventListener("pause", pauseAudio);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      cancelAnimationFrame(animationFrame);
      for (const entry of entries) {
        entry.element.pause();
        entry.element.src = "";
        URL.revokeObjectURL(entry.objectUrl);
      }
      entriesRef.current = [];
      void context.close();
      contextRef.current = null;
    };
  }, [file, mediaUrl, topologyKey, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    const context = contextRef.current;
    if (!video || !context) return;
    const time = video.currentTime;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    for (const entry of entriesRef.current) {
      const track = tracksByIndexRef.current.get(entry.trackIndex);
      if (!track) continue;
      let multiplier = muted ? 0 : volume * 10 ** (track.gainDb / 20);
      if (isMutedAt(track, time)) multiplier = 0;
      if (track.fadeInSeconds > 0)
        multiplier *= Math.min(1, time / track.fadeInSeconds);
      if (track.fadeOutSeconds > 0 && duration > 0)
        multiplier *= Math.min(
          1,
          Math.max(0, (duration - time) / track.fadeOutSeconds),
        );
      entry.gain.gain.setTargetAtTime(
        Math.max(0, multiplier),
        context.currentTime,
        0.015,
      );
    }
    if (tracks.length > 0) video.muted = true;
  }, [muted, tracks, videoRef, volume]);
}
