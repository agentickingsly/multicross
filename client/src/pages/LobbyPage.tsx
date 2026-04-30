import { useState, useEffect, useRef } from "react";
import { useWindowWidth } from "../utils/useWindowWidth";
import { useNavigate } from "react-router-dom";
import type { Puzzle, User } from "@multicross/shared";
import type { FriendRequestPayload, GameInvitePayload } from "@multicross/shared";
import {
  getPuzzles, getMyPuzzles, createGame, joinGame, deletePuzzle,
  getMyActiveGames, abandonGame, getWatchableGames,
  getFriends, getFriendRequests, getInvites,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend,
  inviteToGame, acceptInvite, declineInvite, searchUsers,
  getMe, updatePrivacy, sendFriendRequestByCode,
} from "../api/client";
import type {
  ActiveGame, WatchableGame, PuzzleSortOption,
  Friend, FriendRequest, GameInviteItem, UserSearchResult,
} from "../api/client";
import { ws } from "../ws/socket";

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
    flexDirection: "column" as const,
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
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  puzzleCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
    padding: "1rem",
    border: "1.5px solid #e2e8f0",
    borderRadius: "8px",
    background: "#f8fafc",
  },
  puzzleInfo: {
    display: "flex",
    flexDirection: "column" as const,
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
  puzzleStats: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    marginTop: "0.1rem",
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
  sortRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
    alignItems: "center",
    marginBottom: "1rem",
  },
  sortLabel: {
    fontSize: "0.78rem",
    color: "#64748b",
    marginRight: "0.25rem",
  },
  paginationRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    marginTop: "1rem",
    fontSize: "0.875rem",
    color: "#64748b",
  },
  puzzleCount: {
    fontSize: "0.8rem",
    color: "#94a3b8",
    fontWeight: "400",
  },
  activeGameCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
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
  watchBtn: {
    background: "transparent",
    color: "#7c3aed",
    border: "1.5px solid #c4b5fd",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
    whiteSpace: "nowrap" as const,
  },
  // Friends panel
  friendsBtn: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    position: "relative" as const,
  },
  badge: {
    position: "absolute" as const,
    top: "-6px",
    right: "-6px",
    background: "#ef4444",
    color: "#fff",
    borderRadius: "50%",
    width: "18px",
    height: "18px",
    fontSize: "0.65rem",
    fontWeight: "700",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBanner: {
    background: "#eff6ff",
    border: "1.5px solid #bfdbfe",
    borderRadius: "12px",
    padding: "1rem 1.5rem",
    boxShadow: "0 1px 4px rgba(37,99,235,0.07)",
  },
  inviteBannerTitle: {
    margin: "0 0 0.75rem 0",
    fontSize: "1rem",
    fontWeight: "700",
    color: "#1e40af",
  },
  inviteCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
    padding: "0.7rem 0.9rem",
    border: "1.5px solid #bfdbfe",
    borderRadius: "8px",
    background: "#fff",
    marginBottom: "0.5rem",
  },
  inviteInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.15rem",
  },
  inviteTitle: {
    fontWeight: "600",
    color: "#1e293b",
    fontSize: "0.9rem",
  },
  inviteMeta: {
    fontSize: "0.78rem",
    color: "#64748b",
  },
  acceptBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.35rem 0.8rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
  },
  declineBtn: {
    background: "transparent",
    color: "#64748b",
    border: "1.5px solid #cbd5e1",
    borderRadius: "6px",
    padding: "0.35rem 0.8rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
  },
  friendRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
    padding: "0.6rem 0",
    borderBottom: "1px solid #f1f5f9",
  },
  friendInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  onlineDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  friendName: {
    fontWeight: "500",
    color: "#1e293b",
    fontSize: "0.9rem",
  },
  friendActions: {
    display: "flex",
    gap: "0.4rem",
    flexShrink: 0,
  },
  inviteGameBtn: {
    background: "#059669",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.3rem 0.7rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.78rem",
  },
  unfriendBtn: {
    background: "transparent",
    color: "#94a3b8",
    border: "1.5px solid #e2e8f0",
    borderRadius: "6px",
    padding: "0.3rem 0.7rem",
    cursor: "pointer",
    fontSize: "0.78rem",
  },
  requestRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
    padding: "0.6rem 0",
    borderBottom: "1px solid #f1f5f9",
  },
  requestName: {
    fontWeight: "500",
    color: "#1e293b",
    fontSize: "0.9rem",
  },
  requestActions: {
    display: "flex",
    gap: "0.4rem",
    flexShrink: 0,
  },
  searchRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  searchInput: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    border: "1.5px solid #cbd5e1",
    fontSize: "0.875rem",
    outline: "none",
  },
  searchBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.5rem 0.9rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.8rem",
    whiteSpace: "nowrap" as const,
  },
  searchResult: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0",
    borderBottom: "1px solid #f1f5f9",
  },
  subsectionTitle: {
    fontSize: "0.85rem",
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    margin: "1rem 0 0.5rem 0",
  },
  inviteCodeBox: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 1rem",
    background: "#f0fdf4",
    border: "1.5px solid #bbf7d0",
    borderRadius: "8px",
    marginBottom: "1rem",
    flexWrap: "wrap" as const,
  },
  inviteCodeLabel: {
    fontSize: "0.85rem",
    color: "#166534",
    fontWeight: "600",
  },
  inviteCodeText: {
    fontSize: "1rem",
    fontWeight: "700",
    color: "#14532d",
    letterSpacing: "0.08em",
    background: "none",
    fontFamily: "monospace",
  },
  copyBtn: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.3rem 0.7rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.78rem",
  },
  privacyRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    padding: "0.6rem 0",
    marginBottom: "0.25rem",
    borderBottom: "1px solid #f1f5f9",
    flexWrap: "wrap" as const,
  },
  privacyText: {
    fontSize: "0.82rem",
    color: "#475569",
  },
  tabRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  codeRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  codeInput: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    border: "1.5px solid #cbd5e1",
    fontSize: "0.9rem",
    outline: "none",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontFamily: "monospace",
  },
  successText: {
    color: "#16a34a",
    fontSize: "0.875rem",
    marginBottom: "0.5rem",
  },
} satisfies Record<string, React.CSSProperties>;

function sortBtnStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: "#2563eb", color: "#fff", border: "1.5px solid #2563eb", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" }
    : { background: "transparent", color: "#2563eb", border: "1.5px solid #93c5fd", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" };
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return disabled
    ? { background: "transparent", color: "#94a3b8", border: "1.5px solid #e2e8f0", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "not-allowed", fontWeight: "600", fontSize: "0.8rem" }
    : { background: "transparent", color: "#2563eb", border: "1.5px solid #93c5fd", borderRadius: "6px", padding: "0.3rem 0.75rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" };
}

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

function tabBtnStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: "#2563eb", color: "#fff", border: "1.5px solid #2563eb", borderRadius: "6px", padding: "0.3rem 0.85rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" }
    : { background: "transparent", color: "#475569", border: "1.5px solid #cbd5e1", borderRadius: "6px", padding: "0.3rem 0.85rem", cursor: "pointer", fontWeight: "600", fontSize: "0.8rem" };
}

function privacyToggleStyle(searchable: boolean): React.CSSProperties {
  return searchable
    ? { background: "#2563eb", color: "#fff", border: "none", borderRadius: "20px", padding: "0.3rem 0.85rem", cursor: "pointer", fontWeight: "600", fontSize: "0.78rem", whiteSpace: "nowrap" as const }
    : { background: "#f1f5f9", color: "#64748b", border: "1.5px solid #cbd5e1", borderRadius: "20px", padding: "0.3rem 0.85rem", cursor: "pointer", fontWeight: "600", fontSize: "0.78rem", whiteSpace: "nowrap" as const };
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth <= 640;

  // Puzzle state
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loadingPuzzles, setLoadingPuzzles] = useState(true);
  const [puzzleError, setPuzzleError] = useState("");
  const [puzzlePage, setPuzzlePage] = useState(1);
  const [puzzleSort, setPuzzleSort] = useState<PuzzleSortOption>("newest");
  const [puzzleTotalPages, setPuzzleTotalPages] = useState(1);
  const [puzzleTotal, setPuzzleTotal] = useState(0);
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

  const [watchableGames, setWatchableGames] = useState<WatchableGame[]>([]);
  const [loadingWatchable, setLoadingWatchable] = useState(true);

  // Friends panel state
  const [showFriends, setShowFriends] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [friendError, setFriendError] = useState("");

  // Game invites state
  const [invites, setInvites] = useState<GameInviteItem[]>([]);
  const [actingOnInvite, setActingOnInvite] = useState<string | null>(null);
  const [invitingFriendId, setInvitingFriendId] = useState<string | null>(null);

  // Invite code + privacy state
  const [friendsTab, setFriendsTab] = useState<"search" | "code">("search");
  const [myInviteCode, setMyInviteCode] = useState("");
  const [isSearchable, setIsSearchable] = useState(true);
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [sendingByCode, setSendingByCode] = useState(false);
  const [codeSuccess, setCodeSuccess] = useState("");

  const currentUser: User | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null");
    } catch {
      return null;
    }
  })();

  // Connect WS and listen for social events
  useEffect(() => {
    const token = localStorage.getItem("multicross_token") ?? "";
    ws.connect(token);

    const offFriendRequest = ws.on("friend_request", (payload: FriendRequestPayload) => {
      setFriendRequests((prev) => [
        {
          friendshipId: payload.friendshipId,
          requesterId: payload.requesterId,
          displayName: payload.requesterDisplayName,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    });

    const offGameInvite = ws.on("game_invite", (payload: GameInvitePayload) => {
      setInvites((prev) => [
        {
          id: payload.inviteId,
          gameId: payload.gameId,
          inviterId: payload.inviterId,
          inviterDisplayName: payload.inviterDisplayName,
          puzzleTitle: payload.puzzleTitle,
          gameStatus: "waiting",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    });

    return () => {
      offFriendRequest();
      offGameInvite();
    };
  }, []);

  // Load puzzles
  useEffect(() => {
    setLoadingPuzzles(true);
    setPuzzleError("");
    getPuzzles({ page: puzzlePage, sort: puzzleSort })
      .then((data) => {
        setPuzzles(data.puzzles);
        setPuzzleTotalPages(data.totalPages);
        setPuzzleTotal(data.total);
      })
      .catch((err) => setPuzzleError(err instanceof Error ? err.message : "Failed to load puzzles"))
      .finally(() => setLoadingPuzzles(false));
  }, [puzzlePage, puzzleSort]);

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
        .catch(() => {})
        .finally(() => setLoadingActiveGames(false));
    }
    fetchActiveGames();
    const interval = setInterval(fetchActiveGames, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function fetchWatchable() {
      getWatchableGames()
        .then(({ games }) => setWatchableGames(games))
        .catch(() => {})
        .finally(() => setLoadingWatchable(false));
    }
    fetchWatchable();
    const interval = setInterval(fetchWatchable, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Load invites on mount
  useEffect(() => {
    getInvites()
      .then(({ invites }) => setInvites(invites))
      .catch(() => {});
  }, []);

  // Load friends + profile when panel opens
  const friendsLoadedRef = useRef(false);
  useEffect(() => {
    if (!showFriends || friendsLoadedRef.current) return;
    friendsLoadedRef.current = true;
    setLoadingFriends(true);

    // Seed invite code from localStorage if already present, otherwise fetch
    const storedUser = (() => {
      try { return JSON.parse(localStorage.getItem("multicross_user") ?? "null"); } catch { return null; }
    })();
    if (storedUser?.inviteCode) {
      setMyInviteCode(storedUser.inviteCode);
      setIsSearchable(storedUser.isSearchable ?? true);
    } else {
      getMe()
        .then(({ user }) => {
          setMyInviteCode(user.inviteCode ?? "");
          setIsSearchable(user.isSearchable ?? true);
          // Persist to localStorage so future loads skip the fetch
          const stored = (() => {
            try { return JSON.parse(localStorage.getItem("multicross_user") ?? "null"); } catch { return null; }
          })();
          if (stored) {
            localStorage.setItem("multicross_user", JSON.stringify({ ...stored, inviteCode: user.inviteCode, isSearchable: user.isSearchable }));
          }
        })
        .catch(() => {});
    }

    Promise.all([getFriends(), getFriendRequests()])
      .then(([friendsData, requestsData]) => {
        setFriends(friendsData.friends);
        setFriendRequests(requestsData.requests);
      })
      .catch(() => {})
      .finally(() => setLoadingFriends(false));
  }, [showFriends]);

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
    if (!code) { setJoinError("Enter a room code."); return; }
    if (code.length !== 6) { setJoinError("Room code must be exactly 6 characters."); return; }
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

  function handleSortChange(sort: PuzzleSortOption) {
    setPuzzleSort(sort);
    setPuzzlePage(1);
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

  function handleCopyInviteCode() {
    if (!myInviteCode) return;
    navigator.clipboard.writeText(myInviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  async function handleTogglePrivacy() {
    setUpdatingPrivacy(true);
    setFriendError("");
    try {
      const { isSearchable: updated } = await updatePrivacy(!isSearchable);
      setIsSearchable(updated);
      const stored = (() => {
        try { return JSON.parse(localStorage.getItem("multicross_user") ?? "null"); } catch { return null; }
      })();
      if (stored) {
        localStorage.setItem("multicross_user", JSON.stringify({ ...stored, isSearchable: updated }));
      }
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to update privacy setting");
    } finally {
      setUpdatingPrivacy(false);
    }
  }

  async function handleSendByCode() {
    const code = codeInput.trim();
    if (!code) return;
    setSendingByCode(true);
    setFriendError("");
    setCodeSuccess("");
    try {
      await sendFriendRequestByCode(code);
      setCodeInput("");
      setCodeSuccess("Friend request sent!");
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSendingByCode(false);
    }
  }

  async function handleSearchUsers() {
    const q = friendSearch.trim();
    if (q.length < 2) return;
    setSearching(true);
    setFriendError("");
    try {
      const { users } = await searchUsers(q);
      setSearchResults(users);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleSendRequest(addresseeId: string) {
    setSendingTo(addresseeId);
    setFriendError("");
    try {
      await sendFriendRequest(addresseeId);
      setSearchResults((prev) => prev.filter((u) => u.id !== addresseeId));
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSendingTo(null);
    }
  }

  async function handleAcceptRequest(friendshipId: string) {
    setAcceptingId(friendshipId);
    setFriendError("");
    try {
      await acceptFriendRequest(friendshipId);
      const req = friendRequests.find((r) => r.friendshipId === friendshipId);
      setFriendRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
      if (req) {
        setFriends((prev) => [
          ...prev,
          { friendshipId, userId: req.requesterId, displayName: req.displayName, online: false },
        ]);
      }
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to accept request");
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleDeclineRequest(friendshipId: string) {
    setFriendError("");
    try {
      await declineFriendRequest(friendshipId);
      setFriendRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to decline request");
    }
  }

  async function handleRemoveFriend(friendshipId: string) {
    if (!confirm("Remove this friend?")) return;
    setRemovingId(friendshipId);
    setFriendError("");
    try {
      await removeFriend(friendshipId);
      setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to remove friend");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleInviteToGame(friendUserId: string) {
    const waitingGame = activeGames.find((g) => g.status === "waiting");
    if (!waitingGame) return;
    setInvitingFriendId(friendUserId);
    setFriendError("");
    try {
      await inviteToGame(waitingGame.id, friendUserId);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInvitingFriendId(null);
    }
  }

  async function handleAcceptInvite(inviteId: string) {
    setActingOnInvite(inviteId);
    try {
      const { gameId } = await acceptInvite(inviteId);
      navigate(`/game/${gameId}`);
    } catch (err) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      alert(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setActingOnInvite(null);
    }
  }

  async function handleDeclineInvite(inviteId: string) {
    setActingOnInvite(inviteId);
    try {
      await declineInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } finally {
      setActingOnInvite(null);
    }
  }

  const hasWaitingGame = activeGames.some((g) => g.status === "waiting");
  const pendingRequestCount = friendRequests.length;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerTitle}>Multicross</div>
        <div style={s.headerRight}>
          {!isMobile && <span>Hey, {currentUser?.displayName ?? "Player"}</span>}
          {!isMobile && (
            <button style={s.createPuzzleLink} onClick={() => navigate("/editor")}>
              Create puzzle
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button
              style={{
                ...s.friendsBtn,
                background: showFriends ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)",
              }}
              onClick={() => setShowFriends((v) => !v)}
            >
              Friends
            </button>
            {pendingRequestCount > 0 && (
              <span style={s.badge}>{pendingRequestCount > 9 ? "9+" : pendingRequestCount}</span>
            )}
          </div>
          <button style={s.logoutBtn} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div style={s.content}>
        {/* Game invites banner */}
        {invites.length > 0 && (
          <div style={s.inviteBanner}>
            <h2 style={s.inviteBannerTitle}>Game invites</h2>
            {invites.map((invite) => (
              <div key={invite.id} style={s.inviteCard}>
                <div style={s.inviteInfo}>
                  <div style={s.inviteTitle}>{invite.puzzleTitle}</div>
                  <div style={s.inviteMeta}>
                    From {invite.inviterDisplayName}
                    {" · "}
                    <span style={{ textTransform: "capitalize" }}>{invite.gameStatus}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                  <button
                    style={s.acceptBtn}
                    disabled={actingOnInvite === invite.id}
                    onClick={() => handleAcceptInvite(invite.id)}
                  >
                    {actingOnInvite === invite.id ? "Joining…" : "Join"}
                  </button>
                  <button
                    style={s.declineBtn}
                    disabled={actingOnInvite === invite.id}
                    onClick={() => handleDeclineInvite(invite.id)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends panel */}
        {showFriends && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Friends</h2>
            {friendError && <div style={s.error}>{friendError}</div>}

            {/* Your invite code */}
            {myInviteCode && (
              <div style={s.inviteCodeBox}>
                <span style={s.inviteCodeLabel}>Your invite code:</span>
                <code style={s.inviteCodeText}>{myInviteCode}</code>
                <button style={s.copyBtn} onClick={handleCopyInviteCode}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            )}

            {/* Privacy toggle */}
            <div style={s.privacyRow}>
              <span style={s.privacyText}>
                {isSearchable
                  ? "Players can find you by display name"
                  : "Players cannot find you by display name (share your invite code instead)"}
              </span>
              <button
                style={privacyToggleStyle(isSearchable)}
                disabled={updatingPrivacy}
                onClick={handleTogglePrivacy}
              >
                {isSearchable ? "Discoverable" : "Hidden"}
              </button>
            </div>

            {/* Add friend — tabs */}
            <p style={s.subsectionTitle}>Add friend</p>
            <div style={s.tabRow}>
              <button style={tabBtnStyle(friendsTab === "search")} onClick={() => setFriendsTab("search")}>
                By name
              </button>
              <button style={tabBtnStyle(friendsTab === "code")} onClick={() => { setFriendsTab("code"); setCodeSuccess(""); }}>
                By code
              </button>
            </div>

            {friendsTab === "search" && (
              <>
                <div style={s.searchRow}>
                  <input
                    style={s.searchInput}
                    type="text"
                    placeholder="Search by display name…"
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchUsers()}
                  />
                  <button
                    style={s.searchBtn}
                    onClick={handleSearchUsers}
                    disabled={searching || friendSearch.trim().length < 2}
                  >
                    {searching ? "Searching…" : "Search"}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div style={{ marginBottom: "0.75rem" }}>
                    {searchResults.map((user) => (
                      <div key={user.id} style={s.searchResult}>
                        <span style={s.friendName}>{user.displayName}</span>
                        <button
                          style={s.acceptBtn}
                          disabled={sendingTo === user.id}
                          onClick={() => handleSendRequest(user.id)}
                        >
                          {sendingTo === user.id ? "Sending…" : "Send request"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {friendsTab === "code" && (
              <>
                {codeSuccess && <div style={s.successText}>{codeSuccess}</div>}
                <div style={s.codeRow}>
                  <input
                    style={s.codeInput}
                    type="text"
                    placeholder="e.g. ABCD-EF12GH"
                    value={codeInput}
                    onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCodeSuccess(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendByCode()}
                    maxLength={12}
                  />
                  <button
                    style={s.searchBtn}
                    onClick={handleSendByCode}
                    disabled={sendingByCode || codeInput.trim().length < 3}
                  >
                    {sendingByCode ? "Sending…" : "Send request"}
                  </button>
                </div>
              </>
            )}

            {/* Pending incoming requests */}
            {friendRequests.length > 0 && (
              <>
                <p style={s.subsectionTitle}>Friend requests ({friendRequests.length})</p>
                {friendRequests.map((req) => (
                  <div key={req.friendshipId} style={s.requestRow}>
                    <span style={s.requestName}>{req.displayName}</span>
                    <div style={s.requestActions}>
                      <button
                        style={s.acceptBtn}
                        disabled={acceptingId === req.friendshipId}
                        onClick={() => handleAcceptRequest(req.friendshipId)}
                      >
                        {acceptingId === req.friendshipId ? "Accepting…" : "Accept"}
                      </button>
                      <button
                        style={s.declineBtn}
                        onClick={() => handleDeclineRequest(req.friendshipId)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Friends list */}
            <p style={s.subsectionTitle}>My friends</p>
            {loadingFriends ? (
              <div style={s.loading}>Loading…</div>
            ) : friends.length === 0 ? (
              <div style={s.emptyText}>No friends yet — search or share your invite code!</div>
            ) : (
              friends.map((friend) => (
                <div key={friend.friendshipId} style={s.friendRow}>
                  <div style={s.friendInfo}>
                    <span
                      style={{
                        ...s.onlineDot,
                        background: friend.online ? "#22c55e" : "#cbd5e1",
                      }}
                    />
                    <span style={s.friendName}>{friend.displayName}</span>
                  </div>
                  <div style={s.friendActions}>
                    {hasWaitingGame && (
                      <button
                        style={s.inviteGameBtn}
                        disabled={invitingFriendId === friend.userId}
                        onClick={() => handleInviteToGame(friend.userId)}
                      >
                        {invitingFriendId === friend.userId ? "Inviting…" : "Invite to game"}
                      </button>
                    )}
                    <button
                      style={s.unfriendBtn}
                      disabled={removingId === friend.friendshipId}
                      onClick={() => handleRemoveFriend(friend.friendshipId)}
                    >
                      {removingId === friend.friendshipId ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* My active games */}
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
                    {((puzzle.playCount ?? 0) > 0 || (puzzle.ratingCount ?? 0) > 0) && (
                      <div style={s.puzzleStats}>
                        {puzzle.playCount ?? 0} {(puzzle.playCount ?? 0) === 1 ? "play" : "plays"}
                        {(puzzle.ratingCount ?? 0) > 0 && ` · ${puzzle.averageDifficulty?.toFixed(1)} diff · ${puzzle.averageEnjoyment?.toFixed(1)} enjoy · ${puzzle.ratingCount} ${puzzle.ratingCount === 1 ? "rating" : "ratings"}`}
                      </div>
                    )}
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

        {/* Watch a game in progress */}
        {(!loadingWatchable && watchableGames.length > 0) && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Watch a game</h2>
            <div style={s.puzzleList}>
              {watchableGames.map((game) => (
                <div key={game.id} style={s.activeGameCard} onClick={() => navigate(`/game/${game.id}?spectate=true`)}>
                  <div style={s.activeGameInfo}>
                    <div style={s.activeGameTitle}>{game.puzzleTitle}</div>
                    <div style={s.activeGameMeta}>
                      {game.participantCount} player{game.participantCount !== 1 ? "s" : ""}
                      {" · "}
                      <span style={{ textTransform: "capitalize" }}>{game.status}</span>
                      {" · "}
                      Room {game.roomCode}
                    </div>
                  </div>
                  <button
                    style={s.watchBtn}
                    onClick={(e) => { e.stopPropagation(); navigate(`/game/${game.id}?spectate=true`); }}
                  >
                    Watch
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available puzzles */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>
              Start a new game
              {!loadingPuzzles && puzzleTotal > 0 && (
                <span style={s.puzzleCount}> · {puzzleTotal} {puzzleTotal === 1 ? "puzzle" : "puzzles"}</span>
              )}
            </h2>
          </div>
          <div style={s.sortRow}>
            <span style={s.sortLabel}>Sort:</span>
            {(["newest", "most_played", "most_difficult", "most_enjoyable"] as PuzzleSortOption[]).map((opt) => (
              <button
                key={opt}
                style={sortBtnStyle(puzzleSort === opt)}
                onClick={() => handleSortChange(opt)}
              >
                {opt === "newest" ? "Newest" : opt === "most_played" ? "Most Played" : opt === "most_difficult" ? "Most Difficult" : "Most Enjoyable"}
              </button>
            ))}
          </div>
          {puzzleError && <div style={s.error}>{puzzleError}</div>}
          {loadingPuzzles ? (
            <div style={s.loading}>Loading puzzles…</div>
          ) : (
            <>
              <div style={s.puzzleList}>
                {(() => {
                  const watchableForPuzzle = new Map<string, WatchableGame>();
                  for (const g of watchableGames) {
                    if (!watchableForPuzzle.has(g.puzzleId)) {
                      watchableForPuzzle.set(g.puzzleId, g);
                    }
                  }
                  return puzzles.map((puzzle) => {
                    const watchableGame = watchableForPuzzle.get(puzzle.id);
                    return (
                      <div key={puzzle.id}>
                        <div style={s.puzzleCard}>
                          <div style={s.puzzleInfo}>
                            <div style={s.puzzleTitle}>{puzzle.title}</div>
                            <div style={s.puzzleMeta}>
                              By {puzzle.author} · {puzzle.width}×{puzzle.height}
                            </div>
                            {((puzzle.playCount ?? 0) > 0 || (puzzle.ratingCount ?? 0) > 0) && (
                              <div style={s.puzzleStats}>
                                {puzzle.playCount ?? 0} {(puzzle.playCount ?? 0) === 1 ? "play" : "plays"}
                                {(puzzle.ratingCount ?? 0) > 0 && ` · ${puzzle.averageDifficulty?.toFixed(1)} diff · ${puzzle.averageEnjoyment?.toFixed(1)} enjoy · ${puzzle.ratingCount} ${puzzle.ratingCount === 1 ? "rating" : "ratings"}`}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            {watchableGame && (
                              <button
                                style={s.watchBtn}
                                onClick={() => navigate(`/game/${watchableGame.id}?spectate=true`)}
                              >
                                Watch
                              </button>
                            )}
                            <button
                              style={s.createBtn}
                              onClick={() => handleCreateGame(puzzle.id)}
                              disabled={creatingId === puzzle.id}
                            >
                              {creatingId === puzzle.id ? "Creating…" : "Create game"}
                            </button>
                          </div>
                        </div>
                        {createError?.id === puzzle.id && (
                          <div style={s.error}>{createError.msg}</div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              {puzzleTotalPages > 1 && (
                <div style={s.paginationRow}>
                  <button
                    style={pageBtnStyle(puzzlePage <= 1)}
                    disabled={puzzlePage <= 1}
                    onClick={() => setPuzzlePage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span>Page {puzzlePage} of {puzzleTotalPages}</span>
                  <button
                    style={pageBtnStyle(puzzlePage >= puzzleTotalPages)}
                    disabled={puzzlePage >= puzzleTotalPages}
                    onClick={() => setPuzzlePage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
