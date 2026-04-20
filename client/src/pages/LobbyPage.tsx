import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Puzzle, User } from "@multicross/shared";
import { getPuzzles, getMyPuzzles, createGame, joinGame, deletePuzzle, getMyActiveGames, abandonGame } from "../api/client";
import type { ActiveGame } from "../api/client";

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
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1.4rem",
    fontWeight: "bold",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    fontSize: "0.875rem",
  },
  createPuzzleLink: {
    color: "rgba(255,255,255,0.85)",
    textDecoration: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
    background: "none",
    border: "none",
    padding: 0,
  },
  logoutBtn: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  content: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "2rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  section: {
    background: "#fff",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1rem",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  newPuzzleBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
    whiteSpace: "nowrap" as const,
  },
  puzzleList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  puzzleCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    background: "#f8fafc",
  },
  puzzleInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  puzzleTitle: {
    fontWeight: "600",
    color: "#1e293b",
    fontSize: "1rem",
  },
  puzzleMeta: {
    fontSize: "0.8rem",
    color: "#64748b",
  },
  puzzleActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexShrink: 0,
  },
  editBtn: {
    background: "transparent",
    color: "#2563eb",
    border: "1.5px solid #93c5fd",
    borderRadius: "6px",
    padding: "0.3rem 0.7rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
  },
  deleteBtn: {
    background: "transparent",
    color: "#dc2626",
    border: "1.5px solid #fca5a5",
    borderRadius: "6px",
    padding: "0.3rem 0.7rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
  },
  createBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
    whiteSpace: "nowrap" as const,
  },
  joinRow: {
    display: "flex",
    gap: "0.75rem",
  },
  joinInput: {
    flex: 1,
    padding: "0.6rem 0.75rem",
    borderRadius: "6px",
    border: "1.5px solid #cbd5e1",
    fontSize: "1rem",
    outline: "none",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
  },
  joinBtn: {
    background: "#059669",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.6rem 1.25rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.9rem",
  },
  error: {
    color: "#dc2626",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  },
  loading: {
    color: "#64748b",
    fontSize: "0.9rem",
    padding: "1rem 0",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: "0.875rem",
    padding: "0.5rem 0",
  },
  activeGameCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.85rem 1rem",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    background: "#f8fafc",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  activeGameInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2rem",
  },
  activeGameTitle: {
    fontWeight: "600",
    color: "#1e293b",
    fontSize: "0.95rem",
  },
  activeGameMeta: {
    fontSize: "0.78rem",
    color: "#64748b",
  },
  rejoinBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
    flexShrink: 0,
  },
  abandonBtn: {
    background: "transparent",
    color: "#64748b",
    border: "1.5px solid #cbd5e1",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
    flexShrink: 0,
  },
};

function badgeStyle(status: "draft" | "published"): React.CSSProperties {
  return {
    fontSize: "0.7rem",
    fontWeight: "700",
    padding: "0.2rem 0.5rem",
    borderRadius: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    background: status === "published" ? "#dcfce7" : "#fef9c3",
    color: status === "published" ? "#166534" : "#854d0e",
  };
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loadingPuzzles, setLoadingPuzzles] = useState(true);
  const [puzzleError, setPuzzleError] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<{ id: string; msg: string } | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const [myPuzzles, setMyPuzzles] = useState<Puzzle[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [mineError, setMineError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [loadingActiveGames, setLoadingActiveGames] = useState(true);
  const [abandoningId, setAbandoningId] = useState<string | null>(null);
  const [abandonError, setAbandonError] = useState<{ id: string; msg: string } | null>(null);

  const currentUser: User | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null");
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    getPuzzles()
      .then(({ puzzles }) => setPuzzles(puzzles))
      .catch((err) => setPuzzleError(err instanceof Error ? err.message : "Failed to load puzzles"))
      .finally(() => setLoadingPuzzles(false));
  }, []);

  useEffect(() => {
    getMyPuzzles()
      .then(({ puzzles }) => setMyPuzzles(puzzles))
      .catch((err) => setMineError(err instanceof Error ? err.message : "Failed to load your puzzles"))
      .finally(() => setLoadingMine(false));
  }, []);

  useEffect(() => {
    function fetchActiveGames() {
      getMyActiveGames()
        .then(({ games }) => setActiveGames(games))
        .catch(() => {/* silently ignore — section just stays empty */})
        .finally(() => setLoadingActiveGames(false));
    }
    fetchActiveGames();
    const interval = setInterval(fetchActiveGames, 30_000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    localStorage.removeItem("multicross_token");
    localStorage.removeItem("multicross_user");
    navigate("/login");
  }

  async function handleCreateGame(puzzleId: string) {
    setCreatingId(puzzleId);
    setCreateError(null);
    try {
      const { game } = await createGame(puzzleId);
      navigate(`/game/${game.id}`);
    } catch (err) {
      setCreateError({ id: puzzleId, msg: err instanceof Error ? err.message : "Failed to create game" });
    } finally {
      setCreatingId(null);
    }
  }

  async function handleJoinGame() {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter a room code.");
      return;
    }
    if (code.length !== 6) {
      setJoinError("Room code must be exactly 6 characters.");
      return;
    }
    setJoinError("");
    setJoining(true);
    try {
      const result = await joinGame(code);
      navigate(`/game/${result.gameId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "Game not found" || msg.toLowerCase().includes("not found")) {
        setJoinError("Game not found — check the room code and try again.");
      } else if (msg === "Failed to fetch" || msg.toLowerCase().includes("connect")) {
        setJoinError("Could not connect to server — is it running?");
      } else {
        setJoinError(msg || "Game not found.");
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleAbandonGame(gameId: string) {
    if (!confirm("Are you sure you want to abandon this game? This cannot be undone.")) return;
    setAbandoningId(gameId);
    setAbandonError(null);
    try {
      await abandonGame(gameId);
      setActiveGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch (err) {
      setAbandonError({ id: gameId, msg: err instanceof Error ? err.message : "Failed to abandon game" });
    } finally {
      setAbandoningId(null);
    }
  }

  async function handleDeletePuzzle(puzzleId: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(puzzleId);
    try {
      await deletePuzzle(puzzleId);
      setMyPuzzles((prev) => prev.filter((p) => p.id !== puzzleId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete puzzle");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerTitle}>Multicross</div>
        <div style={s.headerRight}>
          <span>Hey, {currentUser?.displayName ?? "Player"}</span>
          <button style={s.createPuzzleLink} onClick={() => navigate("/editor")}>
            Create puzzle
          </button>
          <button style={s.logoutBtn} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div style={s.content}>
        {/* My active games — only shown when the user has at least one, or while loading */}
        {(loadingActiveGames || activeGames.length > 0) && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>My active games</h2>
            {loadingActiveGames ? (
              <div style={s.loading}>Loading…</div>
            ) : (
              <div style={s.puzzleList}>
                {activeGames.map((game) => (
                  <div key={game.id}>
                    <div
                      style={s.activeGameCard}
                      onClick={() => navigate(`/game/${game.id}`)}
                    >
                      <div style={s.activeGameInfo}>
                        <div style={s.activeGameTitle}>{game.puzzleTitle}</div>
                        <div style={s.activeGameMeta}>
                          {game.participantCount} player{game.participantCount !== 1 ? "s" : ""}
                          {" · "}
                          <span style={{ textTransform: "capitalize" }}>{game.status}</span>
                          {" · "}
                          {new Date(game.createdAt).toLocaleDateString()}
                          {" · "}
                          Room {game.roomCode}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                        <button
                          style={s.abandonBtn}
                          disabled={abandoningId === game.id}
                          onClick={(e) => { e.stopPropagation(); handleAbandonGame(game.id); }}
                        >
                          {abandoningId === game.id ? "Abandoning…" : "Abandon"}
                        </button>
                        <button
                          style={s.rejoinBtn}
                          onClick={(e) => { e.stopPropagation(); navigate(`/game/${game.id}`); }}
                        >
                          Rejoin
                        </button>
                      </div>
                    </div>
                    {abandonError?.id === game.id && (
                      <div style={s.error}>{abandonError.msg}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My puzzles */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>My puzzles</h2>
            <button style={s.newPuzzleBtn} onClick={() => navigate("/editor")}>
              + New puzzle
            </button>
          </div>
          {mineError && <div style={s.error}>{mineError}</div>}
          {loadingMine ? (
            <div style={s.loading}>Loading your puzzles…</div>
          ) : myPuzzles.length === 0 ? (
            <div style={s.emptyText}>
              You haven't created any puzzles yet — create one!
            </div>
          ) : (
            <div style={s.puzzleList}>
              {myPuzzles.map((puzzle) => (
                <div key={puzzle.id} style={s.puzzleCard}>
                  <div style={s.puzzleInfo}>
                    <div style={s.puzzleTitle}>{puzzle.title}</div>
                    <div style={s.puzzleMeta}>
                      {puzzle.width}×{puzzle.height}
                    </div>
                  </div>
                  <div style={s.puzzleActions}>
                    <span style={badgeStyle(puzzle.status ?? "draft")}>
                      {puzzle.status ?? "draft"}
                    </span>
                    <button
                      style={s.editBtn}
                      onClick={() => navigate(`/editor/${puzzle.id}`)}
                    >
                      Edit
                    </button>
                    <button
                      style={s.deleteBtn}
                      onClick={() => handleDeletePuzzle(puzzle.id, puzzle.title)}
                      disabled={deletingId === puzzle.id}
                    >
                      {deletingId === puzzle.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Join by room code */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Join a game</h2>
          <div style={s.joinRow}>
            <input
              style={s.joinInput}
              type="text"
              placeholder="Enter 6-letter room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
              maxLength={6}
            />
            <button style={s.joinBtn} onClick={handleJoinGame} disabled={joining}>
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
          {joinError && <div style={s.error}>{joinError}</div>}
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
            Try the demo room: <strong>ABCD12</strong>
          </p>
        </div>

        {/* Available puzzles */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Start a new game</h2>
          {puzzleError && <div style={s.error}>{puzzleError}</div>}
          {loadingPuzzles ? (
            <div style={s.loading}>Loading puzzles…</div>
          ) : (
            <div style={s.puzzleList}>
              {puzzles.map((puzzle) => (
                <div key={puzzle.id}>
                  <div style={s.puzzleCard}>
                    <div style={s.puzzleInfo}>
                      <div style={s.puzzleTitle}>{puzzle.title}</div>
                      <div style={s.puzzleMeta}>
                        By {puzzle.author} · {puzzle.width}×{puzzle.height}
                      </div>
                    </div>
                    <button
                      style={s.createBtn}
                      onClick={() => handleCreateGame(puzzle.id)}
                      disabled={creatingId === puzzle.id}
                    >
                      {creatingId === puzzle.id ? "Creating…" : "Create game"}
                    </button>
                  </div>
                  {createError?.id === puzzle.id && (
                    <div style={s.error}>{createError.msg}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
