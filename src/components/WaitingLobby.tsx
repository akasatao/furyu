"use client";

import { MODE_LABEL, ONLINE_MIN_PLAYERS } from "@/lib/constants";
import { toKanji } from "@/lib/utils";
import type { Player, VerseMode } from "@/types/game";

interface WaitingLobbyProps {
  roomCode: string;
  mode: VerseMode;
  theme?: string;
  players: Player[];
  myId: string;
  maxPlayers: number;
  isHost: boolean;
  busy?: boolean;
  onStart: () => void;
  /** ひとつ前の画面へ（部屋は退出） */
  onBack: () => void;
  /** ホームのモード選択へ */
  onLeave: () => void;
}

export function WaitingLobby({
  roomCode,
  mode,
  theme = "",
  players,
  myId,
  maxPlayers,
  isHost,
  busy = false,
  onStart,
  onBack,
  onLeave,
}: WaitingLobbyProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 md:max-w-xl md:gap-5">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
        >
          ← 戻る
        </button>
        <p className="text-sm tracking-[0.3em] text-black/50">待機の間</p>
        <span className="w-12" aria-hidden />
      </div>

      <header className="shrink-0 space-y-1.5 text-center">
        <h2 className="text-2xl tracking-widest md:text-4xl">
          和室 {roomCode}
        </h2>
        <p className="text-sm tracking-wider text-black/55">
          {MODE_LABEL[mode]}・{toKanji(players.length)}／{toKanji(maxPlayers)}人
        </p>
        {theme.trim() ? (
          <p className="text-base tracking-[0.2em] text-black/70">
            お題：{theme.trim()}
          </p>
        ) : null}
      </header>

      <section className="brush-box p-3 md:p-5">
        <h3 className="mb-2 border-b-2 border-black pb-2 text-sm tracking-widest text-black/70 md:mb-3 md:text-base">
          連衆
        </h3>
        <ul className="space-y-2 md:space-y-3">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 border-2 border-black px-3 py-2.5 md:px-4 md:py-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black bg-black text-sm text-white md:h-11 md:w-11 md:text-base">
                {p.name.slice(0, 1)}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="min-w-0 truncate md:text-lg">{p.name}</p>
                {p.isHost && (
                  <span className="shrink-0 border border-black px-1.5 py-0.5 text-[10px] leading-none tracking-widest">
                    亭主
                  </span>
                )}
                {p.id === myId ? (
                  <span className="shrink-0 text-xs text-black/45">（あなた）</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        disabled={!isHost || players.length < ONLINE_MIN_PLAYERS || busy}
        onClick={onStart}
        className="brush-btn w-full shrink-0 px-4 py-3 text-base tracking-[0.25em] md:py-4 md:text-lg"
      >
        {!isHost
          ? "亭主の開宴を待っています"
          : busy
            ? "開宴中…"
            : players.length < ONLINE_MIN_PLAYERS
              ? "連衆を待っています"
              : "開宴"}
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
