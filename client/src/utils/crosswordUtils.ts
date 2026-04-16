// ─── Cell numbering ───────────────────────────────────────────────────────────

export function computeCellNumbers(
  grid: (string | null)[][],
  height: number,
  width: number
): Map<string, number> {
  const nums = new Map<string, number>();
  let n = 1;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === null) continue;
      const acrossStart =
        (c === 0 || grid[r][c - 1] === null) &&
        c + 1 < width &&
        grid[r][c + 1] !== null;
      const downStart =
        (r === 0 || grid[r - 1][c] === null) &&
        r + 1 < height &&
        grid[r + 1][c] !== null;
      if (acrossStart || downStart) {
        nums.set(`${r},${c}`, n++);
      }
    }
  }
  return nums;
}

// ─── Clue topology ────────────────────────────────────────────────────────────

export interface ClueRef {
  num: number;
  dir: "across" | "down";
  cells: [number, number][];
}

export function computeClueRefs(
  grid: (string | null)[][],
  height: number,
  width: number
): ClueRef[] {
  const cellNumbers = computeCellNumbers(grid, height, width);
  const refs: ClueRef[] = [];

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

    if (isAcrossStart) {
      const cells: [number, number][] = [];
      for (let col = c; col < width && grid[r][col] !== null; col++) {
        cells.push([r, col]);
      }
      refs.push({ num, dir: "across", cells });
    }

    if (isDownStart) {
      const cells: [number, number][] = [];
      for (let row = r; row < height && grid[row][c] !== null; row++) {
        cells.push([row, c]);
      }
      refs.push({ num, dir: "down", cells });
    }
  }

  return refs;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validatePuzzle(
  grid: (string | null)[][],
  height: number,
  width: number,
  clues: { across: Record<string, string>; down: Record<string, string> }
): string[] {
  const errors: string[] = [];
  const refs = computeClueRefs(grid, height, width);

  // Minimum word length
  for (const ref of refs) {
    if (ref.cells.length < 3) {
      errors.push(
        `${ref.dir === "across" ? "Across" : "Down"} ${ref.num}: word is too short (minimum 3 letters)`
      );
    }
  }

  // All clue texts must be filled
  for (const ref of refs) {
    const text =
      ref.dir === "across"
        ? clues.across[ref.num]
        : clues.down[ref.num];
    if (!text || text.trim() === "") {
      errors.push(
        `${ref.dir === "across" ? "Across" : "Down"} ${ref.num}: clue is missing`
      );
    }
  }

  // All white cells must form one connected region
  const whiteCells: [number, number][] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] !== null) whiteCells.push([r, c]);
    }
  }

  if (whiteCells.length > 1) {
    const visited = new Set<string>();
    const queue: [number, number][] = [whiteCells[0]];
    visited.add(`${whiteCells[0][0]},${whiteCells[0][1]}`);
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = r + dr;
        const nc = c + dc;
        const k = `${nr},${nc}`;
        if (
          nr >= 0 && nr < height &&
          nc >= 0 && nc < width &&
          grid[nr][nc] !== null &&
          !visited.has(k)
        ) {
          visited.add(k);
          queue.push([nr, nc]);
        }
      }
    }
    if (visited.size !== whiteCells.length) {
      errors.push("Grid has disconnected white cells");
    }
  }

  return errors;
}
