import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Puzzle, User } from "@multicross/shared";
import { getPuzzles, createGame, joinGame } from "../api/client";

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
  sectionTitle: {
    margin: "0 0 1rem",
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#1e293b",
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
  createBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
    whiteSpace: "nowrap",
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
    textTransform: "uppercase",
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
};

export default function LobbyPage() {
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loadingPuzzles, setLoadingPuzzles] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

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
      .finally(() => setLoadingPuzzles(false));
  }, []);

  function handleLogout() {
    localStorage.removeItem("multicross_token");
    localStorage.removeItem("multicross_user");
    navigate("/login");
  }

  async function handleCreateGame(puzzleId: string) {
    setCreatingId(puzzleId);
    try {
      const { game } = await createGame(puzzleId);
      navigate(`/game/${game.id}`);
    } catch (err) {
      console.error(err);
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
    setJoinError("");
    setJoining(true);
    try {
      const result = await joinGame(code);
      navigate(`/game/${result.gameId}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Game not found.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerTitle}>Multicross</div>
        <div style={s.headerRight}>
          <span>Hey, {currentUser?.displayName ?? "Player"}</span>
          <button style={s.logoutBtn} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div style={s.content}>
        {/* Join by room code */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Join a game</h2>
          <div style={s.joinRow}>
            <input
              style={s.joinInput}
              type="text"
              placeholder="Room code (e.g. ABCD12)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
              maxLength={8}
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
          {loadingPuzzles ? (
            <div style={s.loading}>Loading puzzles…</div>
          ) : (
            <div style={s.puzzleList}>
              {puzzles.map((puzzle) => (
                <div key={puzzle.id} style={s.puzzleCard}>
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
