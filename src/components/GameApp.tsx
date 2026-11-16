"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { HomeScreen, type HomeStep } from "@/components/HomeScreen";
import { RevealPhase } from "@/components/RevealPhase";
import { WaitingLobby } from "@/components/WaitingLobby";
import { WritingPhase } from "@/components/WritingPhase";
import { modeAllowsSolo } from "@/lib/constants";
import { getOrCreatePlayerId } from "@/lib/online/player-id";
import {
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
  clampShirazuDraft,
  locateShirazuStep,
  normalizeShirazuMora,
  shirazuProgressLabel,
} from "@/lib/shirazu";
import { applyOnlineSubmit } from "@/lib/online/submit";
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
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [myId, setMyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [localDraft, setLocalDraft] = useState("");
  const [phaseVeil, setPhaseVeil] = useState(0);
  const [phaseVeilMs, setPhaseVeilMs] = useState(PHASE_FADE_MS);
  /** 白フェードが終わってから短冊の書き出しを始める */
  const [revealReady, setRevealReady] = useState(false);
  const [homeStep, setHomeStep] = useState<HomeStep>("mode");

  const subRef = useRef<RoomSubscription | null>(null);
  const fadingRef = useRef(false);
  const submitLockRef = useRef(false);
  /** ロビーの「戻る」で戻すホーム画面 */
  const lobbyBackStepRef = useRef<HomeStep>("mode");

  useEffect(() => {
    setMyId(getOrCreatePlayerId());
  }, []);

  const applySnapshot = useCallback(
    (snapshot: OnlineRoomSnapshot) => {
      setRoomId(snapshot.room.id);
      setRoomCode(snapshot.room.code);
      setMode(snapshot.room.mode);
      setPlayerCount(snapshot.room.max_players);
      setPlayers(snapshot.players);
      setPoems(snapshot.room.poems ?? []);
      setTurn(snapshot.room.turn);
      setPhase(snapshot.room.phase);
      // 自分の番でなければローカル下書きを捨てる
      if (
        !snapshot.room.turn ||
        snapshot.room.turn.writerId !== myId ||
        snapshot.room.turn.status === "submitted"
      ) {
        setLocalDraft("");
      }
    },
    [myId],
  );

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
    (options?: { playerId?: string; name?: string; verseMode?: VerseMode }) => {
      const playerId =
        options?.playerId || myId || getOrCreatePlayerId();
      const name = options?.name || displayName;
      const verseMode = options?.verseMode || mode;
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
      setPlayerCount(1);
      setRoomId(null);
      setRoomCode("");
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
    [displayName, mode, myId],
  );

  const handleCreateRoom = async (count?: number, verseMode?: VerseMode) => {
    const activeMode = verseMode ?? mode;
    const maxPlayers = clampPlayerCount(activeMode, count ?? playerCount);
    if (verseMode) setMode(activeMode);
    setPlayerCount(maxPlayers);
    // ソロ可モードの複数人は「どう詠む？」へ戻す。リレーはモード選択へ
    lobbyBackStepRef.current = modeAllowsSolo(activeMode) ? "setup" : "mode";
    // 一人はローカルですぐ詠み始める（部屋作成の待ち時間なし）
    if (maxPlayers === 1) {
      setBusy(true);
      try {
        await runWhiteFade(
          () => {
            flushSync(() => {
              startSoloLocal({ verseMode: activeMode });
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

  const handleJoinRoom = async (code: string) => {
    if (!isSupabaseConfigured()) {
      setErrorMessage("Supabase の設定がありません。");
      return;
    }
    lobbyBackStepRef.current = "mode";
    setBusy(true);
    setErrorMessage("");
    try {
      await runWhiteFade(
        async () => {
          const playerId = myId || getOrCreatePlayerId();
          setMyId(playerId);
          const snapshot = await joinOnlineRoom({
            code,
            playerId,
            nickname: displayName,
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
            setRoomCode("");
            setPlayers([]);
            setPoems([]);
            setTurn(null);
            setLocalDraft("");
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
    if (!turn || turn.writerId !== myId || turn.status === "submitted") return;
    const isShirazu = poems[0]?.mode === "shirazu";
    const next = isShirazu
      ? clampShirazuDraft(value)
      : clampText(value, partLimit(poems[0]?.mode ?? mode, turn.stepIndex));
    setLocalDraft(next);
  };

  const handleSubmit = async () => {
    if (
      !turn ||
      turn.writerId !== myId ||
      busy ||
      submitLockRef.current ||
      fadingRef.current ||
      turn.status === "submitted"
    ) {
      return;
    }
    const draft =
      poems[0]?.mode === "shirazu"
        ? normalizeShirazuMora(localDraft)
        : localDraft.trim();
    if (!draft) return;

    // 連打防止：同期ロック＋ボタン無効化
    submitLockRef.current = true;
    setBusy(true);
    setTurn((prev) => (prev ? { ...prev, status: "submitted" } : prev));
    setErrorMessage("");

    // ローカル一人
    if (!roomId) {
      try {
        const writerPlayer = players.find((p) => p.id === myId);
        if (!writerPlayer) {
          setTurn((prev) => (prev ? { ...prev, status: "idle" } : prev));
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
          });
          await startRevealWriting();
        } else {
          setLocalDraft("");
          setPoems(result.poems);
          setTurn({
            stepIndex: result.nextStep,
            writerId: result.nextWriterId,
            draft: "",
            status: "idle",
          });
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
        await runWhiteFade(() => {
          setLocalDraft("");
          setRevealReady(false);
          applySnapshot(snapshot);
        });
        await startRevealWriting();
      } else {
        setLocalDraft("");
        applySnapshot(snapshot);
        if (snapshot.room.phase === "reveal") {
          await startRevealWriting();
        }
      }
    } catch (error) {
      setErrorMessage((error as Error).message || "提出に失敗しました。");
      setTurn((prev) => (prev ? { ...prev, status: "idle" } : prev));
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
  const writer = useMemo(() => {
    if (!turn) return null;
    return players.find((p) => p.id === turn.writerId) ?? null;
  }, [players, turn]);

  const activePoem = poems[0] ?? null;
  const sessionSize = players.length || playerCount;

  const promptLines = useMemo(() => {
    if (!turn || poems.length === 0) return [];
    if (poems[0].mode === "shirazu") {
      const { poemIndex, lineIndex } = locateShirazuStep(turn.stepIndex);
      const poem = poems[poemIndex];
      if (!poem) return [];
      return poem.lines
        .slice(0, lineIndex + 1)
        .filter((l): l is NonNullable<typeof l> => l != null && l.text.length > 0);
    }
    return getPromptLines(poems[0], turn.stepIndex);
  }, [poems, turn]);

  const progressLabel = useMemo(() => {
    if (!turn || poems.length === 0) return null;
    if (poems[0].mode === "shirazu") {
      return shirazuProgressLabel(turn.stepIndex, sessionSize);
    }
    return null;
  }, [poems, turn, sessionSize]);

  const draftForUi =
    turn && turn.writerId === myId ? localDraft : (turn?.draft ?? "");

  return (
    <div className="relative flex h-dvh flex-1 flex-col overflow-hidden bg-white text-black md:h-auto md:min-h-dvh md:overflow-visible">
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 py-3 md:px-6 md:py-10">
        {errorMessage && (
          <p className="mx-auto mb-2 w-full max-w-md shrink-0 text-center text-sm underline md:mb-4">
            {errorMessage}
          </p>
        )}

        {phase === "home" && (
          <HomeScreen
            key={homeStep}
            nickname={nickname}
            onNicknameChange={setNickname}
            mode={mode}
            playerCount={playerCount}
            onModeChange={handleModeChange}
            onPlayerCountChange={setPlayerCount}
            onCreateRoom={(count, verseMode) =>
              handleCreateRoom(count, verseMode)
            }
            onJoinRoom={(code) => {
              void handleJoinRoom(code);
            }}
            initialStep={homeStep}
            busy={busy}
          />
        )}

        {phase === "lobby" && (
          <WaitingLobby
            roomCode={roomCode}
            mode={mode}
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
        )}

        {phase === "writing" && turn && writer && activePoem && (
          <WritingPhase
            mode={activePoem.mode}
            stepIndex={turn.stepIndex}
            draft={draftForUi}
            promptLines={promptLines}
            progressLabel={progressLabel}
            playerCount={sessionSize}
            writer={writer}
            myId={myId}
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
        )}

        {phase === "reveal" && poems.length > 0 && (
          <RevealPhase
            poems={poems}
            revealReady={revealReady}
            canRematch={Boolean(me?.isHost) || (!roomId && players.length === 1)}
            isSolo={players.length === 1}
            onRematch={() => {
              void handleRematch();
            }}
            onHome={() => {
              void handleLeave();
            }}
          />
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
