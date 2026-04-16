import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();

const puzzleBodySchema = z.object({
  title: z.string().min(1).max(100),
  author: z.string().min(1).max(100),
  width: z.number().int().min(3).max(21),
  height: z.number().int().min(3).max(21),
  grid: z.array(z.array(z.string().nullable())),
  clues: z.object({
    across: z.record(z.string(), z.string()),
    down: z.record(z.string(), z.string()),
  }),
  status: z.enum(["draft", "published"]).default("draft"),
});

function rowToPuzzle(r: Record<string, unknown>) {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    width: r.width,
    height: r.height,
    grid: r.grid,
    clues: r.clues,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    status: r.status,
    authorId: r.author_id,
  };
}

// GET /api/puzzles/mine
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id
       FROM puzzles WHERE author_id = $1 ORDER BY updated_at DESC`,
      [req.user!.userId]
    );
    res.json({ puzzles: result.rows.map(rowToPuzzle) });
  } catch (err) {
    next(err);
  }
});

// GET /api/puzzles
router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id
       FROM puzzles WHERE status = 'published' ORDER BY created_at DESC`
    );
    res.json({ puzzles: result.rows.map(rowToPuzzle) });
  } catch (err) {
    next(err);
  }
});

// GET /api/puzzles/:id
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id
       FROM puzzles WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    res.json({ puzzle: rowToPuzzle(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// POST /api/puzzles
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = puzzleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    const { title, author, width, height, grid, clues, status } = parsed.data;
    const result = await pool.query(
      `INSERT INTO puzzles (title, author, width, height, grid, clues, status, author_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id`,
      [title, author, width, height, JSON.stringify(grid), JSON.stringify(clues), status, req.user!.userId]
    );
    res.status(201).json({ puzzle: rowToPuzzle(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/puzzles/:id
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT author_id FROM puzzles WHERE id = $1`,
      [req.params.id]
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    if (existing.rows[0].author_id !== req.user!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parsed = puzzleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues });
      return;
    }
    const { title, author, width, height, grid, clues, status } = parsed.data;
    const result = await pool.query(
      `UPDATE puzzles
       SET title = $1, author = $2, width = $3, height = $4, grid = $5,
           clues = $6, status = $7, updated_at = now()
       WHERE id = $8
       RETURNING id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id`,
      [title, author, width, height, JSON.stringify(grid), JSON.stringify(clues), status, req.params.id]
    );
    res.json({ puzzle: rowToPuzzle(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/puzzles/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT author_id FROM puzzles WHERE id = $1`,
      [req.params.id]
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    if (existing.rows[0].author_id !== req.user!.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const activeGames = await pool.query(
      `SELECT id FROM games WHERE puzzle_id = $1 AND status != 'complete'`,
      [req.params.id]
    );
    if (activeGames.rows.length > 0) {
      res.status(409).json({ error: "Puzzle has active games and cannot be deleted" });
      return;
    }

    await pool.query(`DELETE FROM puzzles WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
