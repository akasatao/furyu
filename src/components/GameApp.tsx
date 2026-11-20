"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { BgmPlayer } from "@/components/BgmPlayer";
import { ViewportFit } from "@/components/ViewportFit";
import { HomeScreen, type HomeStep } from "@/components/HomeScreen";
import { KickMenu } from "@/components/KickMenu";
import { NoMoreTmcOverlay } from "@/components/NoMoreTmcOverlay";
import { RevealPhase } from "@/components/RevealPhase";
import { ShirazuWritingPhase } from "@/components/ShirazuWritingPhase";
import { SpectatePhase } from "@/components/SpectatePhase";
import { WaitingLobby } from "@/components/WaitingLobby";
import { WritingPhase } from "@/components/WritingPhase";
import { APP_VERSION } from "@/lib/app-version";
import { THEME_MAX_LENGTH } from "@/lib/constants";
import { loadNickname, saveNickname } from "@/lib/online/nickname";
import { getOrCreatePlayerId } from "@/lib/online/player-id";
import { clearRevealSeen } from "@/lib/reveal-progress";
import {
  isBackControl,
  isKaikaiControl,
  playBackSound,
  playBanishSound,
  playBanishVictimSound,
  playKaikaiSound,
  playSelectSound,
} from "@/lib/select-sound";
import {
  appendPoemsToHistory,
  loadPoemHistory,
  removePoemFromHistory,
  type PoemHistoryEntry,
} from "@/lib/online/poem-history";
import {
  advanceShirazuReveal,
  armNoMoreTmc,
  banishForNoMoreTmc,
  createOnlineRoom,
  handOverAndRemove,
  joinOnlineRoom,
  kickOnlinePlayer,
  transferOnlineHost,
  leaveOnlineRoom,
  leaveProcessorId,
  leaveRoomOnUnload,
  resetRoomToLobby,
  setHostPickingTheme as saveHostPickingTheme,
  ROOM_HEARTBEAT_MS,
  startOnlineGame,
  touchRoom,
  submitOnlineTurn,
  subscribeOnlineRoom,
  type OnlineRoomSubscription,
} from "@/lib/online/rooms";
import type { StampId } from "@/lib/stamps";
import { NicoChat } from "@/components/NicoChat";
import { StampBalloons, type StampBalloon } from "@/components/StampBalloons";
import { StampPicker } from "@/components/StampPicker";
import type { OnlineRoomSnapshot } from "@/lib/online/types";
import {
  completesForbiddenName,
  isNoMoreTmcBanish,
  shirazuBeforeText,
  verseBeforeText,
} from "@/lib/no-more-tmc";
import {
  canSubmitFreeShirazuUnit,
  canSubmitShirazuUnit,
  clampShirazuDraft,
  normalizeFreeShirazuUnit,
  normalizeShirazuMora,
  poemMoraCount,
  SHIRAZU_MORA_PER_POEM,
  shirazuPoemForSeat,
  shirazuSeatOf,
} from "@/lib/shirazu";
import {
  applyOnlineSubmit,
  applyShirazuCharToPoem,
} from "@/lib/online/submit";
import { assignPartIndexes } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  clampPlayerCount,
  clampText,
  createBlankPoems,
  defaultNickname,
  getPromptLines,
  partLimit,
  playerColor,
  uid,
} from "@/lib/utils";
import type {
  GamePhase,
  Player,
  Poem,
  ShirazuStyle,
  TurnState,
  VerseMode,
} from "@/types/game";
import { isHostPickingTheme, isLineTurn, isShirazuRevealTurn, isShirazuTurn } from "@/types/game";

/** 完成→披露用（長め） */
const PHASE_FADE_MS = 1100;
const PHASE_HOLD_MS = 280;
/** ホーム↔ロビー／ソロ開始など（従来の速さ） */
const NAV_FADE_MS = 420;
const NAV_HOLD_MS = 120;
/** 破門の文字を見せておく時間 */
const BANISH_HOLD_MS = 2200;
/** スタンプ連打の間引き */
const STAMP_THROTTLE_MS = 120;
const MAX_BALLOONS = 60;
/** 風船は右下のボタンのすぐ左から出る（px） */
const STAMP_BASE_RIGHT_PX = 78;
/** 同時に送っている人がいるとき、一人ずつ左へずらす幅 */
const STAMP_LANE_PX = 88;
const STAMP_JITTER_PX = 28;
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type RoomClock = {
  roomId: string;
  step: number;
  phase: GamePhase;
  /** ロビーに戻ったあと、前の対局の遅れ読みを捨てる */
  holdLobby: boolean;
};

/** 遅れて届いた部屋読みで、渡した短冊を手元に戻さない */
function isStaleRoomSnapshot(
  clock: RoomClock,
  snapshot: OnlineRoomSnapshot,
): boolean {
  const phase = snapshot.room.phase;
  const step = snapshot.room.step_index ?? 0;
  if (clock.roomId !== snapshot.room.id) return false;
  if (phase === "lobby") return false;
  if (clock.holdLobby && step !== 0) return true;
  return (
    (clock.phase === "writing" || clock.phase === "reveal") &&
    (phase === "writing" || phase === "reveal") &&
    step < clock.step
  );
}

function noteRoomSnapshot(clock: RoomClock, snapshot: OnlineRoomSnapshot) {
  const phase = snapshot.room.phase;
  const step = snapshot.room.step_index ?? 0;
  clock.roomId = snapshot.room.id;
  clock.phase = phase;
  if (phase === "lobby") {
    clock.step = 0;
    clock.holdLobby = true;
    return;
  }
  if (step === 0) clock.holdLobby = false;
  clock.step = step;
}

export function GameApp() {
  const [phase, setPhase] = useState<GamePhase>("home");
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<VerseMode>("haiku");
  const [playerCount, setPlayerCount] = useState(2);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [spectators, setSpectators] = useState<Player[]>([]);
  /** 自分は観戦席（連衆の進行には入らない） */
  const [watching, setWatching] = useState(false);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [myId, setMyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  /** 退場アニメ用に残す表示テキスト */
  const [toastText, setToastText] = useState("");
  const [toastExiting, setToastExiting] = useState(false);
  const [localDraft, setLocalDraft] = useState("");
  const [phaseVeil, setPhaseVeil] = useState(0);
  const [phaseVeilMs, setPhaseVeilMs] = useState(PHASE_FADE_MS);
  /** 白フェードが終わってから短冊の書き出しを始める */
  const [revealReady, setRevealReady] = useState(false);
  const [homeStep, setHomeStep] = useState<HomeStep>("mode");
  const [poemHistory, setPoemHistory] = useState<PoemHistoryEntry[]>([]);
  /** お題。空＝なし */
  const [theme, setTheme] = useState("");
  /** 披露後、亭主が次のお題を考えている */
  const [hostPickingTheme, setHostPickingTheme] = useState(false);
  /** リレー流派 */
  const [shirazuStyle, setShirazuStyle] = useState<ShirazuStyle>("strict");
  const [kumoGakure, setKumoGakure] = useState(false);
  /** 次の一宴だけ、たまき等の完成で破門する */
  const [noMoreTmc, setNoMoreTmc] = useState(false);
  /** 増やすたびに No More TMC の演出を最初から再生する */
  const [tmcPlayId, setTmcPlayId] = useState(0);

  /** 披露スタンプの風船（和室の披露中だけ） */
  const [balloons, setBalloons] = useState<StampBalloon[]>([]);

  const subRef = useRef<OnlineRoomSubscription | null>(null);
  /** 開宴前の幕などスタンプを出せないあいだに届いたものは捨てる */
  const stampOpenRef = useRef(false);
  const lastStampAtRef = useRef(0);
  /** まだ昇っている風船の送り主とレーン。同時の送り主を横にずらす */
  const balloonLanesRef = useRef<
    { key: string; playerId: string; lane: number }[]
  >([]);
  const fadingRef = useRef(false);
  const submitLockRef = useRef(false);
  /** 同じ対局の句を二重保存しない */
  const historySavedKeyRef = useRef("");
  /** ロビーの「戻る」で戻すホーム画面 */
  const lobbyBackStepRef = useRef<HomeStep>("mode");
  const phaseRef = useRef(phase);
  const myIdRef = useRef(myId);
  const playersRef = useRef(players);
  const spectatorsRef = useRef(spectators);
  useEffect(() => {
    phaseRef.current = phase;
    myIdRef.current = myId;
    playersRef.current = players;
    spectatorsRef.current = spectators;
  }, [phase, myId, players, spectators]);
  /** 亭主が抜けた／キックされたときの追い出し（二重実行防止） */
  const ejectLockRef = useRef(false);
  const ejectRef = useRef<(message: string, skipLeave?: boolean) => void>(
    () => {},
  );
  const banishRef = useRef<() => void>(() => {});
  /** 破門で抜けた人。自主退出のトーストと二重に出さない */
  const kickedIdsRef = useRef(new Set<string>());
  /** 執筆→披露の白フェード（購読と提出の二重実行を直列化） */
  const revealGateRef = useRef<Promise<void> | null>(null);
  const enterRevealFromWritingRef = useRef<
    (snapshot: OnlineRoomSnapshot) => Promise<void>
  >(async () => {});
  /** 部屋読みの新旧。遅れた取得で短冊を戻さない */
  const roomClockRef = useRef<RoomClock>({
    roomId: "",
    step: -1,
    phase: "home",
    holdLobby: false,
  });
  /** 破門されたときに中央へ大きく出す */
  const [banished, setBanished] = useState(false);
  const [banishWord, setBanishWord] = useState("破門");

  useEffect(() => {
    setMyId(getOrCreatePlayerId());
    setNickname(loadNickname());
    setPoemHistory(loadPoemHistory());
  }, []);

  /** ボタン選択は拍子木。戻る系は別の効果音 */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      // 音量オンオフ／バー操作では効果音を鳴らさない
      if (target.closest("[data-no-select-sound]")) return;
      const control = target.closest("button, [role='button']");
      if (!(control instanceof HTMLElement)) return;
      if (control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") {
        return;
      }
      // 開宴はほら貝のみ（拍子木は鳴らさない）
      if (isKaikaiControl(control)) return;
      if (isBackControl(control)) playBackSound();
      else playSelectSound();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  const rememberPoems = useCallback(
    (nextPoems: Poem[], poemTheme?: string) => {
      if (nextPoems.length === 0) return;
      const key = nextPoems
        .map((p) => p.id)
        .filter(Boolean)
        .sort()
        .join(",");
      if (!key || historySavedKeyRef.current === key) return;
      const updated = appendPoemsToHistory(nextPoems, {
        theme: poemTheme ?? theme,
      });
      historySavedKeyRef.current = key;
      setPoemHistory(updated);
    },
    [theme],
  );

  const handleNicknameChange = useCallback((value: string) => {
    setNickname(value);
    saveNickname(value);
  }, []);

  /** 新しいエラーが来たら表示を開始 */
  useEffect(() => {
    if (!errorMessage) return;
    setToastText(errorMessage);
    setToastExiting(false);
  }, [errorMessage]);

  /** エラーが消されたら退場アニメへ */
  useEffect(() => {
    if (errorMessage || !toastText || toastExiting) return;
    setToastExiting(true);
  }, [errorMessage, toastText, toastExiting]);

  /** 退場アニメの保険（animationend が来ない場合） */
  useEffect(() => {
    if (!toastExiting) return;
    const timer = window.setTimeout(() => {
      setToastText("");
      setToastExiting(false);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [toastExiting]);

  /** エラーは数秒で消す（退場アニメは上の effect が担当） */
  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => setErrorMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [errorMessage]);

  /** 画面が変わったらエラーは残さない */
  useEffect(() => {
    setErrorMessage("");
  }, [phase, homeStep]);

  const applySnapshot = useCallback(
    (snapshot: OnlineRoomSnapshot) => {
      if (isStaleRoomSnapshot(roomClockRef.current, snapshot)) return;
      noteRoomSnapshot(roomClockRef.current, snapshot);
      setRoomId(snapshot.room.id);
      setMode(snapshot.room.mode);
      setPlayerCount(snapshot.room.max_players);
      setPlayers(snapshot.players);
      setSpectators(snapshot.spectators);
      setWatching(
        snapshot.spectators.some((p) => p.id === myIdRef.current),
      );
      setTheme(
        typeof snapshot.room.theme === "string" ? snapshot.room.theme : "",
      );
      setShirazuStyle(
        snapshot.room.shirazu_style === "free" ? "free" : "strict",
      );
      setKumoGakure(snapshot.room.kumo_gakure === true);
      setNoMoreTmc(snapshot.room.no_more_tmc === true);
      const nextPoems = snapshot.room.poems ?? [];
      setPoems(nextPoems);
      setTurn(snapshot.room.turn);
      setHostPickingTheme(isHostPickingTheme(snapshot.room.turn));
      setPhase(snapshot.room.phase);
      if (snapshot.room.phase === "reveal" && nextPoems.length > 0) {
        rememberPoems(nextPoems, snapshot.room.theme);
      }
      if (snapshot.room.phase === "lobby" || snapshot.room.phase === "writing") {
        historySavedKeyRef.current = "";
      }
      const nextTurn = snapshot.room.turn;
      if (isShirazuTurn(nextTurn)) {
        if (nextTurn.submittedIds.includes(myId)) setLocalDraft("");
      } else if (
        !isLineTurn(nextTurn) ||
        nextTurn.writerId !== myId ||
        nextTurn.status === "submitted"
      ) {
        setLocalDraft("");
      }
    },
    [myId, rememberPoems],
  );

  /** 短冊が回ったら下書きを捨てる */
  const shirazuRound = isShirazuTurn(turn) ? turn.roundIndex : null;
  useEffect(() => {
    if (shirazuRound != null) setLocalDraft("");
  }, [shirazuRound]);

  const addBalloon = useCallback(
    (stamp: StampId, name: string, playerId: string) => {
      const active = balloonLanesRef.current;
      const held = active.find((b) => b.playerId === playerId);
      let lane = 0;
      if (held) {
        lane = held.lane;
      } else {
        const used = new Set(active.map((b) => b.lane));
        while (used.has(lane)) lane += 1;
      }
      const width = Math.max(window.innerWidth, 320);
      const jitter = (Math.random() - 0.5) * STAMP_JITTER_PX;
      const rightPx = Math.min(
        width - 40,
        STAMP_BASE_RIGHT_PX + lane * STAMP_LANE_PX + jitter,
      );
      const key = uid("st");
      balloonLanesRef.current = [...active, { key, playerId, lane }].slice(
        -MAX_BALLOONS,
      );
      setBalloons((prev) =>
        [
          ...prev,
          {
            key,
            stamp,
            name,
            x: ((width - rightPx) / width) * 100,
            sway: Math.random() * 2 - 1,
          },
        ].slice(-MAX_BALLOONS),
      );
    },
    [],
  );

  const removeBalloon = useCallback((key: string) => {
    balloonLanesRef.current = balloonLanesRef.current.filter(
      (b) => b.key !== key,
    );
    setBalloons((prev) => prev.filter((b) => b.key !== key));
  }, []);

  const clearSubscription = useCallback(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
  }, []);

  const watchRoom = useCallback(
    (id: string) => {
      clearSubscription();
      roomClockRef.current = {
        roomId: "",
        step: -1,
        phase: "home",
        holdLobby: false,
      };
      subRef.current = subscribeOnlineRoom(
        id,
        (snapshot) => {
          // 連衆が誰もいない／亭主がいない和室は終了扱い（観戦者も退出）
          if (snapshot.players.length === 0) {
            ejectRef.current("和室が閉じました");
            return;
          }
          const self = myIdRef.current;
          const present =
            snapshot.players.some((p) => p.id === self) ||
            snapshot.spectators.some((p) => p.id === self);
          // 自分の破門を、亭主不在の退出より先に出す
          if (self && !present) {
            banishRef.current();
            return;
          }
          if (
            (snapshot.room.phase === "lobby" ||
              snapshot.room.phase === "writing") &&
            !snapshot.players.some((p) => p.isHost)
          ) {
            ejectRef.current("亭主が退出しました");
            return;
          }

          // 連衆が抜けたら上トースト（観戦の退出は出さない。破門は別文言）
          const prevPlayers = playersRef.current;
          const wasPresent =
            Boolean(self) &&
            (prevPlayers.some((p) => p.id === self) ||
              spectatorsRef.current.some((p) => p.id === self));
          if (self && wasPresent && prevPlayers.length > 0) {
            const nextPlayerIds = new Set(
              snapshot.players.map((p) => p.id),
            );
            const kicked = kickedIdsRef.current;
            const leavers = prevPlayers.filter(
              (p) =>
                p.id !== self &&
                !nextPlayerIds.has(p.id) &&
                !kicked.has(p.id),
            );
            for (const id of [...kicked]) {
              if (
                !nextPlayerIds.has(id) &&
                !snapshot.spectators.some((p) => p.id === id)
              ) {
                kicked.delete(id);
              }
            }
            if (leavers.length === 1) {
              setErrorMessage(`${leavers[0].name}さんが筆を折りました`);
            } else if (leavers.length > 1) {
              setErrorMessage(
                `${leavers.map((p) => `${p.name}さん`).join("、")}が筆を折りました`,
              );
            }
          }

          // 執筆中に完成したら、空短冊を出さず白フェードしてから披露へ
          if (
            snapshot.room.phase === "reveal" &&
            phaseRef.current === "writing"
          ) {
            void enterRevealFromWritingRef.current(snapshot);
            return;
          }

          applySnapshot(snapshot);
          if (
            snapshot.room.phase === "reveal" &&
            !fadingRef.current &&
            !revealGateRef.current
          ) {
            setRevealReady(true);
          }
        },
        () => {
          // 部屋行が消えた・読めないとき。披露中の観戦者も含めて退出
          if (phaseRef.current === "home") return;
          ejectRef.current("和室が閉じました");
        },
        (leaverId) => {
          // リロード・タブを閉じた連衆の後片付けは、担当の一人だけが行う。
          // 観戦の行消しは亭主が行う。
          const playersNow = playersRef.current;
          const spectatorLeave = spectatorsRef.current.some(
            (p) => p.id === leaverId,
          );
          const processor = spectatorLeave
            ? (playersNow.find((p) => p.isHost)?.id ?? null)
            : leaveProcessorId(playersNow, leaverId);
          if (!processor || processor !== myIdRef.current) return;
          void handOverAndRemove({ roomId: id, leaverId }).catch((error) => {
            setErrorMessage((error as Error).message);
          });
        },
        (kickedId, name, superBan) => {
          if (kickedId === myIdRef.current) {
            if (superBan) setBanishWord("超破門");
            return;
          }
          kickedIdsRef.current.add(kickedId);
          setErrorMessage(
            `${name}さんは${superBan ? "超破門" : "破門"}されました`,
          );
        },
        (stamp) => {
          if (!stampOpenRef.current || stamp.playerId === myIdRef.current) {
            return;
          }
          addBalloon(stamp.stamp, stamp.name, stamp.playerId);
        },
        (hostId) => {
          if (hostId === myIdRef.current) return;
          setTmcPlayId((n) => n + 1);
        },
      );
    },
    [addBalloon, applySnapshot, clearSubscription],
  );

  /** リロード・タブを閉じるときは、自分の在席を消し、残っている連衆へ知らせる */
  useEffect(() => {
    if (!roomId || !myId) return;
    const onPageHide = () => {
      leaveRoomOnUnload({
        roomId,
        playerId: myId,
        players: playersRef.current,
        watching: spectatorsRef.current.some((p) => p.id === myId),
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [roomId, myId]);

  useEffect(() => () => clearSubscription(), [clearSubscription]);

  /** 和室を開いているあいだ「まだいる」と書く。途切れると部屋は消える */
  useEffect(() => {
    if (!roomId) return;
    const send = () => {
      void touchRoom(roomId);
    };
    send();
    const timer = window.setInterval(send, ROOM_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId]);

  const handleModeChange = useCallback((next: VerseMode) => {
    setErrorMessage("");
    setMode(next);
    setPlayerCount((prev) => clampPlayerCount(next, prev));
  }, []);

  const displayName = nickname.trim() || defaultNickname();

  /** 和室の披露中だけ（リレーの開宴前の幕は除く） */
  const canStamp =
    Boolean(roomId) &&
    phase === "reveal" &&
    !hostPickingTheme &&
    !(isShirazuRevealTurn(turn) && turn.poemIndex < 0);
  const [stampWasOpen, setStampWasOpen] = useState(canStamp);
  if (stampWasOpen !== canStamp) {
    setStampWasOpen(canStamp);
    if (!canStamp) setBalloons([]);
  }
  useEffect(() => {
    stampOpenRef.current = canStamp;
    if (!canStamp) balloonLanesRef.current = [];
  }, [canStamp]);

  const handleStamp = useCallback(
    (stamp: StampId) => {
      if (!stampOpenRef.current) return;
      const now = Date.now();
      if (now - lastStampAtRef.current < STAMP_THROTTLE_MS) return;
      lastStampAtRef.current = now;
      const name =
        playersRef.current.find((p) => p.id === myId)?.name ??
        spectatorsRef.current.find((p) => p.id === myId)?.name ??
        displayName;
      addBalloon(stamp, name, myId);
      subRef.current?.sendStamp({ stamp, playerId: myId, name });
    },
    [addBalloon, displayName, myId],
  );

  /** 白経由フェードのあいだに状態を差し替える。終わってから resolve */
  const runWhiteFade = useCallback(
    async (
      apply: () => void | Promise<void>,
      timing: { fadeMs: number; holdMs: number } = {
        fadeMs: PHASE_FADE_MS,
        holdMs: PHASE_HOLD_MS,
      },
    ) => {
      if (fadingRef.current) {
        await apply();
        return;
      }
      fadingRef.current = true;
      const { fadeMs, holdMs } = timing;
      try {
        if (!prefersReducedMotion()) {
          flushSync(() => {
            setPhaseVeilMs(fadeMs);
            setPhaseVeil(1);
          });
          await sleep(fadeMs);
        }
        await apply();
        if (!prefersReducedMotion()) {
          await sleep(holdMs);
          flushSync(() => setPhaseVeil(0));
          await sleep(fadeMs);
        }
      } finally {
        setPhaseVeil(0);
        fadingRef.current = false;
      }
    },
    [],
  );

  /** フェード完了後、1フレーム置いてから書き出し開始（空カードを先に描画） */
  const startRevealWriting = useCallback(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    flushSync(() => setRevealReady(true));
  }, []);

  /**
   * 執筆画面のまま白へ溶かし、開けたあとに空短冊→書き出し。
   * 提出者の API 応答と Realtime 購読のどちらが先でも、フェードは一度だけ。
   */
  const enterRevealFromWriting = useCallback(
    async (snapshot: OnlineRoomSnapshot) => {
      const previous = revealGateRef.current;
      const task = (async () => {
        if (previous) {
          try {
            await previous;
          } catch {
            // 先行フェード失敗でも最新スナップショットは反映する
          }
        }
        if (phaseRef.current === "reveal") {
          applySnapshot(snapshot);
          return;
        }
        const shirazuReveal = isShirazuRevealTurn(snapshot.room.turn);
        await runWhiteFade(() => {
          setLocalDraft("");
          setRevealReady(shirazuReveal);
          applySnapshot(snapshot);
        });
        if (!shirazuReveal) await startRevealWriting();
      })();
      revealGateRef.current = task;
      try {
        await task;
      } finally {
        if (revealGateRef.current === task) revealGateRef.current = null;
      }
    },
    [applySnapshot, runWhiteFade, startRevealWriting],
  );

  useEffect(() => {
    enterRevealFromWritingRef.current = enterRevealFromWriting;
  }, [enterRevealFromWriting]);

  /** 一人プレイはネット往復なしで即開始 */
  const startSoloLocal = useCallback(
    (options?: {
      playerId?: string;
      name?: string;
      verseMode?: VerseMode;
      theme?: string;
    }) => {
      const playerId =
        options?.playerId || myId || getOrCreatePlayerId();
      const name = options?.name || displayName;
      const verseMode = options?.verseMode || mode;
      const nextTheme =
        options?.theme !== undefined
          ? options.theme.trim().slice(0, THEME_MAX_LENGTH)
          : theme;
      const parts = assignPartIndexes(1, verseMode);
      const roster: Player[] = [
        {
          id: playerId,
          name,
          isBot: false,
          isHost: true,
          color: playerColor(0),
          partIndexes: parts[0] ?? [],
        },
      ];
      setMyId(playerId);
      setNickname(name);
      setMode(verseMode);
      setTheme(nextTheme);
      setPlayerCount(1);
      setRoomId(null);
      setSpectators([]);
      setWatching(false);
      setPlayers(roster);
      setPoems(createBlankPoems(verseMode, 1, uid("poem")));
      setTurn({
        stepIndex: 0,
        writerId: playerId,
        draft: "",
        status: "idle",
      });
      setLocalDraft("");
      setErrorMessage("");
      setPhase("writing");
    },
    [displayName, mode, myId, theme],
  );

  const handleCreateRoom = async (
    count?: number,
    verseMode?: VerseMode,
    themeOverride?: string,
    styleOverride?: ShirazuStyle,
    kumoOverride?: boolean,
  ) => {
    const activeMode = verseMode ?? mode;
    const maxPlayers = clampPlayerCount(activeMode, count ?? playerCount);
    const activeTheme =
      themeOverride !== undefined
        ? themeOverride.trim().slice(0, THEME_MAX_LENGTH)
        : theme;
    const activeStyle =
      activeMode === "shirazu"
        ? styleOverride === "free" ||
          (styleOverride === undefined && shirazuStyle === "free")
          ? "free"
          : "strict"
        : "strict";
    const activeKumo = activeMode !== "shirazu" && kumoOverride === true;
    if (verseMode) setMode(activeMode);
    if (themeOverride !== undefined) setTheme(activeTheme);
    if (activeMode === "shirazu") setShirazuStyle(activeStyle);
    setKumoGakure(activeKumo);
    setPlayerCount(maxPlayers);
    // 部屋作成直前はお題画面。戻ると人数／流派選択へ戻れる
    lobbyBackStepRef.current = "theme";
    // 一人はローカルですぐ詠み始める（部屋作成の待ち時間なし）
    if (maxPlayers === 1) {
      setBusy(true);
      try {
        await runWhiteFade(
          () => {
            flushSync(() => {
              startSoloLocal({ verseMode: activeMode, theme: activeTheme });
            });
          },
          { fadeMs: NAV_FADE_MS, holdMs: NAV_HOLD_MS },
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrorMessage("Supabase の設定がありません。");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      await runWhiteFade(
        async () => {
          const playerId = myId || getOrCreatePlayerId();
          setMyId(playerId);
          const snapshot = await createOnlineRoom({
            playerId,
            nickname: displayName,
            mode: activeMode,
            maxPlayers,
            theme: activeTheme,
            shirazuStyle: activeStyle,
            kumoGakure: activeKumo,
          });
          flushSync(() => {
            setNickname(displayName);
            applySnapshot(snapshot);
          });
          watchRoom(snapshot.room.id);
        },
        { fadeMs: NAV_FADE_MS, holdMs: NAV_HOLD_MS },
      );
    } catch (error) {
      setErrorMessage((error as Error).message || "部屋を作れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async (
    targetRoomId: string,
    asSpectator = false,
  ) => {
    if (!isSupabaseConfigured()) {
      setErrorMessage("Supabase の設定がありません。");
      return;
    }
    lobbyBackStepRef.current = "rooms";
    setBusy(true);
    setErrorMessage("");
    try {
      const playerId = myId || getOrCreatePlayerId();
      myIdRef.current = playerId;
      setMyId(playerId);
      // 失敗時はフェードなしでエラー表示
      const snapshot = await joinOnlineRoom({
        roomId: targetRoomId,
        playerId,
        nickname: displayName,
        asSpectator,
      });
      await runWhiteFade(
        () => {
          flushSync(() => {
            setNickname(displayName);
            applySnapshot(snapshot);
          });
          watchRoom(snapshot.room.id);
        },
        { fadeMs: NAV_FADE_MS, holdMs: NAV_HOLD_MS },
      );
      if (snapshot.room.phase === "reveal") {
        if (isShirazuRevealTurn(snapshot.room.turn)) setRevealReady(true);
        else await startRevealWriting();
      }
    } catch (error) {
      setErrorMessage((error as Error).message || "入室できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const leaveRoomAndGoHome = async (
    nextHomeStep: HomeStep,
    options: { skipLeave?: boolean } = {},
  ) => {
    setBusy(true);
    try {
      await runWhiteFade(
        async () => {
          clearSubscription();
          // ローカル一人はネット退出不要
          if (roomId && myId && !options.skipLeave) {
            const me = players.find((p) => p.id === myId);
            try {
              await leaveOnlineRoom({
                roomId,
                playerId: myId,
                isHost: Boolean(me?.isHost),
              });
            } catch {
              // 退出失敗でもホームへ戻す
            }
          }
          flushSync(() => {
            setBanished(false);
            setBanishWord("破門");
            setHomeStep(nextHomeStep);
            setPhase("home");
            setRoomId(null);
            setPlayers([]);
            setSpectators([]);
            setWatching(false);
            setPoems([]);
            setTurn(null);
            setLocalDraft("");
            setTheme("");
            setNoMoreTmc(false);
            setTmcPlayId(0);
            setErrorMessage("");
          });
        },
        { fadeMs: NAV_FADE_MS, holdMs: NAV_HOLD_MS },
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    ejectRef.current = (message, skipLeave = false) => {
      if (ejectLockRef.current || phaseRef.current === "home") return;
      ejectLockRef.current = true;
      void leaveRoomAndGoHome(lobbyBackStepRef.current, { skipLeave }).finally(
        () => {
          ejectLockRef.current = false;
          setErrorMessage(message);
        },
      );
    };
    banishRef.current = () => {
      if (ejectLockRef.current || phaseRef.current === "home") return;
      ejectLockRef.current = true;
      clearSubscription();
      playBanishVictimSound();
      setBanished(true);
      void (async () => {
        await sleep(BANISH_HOLD_MS);
        await leaveRoomAndGoHome(lobbyBackStepRef.current, { skipLeave: true });
        ejectLockRef.current = false;
      })();
    };
  });

  const handleKick = async (targetId: string, ban = false) => {
    if (!roomId || !myId) return;
    setBusy(true);
    setErrorMessage("");
    const target =
      players.find((p) => p.id === targetId) ??
      spectators.find((p) => p.id === targetId);
    // 破門ボタン直後・押した本人だけ爆発音
    playBanishSound();
    try {
      kickedIdsRef.current.add(targetId);
      const snapshot = await kickOnlinePlayer({
        roomId,
        hostId: myId,
        targetId,
        ban,
      });
      applySnapshot(snapshot);
      if (target) {
        setErrorMessage(
          `${target.name}さんは${ban ? "超破門" : "破門"}されました`,
        );
      }
    } catch (error) {
      kickedIdsRef.current.delete(targetId);
      setErrorMessage((error as Error).message || "破門できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleTransferHost = async (targetId: string) => {
    if (!roomId || !myId) return;
    setBusy(true);
    setErrorMessage("");
    const target = players.find((p) => p.id === targetId);
    try {
      const snapshot = await transferOnlineHost({
        roomId,
        hostId: myId,
        nextHostId: targetId,
      });
      applySnapshot(snapshot);
      if (target) setErrorMessage(`亭主を${target.name}さんに譲渡しました`);
    } catch (error) {
      setErrorMessage((error as Error).message || "譲渡できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    await leaveRoomAndGoHome("mode");
  };

  const handleLobbyBack = async () => {
    await leaveRoomAndGoHome(lobbyBackStepRef.current);
  };

  const handleStartGame = async () => {
    if (!roomId || !myId) return;
    if (players.length < 2) {
      setErrorMessage("二人以上揃うまで開宴できません。");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      const snapshot = await startOnlineGame({ roomId, hostId: myId });
      if (phaseRef.current === "lobby") playKaikaiSound();
      applySnapshot(snapshot);
    } catch (error) {
      setErrorMessage((error as Error).message || "開宴できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleNoMoreTmc = async () => {
    if (!roomId || !myId || busy) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const snapshot = await armNoMoreTmc({ roomId, hostId: myId });
      applySnapshot(snapshot);
      setTmcPlayId((n) => n + 1);
    } catch (error) {
      setErrorMessage((error as Error).message || "宣言できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleDraftChange = (value: string) => {
    if (!turn) return;
    if (isShirazuTurn(turn)) {
      if (turn.submittedIds.includes(myId)) return;
      setLocalDraft(
        shirazuStyle === "free" ? value : clampShirazuDraft(value),
      );
      return;
    }
    if (!isLineTurn(turn)) return;
    if (turn.writerId !== myId || turn.status === "submitted") return;
    setLocalDraft(
      clampText(value, partLimit(poems[0]?.mode ?? mode, turn.stepIndex)),
    );
  };

  const handleSubmit = async () => {
    if (!turn || busy || submitLockRef.current || fadingRef.current) return;

    const shirazu = isShirazuTurn(turn);
    if (shirazu) {
      if (turn.submittedIds.includes(myId)) return;
    } else if (isLineTurn(turn)) {
      if (turn.writerId !== myId || turn.status === "submitted") return;
    } else {
      return;
    }

    let draft = shirazu
      ? shirazuStyle === "free"
        ? normalizeFreeShirazuUnit(localDraft)
        : normalizeShirazuMora(localDraft)
      : localDraft.trim();

    let shirazuPoemIndex = -1;
    let shirazuSkip = false;
    if (shirazu && mySeat >= 0) {
      shirazuPoemIndex = shirazuPoemForSeat(
        mySeat,
        turn.roundIndex,
        poems.length,
      );
      const hand = poems[shirazuPoemIndex];
      const filled = hand ? poemMoraCount(hand) : 0;
      const remaining = SHIRAZU_MORA_PER_POEM - filled;
      if (remaining <= 0) {
        shirazuSkip = true;
        draft = "";
      } else if (
        !draft ||
        !(shirazuStyle === "free"
          ? canSubmitFreeShirazuUnit(draft, remaining)
          : canSubmitShirazuUnit(draft, remaining))
      ) {
        return;
      }
    } else if (!draft) {
      return;
    }

    if (
      roomId &&
      noMoreTmc &&
      draft &&
      completesForbiddenName(
        shirazu
          ? shirazuBeforeText(
              shirazuPoemIndex >= 0 ? poems[shirazuPoemIndex] : undefined,
            )
          : verseBeforeText(poems[0], isLineTurn(turn) ? turn.stepIndex : 0),
        draft,
      )
    ) {
      submitLockRef.current = true;
      setBusy(true);
      try {
        await banishForNoMoreTmc({ roomId, playerId: myId });
        banishRef.current();
      } catch (error) {
        setErrorMessage((error as Error).message || "破門できませんでした。");
      } finally {
        submitLockRef.current = false;
        setBusy(false);
      }
      return;
    }

    // 連打防止：同期ロック＋ボタン無効化
    // 下書きはフェード／句反映のあとで消す（完成時に最終句が一瞬消えるのを防ぐ）
    submitLockRef.current = true;
    setBusy(true);
    const poemsBefore = poems;
    if (shirazu && shirazuPoemIndex >= 0 && !shirazuSkip && draft) {
      setPoems(
        applyShirazuCharToPoem(
          poems,
          shirazuPoemIndex,
          turn.roundIndex,
          draft,
          shirazuStyle,
        ),
      );
      setLocalDraft("");
    }
    setTurn((prev) => {
      if (isShirazuTurn(prev)) {
        if (prev.submittedIds.includes(myId)) return prev;
        return {
          ...prev,
          submittedIds: [...prev.submittedIds, myId],
        };
      }
      if (isLineTurn(prev)) return { ...prev, status: "submitted" };
      return prev;
    });
    setErrorMessage("");

    // ローカル一人（俳句・短歌のみ）
    if (!roomId) {
      try {
        if (!isLineTurn(turn)) {
          setErrorMessage("この遊び方は複数人専用です。");
          return;
        }
        const writerPlayer = players.find((p) => p.id === myId);
        if (!writerPlayer) {
          setTurn((prev) =>
            isLineTurn(prev) ? { ...prev, status: "idle" } : prev,
          );
          return;
        }
        const result = applyOnlineSubmit({
          poems,
          stepIndex: turn.stepIndex,
          draft,
          writer: writerPlayer,
          playerCount: players.length,
          roster: players,
        });
        if (result.done) {
          // 白で画面を隠してから下書きを消す（下の句が一瞬消えるのを防ぐ）
          await runWhiteFade(() => {
            setLocalDraft("");
            setRevealReady(false);
            setPoems(result.poems);
            setTurn(null);
            setPhase("reveal");
            rememberPoems(result.poems);
          });
          await startRevealWriting();
        } else {
          setPoems(result.poems);
          setTurn({
            stepIndex: result.nextStep,
            writerId: result.nextWriterId,
            draft: "",
            status: "idle",
          });
          setLocalDraft("");
        }
      } finally {
        submitLockRef.current = false;
        setBusy(false);
      }
      return;
    }

    try {
      const snapshot = await submitOnlineTurn({
        roomId,
        playerId: myId,
        draft,
      });
      if (snapshot.room.phase === "reveal" && phase === "writing") {
        await enterRevealFromWriting(snapshot);
      } else {
        applySnapshot(snapshot);
        setLocalDraft("");
        if (snapshot.room.phase === "reveal") {
          await startRevealWriting();
        }
      }
    } catch (error) {
      if (isNoMoreTmcBanish(error)) {
        banishRef.current();
        return;
      }
      setErrorMessage((error as Error).message || "提出に失敗しました。");
      if (shirazu) setPoems(poemsBefore);
      setTurn((prev) => {
        if (isShirazuTurn(prev)) {
          return {
            ...prev,
            submittedIds: prev.submittedIds.filter((id) => id !== myId),
          };
        }
        if (isLineTurn(prev)) return { ...prev, status: "idle" };
        return prev;
      });
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  };

  const handlePickingTheme = async (picking: boolean) => {
    if (!roomId || !myId) return;
    try {
      await saveHostPickingTheme({ roomId, hostId: myId, picking });
    } catch (error) {
      setErrorMessage(
        (error as Error).message || "お題の準備を伝えられませんでした。",
      );
    }
  };

  const handleRematch = async (
    nextTheme: string,
    next?: { mode: VerseMode; shirazuStyle?: ShirazuStyle; kumoGakure?: boolean },
  ) => {
    const themeText = nextTheme.trim().slice(0, THEME_MAX_LENGTH);
    const verseMode = next?.mode ?? poems[0]?.mode ?? mode;
    // ローカル一人は即リスタート
    if (!roomId && players.length === 1) {
      if (verseMode === "shirazu") {
        setErrorMessage("この人数ではそのモードを開けません。");
        return;
      }
      clearRevealSeen(
        poems.length > 0
          ? `local:${poems.map((p) => p.id).filter(Boolean).join(",")}`
          : null,
      );
      startSoloLocal({
        playerId: myId,
        name: displayName,
        verseMode,
        theme: themeText,
      });
      return;
    }

    if (!roomId || !myId) return;
    setBusy(true);
    setErrorMessage("");
    try {
      clearRevealSeen(roomId);
      const snapshot = await resetRoomToLobby({
        roomId,
        hostId: myId,
        theme: themeText,
        mode: next?.mode,
        shirazuStyle: next?.shirazuStyle,
        kumoGakure: next?.kumoGakure,
      });
      applySnapshot(snapshot);
    } catch (error) {
      setErrorMessage((error as Error).message || "もう一度開けませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const me = useMemo(
    () => players.find((p) => p.id === myId) ?? null,
    [players, myId],
  );

  const handleAdvanceReveal = async () => {
    if (!roomId || !myId || busy || !me?.isHost) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const snapshot = await advanceShirazuReveal({
        roomId,
        hostId: myId,
      });
      applySnapshot(snapshot);
    } catch (error) {
      setErrorMessage((error as Error).message || "次へ進めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const mySeat = useMemo(() => shirazuSeatOf(players, myId), [players, myId]);
  const writer = useMemo(() => {
    if (!isLineTurn(turn)) return null;
    return players.find((p) => p.id === turn.writerId) ?? null;
  }, [players, turn]);

  const activePoem = poems[0] ?? null;
  const sessionSize = players.length || playerCount;

  const handPoem = useMemo(() => {
    if (!isShirazuTurn(turn) || mySeat < 0 || poems.length === 0) return null;
    const poemIndex = shirazuPoemForSeat(
      mySeat,
      turn.roundIndex,
      poems.length,
    );
    return poems[poemIndex] ?? null;
  }, [turn, mySeat, poems]);

  const promptLines = useMemo(() => {
    if (!isLineTurn(turn) || poems.length === 0) return [];
    return getPromptLines(poems[0], turn.stepIndex);
  }, [poems, turn]);

  const draftForUi = isLineTurn(turn)
    ? turn.writerId === myId
      ? localDraft
      : (turn.draft ?? "")
    : localDraft;

  const errorToast =
    toastText && typeof document !== "undefined"
      ? createPortal(
          <div
            role="alert"
            className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-10 md:pt-12"
          >
            <p
              key={toastExiting ? `out-${toastText}` : `in-${toastText}`}
              className={`max-w-md border-2 border-black bg-white px-4 py-2.5 text-center text-sm tracking-wider shadow-[2px_2px_0_#000] ${
                toastExiting ? "toast-drop-out" : "toast-drop-in"
              }`}
              onAnimationEnd={(event) => {
                if (
                  toastExiting &&
                  event.animationName === "toast-drop-out"
                ) {
                  setToastText("");
                  setToastExiting(false);
                }
              }}
            >
              {toastText}
            </p>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="relative flex h-dvh min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-white text-black select-none"
      onCopy={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
      }}
      onCut={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
      }}
      onSelectCapture={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        const sel = window.getSelection();
        sel?.removeAllRanges();
      }}
    >
      {errorToast}
      <BgmPlayer />
      <p
        aria-hidden
        className="pointer-events-none fixed top-2 right-3 z-[60] text-[10px] tracking-widest text-black/35 md:top-3 md:right-4"
      >
        {APP_VERSION}
      </p>
      <main
        className={`relative z-10 mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 pt-2 md:max-w-5xl md:px-8 md:pt-3 ${
          roomId && phase !== "home" ? "pb-24" : "pb-2 md:pb-3"
        }`}
      >
        {phase === "home" && (
          <HomeScreen
            key={homeStep}
            nickname={nickname}
            onNicknameChange={handleNicknameChange}
            poemHistory={poemHistory}
            onDeletePoemHistory={(entryId) => {
              setPoemHistory(removePoemFromHistory(entryId));
            }}
            myId={myId}
            mode={mode}
            theme={theme}
            onThemeChange={setTheme}
            shirazuStyle={shirazuStyle}
            onShirazuStyleChange={setShirazuStyle}
            playerCount={playerCount}
            onModeChange={handleModeChange}
            onPlayerCountChange={setPlayerCount}
            onCreateRoom={(count, verseMode, nextTheme, nextStyle, kumo) =>
              handleCreateRoom(count, verseMode, nextTheme, nextStyle, kumo)
            }
            onJoinRoom={(id) => {
              void handleJoinRoom(id, false);
            }}
            onSpectateRoom={(id) => {
              void handleJoinRoom(id, true);
            }}
            initialStep={homeStep}
            busy={busy}
          />
        )}

        {phase === "lobby" && (
          <ViewportFit>
            <WaitingLobby
              mode={mode}
              theme={theme}
              shirazuStyle={shirazuStyle}
              kumoGakure={kumoGakure}
              players={players}
              spectators={spectators}
              myId={myId}
              maxPlayers={playerCount}
              isHost={Boolean(me?.isHost)}
              watching={watching}
              busy={busy}
              onStart={() => {
                void handleStartGame();
              }}
              onKick={(id) => {
                void handleKick(id);
              }}
              onSuperKick={(id) => {
                void handleKick(id, true);
              }}
              onTransferHost={(id) => {
                void handleTransferHost(id);
              }}
              onBack={() => {
                void handleLobbyBack();
              }}
              onLeave={() => {
                void handleLeave();
              }}
              onNoMoreTmc={() => {
                void handleNoMoreTmc();
              }}
              noMoreTmc={noMoreTmc}
            />
          </ViewportFit>
        )}

        {phase === "writing" && watching && (
          <ViewportFit minScale={1}>
            <SpectatePhase
              poems={poems}
              theme={theme}
              shirazuStyle={shirazuStyle}
              kumoGakure={kumoGakure}
              myId={myId}
              note={
                isLineTurn(turn) && writer
                  ? `${writer.name}が書いています`
                  : ""
              }
              busy={busy}
              onLeave={() => {
                void handleLeave();
              }}
            />
          </ViewportFit>
        )}

        {phase === "writing" &&
          !watching &&
          isShirazuTurn(turn) &&
          handPoem && (
            <ViewportFit>
              <ShirazuWritingPhase
                poem={handPoem}
                roundIndex={turn.roundIndex}
                draft={localDraft}
                playerCount={sessionSize}
                submittedCount={turn.submittedIds.length}
                hasSubmitted={turn.submittedIds.includes(myId)}
                myId={myId}
                theme={theme}
                shirazuStyle={shirazuStyle}
                busy={busy}
                onDraftChange={handleDraftChange}
                onSubmit={() => {
                  void handleSubmit();
                }}
              />
            </ViewportFit>
          )}

        {phase === "writing" &&
          !watching &&
          isLineTurn(turn) &&
          writer &&
          activePoem && (
            <ViewportFit>
              <WritingPhase
                mode={activePoem.mode}
                stepIndex={turn.stepIndex}
                draft={draftForUi}
                promptLines={promptLines}
                progressLabel={null}
                playerCount={sessionSize}
                writer={writer}
                myId={myId}
                theme={theme}
                kumoGakure={kumoGakure}
                waitingForPartner={writer.id !== myId}
                isSolo={players.length === 1 && !roomId}
                busy={busy}
                onDraftChange={handleDraftChange}
                onSubmit={() => {
                  void handleSubmit();
                }}
                onBack={
                  players.length === 1 && !roomId
                    ? () => {
                        void handleLobbyBack();
                      }
                    : undefined
                }
              />
            </ViewportFit>
          )}

        {phase === "writing" && !watching && roomId && me?.isHost && (
          <KickMenu
            players={players}
            spectators={spectators}
            myId={myId}
            turn={turn}
            busy={busy}
            onKick={(id) => {
              void handleKick(id);
            }}
            onSuperKick={(id) => {
              void handleKick(id, true);
            }}
            onTransferHost={(id) => {
              void handleTransferHost(id);
            }}
            onCloseRoom={() => {
              void handleLeave();
            }}
          />
        )}

        {phase === "reveal" && poems.length > 0 && (
          <ViewportFit minScale={0.72}>
            <RevealPhase
              poems={poems}
              theme={theme}
              shirazuStyle={shirazuStyle}
              kumoGakure={kumoGakure}
              roomId={roomId}
              revealReady={revealReady}
              revealPoemIndex={
                isShirazuRevealTurn(turn) ? turn.poemIndex : null
              }
              isHost={Boolean(me?.isHost)}
              myId={myId}
              advancing={busy}
              onAdvanceReveal={() => {
                void handleAdvanceReveal();
              }}
              canRematch={
                !watching &&
                (Boolean(me?.isHost) || (!roomId && players.length === 1))
              }
              hostPresent={players.some((p) => p.isHost)}
              hostPickingTheme={hostPickingTheme}
              isSolo={players.length === 1}
              playerCount={players.length}
              onPickingThemeChange={(picking) => {
                void handlePickingTheme(picking);
              }}
              onRematch={(nextTheme, next) => {
                void handleRematch(nextTheme, next);
              }}
              onHome={() => {
                void handleLeave();
              }}
            />
          </ViewportFit>
        )}

        {canStamp && <StampPicker onSelect={handleStamp} />}
      </main>

      {roomId && myId && phase !== "home" ? (
        <NicoChat
          key={roomId}
          roomId={roomId}
          playerId={myId}
          name={
            players.find((p) => p.id === myId)?.name ||
            spectators.find((p) => p.id === myId)?.name ||
            displayName
          }
        />
      ) : null}

      {canStamp && <StampBalloons balloons={balloons} onDone={removeBalloon} />}

      {/* 完成→披露などの画面切替用白フェード */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 bg-white"
        style={{
          opacity: phaseVeil,
          transition: `opacity ${phaseVeilMs}ms ease-in-out`,
        }}
      />

      {/* 白フェード（z-50）より下に置き、画面ごと白へ溶けて戻る */}
      {banished && (
        <div
          role="alert"
          className="pointer-events-none fixed inset-0 z-[45] flex items-center justify-center"
        >
          <p
            className="text-8xl tracking-[0.3em] md:text-[12rem]"
            style={{
              textShadow:
                "0 0 12px #fff, 0 0 24px #fff, 0 0 4px #fff, 0 0 2px #fff",
            }}
          >
            {banishWord}
          </p>
        </div>
      )}

      <NoMoreTmcOverlay playId={tmcPlayId} />
    </div>
  );
}
