"use client";

import { ShirazuLineSlots } from "@/components/ShirazuLineSlots";
import { MODE_LABEL, PART_LABELS, PART_TARGETS } from "@/lib/constants";
import { shirazuOwnerLabel } from "@/lib/utils";
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
  /** 閲覧者。自分の句なら「あなたの句」 */
  viewerId?: string | null;
}

export function TanzakuCard({
  poem,
  anonymous = false,
  still = false,
  writing = true,
  viewerId = null,
}: TanzakuCardProps) {
  const labels = PART_LABELS[poem.mode];
  const isShirazu = poem.mode === "shirazu";
  const free = isShirazu && poem.shirazuStyle === "free";
  const ownerLabel = shirazuOwnerLabel(poem, viewerId);
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

  const ownerCornerClass =
    "pointer-events-none absolute text-[10px] leading-relaxed tracking-[0.2em] text-black/55 [writing-mode:vertical-rl] md:text-[clamp(0.65rem,1.6dvh,0.875rem)] md:tracking-[0.25em]";

  return (
    <article
      className="tanzaku relative flex w-full max-w-[15rem] flex-col items-center px-3 py-5 md:max-w-[min(22rem,42dvh)] md:px-5 md:py-[clamp(1rem,3dvh,2rem)]"
      data-write-ms={still ? undefined : totalWriteMs}
    >
      <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
      {ownerLabel ? (
        <>
          <p className={`${ownerCornerClass} top-3 right-2 md:top-4 md:right-3`}>
            {ownerLabel}
          </p>
          <p
            className={`${ownerCornerClass} bottom-3 left-2 md:bottom-4 md:left-3`}
          >
            {ownerLabel}
          </p>
        </>
      ) : (
        <p className="mb-2 text-sm tracking-[0.35em] text-black/45 md:mb-[clamp(0.5rem,1.5dvh,1rem)] md:text-[clamp(0.875rem,2.5dvh,1.25rem)]">
          {still
            ? "風流オンライン"
            : MODE_LABEL[isShirazu ? "haiku" : poem.mode]}
        </p>
      )}
      <div className="flex min-h-[220px] items-center justify-center py-3 md:min-h-[clamp(220px,42dvh,340px)] md:py-[clamp(0.75rem,2dvh,1.25rem)]">
        {showText ? (
          <p
            key="writing"
            className="text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl] md:text-[clamp(1.35rem,3.2dvh,2rem)] md:leading-[2.15] md:tracking-[0.4em]"
            lang="ja"
          >
            {poem.lines.map((line, i) => {
              const isLast = i === poem.lines.length - 1;
              const offset =
                i === 0
                  ? ""
                  : isLast
                    ? "mt-10 md:mt-[clamp(1.5rem,4dvh,3.5rem)]"
                    : "mt-4 md:mt-[clamp(0.75rem,2dvh,1.5rem)]";
              const target = PART_TARGETS.shirazu[i] ?? 5;
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
                  {isShirazu ? (
                    <ShirazuLineSlots
                      line={line}
                      target={target}
                      free={free}
                      dimEmpty={false}
                    />
                  ) : (
                    (line?.text ?? "？")
                  )}
                </span>
              );
            })}
          </p>
        ) : showShirazuSlots ? (
          <p
            key="slots"
            className="text-[1.35rem] leading-[2] tracking-[0.35em] text-black/35 [writing-mode:vertical-rl] md:text-[clamp(1.35rem,3.2dvh,2rem)] md:leading-[2.15] md:tracking-[0.4em]"
            lang="ja"
          >
            {PART_TARGETS.shirazu.map((target, i) => {
              const isLast = i === PART_TARGETS.shirazu.length - 1;
              const offset =
                i === 0
                  ? ""
                  : isLast
                    ? "mt-10 md:mt-[clamp(1.5rem,4dvh,3.5rem)]"
                    : "mt-4 md:mt-[clamp(0.75rem,2dvh,1.5rem)]";
              return (
                <span key={i} className={`${offset} block`.trim()}>
                  <ShirazuLineSlots
                    line={null}
                    target={target}
                    free={free}
                  />
                </span>
              );
            })}
          </p>
        ) : null}
      </div>
      {!ownerLabel && (
        <p className="mt-1 max-w-[12rem] border-t-2 border-black pt-2 text-center text-[10px] leading-relaxed tracking-wider text-black/50 md:mt-[clamp(0.25rem,1dvh,0.5rem)] md:max-w-[18rem] md:pt-[clamp(0.5rem,1.5dvh,0.75rem)] md:text-[clamp(0.65rem,1.5dvh,0.875rem)]">
          {showAnonymous ? (
            <span className="block">{MODE_LABEL.shirazu}</span>
          ) : (
            poem.lines.map((line, i) => (
              <span key={i} className="block">
                {labels[i]}：{line?.authorName ?? "—"}
              </span>
            ))
          )}
        </p>
      )}
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
