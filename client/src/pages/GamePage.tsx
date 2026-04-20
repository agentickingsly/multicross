import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  Game,
  Puzzle,
  GameParticipant,
  GameCell,
  User,
  GameCompletePayload,
  GameAbandonedPayload,
  CursorMovedPayload,
  CellUpdatedPayload,
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  RoomJoinedPayload,
} from "@multicross/shared";
import { getGame, getPuzzle, abandonGame } from "../api/client";
import { ws } from "../ws/socket";
import CrosswordGrid from "../components/CrosswordGrid";

interface CursorPos {
  row: number;
  col: number;
}

// Server returns displayName as an extra field alongside the typed GameParticipant
type ParticipantWithName = GameParticipant & { displayName?: string };

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const currentUser: User | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null");
    } catch {
      return null;
    }
  })();

  const [game, setGame] = useState<Game | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithName[]>([]);
  const [cells, setCells] = useState<GameCell[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPos>>({});
  const [completion, setCompletion] = useState<GameCompletePayload | null>(null);
  const [gameEnded, setGameEnded] = useState<{ status: "abandoned" | "expired" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [abandonLoading, setAbandonLoading] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  // Load game + puzzle
  useEffect(() => {
    if (!gameId) return;
    const token = localStorage.getItem("multicross_token") ?? "";
    ws.connect(token);

    getGame(gameId)
      .then(async ({ game, participants, cells }) => {
        setGame(game);
        setParticipants(participants as ParticipantWithName[]);
        setCells(cells);
        // If the game already finished while we were away, show the appropriate end state
        if (game.status === "complete") {
          setCompletion({ completedAt: game.completedAt!, stats: [] });
        } else if (game.status === "abandoned" || game.status === "expired") {
          setGameEnded({ status: game.status });
        }
        const { puzzle } = await getPuzzle(game.puzzleId);
        setPuzzle(puzzle);
        startTimeRef.current = Date.now();
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    return () => {
      if (currentUser) {
        ws.emit("leave_room", { gameId, userId: currentUser.id });
      }
      ws.disconnect();
    };
  }, [gameId]);

  // Re-emit join_room on WS reconnect
  useEffect(() => {
    if (!gameId || !currentUser) return;
    const unsub = ws.onConnect(() => {
      ws.emit("join_room", { gameId, userId: currentUser.id });
    });
    return unsub;
  }, [gameId, currentUser]);

  // Restore cursor positions from server on (re)join
  useEffect(() => {
    const unsubRoomJoined = ws.on("room_joined", (payload: RoomJoinedPayload) => {
      if (payload.cursors && Object.keys(payload.cursors).length > 0) {
        setCursors(payload.cursors);
      }
    });
    return unsubRoomJoined;
  }, []);

  // WS event listeners
  useEffect(() => {
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
      unsubCursor();
      unsubCell();
      unsubComplete();
      unsubJoined();
      unsubLeft();
      unsubAbandoned();
    };
  }, [gameId]);

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

  function getDisplayName(p: ParticipantWithName): string {
    if (p.userId === currentUser?.id) return currentUser.displayName;
    return p.displayName ?? `Player ${p.userId.slice(-4)}`;
  }

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
      padding: "0 1.5rem",
      height: "56px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
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
    content: {
      maxWidth: "980px",
      margin: "0 auto",
      padding: "1.5rem",
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
      width: "200px",
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

  const myParticipant = participants.find((p) => p.userId === currentUser?.id);

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.backBtn} onClick={() => navigate("/lobby")}>
            ← Lobby
          </button>
          <div style={s.headerTitle}>{puzzle.title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "#93c5fd" }}>Room</span>
          <span style={s.roomCode}>{game.roomCode}</span>
          <button style={s.copyBtn} onClick={handleCopyRoomCode}>
            {copied ? "Copied!" : "Copy"}
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
            onCellFill={handleCellFill}
            onCursorMove={handleCursorMove}
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
              </div>
            ))}
          </div>

          {/* My color */}
          {myParticipant && (
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
    </div>
  );
}
