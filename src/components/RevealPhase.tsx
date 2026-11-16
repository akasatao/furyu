"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateTanzakuWriteMs,
  TanzakuCard,
} from "@/components/TanzakuCard";
import { MODE_LABEL } from "@/lib/constants";
import { captureElementPng, downloadPngDataUrl } from "@/lib/export-tanzaku";
import { toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

/** 「○○の句」タイトルの表示時間 */
const OWNER_TITLE_MS = 1600;
/** 書き終わり後、次の首へ行くまでの間 */
const BETWEEN_POEMS_MS = 700;

type ShirazuRevealStage =
  | { kind: "title"; index: number }
  | { kind: "write"; index: number }
  | { kind: "gallery" };

interface RevealPhaseProps {
  poems: Poem[];
  onRematch: () => void;
  onHome: () => void;
  canRematch?: boolean;
  isSolo?: boolean;
  /** false のあいだは短冊枠のみ。true になってから文字の書き出し開始 */
  revealReady?: boolean;
}

export function RevealPhase({
  poems,
  onRematch,
  onHome,
  canRematch = true,
  isSolo = false,
  revealReady = false,
}: RevealPhaseProps) {
  const isShirazu = poems[0]?.mode === "shirazu";
  const captureRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [shirazuStage, setShirazuStage] = useState<ShirazuRevealStage | null>(
    null,
  );

  useEffect(() => {
    if (!isShirazu || !revealReady || poems.length === 0) {
      setShirazuStage(null);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const run = async () => {
      for (let i = 0; i < poems.length; i += 1) {
        if (cancelled) return;
        setShirazuStage({ kind: "title", index: i });
        await wait(OWNER_TITLE_MS);
        if (cancelled) return;
        setShirazuStage({ kind: "write", index: i });
        await wait(estimateTanzakuWriteMs(poems[i]) + BETWEEN_POEMS_MS);
      }
      if (cancelled) return;
      setShirazuStage({ kind: "gallery" });
    };

    void run();
    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
    };
  }, [isShirazu, revealReady, poems]);

  const handleOpenShare = useCallback(async () => {
    if (!captureRef.current || busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await new Promise((r) => window.setTimeout(r, 50));
      const url = await captureElementPng(captureRef.current);
      setPreviewUrl(url);
      setShareOpen(true);
    } catch {
      setErrorMessage("画像を作れませんでした。もう一度試してください。");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleSave = () => {
    if (!previewUrl) return;
    const label =
      MODE_LABEL[poems[0]?.mode === "shirazu" ? "haiku" : poems[0].mode];
    downloadPngDataUrl(previewUrl, `風流_${label}.png`);
  };

  const handleCloseShare = () => {
    setShareOpen(false);
  };

  const showActions = !isShirazu || shirazuStage?.kind === "gallery";

  const ownerTitle =
    isShirazu && shirazuStage?.kind === "title"
      ? `${poems[shirazuStage.index]?.ownerName ?? "名無し"}の句`
      : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col items-center gap-3 md:flex-none md:gap-5">
      <header className="shrink-0 space-y-1.5 text-center md:space-y-2">
        <p className="text-xs tracking-[0.35em] text-black/50">披露</p>
        <h2 className="text-xl tracking-widest md:text-3xl">
          {isShirazu
            ? shirazuStage?.kind === "gallery"
              ? `${MODE_LABEL.shirazu}・${toKanji(poems.length)}首が完成`
              : MODE_LABEL.shirazu
            : `${MODE_LABEL[poems[0].mode]}が完成`}
        </h2>
      </header>

      {isShirazu ? (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto md:flex-none md:overflow-visible">
          {ownerTitle && (
            <p className="flex flex-1 items-center justify-center text-2xl tracking-[0.35em] md:text-4xl">
              {ownerTitle}
            </p>
          )}

          {shirazuStage?.kind === "write" && (
            <div className="flex w-full max-w-[15rem] flex-1 flex-col justify-center">
              <TanzakuCard
                key={`write-${poems[shirazuStage.index]?.id}-${shirazuStage.index}`}
                poem={poems[shirazuStage.index]}
                anonymous
                writing
              />
            </div>
          )}

          {shirazuStage?.kind === "gallery" && (
            <div className="flex w-full flex-col items-center gap-4 md:gap-6">
              {poems.map((poem) => (
                <div key={poem.id} className="w-full max-w-[15rem] shrink-0">
                  <TanzakuCard poem={poem} anonymous still />
                </div>
              ))}
            </div>
          )}

          {!revealReady && (
            <div className="flex w-full flex-col items-center gap-4 md:gap-6">
              {poems.map((poem) => (
                <div key={poem.id} className="w-full max-w-[15rem] shrink-0">
                  <TanzakuCard poem={poem} anonymous writing={false} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex min-h-0 w-full flex-1 overflow-y-auto md:flex-none md:overflow-visible ${
            poems.length > 1
              ? "flex-col items-center gap-4 md:gap-6"
              : "max-w-[15rem] justify-center"
          }`}
        >
          {poems.map((poem) => (
            <div key={poem.id} className="w-full max-w-[15rem] shrink-0">
              <TanzakuCard poem={poem} writing={revealReady} />
            </div>
          ))}
        </div>
      )}

      {/* キャプチャ用：画面外の完成形短冊 */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 -left-[9999px] z-[-1] bg-white p-6"
      >
        <div
          ref={captureRef}
          className={`flex bg-white ${
            poems.length > 1
              ? "flex-col items-center gap-6"
              : "items-center justify-center"
          }`}
        >
          {poems.map((poem) => (
            <div key={`capture-${poem.id}`} className="w-[15rem]">
              <TanzakuCard poem={poem} anonymous={isShirazu} still />
            </div>
          ))}
        </div>
      </div>

      {showActions && (
        <div className="flex w-full shrink-0 flex-col gap-2">
          {canRematch ? (
            <button
              type="button"
              onClick={onRematch}
              className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em] md:py-3.5"
            >
              {isSolo ? "もう一度詠む" : "再び宴を開く（もう一度）"}
            </button>
          ) : (
            <p className="py-3 text-center text-sm tracking-widest text-black/45">
              亭主がもう一度開くのを待っています
            </p>
          )}
          <button
            type="button"
            onClick={onHome}
            className="brush-btn-outline w-full px-4 py-3 text-sm tracking-widest"
          >
            {isSolo ? "ホームへ戻る" : "玄関へ戻る"}
          </button>
          <button
            type="button"
            disabled={busy || (isShirazu && shirazuStage?.kind !== "gallery")}
            onClick={() => {
              void handleOpenShare();
            }}
            className="brush-btn-outline w-full px-4 py-2.5 text-xs tracking-widest text-black/55"
          >
            {busy ? "画像を用意中…" : "句をシェアする"}
          </button>
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
