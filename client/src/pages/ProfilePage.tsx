import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { GetUserStatsResponse, ProfileFriend } from "@multicross/shared";
import { getUserStats } from "../api/client";

interface StoredUser {
  id: string;
  displayName: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<GetUserStatsResponse | null>(null);

  const currentUser: StoredUser | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null");
    } catch {
      return null;
    }
  })();

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError("");
    getUserStats(userId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [userId]);

  const canView = data ? (!data.isPrivate || data.viewerIsFriend || isOwnProfile) : false;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerTitle}>Multicross</div>
        <div style={s.headerRight}>
          {currentUser ? (
            <button style={s.navBtn} onClick={() => navigate("/lobby")}>
              Back to lobby
            </button>
          ) : (
            <button style={s.navBtn} onClick={() => navigate("/login")}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <div style={s.content}>
        {loading ? (
          <div style={s.loading}>Loading profile…</div>
        ) : error ? (
          <div style={s.errorBox}>{error}</div>
        ) : !data ? null : (
          <>
            <div style={s.card}>
              <div style={s.avatar}>{getInitials(data.user.displayName)}</div>
              <div>
                <h1 style={s.displayName}>{data.user.displayName}</h1>
                {isOwnProfile && <div style={s.ownBadge}>Your profile</div>}
              </div>
            </div>

            {!canView ? (
              <div style={s.privateCard}>
                <div style={s.privateTitle}>This profile is private</div>
                <div style={s.privateText}>
                  Only {data.user.displayName}'s friends can view their stats.
                </div>
              </div>
            ) : (
              <>
                <div style={s.statsCard}>
                  <h2 style={s.sectionTitle}>Stats</h2>
                  <div style={s.statsGrid}>
                    <div style={s.statItem}>
                      <div style={s.statValue}>{data.stats.gamesPlayed}</div>
                      <div style={s.statLabel}>Games played</div>
                    </div>
                    <div style={s.statItem}>
                      <div style={s.statValue}>{data.stats.gamesCompleted}</div>
                      <div style={s.statLabel}>Puzzles completed</div>
                    </div>
                    <div style={s.statItem}>
                      <div style={s.statValue}>
                        {data.stats.averageCompletionTimeSeconds != null
                          ? formatSeconds(data.stats.averageCompletionTimeSeconds)
                          : "—"}
                      </div>
                      <div style={s.statLabel}>Avg completion time</div>
                    </div>
                  </div>
                </div>

                <div style={s.friendsCard}>
                  <h2 style={s.sectionTitle}>
                    Friends
                    {data.friends.length > 0 && (
                      <span style={s.friendCount}> · {data.friends.length}</span>
                    )}
                  </h2>
                  {data.friends.length === 0 ? (
                    <div style={s.emptyText}>No friends yet.</div>
                  ) : (
                    <div style={s.friendsList}>
                      {data.friends.map((friend: ProfileFriend) => (
                        <div
                          key={friend.userId}
                          style={s.friendRow}
                          onClick={() => navigate(`/profile/${friend.userId}`)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && navigate(`/profile/${friend.userId}`)}
                        >
                          <div style={s.friendAvatar}>{getInitials(friend.displayName)}</div>
                          <span style={s.friendName}>{friend.displayName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
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
  },
  navBtn: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  content: {
    maxWidth: "640px",
    margin: "0 auto",
    padding: "2rem 1.5rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.5rem",
  },
  loading: {
    color: "#64748b",
    fontSize: "0.9rem",
    padding: "2rem 0",
    textAlign: "center" as const,
  },
  errorBox: {
    color: "#dc2626",
    fontSize: "0.875rem",
    background: "#fef2f2",
    border: "1.5px solid #fca5a5",
    borderRadius: "8px",
    padding: "1rem",
  },
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
  },
  avatar: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "#1e3a5f",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.4rem",
    fontWeight: "700",
    flexShrink: 0,
    letterSpacing: "0.03em",
  },
  displayName: {
    margin: "0 0 0.25rem 0",
    fontSize: "1.5rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  ownBadge: {
    fontSize: "0.75rem",
    color: "#2563eb",
    fontWeight: "600",
  },
  privateCard: {
    background: "#fff",
    borderRadius: "12px",
    padding: "2.5rem 1.5rem",
    boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
    textAlign: "center" as const,
  },
  privateTitle: {
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: "0.5rem",
  },
  privateText: {
    fontSize: "0.875rem",
    color: "#64748b",
  },
  statsCard: {
    background: "#fff",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
  },
  sectionTitle: {
    margin: "0 0 1rem 0",
    fontSize: "1.1rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "1rem",
  },
  statItem: {
    textAlign: "center" as const,
    padding: "1rem 0.5rem",
    background: "#f8fafc",
    borderRadius: "8px",
    border: "1.5px solid #e2e8f0",
  },
  statValue: {
    fontSize: "1.6rem",
    fontWeight: "700",
    color: "#1e3a5f",
    marginBottom: "0.25rem",
  },
  statLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
    fontWeight: "500",
  },
  friendsCard: {
    background: "#fff",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
  },
  friendCount: {
    fontWeight: "400",
    color: "#64748b",
    fontSize: "1rem",
  },
  friendsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  },
  friendRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.6rem 0.5rem",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.12s",
  },
  friendAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "#e2e8f0",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    fontWeight: "700",
    flexShrink: 0,
  },
  friendName: {
    fontWeight: "500",
    color: "#1e293b",
    fontSize: "0.9rem",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: "0.875rem",
  },
} satisfies Record<string, React.CSSProperties>;
