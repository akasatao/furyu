"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TanzakuCard } from "@/components/TanzakuCard";
import {
  MODE_LABEL,
  PLAYER_COUNT_RANGE,
  SHIRAZU_STYLE_LABEL,
  THEME_MAX_LENGTH,
  THEME_PROMPTS,
} from "@/lib/constants";
import { captureElementPng, downloadPngDataUrl } from "@/lib/export-tanzaku";
import {
  hasLineRevealSeen,
  hasShirazuRevealStepSeen,
  markLineRevealSeen,
  markShirazuRevealStepSeen,
} from "@/lib/reveal-progress";
import { shirazuOwnerLabel, toKanji } from "@/lib/utils";
import type { Poem, ShirazuStyle, VerseMode } from "@/types/game";

const VERSE_MODES: VerseMode[] = ["haiku", "tanka", "shirazu"];
const SHIRAZU_STYLES: ShirazuStyle[] = ["strict", "free"];

type PickerStep = "closed" | "mode" | "kumo" | "style" | "theme";

/** タイトル＋空短冊を出してから書き始めるまでの間 */
const BEFORE_WRITE_MS = 600;
const BULK_SHARE_ID = "__bulk__";

/** リレーのまとめ画像。2首と4首は2列、それ以外は3列にして縦に伸ばさない */
function shirazuShareColumns(count: number): number {
  if (count <= 2) return Math.max(count, 1);
  if (count === 4) return 2;
  return 3;
}

function PlayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.5v13l11-6.5L8 5.5z" />
    </svg>
  );
}

interface RevealPhaseProps {
  poems: Poem[];
  theme?: string;
  shirazuStyle?: ShirazuStyle;
  /** 今の俳句・短歌が雲隠れか */
  kumoGakure?: boolean;
  /** 披露演出の既読に使う（再表示で最初から再生しない） */
  roomId?: string | null;
  /** 今の連衆人数。別モードが開けるかの判定に使う */
  playerCount?: number;
  onRematch: (
    theme: string,
    next?: {
      mode: VerseMode;
      shirazuStyle?: ShirazuStyle;
      kumoGakure?: boolean;
    },
  ) => void;
  /** お題フォームを開いた／閉じた。連衆・観戦の表示用 */
  onPickingThemeChange?: (picking: boolean) => void;
  onHome: () => void;
  canRematch?: boolean;
  /** 亭主が部屋に残っている（もう一度待ち表示の可否） */
  hostPresent?: boolean;
  /** 亭主が次の宴を考えているあいだ、上に通知を出し続ける */
  hostPickingTheme?: boolean;
  isSolo?: boolean;
  /** false のあいだは短冊枠のみ。true になってから文字の書き出し開始 */
  revealReady?: boolean;
  /**
   * リレー披露の同期インデックス。
   * -1＝披露前、0..n-1＝披露中、n＝一覧。null＝従来フォールバック（一覧）。
   */
  revealPoemIndex?: number | null;
  isHost?: boolean;
  onAdvanceReveal?: () => void;
  advancing?: boolean;
  myId?: string;
}

export function RevealPhase({
  poems,
  theme = "",
  shirazuStyle = "strict",
  roomId = null,
  playerCount = 1,
  onRematch,
  onPickingThemeChange,
  onHome,
  canRematch = true,
  hostPresent = true,
  hostPickingTheme = false,
  isSolo = false,
  revealReady = false,
  revealPoemIndex = null,
  isHost = false,
  onAdvanceReveal,
  advancing = false,
  myId,
}: RevealPhaseProps) {
  const isShirazu = poems[0]?.mode === "shirazu";
  const styleLabel =
    SHIRAZU_STYLE_LABEL[
      poems[0]?.shirazuStyle === "free" || shirazuStyle === "free"
        ? "free"
        : "strict"
    ];
  const bulkCaptureRef = useRef<HTMLDivElement>(null);
  const shirazuBulkRef = useRef<HTMLDivElement>(null);
  const poemCaptureRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shareFilename, setShareFilename] = useState("風流_句.png");
  const [busy, setBusy] = useState(false);
  const [sharingPoemId, setSharingPoemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [presentWriting, setPresentWriting] = useState(false);
  /**
   * この首の表示に入った時点で既読だったか。
   * 書き出し開始と同時に mark しても、初回のアニメは skip しない。
   */
  const [presentSkipAnim, setPresentSkipAnim] = useState(false);
  /** 俳句・短歌：表示開始時点で既読だったか */
  const [lineSkipAnim, setLineSkipAnim] = useState(false);
  /** 一覧で披露アニメを再生中の句 */
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [pickerStep, setPickerStep] = useState<PickerStep>("closed");
  /** 別モードで進むときだけ入る。同じモードの再宴では null */
  const [nextMode, setNextMode] = useState<VerseMode | null>(null);
  const [nextStyle, setNextStyle] = useState<ShirazuStyle>("strict");
  /** 俳句・短歌で、通常か雲隠れか */
  const [nextKumo, setNextKumo] = useState(false);
  /** 雲隠れの「戻る」がモード一覧へ戻るか、ピッカーを閉じるか */
  const [kumoBackStep, setKumoBackStep] = useState<"closed" | "mode">("closed");
  /** お題の「戻る」がどの選択へ戻るか */
  const [themeBackStep, setThemeBackStep] = useState<"mode" | "kumo" | "style">(
    "mode",
  );
  const [themeDraft, setThemeDraft] = useState(theme);
  const themeInputRef = useRef<HTMLInputElement>(null);
  const restoredPicker = useRef(false);

  const poemCount = poems.length;
  /** ソロ披露など roomId が無いときの既読キー */
  const progressId = useMemo(() => {
    if (roomId) return roomId;
    const ids = poems.map((p) => p.id).filter(Boolean);
    return ids.length > 0 ? `local:${ids.join(",")}` : null;
  }, [roomId, poems]);

  /** 披露前は revealReady を待たず待ち画面へ（フェード開け時の全員短冊チラつき防止） */
  const waitingToStart =
    isShirazu && revealPoemIndex != null && revealPoemIndex < 0;
  const presentIndex =
    isShirazu &&
    !waitingToStart &&
    revealPoemIndex != null &&
    revealPoemIndex >= 0 &&
    revealPoemIndex < poemCount
      ? revealPoemIndex
      : null;
  const presentPoem = presentIndex != null ? poems[presentIndex] : null;
  const showGallery =
    isShirazu &&
    !waitingToStart &&
    presentIndex == null &&
    (revealReady ||
      (revealPoemIndex != null && revealPoemIndex >= poemCount));
  const showActions = !isShirazu || showGallery;
  const bulkColumns = shirazuShareColumns(poems.length);

  useEffect(() => {
    if (presentIndex == null) {
      setPresentWriting(false);
      setPresentSkipAnim(false);
      return;
    }
    // 入室時点の既読だけアニメ省略。mark 後に still へ切り替わらないようにする
    const already = hasShirazuRevealStepSeen(progressId, presentIndex);
    setPresentSkipAnim(already);
    if (already) {
      setPresentWriting(true);
      return;
    }
    setPresentWriting(false);
    const timer = window.setTimeout(() => {
      setPresentWriting(true);
      markShirazuRevealStepSeen(progressId, presentIndex);
    }, BEFORE_WRITE_MS);
    return () => window.clearTimeout(timer);
  }, [presentIndex, progressId]);

  useEffect(() => {
    if (isShirazu) return;
    const already = hasLineRevealSeen(progressId);
    setLineSkipAnim(already);
    if (already || !revealReady) return;
    markLineRevealSeen(progressId);
  }, [isShirazu, revealReady, progressId]);
  const openSharePreview = useCallback(
    async (element: HTMLElement | null, filename: string) => {
      if (!element || busy) return;
      setBusy(true);
      setErrorMessage("");
      try {
        await new Promise((r) => window.setTimeout(r, 50));
        const url = await captureElementPng(element);
        setPreviewUrl(url);
        setShareFilename(filename);
        setShareOpen(true);
      } catch {
        setErrorMessage("画像を作れませんでした。もう一度試してください。");
      } finally {
        setBusy(false);
        setSharingPoemId(null);
      }
    },
    [busy],
  );

  const handleOpenBulkShare = useCallback(async () => {
    const label =
      MODE_LABEL[poems[0]?.mode === "shirazu" ? "haiku" : poems[0].mode];
    await openSharePreview(bulkCaptureRef.current, `風流_${label}.png`);
  }, [openSharePreview, poems]);

  const handleOpenShirazuBulkShare = useCallback(async () => {
    setSharingPoemId(BULK_SHARE_ID);
    await openSharePreview(shirazuBulkRef.current, "風流_まとめ.png");
  }, [openSharePreview]);

  const handleOpenPoemShare = useCallback(
    async (poem: Poem) => {
      setSharingPoemId(poem.id);
      const owner = shirazuOwnerLabel(poem, myId) ?? "句";
      const el = poemCaptureRefs.current.get(poem.id) ?? null;
      await openSharePreview(el, `風流_${owner}.png`);
    },
    [openSharePreview, myId],
  );

  const handleSave = () => {
    if (!previewUrl) return;
    downloadPngDataUrl(previewUrl, shareFilename);
  };

  const handleCloseShare = () => {
    setShareOpen(false);
  };

  const handleReplayPoem = useCallback((poemId: string) => {
    setReplayingId(poemId);
    setReplayNonce((n) => n + 1);
  }, []);

  const currentMode = poems[0]?.mode;
  const currentShirazuStyle: ShirazuStyle =
    poems[0]?.shirazuStyle === "free" || shirazuStyle === "free"
      ? "free"
      : "strict";
  /** 今がリレーのとき、反対の流派をモード一覧に出す */
  const otherShirazuStyle: ShirazuStyle | null =
    currentMode === "shirazu"
      ? currentShirazuStyle === "free"
        ? "strict"
        : "free"
      : null;
  const canChooseKumo =
    !isSolo && (currentMode === "haiku" || currentMode === "tanka");
  const alternateModes = VERSE_MODES.filter((candidate) => {
    if (!currentMode || candidate === currentMode) return false;
    const range = PLAYER_COUNT_RANGE[candidate];
    return playerCount >= range.min && playerCount <= range.max;
  });
  const pickingTheme = pickerStep === "theme";

  const beginHostPick = () => {
    restoredPicker.current = true;
    onPickingThemeChange?.(true);
  };

  const openThemePicker = () => {
    setThemeDraft(theme.trim().slice(0, THEME_MAX_LENGTH));
    if (canChooseKumo && currentMode) {
      setNextMode(currentMode);
      setNextKumo(false);
      setKumoBackStep("closed");
      setPickerStep("kumo");
      beginHostPick();
      return;
    }
    setNextMode(null);
    setPickerStep("theme");
    beginHostPick();
  };

  const openModePicker = () => {
    setNextMode(null);
    setPickerStep("mode");
    beginHostPick();
  };

  const closePickers = () => {
    if (advancing) return;
    setPickerStep("closed");
    setNextMode(null);
    onPickingThemeChange?.(false);
  };

  const backFromTheme = () => {
    if (advancing) return;
    if (!nextMode) {
      closePickers();
      return;
    }
    setPickerStep(themeBackStep);
  };

  const openThemeForNext = () => {
    setThemeDraft(theme.trim().slice(0, THEME_MAX_LENGTH));
    setPickerStep("theme");
  };

  const selectAlternateMode = (mode: VerseMode) => {
    if (advancing) return;
    setNextMode(mode);
    setNextKumo(false);
    if (mode === "shirazu") {
      setPickerStep("style");
      return;
    }
    if (isSolo) {
      setThemeBackStep("mode");
      openThemeForNext();
      return;
    }
    setKumoBackStep("mode");
    setPickerStep("kumo");
  };

  const selectKumoChoice = (enabled: boolean) => {
    if (advancing) return;
    setNextKumo(enabled);
    setThemeBackStep("kumo");
    openThemeForNext();
  };

  const backFromKumo = () => {
    if (advancing) return;
    if (kumoBackStep === "mode") {
      setPickerStep("mode");
      return;
    }
    closePickers();
  };

  const selectShirazuStyle = (style: ShirazuStyle) => {
    if (advancing) return;
    setNextStyle(style);
    setThemeBackStep("style");
    openThemeForNext();
  };

  const selectOtherShirazuStyle = () => {
    if (advancing || !otherShirazuStyle) return;
    setNextMode("shirazu");
    setNextStyle(otherShirazuStyle);
    setThemeBackStep("mode");
    openThemeForNext();
  };

  useEffect(() => {
    if (!canRematch || !hostPickingTheme || restoredPicker.current) return;
    restoredPicker.current = true;
    setThemeDraft(theme.trim().slice(0, THEME_MAX_LENGTH));
    if (
      !isSolo &&
      (currentMode === "haiku" || currentMode === "tanka")
    ) {
      setNextMode(currentMode);
      setNextKumo(false);
      setKumoBackStep("closed");
      setPickerStep("kumo");
      return;
    }
    setNextMode(null);
    setPickerStep("theme");
  }, [canRematch, currentMode, hostPickingTheme, isSolo, theme]);

  useEffect(() => {
    if (!pickingTheme) return;
    themeInputRef.current?.focus({ preventScroll: true });
  }, [pickingTheme]);

  const pickRandomTheme = () => {
    if (THEME_PROMPTS.length === 0 || advancing) return;
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

  const confirmTheme = () => {
    if (advancing) return;
    const next = themeDraft.trim().slice(0, THEME_MAX_LENGTH);
    setThemeDraft(next);
    onRematch(
      next,
      nextMode
        ? {
            mode: nextMode,
            shirazuStyle: nextMode === "shirazu" ? nextStyle : undefined,
            kumoGakure:
              nextMode === "haiku" || nextMode === "tanka" ? nextKumo : false,
          }
        : undefined,
    );
  };

  const pickerOpen = canRematch && pickerStep !== "closed";
  const exitActions = (
    <>
      <button
        type="button"
        onClick={onHome}
        className="brush-btn-outline w-full px-4 py-3 text-sm tracking-widest"
      >
        {isSolo ? "ホームへ戻る" : "玄関へ戻る"}
      </button>
      {!isShirazu && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void handleOpenBulkShare();
          }}
          className="brush-btn-outline w-full px-4 py-2.5 text-xs tracking-widest text-black/55"
        >
          {busy ? "画像を用意中…" : "句をシェアする"}
        </button>
      )}
      {errorMessage && (
        <p className="text-center text-xs underline">{errorMessage}</p>
      )}
    </>
  );

  return (
    <div
      className={
        showGallery
          ? "mx-auto flex h-full min-h-0 w-full max-w-5xl flex-1 flex-col items-center gap-3 md:gap-5"
          : "mx-auto flex w-full max-w-md flex-col items-center gap-3 md:max-w-3xl md:gap-8"
      }
    >
      <header className="shrink-0 space-y-1.5 text-center md:space-y-2">
        <p className="text-xs tracking-[0.35em] text-black/50">披露</p>
        <h2 className="text-xl tracking-widest md:text-4xl">
          {isShirazu
            ? showGallery
              ? `${styleLabel}・${toKanji(poems.length)}首が完成`
              : styleLabel
            : `${MODE_LABEL[poems[0].mode]}が完成`}
        </h2>
        {theme.trim() ? (
          <p className="text-sm tracking-[0.2em] text-black/55">
            お題：{theme.trim()}
          </p>
        ) : null}
      </header>

      {isShirazu ? (
        <div
          className={`flex min-h-0 w-full flex-1 flex-col items-center ${
            showGallery
              ? "overflow-y-auto overscroll-contain px-1 pb-2"
              : "overflow-hidden"
          }`}
        >
          {waitingToStart && (
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 md:gap-[clamp(0.75rem,2.5dvh,1.5rem)]">
              <p className="text-center text-base tracking-[0.35em] text-black/55 md:text-[clamp(1rem,2.5dvh,1.25rem)]">
                {`${toKanji(poemCount)}首がそろいました`}
              </p>
              {isHost && onAdvanceReveal ? (
                <button
                  type="button"
                  disabled={advancing}
                  onClick={onAdvanceReveal}
                  className="brush-btn w-full max-w-[15rem] px-4 py-3 text-base tracking-[0.25em] md:max-w-[min(22rem,42dvh)] md:py-[clamp(0.75rem,2dvh,1rem)]"
                >
                  {advancing ? "進め中…" : "披露する"}
                </button>
              ) : (
                <p className="text-center text-xl tracking-[0.2em] text-black/55 md:text-[clamp(1.25rem,3.5dvh,1.875rem)]">
                  亭主が披露するのを待っています
                </p>
              )}
            </div>
          )}

          {presentPoem && presentIndex != null && (
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 md:gap-[clamp(0.75rem,2.5dvh,1.5rem)]">
              <p className="shrink-0 text-center text-2xl tracking-[0.35em] md:text-[clamp(1.5rem,5dvh,3rem)]">
                {shirazuOwnerLabel(presentPoem, myId) ?? "名無しの句"}
              </p>
              <div className="w-full max-w-[15rem] md:max-w-[min(22rem,42dvh)]">
                <TanzakuCard
                  key={`present-${presentPoem.id}-${presentIndex}`}
                  poem={presentPoem}
                  anonymous
                  still={presentSkipAnim}
                  writing={presentSkipAnim || presentWriting}
                  viewerId={myId}
                />
              </div>
              {isHost && onAdvanceReveal ? (
                <button
                  type="button"
                  disabled={advancing}
                  onClick={onAdvanceReveal}
                  className="brush-btn w-full max-w-[15rem] shrink-0 px-4 py-3 text-base tracking-[0.25em] md:max-w-[min(22rem,42dvh)] md:py-[clamp(0.75rem,2dvh,1rem)]"
                >
                  {advancing
                    ? "進め中…"
                    : presentIndex >= poemCount - 1
                      ? "結果を見る"
                      : "次の人へ"}
                </button>
              ) : (
                <p className="shrink-0 text-center text-xl tracking-[0.2em] text-black/55 md:text-[clamp(1.25rem,3.5dvh,1.875rem)]">
                  {presentIndex >= poemCount - 1
                    ? "亭主が結果を出すのを待っています"
                    : "亭主が次へ進めるのを待っています"}
                </p>
              )}
            </div>
          )}

          {showGallery && (
            <div className="flex w-full flex-col items-center gap-6 md:gap-8">
              <div className="grid w-full grid-cols-1 justify-items-center gap-6 md:grid-cols-2 md:gap-x-8 md:gap-y-8">
                {poems.map((poem, index) => {
                  const replaying = replayingId === poem.id;
                  const loneLast =
                    poems.length % 2 === 1 && index === poems.length - 1;
                  return (
                    <div
                      key={poem.id}
                      className={`flex w-full max-w-[15rem] shrink-0 flex-col items-center gap-2 md:max-w-[min(22rem,42dvh)] ${
                        loneLast ? "md:col-span-2" : ""
                      }`}
                    >
                      <TanzakuCard
                        key={
                          replaying
                            ? `replay-${poem.id}-${replayNonce}`
                            : `gallery-${poem.id}`
                        }
                        poem={poem}
                        anonymous
                        still={!replaying}
                        writing
                        viewerId={myId}
                      />
                      <div className="flex w-full items-stretch gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void handleOpenPoemShare(poem);
                          }}
                          className="brush-btn-outline min-w-0 flex-1 px-3 py-2.5 text-xs tracking-widest text-black/55"
                        >
                          {busy && sharingPoemId === poem.id
                            ? "画像を用意中…"
                            : "句をシェアする"}
                        </button>
                        <button
                          type="button"
                          aria-label="披露を再生"
                          onClick={() => {
                            handleReplayPoem(poem.id);
                          }}
                          className="brush-btn-outline flex shrink-0 items-center justify-center px-3 text-black/55"
                        >
                          <PlayIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {poems.length > 1 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void handleOpenShirazuBulkShare();
                  }}
                  className="brush-btn-outline w-full max-w-[15rem] px-4 py-3 text-base tracking-[0.25em] md:max-w-[min(22rem,42dvh)]"
                >
                  {busy && sharingPoemId === BULK_SHARE_ID
                    ? "画像を用意中…"
                    : "まとめてシェア"}
                </button>
              ) : null}
            </div>
          )}

        </div>
      ) : (
        <div
          className={`flex min-h-0 w-full flex-1 overflow-y-auto ${
            poems.length > 1
              ? "flex-col items-center gap-4 md:gap-[clamp(1.5rem,4dvh,2.5rem)]"
              : "max-w-[15rem] justify-center md:max-w-[min(22rem,42dvh)]"
          }`}
        >
          {poems.map((poem) => (
            <div
              key={poem.id}
              className="w-full max-w-[15rem] shrink-0 md:max-w-[min(22rem,42dvh)]"
            >
              <TanzakuCard
                poem={poem}
                still={lineSkipAnim}
                writing={lineSkipAnim || revealReady}
              />
            </div>
          ))}
        </div>
      )}

      {/* キャプチャ用：俳句・短歌の一括／リレーは首ごと */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 -left-[9999px] z-[-1] bg-white p-6"
      >
        {!isShirazu && (
          <div
            ref={bulkCaptureRef}
            className={`flex bg-white ${
              poems.length > 1
                ? "flex-col items-center gap-6"
                : "items-center justify-center"
            }`}
          >
            {poems.map((poem) => (
              <div
                key={`capture-bulk-${poem.id}`}
                className="w-[15rem] md:w-[min(22rem,42dvh)]"
              >
                <TanzakuCard poem={poem} still />
              </div>
            ))}
          </div>
        )}
        {isShirazu && (
          <div
            ref={shirazuBulkRef}
            className="flex flex-wrap justify-center bg-white"
            style={{
              boxSizing: "border-box",
              gap: "1.25rem",
              padding: "1.5rem",
              width: `calc(15rem * ${bulkColumns} + 1.25rem * ${Math.max(bulkColumns - 1, 0)} + 3rem + 2px)`,
            }}
          >
            {poems.map((poem) => (
              <div
                key={`bulk-${poem.id}`}
                className="flex w-[15rem] flex-col items-center [&_article]:!w-full [&_article]:!max-w-[15rem]"
              >
                <p className="mb-2 text-center text-base tracking-[0.28em]">
                  {shirazuOwnerLabel(poem, myId) ?? "名無しの句"}
                </p>
                <TanzakuCard
                  poem={poem}
                  anonymous
                  still
                  viewerId={myId}
                />
              </div>
            ))}
          </div>
        )}
        {isShirazu &&
          poems.map((poem) => (
            <div
              key={`capture-${poem.id}`}
              ref={(el) => {
                poemCaptureRefs.current.set(poem.id, el);
              }}
              className="mb-8 w-[15rem] bg-white p-4 md:w-[min(22rem,42dvh)]"
            >
              <p className="mb-3 text-center text-lg tracking-[0.35em]">
                {shirazuOwnerLabel(poem, myId) ?? "名無しの句"}
              </p>
              <TanzakuCard poem={poem} anonymous still viewerId={myId} />
            </div>
          ))}
      </div>

      {showActions && (
        <div className="w-full shrink-0">
          {!pickerOpen ? (
            <div className="flex flex-col gap-2 bg-white">
            {canRematch ? (
              <>
                <button
                  type="button"
                  onClick={openThemePicker}
                  className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                >
                  {isSolo ? "もう一度詠む" : "再び宴を開く"}
                </button>
                {alternateModes.length > 0 || otherShirazuStyle ? (
                  <button
                    type="button"
                    onClick={openModePicker}
                    className="brush-btn-outline w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                  >
                    {isSolo ? "別のモードで詠む" : "別のモードで"}
                  </button>
                ) : null}
              </>
            ) : hostPresent ? (
              <p className="py-3 text-center text-sm tracking-widest text-black/45">
                亭主がもう一度開くのを待っています
              </p>
            ) : null}
            {exitActions}
          </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pickerStep === "theme" ? (
                <div className="flex flex-col gap-2">
                  <input
                    ref={themeInputRef}
                    type="text"
                    value={themeDraft}
                    maxLength={THEME_MAX_LENGTH}
                    enterKeyHint="done"
                    disabled={advancing}
                    onChange={(e) => setThemeDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      if (e.key === "Enter") confirmTheme();
                    }}
                    className="brush-input w-full px-4 py-3 text-center text-xl tracking-[0.2em] md:py-[clamp(0.75rem,2dvh,1rem)] md:text-2xl"
                  />
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={pickRandomTheme}
                    className="brush-btn-outline w-full px-4 py-2.5 text-sm tracking-[0.35em]"
                  >
                    ランダムなお題
                  </button>
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={confirmTheme}
                    className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                  >
                    {advancing
                      ? "開き中…"
                      : themeDraft.trim()
                        ? "このお題で進む"
                        : "お題なしで進む"}
                  </button>
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={backFromTheme}
                    className="py-1 text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
                  >
                    戻る
                  </button>
                </div>
              ) : pickerStep === "mode" ? (
                <div className="flex flex-col gap-2">
                  <p className="py-1 text-center text-sm tracking-widest text-black/55">
                    モードを選ぶ
                  </p>
                  {alternateModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={advancing}
                      onClick={() => selectAlternateMode(mode)}
                      className="brush-btn-outline w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                    >
                      {MODE_LABEL[mode]}
                    </button>
                  ))}
                  {otherShirazuStyle ? (
                    <button
                      type="button"
                      disabled={advancing}
                      onClick={selectOtherShirazuStyle}
                      className="brush-btn-outline w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                    >
                      {SHIRAZU_STYLE_LABEL[otherShirazuStyle]}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={closePickers}
                    className="py-1 text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
                  >
                    戻る
                  </button>
                </div>
              ) : pickerStep === "kumo" &&
                (nextMode === "haiku" || nextMode === "tanka") ? (
                <div className="flex flex-col gap-2">
                  <p className="py-1 text-center text-sm tracking-widest text-black/55">
                    {MODE_LABEL[nextMode]}はどう詠む？
                  </p>
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={() => selectKumoChoice(false)}
                    className="brush-btn-outline w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                  >
                    通常{MODE_LABEL[nextMode]}
                  </button>
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={() => selectKumoChoice(true)}
                    className="brush-btn-outline w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                  >
                    雲隠れ
                  </button>
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={backFromKumo}
                    className="py-1 text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
                  >
                    戻る
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="py-1 text-center text-sm tracking-widest text-black/55">
                    どう詠む？
                  </p>
                  {SHIRAZU_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      disabled={advancing}
                      onClick={() => selectShirazuStyle(style)}
                      className="brush-btn-outline w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
                    >
                      {SHIRAZU_STYLE_LABEL[style]}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={advancing}
                    onClick={() => setPickerStep("mode")}
                    className="py-1 text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
                  >
                    戻る
                  </button>
                </div>
              )}
              {exitActions}
            </div>
          )}
        </div>
      )}

      {typeof document !== "undefined" && !canRematch && hostPickingTheme
        ? createPortal(
            <div
              role="status"
              className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-10 md:pt-12"
            >
              <p className="toast-drop-in max-w-md border-2 border-black bg-white px-4 py-2.5 text-center text-sm tracking-wider shadow-[2px_2px_0_#000]">
                亭主が次の宴を準備しています
              </p>
            </div>,
            document.body,
          )
        : null}

      {shareOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="句の画像"
          onClick={handleCloseShare}
        >
          <div
            className="brush-box flex w-full max-w-4xl flex-col gap-4 bg-white p-4"
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
              onClick={handleSave}
              className="brush-btn w-full px-4 py-3 text-sm tracking-widest"
            >
              保存する
            </button>
            <button
              type="button"
              onClick={handleCloseShare}
              className="brush-btn-outline w-full px-4 py-2.5 text-sm tracking-widest"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
