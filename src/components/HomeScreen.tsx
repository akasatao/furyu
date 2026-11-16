"use client";

import { useState } from "react";
import { MODE_LABEL, PLAYER_COUNT_RANGE } from "@/lib/constants";
import { toKanji } from "@/lib/utils";
import type { VerseMode } from "@/types/game";

interface HomeScreenProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  mode: VerseMode;
  playerCount: number;
  onModeChange: (mode: VerseMode) => void;
  onPlayerCountChange: (count: number) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  busy?: boolean;
}

export function HomeScreen({
  nickname,
  onNicknameChange,
  mode,
  playerCount,
  onModeChange,
  onPlayerCountChange,
  onCreateRoom,
  onJoinRoom,
  busy = false,
}: HomeScreenProps) {
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const range = PLAYER_COUNT_RANGE[mode];
  const counts = Array.from(
    { length: range.max - range.min + 1 },
    (_, i) => range.min + i,
  );

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError("ルームコードを4文字入力してください");
      return;
    }
    setJoinError("");
    onJoinRoom(code);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header className="space-y-3 text-center">
        <hr className="brush-line mx-auto w-14" />
        <h1 className="text-4xl tracking-[0.2em] sm:text-5xl">
          風流
          <span className="mt-1 block text-lg tracking-[0.35em] text-black/55 sm:text-xl">
            オンライン
          </span>
        </h1>
        <hr className="brush-line mx-auto w-14" />
      </header>

      <label className="block space-y-2">
        <span className="text-sm tracking-widest text-black/70">雅号</span>
        <input
          type="text"
          value={nickname}
          maxLength={12}
          placeholder="未入力なら「名無しの俳人」"
          onChange={(e) => onNicknameChange(e.target.value)}
          className="brush-input w-full px-4 py-3 text-base"
        />
      </label>

      <section className="brush-box space-y-3 p-4">
        <p className="text-sm tracking-widest text-black/70">モード</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["haiku", "tanka", "shirazu"] as VerseMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`brush-btn-outline px-3 py-3 text-sm tracking-widest ${
                mode === m ? "is-on" : ""
              }`}
            >
              <span className="block text-base">{MODE_LABEL[m]}</span>
            </button>
          ))}
        </div>

        <p className="pt-1 text-sm tracking-widest text-black/70">
          人数
        </p>
        <div className="flex flex-wrap gap-2">
          {counts.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPlayerCountChange(n)}
              className={`brush-btn-outline min-w-[3.25rem] flex-1 py-2.5 text-sm tracking-widest ${
                playerCount === n ? "is-on" : ""
              }`}
            >
              {toKanji(n)}人
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={onCreateRoom}
        className="brush-btn w-full px-4 py-3.5 text-base tracking-widest"
      >
        {busy
          ? "準備中…"
          : `部屋を作る（${MODE_LABEL[mode]}・${toKanji(playerCount)}人）`}
      </button>

      <div className="brush-box p-4">
        <p className="mb-2 text-sm tracking-widest text-black/70">
          ルームコードで入る
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            maxLength={6}
            placeholder="例: A3K9"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="brush-input min-w-0 flex-1 px-3 py-2.5 font-mono tracking-[0.2em]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={handleJoin}
            className="brush-btn shrink-0 px-4 py-2.5 text-sm tracking-widest"
          >
            入室
          </button>
        </div>
        {joinError && <p className="mt-2 text-xs underline">{joinError}</p>}
      </div>
    </div>
  );
}
