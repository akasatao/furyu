"use client";

/** BGM・効果音共通のミュート／音量（音量バーと同じ） */
export const AUDIO_MUTE_KEY = "furyu_bgm_muted";
export const AUDIO_VOLUME_KEY = "furyu_bgm_volume";
export const AUDIO_DEFAULT_VOLUME = 0.28;

export function readAudioMuted(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(AUDIO_MUTE_KEY);
  if (raw == null) return true;
  return raw === "1";
}

export function readAudioVolume(): number {
  if (typeof window === "undefined") return AUDIO_DEFAULT_VOLUME;
  const raw = window.localStorage.getItem(AUDIO_VOLUME_KEY);
  if (raw == null) return AUDIO_DEFAULT_VOLUME;
  const n = Number(raw);
  if (!Number.isFinite(n)) return AUDIO_DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

/** ミュート中は 0。それ以外は音量バーの値 */
export function effectiveAudioVolume(): number {
  if (readAudioMuted()) return 0;
  return readAudioVolume();
}
