import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
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
  showColors?: boolean;
  lockCorrect?: boolean;
  lockWord?: boolean;
  skipFilled?: boolean;
  readOnly?: boolean;
  onCellFill?: (row: number, col: number, value: string) => void;
  onCursorMove?: (row: number, col: number) => void;
  wordCompletedCells?: Set<string>; // "row,col" keys of cells currently animating
  puzzleCompleting?: boolean;       // true while the celebration animation plays
  animationStyle?: "subtle" | "celebratory"; // controls animation intensity; default "subtle"
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

const ANIM_CSS = `
@keyframes mc-word-flash {
  0%   { box-shadow: inset 0 0 0 3px #4ade80cc; }
  70%  { box-shadow: inset 0 0 0 2px #4ade8044; }
  100% { box-shadow: inset 0 0 0 0 #4ade8000; }
}
@keyframes mc-puzzle-flash-subtle {
  0%   { box-shadow: inset 0 0 0 0 #fbbf2400; }
  25%  { box-shadow: inset 0 0 0 4px #fbbf24dd; }
  65%  { box-shadow: inset 0 0 0 3px #fbbf2488; }
  100% { box-shadow: inset 0 0 0 0 #fbbf2400; }
}
@keyframes mc-puzzle-flash-celebratory {
  0%   { box-shadow: inset 0 0 0 0 #fbbf2400; }
  15%  { box-shadow: inset 0 0 0 6px #fbbf24ee; }
  35%  { box-shadow: inset 0 0 0 6px #4ade80ee; }
  55%  { box-shadow: inset 0 0 0 6px #60a5faee; }
  75%  { box-shadow: inset 0 0 0 4px #fbbf24aa; }
  100% { box-shadow: inset 0 0 0 0 #fbbf2400; }
}
.mc-word-flash { animation: mc-word-flash 0.75s ease-out forwards; }
.mc-puzzle-flash-subtle { animation: mc-puzzle-flash-subtle 1.6s ease-out forwards; }
.mc-puzzle-flash-celebratory { animation: mc-puzzle-flash-celebratory 2s ease-out forwards; }
`;

export default function CrosswordGrid({
  puzzle,
  cells,
  participants,
  currentUserId,
  cursors = {},
  showContributions = false,
  showColors = true,
  lockCorrect = false,
  lockWord = false,
  skipFilled = false,
  readOnly = false,
  onCellFill,
  onCursorMove,
  wordCompletedCells,
  puzzleCompleting = false,
  animationStyle = "subtle",
}: Props) {
  const { grid, height, width } = puzzle;

  const [selected, setSelected] = useState<CursorPos | null>(null);
  const [direction, setDirection] = useState<Direction>("across");
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Inject animation keyframes once into document head
  useEffect(() => {
    if (document.getElementById("mc-cell-animations")) return;
    const el = document.createElement("style");
    el.id = "mc-cell-animations";
    el.textContent = ANIM_CSS;
    document.head.appendChild(el);
  }, []);

  // Keep focus on container so keyboard events fire
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Dynamic cell sizing — measure container before first paint, then watch for resize
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
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

  const activeWordCells = useMemo((): Set<string> => {
    if (!selected) return new Set();
    const { row, col } = selected;
    const result = new Set<string>();
    if (direction === "across") {
      let startCol = col;
      while (startCol > 0 && grid[row][startCol - 1] !== null) startCol--;
      for (let c = startCol; c < width && grid[row][c] !== null; c++) {
        result.add(`${row},${c}`);
      }
    } else {
      let startRow = row;
      while (startRow > 0 && grid[startRow - 1][col] !== null) startRow--;
      for (let r = startRow; r < height && grid[r][col] !== null; r++) {
        result.add(`${r},${col}`);
      }
    }
    return result;
  }, [selected, direction, grid, width, height]);

  const lockedWordCells = useMemo((): Set<string> => {
    if (!lockWord) return new Set();
    const locked = new Set<string>();
    for (const word of [...acrossClues, ...downClues]) {
      if (word.cells.every(([r, c]) => {
        const v = cellValueMap.get(`${r},${c}`);
        return v !== undefined && v.toUpperCase() === grid[r][c]?.toUpperCase();
      })) {
        for (const [r, c] of word.cells) locked.add(`${r},${c}`);
      }
    }
    return locked;
  }, [lockWord, acrossClues, downClues, cellValueMap, grid]);

  function isCellLocked(row: number, col: number): boolean {
    if (lockCorrect) {
      const value = cellValueMap.get(`${row},${col}`);
      if (value && value.toUpperCase() === grid[row][col]?.toUpperCase()) return true;
    }
    if (lockWord && lockedWordCells.has(`${row},${col}`)) return true;
    return false;
  }

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

  // After typing: advance to next empty cell within the current word only
  function nextEmptyInWord(row: number, col: number, dir: Direction): CursorPos | null {
    if (dir === "across") {
      for (let c = col + 1; c < width && grid[row][c] !== null; c++) {
        if (!cellValueMap.has(`${row},${c}`)) return { row, col: c };
      }
    } else {
      for (let r = row + 1; r < height && grid[r][col] !== null; r++) {
        if (!cellValueMap.has(`${r},${col}`)) return { row: r, col };
      }
    }
    return null;
  }

  // Arrow navigation: skip filled cells across the whole row/column
  function nextEmptyCellDir(row: number, col: number, dir: Direction): CursorPos | null {
    if (dir === "across") {
      for (let c = col + 1; c < width; c++) {
        if (grid[row][c] !== null && !cellValueMap.has(`${row},${c}`)) return { row, col: c };
      }
    } else {
      for (let r = row + 1; r < height; r++) {
        if (grid[r][col] !== null && !cellValueMap.has(`${r},${col}`)) return { row: r, col };
      }
    }
    return null;
  }

  function prevEmptyCellDir(row: number, col: number, dir: Direction): CursorPos | null {
    if (dir === "across") {
      for (let c = col - 1; c >= 0; c--) {
        if (grid[row][c] !== null && !cellValueMap.has(`${row},${c}`)) return { row, col: c };
      }
    } else {
      for (let r = row - 1; r >= 0; r--) {
        if (grid[r][col] !== null && !cellValueMap.has(`${r},${col}`)) return { row: r, col };
      }
    }
    return null;
  }

  // When the last empty cell in a word is filled, advance to the first empty cell
  // of the next incomplete clue. pendingKey is the cell just typed (not yet in
  // cellValueMap because the optimistic update hasn't re-rendered yet).
  function advanceToNextWord(
    filledRow: number,
    filledCol: number,
    dir: Direction
  ): { pos: CursorPos; dir: Direction } | null {
    const pendingKey = `${filledRow},${filledCol}`;
    const primaryClues = dir === "across" ? acrossClues : downClues;
    const altClues = dir === "across" ? downClues : acrossClues;
    const altDir: Direction = dir === "across" ? "down" : "across";

    // Locate the word that contains the just-filled cell
    const currentIdx = primaryClues.findIndex((word) =>
      word.cells.some(([r, c]) => r === filledRow && c === filledCol)
    );
    if (currentIdx === -1) return null;

    // Check if filling this cell completes the whole word
    const currentWord = primaryClues[currentIdx];
    const isWordComplete = currentWord.cells.every(([r, c]) => {
      const k = `${r},${c}`;
      return k === pendingKey || cellValueMap.has(k);
    });
    if (!isWordComplete) return null;

    // Find next incomplete word in primary direction (after current, then wrap)
    const searchPrimary = [
      ...primaryClues.slice(currentIdx + 1),
      ...primaryClues.slice(0, currentIdx),
    ];
    for (const word of searchPrimary) {
      const firstEmpty = word.cells.find(([r, c]) => !cellValueMap.has(`${r},${c}`));
      if (firstEmpty) return { pos: { row: firstEmpty[0], col: firstEmpty[1] }, dir };
    }

    // All primary clues done — try alternate direction
    for (const word of altClues) {
      const firstEmpty = word.cells.find(([r, c]) => !cellValueMap.has(`${r},${c}`));
      if (firstEmpty) return { pos: { row: firstEmpty[0], col: firstEmpty[1] }, dir: altDir };
    }

    return null; // puzzle complete — game_complete event will fire
  }

  // ── Clue selection ──────────────────────────────────────────────────────────

  function selectClue(clueCells: [number, number][], dir: Direction) {
    if (readOnly) return;
    if (clueCells.length > 0) {
      setSelected({ row: clueCells[0][0], col: clueCells[0][1] });
      setDirection(dir);
      onCursorMove?.(clueCells[0][0], clueCells[0][1]);
    }
    hiddenInputRef.current?.focus();
  }

  // ── Cell click ──────────────────────────────────────────────────────────────

  function handleCellClick(row: number, col: number) {
    if (readOnly) return;
    if (grid[row][col] === null) return;
    if (selected?.row === row && selected?.col === col) {
      // Toggle direction on re-click
      setDirection((d) => (d === "across" ? "down" : "across"));
    } else {
      setSelected({ row, col });
      onCursorMove?.(row, col);
    }
    hiddenInputRef.current?.focus();
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (readOnly || !selected) return;
    const { row, col } = selected;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setDirection("across");
      const next = skipFilled
        ? (nextEmptyCellDir(row, col, "across") ?? nextWhiteCell(row, col, "across"))
        : nextWhiteCell(row, col, "across");
      if (next) { setSelected(next); onCursorMove?.(next.row, next.col); }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setDirection("across");
      const prev = skipFilled
        ? (prevEmptyCellDir(row, col, "across") ?? prevWhiteCell(row, col, "across"))
        : prevWhiteCell(row, col, "across");
      if (prev) { setSelected(prev); onCursorMove?.(prev.row, prev.col); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDirection("down");
      const next = skipFilled
        ? (nextEmptyCellDir(row, col, "down") ?? nextWhiteCell(row, col, "down"))
        : nextWhiteCell(row, col, "down");
      if (next) { setSelected(next); onCursorMove?.(next.row, next.col); }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setDirection("down");
      const prev = skipFilled
        ? (prevEmptyCellDir(row, col, "down") ?? prevWhiteCell(row, col, "down"))
        : prevWhiteCell(row, col, "down");
      if (prev) { setSelected(prev); onCursorMove?.(prev.row, prev.col); }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setDirection((d) => (d === "across" ? "down" : "across"));
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      if (isCellLocked(row, col)) return;
      const existing = cellValueMap.get(`${row},${col}`);
      if (existing) {
        onCellFill?.(row, col, "");
      } else {
        const prev = prevWhiteCell(row, col, direction);
        if (prev) {
          if (isCellLocked(prev.row, prev.col)) return;
          setSelected(prev);
          onCellFill?.(prev.row, prev.col, "");
          onCursorMove?.(prev.row, prev.col);
        }
      }
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      if (isCellLocked(row, col)) return;
      const letter = e.key.toUpperCase();
      onCellFill?.(row, col, letter);
      const wordAdvance = advanceToNextWord(row, col, direction);
      if (wordAdvance) {
        setDirection(wordAdvance.dir);
        setSelected(wordAdvance.pos);
        onCursorMove?.(wordAdvance.pos.row, wordAdvance.pos.col);
      } else {
        const next = skipFilled
          ? nextEmptyInWord(row, col, direction)
          : nextWhiteCell(row, col, direction);
        if (next) {
          setSelected(next);
          onCursorMove?.(next.row, next.col);
        }
      }
    }
  }

  // ── Hidden input (mobile keyboard) ─────────────────────────────────────────
  // Android Chrome fires keydown with key="Unidentified" for letter keys.
  // handleKeyDown (bubbled from the input) handles arrows/backspace/tab fine.
  // This handler catches the subsequent `input` event to get the actual letter.
  // On desktop, handleKeyDown calls e.preventDefault() which suppresses the
  // `input` event entirely, so there is no double-handling.
  function handleHiddenInput(e: React.FormEvent<HTMLInputElement>) {
    if (readOnly) return;
    const nativeEvent = e.nativeEvent as InputEvent;
    // Always clear to prevent text accumulation in the hidden input.
    (e.target as HTMLInputElement).value = "";

    // Android backspace arrives as deleteContentBackward (keydown key is "Unidentified")
    if (nativeEvent.inputType === "deleteContentBackward") {
      if (!selected) return;
      const { row, col } = selected;
      if (isCellLocked(row, col)) return;
      const existing = cellValueMap.get(`${row},${col}`);
      if (existing) {
        onCellFill?.(row, col, "");
      } else {
        const prev = prevWhiteCell(row, col, direction);
        if (prev) {
          if (isCellLocked(prev.row, prev.col)) return;
          setSelected(prev);
          onCellFill?.(prev.row, prev.col, "");
          onCursorMove?.(prev.row, prev.col);
        }
      }
      return;
    }

    const char = nativeEvent.data;
    if (!selected || !char || !/[a-zA-Z]/.test(char)) return;
    const { row, col } = selected;
    if (isCellLocked(row, col)) return;
    onCellFill?.(row, col, char.toUpperCase());
    const wordAdvance = advanceToNextWord(row, col, direction);
    if (wordAdvance) {
      setDirection(wordAdvance.dir);
      setSelected(wordAdvance.pos);
      onCursorMove?.(wordAdvance.pos.row, wordAdvance.pos.col);
    } else {
      const next = skipFilled
        ? nextEmptyInWord(row, col, direction)
        : nextWhiteCell(row, col, direction);
      if (next) {
        setSelected(next);
        onCursorMove?.(next.row, next.col);
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
    const isInActiveWord = activeWordCells.has(key);
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
    if (isCorrect && showColors) return "#bbf7d0"; // green-200
    if (isInActiveWord) return "#dbeafe"; // blue-100 word highlight
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

  // Fit grid within the available container width; fall back to 440-based calc before first measure
  const CELL_SIZE = containerWidth > 0
    ? Math.min(52, Math.max(20, Math.floor((containerWidth - 2 * width - 6) / width)))
    : Math.min(52, Math.max(20, Math.floor(440 / Math.max(width, height))));

  const containerStyle: React.CSSProperties = {
    position: "relative",
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
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : handleKeyDown}
      onFocus={readOnly ? undefined : () => {
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

            // Determine animation class — puzzle takes priority over word
            const animClass = !isBlack && puzzleCompleting
              ? `mc-puzzle-flash-${animationStyle}`
              : !isBlack && wordCompletedCells?.has(key)
              ? "mc-word-flash"
              : undefined;
            const animDelay = !isBlack && puzzleCompleting
              ? `${(r + c) * 0.04}s`
              : undefined;

            return (
              <div
                key={key}
                className={animClass}
                onPointerDown={(e) => { e.preventDefault(); handleCellClick(r, c); }}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  background: bg,
                  position: "relative",
                  cursor: isBlack || readOnly ? "default" : "pointer",
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
                  animationDelay: animDelay,
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

      {/* Hidden input — triggers the native keyboard on mobile (Android/iOS).
          Must NOT use display:none or visibility:hidden (prevents focus on mobile).
          fontSize:16px prevents automatic zoom on iOS/Android when focused.
          keydown events bubble up to the container's onKeyDown handler, so
          arrows/backspace/tab work without any extra wiring. The onInput handler
          catches Android's letter input which arrives as an input event rather
          than a keydown with a real key. */}
      {!readOnly && (
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
      )}
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
