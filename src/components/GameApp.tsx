"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeScreen } from "@/components/HomeScreen";
import { RevealPhase } from "@/components/RevealPhase";
import { WaitingLobby } from "@/components/WaitingLobby";
import { WritingPhase } from "@/components/WritingPhase";
import { EMPTY_FALLBACK } from "@/lib/constants";
import { assignPartIndexes, writerForStep } from "@/lib/roles";
import {
  clampShirazuDraft,
  locateShirazuStep,
  normalizeShirazuMora,
  shirazuProgressLabel,
} from "@/lib/shirazu";
import {
  clampPlayerCount,
  clampText,
  createBlankPoems,
  defaultNickname,
  finalizeLine,
  getPromptLines,
  partLimit,
  playerColor,
  randomRoomCode,
  totalSteps,
  uid,
} from "@/lib/utils";
import type {
  GamePhase,
  Player,
  Poem,
  TurnState,
  VerseMode,
} from "@/types/game";

const MY_ID = "player_me";
const SHIRAZU_AUTHOR = {
  authorId: "shirazu",
  authorName: "詠み人知らず",
} as const;

/** いまの対局は人間だけ。選んだ人数分の担当はすべてこの人に付ける。 */
function createHumanRoster(
  humanName: string,
  mode: VerseMode,
  playerCount: number,
): Player[] {
  const count = clampPlayerCount(mode, playerCount);
  const parts = assignPartIndexes(count, mode);
  return [
    {
      id: MY_ID,
      name: humanName.trim() || defaultNickname(),
      isBot: false,
      isHost: true,
      color: playerColor(0),
      partIndexes: parts.flat(),
    },
  ];
}

function applyLine(
  poem: Poem,
  stepIndex: number,
  text: string,
  writer: Player,
): Poem {
  const limit = partLimit(poem.mode, stepIndex);
  const line = {
    text: finalizeLine(clampText(text, limit)) || EMPTY_FALLBACK,
    authorId: writer.id,
    authorName: writer.name,
  };
  const lines = [...poem.lines];
  lines[stepIndex] = line;
  return { ...poem, lines };
}

function applyShirazuChar(
  poems: Poem[],
  stepIndex: number,
  raw: string,
): Poem[] {
  const unit = normalizeShirazuMora(raw) || "ん";
  const { poemIndex, lineIndex } = locateShirazuStep(stepIndex);
  return poems.map((poem, pi) => {
    if (pi !== poemIndex) return poem;
    const lines = [...poem.lines];
    const prev = lines[lineIndex]?.text ?? "";
    lines[lineIndex] = {
      text: prev + unit,
      ...SHIRAZU_AUTHOR,
    };
    return { ...poem, lines };
  });
}

export function GameApp() {
  const [phase, setPhase] = useState<GamePhase>("home");
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<VerseMode>("haiku");
  const [playerCount, setPlayerCount] = useState(2);
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [sessionSize, setSessionSize] = useState(2);

  const advancing = useRef(false);
  const turnRef = useRef(turn);
  const poemsRef = useRef(poems);
  const playersRef = useRef(players);

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);
  useEffect(() => {
    poemsRef.current = poems;
  }, [poems]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const handleModeChange = useCallback((next: VerseMode) => {
    setMode(next);
    setPlayerCount((prev) => clampPlayerCount(next, prev));
  }, []);

  const beginStep = useCallback(
    (stepIndex: number, nextPoems: Poem[], roster: Player[]) => {
      advancing.current = false;
      const writer = writerForStep(roster, stepIndex);

      setPoems(nextPoems);
      setTurn({
        stepIndex,
        writerId: writer.id,
        draft: "",
        status: "idle",
      });
      setPhase("writing");
    },
    [],
  );

  const enterLobby = useCallback(
    (code: string) => {
      advancing.current = false;
      const size = clampPlayerCount(mode, playerCount);
      const roster = createHumanRoster(nickname, mode, size);
      setSessionSize(size);
      setNickname(roster[0].name);
      setRoomCode(code);
      setPlayers(roster);
      setPoems([]);
      setTurn(null);
      setPhase("lobby");
    },
    [nickname, mode, playerCount],
  );

  const handleCreateRoom = () => enterLobby(randomRoomCode());
  const handleJoinRoom = (code: string) => enterLobby(code);

  const handleLeave = () => {
    setPhase("home");
    setPlayers([]);
    setPoems([]);
    setTurn(null);
  };

  const handleStartGame = () => {
    beginStep(0, createBlankPoems(mode, sessionSize, uid("poem")), players);
  };

  const advanceAfterSubmit = useCallback(
    (submitted: TurnState) => {
      if (advancing.current) return;
      advancing.current = true;

      const roster = playersRef.current;
      const currentPoems = poemsRef.current;
      if (currentPoems.length === 0) {
        advancing.current = false;
        return;
      }

      const writer = roster.find((p) => p.id === submitted.writerId);
      if (!writer) {
        advancing.current = false;
        return;
      }

      const verseMode = currentPoems[0].mode;
      const updated =
        verseMode === "shirazu"
          ? applyShirazuChar(currentPoems, submitted.stepIndex, submitted.draft)
          : [
              applyLine(
                currentPoems[0],
                submitted.stepIndex,
                submitted.draft,
                writer,
              ),
            ];

      const total = totalSteps(verseMode, sessionSize);

      if (submitted.stepIndex >= total - 1) {
        setPoems(updated);
        setTurn(null);
        setPhase("reveal");
        advancing.current = false;
        return;
      }

      beginStep(submitted.stepIndex + 1, updated, roster);
    },
    [beginStep, sessionSize],
  );

  useEffect(() => {
    if (phase !== "writing" || !turn) return;
    if (turn.status !== "submitted") return;
    const id = window.setTimeout(() => advanceAfterSubmit(turn), 450);
    return () => window.clearTimeout(id);
  }, [phase, turn, advanceAfterSubmit]);

  const writer = useMemo(() => {
    if (!turn) return null;
    return players.find((p) => p.id === turn.writerId) ?? null;
  }, [players, turn]);

  const activePoem = poems[0] ?? null;

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

  const handleDraftChange = (value: string) => {
    if (!turn || turn.writerId !== MY_ID || turn.status === "submitted") return;
    const isShirazu = poems[0]?.mode === "shirazu";
    const next = isShirazu
      ? clampShirazuDraft(value)
      : clampText(
          value,
          partLimit(poems[0]?.mode ?? mode, turn.stepIndex),
        );
    setTurn({
      ...turn,
      draft: next,
      status: next.length > 0 ? "typing" : "idle",
    });
  };

  const handleSubmit = () => {
    if (!turn || turn.writerId !== MY_ID || turn.status === "submitted") return;
    if (poems[0]?.mode === "shirazu") {
      const unit = normalizeShirazuMora(turn.draft);
      if (!unit) return;
      setTurn({ ...turn, draft: unit, status: "submitted" });
      return;
    }
    if (!turn.draft.trim()) return;
    setTurn({ ...turn, status: "submitted" });
  };

  const handleRematch = () => enterLobby(randomRoomCode());

  return (
    <div className="relative min-h-full flex-1 overflow-hidden bg-white text-black">
      <main className="relative z-10 mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-8 sm:px-6 sm:py-10">
        {phase === "home" && (
          <HomeScreen
            nickname={nickname}
            onNicknameChange={setNickname}
            mode={mode}
            playerCount={playerCount}
            onModeChange={handleModeChange}
            onPlayerCountChange={setPlayerCount}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
          />
        )}

        {phase === "lobby" && (
          <WaitingLobby
            roomCode={roomCode}
            mode={mode}
            players={players}
            isHost
            onStart={handleStartGame}
            onLeave={handleLeave}
          />
        )}

        {phase === "writing" && turn && writer && activePoem && (
          <WritingPhase
            mode={activePoem.mode}
            stepIndex={turn.stepIndex}
            draft={turn.draft}
            promptLines={promptLines}
            progressLabel={progressLabel}
            playerCount={sessionSize}
            writer={writer}
            myId={MY_ID}
            waitingForPartner={false}
            onDraftChange={handleDraftChange}
            onSubmit={handleSubmit}
          />
        )}

        {phase === "reveal" && poems.length > 0 && (
          <RevealPhase
            poems={poems}
            onRematch={handleRematch}
            onHome={handleLeave}
          />
        )}
      </main>
    </div>
  );
}
