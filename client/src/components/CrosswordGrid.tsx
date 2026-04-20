import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Puzzle, GameCell, GameParticipant } from "@multicross/shared";
import { computeCellNumbers } from "../utils/crosswordUtils";

interface CursorPos {
  row: number;
  col: number;
}

interface Props {
  puzzle: Puzzle;
  cells: GameCell[];
  participants: GameParticipant[];
  currentUserId: string;
  cursors?: Record<string, CursorPos>; // userId → position
  showContributions?: boolean;
  onCellFill: (row: number, col: number, value: string) => void;
  onCursorMove: (row: number, col: number) => void;
}

type Direction = "across" | "down";

interface ClueEntry {
  num: number;
  clue: string;
  cells: [number, number][];
}

// ─── Clue builder ─────────────────────────────────────────────────────────────

function buildClues(
  puzzle: Puzzle,
  cellNumbers: Map<string, number>
): { across: ClueEntry[]; down: ClueEntry[] } {
  const across: ClueEntry[] = [];
  const down: ClueEntry[] = [];
  const { grid, height, width, clues } = puzzle;

  for (const [key, num] of cellNumbers) {
    const [r, c] = key.split(",").map(Number);

    const isAcrossStart =
      (c === 0 || grid[r][c - 1] === null) &&
      c + 1 < width &&
      grid[r][c + 1] !== null;

    const isDownStart =
      (r === 0 || grid[r - 1][c] === null) &&
      r + 1 < height &&
      grid[r + 1][c] !== null;

    if (isAcrossStart && clues.across[num] !== undefined) {
      const acrossCells: [number, number][] = [];
      for (let col = c; col < width && grid[r][col] !== null; col++) {
        acrossCells.push([r, col]);
      }
      across.push({ num, clue: clues.across[num], cells: acrossCells });
    }

    if (isDownStart && clues.down[num] !== undefined) {
      const downCells: [number, number][] = [];
      for (let row = r; row < height && grid[row][c] !== null; row++) {
        downCells.push([row, c]);
      }
      down.push({ num, clue: clues.down[num], cells: downCells });
    }
  }

  across.sort((a, b) => a.num - b.num);
  down.sort((a, b) => a.num - b.num);
  return { across, down };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CrosswordGrid({
  puzzle,
  cells,
  participants,
  currentUserId,
  cursors = {},
  showContributions = false,
  onCellFill,
  onCursorMove,
}: Props) {
  const { grid, height, width } = puzzle;

  const [selected, setSelected] = useState<CursorPos | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep focus on container so keyboard events fire
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const cellNumbers = useMemo(
    () => computeCellNumbers(grid, height, width),
    [grid, height, width]
  );

  const { across: acrossClues, down: downClues } = useMemo(
    () => buildClues(puzzle, cellNumbers),
    [puzzle, cellNumbers]
  );

  // Map filled cells for fast lookup
  const cellValueMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of cells) {
      if (cell.value) map.set(`${cell.row},${cell.col}`, cell.value);
    }
    return map;
  }, [cells]);

  const filledByMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of cells) {
      if (cell.filledBy) map.set(`${cell.row},${cell.col}`, cell.filledBy);
    }
    return map;
  }, [cells]);

  const participantColorMap = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach(p => map.set(p.userId, p.color));
    return map;
  }, [participants]);

  // ── Navigation helpers ──────────────────────────────────────────────────────

  const firstWhiteCell = useCallback((): CursorPos => {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (grid[r][c] !== null) return { row: r, col: c };
      }
    }
    return { row: 0, col: 0 };
  }, [grid, height, width]);

  function nextWhiteCell(
    row: number,
    col: number,
    dir: Direction
  ): CursorPos | null {
    if (dir === "across") {
      for (let c = col + 1; c < width; c++) {
        if (grid[row][c] !== null) return { row, col: c };
      }
    } else {
      for (let r = row + 1; r < height; r++) {
        if (grid[r][col] !== null) return { row: r, col };
      }
    }
    return null;
  }

  function prevWhiteCell(
    row: number,
    col: number,
    dir: Direction
  ): CursorPos | null {
    if (dir === "across") {
      for (let c = col - 1; c >= 0; c--) {
        if (grid[row][c] !== null) return { row, col: c };
      }
    } else {
      for (let r = row - 1; r >= 0; r--) {
        if (grid[r][col] !== null) return { row: r, col };
      }
    }
    return null;
  }

  // ── Clue selection ──────────────────────────────────────────────────────────

  function selectClue(clueCells: [number, number][], dir: Direction) {
    setHighlightedCells(new Set(clueCells.map(([r, c]) => `${r},${c}`)));
    if (clueCells.length > 0) {
      setSelected({ row: clueCells[0][0], col: clueCells[0][1] });
      setDirection(dir);
      onCursorMove(clueCells[0][0], clueCells[0][1]);
    }
    containerRef.current?.focus();
  }

  // ── Cell click ──────────────────────────────────────────────────────────────

  function handleCellClick(row: number, col: number) {
    if (grid[row][col] === null) return;
    if (selected?.row === row && selected?.col === col) {
      // Toggle direction on re-click
      setDirection((d) => (d === "across" ? "down" : "across"));
    } else {
      setSelected({ row, col });
      onCursorMove(row, col);
    }
    setHighlightedCells(new Set());
    containerRef.current?.focus();
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const { row, col } = selected;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setDirection("across");
      const next = nextWhiteCell(row, col, "across");
      if (next) { setSelected(next); onCursorMove(next.row, next.col); }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setDirection("across");
      const prev = prevWhiteCell(row, col, "across");
      if (prev) { setSelected(prev); onCursorMove(prev.row, prev.col); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDirection("down");
      const next = nextWhiteCell(row, col, "down");
      if (next) { setSelected(next); onCursorMove(next.row, next.col); }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setDirection("down");
      const prev = prevWhiteCell(row, col, "down");
      if (prev) { setSelected(prev); onCursorMove(prev.row, prev.col); }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setDirection((d) => (d === "across" ? "down" : "across"));
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      const existing = cellValueMap.get(`${row},${col}`);
      if (existing) {
        onCellFill(row, col, "");
      } else {
        const prev = prevWhiteCell(row, col, direction);
        if (prev) {
          setSelected(prev);
          onCellFill(prev.row, prev.col, "");
          onCursorMove(prev.row, prev.col);
        }
      }
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      const letter = e.key.toUpperCase();
      onCellFill(row, col, letter);
      const next = nextWhiteCell(row, col, direction);
      if (next) {
        setSelected(next);
        onCursorMove(next.row, next.col);
      }
    }
  }

  // ── Participant cursor lookup ────────────────────────────────────────────────

  function getParticipantAtCell(
    row: number,
    col: number
  ): GameParticipant | undefined {
    return participants.find((p) => {
      if (p.userId === currentUserId) return false;
      const pos = cursors[p.userId];
      return pos && pos.row === row && pos.col === col;
    });
  }

  const myColor = participants.find(p => p.userId === currentUserId)?.color ?? "#1d4ed8";

  // ── Cell background logic ───────────────────────────────────────────────────

  function cellBackground(row: number, col: number): string {
    if (grid[row][col] === null) return "#1a1a1a";
    const key = `${row},${col}`;
    const isSelected = selected?.row === row && selected?.col === col;
    const isHighlighted = highlightedCells.has(key);
    const value = cellValueMap.get(key);
    const isCorrect = value && value.toUpperCase() === grid[row][col]?.toUpperCase();

    if (isSelected) return myColor + "88";
    if (showContributions && value) {
      const filler = filledByMap.get(key);
      if (filler) {
        const color = participantColorMap.get(filler);
        if (color) return color + "88";
      }
    }
    if (isCorrect) return "#bbf7d0"; // green-200
    if (isHighlighted) return "#dbeafe"; // blue-100
    return "#fff";
  }

  // ── Which clue are we in? (for highlighting active clue) ────────────────────

  const activeClueKey = useMemo((): string | null => {
    if (!selected) return null;
    const { row, col } = selected;
    // Walk back to find clue start in current direction
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

  // ── Styles ──────────────────────────────────────────────────────────────────

  const CELL_SIZE = Math.min(52, Math.floor(440 / Math.max(width, height)));

  const containerStyle: React.CSSProperties = {
    display: "flex",
    gap: "2rem",
    alignItems: "flex-start",
    outline: "none",
    flexWrap: "wrap",
  };

  const gridStyle: React.CSSProperties = {
    display: "inline-grid",
    gridTemplateColumns: `repeat(${width}, ${CELL_SIZE}px)`,
    gridTemplateRows: `repeat(${height}, ${CELL_SIZE}px)`,
    gap: "2px",
    border: "2px solid #1a1a1a",
    borderRadius: "4px",
    background: "#1a1a1a",
    padding: "2px",
    flexShrink: 0,
  };

  const clueColumnStyle: React.CSSProperties = {
    flex: 1,
    minWidth: "220px",
    maxHeight: `${height * (CELL_SIZE + 2) + 20}px`,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (!selected) setSelected(firstWhiteCell());
      }}
    >
      {/* Grid */}
      <div style={gridStyle}>
        {Array.from({ length: height }, (_, r) =>
          Array.from({ length: width }, (_, c) => {
            const isBlack = grid[r][c] === null;
            const key = `${r},${c}`;
            const num = cellNumbers.get(key);
            const value = cellValueMap.get(key) ?? "";
            const participantHere = !isBlack ? getParticipantAtCell(r, c) : undefined;
            const bg = cellBackground(r, c);
            const isCurrentUserHere =
              selected?.row === r && selected?.col === c;

            return (
              <div
                key={key}
                onClick={() => handleCellClick(r, c)}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  background: bg,
                  position: "relative",
                  cursor: isBlack ? "default" : "pointer",
                  userSelect: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  border: participantHere
                    ? `3px solid ${participantHere.color}`
                    : isCurrentUserHere
                    ? `3px solid ${myColor}99`
                    : "none",
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
                      color: showContributions && filledByMap.get(key) && participantColorMap.has(filledByMap.get(key)!) ? "#ffffff" : "#374151",
                      fontFamily: "system-ui, sans-serif",
                      fontWeight: "600",
                      pointerEvents: "none",
                    }}
                  >
                    {num}
                  </span>
                )}
                {!isBlack && value && (
                  <span
                    style={{
                      fontSize: CELL_SIZE * 0.48,
                      fontWeight: "700",
                      color: showContributions && filledByMap.get(key) && participantColorMap.has(filledByMap.get(key)!) ? "#ffffff" : "#111827",
                      fontFamily: "Georgia, serif",
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Clue list */}
      <div style={clueColumnStyle}>
        <ClueList
          title="Across"
          entries={acrossClues}
          prefix="across"
          activeKey={activeClueKey}
          onSelect={(entry) => selectClue(entry.cells, "across")}
        />
        <ClueList
          title="Down"
          entries={downClues}
          prefix="down"
          activeKey={activeClueKey}
          onSelect={(entry) => selectClue(entry.cells, "down")}
        />
      </div>
    </div>
  );
}

// ─── Clue list sub-component ──────────────────────────────────────────────────

function ClueList({
  title,
  entries,
  prefix,
  activeKey,
  onSelect,
}: {
  title: string;
  entries: ClueEntry[];
  prefix: "across" | "down";
  activeKey: string | null;
  onSelect: (entry: ClueEntry) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontWeight: "700",
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          marginBottom: "0.4rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {entries.map((entry) => {
          const key = `${prefix}-${entry.num}`;
          const isActive = activeKey === key;
          return (
            <div
              key={key}
              onClick={() => onSelect(entry)}
              style={{
                padding: "0.3rem 0.5rem",
                borderRadius: "4px",
                background: isActive ? "#dbeafe" : "transparent",
                cursor: "pointer",
                fontSize: "0.85rem",
                color: isActive ? "#1d4ed8" : "#374151",
                fontWeight: isActive ? "600" : "400",
                fontFamily: "system-ui, sans-serif",
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontWeight: "700", marginRight: "0.35rem" }}>
                {entry.num}.
              </span>
              {entry.clue}
            </div>
          );
        })}
      </div>
    </div>
  );
}
