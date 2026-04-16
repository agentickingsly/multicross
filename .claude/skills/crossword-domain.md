# crossword-domain

## Grid format
Type: (string | null)[][]
- null = black cell (blocked)
- "" = empty white cell (unfilled)
- "A" to "Z" = solution letter (uppercase only)
- Accessed as grid[row][col]

## Standard grid sizes
- 5x5  — mini
- 7x7  — small
- 9x9  — medium (default for seed puzzles)
- 11x11 — large
- 13x13 — standard American
- 15x15 — full standard (editor default)

## Crossword rules
- All words minimum 3 letters
- Grid must be fully connected (no isolated white regions)
- Standard symmetry: 180-degree rotational
  Symmetric cell of [row][col] = [height-1-row][width-1-col]
- Black cells typically 16-20% of grid for standard puzzles
- Every white cell must be part of both an across and a down word
  (except where the word runs to the edge)

## Auto-numbering — CRITICAL
ALWAYS use computeClueNumbers() from client/src/utils/crosswordUtils.ts
NEVER reimplement inline — it must be identical in editor and game

A cell gets a number if it is white AND:
  starts across: (col === 0 OR grid[row][col-1] === null)
                 AND col+1 < width AND grid[row][col+1] !== null
  starts down:   (row === 0 OR grid[row-1][col] === null)
                 AND row+1 < height AND grid[row+1][col] !== null

Numbers assigned in reading order: left-to-right, top-to-bottom.
Returns Map keyed as "row,col".

## Clue format
{
  across: { 1: "Feline pet", 7: "Pink wading bird" },
  down:   { 1: "Loud noise", 2: "Celestial messenger" }
}
Keys are numbers (not strings) in the shared Puzzle type.
In Postgres they are stored as JSONB.

## Puzzle status
draft     — only visible to author via GET /api/puzzles/mine
published — visible to all in GET /api/puzzles (lobby list)
Transition: draft → published via PUT /api/puzzles/:id with status='published'

## Validation rules (validatePuzzle in crosswordUtils.ts)
- All words >= 3 letters
- Grid is connected (BFS/DFS from first white cell reaches all white cells)
- All numbered entries have a non-empty clue string
- All white cells have a solution letter (no "" remaining)
Run before publishing — not required for draft saves.

## Puzzle type (from shared/src/types.ts)
interface Puzzle {
  id: string;
  title: string;
  author: string;        // display name string, not FK
  authorId?: string;     // FK to users.id
  width: number;
  height: number;
  grid: (string | null)[][];
  clues: { across: Record; down: Record };
  status?: 'draft' | 'published';
  createdAt?: string;
  updatedAt?: string;
}

## Game cell format (from shared/src/types.ts)
interface GameCell {
  id: string;
  gameId: string;
  row: number;
  col: number;
  value: string;
  filledBy: string;   // userId — never displayName
  filledAt: string;
}

## Color conventions
Participant colors stored as hex strings (e.g. "#E24B4A")
Cell tint: color + "88" = 53% opacity background
Border: color + "99" = 60% opacity
Full opacity: color (no suffix)
