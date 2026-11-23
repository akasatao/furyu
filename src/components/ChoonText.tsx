import type { ReactNode } from "react";
import { isWaveDash, SHIRAZU_WAVE } from "@/lib/shirazu";

/** 伸ばし棒と波線。縦書きでは横倒しにする */
const SIDEWAYS_RE = /([ーｰ～〜∼])/u;

export function isChoonMark(text: string): boolean {
  return text === "ー" || text === "ｰ";
}

function needsSideways(text: string): boolean {
  return isChoonMark(text) || isWaveDash(text);
}

/**
 * 縦書きの「ー」「～」を縦にする。横書きの呼び出し元では使わない。
 * 文字データは変えない。
 */
export function ChoonText({ text }: { text: string }): ReactNode {
  if (!text || !SIDEWAYS_RE.test(text)) return text;
  SIDEWAYS_RE.lastIndex = 0;
  return text.split(SIDEWAYS_RE).map((part, i) => {
    if (!part) return null;
    if (!needsSideways(part)) return <span key={i}>{part}</span>;
    return (
      <span key={i} className="choon-v">
        {isChoonMark(part) ? "ー" : SHIRAZU_WAVE}
      </span>
    );
  });
}
