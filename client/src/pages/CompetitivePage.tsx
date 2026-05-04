import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  Puzzle,
  GameCell,
  GameParticipant,
  MatchCellUpdatedPayload,
  MatchCompletedPayload,
  OwnCell,
  OpponentCell,
} from "@multicross/shared";
import { getCompetitiveMatch } from "../api/client";
import { ws } from "../ws/socket";
import CrosswordGrid from "../components/CrosswordGrid";

interface MatchMeta {
  matchId: string;
  challengerId: string;
  opponentId: string;
  opponentName: string;
  timeLimitSeconds: number;
  startsAt: string;
}

// Convert OwnCell[] to GameCell[] for CrosswordGrid (value visible)
function ownCellsToGameCells(cells: OwnCell[]): GameCell[] {
  return cells.map((c) => ({
    id: `${c.row},${c.col}`,
    gameId: "",
    row: c.row,
    col: c.col,
    value: c.value,
    filledBy: null,
    filledAt: null,
  }));
}

// Convert OpponentCell[] to GameCell[] for CrosswordGrid (value hidden — just marks the cell filled)
function opponentCellsToGameCells(cells: OpponentCell[]): GameCell[] {
  return cells.map((c) => ({
    id: `${c.row},${c.col}`,
    gameId: "",
    row: c.row,
    col: c.col,
    value: "X", // placeholder — never shown because hiddenLetters=true
    filledBy: null,
    filledAt: null,
  }));
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const EMPTY_PARTICIPANTS: GameParticipant[] = [];

export default function CompetitivePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const currentUser: { id: string; displayName: string } | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null") as { id: string; displayName: string };
    } catch {
      return null;
    }
  })();

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [matchMeta, setMatchMeta] = useState<MatchMeta | null>(null);
  const [ownCells, setOwnCells] = useState<GameCell[]>([]);
  const [opponentCells, setOpponentCells] = useState<GameCell[]>([]);
  const [result, setResult] = useState<MatchCompletedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const ownCellsRef = useRef<GameCell[]>([]);
  ownCellsRef.current = ownCells;

  // Load match state on mount
  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    getCompetitiveMatch(matchId)
      .then(({ match, puzzle: p, ownCells: own, opponentCells: opp }) => {
        setPuzzle(p);
        setMatchMeta({
          matchId: match.id,
          challengerId: match.challengerId,
          opponentId: match.opponentId,
          opponentName: match.challengerId === currentUser?.id ? match.opponentName : match.challengerName,
          timeLimitSeconds: match.timeLimitSeconds,
          startsAt: match.startedAt ?? new Date().toISOString(),
        });
        setOwnCells(ownCellsToGameCells(own));
        setOpponentCells(opponentCellsToGameCells(opp));

        if (match.status === "completed" || match.status === "timed_out") {
          // Match already ended — we don't have cell counts here, show the match is over
          // The result overlay will be set when match_completed fires, or we can skip it
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load match"))
      .finally(() => setLoading(false));
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown ticker
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  // WS subscriptions
  useEffect(() => {
    if (!matchId) return;

    const offCellUpdated = ws.on("match_cell_updated", (payload: MatchCellUpdatedPayload) => {
      if (payload.matchId !== matchId) return;
      const isOwnUpdate = payload.userId === currentUser?.id;

      if (isOwnUpdate) {
        // Own cell: we already applied it optimistically; if server says unfilled, remove it
        if (!payload.filled) {
          setOwnCells((prev) => prev.filter((c) => !(c.row === payload.row && c.col === payload.col)));
        }
      } else {
        // Opponent cell: update filled status
        if (payload.filled) {
          setOpponentCells((prev) => {
            const key = `${payload.row},${payload.col}`;
            const exists = prev.some((c) => c.row === payload.row && c.col === payload.col);
            if (exists) return prev;
            return [
              ...prev,
              {
                id: key,
                gameId: "",
                row: payload.row,
                col: payload.col,
                value: "X",
                filledBy: null,
                filledAt: null,
              },
            ];
          });
        } else {
          setOpponentCells((prev) =>
            prev.filter((c) => !(c.row === payload.row && c.col === payload.col))
          );
        }
      }
    });

    const offCompleted = ws.on("match_completed", (payload: MatchCompletedPayload) => {
      if (payload.matchId !== matchId) return;
      setResult(payload);
    });

    return () => {
      offCellUpdated();
      offCompleted();
    };
  }, [matchId, currentUser?.id]);

  const handleCellFill = useCallback(
    (row: number, col: number, value: string) => {
      if (!matchId) return;

      // Optimistic update
      setOwnCells((prev) => {
        const exists = prev.some((c) => c.row === row && c.col === col);
        if (value === "") {
          return prev.filter((c) => !(c.row === row && c.col === col));
        }
        const newCell: GameCell = {
          id: `${row},${col}`,
          gameId: "",
          row,
          col,
          value: value.toUpperCase(),
          filledBy: currentUser?.id ?? null,
          filledAt: null,
        };
        if (exists) {
          return prev.map((c) => (c.row === row && c.col === col ? newCell : c));
        }
        return [...prev, newCell];
      });

      ws.emit("match_fill_cell", { matchId, row, col, value });
    },
    [matchId, currentUser?.id]
  );

  if (loading) {
    return (
      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerTitle}>Multicross · 1v1</div>
        </header>
        <div style={s.loadingCenter}>Loading match…</div>
      </div>
    );
  }

  if (error || !puzzle || !matchMeta) {
    return (
      <div style={s.page}>
        <header style={s.header}>
          <div style={s.headerTitle}>Multicross · 1v1</div>
        </header>
        <div style={s.loadingCenter} >
          <div style={s.errorText}>{error || "Match not found"}</div>
          <button style={s.backBtn} onClick={() => navigate("/lobby")}>Back to lobby</button>
        </div>
      </div>
    );
  }

  const deadlineMs = new Date(matchMeta.startsAt).getTime() + matchMeta.timeLimitSeconds * 1000;
  const remainingMs = deadlineMs - now;
  const isUrgent = remainingMs > 0 && remainingMs < 60_000;

  const myId = currentUser?.id ?? "";
  const amChallenger = matchMeta.challengerId === myId;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtnHeader} onClick={() => navigate("/lobby")}>← Lobby</button>
        <div style={s.headerTitle}>1v1 · {puzzle.title}</div>
        <div style={countdownStyle(isUrgent, remainingMs <= 0)}>
          {result ? "Finished" : remainingMs <= 0 ? "Time's up" : formatCountdown(remainingMs)}
        </div>
      </header>

      {/* Result overlay */}
      {result && (
        <div style={s.resultOverlay}>
          <div style={s.resultCard}>
            {result.winnerId === null ? (
              <>
                <div style={s.resultIcon}>🤝</div>
                <div style={s.resultHeading}>Draw</div>
                <div style={s.resultSub}>
                  {result.reason === "timeout" ? "Time's up — equal cells filled" : "Both completed simultaneously"}
                </div>
              </>
            ) : result.winnerId === myId ? (
              <>
                <div style={s.resultIcon}>🏆</div>
                <div style={{ ...s.resultHeading, color: "#16a34a" }}>You won!</div>
                <div style={s.resultSub}>
                  {result.reason === "completed" ? "Puzzle completed" : "More cells filled at time"}
                </div>
              </>
            ) : (
              <>
                <div style={s.resultIcon}>😔</div>
                <div style={{ ...s.resultHeading, color: "#dc2626" }}>You lost</div>
                <div style={s.resultSub}>
                  {result.reason === "completed" ? "Opponent completed first" : "Fewer cells filled at time"}
                </div>
              </>
            )}
            <div style={s.resultStats}>
              <div style={s.statRow}>
                <span style={s.statLabel}>
                  {amChallenger ? "You (challenger)" : matchMeta.opponentName}
                </span>
                <span style={s.statVal}>{result.challengerCells} cells</span>
              </div>
              <div style={s.statRow}>
                <span style={s.statLabel}>
                  {amChallenger ? matchMeta.opponentName : "You"}
                </span>
                <span style={s.statVal}>{result.opponentCells} cells</span>
              </div>
            </div>
            <button style={s.lobbyBtn} onClick={() => navigate("/lobby")}>Back to lobby</button>
          </div>
        </div>
      )}

      {/* Boards */}
      <div style={s.boardsRow}>
        {/* Own board */}
        <div style={s.boardCol}>
          <div style={s.boardLabel}>You</div>
          <CrosswordGrid
            puzzle={puzzle}
            cells={ownCells}
            participants={EMPTY_PARTICIPANTS}
            currentUserId={myId}
            readOnly={!!result || remainingMs <= 0}
            showColors={true}
            onCellFill={handleCellFill}
          />
        </div>

        {/* Divider */}
        <div style={s.divider} />

        {/* Opponent board */}
        <div style={s.boardCol}>
          <div style={s.boardLabel}>{matchMeta.opponentName}</div>
          <CrosswordGrid
            puzzle={puzzle}
            cells={opponentCells}
            participants={EMPTY_PARTICIPANTS}
            currentUserId={myId}
            readOnly={true}
            hiddenLetters={true}
            showColors={false}
          />
        </div>
      </div>
    </div>
  );
}

function countdownStyle(urgent: boolean, expired: boolean): React.CSSProperties {
  return {
    fontFamily: "monospace",
    fontSize: "1.4rem",
    fontWeight: "700",
    color: expired ? "#94a3b8" : urgent ? "#dc2626" : "#fff",
    letterSpacing: "0.04em",
    minWidth: "80px",
    textAlign: "right" as const,
  };
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#f1f5f9",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    background: "#1e3a5f",
    color: "#fff",
    padding: "0 1.5rem",
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1.15rem",
    fontWeight: "bold",
    color: "#fff",
  },
  backBtnHeader: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  boardsRow: {
    flex: 1,
    display: "flex",
    flexDirection: "row" as const,
    gap: "1.5rem",
    padding: "1.5rem",
    alignItems: "flex-start",
    justifyContent: "center",
    flexWrap: "wrap" as const,
  },
  boardCol: {
    flex: "1 1 400px",
    minWidth: "280px",
    maxWidth: "600px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  boardLabel: {
    fontWeight: "700",
    fontSize: "0.9rem",
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    textAlign: "center" as const,
  },
  divider: {
    width: "1.5rem",
    flexShrink: 0,
  },
  loadingCenter: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    color: "#64748b",
    fontSize: "1rem",
  },
  errorText: {
    color: "#dc2626",
    fontSize: "1rem",
  },
  backBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
  },
  resultOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 900,
    padding: "1rem",
  },
  resultCard: {
    background: "#fff",
    borderRadius: "16px",
    padding: "2.5rem 2rem",
    textAlign: "center" as const,
    maxWidth: "360px",
    width: "100%",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "0.5rem",
  },
  resultIcon: {
    fontSize: "3rem",
    marginBottom: "0.25rem",
  },
  resultHeading: {
    fontSize: "1.75rem",
    fontWeight: "800",
    color: "#1e293b",
    margin: 0,
  },
  resultSub: {
    fontSize: "0.9rem",
    color: "#64748b",
    marginBottom: "0.75rem",
  },
  resultStats: {
    background: "#f8fafc",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    padding: "0.75rem 1rem",
    width: "100%",
    marginBottom: "0.75rem",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0.2rem 0",
  },
  statLabel: {
    fontSize: "0.875rem",
    color: "#475569",
  },
  statVal: {
    fontSize: "0.875rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  lobbyBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 1.5rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.9rem",
    marginTop: "0.25rem",
  },
} satisfies Record<string, React.CSSProperties>;
