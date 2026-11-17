"use client";

import { MODE_LABEL, PART_LABELS } from "@/lib/constants";
import {
  SHIRAZU_LINE_TARGETS,
  splitShirazuLineIntoMoras,
} from "@/lib/shirazu";
import { shirazuOwnerLabel } from "@/lib/utils";
import type { Poem } from "@/types/game";

interface SpectatePhaseProps {
  poems: Poem[];
  theme?: string;
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

/** 提出済みの音は実字、空枠は〇 */
function ShirazuSlots({ text, target }: { text: string; target: number }) {
  const filled = splitShirazuLineIntoMoras(text);
  const count = Math.max(target, filled.length);
  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) slots.push(filled[i] ?? "〇");
  return (
    <>
      {slots.map((unit, i) => (
        <span key={i} className={unit === "〇" ? "text-black/30" : "text-black"}>
          {unit}
        </span>
      ))}
    </>
  );
}

function ShirazuGallery({ poems }: { poems: Poem[] }) {
  const dense = poems.length >= 5;
  const textClass = dense
    ? "text-[0.72rem] leading-[1.45] tracking-[0.08em]"
    : poems.length >= 4
      ? "text-[0.85rem] leading-[1.55] tracking-[0.12em] md:text-base"
      : "text-[1.05rem] leading-[1.75] tracking-[0.16em] md:text-[1.35rem] md:tracking-[0.22em]";

  return (
    <div
      className="grid w-full items-stretch gap-2 md:gap-3"
      style={{ gridTemplateColumns: `repeat(${Math.max(poems.length, 1)}, minmax(0, 1fr))` }}
    >
      {poems.map((poem) => {
        const owner = shirazuOwnerLabel(poem, null);
        return (
          <article key={poem.id} className="flex min-w-0 flex-col items-center gap-1.5">
            <p className="w-full truncate text-center text-[10px] tracking-widest text-black/55 md:text-xs">
              {owner ?? "句"}
            </p>
            <div className="tanzaku relative flex w-full flex-col items-center px-1 py-3 md:px-2 md:py-4">
              <div className="pointer-events-none absolute inset-x-2 top-0 h-1 bg-black" />
              <p className={`[writing-mode:vertical-rl] ${textClass}`} lang="ja">
                {SHIRAZU_LINE_TARGETS.map((target, i) => (
                  <span
                    key={i}
                    className={`${i === 0 ? "" : i === 2 ? "mt-6 md:mt-8" : "mt-2 md:mt-3"} block`}
                  >
                    <ShirazuSlots text={poem.lines[i]?.text ?? ""} target={target} />
                  </span>
                ))}
              </p>
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
  note = "",
  busy = false,
  onLeave,
}: SpectatePhaseProps) {
  const mode = poems[0]?.mode;
  const isShirazu = mode === "shirazu";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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
          {mode ? MODE_LABEL[mode] : "和室"}
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
        <ShirazuGallery poems={poems} />
      ) : (
        <LineCard poem={poems[0]} />
      )}
    </div>
  );
}
