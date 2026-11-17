"use client";

import { useState } from "react";
import { StampGlyph } from "@/components/StampGlyph";
import { STAMP_IDS, STAMP_LABEL, type StampId } from "@/lib/stamps";

interface StampPickerProps {
  onSelect: (stamp: StampId) => void;
}

/** 披露中の右下スタンプボタン。押すとトレイが開き、開いているあいだは連打できる */
export function StampPicker({ onSelect }: StampPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <div
          aria-hidden
          className="fixed inset-0 z-[58]"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="fixed right-3 bottom-3 z-[60] flex flex-col items-end gap-2 md:right-4 md:bottom-4">
        {open ? (
          <div
            role="menu"
            aria-label="スタンプを選ぶ"
            className="flex flex-col items-center gap-2 border-2 border-black bg-white p-2 shadow-[2px_2px_0_#000]"
          >
            {STAMP_IDS.map((stamp) => (
              <button
                key={stamp}
                type="button"
                role="menuitem"
                aria-label={STAMP_LABEL[stamp]}
                onClick={() => onSelect(stamp)}
                className="flex h-14 w-14 touch-manipulation items-center justify-center transition-transform select-none hover:bg-black/5 active:scale-90"
              >
                <StampGlyph stamp={stamp} small />
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          aria-label="スタンプ"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-black text-lg shadow-[2px_2px_0_#000] md:h-12 md:w-12 ${
            open ? "bg-black text-white" : "bg-white text-black"
          }`}
        >
          印
        </button>
      </div>
    </>
  );
}
