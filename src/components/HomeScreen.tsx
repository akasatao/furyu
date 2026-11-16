"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  MODE_LABEL,
  modeAllowsSolo,
  PLAYER_COUNT_RANGE,
} from "@/lib/constants";
import type { VerseMode } from "@/types/game";

export type HomeStep = "mode" | "setup";

interface HomeScreenProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  mode: VerseMode;
  playerCount: number;
  onModeChange: (mode: VerseMode) => void;
  onPlayerCountChange: (count: number) => void;
  onCreateRoom: (
    count: number,
    verseMode?: VerseMode,
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

export function HomeScreen({
  nickname,
  onNicknameChange,
  mode,
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
  const [pressedChoice, setPressedChoice] = useState<
    "solo" | "multi" | "join" | VerseMode | null
  >(null);
  /** キーボード表示中はコンパクト＋スクロールに切替 */
  const [inputFocused, setInputFocused] = useState(false);
  const lockedRef = useRef(false);
  const joinInputRef = useRef<HTMLInputElement>(null);

  const isLocked = busy || transitioning;

  const handleInputFocus = (scrollJoin = false) => {
    setInputFocused(true);
    if (!scrollJoin) return;
    window.requestAnimationFrame(() => {
      joinInputRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  };

  const handleInputBlur = () => {
    setInputFocused(false);
  };

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

    // リレーで風流は複数人専用 → GameApp 側の白フェードでロビーへ
    if (!modeAllowsSolo(next)) {
      const max = PLAYER_COUNT_RANGE[next].max;
      onPlayerCountChange(max);
      void onCreateRoom(max, next);
      return;
    }

    void goToStep("setup");
  };

  const handleBackToMode = () => {
    setPressedChoice(null);
    void goToStep("mode");
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
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError("ルームコードを4文字入力してください");
      return;
    }
    setJoinError("");
    onJoinRoom(code);
  };

  return (
    <div
      className={`relative mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col bg-white md:max-w-lg md:min-h-[36rem] md:overflow-hidden ${
        inputFocused
          ? "overflow-y-auto overscroll-contain"
          : "overflow-hidden"
      }`}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          transitioning ? "pointer-events-none" : ""
        } ${
          step === "mode"
            ? inputFocused
              ? "justify-start gap-2 pb-4 md:justify-start md:gap-6"
              : "justify-center gap-3 md:justify-start md:gap-6"
            : "gap-4"
        }`}
      >
        {step === "mode" ? (
          <>
            <header
              className={`shrink-0 text-center md:space-y-3 ${
                inputFocused ? "space-y-1" : "space-y-1.5"
              }`}
            >
              <hr className="brush-line mx-auto w-10 md:w-14" />
              <h1
                className={`tracking-[0.2em] md:text-5xl ${
                  inputFocused ? "text-2xl" : "text-3xl"
                }`}
              >
                風流
                <span
                  className={`mt-0.5 block tracking-[0.35em] text-black/55 md:mt-1 md:text-xl ${
                    inputFocused ? "text-sm" : "text-base"
                  }`}
                >
                  オンライン
                </span>
              </h1>
              <hr className="brush-line mx-auto w-10 md:w-14" />
            </header>

            <label className="block shrink-0 space-y-1.5 md:space-y-2">
              <span className="text-sm tracking-widest text-black/70">雅号</span>
              <input
                type="text"
                value={nickname}
                maxLength={12}
                placeholder="名無しの俳人"
                onFocus={() => handleInputFocus(false)}
                onBlur={handleInputBlur}
                onChange={(e) => onNicknameChange(e.target.value)}
                className="brush-input w-full px-4 py-2.5 text-base md:py-3"
              />
            </label>

            <section
              className={`brush-box flex shrink-0 flex-col gap-2 p-3 md:flex-none md:gap-3 md:p-4 ${
                inputFocused ? "" : "min-h-0 flex-1 md:flex-none"
              }`}
            >
              <p className="shrink-0 text-sm tracking-widest text-black/70">
                モードを選ぶ
              </p>
              <div
                className={`flex flex-col gap-2 md:flex-none ${
                  inputFocused
                    ? "shrink-0"
                    : "min-h-0 flex-1 justify-center md:flex-none"
                }`}
              >
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
                    className={`brush-btn-outline w-full tracking-[0.35em] md:py-4 md:text-xl ${
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

            <div className="brush-box shrink-0 p-3 md:p-4">
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
                  maxLength={6}
                  placeholder="A1B2"
                  enterKeyHint="go"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onFocus={() => handleInputFocus(true)}
                  onBlur={handleInputBlur}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="brush-input min-w-0 flex-1 px-3 py-2.5 font-mono tracking-[0.2em]"
                />
                <button
                  type="submit"
                  disabled={isLocked}
                  onPointerDown={() => pressChoice("join")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "join"}
                  className={`brush-btn shrink-0 px-4 py-2.5 text-sm tracking-widest ${
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
          </>
        ) : (
          /* 一人／複数の確認画面（俳句・短歌）— 本体は画面中央 */
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
              <p className="text-xl tracking-[0.35em] text-black/55 md:text-2xl">
                {MODE_LABEL[mode]}
              </p>
              <span className="w-12" aria-hidden />
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-1 py-4">
              <h2 className="text-center text-3xl tracking-[0.35em] md:text-4xl">
                どう詠む？
              </h2>
              <div className="flex w-full max-w-md flex-col gap-3">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleSolo}
                  onPointerDown={() => pressChoice("solo")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "solo"}
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-6 md:text-3xl ${
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
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-6 md:text-3xl ${
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
