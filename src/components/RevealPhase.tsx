"use client";

import { useState } from "react";
import { TanzakuCard } from "@/components/TanzakuCard";
import { MODE_LABEL } from "@/lib/constants";
import { poemsShareText, toKanji } from "@/lib/utils";
import type { Poem } from "@/types/game";

interface RevealPhaseProps {
  poems: Poem[];
  onRematch: () => void;
  onHome: () => void;
}

export function RevealPhase({ poems, onRematch, onHome }: RevealPhaseProps) {
  const [copied, setCopied] = useState(false);
  const isShirazu = poems[0]?.mode === "shirazu";

  const handleShare = async () => {
    const text = poemsShareText(poems);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("書き写してシェアしてください", text);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5">
      <header className="space-y-2 text-center">
        <p className="text-xs tracking-[0.35em] text-black/50">披露</p>
        <h2 className="text-2xl tracking-widest sm:text-3xl">
          {isShirazu
            ? `${MODE_LABEL.shirazu}・${toKanji(poems.length)}首が完成`
            : `${MODE_LABEL[poems[0].mode]}が完成`}
        </h2>
      </header>

      <div
        className={`flex w-full ${
          poems.length > 1
            ? "flex-col items-center gap-6"
            : "max-w-[15rem] justify-center"
        }`}
      >
        {poems.map((poem, i) => (
          <div key={poem.id} className="w-full max-w-[15rem]">
            {isShirazu && poems.length > 1 && (
              <p className="mb-2 text-center text-xs tracking-[0.3em] text-black/45">
                第{toKanji(i + 1)}首
              </p>
            )}
            <TanzakuCard poem={poem} anonymous={isShirazu} />
          </div>
        ))}
      </div>

      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={handleShare}
          className="brush-btn w-full px-4 py-3 text-sm tracking-widest"
        >
          {copied ? "書き写し済み" : "句をコピー（シェア）"}
        </button>
        <button
          type="button"
          onClick={onRematch}
          className="brush-btn w-full px-4 py-3.5 text-base tracking-[0.25em]"
        >
          再び宴を開く（もう一度）
        </button>
        <button
          type="button"
          onClick={onHome}
          className="brush-btn-outline w-full px-4 py-3 text-sm tracking-widest"
        >
          玄関へ戻る
        </button>
      </div>
    </div>
  );
}
