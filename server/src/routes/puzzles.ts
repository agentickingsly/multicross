import { Router } from "express";
import pool from "../db/pool";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/puzzles
router.get("/", requireAuth, async (_req, res) => {
  const result = await pool.query(
    `SELECT id, title, author, width, height, grid, clues, created_at
     FROM puzzles ORDER BY created_at DESC`
  );
  const puzzles = result.rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author,
    width: r.width,
    height: r.height,
    grid: r.grid,
    clues: r.clues,
    createdAt: r.created_at,
  }));
  res.json({ puzzles });
});

// GET /api/puzzles/:id
router.get("/:id", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, author, width, height, grid, clues, created_at
     FROM puzzles WHERE id = $1`,
    [req.params.id]
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "Puzzle not found" });
    return;
  }
  const r = result.rows[0];
  res.json({
    puzzle: {
      id: r.id,
      title: r.title,
      author: r.author,
      width: r.width,
      height: r.height,
      grid: r.grid,
      clues: r.clues,
      createdAt: r.created_at,
    },
  });
});

export default router;
