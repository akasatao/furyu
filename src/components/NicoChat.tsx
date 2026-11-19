"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CHAT_MAX_LENGTH,
  listRoomChats,
  parseRoomChat,
  sendRoomChat,
  type RoomChat,
} from "@/lib/online/chat";
import { getSupabase } from "@/lib/supabase/client";
import { clampText } from "@/lib/utils";

/** 画面を横切る基準時間。長い文も同じ速さで、追いつかない */
const CROSS_MS = 7500;
/** 狭い画面は同じ時間だと遅く見えるので、短く横切る */
const NARROW_CROSS_MS = 2600;
const NARROW_WIDTH_PX = 768;
const SEND_GAP_MS = 800;

interface FlyerItem {
  id: string;
  name: string;
  body: string;
  top: number;
  duration: number;
  delay: number;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function estimateWidth(name: string, body: string): number {
  return ([...name].length + [...body].length) * 20 + 32;
}

function laneMetrics(): { top: number; laneH: number; count: number } {
  const top = 52;
  const bottom = 104;
  const laneH = 36;
  const count = Math.max(
    3,
    Math.min(12, Math.floor((window.innerHeight - top - bottom) / laneH)),
  );
  return { top, laneH, count };
}

/**
 * 空いている段からランダムに取る。画面に残っている段は避ける。
 * 全部ふさがっているときだけ、最初に空く段を待つ。
 */
function reserveLane(
  lanes: number[],
  width: number,
): { top: number; duration: number; delay: number } {
  const { top, laneH, count } = laneMetrics();
  if (lanes.length !== count) {
    lanes.length = 0;
    for (let i = 0; i < count; i += 1) lanes.push(0);
  }
  const crossMs =
    window.innerWidth < NARROW_WIDTH_PX ? NARROW_CROSS_MS : CROSS_MS;
  const speed = (window.innerWidth + 180) / crossMs;
  const duration = (window.innerWidth + width) / speed;
  const now = performance.now();
  const free: number[] = [];
  let soonest = 0;
  let soonestAt = Infinity;
  for (let i = 0; i < count; i += 1) {
    const at = lanes[i] ?? 0;
    if (at <= now) free.push(i);
    if (at < soonestAt) {
      soonestAt = at;
      soonest = i;
    }
  }
  const lane =
    free.length > 0
      ? (free[Math.floor(Math.random() * free.length)] ?? 0)
      : soonest;
  const start = free.length > 0 ? now : Math.max(now, soonestAt);
  lanes[lane] = start + duration;
  return { top: top + lane * laneH, duration, delay: start - now };
}

function Flyer({
  item,
  onDone,
}: {
  item: FlyerItem;
  onDone: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);

  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const distance = window.innerWidth + el.offsetWidth + 8;
    let cancelled = false;
    const anim = el.animate(
      [
        { transform: "translate3d(0, 0, 0)" },
        { transform: `translate3d(${distance}px, 0, 0)` },
      ],
      {
        duration: item.duration,
        delay: item.delay,
        easing: "linear",
        fill: "forwards",
      },
    );
    anim.onfinish = () => {
      if (!cancelled) onDoneRef.current(item.id);
    };
    return () => {
      cancelled = true;
      anim.cancel();
    };
  }, [item.delay, item.duration, item.id]);

  return (
    <div
      ref={ref}
      className="absolute right-full whitespace-nowrap text-lg leading-none md:text-xl"
      style={{
        top: item.top,
        textShadow:
          "0 0 3px #fff, 0 0 3px #fff, 1px 0 #fff, -1px 0 #fff, 0 1px #fff, 0 -1px #fff",
      }}
    >
      <span className="mr-2 text-[0.72em] tracking-widest">{item.name}</span>
      {item.body}
    </div>
  );
}

interface NicoChatProps {
  roomId: string;
  playerId: string;
  name: string;
}

/** 和室が開いているあいだの流れるコメント。記録は部屋が消えるまで残る */
export function NicoChat({ roomId, playerId, name }: NicoChatProps) {
  const [chats, setChats] = useState<RoomChat[]>([]);
  const [flyers, setFlyers] = useState<FlyerItem[]>([]);
  const [draft, setDraft] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [composing, setComposing] = useState(false);

  const seenRef = useRef(new Set<string>());
  const laneFreeRef = useRef<number[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  const logRef = useRef<HTMLUListElement>(null);
  const stickRef = useRef(true);
  const ingestRef = useRef<(chat: RoomChat, fly: boolean) => void>(() => {});

  const removeFlyer = useCallback((id: string) => {
    setFlyers((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const ingest = useCallback((chat: RoomChat, fly: boolean) => {
    if (seenRef.current.has(chat.id)) return;
    seenRef.current.add(chat.id);
    setChats((prev) => {
      const next = [...prev, chat].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );
      return next;
    });
    if (!fly || prefersReducedMotion()) return;
    const width = estimateWidth(chat.name, chat.body);
    const slot = reserveLane(laneFreeRef.current, width);
    setFlyers((prev) =>
      [
        ...prev,
        {
          id: chat.id,
          name: chat.name,
          body: chat.body,
          top: slot.top,
          duration: slot.duration,
          delay: slot.delay,
        },
      ].slice(-36),
    );
    setLiveText(`${chat.name}、${chat.body}`);
  }, []);

  useEffect(() => {
    ingestRef.current = ingest;
  }, [ingest]);

  useEffect(() => {
    let alive = true;
    seenRef.current = new Set();
    laneFreeRef.current = [];
    setChats([]);
    setFlyers([]);
    setNotice("");
    setLiveText("");

    const supabase = getSupabase();
    const channel = supabase
      .channel(`room-chat-${roomId}`)
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const chat = parseRoomChat(payload);
        if (alive && chat) ingestRef.current(chat, true);
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_chats",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const chat = parseRoomChat(payload.new);
          if (alive && chat) ingestRef.current(chat, true);
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || !alive) return;
        void listRoomChats(roomId)
          .then((rows) => {
            if (!alive) return;
            for (const row of rows) ingestRef.current(row, false);
          })
          .catch((error: unknown) => {
            if (!alive) return;
            setNotice(
              error instanceof Error
                ? error.message
                : "コメントを読み込めませんでした。",
            );
          });
      });

    channelRef.current = channel;
    return () => {
      alive = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    if (!logOpen || !stickRef.current) return;
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chats, logOpen]);

  const send = useCallback(async () => {
    const text = clampText(draft.replace(/[\r\n\t]/g, "").trim(), CHAT_MAX_LENGTH);
    if (!text || sending) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_GAP_MS) return;
    lastSentRef.current = now;
    setSending(true);
    setNotice("");
    try {
      const chat = await sendRoomChat({
        roomId,
        playerId,
        name,
        body: text,
      });
      setDraft("");
      ingest(chat, true);
      void channelRef.current?.send({
        type: "broadcast",
        event: "chat",
        payload: chat,
      });
    } catch (error) {
      lastSentRef.current = 0;
      setNotice(
        error instanceof Error ? error.message : "コメントを送れませんでした。",
      );
    } finally {
      setSending(false);
    }
  }, [draft, ingest, name, playerId, roomId, sending]);

  const layer =
    typeof document === "undefined"
      ? null
      : createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-40 overflow-hidden [writing-mode:horizontal-tb]"
          >
            {flyers.map((item) => (
              <Flyer key={item.id} item={item} onDone={removeFlyer} />
            ))}
          </div>,
          document.body,
        );

  return (
    <>
      {layer}
      <div className="sr-only" aria-live="polite">
        {liveText}
      </div>
      <div className="fixed bottom-3 left-[4.25rem] z-[44] flex w-[min(28rem,calc(100%-9.75rem))] flex-col gap-2 md:bottom-4 md:left-[4.75rem] md:w-[min(28rem,calc(100%-11rem))]">
        {logOpen ? (
          <section
            aria-label="コメントのログ"
            className="flex max-h-[min(40vh,16rem)] flex-col border-2 border-black bg-white shadow-[2px_2px_0_#000]"
          >
            <div className="flex items-center justify-between border-b-2 border-black px-2 py-1">
              <h2 className="text-xs tracking-widest text-black/60">
                この和室のコメント
              </h2>
              <button
                type="button"
                onClick={() => setLogOpen(false)}
                className="text-xs tracking-widest text-black/50 underline-offset-4 hover:underline"
              >
                閉じる
              </button>
            </div>
            <ul
              ref={logRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              onScroll={(e) => {
                const el = e.currentTarget;
                stickRef.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 32;
              }}
            >
              {chats.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm tracking-widest text-black/45">
                  まだありません
                </li>
              ) : (
                chats.map((chat) => (
                  <li
                    key={chat.id}
                    className="border-b border-black/10 px-2.5 py-1.5 last:border-b-0"
                  >
                    <p className="truncate text-[10px] tracking-widest text-black/45">
                      {chat.name}
                      {chat.playerId === playerId ? "（あなた）" : ""}
                    </p>
                    <p className="text-sm leading-snug break-all">{chat.body}</p>
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {notice ? (
          <p role="status" className="bg-white px-1 text-xs leading-snug text-black/70">
            {notice}
          </p>
        ) : null}

        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (composing) return;
            void send();
          }}
        >
          <button
            type="button"
            aria-expanded={logOpen}
            onClick={() => {
              stickRef.current = true;
              setLogOpen((open) => !open);
            }}
            className={`brush-btn-outline shrink-0 px-2 py-2 text-xs tracking-widest ${
              logOpen ? "is-on" : ""
            }`}
          >
            ログ
          </button>
          <input
            type="text"
            inputMode="text"
            lang="ja"
            autoComplete="off"
            enterKeyHint="send"
            value={draft}
            placeholder="コメント"
            aria-label="コメント"
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              setDraft(clampText(e.currentTarget.value, CHAT_MAX_LENGTH));
            }}
            onChange={(e) => {
              const value = e.target.value;
              const native = e.nativeEvent as InputEvent;
              if (composing || native.isComposing) {
                setDraft(value);
                return;
              }
              setDraft(clampText(value, CHAT_MAX_LENGTH));
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.nativeEvent.isComposing || e.keyCode === 229)
              ) {
                e.preventDefault();
              }
            }}
            className="brush-input min-w-0 flex-1 px-2 py-1.5 text-base"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="brush-btn shrink-0 px-3 py-2 text-sm tracking-widest"
          >
            流す
          </button>
        </form>
      </div>
    </>
  );
}
