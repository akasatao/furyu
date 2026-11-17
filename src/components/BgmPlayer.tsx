"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "furyu_bgm_muted";
const VOLUME_KEY = "furyu_bgm_volume";
const BGM_SRC = "/audio/bgm.wav";
const DEFAULT_VOLUME = 0.28;

function readMutedPreference(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(MUTE_KEY);
  if (raw == null) return true;
  return raw === "1";
}

function readVolumePreference(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (raw == null) return DEFAULT_VOLUME;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
      className="block"
    >
      <path
        d="M4 9.5h3.2L12 5.5v13l-4.8-4H4V9.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {!muted && (
        <>
          <path
            d="M15.2 9.2a3.2 3.2 0 0 1 0 5.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M17.4 7a5.6 5.6 0 0 1 0 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      )}
      {muted && (
        <path
          d="M4.5 4.5l15 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** ループBGM（Web Audio で終端→先端を隙間なく接続） */
export function BgmPlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMuted(readMutedPreference());
    setVolume(readVolumePreference());
  }, []);

  const applyGain = useCallback((nextMuted: boolean, nextVolume: number) => {
    const gain = gainRef.current;
    const ctx = ctxRef.current;
    if (!gain) return;
    const value = nextMuted ? 0 : nextVolume;
    gain.gain.setValueAtTime(value, ctx?.currentTime ?? 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    const initialMuted = readMutedPreference();
    const initialVolume = readVolumePreference();
    gain.gain.value = initialMuted ? 0 : initialVolume;
    gain.connect(ctx.destination);
    ctxRef.current = ctx;
    gainRef.current = gain;

    const startLoop = (buffer: AudioBuffer) => {
      if (cancelled || sourceRef.current) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      source.connect(gain);
      source.start(0);
      sourceRef.current = source;
      setPlaying(true);
    };

    const unlock = () => {
      void ctx.resume().then(() => {
        if (cancelled) return;
        if (bufferRef.current) startLoop(bufferRef.current);
      });
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    void fetch(BGM_SRC)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data.slice(0)))
      .then((buffer) => {
        if (cancelled) return;
        bufferRef.current = buffer;
        if (ctx.state === "running") {
          startLoop(buffer);
        } else {
          window.addEventListener("pointerdown", unlock);
          window.addEventListener("keydown", unlock);
          void ctx.resume().then(() => {
            if (!cancelled && bufferRef.current && !sourceRef.current) {
              startLoop(bufferRef.current);
            }
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
      }
      try {
        sourceRef.current?.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
      void ctx.close();
      ctxRef.current = null;
      gainRef.current = null;
      bufferRef.current = null;
    };
  }, []);

  useEffect(() => {
    applyGain(muted, volume);
    if (!muted && ctxRef.current?.state === "suspended") {
      void ctxRef.current.resume();
    }
  }, [muted, volume, applyGain]);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      const ctx = ctxRef.current;
      if (!next && ctx?.state === "suspended") {
        void ctx.resume();
      }
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback(
    (next: number) => {
      const clamped = Math.min(1, Math.max(0, next));
      setVolume(clamped);
      window.localStorage.setItem(VOLUME_KEY, String(clamped));
      if (clamped > 0 && muted) {
        setMuted(false);
        window.localStorage.setItem(MUTE_KEY, "0");
      }
      if (clamped === 0) {
        setMuted(true);
        window.localStorage.setItem(MUTE_KEY, "1");
      }
      const ctx = ctxRef.current;
      if (clamped > 0 && ctx?.state === "suspended") {
        void ctx.resume();
      }
    },
    [muted],
  );

  const volumeFromPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.height <= 0) return;
      // 上が大きい・下が小さい
      const next = (rect.bottom - clientY) / rect.height;
      handleVolumeChange(next);
    },
    [handleVolumeChange],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      volumeFromPointer(e.clientY);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [volumeFromPointer]);

  const clearHideTimer = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showPanel = () => {
    clearHideTimer();
    setOpen(true);
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      hideTimerRef.current = null;
    }, 180);
  };

  const showMuted = muted || volume === 0 || !playing;
  const displayVolume = muted ? 0 : volume;

  return (
    <div
      className="fixed bottom-3 left-3 z-[60] md:bottom-4 md:left-4"
      onMouseEnter={showPanel}
      onMouseLeave={scheduleHide}
      onFocus={showPanel}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          scheduleHide();
        }
      }}
    >
      <div className="relative flex flex-col items-center">
        <div
          className={`absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col items-center border-2 border-black bg-white px-3 py-3 transition-opacity ${
            open
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="BGM音量"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayVolume * 100)}
            className="relative h-24 w-3 cursor-pointer border-2 border-black bg-[#d4d4d4]"
            onPointerDown={(e) => {
              e.preventDefault();
              draggingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              volumeFromPointer(e.clientY);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                handleVolumeChange(displayVolume + 0.05);
              } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                handleVolumeChange(displayVolume - 0.05);
              }
            }}
          >
            <div
              className="absolute inset-x-0 bottom-0 bg-[#111111]"
              style={{ height: `${displayVolume * 100}%` }}
            />
            <div
              className="pointer-events-none absolute left-1/2 h-5 w-5 -translate-x-[calc(50%+1px)] border-2 border-black bg-white"
              style={{
                bottom: `calc(${displayVolume * 100}% - 0.625rem)`,
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMuted}
          aria-pressed={showMuted}
          aria-label={showMuted ? "BGMをオン" : "BGMをオフ"}
          className="flex h-10 w-10 items-center justify-center border-2 border-black bg-white text-black"
        >
          <SpeakerIcon muted={showMuted} />
        </button>
      </div>
    </div>
  );
}
