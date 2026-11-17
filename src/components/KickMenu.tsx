"use client";

import { useState } from "react";
import type { Player } from "@/types/game";

interface KickMenuProps {
  players: Player[];
  spectators?: Player[];
  myId: string;
  busy?: boolean;
  onKick: (playerId: string) => void;
  /** 亭主が和室を閉じる（全員が元の画面へ戻る） */
  onCloseRoom: () => void;
}

type RosterEntry = { player: Player; watching: boolean };

/** 執筆中、亭主だけが開ける連衆・観戦一覧（破門する） */
export function KickMenu({
  players,
  spectators = [],
  myId,
  busy = false,
  onKick,
  onCloseRoom,
}: KickMenuProps) {
  const [open, setOpen] = useState(false);
  const others: RosterEntry[] = [
    ...players
      .filter((p) => p.id !== myId)
      .map((player) => ({ player, watching: false })),
    ...spectators
      .filter((p) => p.id !== myId)
      .map((player) => ({ player, watching: true })),
  ];

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
                {others.map(({ player: p, watching }) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-2 border-black px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <p className="min-w-0 truncate">{p.name}</p>
                      {watching ? (
                        <span className="shrink-0 border border-black px-1.5 py-0.5 text-[10px] leading-none tracking-widest">
                          観戦
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`${p.name}さんを破門にしますか？`)) {
                          onKick(p.id);
                          setOpen(false);
                        }
                      }}
                      className="shrink-0 border border-black px-2 py-1 text-xs tracking-widest hover:bg-black hover:text-white disabled:opacity-40"
                    >
                      破門
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("和室を閉じますか？ 全員が退出します。")) {
                  setOpen(false);
                  onCloseRoom();
                }
              }}
              className="brush-btn mt-4 w-full px-4 py-2.5 text-sm tracking-[0.3em]"
            >
              和室を閉じる
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full text-sm tracking-widest text-black/50 underline-offset-4 hover:underline"
            >
              閉じる
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
