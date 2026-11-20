"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { TanzakuCard } from "@/components/TanzakuCard";
import { ViewportFit } from "@/components/ViewportFit";
import {
  MODE_LABEL,
  modeAllowsSolo,
  PLAYER_COUNT_RANGE,
  roomModeLabel,
  SHIRAZU_STYLE_LABEL,
  THEME_MAX_LENGTH,
  THEME_PROMPTS,
} from "@/lib/constants";
import {
  historyEntryToPoem,
  type PoemHistoryEntry,
} from "@/lib/online/poem-history";
import { captureElementPng, downloadPngDataUrl } from "@/lib/export-tanzaku";
import { OpenRoomList } from "@/components/OpenRoomList";
import { shirazuOwnerLabel, toKanji } from "@/lib/utils";
import type { Poem, ShirazuStyle, VerseMode } from "@/types/game";

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="18"
      aria-hidden
      className="block"
    >
      {/* 横に厚めのゴミ箱：蓋・胴・縦線 */}
      <path
        d="M7.5 4.2h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M4.2 7h15.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7.2 7.2v10.2c0 .9.7 1.6 1.6 1.6h6.4c.9 0 1.6-.7 1.6-1.6V7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 10.2v5.2M13.8 10.2v5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type HomeStep =
  | "mode"
  | "theme"
  | "style"
  | "setup"
  | "history"
  | "rooms";

interface HomeScreenProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  poemHistory?: PoemHistoryEntry[];
  onDeletePoemHistory?: (entryId: string) => void;
  myId?: string;
  mode: VerseMode;
  theme?: string;
  onThemeChange?: (value: string) => void;
  shirazuStyle?: ShirazuStyle;
  onShirazuStyleChange?: (style: ShirazuStyle) => void;
  playerCount: number;
  onModeChange: (mode: VerseMode) => void;
  onPlayerCountChange: (count: number) => void;
  onCreateRoom: (
    count: number,
    verseMode?: VerseMode,
    theme?: string,
    shirazuStyle?: ShirazuStyle,
    kumoGakure?: boolean,
  ) => void | Promise<void>;
  onJoinRoom: (roomId: string) => void;
  onSpectateRoom: (roomId: string) => void;
  /** ロビーから戻ったときの初期画面 */
  initialStep?: HomeStep;
  busy?: boolean;
}

const MODES: VerseMode[] = ["haiku", "tanka", "shirazu"];
const SHIRAZU_STYLES: ShirazuStyle[] = ["strict", "free"];

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
  onDeletePoemHistory,
  myId,
  mode,
  theme = "",
  onThemeChange,
  shirazuStyle = "strict",
  onShirazuStyleChange,
  playerCount,
  onModeChange,
  onPlayerCountChange,
  onCreateRoom,
  onJoinRoom,
  onSpectateRoom,
  initialStep = "mode",
  busy = false,
}: HomeScreenProps) {
  const [step, setStep] = useState<HomeStep>(initialStep);
  const [veil, setVeil] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [themeDraft, setThemeDraft] = useState(theme);
  const [pressedChoice, setPressedChoice] = useState<
    "solo" | "multi" | "kumo" | "join" | VerseMode | ShirazuStyle | null
  >(null);
  /** 俳句・短歌で、お題の前に選んだ雲隠れ */
  const [kumoChoice, setKumoChoice] = useState(false);
  /** キーボード表示中はコンパクト＋スクロールに切替 */
  const [inputFocused, setInputFocused] = useState(false);
  const poemCaptureRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shareFilename, setShareFilename] = useState("風流_句.png");
  const [shareBusy, setShareBusy] = useState(false);
  const [sharingPoemId, setSharingPoemId] = useState<string | null>(null);
  const [shareError, setShareError] = useState("");
  const lockedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
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
    if (active === nicknameInputRef.current) {
      (active as HTMLElement).blur();
    }
    rootRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  const handleInputFocus = () => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setInputFocused(true);
    const vv = window.visualViewport;
    if (vv) viewportHeightRef.current = vv.height;
  };

  const handleInputBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      if (document.activeElement !== nicknameInputRef.current) endInputMode();
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

  const openSharePreview = useCallback(
    async (element: HTMLElement | null, filename: string) => {
      if (!element || shareBusy) return;
      setShareBusy(true);
      setShareError("");
      try {
        await new Promise((r) => window.setTimeout(r, 50));
        const url = await captureElementPng(element);
        setPreviewUrl(url);
        setShareFilename(filename);
        setShareOpen(true);
      } catch {
        setShareError("画像を作れませんでした。もう一度試してください。");
      } finally {
        setShareBusy(false);
        setSharingPoemId(null);
      }
    },
    [shareBusy],
  );

  const handleOpenHistoryShare = useCallback(
    async (poem: Poem, entryId: string) => {
      setSharingPoemId(entryId);
      const owner =
        poem.mode === "shirazu"
          ? (shirazuOwnerLabel(poem, myId) ?? "句")
          : MODE_LABEL[poem.mode];
      const el = poemCaptureRefs.current.get(entryId) ?? null;
      await openSharePreview(el, `風流_${owner}.png`);
    },
    [myId, openSharePreview],
  );

  const handleSelectMode = (next: VerseMode) => {
    if (isLocked) return;
    onModeChange(next);
    setKumoChoice(false);
    setThemeDraft("");
    onThemeChange?.("");
    // 俳句・短歌は人数、リレーは流派を先に選び、お題は最後
    if (modeAllowsSolo(next)) {
      void goToStep("setup");
      return;
    }
    void goToStep("style");
  };

  const handleBackToMode = () => {
    setPressedChoice(null);
    setThemeDraft("");
    onThemeChange?.("");
    void goToStep("mode");
  };

  const handleBackFromTheme = () => {
    setPressedChoice(null);
    if (modeAllowsSolo(mode)) {
      void goToStep("setup");
      return;
    }
    void goToStep("style");
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
    if (mode === "shirazu") {
      const max = PLAYER_COUNT_RANGE[mode].max;
      onPlayerCountChange(max);
      void onCreateRoom(max, mode, next, shirazuStyle);
      return;
    }
    void onCreateRoom(playerCount, mode, next, undefined, kumoChoice);
  };

  const handleSelectShirazuStyle = (style: ShirazuStyle) => {
    if (isLocked) return;
    onShirazuStyleChange?.(style);
    const max = PLAYER_COUNT_RANGE[mode].max;
    onPlayerCountChange(max);
    void goToStep("theme");
  };

  const pressChoice = (
    choice: "solo" | "multi" | "kumo" | "join" | VerseMode | ShirazuStyle,
  ) => {
    if (isLocked) return;
    setPressedChoice(choice);
  };

  const releaseChoice = () => {
    setPressedChoice(null);
  };

  const handleSolo = () => {
    if (isLocked) return;
    setKumoChoice(false);
    onPlayerCountChange(1);
    void goToStep("theme");
  };

  const handleMulti = () => {
    if (isLocked) return;
    setKumoChoice(false);
    const max = PLAYER_COUNT_RANGE[mode].max;
    onPlayerCountChange(max);
    void goToStep("theme");
  };

  const handleKumo = () => {
    if (isLocked) return;
    setKumoChoice(true);
    const max = PLAYER_COUNT_RANGE[mode].max;
    onPlayerCountChange(max);
    void goToStep("theme");
  };

  const modeGap = inputFocused
    ? "gap-2 pb-4 md:gap-3"
    : "gap-3 md:gap-4";

  return (
    <div
      ref={rootRef}
      className="relative mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col overflow-hidden overflow-x-hidden bg-white md:max-w-2xl"
    >
      {step === "rooms" ? (
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 pb-4 pt-2 ${
            transitioning ? "pointer-events-none" : ""
          }`}
        >
          <OpenRoomList
            busy={isLocked}
            onBack={() => {
              void goToStep("mode");
            }}
            onJoin={onJoinRoom}
            onSpectate={onSpectateRoom}
          />
        </div>
      ) : step === "history" ? (
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pb-4 ${
            transitioning ? "pointer-events-none" : ""
          }`}
        >
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
              <h2 className="text-lg tracking-[0.35em] md:text-2xl">
                今まで詠んだ句
              </h2>
              <span className="w-12" aria-hidden />
            </div>
            <div className="flex flex-col items-center gap-8 pb-4">
              {poemHistory.length === 0 ? (
                <p className="py-8 text-center text-sm tracking-widest text-black/45">
                  まだ句がありません
                </p>
              ) : null}
              {poemHistory.map((entry) => {
                const poem = historyEntryToPoem(entry);
                const title =
                  poem.mode === "shirazu"
                    ? (shirazuOwnerLabel(poem, myId) ?? MODE_LABEL.shirazu)
                    : MODE_LABEL[poem.mode];
                return (
                  <div
                    key={entry.id}
                    className="flex w-full max-w-[15rem] flex-col items-center gap-2 md:max-w-[18rem]"
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
                    <div className="flex w-full items-stretch gap-2">
                      <button
                        type="button"
                        disabled={isLocked || shareBusy}
                        onClick={() => {
                          void handleOpenHistoryShare(poem, entry.id);
                        }}
                        className="brush-btn-outline min-w-0 flex-1 px-3 py-2.5 text-xs tracking-widest text-black/55"
                      >
                        {shareBusy && sharingPoemId === entry.id
                          ? "画像を用意中…"
                          : "句をシェアする"}
                      </button>
                      {onDeletePoemHistory ? (
                        <button
                          type="button"
                          disabled={isLocked}
                          aria-label="この句を消す"
                          onClick={() => {
                            if (window.confirm("この句を消しますか？")) {
                              onDeletePoemHistory(entry.id);
                            }
                          }}
                          className="brush-btn-outline flex shrink-0 items-center justify-center px-3 text-black/55"
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {shareError ? (
              <p className="text-center text-xs underline">{shareError}</p>
            ) : null}
          </section>

          {/* キャプチャ用（画面外） */}
          <div
            aria-hidden
            className="pointer-events-none fixed top-0 -left-[9999px] z-[-1] bg-white p-6"
          >
            {poemHistory.map((entry) => {
              const poem = historyEntryToPoem(entry);
              return (
                <div
                  key={`capture-${entry.id}`}
                  ref={(el) => {
                    poemCaptureRefs.current.set(entry.id, el);
                  }}
                  className="mb-8 w-[15rem] bg-white p-4 md:w-[min(22rem,42dvh)]"
                >
                  {poem.mode === "shirazu" ? (
                    <p className="mb-3 text-center text-lg tracking-[0.35em]">
                      {shirazuOwnerLabel(poem, myId) ?? "名無しの句"}
                    </p>
                  ) : null}
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

          {shareOpen && previewUrl ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
              role="dialog"
              aria-modal="true"
              aria-label="句の画像"
              onClick={() => setShareOpen(false)}
            >
              <div
                className="brush-box flex w-full max-w-sm flex-col gap-4 bg-white p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-center text-sm tracking-widest text-black/60">
                  句の画像
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="完成した句"
                  className="mx-auto max-h-[55vh] w-auto max-w-full border-2 border-black bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!previewUrl) return;
                    downloadPngDataUrl(previewUrl, shareFilename);
                  }}
                  className="brush-btn w-full px-4 py-3 text-sm tracking-widest"
                >
                  保存する
                </button>
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="brush-btn-outline w-full px-4 py-2.5 text-sm tracking-widest"
                >
                  閉じる
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <ViewportFit key={step}>
          <div
            className={`flex w-full flex-col ${
              transitioning ? "pointer-events-none" : ""
            } ${step === "mode" ? modeGap : "gap-4"}`}
          >
        {step === "mode" ? (
          <>
            <header
              className={`shrink-0 text-center md:space-y-2 ${
                inputFocused ? "space-y-1" : "space-y-1.5"
              }`}
            >
              <hr className="brush-line mx-auto w-10 md:w-14" />
              <h1
                className={`tracking-[0.2em] md:text-6xl ${
                  inputFocused ? "text-2xl" : "text-3xl"
                }`}
              >
                風流
                <span
                  className={`mt-0.5 block tracking-[0.35em] text-black/55 md:mt-1 md:text-2xl ${
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
                  placeholder="名無しの俳人"
                  enterKeyHint="done"
                  autoComplete="nickname"
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  onChange={(e) => onNicknameChange(e.target.value)}
                  className="brush-input w-full px-4 py-2.5 text-base md:py-3.5 md:text-lg"
                />
              </label>
            </form>

            <section className="brush-box flex shrink-0 flex-col gap-2 p-3 md:gap-3 md:p-4">
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
                    className={`brush-btn-outline w-full tracking-[0.35em] md:py-5 md:text-2xl ${
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

            <button
              type="button"
              disabled={isLocked}
              onClick={() => {
                releaseChoice();
                void goToStep("rooms");
              }}
              onPointerDown={() => pressChoice("join")}
              onPointerUp={releaseChoice}
              onPointerCancel={releaseChoice}
              onPointerLeave={releaseChoice}
              aria-pressed={pressedChoice === "join"}
              className={`brush-btn w-full shrink-0 tracking-[0.35em] md:py-5 md:text-2xl ${
                inputFocused ? "px-4 py-2.5 text-base" : "px-4 py-3.5 text-lg"
              } ${pressedChoice === "join" ? "is-pressed" : ""}`}
            >
              和室に参加する
            </button>

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
        ) : step === "style" ? (
          <section className="flex w-full flex-col gap-5">
            <div className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={handleBackToMode}
                className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
              >
                ← 戻る
              </button>
              <p className="text-xl tracking-[0.35em] text-black/55 md:text-3xl">
                {MODE_LABEL[mode]}
              </p>
              <span className="w-12" aria-hidden />
            </div>

            <div className="flex flex-col items-center gap-5 px-1 py-2 md:gap-6">
              <header className="text-center">
                <h2 className="text-3xl tracking-[0.35em] md:text-5xl">
                  どう詠む？
                </h2>
              </header>

              <div className="flex w-full max-w-md flex-col gap-3 md:max-w-lg md:gap-4">
                {SHIRAZU_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleSelectShirazuStyle(style)}
                    onPointerDown={() => pressChoice(style)}
                    onPointerUp={releaseChoice}
                    onPointerCancel={releaseChoice}
                    onPointerLeave={releaseChoice}
                    aria-pressed={pressedChoice === style}
                    className={`brush-btn-outline w-full px-4 py-4 text-lg tracking-[0.3em] md:py-5 md:text-xl ${
                      pressedChoice === style ? "is-pressed" : ""
                    } ${shirazuStyle === style ? "bg-black text-white" : ""}`}
                  >
                    {SHIRAZU_STYLE_LABEL[style]}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : step === "theme" ? (
          <section className="flex w-full flex-col gap-5">
            <div className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={handleBackFromTheme}
                className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
              >
                ← 戻る
              </button>
              <p className="text-xl tracking-[0.35em] text-black/55 md:text-3xl">
                {mode === "shirazu"
                  ? SHIRAZU_STYLE_LABEL[shirazuStyle]
                  : roomModeLabel(mode, "strict", kumoChoice)}
              </p>
              <span className="w-12" aria-hidden />
            </div>

            <div className="flex flex-col items-center gap-5 px-1 py-2 md:gap-6">
              <header className="text-center">
                <h2 className="text-3xl tracking-[0.35em] md:text-5xl">お題</h2>
              </header>

              <div className="flex w-full max-w-md flex-col gap-3 md:max-w-lg md:gap-4">
                <input
                  ref={themeInputRef}
                  type="text"
                  value={themeDraft}
                  maxLength={THEME_MAX_LENGTH}
                  placeholder=""
                  enterKeyHint="done"
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  onChange={(e) => setThemeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === "Enter") handleConfirmTheme();
                  }}
                  className="brush-input w-full px-4 py-3 text-center text-xl tracking-[0.2em] md:py-4 md:text-2xl"
                />
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={pickRandomTheme}
                  className="brush-btn-outline w-full px-4 py-3 text-sm tracking-[0.35em] md:py-3.5 md:text-base"
                >
                  ランダムなお題
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleConfirmTheme}
                  className="brush-btn w-full px-4 py-4 text-lg tracking-[0.3em] md:py-5 md:text-xl"
                >
                  {themeDraft.trim() ? "このお題で進む" : "お題なしで進む"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          /* 一人／複数の確認画面（俳句・短歌） */
          <section className="flex w-full flex-col gap-5">
            <div className="flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={handleBackToMode}
                className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
              >
                ← 戻る
              </button>
              <p className="text-xl tracking-[0.35em] text-black/55 md:text-3xl">
                {MODE_LABEL[mode]}
              </p>
              <span className="w-12" aria-hidden />
            </div>

            <div className="flex flex-col items-center gap-8 px-1 py-2 md:gap-8">
              <h2 className="text-center text-3xl tracking-[0.35em] md:text-5xl">
                どう詠む？
              </h2>
              <div className="flex w-full max-w-md flex-col gap-3 md:max-w-lg md:gap-4">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleSolo}
                  onPointerDown={() => pressChoice("solo")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "solo"}
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-7 md:text-4xl ${
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
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-7 md:text-4xl ${
                    pressedChoice === "multi" ? "is-pressed" : ""
                  }`}
                >
                  みんなで詠む
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleKumo}
                  onPointerDown={() => pressChoice("kumo")}
                  onPointerUp={releaseChoice}
                  onPointerCancel={releaseChoice}
                  onPointerLeave={releaseChoice}
                  aria-pressed={pressedChoice === "kumo"}
                  className={`brush-btn-outline w-full py-5 text-2xl tracking-[0.35em] md:py-7 md:text-4xl ${
                    pressedChoice === "kumo" ? "is-pressed" : ""
                  }`}
                >
                  雲隠れ
                </button>
              </div>
            </div>
          </section>
        )}
          </div>
        </ViewportFit>
      )}

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
