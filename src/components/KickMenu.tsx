"use client";

import { useState } from "react";
import type { Player } from "@/types/game";

interface KickMenuProps {
  players: Player[];
  myId: string;
  busy?: boolean;
  onKick: (playerId: string) => void;
}

/** 執筆中、亭主だけが開ける連衆一覧（退出させる） */
export function KickMenu({ players, myId, busy = false, onKick }: KickMenuProps) {
  const [open, setOpen] = useState(false);
  const others = players.filter((p) => p.id !== myId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 bottom-3 z-[60] border-2 border-black bg-white px-3 py-1.5 text-xs tracking-widest md:right-4 md:bottom-4 md:text-sm"
      >
        連衆
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <section
            className="brush-box w-full max-w-sm bg-white p-4 md:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 border-b-2 border-black pb-2 text-sm tracking-widest text-black/70 md:text-base">
              連衆
            </h3>
            {others.length === 0 ? (
              <p className="py-3 text-center text-sm tracking-widest text-black/55">
                ほかの連衆はいません
              </p>
            ) : (
              <ul className="space-y-2">
                {others.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-2 border-black px-3 py-2"
                  >
                    <p className="min-w-0 flex-1 truncate">{p.name}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`${p.name}さんを退出させますか？`)) {
                          onKick(p.id);
                          setOpen(false);
                        }
                      }}
                      className="shrink-0 border border-black px-2 py-1 text-xs tracking-widest hover:bg-black hover:text-white disabled:opacity-40"
                    >
                      退出させる
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full text-sm tracking-widest text-black/50 underline-offset-4 hover:underline"
            >
              閉じる
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
