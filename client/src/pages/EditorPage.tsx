import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PuzzleEditor, { type EditablePuzzle } from "../components/PuzzleEditor";
import { getPuzzle, createPuzzle, updatePuzzle } from "../api/client";
import type { User } from "@multicross/shared";

const DEFAULT_SIZE = 15;

function makeEmptyGrid(w: number, h: number): (string | null)[][] {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(""));
}

function makeEmptyPuzzle(authorName: string): EditablePuzzle {
  return {
    title: "",
    author: authorName,
    width: DEFAULT_SIZE,
    height: DEFAULT_SIZE,
    grid: makeEmptyGrid(DEFAULT_SIZE, DEFAULT_SIZE),
    clues: { across: {}, down: {} },
    status: "draft",
  };
}

export default function EditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const currentUser: User | null = (() => {
    try {
      return JSON.parse(localStorage.getItem("multicross_user") ?? "null");
    } catch {
      return null;
    }
  })();

  const [puzzle, setPuzzle] = useState<EditablePuzzle>(
    makeEmptyPuzzle(currentUser?.displayName ?? "")
  );
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draftToast, setDraftToast] = useState(false);

  // Load existing puzzle for edit mode
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getPuzzle(id)
      .then(({ puzzle: p }) => {
        if (p.authorId && currentUser && p.authorId !== currentUser.id) {
          navigate("/lobby", { replace: true });
          return;
        }
        setPuzzleId(p.id);
        setPuzzle({
          title: p.title,
          author: p.author,
          width: p.width,
          height: p.height,
          grid: p.grid,
          clues: {
            across: Object.fromEntries(
              Object.entries(p.clues.across).map(([k, v]) => [k, v])
            ),
            down: Object.fromEntries(
              Object.entries(p.clues.down).map(([k, v]) => [k, v])
            ),
          },
          status: p.status ?? "draft",
        });
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load puzzle");
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(p: EditablePuzzle, status: "draft" | "published") {
    if (!p.title.trim()) {
      setSaveError("Please enter a puzzle title before saving.");
      return;
    }
    setSaveError("");
    setIsSaving(true);
    try {
      const payload = { ...p, status };
      if (puzzleId) {
        await updatePuzzle(puzzleId, payload);
      } else {
        const { puzzle: created } = await createPuzzle(payload);
        setPuzzleId(created.id);
      }
      if (status === "published") {
        navigate("/lobby");
      } else {
        setDraftToast(true);
        setTimeout(() => setDraftToast(false), 3000);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={s.loadingPage}>
        <div style={s.loadingText}>Loading puzzle…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={s.loadingPage}>
        <div style={s.errorText}>{loadError}</div>
        <button style={s.backBtn} onClick={() => navigate("/lobby")}>
          Back to lobby
        </button>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Page header */}
      <header style={s.header}>
        <div style={s.headerTitle}>Multicross — {isEditMode ? "Edit puzzle" : "New puzzle"}</div>
      </header>

      {/* Save error */}
      {saveError && (
        <div style={s.saveError}>{saveError}</div>
      )}

      {/* Draft saved toast */}
      {draftToast && (
        <div style={s.toast}>Draft saved</div>
      )}

      <PuzzleEditor
        puzzle={puzzle}
        onChange={setPuzzle}
        onSave={handleSave}
        onCancel={() => navigate("/lobby")}
        isSaving={isSaving}
      />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    background: "#1e3a5f",
    color: "#fff",
    padding: "0 1.5rem",
    height: "52px",
    display: "flex",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1.2rem",
    fontWeight: "bold",
  },
  saveError: {
    background: "#fef2f2",
    color: "#dc2626",
    padding: "0.6rem 1.5rem",
    fontSize: "0.875rem",
    borderBottom: "1px solid #fca5a5",
  },
  toast: {
    position: "fixed",
    bottom: "1.5rem",
    right: "1.5rem",
    background: "#166534",
    color: "#fff",
    padding: "0.6rem 1.25rem",
    borderRadius: "8px",
    fontWeight: "600",
    fontSize: "0.9rem",
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
    zIndex: 1000,
  },
  loadingPage: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    fontFamily: "system-ui, sans-serif",
  },
  loadingText: {
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
};
