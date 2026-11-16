"use client";

import { useCallback, useRef, useState } from "react";
import { TanzakuCard } from "@/components/TanzakuCard";
import { MODE_LABEL } from "@/lib/constants";
import { captureElementPng, downloadPngDataUrl } from "@/lib/export-tanzaku";
import { toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

interface RevealPhaseProps {
  poems: Poem[];
  onRematch: () => void;
  onHome: () => void;
  canRematch?: boolean;
}

export function RevealPhase({
  poems,
  onRematch,
  onHome,
  canRematch = true,
}: RevealPhaseProps) {
  const isShirazu = poems[0]?.mode === "shirazu";
  const captureRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleOpenShare = useCallback(async () => {
    if (!captureRef.current || busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      // フォント・レイアウトが落ち着くのを少し待つ
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
    const label = MODE_LABEL[poems[0]?.mode === "shirazu" ? "haiku" : poems[0].mode];
    downloadPngDataUrl(previewUrl, `風流_${label}.png`);
  };

  const handleCloseShare = () => {
    setShareOpen(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col items-center gap-3 md:flex-none md:gap-5">
      <header className="shrink-0 space-y-1.5 text-center md:space-y-2">
        <p className="text-xs tracking-[0.35em] text-black/50">披露</p>
        <h2 className="text-xl tracking-widest md:text-3xl">
          {isShirazu
            ? `${MODE_LABEL.shirazu}・${toKanji(poems.length)}首が完成`
            : `${MODE_LABEL[poems[0].mode]}が完成`}
        </h2>
      </header>

      <div
        className={`flex min-h-0 w-full flex-1 overflow-y-auto md:flex-none md:overflow-visible ${
          poems.length > 1
            ? "flex-col items-center gap-4 md:gap-6"
            : "max-w-[15rem] justify-center"
        }`}
      >
        {poems.map((poem, i) => (
          <div key={poem.id} className="w-full max-w-[15rem] shrink-0">
            {isShirazu && poems.length > 1 && (
              <p className="mb-2 text-center text-xs tracking-[0.3em] text-black/45">
                第{toKanji(i + 1)}首
              </p>
            )}
            <TanzakuCard poem={poem} anonymous={isShirazu} />
          </div>
        ))}
      </div>

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
          {poems.map((poem, i) => (
            <div key={`capture-${poem.id}`} className="w-[15rem]">
              {isShirazu && poems.length > 1 && (
                <p className="mb-2 text-center text-xs tracking-[0.3em] text-black/45">
                  第{toKanji(i + 1)}首
                </p>
              )}
              <TanzakuCard poem={poem} anonymous={isShirazu} still />
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-2">
        {canRematch ? (
          <button
            type="button"
            onClick={onRematch}
            className="brush-btn w-full px-4 py-3 text-base tracking-[0.25em] md:py-3.5"
          >
            再び宴を開く（もう一度）
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
          玄関へ戻る
        </button>
        <button
          type="button"
          disabled={busy}
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
