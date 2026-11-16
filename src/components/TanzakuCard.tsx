"use client";

import { MODE_LABEL, PART_LABELS, PART_TARGETS } from "@/lib/constants";
import { formatShirazuLineWithSlots } from "@/lib/shirazu";
import type { Poem } from "@/types/game";

/** 一文字あたりの表示時間（全句で同じ速度） */
const MS_PER_CHAR = 160;
/** 句が出し終わってから次の句までの待ち */
const GAP_MS = 500;

interface TanzakuCardProps {
  poem: Poem;
  /** 匿名表示（個別作者を隠す）。リレーで owner がある場合は「○○の句」優先 */
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
  const isShirazu = poem.mode === "shirazu";
  const ownerLabel = poem.ownerName ? `${poem.ownerName}の句` : null;
  const showAnonymous = (anonymous || isShirazu) && !ownerLabel;
  /** キャプチャ時は常に全文。それ以外は writing が立つまで実字を出さない */
  const showText = still || writing;
  /** リレーの空枠は〇で音数を示す */
  const showShirazuSlots = isShirazu && !showText;

  let delayMs = 0;
  const lineTimings = poem.lines.map((line) => {
    const chars = Math.max(1, [...(line?.text ?? "")].length);
    const durationMs = chars * MS_PER_CHAR;
    const timing = { delayMs, durationMs };
    delayMs += durationMs + GAP_MS;
    return timing;
  });

  const totalWriteMs = delayMs;

  return (
    <article
      className="tanzaku relative flex flex-col items-center px-3 py-5"
      data-write-ms={still ? undefined : totalWriteMs}
    >
      <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
      {ownerLabel ? (
        <p className="absolute top-3 right-3 max-w-[7rem] text-right text-[10px] leading-snug tracking-wider text-black/55 md:text-xs">
          {ownerLabel}
        </p>
      ) : null}
      <p className="mb-2 text-sm tracking-[0.35em] text-black/45 md:text-base">
        {still
          ? "風流オンライン"
          : MODE_LABEL[isShirazu ? "haiku" : poem.mode]}
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
        ) : showShirazuSlots ? (
          <p
            key="slots"
            className="text-[1.35rem] leading-[2] tracking-[0.35em] text-black/35 [writing-mode:vertical-rl]"
            lang="ja"
          >
            {PART_TARGETS.shirazu.map((target, i) => {
              const isLast = i === PART_TARGETS.shirazu.length - 1;
              const offset =
                i === 0 ? "" : isLast ? "mt-10" : "mt-4";
              return (
                <span key={i} className={`${offset} block`.trim()}>
                  {formatShirazuLineWithSlots("", target)}
                </span>
              );
            })}
          </p>
        ) : null}
      </div>
      <p className="mt-1 max-w-[12rem] border-t-2 border-black pt-2 text-center text-[10px] leading-relaxed tracking-wider text-black/50">
        {ownerLabel ? (
          <span className="block">{ownerLabel}</span>
        ) : showAnonymous ? (
          <span className="block">{MODE_LABEL.shirazu}</span>
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

/** 短冊の書き出し完了までの目安ms */
export function estimateTanzakuWriteMs(poem: Poem): number {
  let delayMs = 0;
  for (const line of poem.lines) {
    const chars = Math.max(1, [...(line?.text ?? "")].length);
    delayMs += chars * MS_PER_CHAR + GAP_MS;
  }
  return delayMs;
}
