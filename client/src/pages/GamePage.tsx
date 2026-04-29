import { useState, useEffect, useCallback, useRef } from "react";
import { useWindowWidth } from "../utils/useWindowWidth";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type {
  Game,
  Puzzle,
  GameParticipant,
  GameCell,
  GameMove,
  User,
  GameCompletePayload,
  GameAbandonedPayload,
  CursorMovedPayload,
  CellUpdatedPayload,
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  RoomJoinedPayload,
  SpectatorCountPayload,
} from "@multicross/shared";
import type { PuzzleStats } from "@multicross/shared";
import { getGame, getPuzzle, abandonGame, getPuzzleStats, ratePuzzle, getGameHistory, reportPlayer, joinGameById, getSpectatorCount } from "../api/client";
import { ws } from "../ws/socket";
import CrosswordGrid from "../components/CrosswordGrid";
import ReplayControls from "../components/ReplayControls";
import { useReplay } from "../hooks/useReplay";

interface CursorPos {
  row: number;
  col: number;
}

// Server returns displayName as an extra field alongside the typed GameParticipant
type ParticipantWithName = GameParticipant & { displayName?: string };

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "1.4rem",
            padding: "0 1px",
            color: n <= (value ?? 0) ? "#f59e0b" : "#d1d5db",
            lineHeight: 1,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSpectating = searchParams.get("spectate") === "true";

  const currentUser: User | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null");
    } catch {
      return null;
    }
  })();

  // ── Core game state ──────────────────────────────────────────────────────────

  const [game, setGame] = useState<Game | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithName[]>([]);
  const [cells, setCells] = useState<GameCell[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPos>>({});
  const [completion, setCompletion] = useState<GameCompletePayload | null>(null);
  const [gameEnded, setGameEnded] = useState<{ status: "abandoned" | "expired" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const startTimeRef = useRef<number>(Date.now());

  // ── WS lifecycle flag ────────────────────────────────────────────────────────
  // null = loading, false = game is over (no WS), true = game is live (WS active)
  const [isLiveGame, setIsLiveGame] = useState<boolean | null>(null);

  // ── View mode (read-only completed puzzle) ──────────────────────────────────
  const [viewMode, setViewMode] = useState(false);
  const [historyMoves, setHistoryMoves] = useState<GameMove[]>([]);
  const [historyHasFull, setHistoryHasFull] = useState(false);
  const [replayActive, setReplayActive] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState("");

  // ── Header UI state ──────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [showColors, setShowColors] = useState(true);
  const [lockCorrect, setLockCorrect] = useState(false);
  const [lockWord, setLockWord] = useState(false);
  const [skipFilled, setSkipFilled] = useState(false);
  const [abandonLoading, setAbandonLoading] = useState(false);

  // ── Spectator state ──────────────────────────────────────────────────────────
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [joiningFromSpectate, setJoiningFromSpectate] = useState(false);

  // ── Report state ─────────────────────────────────────────────────────────────
  const [reportTarget, setReportTarget] = useState<ParticipantWithName | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);

  // ── Rating state ─────────────────────────────────────────────────────────────
  const [ratingDifficulty, setRatingDifficulty] = useState<number | null>(null);
  const [ratingEnjoyment, setRatingEnjoyment] = useState<number | null>(null);
  const [ratingStats, setRatingStats] = useState<PuzzleStats | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState("");

  // ── Replay ───────────────────────────────────────────────────────────────────
  const {
    replayCells,
    currentStep: replayCurrentStep,
    totalSteps: replayTotalSteps,
    playing: replayPlaying,
    speed: replaySpeed,
    play: replayPlay,
    pause: replayPause,
    setSpeed: setReplaySpeed,
    reset: replayReset,
  } = useReplay(historyMoves, gameId ?? "");

  // ── Effect 1: load game data (REST only — no WS) ────────────────────────────
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    getGame(gameId, isSpectating ? { spectate: true } : undefined)
      .then(async ({ game, participants, cells }) => {
        if (cancelled) return;
        setGame(game);
        setParticipants(participants as ParticipantWithName[]);
        setCells(cells);

        if (game.status === "complete") {
          setViewMode(true);
          setIsLiveGame(false);
        } else if (game.status === "abandoned" || game.status === "expired") {
          setGameEnded({ status: game.status });
          setIsLiveGame(false);
        } else {
          setIsLiveGame(true);
          // Fetch initial spectator count so the header is correct before any WS event arrives
          getSpectatorCount(game.id)
            .then(({ count }) => { if (!cancelled) setSpectatorCount(count); })
            .catch(() => {});
        }

        const { puzzle } = await getPuzzle(game.puzzleId);
        if (!cancelled) {
          setPuzzle(puzzle);
          startTimeRef.current = Date.now();
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load game");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [gameId, isSpectating]);

  // ── Effect 2: connect WS only for live games ────────────────────────────────
  useEffect(() => {
    if (isLiveGame !== true || !gameId) return;
    const token = localStorage.getItem("multicross_token") ?? "";
    ws.connect(token);
    return () => {
      // Spectators don't emit leave_room — their socket disconnect handles cleanup
      if (!isSpectating && currentUser) ws.emit("leave_room", { gameId, userId: currentUser.id });
      ws.disconnect();
    };
  }, [isLiveGame, gameId, isSpectating]);

  // ── Effect 3: join/spectate room on WS connect (and reconnect) ─────────────
  useEffect(() => {
    if (isLiveGame !== true || !gameId || !currentUser) return;
    const unsub = ws.onConnect(() => {
      if (isSpectating) {
        ws.emit("spectate_room", { gameId });
      } else {
        ws.emit("join_room", { gameId, userId: currentUser.id });
      }
    });
    return unsub;
  }, [isLiveGame, gameId, isSpectating]);

  // ── Effect 4: restore cursor positions from room_joined ─────────────────────
  useEffect(() => {
    if (isLiveGame !== true) return;
    const unsubRoomJoined = ws.on("room_joined", (payload: RoomJoinedPayload) => {
      if (payload.cursors && Object.keys(payload.cursors).length > 0) {
        setCursors(payload.cursors);
      }
    });
    return unsubRoomJoined;
  }, [isLiveGame]);

  // ── Effect 5: WS event listeners ───────────────────────────────────────────
  useEffect(() => {
    if (isLiveGame !== true) return;

    const unsubSpectatorCount = ws.on("spectator_count", (payload: SpectatorCountPayload) => {
      if (payload.gameId === gameId) setSpectatorCount(payload.count);
    });

    const unsubCursor = ws.on("cursor_moved", (payload: CursorMovedPayload) => {
      setCursors((prev) => ({
        ...prev,
        [payload.userId]: { row: payload.row, col: payload.col },
      }));
    });

    const unsubCell = ws.on("cell_updated", (payload: CellUpdatedPayload) => {
      setCells((prev) => {
        const idx = prev.findIndex(
          (c) => c.row === payload.row && c.col === payload.col
        );
        const updated: GameCell = {
          id: `ws-${payload.row}-${payload.col}`,
          gameId: gameId!,
          row: payload.row,
          col: payload.col,
          value: payload.value,
          filledBy: payload.filledBy,
          filledAt: new Date().toISOString(),
        };
        if (payload.value === "") {
          return prev.filter((_, i) => i !== idx);
        }
        if (idx >= 0) return prev.map((c, i) => (i === idx ? updated : c));
        return [...prev, updated];
      });
    });

    const unsubComplete = ws.on("game_complete", (payload: GameCompletePayload) => {
      setCompletion(payload);
    });

    const unsubJoined = ws.on("participant_joined", (payload: ParticipantJoinedPayload) => {
      setParticipants((prev) => {
        if (prev.some((p) => p.id === payload.participant.id)) return prev;
        const participantWithName: ParticipantWithName = { ...payload.participant, displayName: payload.displayName };
        return [...prev, participantWithName];
      });
    });

    const unsubLeft = ws.on("participant_left", (payload: ParticipantLeftPayload) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== payload.userId));
    });

    const unsubAbandoned = ws.on("game_abandoned", (_payload: GameAbandonedPayload) => {
      setGameEnded({ status: "abandoned" });
    });

    return () => {
      unsubSpectatorCount();
      unsubCursor();
      unsubCell();
      unsubComplete();
      unsubJoined();
      unsubLeft();
      unsubAbandoned();
    };
  }, [isLiveGame, gameId]);

  // ── Effect 6: fetch rating stats when completion modal opens ────────────────
  useEffect(() => {
    if (!completion || !puzzle) return;
    getPuzzleStats(puzzle.id)
      .then(({ stats, userRating }) => {
        setRatingStats(stats);
        if (userRating) {
          setRatingDifficulty(userRating.difficulty);
          setRatingEnjoyment(userRating.enjoyment);
          setRatingSubmitted(true);
        }
      })
      .catch(() => {}); // rating is optional — ignore failures
  }, [completion?.completedAt, puzzle?.id]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleRate() {
    if (!puzzle || ratingDifficulty === null || ratingEnjoyment === null) return;
    setRatingLoading(true);
    setRatingError("");
    try {
      const { stats } = await ratePuzzle(puzzle.id, ratingDifficulty, ratingEnjoyment);
      setRatingStats(stats);
      setRatingSubmitted(true);
    } catch {
      setRatingError("Failed to submit rating");
    } finally {
      setRatingLoading(false);
    }
  }

  const handleCellFill = useCallback(
    (row: number, col: number, value: string) => {
      if (!gameId || !currentUser) return;
      ws.emit("fill_cell", {
        gameId,
        row,
        col,
        value,
        userId: currentUser.id,
      });
      // Optimistic update
      setCells((prev) => {
        const idx = prev.findIndex((c) => c.row === row && c.col === col);
        if (value === "") return prev.filter((_, i) => i !== idx);
        const newCell: GameCell = {
          id: `local-${row}-${col}`,
          gameId,
          row,
          col,
          value,
          filledBy: currentUser.id,
          filledAt: new Date().toISOString(),
        };
        if (idx >= 0) return prev.map((c, i) => (i === idx ? newCell : c));
        return [...prev, newCell];
      });
    },
    [gameId, currentUser]
  );

  const handleCursorMove = useCallback(
    (row: number, col: number) => {
      if (!gameId || !currentUser) return;
      ws.emit("move_cursor", { gameId, row, col, userId: currentUser.id });
    },
    [gameId, currentUser]
  );

  function handleCopyRoomCode() {
    if (!game) return;
    navigator.clipboard.writeText(game.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleAbandon() {
    if (!gameId) return;
    if (!window.confirm("Abandon this game? This cannot be undone and all players will be removed.")) return;
    setAbandonLoading(true);
    try {
      await abandonGame(gameId);
      // The game_abandoned WS event will arrive and trigger the end state for all players
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to abandon game");
    } finally {
      setAbandonLoading(false);
    }
  }

  async function handleReport() {
    if (!gameId || !reportTarget) return;
    setReportLoading(true);
    setReportError("");
    try {
      await reportPlayer(gameId, reportTarget.userId, reportReason);
      setReportSuccess(true);
      setTimeout(() => {
        setReportTarget(null);
        setReportReason("");
        setReportSuccess(false);
      }, 1500);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleJoinFromSpectate() {
    if (!gameId) return;
    setJoiningFromSpectate(true);
    try {
      await joinGameById(gameId);
      navigate(`/game/${gameId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to join game");
      setJoiningFromSpectate(false);
    }
  }

  function handleViewPuzzle() {
    setViewMode(true);
    setIsLiveGame(false); // disconnects WS via effect cleanup
    setCompletion(null);
  }

  async function handleLoadReplay() {
    if (!gameId) return;
    setReplayLoading(true);
    setReplayError("");
    try {
      const { moves, hasFull } = await getGameHistory(gameId);
      setHistoryMoves(moves);
      setHistoryHasFull(hasFull);
      setReplayActive(true);
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : "Failed to load replay");
    } finally {
      setReplayLoading(false);
    }
  }

  function getDisplayName(p: ParticipantWithName): string {
    if (p.userId === currentUser?.id) return currentUser.displayName;
    return p.displayName ?? `Player ${p.userId.slice(-4)}`;
  }

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth <= 640;

  // ── Styles ──────────────────────────────────────────────────────────────────

  const s: Record<string, React.CSSProperties> = {
    page: {
      minHeight: "100vh",
      background: "#f1f5f9",
      fontFamily: "system-ui, sans-serif",
    },
    header: {
      background: "#1e3a5f",
      color: "#fff",
      padding: isMobile ? "0.5rem 1rem" : "0 1.5rem",
      minHeight: "56px",
      height: "auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "0.5rem",
    },
    headerLeft: { display: "flex", alignItems: "center", gap: "1rem" },
    backBtn: {
      background: "none",
      color: "#93c5fd",
      border: "none",
      cursor: "pointer",
      fontSize: "0.875rem",
    },
    headerTitle: {
      fontFamily: "Georgia, serif",
      fontSize: "1.2rem",
      fontWeight: "bold",
    },
    roomCode: {
      background: "rgba(255,255,255,0.15)",
      padding: "0.3rem 0.75rem",
      borderRadius: "6px",
      fontSize: "0.875rem",
      letterSpacing: "0.1em",
      fontWeight: "600",
    },
    copyBtn: {
      background: copied ? "rgba(5,150,105,0.4)" : "rgba(255,255,255,0.15)",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      padding: "0.3rem 0.6rem",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s",
    },
    contribBtn: {
      background: showContributions ? "rgba(255,255,255,0.25)" : "none",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.4)",
      borderRadius: "6px",
      padding: "0.3rem 0.6rem",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s",
    },
    colorToggleBtn: {
      background: showColors ? "rgba(34,197,94,0.3)" : "none",
      color: "#fff",
      border: `1px solid ${showColors ? "rgba(34,197,94,0.7)" : "rgba(255,255,255,0.4)"}`,
      borderRadius: "6px",
      padding: "0 0.6rem",
      minHeight: "44px",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s, border-color 0.2s",
    },
    lockToggleBtn: {
      background: lockCorrect ? "rgba(251,191,36,0.3)" : "none",
      color: "#fff",
      border: `1px solid ${lockCorrect ? "rgba(251,191,36,0.7)" : "rgba(255,255,255,0.4)"}`,
      borderRadius: "6px",
      padding: "0 0.6rem",
      minHeight: "44px",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s, border-color 0.2s",
    },
    lockWordToggleBtn: {
      background: lockWord ? "rgba(168,85,247,0.3)" : "none",
      color: "#fff",
      border: `1px solid ${lockWord ? "rgba(168,85,247,0.7)" : "rgba(255,255,255,0.4)"}`,
      borderRadius: "6px",
      padding: "0 0.6rem",
      minHeight: "44px",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s, border-color 0.2s",
    },
    skipFilledToggleBtn: {
      background: skipFilled ? "rgba(14,165,233,0.3)" : "none",
      color: "#fff",
      border: `1px solid ${skipFilled ? "rgba(14,165,233,0.7)" : "rgba(255,255,255,0.4)"}`,
      borderRadius: "6px",
      padding: "0 0.6rem",
      minHeight: "44px",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s, border-color 0.2s",
    },
    content: {
      maxWidth: "980px",
      margin: "0 auto",
      padding: isMobile ? "1rem" : "1.5rem",
      display: "flex",
      gap: "1.5rem",
      flexWrap: "wrap",
    },
    gridArea: {
      flex: "1 1 500px",
      background: "#fff",
      borderRadius: "12px",
      padding: "1.5rem",
      boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
    },
    sidebar: {
      width: isMobile ? "100%" : "200px",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
    },
    playerCard: {
      background: "#fff",
      borderRadius: "12px",
      padding: "1rem",
      boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
    },
    sectionTitle: {
      margin: "0 0 0.75rem",
      fontSize: "0.8rem",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color: "#64748b",
    },
    participantRow: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.35rem 0",
      fontSize: "0.875rem",
      color: "#374151",
    },
    colorDot: {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      flexShrink: 0,
    },
    modal: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    },
    modalBox: {
      background: "#fff",
      borderRadius: "16px",
      padding: "2.5rem",
      maxWidth: "420px",
      width: "90%",
      textAlign: "center",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
    },
    modalTitle: {
      fontSize: "1.75rem",
      fontWeight: "700",
      color: "#059669",
      margin: 0,
    },
    modalBtn: {
      padding: "0.75rem 2rem",
      background: "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      fontSize: "1rem",
      fontWeight: "600",
      cursor: "pointer",
    },
    modalBtnOutline: {
      padding: "0.75rem 2rem",
      background: "none",
      color: "#2563eb",
      border: "2px solid #2563eb",
      borderRadius: "8px",
      fontSize: "1rem",
      fontWeight: "600",
      cursor: "pointer",
    },
    abandonBtn: {
      background: "rgba(220,38,38,0.15)",
      color: "#fca5a5",
      border: "1px solid rgba(220,38,38,0.4)",
      borderRadius: "6px",
      padding: "0.3rem 0.6rem",
      cursor: "pointer",
      fontSize: "0.75rem",
      transition: "background 0.2s",
    },
    rateBtn: {
      padding: "0.5rem 1.25rem",
      background: "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      fontSize: "0.875rem",
      fontWeight: "600",
      cursor: "pointer",
    },
    rateBtnDisabled: {
      padding: "0.5rem 1.25rem",
      background: "#cbd5e1",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      fontSize: "0.875rem",
      fontWeight: "600",
      cursor: "not-allowed",
    },
    replayBtn: {
      padding: "0.4rem 1rem",
      background: "rgba(255,255,255,0.15)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.4)",
      borderRadius: "6px",
      fontSize: "0.8rem",
      cursor: "pointer",
    },
    completedBadge: {
      background: "rgba(5,150,105,0.3)",
      color: "#6ee7b7",
      border: "1px solid rgba(5,150,105,0.5)",
      borderRadius: "6px",
      padding: "0.2rem 0.6rem",
      fontSize: "0.75rem",
      fontWeight: "600",
    },
    spectatingBadge: {
      background: "rgba(124,58,237,0.25)",
      color: "#c4b5fd",
      border: "1px solid rgba(124,58,237,0.5)",
      borderRadius: "6px",
      padding: "0.2rem 0.6rem",
      fontSize: "0.75rem",
      fontWeight: "600",
    },
    spectatorCount: {
      background: "rgba(255,255,255,0.1)",
      color: "#c4b5fd",
      borderRadius: "6px",
      padding: "0.2rem 0.6rem",
      fontSize: "0.75rem",
    },
    joinFromSpectateBtn: {
      background: "#059669",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      padding: "0.3rem 0.75rem",
      cursor: "pointer",
      fontSize: "0.8rem",
      fontWeight: "600",
    },
    lobbyBtn: {
      padding: "0.75rem 1.5rem",
      background: "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      fontSize: "0.9rem",
      fontWeight: "600",
      cursor: "pointer",
      width: "100%",
    },
    reportBtn: {
      background: "none",
      color: "#94a3b8",
      border: "1px solid #cbd5e1",
      borderRadius: "4px",
      padding: "0.1rem 0.4rem",
      cursor: "pointer",
      fontSize: "0.7rem",
      marginLeft: "auto",
      flexShrink: 0,
    },
    reportTextarea: {
      width: "100%",
      minHeight: "80px",
      padding: "0.5rem",
      borderRadius: "6px",
      border: "1px solid #cbd5e1",
      fontSize: "0.875rem",
      resize: "vertical",
      fontFamily: "inherit",
      boxSizing: "border-box" as const,
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#64748b" }}>Loading game…</span>
      </div>
    );
  }

  if (error || !game || !puzzle) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#dc2626", marginBottom: "1rem" }}>
            {error || "Game not found."}
          </div>
          <button style={s.modalBtn} onClick={() => navigate("/lobby")}>
            Back to lobby
          </button>
        </div>
      </div>
    );
  }

  // ── View mode (completed game) ───────────────────────────────────────────────
  if (viewMode) {
    const displayCells = replayActive ? replayCells : cells;

    return (
      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerLeft}>
            <button style={s.backBtn} onClick={() => navigate("/lobby")}>
              ← Lobby
            </button>
            <div style={s.headerTitle}>{puzzle.title}</div>
            <span style={s.completedBadge}>Completed</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {!replayActive && (
              <button
                style={s.replayBtn}
                onClick={handleLoadReplay}
                disabled={replayLoading}
              >
                {replayLoading ? "Loading…" : "▶ Replay"}
              </button>
            )}
            <button style={s.contribBtn} onClick={() => setShowContributions(prev => !prev)}>
              {showContributions ? "Hide contributions" : "Show contributions"}
            </button>
          </div>
        </header>

        <div style={s.content}>
          <div style={s.gridArea}>
            <CrosswordGrid
              puzzle={puzzle}
              cells={displayCells}
              participants={participants}
              currentUserId={currentUser?.id ?? ""}
              readOnly={true}
              showContributions={replayActive || showContributions}
              showColors={!replayActive}
            />

            {replayError && (
              <div style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: "0.75rem" }}>
                {replayError}
              </div>
            )}

            {replayActive && (
              <ReplayControls
                playing={replayPlaying}
                speed={replaySpeed}
                currentStep={replayCurrentStep}
                totalSteps={replayTotalSteps}
                hasFull={historyHasFull}
                onPlay={replayPlay}
                onPause={replayPause}
                onSetSpeed={setReplaySpeed}
                onReset={replayReset}
              />
            )}

            {showContributions && !replayActive && (
              <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {participants.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#374151" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: p.color, flexShrink: 0 }} />
                    <span>{getDisplayName(p)}{p.userId === currentUser?.id && " (you)"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={s.sidebar}>
            <div style={s.playerCard}>
              <div style={s.sectionTitle}>Players</div>
              {participants.map((p) => (
                <div key={p.id} style={s.participantRow}>
                  <div style={{ ...s.colorDot, background: p.color }} />
                  <span>
                    {getDisplayName(p)}
                    {p.userId === currentUser?.id && (
                      <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}> (you)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ ...s.playerCard, fontSize: "0.8rem", color: "#64748b" }}>
              <div style={{ fontWeight: "600", color: "#374151", marginBottom: "0.25rem" }}>
                {puzzle.title}
              </div>
              By {puzzle.author}
              <br />
              {puzzle.width}×{puzzle.height} grid
            </div>

            <button style={s.lobbyBtn} onClick={() => navigate("/lobby")}>
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  const myParticipant = participants.find((p) => p.userId === currentUser?.id);

  // ── Live game render ─────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.backBtn} onClick={() => navigate("/lobby")}>
            ← Lobby
          </button>
          <div style={s.headerTitle}>{puzzle.title}</div>
          {isSpectating && <span style={s.spectatingBadge}>Spectating</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isSpectating ? (
            <>
              <span style={s.spectatorCount}>👁 {spectatorCount} watching</span>
              {game.status === "waiting" && (
                <button
                  style={s.joinFromSpectateBtn}
                  onClick={handleJoinFromSpectate}
                  disabled={joiningFromSpectate}
                >
                  {joiningFromSpectate ? "Joining…" : "Join Game"}
                </button>
              )}
            </>
          ) : (
            <>
              {spectatorCount > 0 && (
                <span style={s.spectatorCount}>👁 {spectatorCount} watching</span>
              )}
              <span style={{ fontSize: "0.8rem", color: "#93c5fd" }}>Room</span>
              <span style={s.roomCode}>{game.roomCode}</span>
              <button style={s.copyBtn} onClick={handleCopyRoomCode}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <button style={s.colorToggleBtn} onClick={() => setShowColors(prev => !prev)} title="Highlight correct letters in green">
                {showColors ? "Check" : "Check off"}
              </button>
              <button style={s.lockToggleBtn} onClick={() => setLockCorrect(prev => !prev)} title="Prevent correct letters from being overwritten">
                {lockCorrect ? "Protect" : "Protect off"}
              </button>
              <button style={s.lockWordToggleBtn} onClick={() => setLockWord(prev => !prev)} title="Lock entire word when all letters are correct">
                {lockWord ? "Lock Word" : "Lock Word off"}
              </button>
              <button style={s.skipFilledToggleBtn} onClick={() => setSkipFilled(prev => !prev)} title="Automatically skip over filled cells when typing">
                {skipFilled ? "Skip Filled" : "Skip Filled off"}
              </button>
              <button style={s.contribBtn} onClick={() => setShowContributions(prev => !prev)}>
                {showContributions ? "Hide contributions" : "Show contributions"}
              </button>
              {currentUser?.id === game.createdBy && !gameEnded && game.status !== "complete" && (
                <button
                  style={s.abandonBtn}
                  onClick={handleAbandon}
                  disabled={abandonLoading}
                >
                  {abandonLoading ? "Abandoning…" : "Abandon game"}
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <div style={s.content}>
        <div style={s.gridArea}>
          <CrosswordGrid
            puzzle={puzzle}
            cells={cells}
            participants={participants}
            currentUserId={currentUser?.id ?? ""}
            cursors={cursors}
            showContributions={showContributions}
            showColors={showColors}
            lockCorrect={lockCorrect}
            lockWord={lockWord}
            skipFilled={skipFilled}
            readOnly={isSpectating}
            onCellFill={isSpectating ? undefined : handleCellFill}
            onCursorMove={isSpectating ? undefined : handleCursorMove}
          />

          {showContributions && (
            <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              {participants.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#374151" }}>
                  <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: p.color, flexShrink: 0 }} />
                  <span>{getDisplayName(p)}{p.userId === currentUser?.id && " (you)"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.sidebar}>
          {/* Players */}
          <div style={s.playerCard}>
            <div style={s.sectionTitle}>Players</div>
            {participants.map((p) => (
              <div key={p.id} style={s.participantRow}>
                <div style={{ ...s.colorDot, background: p.color }} />
                <span>
                  {getDisplayName(p)}
                  {p.userId === currentUser?.id && (
                    <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}> (you)</span>
                  )}
                </span>
                {p.userId !== currentUser?.id && (
                  <button
                    style={s.reportBtn}
                    onClick={() => { setReportTarget(p); setReportReason(""); setReportError(""); setReportSuccess(false); }}
                    title="Report player"
                  >
                    Report
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* My color (non-spectators only) */}
          {myParticipant && !isSpectating && (
            <div style={{ ...s.playerCard, fontSize: "0.8rem", color: "#64748b" }}>
              Your cursor color:
              <div
                style={{
                  width: "100%",
                  height: "6px",
                  borderRadius: "3px",
                  background: myParticipant.color,
                  marginTop: "0.4rem",
                }}
              />
            </div>
          )}

          {/* Spectator count (spectator mode) */}
          {isSpectating && spectatorCount > 0 && (
            <div style={{ ...s.playerCard, fontSize: "0.8rem", color: "#64748b" }}>
              👁 {spectatorCount} {spectatorCount === 1 ? "spectator" : "spectators"} watching
            </div>
          )}

          {/* Grid info */}
          <div style={{ ...s.playerCard, fontSize: "0.8rem", color: "#64748b" }}>
            <div style={{ fontWeight: "600", color: "#374151", marginBottom: "0.25rem" }}>
              {puzzle.title}
            </div>
            By {puzzle.author}
            <br />
            {puzzle.width}×{puzzle.height} grid
            <br />
            Status:{" "}
            <span
              style={{
                color:
                  game.status === "active"
                    ? "#059669"
                    : game.status === "complete"
                    ? "#2563eb"
                    : "#f59e0b",
                fontWeight: "600",
              }}
            >
              {game.status}
            </span>
          </div>
        </div>
      </div>

      {/* Completion modal */}
      {completion && (
        <div style={s.modal}>
          <div style={s.modalBox}>
            <div style={s.modalTitle}>Puzzle Complete!</div>
            <p style={{ margin: 0, color: "#374151" }}>
              Time: {formatDuration(Date.now() - startTimeRef.current)}
            </p>
            {completion.stats.length > 0 && (
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>
                  Cells filled:
                </div>
                {completion.stats.map((stat) => {
                  const p = participants.find((x) => x.userId === stat.userId);
                  const name = p ? getDisplayName(p) : `Player ${stat.userId.slice(-4)}`;
                  return (
                    <div key={stat.userId} style={{ fontSize: "0.875rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.2rem 0" }}>
                      {p && <div style={{ ...s.colorDot, background: p.color }} />}
                      {name}: {stat.cellsFilled} cells
                    </div>
                  );
                })}
              </div>
            )}
            {/* Rating section */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", textAlign: "left" }}>
              <div style={{ fontWeight: "600", marginBottom: "0.75rem", color: "#374151", fontSize: "0.95rem" }}>
                Rate this puzzle
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "#64748b", width: "78px", flexShrink: 0 }}>Difficulty</span>
                  <StarRating value={ratingDifficulty} onChange={setRatingDifficulty} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "#64748b", width: "78px", flexShrink: 0 }}>Enjoyment</span>
                  <StarRating value={ratingEnjoyment} onChange={setRatingEnjoyment} />
                </div>
              </div>
              {ratingSubmitted && ratingStats && (
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.5rem" }}>
                  Difficulty: {ratingStats.averageDifficulty?.toFixed(1) ?? "—"} · Enjoyment: {ratingStats.averageEnjoyment?.toFixed(1) ?? "—"} · {ratingStats.ratingCount} {ratingStats.ratingCount === 1 ? "rating" : "ratings"}
                </div>
              )}
              {ratingError && (
                <div style={{ color: "#dc2626", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{ratingError}</div>
              )}
              <button
                style={ratingDifficulty !== null && ratingEnjoyment !== null && !ratingLoading ? s.rateBtn : s.rateBtnDisabled}
                onClick={handleRate}
                disabled={ratingDifficulty === null || ratingEnjoyment === null || ratingLoading}
              >
                {ratingLoading ? "Submitting…" : ratingSubmitted ? "Update Rating" : "Rate Puzzle"}
              </button>
            </div>

            <button style={s.modalBtnOutline} onClick={handleViewPuzzle}>
              View Puzzle
            </button>
            <button style={s.modalBtn} onClick={() => navigate("/lobby")}>
              Back to lobby
            </button>
          </div>
        </div>
      )}

      {/* Abandoned / expired modal */}
      {gameEnded && (
        <div style={s.modal}>
          <div style={s.modalBox}>
            <div style={{ ...s.modalTitle, color: gameEnded.status === "abandoned" ? "#dc2626" : "#92400e" }}>
              {gameEnded.status === "abandoned" ? "Game Abandoned" : "Game Expired"}
            </div>
            <p style={{ margin: 0, color: "#374151" }}>
              {gameEnded.status === "abandoned"
                ? "The game creator has ended this session."
                : "This game was automatically closed due to inactivity."}
            </p>
            <button style={s.modalBtn} onClick={() => navigate("/lobby")}>
              Back to lobby
            </button>
          </div>
        </div>
      )}

      {/* Report player modal */}
      {reportTarget && (
        <div style={s.modal}>
          <div style={{ ...s.modalBox, textAlign: "left", gap: "0.75rem" }}>
            <div style={{ fontSize: "1.1rem", fontWeight: "700", color: "#1e3a5f", margin: 0 }}>
              Report {getDisplayName(reportTarget)}
            </div>
            {reportSuccess ? (
              <p style={{ color: "#059669", margin: 0 }}>Report submitted. Thank you.</p>
            ) : (
              <>
                <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem" }}>
                  Describe the issue (max 500 characters):
                </p>
                <textarea
                  style={s.reportTextarea}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Offensive language, harassment..."
                />
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "right" }}>
                  {reportReason.length}/500
                </div>
                {reportError && (
                  <div style={{ color: "#dc2626", fontSize: "0.875rem" }}>{reportError}</div>
                )}
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                  <button
                    style={s.modalBtnOutline}
                    onClick={() => setReportTarget(null)}
                    disabled={reportLoading}
                  >
                    Cancel
                  </button>
                  <button
                    style={reportReason.trim().length > 0 && !reportLoading ? s.modalBtn : { ...s.modalBtn, background: "#94a3b8", cursor: "not-allowed" }}
                    onClick={handleReport}
                    disabled={reportReason.trim().length === 0 || reportLoading}
                  >
                    {reportLoading ? "Submitting…" : "Submit Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
