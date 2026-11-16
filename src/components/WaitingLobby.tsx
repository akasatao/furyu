"use client";

import { MODE_LABEL, MODE_PATTERN } from "@/lib/constants";
import { describeParts } from "@/lib/roles";
import { toKanji } from "@/lib/utils";
import type { Player, VerseMode } from "@/types/game";

interface WaitingLobbyProps {
  roomCode: string;
  mode: VerseMode;
  players: Player[];
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
}

export function WaitingLobby({
  roomCode,
  mode,
  players,
  isHost,
  onStart,
  onLeave,
}: WaitingLobbyProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header className="space-y-2 text-center">
        <p className="text-sm tracking-[0.3em] text-black/50">待機の間</p>
        <h2 className="text-3xl tracking-widest">和室 {roomCode}</h2>
        <p className="text-sm tracking-wider text-black/55">
          {MODE_LABEL[mode]}（{MODE_PATTERN[mode]}）・{toKanji(players.length)}人
        </p>
      </header>

      <section className="brush-box p-4">
        <h3 className="mb-3 border-b-2 border-black pb-2 text-sm tracking-widest text-black/70">
          連衆と担当
        </h3>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 border-2 border-black px-3 py-2.5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black bg-black text-sm text-white">
                {p.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {p.name}
                  {p.isHost && (
                    <span className="ml-2 border border-black px-1.5 py-0.5 text-[10px] tracking-widest">
                      亭主
                    </span>
                  )}
                </p>
                <p className="text-xs text-black/45">
                  {describeParts(mode, p.partIndexes)}
                  （あなた）
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        disabled={!isHost || players.length < 1}
        onClick={onStart}
        className="brush-btn w-full px-4 py-3.5 text-base tracking-[0.25em]"
      >
        開宴
      </button>

      <button
        type="button"
        onClick={onLeave}
        className="text-sm tracking-widest text-black/50 underline-offset-4 hover:underline"
      >
        和室を出る
      </button>
    </div>
  );
}
