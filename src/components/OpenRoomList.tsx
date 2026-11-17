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
}

export function OpenRoomList({ busy = false, onBack, onJoin }: OpenRoomListProps) {
  const configured = isSupabaseConfigured();
  const [rooms, setRooms] = useState<OpenRoomSummary[] | null>(
    configured ? null : [],
  );
  const [error, setError] = useState(
    configured ? "" : "Supabase の設定がありません。",
  );

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
          rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              disabled={busy}
              onClick={() => onJoin(room.id)}
              className="brush-btn-outline flex w-full flex-col items-start gap-1 px-4 py-3 text-left md:px-5 md:py-4"
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-lg tracking-[0.2em] md:text-xl">
                  {MODE_LABEL[room.mode]}
                </span>
                <span className="shrink-0 text-sm tracking-wider text-black/55">
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
            </button>
          ))
        )}
        {error ? <p className="text-center text-xs underline">{error}</p> : null}
      </div>
    </section>
  );
}
