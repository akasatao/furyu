"use client";

import { useLayoutEffect, useRef } from "react";
import { isChoonMark } from "@/components/ChoonText";
import { isWaveDash, SHIRAZU_WAVE } from "@/lib/shirazu";

interface FitSlotProps {
  text: string;
  className?: string;
  /** これより小さくしない（px） */
  minFontPx?: number;
  /** 空枠（〇）など縮小しない表示 */
  empty?: boolean;
}

/** ひらがな・カタカナ（小書き含む） */
const KANA_CHAR =
  /^[\u3041-\u3096\u30A1-\u30FA\u31F0-\u31FF\uFF66-\uFF9D]$/u;
/** 小書き。枠いっぱいに置くと普通の仮名と見分けにくいので、少しだけ縮める */
const SMALL_KANA =
  /^[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶｧｨｩｪｫｯｬｭｮ]$/u;
const SMALL_KANA_SCALE = 0.88;
/** 単独の濁点。結合文字に揃えて一文字として置く */
const DAKUTEN_CHAR = /^[\u3099\u309B\uFF9E]$/u;

type SlotChar = { text: string; mark: boolean };

/**
 * 仮名の直後の濁点は、その仮名に付ける。
 * 結合文字にするとデスクトップで字体が替わり点が消えるので、字形は仮名のまま。
 * 「あ゛い」は「あ゛」「い」の2つ、「あい゛」は「あ」「い゛」の2つになる。
 */
function slotChars(text: string): SlotChar[] {
  const raw = [...text];
  const out: SlotChar[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    const next = raw[i + 1];
    if (next && KANA_CHAR.test(ch) && DAKUTEN_CHAR.test(next)) {
      out.push({ text: ch, mark: true });
      i += 1;
      continue;
    }
    out.push({ text: ch, mark: false });
  }
  return out;
}

function isSmallKana(ch: string): boolean {
  const base = [...ch][0] ?? "";
  return SMALL_KANA.test(base);
}

/**
 * 1枠に文字列を収める。
 * - 1文字: 中央
 * - 2文字以上: 左斜め上→右斜め下、入りきらなければ font-size を下げる
 * 親は横書きの正方形セルを想定。
 */
export function FitSlot({
  text,
  className = "",
  minFontPx = 8,
  empty = false,
}: FitSlotProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const chars = slotChars(text);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || empty) return;

    const fit = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return;

      const n = Math.max(chars.length, 1);
      const cell = Math.min(width, height);

      if (n === 2 || n === 3) {
        // 斜め2〜3文字。少し小さめにして窮屈さを避ける
        const inset = 0.18;
        const usable = cell * Math.SQRT2 * (1 - inset * 2);
        const spaced = usable / ((n - 1) * 1.08);
        const size = Math.max(minFontPx, Math.min(cell * 0.36, spaced));
        el.style.fontSize = `${size}px`;
        return;
      }

      const inset = n === 1 ? 0.5 : 0.12;
      const usable = cell * Math.SQRT2 * (n === 1 ? 1 : 1 - inset * 2);
      // 文字同士が軽く触れ合う程度まで大きく取る
      const spaced =
        n === 1
          ? cell * 0.82
          : usable / Math.max(1, (n - 1) * 0.78);
      const size = Math.max(minFontPx, Math.min(cell * 0.85, spaced));
      el.style.fontSize = `${size}px`;
    };

    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, minFontPx, empty, chars.length]);

  if (empty || chars.length === 0) {
    return (
      <span
        ref={ref}
        className={`flex h-full w-full items-center justify-center overflow-hidden text-[1.05em] leading-none [writing-mode:horizontal-tb] ${className}`}
      >
        {text || "〇"}
      </span>
    );
  }

  const last = Math.max(chars.length - 1, 1);
  const inset =
    chars.length === 1
      ? 0.5
      : chars.length === 2 || chars.length === 3
        ? 0.18
        : 0.12;

  return (
    <span
      ref={ref}
      className={`relative block h-full w-full overflow-hidden leading-none [writing-mode:horizontal-tb] ${className}`}
    >
      {chars.map((ch, i) => {
        const t =
          chars.length === 1 ? inset : inset + (i / last) * (1 - inset * 2);
        const small = isSmallKana(ch.text);
        const choon = isChoonMark(ch.text);
        const wave = isWaveDash(ch.text);
        const sideways = choon || wave;
        // 斜めの小さい文字では、点を仮名の右上まで上げる
        const markTop =
          chars.length === 2 || chars.length === 3 ? "-0.04em" : "-0.02em";
        return (
          <span
            key={`${i}-${ch.text}-${ch.mark ? "d" : "p"}`}
            className={`absolute whitespace-nowrap ${small || sideways ? "" : "-translate-x-1/2 -translate-y-1/2"}`}
            style={{
              left: `${t * 100}%`,
              top: `${t * 100}%`,
              transform: sideways
                ? "translate(-50%, -50%) rotate(90deg)"
                : small
                  ? `translate(-50%, -50%) scale(${SMALL_KANA_SCALE})`
                  : undefined,
            }}
          >
            {choon ? "ー" : wave ? SHIRAZU_WAVE : ch.text}
            {ch.mark ? (
              chars.length === 1 ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute overflow-hidden leading-none"
                  style={{
                    left: "0.56em",
                    top: "0.02em",
                    width: "0.40em",
                    height: "0.32em",
                  }}
                >
                  <span
                    className="absolute leading-none"
                    style={{ left: "-0.14em", top: "-0.10em" }}
                  >
                    {"\u309B"}
                  </span>
                </span>
              ) : (
                <span
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    left: "0.55em",
                    top: markTop,
                    width: "0.36em",
                    height: "0.26em",
                  }}
                >
                  <span
                    className="absolute rounded-full"
                    style={{
                      left: 0,
                      top: "32%",
                      width: "0.15em",
                      height: "0.15em",
                      background: "currentColor",
                    }}
                  />
                  <span
                    className="absolute rounded-full"
                    style={{
                      right: 0,
                      top: 0,
                      width: "0.15em",
                      height: "0.15em",
                      background: "currentColor",
                    }}
                  />
                </span>
              )
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
