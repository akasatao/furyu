"use client";

import { useState } from "react";
import { FitSlot } from "@/components/FitSlot";
import { TextPeekDialog } from "@/components/TextPeekDialog";

interface FreeSlotPeekProps {
  text: string;
  empty?: boolean;
  dimEmpty?: boolean;
}

/**
 * 自由律の1枠。長い文字列は斜め縮小表示し、タップで全文を読める。
 */
export function FreeSlotPeek({
  text,
  empty = false,
  dimEmpty = true,
}: FreeSlotPeekProps) {
  const [open, setOpen] = useState(false);

  if (empty) {
    return (
      <span className="relative box-border block h-[1.35em] w-[1.35em] shrink-0 overflow-hidden">
        <FitSlot
          text={text}
          empty
          minFontPx={9}
          className={dimEmpty ? "text-black/35" : "text-black"}
        />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="relative box-border block h-[1.35em] w-[1.35em] shrink-0 cursor-pointer overflow-hidden border-0 bg-transparent p-0"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`枠を読む：${text}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="pointer-events-none absolute inset-0">
          <FitSlot text={text} minFontPx={9} className="text-black" />
        </span>
      </button>
      <TextPeekDialog
        text={text}
        open={open}
        onClose={() => setOpen(false)}
        label={text}
      />
    </>
  );
}
