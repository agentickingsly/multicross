import { useState, useMemo, useRef } from "react";
import {
  computeCellNumbers,
  computeClueRefs,
  validatePuzzle,
  type ClueRef,
} from "../utils/crosswordUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditablePuzzle {
  title: string;
  author: string;
  width: number;
  height: number;
  grid: (string | null)[][];
  clues: { across: Record<string, string>; down: Record<string, string> };
  status: "draft" | "published";
}

interface Props {
  puzzle: EditablePuzzle;
  onChange: (puzzle: EditablePuzzle) => void;
  onSave: (puzzle: EditablePuzzle, status: "draft" | "published") => void;
  onCancel: () => void;
  isSaving: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PuzzleEditor({
  puzzle,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: Props) {
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [errors, setErrors] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const { grid, height, width } = puzzle;

  const cellNumbers = useMemo(
    () => computeCellNumbers(grid, height, width),
    [grid, height, width]
  );

  const clueRefs = useMemo(
    () => computeClueRefs(grid, height, width),
    [grid, height, width]
  );

  // ── Grid mutation helpers ──────────────────────────────────────────────────

  function toggleCell(r: number, c: number) {
    const newGrid = grid.map((gridRow) => [...gridRow]);
    const mirrorR = height - 1 - r;
    const mirrorC = width - 1 - c;
    const goBlack = newGrid[r][c] !== null;
    newGrid[r][c] = goBlack ? null : "";
    if (mirrorR !== r || mirrorC !== c) {
      newGrid[mirrorR][mirrorC] = goBlack ? null : "";
    }
    onChange({ ...puzzle, grid: newGrid });
  }

  // ── Cell click ────────────────────────────────────────────────────────────

  function handleCellClick(r: number, c: number) {
    if (grid[r][c] === null) {
      // Black → white (+ mirror)
      toggleCell(r, c);
      setSelected(null);
      return;
    }
    if (selected?.row === r && selected?.col === c) {
      // Re-click selected white cell → make black (+ mirror)
      toggleCell(r, c);
      setSelected(null);
    } else {
      // Unselected white cell → select it
      setSelected({ row: r, col: c });
      hiddenInputRef.current?.focus();
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function nextWhite(r: number, c: number, dir: "across" | "down") {
    if (dir === "across") {
      for (let col = c + 1; col < width; col++) {
        if (grid[r][col] !== null) return { row: r, col };
      }
    } else {
      for (let row = r + 1; row < height; row++) {
        if (grid[row][c] !== null) return { row, col: c };
      }
    }
    return null;
  }

  function prevWhite(r: number, c: number, dir: "across" | "down") {
    if (dir === "across") {
      for (let col = c - 1; col >= 0; col--) {
        if (grid[r][col] !== null) return { row: r, col };
      }
    } else {
      for (let row = r - 1; row >= 0; row--) {
        if (grid[row][c] !== null) return { row, col: c };
      }
    }
    return null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const selR = selected.row;
    const selC = selected.col;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setDirection("across");
      const next = nextWhite(selR, selC, "across");
      if (next) setSelected(next);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setDirection("across");
      const prev = prevWhite(selR, selC, "across");
      if (prev) setSelected(prev);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDirection("down");
      const next = nextWhite(selR, selC, "down");
      if (next) setSelected(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setDirection("down");
      const prev = prevWhite(selR, selC, "down");
      if (prev) setSelected(prev);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setDirection((d) => (d === "across" ? "down" : "across"));
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      toggleCell(selR, selC);
      setSelected(null);
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      const newGrid = grid.map((gridRow) => [...gridRow]);
      if (newGrid[selR][selC] === "") {
        const prev = prevWhite(selR, selC, direction);
        if (prev) {
          newGrid[prev.row][prev.col] = "";
          setSelected(prev);
        }
      } else {
        newGrid[selR][selC] = "";
      }
      onChange({ ...puzzle, grid: newGrid });
      return;
    }
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      const newGrid = grid.map((gridRow) => [...gridRow]);
      newGrid[selR][selC] = e.key.toUpperCase();
      onChange({ ...puzzle, grid: newGrid });
      const next = nextWhite(selR, selC, direction);
      if (next) setSelected(next);
    }
  }

  // ── Hidden input (mobile keyboard) ───────────────────────────────────────
  // Keydown events from the hidden input bubble to containerRef's onKeyDown handler,
  // covering arrows/backspace/tab on desktop. This onInput handler catches Android
  // letter input (key "Unidentified") and Android backspace (deleteContentBackward).
  function handleHiddenInput(e: React.FormEvent<HTMLInputElement>) {
    const nativeEvent = e.nativeEvent as InputEvent;
    (e.target as HTMLInputElement).value = "";

    if (nativeEvent.inputType === "deleteContentBackward") {
      if (!selected) return;
      const { row: selR, col: selC } = selected;
      const newGrid = grid.map((gridRow) => [...gridRow]);
      if (newGrid[selR][selC] === "") {
        const prev = prevWhite(selR, selC, direction);
        if (prev) {
          newGrid[prev.row][prev.col] = "";
          setSelected(prev);
        }
      } else {
        newGrid[selR][selC] = "";
      }
      onChange({ ...puzzle, grid: newGrid });
      return;
    }

    const char = nativeEvent.data;
    if (!selected || !char || !/[a-zA-Z]/.test(char)) return;
    const { row: selR, col: selC } = selected;
    const newGrid = grid.map((gridRow) => [...gridRow]);
    newGrid[selR][selC] = char.toUpperCase();
    onChange({ ...puzzle, grid: newGrid });
    const next = nextWhite(selR, selC, direction);
    if (next) setSelected(next);
  }

  // ── Clue editing ──────────────────────────────────────────────────────────

  function handleClueChange(num: number, dir: "across" | "down", value: string) {
    const newClues = {
      across: { ...puzzle.clues.across },
      down: { ...puzzle.clues.down },
    };
    if (dir === "across") newClues.across[num] = value;
    else newClues.down[num] = value;
    onChange({ ...puzzle, clues: newClues });
  }

  // ── Save / publish ────────────────────────────────────────────────────────

  function handleSaveDraft() {
    setErrors([]);
    onSave(puzzle, "draft");
  }

  function handlePublish() {
    const errs = validatePuzzle(grid, height, width, puzzle.clues);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    onSave(puzzle, "published");
  }

  // ── Active clue highlight ─────────────────────────────────────────────────

  const activeClueKey = useMemo((): string | null => {
    if (!selected) return null;
    const { row, col } = selected;
    if (direction === "across") {
      let c = col;
      while (c > 0 && grid[row][c - 1] !== null) c--;
      const num = cellNumbers.get(`${row},${c}`);
      return num !== undefined ? `across-${num}` : null;
    } else {
      let r = row;
      while (r > 0 && grid[r - 1][col] !== null) r--;
      const num = cellNumbers.get(`${r},${col}`);
      return num !== undefined ? `down-${num}` : null;
    }
  }, [selected, direction, grid, cellNumbers]);

  // ── Layout ────────────────────────────────────────────────────────────────

  const CELL_SIZE = Math.min(48, Math.floor(420 / Math.max(width, height)));
  const acrossRefs = clueRefs
    .filter((r) => r.dir === "across")
    .sort((a, b) => a.num - b.num);
  const downRefs = clueRefs
    .filter((r) => r.dir === "down")
    .sort((a, b) => a.num - b.num);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          type="text"
          value={puzzle.title}
          onChange={(e) => onChange({ ...puzzle, title: e.target.value })}
          placeholder="Puzzle title"
          style={{
            flex: 1,
            minWidth: "200px",
            fontSize: "1.2rem",
            fontWeight: "600",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            padding: "0.35rem 0.75rem",
            fontFamily: "system-ui, sans-serif",
          }}
        />
        <button onClick={onCancel} disabled={isSaving} style={btn("ghost")}>
          Cancel
        </button>
        <button onClick={handleSaveDraft} disabled={isSaving} style={btn("neutral")}>
          {isSaving ? "Saving…" : "Save draft"}
        </button>
        <button onClick={handlePublish} disabled={isSaving} style={btn("primary")}>
          Publish
        </button>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", padding: "0.65rem 1rem", marginBottom: "1rem" }}>
          <div style={{ fontWeight: "700", color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
            Cannot publish:
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#b91c1c", fontSize: "0.825rem", lineHeight: 1.6 }}>
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* Editor body */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Grid */}
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={{ outline: "none", flexShrink: 0, position: "relative" }}
        >
          <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginBottom: "0.4rem" }}>
            Click white = select · click selected = black · click black = white · Space = toggle · type letters
          </div>
          <div
            style={{
              display: "inline-grid",
              gridTemplateColumns: `repeat(${width}, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${height}, ${CELL_SIZE}px)`,
              gap: "2px",
              border: "2px solid #1a1a1a",
              borderRadius: "4px",
              background: "#1a1a1a",
              padding: "2px",
            }}
          >
            {Array.from({ length: height }, (_, r) =>
              Array.from({ length: width }, (_, c) => {
                const isBlack = grid[r][c] === null;
                const key = `${r},${c}`;
                const num = cellNumbers.get(key);
                const letter = isBlack ? "" : (grid[r][c] as string);
                const isSelected = selected?.row === r && selected?.col === c;

                return (
                  <div
                    key={key}
                    onClick={() => handleCellClick(r, c)}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      background: isBlack
                        ? "#1a1a1a"
                        : isSelected
                        ? "#bfdbfe"
                        : "#fff",
                      position: "relative",
                      cursor: "pointer",
                      userSelect: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxSizing: "border-box",
                      border: isSelected ? "2px solid #2563eb" : "none",
                      borderRadius: "2px",
                    }}
                  >
                    {!isBlack && num !== undefined && (
                      <span
                        style={{
                          position: "absolute",
                          top: 1,
                          left: 2,
                          fontSize: Math.max(8, CELL_SIZE * 0.22),
                          lineHeight: 1,
                          color: "#374151",
                          fontWeight: "600",
                          pointerEvents: "none",
                        }}
                      >
                        {num}
                      </span>
                    )}
                    {!isBlack && letter && (
                      <span
                        style={{
                          fontSize: CELL_SIZE * 0.48,
                          fontWeight: "700",
                          color: "#111827",
                          fontFamily: "Georgia, serif",
                          lineHeight: 1,
                        }}
                      >
                        {letter}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Hidden input — triggers the native keyboard on mobile. Must not use
              display:none (prevents focus). Keydown bubbles to containerRef's handler;
              onInput catches Android letter/backspace input. */}
          <input
            ref={hiddenInputRef}
            type="text"
            inputMode="text"
            aria-hidden="true"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            onInput={handleHiddenInput}
            style={{
              position: "absolute",
              left: "-9999px",
              top: 0,
              width: "1px",
              height: "1px",
              opacity: 0,
              fontSize: "16px",
              border: "none",
              padding: 0,
            }}
          />
        </div>

        {/* Clue inputs */}
        <div
          style={{
            flex: 1,
            minWidth: "260px",
            maxHeight: `${height * (CELL_SIZE + 2) + 44}px`,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <ClueInputList
            title="Across"
            refs={acrossRefs}
            dir="across"
            clues={puzzle.clues.across}
            activeKey={activeClueKey}
            onChange={(num, val) => handleClueChange(num, "across", val)}
          />
          <ClueInputList
            title="Down"
            refs={downRefs}
            dir="down"
            clues={puzzle.clues.down}
            activeKey={activeClueKey}
            onChange={(num, val) => handleClueChange(num, "down", val)}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Clue input list ──────────────────────────────────────────────────────────

function ClueInputList({
  title,
  refs,
  dir,
  clues,
  activeKey,
  onChange,
}: {
  title: string;
  refs: ClueRef[];
  dir: "across" | "down";
  clues: Record<string, string>;
  activeKey: string | null;
  onChange: (num: number, val: string) => void;
}) {
  if (refs.length === 0) return null;
  return (
    <div>
      <div
        style={{
          fontWeight: "700",
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          marginBottom: "0.5rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {refs.map((ref) => {
          const key = `${dir}-${ref.num}`;
          const isActive = activeKey === key;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: isActive ? "#eff6ff" : "transparent",
                borderRadius: "4px",
                padding: "2px 4px",
              }}
            >
              <span
                style={{
                  fontWeight: "700",
                  fontSize: "0.78rem",
                  color: "#6b7280",
                  minWidth: "1.8rem",
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {ref.num}.
              </span>
              <input
                type="text"
                value={clues[ref.num] ?? ""}
                onChange={(e) => onChange(ref.num, e.target.value)}
                placeholder="Enter clue…"
                style={{
                  flex: 1,
                  border: "1px solid",
                  borderColor: isActive ? "#93c5fd" : "#e5e7eb",
                  borderRadius: "4px",
                  padding: "0.2rem 0.4rem",
                  fontSize: "0.8rem",
                  fontFamily: "system-ui, sans-serif",
                  outline: "none",
                  background: "transparent",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────

function btn(variant: "primary" | "neutral" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "0.38rem 1rem",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: "600",
    cursor: "pointer",
    border: "1px solid transparent",
    fontFamily: "system-ui, sans-serif",
    whiteSpace: "nowrap",
  };
  if (variant === "primary")
    return { ...base, background: "#2563eb", color: "#fff", borderColor: "#2563eb" };
  if (variant === "ghost")
    return { ...base, background: "transparent", color: "#6b7280", borderColor: "#d1d5db" };
  return { ...base, background: "#f3f4f6", color: "#374151", borderColor: "#d1d5db" };
}
