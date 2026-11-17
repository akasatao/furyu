"use client";

import type { StampId } from "@/lib/stamps";

interface StampGlyphProps {
  stamp: StampId;
  /** トレイ用の小さめ表示 */
  small?: boolean;
}

/** スタンプ本体。👍👎は絵文字、風流は縦書きの判子風 */
export function StampGlyph({ stamp, small = false }: StampGlyphProps) {
  if (stamp === "furyu") {
    return (
      <span
        className={`inline-flex items-center justify-center border-2 border-black bg-white leading-none tracking-[0.1em] text-black shadow-[2px_2px_0_#000] [writing-mode:vertical-rl] ${
          small ? "px-1 py-1.5 text-base" : "px-1.5 py-2.5 text-2xl md:text-3xl"
        }`}
        style={{ borderRadius: "3px 6px 4px 5px / 5px 3px 6px 4px" }}
      >
        風流
      </span>
    );
  }

  return (
    <span
      className={`inline-block leading-none ${
        small ? "text-2xl" : "text-4xl md:text-5xl"
      }`}
    >
      {stamp === "good" ? "👍" : "👎"}
    </span>
  );
}
