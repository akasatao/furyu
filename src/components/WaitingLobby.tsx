"use client";

import { MODE_LABEL, MODE_PATTERN } from "@/lib/constants";
import { describeParts } from "@/lib/roles";
import { toKanji } from "@/lib/utils";
import type { Player, VerseMode } from "@/types/game";

interface WaitingLobbyProps {
  roomCode: string;
  mode: VerseMode;
  players: Player[];
  myId: string;
  maxPlayers: number;
  isHost: boolean;
  busy?: boolean;
  onStart: () => void;
  onLeave: () => void;
}

export function WaitingLobby({
  roomCode,
  mode,
  players,
  myId,
  maxPlayers,
  isHost,
  busy = false,
  onStart,
  onLeave,
}: WaitingLobbyProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col gap-3 md:flex-none md:gap-5">
      <header className="shrink-0 space-y-1.5 text-center md:space-y-2">
        <p className="text-sm tracking-[0.3em] text-black/50">待機の間</p>
        <h2 className="text-2xl tracking-widest md:text-3xl">和室 {roomCode}</h2>
        <p className="text-sm tracking-wider text-black/55">
          {MODE_LABEL[mode]}（{MODE_PATTERN[mode]}）・{toKanji(players.length)}
          ／{toKanji(maxPlayers)}人
        </p>
        <p className="text-xs tracking-wider text-black/45">
          コードを共有して連衆を待っています
        </p>
      </header>

      <section className="brush-box flex min-h-0 flex-1 flex-col p-3 md:flex-none md:overflow-visible md:p-4">
        <h3 className="mb-2 shrink-0 border-b-2 border-black pb-2 text-sm tracking-widest text-black/70 md:mb-3">
          連衆と担当
        </h3>
        <ul className="min-h-0 space-y-2 overflow-y-auto md:overflow-visible">
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
                  {p.partIndexes.length > 0
                    ? describeParts(mode, p.partIndexes)
                    : "担当は開宴後に決まります"}
                  {p.id === myId ? "（あなた）" : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        disabled={!isHost || players.length < 1 || busy}
        onClick={onStart}
        className="brush-btn w-full shrink-0 px-4 py-3 text-base tracking-[0.25em] md:py-3.5"
      >
        {!isHost ? "亭主の開宴を待っています" : busy ? "開宴中…" : "開宴"}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={onLeave}
        className="shrink-0 text-sm tracking-widest text-black/50 underline-offset-4 hover:underline"
      >
        和室を出る
      </button>
    </div>
  );
}
