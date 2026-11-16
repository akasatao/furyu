"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeScreen } from "@/components/HomeScreen";
import { RevealPhase } from "@/components/RevealPhase";
import { WaitingLobby } from "@/components/WaitingLobby";
import { WritingPhase } from "@/components/WritingPhase";
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
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  clampPlayerCount,
  clampText,
  defaultNickname,
  getPromptLines,
  partLimit,
} from "@/lib/utils";
import type {
  GamePhase,
  Player,
  Poem,
  TurnState,
  VerseMode,
} from "@/types/game";

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

  const subRef = useRef<RoomSubscription | null>(null);

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
        (snapshot) => applySnapshot(snapshot),
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

  const handleCreateRoom = async () => {
    if (!isSupabaseConfigured()) {
      setErrorMessage("Supabase の設定がありません。");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      const playerId = myId || getOrCreatePlayerId();
      setMyId(playerId);
      const snapshot = await createOnlineRoom({
        playerId,
        nickname: displayName,
        mode,
        maxPlayers: clampPlayerCount(mode, playerCount),
      });
      setNickname(displayName);
      applySnapshot(snapshot);
      watchRoom(snapshot.room.id);
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
    setBusy(true);
    setErrorMessage("");
    try {
      const playerId = myId || getOrCreatePlayerId();
      setMyId(playerId);
      const snapshot = await joinOnlineRoom({
        code,
        playerId,
        nickname: displayName,
      });
      setNickname(displayName);
      applySnapshot(snapshot);
      watchRoom(snapshot.room.id);
    } catch (error) {
      setErrorMessage((error as Error).message || "入室できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    clearSubscription();
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
    setPhase("home");
    setRoomId(null);
    setRoomCode("");
    setPlayers([]);
    setPoems([]);
    setTurn(null);
    setLocalDraft("");
    setErrorMessage("");
  };

  const handleStartGame = async () => {
    if (!roomId || !myId) return;
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
    if (!roomId || !turn || turn.writerId !== myId || busy) return;
    const draft =
      poems[0]?.mode === "shirazu"
        ? normalizeShirazuMora(localDraft)
        : localDraft.trim();
    if (!draft) return;

    setBusy(true);
    setErrorMessage("");
    try {
      const snapshot = await submitOnlineTurn({
        roomId,
        playerId: myId,
        draft,
      });
      setLocalDraft("");
      applySnapshot(snapshot);
    } catch (error) {
      setErrorMessage((error as Error).message || "提出に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const handleRematch = async () => {
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
            nickname={nickname}
            onNicknameChange={setNickname}
            mode={mode}
            playerCount={playerCount}
            onModeChange={handleModeChange}
            onPlayerCountChange={setPlayerCount}
            onCreateRoom={() => {
              void handleCreateRoom();
            }}
            onJoinRoom={(code) => {
              void handleJoinRoom(code);
            }}
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
            onDraftChange={handleDraftChange}
            onSubmit={() => {
              void handleSubmit();
            }}
          />
        )}

        {phase === "reveal" && poems.length > 0 && (
          <RevealPhase
            poems={poems}
            canRematch={Boolean(me?.isHost)}
            onRematch={() => {
              void handleRematch();
            }}
            onHome={() => {
              void handleLeave();
            }}
          />
        )}
      </main>
    </div>
  );
}
