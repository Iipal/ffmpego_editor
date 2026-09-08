import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

export interface MuteSegment {
  start: number;
  end: number;
}

export interface WaveformData {
  duration: number;
  sampleRate: number;
  peaks: number[];
  rms: number[];
}

export interface LoudnessData {
  inputIntegratedLufs: number;
  inputTruePeak: number;
  inputLra: number;
  targetIntegratedLufs: number;
}

export interface AudioTrack {
  trackIndex: number;
  streamIndex: number;
  codec: string | null;
  codecLongName: string | null;
  language: string | null;
  title: string | null;
  channels: number;
  sampleRate: number;
}

export interface AudioTrackState extends AudioTrack {
  enabled: boolean;
  gainDb: number;
  loudnormEnabled: boolean;
  loudnormTargetLufs: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  muteSegments: MuteSegment[];
  waveform: WaveformData | null;
  loudness: LoudnessData | null;
}

export type AudioTrackRenderSettings = Pick<
  AudioTrackState,
  | "trackIndex"
  | "enabled"
  | "gainDb"
  | "loudnormEnabled"
  | "loudnormTargetLufs"
  | "fadeInSeconds"
  | "fadeOutSeconds"
  | "muteSegments"
>;

export function getAudioRenderSettings(
  tracks: AudioTrackState[],
): AudioTrackRenderSettings[] {
  return tracks.map(
    ({
      trackIndex,
      enabled,
      gainDb,
      loudnormEnabled,
      loudnormTargetLufs,
      fadeInSeconds,
      fadeOutSeconds,
      muteSegments,
    }) => ({
      trackIndex,
      enabled,
      gainDb,
      loudnormEnabled,
      loudnormTargetLufs,
      fadeInSeconds,
      fadeOutSeconds,
      muteSegments,
    }),
  );
}

export interface AudioSlice {
  tracks: AudioTrackState[];
}

export const initialAudioSlice: AudioSlice = {
  tracks: [],
};

export const audioStore = createStore<AudioSlice>(initialAudioSlice);

export function useAudioStore() {
  return useSelector(audioStore);
}

export function setAudioState(updater: (previous: AudioSlice) => AudioSlice) {
  audioStore.setState(updater);
}
