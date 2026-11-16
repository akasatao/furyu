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
    <div className="mx-auto flex w-full max-w-md flex-1 min-h-0 flex-col justify-center gap-3 md:max-w-2xl md:flex-none md:justify-start md:gap-6">
      <header className="shrink-0 space-y-1.5 text-center md:space-y-3">
        <hr className="brush-line mx-auto w-10 md:w-14" />
        <h1 className="text-3xl tracking-[0.2em] md:text-5xl">
          風流
          <span className="mt-0.5 block text-base tracking-[0.35em] text-black/55 md:mt-1 md:text-xl">
            オンライン
          </span>
        </h1>
        <hr className="brush-line mx-auto w-10 md:w-14" />
      </header>

      <label className="block shrink-0 space-y-1.5 md:space-y-2">
        <span className="text-sm tracking-widest text-black/70">雅号</span>
        <input
          type="text"
          value={nickname}
          maxLength={12}
          placeholder="未入力なら「名無しの俳人」"
          onChange={(e) => onNicknameChange(e.target.value)}
          className="brush-input w-full px-4 py-2.5 text-base md:py-3"
        />
      </label>

      <section className="brush-box shrink-0 space-y-2.5 p-3 md:space-y-3 md:p-4">
        <p className="text-sm tracking-widest text-black/70">モード</p>
        <div className="grid grid-cols-3 gap-2">
          {(["haiku", "tanka", "shirazu"] as VerseMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`brush-btn-outline px-2 py-2.5 text-sm tracking-widest md:px-3 md:py-3 ${
                mode === m ? "is-on" : ""
              }`}
            >
              <span className="block text-sm md:text-base">{MODE_LABEL[m]}</span>
            </button>
          ))}
        </div>

        <p className="pt-0.5 text-sm tracking-widest text-black/70 md:pt-1">
          人数
        </p>
        <div className="flex flex-wrap gap-2">
          {counts.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPlayerCountChange(n)}
              className={`brush-btn-outline min-w-[3.25rem] flex-1 py-2 text-sm tracking-widest md:py-2.5 ${
                playerCount === n ? "is-on" : ""
              }`}
            >
              {toKanji(n)}人
            </button>
          ))}
        </div>
      </section>

      <div className="flex shrink-0 flex-col gap-3 md:grid md:grid-cols-2 md:items-stretch md:gap-4">
        <div className="flex flex-col justify-center md:p-4">
          <p className="mb-2 hidden text-sm tracking-widest text-black/70 md:block">
            新しい和室を開く
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onCreateRoom}
            className="brush-btn w-full px-4 py-3 text-base tracking-widest md:h-full md:py-3.5"
          >
            {busy
              ? "準備中…"
              : `部屋を作る（${MODE_LABEL[mode]}・${toKanji(playerCount)}人）`}
          </button>
        </div>

        <div className="brush-box p-3 md:p-4">
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
    </div>
  );
}
