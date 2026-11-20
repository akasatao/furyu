"use client";

import { ShirazuLineSlots } from "@/components/ShirazuLineSlots";
import { MODE_LABEL, PART_LABELS, roomModeLabel } from "@/lib/constants";
import { SHIRAZU_LINE_TARGETS } from "@/lib/shirazu";
import { shirazuOwnerLabel } from "@/lib/utils";
import type { Poem, ShirazuStyle } from "@/types/game";

interface SpectatePhaseProps {
  poems: Poem[];
  theme?: string;
  shirazuStyle?: ShirazuStyle;
  /** 見出し用。観戦は雲隠れでも書いた句をそのまま見る */
  kumoGakure?: boolean;
  /** 俳句・短歌で、いま書いている人 */
  note?: string;
  busy?: boolean;
  onLeave: () => void;
}

function lineGap(index: number, last: number): string {
  if (index === 0) return "";
  if (index === last) return "mt-8";
  return "mt-3";
}

function ShirazuGallery({
  poems,
  free,
}: {
  poems: Poem[];
  free: boolean;
}) {
  // スマホは横2枚、PCは横3枚。1枚は執筆の短冊幅（22rem）まで。端数は中央。
  const textClass = free
    ? "text-[1.15rem] leading-none tracking-normal md:text-[1.35rem]"
    : "text-[1.05rem] leading-[1.75] tracking-[0.16em] md:text-[1.35rem] md:tracking-[0.22em]";
  const single = poems.length <= 1;

  return (
    <div
      className={`mx-auto flex w-full flex-wrap justify-center ${
        single
          ? "max-w-[15rem] md:max-w-[min(22rem,42dvh)]"
          : "max-w-[34rem] gap-x-2 gap-y-5 md:max-w-[68rem] md:gap-x-4 md:gap-y-8"
      }`}
    >
      {poems.map((poem) => {
        const owner = shirazuOwnerLabel(poem, null);
        const poemFree = free || poem.shirazuStyle === "free";
        return (
          <article
            key={poem.id}
            className={`flex min-w-0 flex-col items-center gap-1.5 ${
              single
                ? "w-full"
                : "w-[calc(50%-0.25rem)] md:w-[calc((100%-2rem)/3)]"
            }`}
          >
            <p className="w-full truncate text-center text-[10px] tracking-widest text-black/55 md:text-xs">
              {owner ?? "句"}
            </p>
            <div className="tanzaku relative flex w-full flex-col items-center px-1 py-3 md:px-2 md:py-4">
              <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
              <div className={`[writing-mode:vertical-rl] ${textClass}`} lang="ja">
                {SHIRAZU_LINE_TARGETS.map((target, i) => (
                  <span
                    key={i}
                    className={`${
                      i === 0
                        ? ""
                        : poemFree
                          ? i === 2
                            ? "mt-6 mr-3 md:mt-8 md:mr-4"
                            : "mt-2 mr-2.5 md:mt-3 md:mr-3"
                          : i === 2
                            ? "mt-6 md:mt-8"
                            : "mt-2 md:mt-3"
                    } block`}
                  >
                    <ShirazuLineSlots
                      line={poem.lines[i]}
                      target={target}
                      free={poemFree}
                    />
                  </span>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function LineCard({ poem }: { poem: Poem }) {
  const labels = PART_LABELS[poem.mode];
  return (
    <article className="tanzaku relative mx-auto flex w-full max-w-[15rem] flex-col items-center px-3 py-5 md:max-w-[min(22rem,42dvh)] md:px-5 md:py-8">
      <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
      <p className="mb-2 text-sm tracking-[0.35em] text-black/45">
        {MODE_LABEL[poem.mode]}
      </p>
      <p
        className="text-[1.35rem] leading-[2] tracking-[0.35em] [writing-mode:vertical-rl] md:text-[clamp(1.35rem,3.2dvh,2rem)]"
        lang="ja"
      >
        {poem.lines.map((line, i) => (
          <span
            key={labels[i] ?? i}
            className={`${lineGap(i, poem.lines.length - 1)} block min-h-[1em]`}
          >
            {line?.text ? (
              line.text
            ) : (
              <span className="text-black/25">……</span>
            )}
          </span>
        ))}
      </p>
    </article>
  );
}

/** 制作中の観戦。リレーは短冊を並べ、俳句・短歌は一首を読むだけ */
export function SpectatePhase({
  poems,
  theme = "",
  shirazuStyle = "strict",
  kumoGakure = false,
  note = "",
  busy = false,
  onLeave,
}: SpectatePhaseProps) {
  const mode = poems[0]?.mode;
  const isShirazu = mode === "shirazu";
  const free = shirazuStyle === "free";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          disabled={busy}
          onClick={onLeave}
          className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
        >
          和室を出る
        </button>
        <p className="text-sm tracking-[0.3em] text-black/50">観戦</p>
        <span className="w-16" aria-hidden />
      </div>

      <header className="space-y-1 text-center">
        <h2 className="text-2xl tracking-[0.3em] md:text-4xl">
          {mode ? roomModeLabel(mode, shirazuStyle, kumoGakure) : "和室"}
        </h2>
        {theme.trim() ? (
          <p className="text-sm tracking-[0.2em] text-black/60">
            お題：{theme.trim()}
          </p>
        ) : null}
        {note ? (
          <p className="text-sm tracking-widest text-black/50">{note}</p>
        ) : null}
      </header>

      {poems.length === 0 ? (
        <p className="py-8 text-center text-sm tracking-widest text-black/45">
          短冊を待っています
        </p>
      ) : isShirazu ? (
        <ShirazuGallery poems={poems} free={free} />
      ) : (
        <LineCard poem={poems[0]} />
      )}
    </div>
  );
}
