"use client";

import { MODE_LABEL, PART_LABELS } from "@/lib/constants";
import type { Poem } from "@/types/game";

interface TanzakuCardProps {
  poem: Poem;
  /** 詠み人知らず表示（個別作者を隠す） */
  anonymous?: boolean;
}

export function TanzakuCard({ poem, anonymous = false }: TanzakuCardProps) {
  const labels = PART_LABELS[poem.mode];
  const showAnonymous = anonymous || poem.mode === "shirazu";

  return (
    <article className="tanzaku relative flex flex-col items-center px-3 py-5">
      <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
      <p className="mb-2 text-[10px] tracking-[0.3em] text-black/45">
        {MODE_LABEL[poem.mode === "shirazu" ? "haiku" : poem.mode]}
      </p>
      <div className="flex min-h-[220px] items-center justify-center py-3">
        <p
          className="text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl]"
          lang="ja"
        >
          {poem.lines.map((line, i) => (
            <span
              key={i}
              className={i === 0 ? "tanzaku-line block" : "tanzaku-line mt-4 block"}
              style={{ animationDelay: `${i * 1300}ms` }}
            >
              {line?.text ?? "？"}
            </span>
          ))}
        </p>
      </div>
      <p className="mt-1 max-w-[12rem] border-t-2 border-black pt-2 text-center text-[10px] leading-relaxed tracking-wider text-black/50">
        {showAnonymous ? (
          <span className="block">詠み人知らず</span>
        ) : (
          poem.lines.map((line, i) => (
            <span key={i} className="block">
              {labels[i]}：{line?.authorName ?? "—"}
            </span>
          ))
        )}
      </p>
    </article>
  );
}
