import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();

const COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63",
];

function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/games
router.post("/", requireAuth, async (req, res) => {
  const parsed = z.object({ puzzleId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { puzzleId } = parsed.data;
  const userId = req.user!.userId;

  const puzzleCheck = await pool.query("SELECT id FROM puzzles WHERE id = $1", [puzzleId]);
  if (!puzzleCheck.rows[0]) {
    res.status(404).json({ error: "Puzzle not found" });
    return;
  }

  // Generate unique room code
  let roomCode = "";
  for (let attempts = 0; attempts < 10; attempts++) {
    const candidate = generateRoomCode();
    const exists = await pool.query("SELECT id FROM games WHERE room_code = $1", [candidate]);
    if (!exists.rows[0]) {
      roomCode = candidate;
      break;
    }
  }
  if (!roomCode) {
    res.status(500).json({ error: "Could not generate unique room code" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameResult = await client.query(
      `INSERT INTO games (puzzle_id, room_code, status, created_by)
       VALUES ($1, $2, 'waiting', $3)
       RETURNING id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at`,
      [puzzleId, roomCode, userId]
    );
    const g = gameResult.rows[0];

    const color = COLORS[0];
    await client.query(
      `INSERT INTO game_participants (game_id, user_id, color) VALUES ($1, $2, $3)`,
      [g.id, userId, color]
    );
    await client.query("COMMIT");

    const game = {
      id: g.id,
      puzzleId: g.puzzle_id,
      roomCode: g.room_code,
      status: g.status,
      createdBy: g.created_by,
      startedAt: g.started_at,
      completedAt: g.completed_at,
      createdAt: g.created_at,
    };
    res.status(201).json({ game, roomCode: g.room_code });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/games/:id/join
router.post("/:id/join", requireAuth, async (req, res) => {
  const gameId = req.params.id;
  const userId = req.user!.userId;

  const gameResult = await pool.query(
    `SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
     FROM games WHERE id = $1`,
    [gameId]
  );
  if (!gameResult.rows[0]) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const g = gameResult.rows[0];
  if (g.status !== "waiting") {
    res.status(400).json({ error: "Game is not in waiting status" });
    return;
  }

  const existingParticipant = await pool.query(
    "SELECT id FROM game_participants WHERE game_id = $1 AND user_id = $2",
    [gameId, userId]
  );
  if (existingParticipant.rows[0]) {
    res.status(409).json({ error: "Already joined this game" });
    return;
  }

  // Pick a color not already used
  const usedColors = await pool.query(
    "SELECT color FROM game_participants WHERE game_id = $1",
    [gameId]
  );
  const usedSet = new Set(usedColors.rows.map((r: any) => r.color));
  const color = COLORS.find((c) => !usedSet.has(c)) ?? COLORS[usedColors.rows.length % COLORS.length];

  const participantResult = await pool.query(
    `INSERT INTO game_participants (game_id, user_id, color)
     VALUES ($1, $2, $3)
     RETURNING id, game_id, user_id, joined_at, color`,
    [gameId, userId, color]
  );
  const p = participantResult.rows[0];
  res.status(201).json({
    participant: {
      id: p.id,
      gameId: p.game_id,
      userId: p.user_id,
      joinedAt: p.joined_at,
      color: p.color,
    },
  });
});

// GET /api/games/:id
router.get("/", requireAuth, async (req, res) => {
  const { roomCode } = req.query;
  if (!roomCode) { res.status(400).json({ error: "roomCode required" }); return; }
  const result = await pool.query(
    `SELECT id FROM games WHERE room_code = $1`, [String(roomCode).toUpperCase()]
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Game not found" }); return; }
  res.json({ game: { id: result.rows[0].id } });
});

router.get("/:id", requireAuth, async (req, res) => {
  const gameId = req.params.id;

  const gameResult = await pool.query(
    `SELECT id, puzzle_id, room_code, status, created_by, started_at, completed_at, created_at
     FROM games WHERE id = $1`,
    [gameId]
  );
  if (!gameResult.rows[0]) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  const g = gameResult.rows[0];

  const participantsResult = await pool.query(
    `SELECT id, game_id, user_id, joined_at, color FROM game_participants WHERE game_id = $1`,
    [gameId]
  );
  const cellsResult = await pool.query(
    `SELECT id, game_id, row, col, value, filled_by, filled_at FROM game_cells WHERE game_id = $1`,
    [gameId]
  );

  res.json({
    game: {
      id: g.id,
      puzzleId: g.puzzle_id,
      roomCode: g.room_code,
      status: g.status,
      createdBy: g.created_by,
      startedAt: g.started_at,
      completedAt: g.completed_at,
      createdAt: g.created_at,
    },
    participants: participantsResult.rows.map((p) => ({
      id: p.id,
      gameId: p.game_id,
      userId: p.user_id,
      joinedAt: p.joined_at,
      color: p.color,
    })),
    cells: cellsResult.rows.map((c) => ({
      id: c.id,
      gameId: c.game_id,
      row: c.row,
      col: c.col,
      value: c.value,
      filledBy: c.filled_by,
      filledAt: c.filled_at,
    })),
  });
});

export default router;
