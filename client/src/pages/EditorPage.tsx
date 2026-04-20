import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PuzzleEditor, { type EditablePuzzle } from "../components/PuzzleEditor";
import { getPuzzle, createPuzzle, updatePuzzle } from "../api/client";
import type { User } from "@multicross/shared";

const PRESETS: Array<{ w: number; h: number; label: string }> = [
  { w: 5,  h: 5,  label: "Mini"     },
  { w: 7,  h: 7,  label: "Small"    },
  { w: 9,  h: 9,  label: "Medium"   },
  { w: 11, h: 11, label: "Large"    },
  { w: 13, h: 13, label: "Standard" },
  { w: 15, h: 15, label: "Full"     },
];

function makeEmptyGrid(w: number, h: number): (string | null)[][] {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(""));
}

function makeEmptyPuzzle(authorName: string, w = 15, h = 15): EditablePuzzle {
  return {
    title: "",
    author: authorName,
    width: w,
    height: h,
    grid: makeEmptyGrid(w, h),
    clues: { across: {}, down: {} },
    status: "draft",
  };
}

// ─── GridPreview ──────────────────────────────────────────────────────────────

function GridPreview({ w, h }: { w: number; h: number }) {
  const MAX = 80;
  const cell = Math.min(MAX / w, MAX / h);
  const svgW = Math.round(cell * w);
  const svgH = Math.round(cell * h);
  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ display: "block", border: "2px solid #1e3a5f", background: "#fff", flexShrink: 0 }}
    >
      {Array.from({ length: w - 1 }, (_, i) => (
        <line key={`v${i}`} x1={(i + 1) * cell} y1={0} x2={(i + 1) * cell} y2={svgH}
              stroke="#cbd5e1" strokeWidth="0.5" />
      ))}
      {Array.from({ length: h - 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * cell} x2={svgW} y2={(i + 1) * cell}
              stroke="#cbd5e1" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

// ─── SizePicker ───────────────────────────────────────────────────────────────

interface SizePickerProps {
  onConfirm: (w: number, h: number) => void;
  onCancel: () => void;
}

function SizePicker({ onConfirm, onCancel }: SizePickerProps) {
  const [selected, setSelected] = useState("15x15");
  const [customW, setCustomW] = useState("15");
  const [customH, setCustomH] = useState("15");

  const isCustom = selected === "custom";
  const parsedW = isCustom ? parseInt(customW, 10) : parseInt(selected.split("x")[0], 10);
  const parsedH = isCustom ? parseInt(customH, 10) : parseInt(selected.split("x")[1], 10);
  const validW = Number.isFinite(parsedW) && parsedW >= 3 && parsedW <= 25;
  const validH = Number.isFinite(parsedH) && parsedH >= 3 && parsedH <= 25;
  const isValid = validW && validH;

  return (
    <div style={sp.page}>
      <div style={sp.card}>
        <div>
          <h2 style={sp.heading}>New puzzle</h2>
          <p style={sp.subheading}>Choose a grid size to get started.</p>
        </div>

        <div style={sp.presets}>
          {PRESETS.map(({ w, h, label }) => {
            const key = `${w}x${h}`;
            const active = selected === key;
            return (
              <button
                key={key}
                style={active ? { ...sp.presetBtn, ...sp.presetBtnActive } : sp.presetBtn}
                onClick={() => setSelected(key)}
              >
                <span style={{ ...sp.presetDim, color: active ? "#fff" : "#1e293b" }}>
                  {w}×{h}
                </span>
                <span style={{ ...sp.presetLabel, color: active ? "rgba(255,255,255,0.75)" : "#94a3b8" }}>
                  {label}
                </span>
              </button>
            );
          })}
          <button
            style={isCustom ? { ...sp.presetBtn, ...sp.presetBtnActive } : sp.presetBtn}
            onClick={() => setSelected("custom")}
          >
            <span style={{ ...sp.presetDim, color: isCustom ? "#fff" : "#1e293b" }}>W×H</span>
            <span style={{ ...sp.presetLabel, color: isCustom ? "rgba(255,255,255,0.75)" : "#94a3b8" }}>
              Custom
            </span>
          </button>
        </div>

        {isCustom && (
          <div>
            <div style={sp.customRow}>
              <label style={sp.customFieldLabel}>
                Width
                <input
                  type="number"
                  min={3}
                  max={25}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  style={{ ...sp.customInput, ...(customW !== "" && !validW ? sp.inputErr : {}) }}
                />
              </label>
              <span style={sp.customSep}>×</span>
              <label style={sp.customFieldLabel}>
                Height
                <input
                  type="number"
                  min={3}
                  max={25}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  style={{ ...sp.customInput, ...(customH !== "" && !validH ? sp.inputErr : {}) }}
                />
              </label>
            </div>
            {!isValid && (
              <p style={sp.customHint}>Width and height must each be between 3 and 25.</p>
            )}
          </div>
        )}

        {isValid && (
          <div style={sp.preview}>
            <GridPreview w={parsedW} h={parsedH} />
            <span style={sp.previewLabel}>
              {parsedW}×{parsedH} · {parsedW * parsedH} cells
            </span>
          </div>
        )}

        <div style={sp.actions}>
          <button style={sp.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            style={isValid ? sp.confirmBtn : { ...sp.confirmBtn, opacity: 0.45, cursor: "not-allowed" as const }}
            onClick={() => isValid && onConfirm(parsedW, parsedH)}
            disabled={!isValid}
          >
            Start editing →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditorPage ───────────────────────────────────────────────────────────────

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
  // skip size picker when editing an existing saved puzzle
  const [sizeChosen, setSizeChosen] = useState(isEditMode);

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
            across: Object.fromEntries(Object.entries(p.clues.across).map(([k, v]) => [k, v])),
            down:   Object.fromEntries(Object.entries(p.clues.down).map(([k, v]) => [k, v])),
          },
          status: p.status ?? "draft",
        });
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load puzzle");
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSizeConfirm(w: number, h: number) {
    setPuzzle(makeEmptyPuzzle(currentUser?.displayName ?? "", w, h));
    setSizeChosen(true);
  }

  function handleChangeSize() {
    if (!confirm("Changing the grid size will clear all cells and clues. Continue?")) return;
    setSizeChosen(false);
  }

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

  if (!sizeChosen) {
    return (
      <SizePicker
        onConfirm={handleSizeConfirm}
        onCancel={() => navigate("/lobby")}
      />
    );
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerTitle}>Multicross — {isEditMode ? "Edit puzzle" : "New puzzle"}</div>
        {!isEditMode && (
          <button style={s.changeSizeBtn} onClick={handleChangeSize}>
            {puzzle.width}×{puzzle.height} — Change size
          </button>
        )}
      </header>

      {saveError && (
        <div style={s.saveError}>{saveError}</div>
      )}

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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1.2rem",
    fontWeight: "bold",
  },
  changeSizeBtn: {
    background: "transparent",
    color: "rgba(255,255,255,0.7)",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontFamily: "system-ui, sans-serif",
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

const sp: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "2rem",
    boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
    width: "100%",
    maxWidth: "460px",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  heading: {
    margin: 0,
    fontSize: "1.4rem",
    fontWeight: "800",
    color: "#1e293b",
    fontFamily: "Georgia, serif",
  },
  subheading: {
    margin: "0.3rem 0 0",
    fontSize: "0.875rem",
    color: "#64748b",
  },
  presets: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  presetBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: "1.5px solid #e2e8f0",
    background: "#fff",
    cursor: "pointer",
    gap: "0.15rem",
    minWidth: "64px",
  },
  presetBtnActive: {
    background: "#1e3a5f",
    borderColor: "#1e3a5f",
  },
  presetDim: {
    fontSize: "0.9rem",
    fontWeight: "700",
  },
  presetLabel: {
    fontSize: "0.65rem",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  customRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.75rem",
  },
  customFieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    fontSize: "0.8rem",
    fontWeight: "600",
    color: "#475569",
  },
  customInput: {
    width: "72px",
    padding: "0.5rem 0.6rem",
    borderRadius: "6px",
    border: "1.5px solid #cbd5e1",
    fontSize: "1rem",
    outline: "none",
    textAlign: "center",
  },
  inputErr: {
    borderColor: "#fca5a5",
  },
  customSep: {
    fontSize: "1.2rem",
    fontWeight: "700",
    color: "#94a3b8",
    paddingBottom: "0.45rem",
  },
  customHint: {
    margin: "0.4rem 0 0",
    fontSize: "0.8rem",
    color: "#dc2626",
  },
  preview: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  previewLabel: {
    fontSize: "0.875rem",
    color: "#64748b",
    fontWeight: "500",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.75rem",
    paddingTop: "0.25rem",
  },
  cancelBtn: {
    background: "transparent",
    color: "#64748b",
    border: "1.5px solid #e2e8f0",
    borderRadius: "6px",
    padding: "0.55rem 1.1rem",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "0.875rem",
  },
  confirmBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "0.55rem 1.25rem",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "0.875rem",
  },
};
