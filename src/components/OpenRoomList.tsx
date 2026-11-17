"use client";

import { useEffect, useState } from "react";
import { MODE_LABEL } from "@/lib/constants";
import { subscribeOpenRooms } from "@/lib/online/rooms";
import type { OpenRoomSummary } from "@/lib/online/types";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { toKanji } from "@/lib/utils";

interface OpenRoomListProps {
  busy?: boolean;
  onBack: () => void;
  onJoin: (roomId: string) => void;
  onSpectate: (roomId: string) => void;
}

function roomStatus(room: OpenRoomSummary): string | null {
  if (room.phase === "writing") return "制作中";
  if (room.phase === "reveal") return "披露中";
  if (!room.joinable) return "満員";
  return null;
}

export function OpenRoomList({
  busy = false,
  onBack,
  onJoin,
  onSpectate,
}: OpenRoomListProps) {
  const configured = isSupabaseConfigured();
  const [rooms, setRooms] = useState<OpenRoomSummary[] | null>(
    configured ? null : [],
  );
  const [error, setError] = useState(
    configured ? "" : "Supabase の設定がありません。",
  );
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const sub = subscribeOpenRooms(
      (next) => {
        setRooms(next);
        setError("");
      },
      (err) => setError(err.message || "和室一覧を読み込めませんでした。"),
    );
    return () => sub.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (busy) setPressedKey(null);
  }, [busy]);

  const press = (key: string) => {
    if (busy) return;
    setPressedKey(key);
  };

  return (
    <section className="flex w-full flex-col gap-5">
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="text-sm tracking-widest text-black/45 underline-offset-4 hover:underline"
        >
          ← 戻る
        </button>
        <p className="text-sm tracking-[0.3em] text-black/50">和室一覧</p>
        <span className="w-12" aria-hidden />
      </div>

      <header className="text-center">
        <h2 className="text-3xl tracking-[0.35em] md:text-5xl">開いている和室</h2>
      </header>

      <div className="flex w-full flex-col gap-3 md:gap-4">
        {rooms === null ? (
          <p className="py-6 text-center text-sm tracking-widest text-black/45">
            探しています…
          </p>
        ) : rooms.length === 0 ? (
          <p className="brush-box px-4 py-6 text-center text-sm tracking-widest text-black/55">
            いま開いている和室はありません
          </p>
        ) : (
          rooms.map((room) => {
            const status = roomStatus(room);
            const watchKey = `${room.id}:watch`;
            const enterKey = `${room.id}:enter`;
            return (
              <article
                key={room.id}
                className="brush-btn-outline flex w-full flex-col gap-3 px-4 py-3 text-left md:gap-4 md:px-5 md:py-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-lg tracking-[0.2em] md:text-xl">
                      {MODE_LABEL[room.mode]}
                    </span>
                    <span className="shrink-0 text-sm tracking-wider text-black/55">
                      {status ? `${status}　` : ""}
                      {toKanji(room.playerCount)}／{toKanji(room.maxPlayers)}人
                    </span>
                  </span>
                  <span className="w-full truncate text-sm tracking-widest text-black/60">
                    亭主：{room.hostName}
                  </span>
                  {room.theme.trim() ? (
                    <span className="w-full truncate text-sm tracking-widest text-black/60">
                      お題：{room.theme.trim()}
                    </span>
                  ) : null}
                </div>

                {room.joinable ? (
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={() => press(watchKey)}
                      onPointerUp={() => setPressedKey(null)}
                      onPointerCancel={() => setPressedKey(null)}
                      onPointerLeave={() => setPressedKey(null)}
                      onClick={() => onSpectate(room.id)}
                      className={`brush-btn min-h-14 px-2 py-4 text-base tracking-[0.12em] whitespace-nowrap md:min-h-16 md:text-lg md:tracking-[0.2em]${
                        pressedKey === watchKey ? " is-pressed" : ""
                      }`}
                    >
                      観戦する
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={() => press(enterKey)}
                      onPointerUp={() => setPressedKey(null)}
                      onPointerCancel={() => setPressedKey(null)}
                      onPointerLeave={() => setPressedKey(null)}
                      onClick={() => onJoin(room.id)}
                      className={`brush-btn-outline min-h-14 px-2 py-4 text-base tracking-[0.12em] whitespace-nowrap md:min-h-16 md:text-lg md:tracking-[0.2em]${
                        pressedKey === enterKey ? " is-pressed" : ""
                      }`}
                    >
                      入門する
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={() => press(watchKey)}
                    onPointerUp={() => setPressedKey(null)}
                    onPointerCancel={() => setPressedKey(null)}
                    onPointerLeave={() => setPressedKey(null)}
                    onClick={() => onSpectate(room.id)}
                    className={`brush-btn min-h-20 w-full px-4 py-5 text-xl tracking-[0.2em] md:min-h-24 md:text-2xl md:tracking-[0.28em]${
                      pressedKey === watchKey ? " is-pressed" : ""
                    }`}
                  >
                    観戦する
                  </button>
                )}
              </article>
            );
          })
        )}
        {error ? <p className="text-center text-xs underline">{error}</p> : null}
      </div>
    </section>
  );
}
