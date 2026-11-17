"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TanzakuCard } from "@/components/TanzakuCard";
import { MODE_LABEL } from "@/lib/constants";
import { captureElementPng, downloadPngDataUrl } from "@/lib/export-tanzaku";
import { shirazuOwnerLabel, toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

/** タイトル＋空短冊を出してから書き始めるまでの間 */
const BEFORE_WRITE_MS = 600;

interface RevealPhaseProps {
  poems: Poem[];
  theme?: string;
  onRematch: () => void;
  onHome: () => void;
  canRematch?: boolean;
  /** 亭主が部屋に残っている（もう一度待ち表示の可否） */
  hostPresent?: boolean;
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
  onRematch,
  onHome,
  canRematch = true,
  hostPresent = true,
  isSolo = false,
  revealReady = false,
  revealPoemIndex = null,
  isHost = false,
  onAdvanceReveal,
  advancing = false,
  myId,
}: RevealPhaseProps) {
  const isShirazu = poems[0]?.mode === "shirazu";
  const bulkCaptureRef = useRef<HTMLDivElement>(null);
  const poemCaptureRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shareFilename, setShareFilename] = useState("風流_句.png");
  const [busy, setBusy] = useState(false);
  const [sharingPoemId, setSharingPoemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [presentWriting, setPresentWriting] = useState(false);

  const poemCount = poems.length;
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

  useEffect(() => {
    if (presentIndex == null) {
      setPresentWriting(false);
      return;
    }
    setPresentWriting(false);
    const timer = window.setTimeout(() => {
      setPresentWriting(true);
    }, BEFORE_WRITE_MS);
    return () => window.clearTimeout(timer);
  }, [presentIndex]);

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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 md:max-w-3xl md:gap-8">
      <header className="shrink-0 space-y-1.5 text-center md:space-y-2">
        <p className="text-xs tracking-[0.35em] text-black/50">披露</p>
        <h2 className="text-xl tracking-widest md:text-4xl">
          {isShirazu
            ? showGallery
              ? `${MODE_LABEL.shirazu}・${toKanji(poems.length)}首が完成`
              : MODE_LABEL.shirazu
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
            showGallery ? "overflow-y-auto" : "overflow-hidden"
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
                  key={`present-${presentPoem.id}-${presentIndex}-${presentWriting}`}
                  poem={presentPoem}
                  anonymous
                  writing={presentWriting}
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
            <div className="flex w-full flex-col items-center gap-6 md:gap-[clamp(1.5rem,4dvh,2.5rem)]">
              {poems.map((poem) => (
                <div
                  key={poem.id}
                  className="flex w-full max-w-[15rem] shrink-0 flex-col items-center gap-2 md:max-w-[min(22rem,42dvh)]"
                >
                  <TanzakuCard
                    poem={poem}
                    anonymous
                    still
                    viewerId={myId}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void handleOpenPoemShare(poem);
                    }}
                    className="brush-btn-outline w-full px-4 py-2.5 text-xs tracking-widest text-black/55"
                  >
                    {busy && sharingPoemId === poem.id
                      ? "画像を用意中…"
                      : "句をシェアする"}
                  </button>
                </div>
              ))}
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
              <TanzakuCard poem={poem} writing={revealReady} />
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
              <div key={`capture-bulk-${poem.id}`} className="w-[22rem]">
                <TanzakuCard poem={poem} still />
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
              className="mb-8 w-[22rem] bg-white p-4"
            >
              <p className="mb-3 text-center text-lg tracking-[0.35em]">
                {shirazuOwnerLabel(poem, myId) ?? "名無しの句"}
              </p>
              <TanzakuCard poem={poem} anonymous still viewerId={myId} />
            </div>
          ))}
      </div>

      {showActions && (
        <div className="flex w-full shrink-0 flex-col gap-2">
          {canRematch ? (
            <button
              type="button"
              onClick={onRematch}
              className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em] md:py-[clamp(0.75rem,2dvh,1rem)]"
            >
              {isSolo ? "もう一度詠む" : "再び宴を開く（もう一度）"}
            </button>
          ) : hostPresent ? (
            <p className="py-3 text-center text-sm tracking-widest text-black/45">
              亭主がもう一度開くのを待っています
            </p>
          ) : null}
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
        </div>
      )}

      {shareOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="句の画像"
          onClick={handleCloseShare}
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
