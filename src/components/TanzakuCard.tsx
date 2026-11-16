"use client";

import { MODE_LABEL, PART_LABELS } from "@/lib/constants";
import type { Poem } from "@/types/game";

/** 一文字あたりの表示時間（全句で同じ速度） */
const MS_PER_CHAR = 160;
/** 句が出し終わってから次の句までの待ち */
const GAP_MS = 500;

interface TanzakuCardProps {
  poem: Poem;
  /** 詠み人知らず表示（個別作者を隠す） */
  anonymous?: boolean;
  /** 画像キャプチャ用：アニメなしで全句表示 */
  still?: boolean;
  /** false のあいだは短冊枠だけ出し、文字は隠したまま */
  writing?: boolean;
}

export function TanzakuCard({
  poem,
  anonymous = false,
  still = false,
  writing = true,
}: TanzakuCardProps) {
  const labels = PART_LABELS[poem.mode];
  const showAnonymous = anonymous || poem.mode === "shirazu";
  /** キャプチャ時は常に全文。それ以外は writing が立つまで文字ノードを出さない */
  const showText = still || writing;

  let delayMs = 0;
  const lineTimings = poem.lines.map((line) => {
    const chars = Math.max(1, [...(line?.text ?? "")].length);
    const durationMs = chars * MS_PER_CHAR;
    const timing = { delayMs, durationMs };
    delayMs += durationMs + GAP_MS;
    return timing;
  });

  return (
    <article className="tanzaku relative flex flex-col items-center px-3 py-5">
      <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
      <p className="mb-2 text-sm tracking-[0.35em] text-black/45 md:text-base">
        {still
          ? "風流オンライン"
          : MODE_LABEL[poem.mode === "shirazu" ? "haiku" : poem.mode]}
      </p>
      <div className="flex min-h-[220px] items-center justify-center py-3">
        {showText ? (
          <p
            key="writing"
            className="text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl]"
            lang="ja"
          >
            {poem.lines.map((line, i) => {
              const isLast = i === poem.lines.length - 1;
              const offset =
                i === 0 ? "" : isLast ? "mt-10" : "mt-4";
              return (
                <span
                  key={i}
                  className={`${still ? "" : "tanzaku-line "}${offset} block`.trim()}
                  style={
                    still
                      ? undefined
                      : {
                          animationDelay: `${lineTimings[i].delayMs}ms`,
                          animationDuration: `${lineTimings[i].durationMs}ms`,
                        }
                  }
                >
                  {line?.text ?? "？"}
                </span>
              );
            })}
          </p>
        ) : null}
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
