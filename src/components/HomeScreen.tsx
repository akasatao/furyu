"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TanzakuCard } from "@/components/TanzakuCard";
import {
  MODE_LABEL,
  modeAllowsSolo,
  PLAYER_COUNT_RANGE,
  THEME_MAX_LENGTH,
  THEME_PROMPTS,
} from "@/lib/constants";
import {
  historyEntryToPoem,
  type PoemHistoryEntry,
} from "@/lib/online/poem-history";
import { normalizeRoomCode, shirazuOwnerLabel, toKanji } from "@/lib/utils";
import type { VerseMode } from "@/types/game";

export type HomeStep = "mode" | "theme" | "setup" | "history";

interface HomeScreenProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  poemHistory?: PoemHistoryEntry[];
  myId?: string;
  mode: VerseMode;
  theme?: string;
  onThemeChange?: (value: string) => void;
  playerCount: number;
  onModeChange: (mode: VerseMode) => void;
  onPlayerCountChange: (count: number) => void;
  onCreateRoom: (
    count: number,
    verseMode?: VerseMode,
    theme?: string,
  ) => void | Promise<void>;
  onJoinRoom: (code: string) => void;
  /** ロビーから戻ったときの初期画面 */
  initialStep?: HomeStep;
  busy?: boolean;
}

const MODES: VerseMode[] = ["haiku", "tanka", "shirazu"];

/** 白へ溶ける／白から現れる */
const FADE_MS = 420;
const WHITE_HOLD_MS = 120;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HomeScreen({
  nickname,
  onNicknameChange,
  poemHistory = [],
  myId,
  mode,
  theme = "",
  onThemeChange,
  playerCount,
  onModeChange,
  onPlayerCountChange,
  onCreateRoom,
  onJoinRoom,
  initialStep = "mode",
  busy = false,
}: HomeScreenProps) {
  const [step, setStep] = useState<HomeStep>(initialStep);
  const [veil, setVeil] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  /** 日本語IME変換中は正規化しない（英数入力の二重化・崩れ防止） */
  const [joinComposing, setJoinComposing] = useState(false);
  const [themeDraft, setThemeDraft] = useState(theme);
  const [pressedChoice, setPressedChoice] = useState<
    "solo" | "multi" | "join" | VerseMode | null
  >(null);
  /** キーボード表示中はコンパクト＋スクロールに切替 */
  const [inputFocused, setInputFocused] = useState(false);
  const lockedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const themeInputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const viewportHeightRef = useRef(0);

  const isLocked = busy || transitioning;

  const endInputMode = useCallback(() => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setInputFocused(false);
    const active = document.activeElement;
    if (
      active === joinInputRef.current ||
      active === nicknameInputRef.current
    ) {
      (active as HTMLElement).blur();
    }
    rootRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  const handleInputFocus = (scrollJoin = false) => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setInputFocused(true);
    const vv = window.visualViewport;
    if (vv) viewportHeightRef.current = vv.height;
    if (!scrollJoin) return;
    window.requestAnimationFrame(() => {
      joinInputRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  };

  const handleInputBlur = () => {
    // 雅号↔ルームコード切替では入力モードを維持
    blurTimerRef.current = window.setTimeout(() => {
      const active = document.activeElement;
      const stillEditing =
        active === joinInputRef.current ||
        active === nicknameInputRef.current;
      if (!stillEditing) endInputMode();
    }, 120);
  };

  /** キーボードが閉じたらフォーカス解除＆定位置へ */
  useEffect(() => {
    if (!inputFocused) return;
    const vv = window.visualViewport;
    if (!vv) return;

    viewportHeightRef.current = vv.height;

    const onViewportResize = () => {
      const prev = viewportHeightRef.current;
      const next = vv.height;
      viewportHeightRef.current = next;
      // 大きく高くなった＝キーボード閉鎖
      if (next - prev > 80) {
        endInputMode();
      }
    };

    vv.addEventListener("resize", onViewportResize);
    return () => vv.removeEventListener("resize", onViewportResize);
  }, [inputFocused, endInputMode]);

  /** 入力中は横スクロール／横パンを抑止 */
  useEffect(() => {
    if (!inputFocused) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflowX;
    const prevBody = body.style.overflowX;
    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";
    return () => {
      html.style.overflowX = prevHtml;
      body.style.overflowX = prevBody;
    };
  }, [inputFocused]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const goToStep = async (next: HomeStep) => {
    if (next === step || lockedRef.current) return;
    lockedRef.current = true;
    flushSync(() => setTransitioning(true));

    const reduce = prefersReducedMotion();

    try {
      if (!reduce) {
        flushSync(() => setVeil(1));
        await sleep(FADE_MS);
      }

      flushSync(() => setStep(next));

      if (!reduce) {
        await sleep(WHITE_HOLD_MS);
        flushSync(() => setVeil(0));
        await sleep(FADE_MS);
      }
    } finally {
      lockedRef.current = false;
      setVeil(0);
      setTransitioning(false);
    }
  };

  const handleSelectMode = (next: VerseMode) => {
    if (isLocked) return;
    onModeChange(next);
    setThemeDraft("");
    onThemeChange?.("");
    void goToStep("theme");
  };

  const handleBackToMode = () => {
    setPressedChoice(null);
    setThemeDraft("");
    onThemeChange?.("");
    void goToStep("mode");
  };

  const pickRandomTheme = () => {
    if (THEME_PROMPTS.length === 0) return;
    let next = THEME_PROMPTS[Math.floor(Math.random() * THEME_PROMPTS.length)];
    if (THEME_PROMPTS.length > 1) {
      let guard = 0;
      while (next === themeDraft && guard < 8) {
        next = THEME_PROMPTS[Math.floor(Math.random() * THEME_PROMPTS.length)];
        guard += 1;
      }
    }
    setThemeDraft(next);
  };

  const handleConfirmTheme = () => {
    if (isLocked) return;
    const next = themeDraft.trim().slice(0, THEME_MAX_LENGTH);
    setThemeDraft(next);
    onThemeChange?.(next);
    if (modeAllowsSolo(mode)) {
      void goToStep("setup");
      return;
    }
    const max = PLAYER_COUNT_RANGE[mode].max;
    onPlayerCountChange(max);
    void onCreateRoom(max, mode, next);
  };

  const pressChoice = (choice: "solo" | "multi" | "join" | VerseMode) => {
    if (isLocked) return;
    setPressedChoice(choice);
  };

  const releaseChoice = () => {
    setPressedChoice(null);
  };

  const handleSolo = () => {
    if (isLocked) return;
    onPlayerCountChange(1);
    void onCreateRoom(1);
  };

  const handleMulti = () => {
    if (isLocked) return;
    const max = PLAYER_COUNT_RANGE[mode].max;
    onPlayerCountChange(max);
    void onCreateRoom(max);
  };

  const handleJoin = () => {
    const code = normalizeRoomCode(joinCode);
    if (code.length < 4) {
      setJoinError("ルームコードを4文字入力してください");
      return;
    }
    setJoinError("");
    onJoinRoom(code);
  };

  return (
    <div
      ref={rootRef}
      className={`relative mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col overflow-x-hidden bg-white md:max-w-2xl ${
        inputFocused || step === "history"
          ? "overflow-y-auto overscroll-x-none overscroll-y-contain touch-pan-y"
          : "overflow-hidden"
      }`}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          transitioning ? "pointer-events-none" : ""
        } ${
          step === "mode"
            ? inputFocused
              ? "justify-start gap-2 pb-4 md:gap-[clamp(0.5rem,2dvh,1.5rem)]"
              : "justify-center gap-3 md:gap-[clamp(0.5rem,2dvh,1.5rem)]"
            : step === "history"
              ? "gap-3 overflow-y-auto overscroll-contain pb-4"
              : step === "theme"
                ? "gap-4"
                : "gap-4"
        }`}
      >
        {step === "mode" ? (
          <>
            <header
              className={`shrink-0 text-center md:space-y-[clamp(0.25rem,1dvh,0.75rem)] ${
                inputFocused ? "space-y-1" : "space-y-1.5"
              }`}
            >
              <hr className="brush-line mx-auto w-10 md:w-14" />
              <h1
                className={`tracking-[0.2em] md:text-[clamp(2rem,7dvh,3.75rem)] ${
                  inputFocused ? "text-2xl" : "text-3xl"
                }`}
              >
                風流
                <span
                  className={`mt-0.5 block tracking-[0.35em] text-black/55 md:mt-1 md:text-[clamp(0.875rem,2.5dvh,1.5rem)] ${
                    inputFocused ? "text-sm" : "text-base"
                  }`}
                >
                  オンライン
                </span>
              </h1>
              <hr className="brush-line mx-auto w-10 md:w-14" />
            </header>

            <form
              className="block shrink-0 space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                endInputMode();
              }}
            >
              <label className="block space-y-1.5">
                <span className="text-sm tracking-widest text-black/70">
                  雅号
                </span>
                <input
                  ref={nicknameInputRef}
                  type="text"
                  value={nickname}
                  maxLength={12}
                  placeholder="名無しの俳人"
                  enterKeyHint="done"
                  autoComplete="nickname"
                  onFocus={() => handleInputFocus(false)}
                  onBlur={handleInputBlur}
                  onChange={(e) => onNicknameChange(e.target.value)}
                  className="brush-input w-full px-4 py-2.5 text-base md:py-[clamp(0.5rem,1.8dvh,0.875rem)] md:text-lg"
                />
              </label>
            </form>

            <section className="brush-box flex shrink-0 flex-col gap-2 p-3 md:gap-[clamp(0.5rem,1.5dvh,0.75rem)] md:p-[clamp(0.75rem,2dvh,1rem)]">
              <p className="shrink-0 text-sm tracking-widest text-black/70">
                モードを選ぶ
              </p>
              <div className="flex shrink-0 flex-col gap-2">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleSelectMode(m)}
                    onPointerDown={() => pressChoice(m)}
                    onPointerUp={releaseChoice}
                    onPointerCancel={releaseChoice}
                    onPointerLeave={releaseChoice}
                    aria-pressed={pressedChoice === m}
                    className={`brush-btn-outline w-full tracking-[0.35em] md:py-[clamp(0.75rem,2.5dvh,1.25rem)] md:text-[clamp(1.125rem,3dvh,1.5rem)] ${
                      inputFocused
                        ? "px-4 py-2.5 text-base"
                        : "px-4 py-3.5 text-lg"
                    } ${pressedChoice === m ? "is-pressed" : ""}`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </section>

            <div className="brush-box shrink-0 p-3 md:p-[clamp(0.75rem,2dvh,1rem)]">
              <p className="mb-2 text-sm tracking-widest text-black/70">
                ルームコードで入る
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!isLocked) handleJoin();
                }}
              >
                <input
                  ref={joinInputRef}
                  type="text"
                  value={joinCode}
                  maxLength={joinComposing ? 12 : 6}
                  placeholder="A1B2"
                  enterKeyHint="go"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  lang="en"
                  inputMode="text"
                  onFocus={() => handleInputFocus(true)}
                  onBlur={handleInputBlur}
                  onCompositionStart={() => setJoinComposing(true)}
                  onCompositionEnd={(e) => {
                    setJoinComposing(false);
                    setJoinCode(normalizeRoomCode(e.currentTarget.value));
                  }}
                  onChange={(e) => {
                    const value = e.target.value;
                    const native = e.nativeEvent as InputEvent;
                    if (joinComposing || native.isComposing) {
                      setJoinCode(value);
                      return;
                    }
                    setJoinCode(normalizeRoomCode(value));
                  }}
                  className="brush-input min-w-0 flex-1 px-3 py-2.5 font-mono tracking-[0.2em] md:py-[clamp(0.5rem,1.8dvh,0.875rem)] md:text-lg"
                />
                <button
                  type="submit"
                  disabled={isLocked}
                  onPointerDown={() => pressChoice("join")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "join"}
                  className={`brush-btn shrink-0 px-4 py-2.5 text-sm tracking-widest md:px-5 md:py-[clamp(0.5rem,1.8dvh,0.875rem)] md:text-base ${
                    pressedChoice === "join" ? "is-pressed" : ""
                  }`}
                >
                  入室
                </button>
              </form>
              {joinError && (
                <p className="mt-2 text-xs underline">{joinError}</p>
              )}
            </div>

            {poemHistory.length > 0 && (
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  void goToStep("history");
                }}
                className="brush-btn-outline w-full shrink-0 px-4 py-3 text-sm tracking-[0.35em] md:py-[clamp(0.5rem,1.8dvh,0.875rem)] md:text-base"
              >
                今まで詠んだ句（{toKanji(poemHistory.length)}）
              </button>
            )}
          </>
        ) : step === "theme" ? (
          <section className="relative flex min-h-0 flex-1 flex-col">
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-1 py-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={handleBackToMode}
                className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
              >
                ← 戻る
              </button>
              <p className="text-xl tracking-[0.35em] text-black/55 md:text-[clamp(1.25rem,3.5dvh,1.875rem)]">
                {MODE_LABEL[mode]}
              </p>
              <span className="w-12" aria-hidden />
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-1 py-4 md:gap-[clamp(0.75rem,2.5dvh,1.5rem)]">
              <header className="space-y-1 text-center">
                <h2 className="text-3xl tracking-[0.35em] md:text-[clamp(1.75rem,5dvh,3rem)]">
                  お題
                </h2>
                <p className="text-sm tracking-widest text-black/45">
                  空欄のまま進んでも構いません
                </p>
              </header>

              <div className="flex w-full max-w-md flex-col gap-3 md:max-w-lg md:gap-[clamp(0.5rem,2dvh,1rem)]">
                <input
                  ref={themeInputRef}
                  type="text"
                  value={themeDraft}
                  maxLength={THEME_MAX_LENGTH}
                  placeholder="例：春の雨"
                  enterKeyHint="done"
                  onFocus={() => handleInputFocus(false)}
                  onBlur={handleInputBlur}
                  onChange={(e) => setThemeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === "Enter") handleConfirmTheme();
                  }}
                  className="brush-input w-full px-4 py-3 text-center text-xl tracking-[0.2em] md:py-[clamp(0.75rem,2dvh,1rem)] md:text-[clamp(1.25rem,3dvh,1.5rem)]"
                />
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={pickRandomTheme}
                  className="brush-btn-outline w-full px-4 py-3 text-sm tracking-[0.35em] md:py-[clamp(0.5rem,1.8dvh,0.875rem)] md:text-base"
                >
                  ランダムなお題
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleConfirmTheme}
                  className="brush-btn w-full px-4 py-4 text-lg tracking-[0.3em] md:py-[clamp(0.75rem,2.5dvh,1.25rem)] md:text-[clamp(1rem,2.5dvh,1.25rem)]"
                >
                  このお題で進む
                </button>
              </div>
            </div>
          </section>
        ) : step === "history" ? (
          <section className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex shrink-0 items-center justify-between gap-2 px-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  void goToStep("mode");
                }}
                className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
              >
                ← 戻る
              </button>
              <h2 className="text-lg tracking-[0.35em] md:text-[clamp(1.125rem,3dvh,1.5rem)]">
                今まで詠んだ句
              </h2>
              <span className="w-12" aria-hidden />
            </div>
            <div className="flex flex-col items-center gap-8 pb-4 md:gap-[clamp(1.5rem,4dvh,2rem)]">
              {poemHistory.map((entry) => {
                const poem = historyEntryToPoem(entry);
                const title =
                  poem.mode === "shirazu"
                    ? (shirazuOwnerLabel(poem, myId) ?? MODE_LABEL.shirazu)
                    : MODE_LABEL[poem.mode];
                return (
                  <div
                    key={entry.id}
                    className="flex w-full max-w-[15rem] flex-col items-center gap-2 md:max-w-[min(18rem,38dvh)]"
                  >
                    <p className="text-center text-xs tracking-widest text-black/45">
                      {formatHistoryDate(entry.savedAt)}
                      {title ? `　${title}` : ""}
                      {entry.theme ? `　お題：${entry.theme}` : ""}
                    </p>
                    <TanzakuCard
                      poem={poem}
                      still
                      anonymous={poem.mode === "shirazu"}
                      viewerId={myId}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          /* 一人／複数の確認画面（俳句・短歌）— 本体は画面中央 */
          <section className="relative flex min-h-0 flex-1 flex-col">
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-1 py-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  void goToStep("theme");
                }}
                className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
              >
                ← 戻る
              </button>
              <p className="text-xl tracking-[0.35em] text-black/55 md:text-[clamp(1.25rem,3.5dvh,1.875rem)]">
                {MODE_LABEL[mode]}
              </p>
              <span className="w-12" aria-hidden />
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-1 py-4 md:gap-[clamp(1rem,3dvh,2rem)]">
              <h2 className="text-center text-3xl tracking-[0.35em] md:text-[clamp(1.75rem,5dvh,3rem)]">
                どう詠む？
              </h2>
              <div className="flex w-full max-w-md flex-col gap-3 md:max-w-lg md:gap-[clamp(0.5rem,2dvh,1rem)]">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleSolo}
                  onPointerDown={() => pressChoice("solo")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "solo"}
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-[clamp(1rem,4dvh,1.75rem)] md:text-[clamp(1.5rem,4.5dvh,2.25rem)] ${
                    pressedChoice === "solo" ? "is-pressed" : ""
                  }`}
                >
                  ひとりで詠む
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleMulti}
                  onPointerDown={() => pressChoice("multi")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "multi"}
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-[clamp(1rem,4dvh,1.75rem)] md:text-[clamp(1.5rem,4.5dvh,2.25rem)] ${
                    pressedChoice === "multi" ? "is-pressed" : ""
                  }`}
                >
                  みんなで詠む
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 bg-white"
        style={{
          opacity: veil,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      />
    </div>
  );
}
