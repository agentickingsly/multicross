import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { logger } from "../logger";

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

const ratingBodySchema = z.object({
  difficulty: z.number().int().min(1).max(5),
  enjoyment: z.number().int().min(1).max(5),
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
    playCount: Number(r.play_count ?? 0),
    ratingCount: Number(r.rating_count ?? 0),
    averageDifficulty: r.average_difficulty != null ? Number(r.average_difficulty) : null,
    averageEnjoyment: r.average_enjoyment != null ? Number(r.average_enjoyment) : null,
  };
}

// Shared SQL fragment for aggregating puzzle rating stats via LEFT JOIN
const RATING_AGGREGATE_SQL = `
  COUNT(pr.id)::int                                         AS rating_count,
  ROUND(AVG(pr.difficulty)::numeric, 1)::float8             AS average_difficulty,
  ROUND(AVG(pr.enjoyment)::numeric, 1)::float8              AS average_enjoyment
`;

// GET /api/puzzles/mine
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.author, p.width, p.height, p.grid, p.clues,
              p.created_at, p.updated_at, p.status, p.author_id, p.play_count,
              ${RATING_AGGREGATE_SQL}
       FROM puzzles p
       LEFT JOIN puzzle_ratings pr ON pr.puzzle_id = p.id
       WHERE p.author_id = $1
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
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
      `SELECT p.id, p.title, p.author, p.width, p.height, p.grid, p.clues,
              p.created_at, p.updated_at, p.status, p.author_id, p.play_count,
              ${RATING_AGGREGATE_SQL}
       FROM puzzles p
       LEFT JOIN puzzle_ratings pr ON pr.puzzle_id = p.id
       WHERE p.status = 'published'
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    res.json({ puzzles: result.rows.map(rowToPuzzle) });
  } catch (err) {
    next(err);
  }
});

// GET /api/puzzles/:id/stats
router.get("/:id/stats", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    const puzzleId = idParsed.data;
    const userId = req.user!.userId;

    const [statsResult, userRatingResult] = await Promise.all([
      pool.query(
        `SELECT p.play_count,
                COUNT(pr.id)::int                                         AS rating_count,
                ROUND(AVG(pr.difficulty)::numeric, 1)::float8             AS average_difficulty,
                ROUND(AVG(pr.enjoyment)::numeric, 1)::float8              AS average_enjoyment
         FROM puzzles p
         LEFT JOIN puzzle_ratings pr ON pr.puzzle_id = p.id
         WHERE p.id = $1
         GROUP BY p.id, p.play_count`,
        [puzzleId]
      ),
      pool.query(
        `SELECT difficulty, enjoyment FROM puzzle_ratings WHERE puzzle_id = $1 AND user_id = $2`,
        [puzzleId, userId]
      ),
    ]);

    if (!statsResult.rows[0]) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }

    const r = statsResult.rows[0];
    res.json({
      stats: {
        averageDifficulty: r.average_difficulty != null ? Number(r.average_difficulty) : null,
        averageEnjoyment: r.average_enjoyment != null ? Number(r.average_enjoyment) : null,
        playCount: Number(r.play_count),
        ratingCount: Number(r.rating_count),
      },
      userRating: userRatingResult.rows[0]
        ? { difficulty: userRatingResult.rows[0].difficulty, enjoyment: userRatingResult.rows[0].enjoyment }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/puzzles/:id
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id, play_count
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
       RETURNING id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id, play_count`,
      [title, author, width, height, JSON.stringify(grid), JSON.stringify(clues), status, req.user!.userId]
    );
    res.status(201).json({ puzzle: rowToPuzzle(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// POST /api/puzzles/:id/rate
router.post("/:id/rate", requireAuth, async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    const puzzleId = idParsed.data;
    const userId = req.user!.userId;

    const parsed = ratingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { difficulty, enjoyment } = parsed.data;

    const puzzleCheck = await pool.query(`SELECT id FROM puzzles WHERE id = $1`, [puzzleId]);
    if (!puzzleCheck.rows[0]) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }

    await pool.query(
      `INSERT INTO puzzle_ratings (puzzle_id, user_id, difficulty, enjoyment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (puzzle_id, user_id)
       DO UPDATE SET difficulty = EXCLUDED.difficulty, enjoyment = EXCLUDED.enjoyment`,
      [puzzleId, userId, difficulty, enjoyment]
    );

    const statsResult = await pool.query(
      `SELECT p.play_count,
              COUNT(pr.id)::int                                         AS rating_count,
              ROUND(AVG(pr.difficulty)::numeric, 1)::float8             AS average_difficulty,
              ROUND(AVG(pr.enjoyment)::numeric, 1)::float8              AS average_enjoyment
       FROM puzzles p
       LEFT JOIN puzzle_ratings pr ON pr.puzzle_id = p.id
       WHERE p.id = $1
       GROUP BY p.id, p.play_count`,
      [puzzleId]
    );

    const r = statsResult.rows[0];
    logger.debug({ puzzleId, userId }, "puzzle rated");
    res.json({
      stats: {
        averageDifficulty: r.average_difficulty != null ? Number(r.average_difficulty) : null,
        averageEnjoyment: r.average_enjoyment != null ? Number(r.average_enjoyment) : null,
        playCount: Number(r.play_count),
        ratingCount: Number(r.rating_count),
      },
    });
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
       RETURNING id, title, author, width, height, grid, clues, created_at, updated_at, status, author_id, play_count`,
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
