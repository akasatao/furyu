"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { BgmPlayer } from "@/components/BgmPlayer";
import { ViewportFit } from "@/components/ViewportFit";
import { HomeScreen, type HomeStep } from "@/components/HomeScreen";
import { RevealPhase } from "@/components/RevealPhase";
import { ShirazuWritingPhase } from "@/components/ShirazuWritingPhase";
import { WaitingLobby } from "@/components/WaitingLobby";
import { WritingPhase } from "@/components/WritingPhase";
import { APP_VERSION } from "@/lib/app-version";
import { modeAllowsSolo, THEME_MAX_LENGTH } from "@/lib/constants";
import { loadNickname, saveNickname } from "@/lib/online/nickname";
import { getOrCreatePlayerId } from "@/lib/online/player-id";
import {
  appendPoemsToHistory,
  loadPoemHistory,
  type PoemHistoryEntry,
} from "@/lib/online/poem-history";
import {
  advanceShirazuReveal,
  createOnlineRoom,
  joinOnlineRoom,
  leaveOnlineRoom,
  resetRoomToLobby,
  startOnlineGame,
  submitOnlineTurn,
  subscribeOnlineRoom,
  type RoomSubscription,
} from "@/lib/online/rooms";
import type { OnlineRoomSnapshot } from "@/lib/online/types";
import {
  canSubmitShirazuUnit,
  clampShirazuDraft,
  normalizeShirazuMora,
  poemMoraCount,
  SHIRAZU_MORA_PER_POEM,
  shirazuPoemForSeat,
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
  TurnState,
  VerseMode,
} from "@/types/game";
import { isLineTurn, isShirazuRevealTurn, isShirazuTurn } from "@/types/game";

/** 完成→披露用（長め） */
const PHASE_FADE_MS = 1100;
const PHASE_HOLD_MS = 280;
/** ホーム↔ロビー／ソロ開始など（従来の速さ） */
const NAV_FADE_MS = 420;
const NAV_HOLD_MS = 120;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function GameApp() {
  const [phase, setPhase] = useState<GamePhase>("home");
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<VerseMode>("haiku");
  const [playerCount, setPlayerCount] = useState(2);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
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

  const subRef = useRef<RoomSubscription | null>(null);
  const fadingRef = useRef(false);
  const submitLockRef = useRef(false);
  /** 同じ対局の句を二重保存しない */
  const historySavedKeyRef = useRef("");
  /** ロビーの「戻る」で戻すホーム画面 */
  const lobbyBackStepRef = useRef<HomeStep>("mode");

  useEffect(() => {
    setMyId(getOrCreatePlayerId());
    setNickname(loadNickname());
    setPoemHistory(loadPoemHistory());
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
      setRoomId(snapshot.room.id);
      setMode(snapshot.room.mode);
      setPlayerCount(snapshot.room.max_players);
      setPlayers(snapshot.players);
      setTheme(
        typeof snapshot.room.theme === "string" ? snapshot.room.theme : "",
      );
      const nextPoems = snapshot.room.poems ?? [];
      setPoems(nextPoems);
      setTurn(snapshot.room.turn);
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

  const clearSubscription = useCallback(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
  }, []);

  const watchRoom = useCallback(
    (id: string) => {
      clearSubscription();
      subRef.current = subscribeOnlineRoom(
        id,
        (snapshot) => {
          applySnapshot(snapshot);
          // 自分がフェード中でなければ、披露開始をそのまま許可
          if (snapshot.room.phase === "reveal" && !fadingRef.current) {
            setRevealReady(true);
          }
        },
        (error) => setErrorMessage(error.message),
      );
    },
    [applySnapshot, clearSubscription],
  );

  useEffect(() => () => clearSubscription(), [clearSubscription]);

  const handleModeChange = useCallback((next: VerseMode) => {
    setErrorMessage("");
    setMode(next);
    setPlayerCount((prev) => clampPlayerCount(next, prev));
  }, []);

  const displayName = nickname.trim() || defaultNickname();

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
  ) => {
    const activeMode = verseMode ?? mode;
    const maxPlayers = clampPlayerCount(activeMode, count ?? playerCount);
    const activeTheme =
      themeOverride !== undefined
        ? themeOverride.trim().slice(0, THEME_MAX_LENGTH)
        : theme;
    if (verseMode) setMode(activeMode);
    if (themeOverride !== undefined) setTheme(activeTheme);
    setPlayerCount(maxPlayers);
    // ソロ可モードの複数人は「どう詠む？」へ。リレーはお題へ
    lobbyBackStepRef.current = modeAllowsSolo(activeMode) ? "setup" : "theme";
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

  const handleJoinRoom = async (targetRoomId: string) => {
    if (!isSupabaseConfigured()) {
      setErrorMessage("Supabase の設定がありません。");
      return;
    }
    lobbyBackStepRef.current = "rooms";
    setBusy(true);
    setErrorMessage("");
    try {
      const playerId = myId || getOrCreatePlayerId();
      setMyId(playerId);
      // 失敗時はフェードなしでエラー表示
      const snapshot = await joinOnlineRoom({
        roomId: targetRoomId,
        playerId,
        nickname: displayName,
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
    } catch (error) {
      setErrorMessage((error as Error).message || "入室できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const leaveRoomAndGoHome = async (nextHomeStep: HomeStep) => {
    setBusy(true);
    try {
      await runWhiteFade(
        async () => {
          clearSubscription();
          // ローカル一人はネット退出不要
          if (roomId && myId) {
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
            setHomeStep(nextHomeStep);
            setPhase("home");
            setRoomId(null);
            setPlayers([]);
            setPoems([]);
            setTurn(null);
            setLocalDraft("");
            setTheme("");
            setErrorMessage("");
          });
        },
        { fadeMs: NAV_FADE_MS, holdMs: NAV_HOLD_MS },
      );
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
      applySnapshot(snapshot);
    } catch (error) {
      setErrorMessage((error as Error).message || "開宴できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleDraftChange = (value: string) => {
    if (!turn) return;
    if (isShirazuTurn(turn)) {
      if (turn.submittedIds.includes(myId)) return;
      setLocalDraft(clampShirazuDraft(value));
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
      ? normalizeShirazuMora(localDraft)
      : localDraft.trim();

    let shirazuPoemIndex = -1;
    let shirazuSkip = false;
    if (shirazu && mySeat >= 0) {
      shirazuPoemIndex = shirazuPoemForSeat(
        mySeat,
        turn.roundIndex,
        players.length,
      );
      const hand = poems[shirazuPoemIndex];
      const filled = hand ? poemMoraCount(hand) : 0;
      const remaining = SHIRAZU_MORA_PER_POEM - filled;
      if (remaining <= 0) {
        shirazuSkip = true;
        draft = "";
      } else if (!draft || !canSubmitShirazuUnit(draft, remaining)) {
        return;
      }
    } else if (!draft) {
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
        const shirazuReveal = isShirazuRevealTurn(snapshot.room.turn);
        await runWhiteFade(() => {
          setLocalDraft("");
          // リレー披露前は即待ち画面。俳句／短歌のみ空枠→書き出し用に false
          setRevealReady(shirazuReveal);
          applySnapshot(snapshot);
        });
        if (!shirazuReveal) {
          await startRevealWriting();
        }
      } else {
        applySnapshot(snapshot);
        setLocalDraft("");
        if (snapshot.room.phase === "reveal") {
          await startRevealWriting();
        }
      }
    } catch (error) {
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

  const handleRematch = async () => {
    // ローカル一人は即リスタート
    if (!roomId && players.length === 1) {
      startSoloLocal({
        playerId: myId,
        name: displayName,
        verseMode: poems[0]?.mode ?? mode,
      });
      return;
    }

    if (!roomId || !myId) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const snapshot = await resetRoomToLobby({ roomId, hostId: myId });
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

  const mySeat = useMemo(
    () => players.findIndex((p) => p.id === myId),
    [players, myId],
  );
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
      players.length,
    );
    return poems[poemIndex] ?? null;
  }, [turn, mySeat, poems, players.length]);

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
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 py-2 md:max-w-5xl md:px-8 md:py-3">
        {phase === "home" && (
          <HomeScreen
            key={homeStep}
            nickname={nickname}
            onNicknameChange={handleNicknameChange}
            poemHistory={poemHistory}
            myId={myId}
            mode={mode}
            theme={theme}
            onThemeChange={setTheme}
            playerCount={playerCount}
            onModeChange={handleModeChange}
            onPlayerCountChange={setPlayerCount}
            onCreateRoom={(count, verseMode, nextTheme) =>
              handleCreateRoom(count, verseMode, nextTheme)
            }
            onJoinRoom={(id) => {
              void handleJoinRoom(id);
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
              players={players}
              myId={myId}
              maxPlayers={playerCount}
              isHost={Boolean(me?.isHost)}
              busy={busy}
              onStart={() => {
                void handleStartGame();
              }}
              onBack={() => {
                void handleLobbyBack();
              }}
              onLeave={() => {
                void handleLeave();
              }}
            />
          </ViewportFit>
        )}

        {phase === "writing" &&
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
                busy={busy}
                onDraftChange={handleDraftChange}
                onSubmit={() => {
                  void handleSubmit();
                }}
              />
            </ViewportFit>
          )}

        {phase === "writing" &&
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

        {phase === "reveal" && poems.length > 0 && (
          <ViewportFit minScale={0.72}>
            <RevealPhase
              poems={poems}
              theme={theme}
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
              canRematch={Boolean(me?.isHost) || (!roomId && players.length === 1)}
              hostPresent={players.some((p) => p.isHost)}
              isSolo={players.length === 1}
              onRematch={() => {
                void handleRematch();
              }}
              onHome={() => {
                void handleLeave();
              }}
            />
          </ViewportFit>
        )}
      </main>

      {/* 完成→披露などの画面切替用白フェード */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 bg-white"
        style={{
          opacity: phaseVeil,
          transition: `opacity ${phaseVeilMs}ms ease-in-out`,
        }}
      />
    </div>
  );
}
