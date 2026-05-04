import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { pub } from "../db/redis";
import { logger } from "../logger";
import type {
  CompetitiveMatch,
  ChallengeResponse,
  ListMatchesResponse,
  GetMatchResponse,
  Puzzle,
  OwnCell,
  OpponentCell,
} from "@multicross/shared";

const router = Router();

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapMatchRow(r: {
  id: string;
  challenger_id: string;
  opponent_id: string;
  puzzle_id: string;
  status: string;
  time_limit_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  winner_id: string | null;
  created_at: string;
  puzzle_title: string;
  challenger_name: string;
  opponent_name: string;
}): CompetitiveMatch {
  return {
    id: r.id,
    challengerId: r.challenger_id,
    opponentId: r.opponent_id,
    puzzleId: r.puzzle_id,
    status: r.status as CompetitiveMatch["status"],
    timeLimitSeconds: r.time_limit_seconds,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
    winnerId: r.winner_id ?? null,
    createdAt: r.created_at,
    puzzleTitle: r.puzzle_title,
    challengerName: r.challenger_name,
    opponentName: r.opponent_name,
  };
}

function mapPuzzleRow(p: {
  id: string;
  title: string;
  author: string;
  width: number;
  height: number;
  grid: (string | null)[][];
  clues: { across: Record<number, string>; down: Record<number, string> };
  created_at: string;
  updated_at?: string | null;
  status?: string | null;
  author_id?: string | null;
}): Puzzle {
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    width: p.width,
    height: p.height,
    grid: p.grid,
    clues: p.clues,
    createdAt: p.created_at,
    updatedAt: p.updated_at ?? undefined,
    status: (p.status as Puzzle["status"]) ?? undefined,
    authorId: p.author_id ?? undefined,
  };
}

const MATCH_SELECT = `
  SELECT
    m.id, m.challenger_id, m.opponent_id, m.puzzle_id, m.status,
    m.time_limit_seconds, m.started_at, m.completed_at, m.winner_id, m.created_at,
    p.title  AS puzzle_title,
    uc.display_name AS challenger_name,
    uo.display_name AS opponent_name
  FROM competitive_matches m
  JOIN puzzles p  ON p.id  = m.puzzle_id
  JOIN users uc   ON uc.id = m.challenger_id
  JOIN users uo   ON uo.id = m.opponent_id
`;

// ---------------------------------------------------------------------------
// POST /api/competitive/challenge
// ---------------------------------------------------------------------------
const challengeSchema = z.object({
  opponentId: z.string().uuid(),
  puzzleId: z.string().uuid(),
  timeLimitSeconds: z.number().int().min(60).max(3600).optional(),
});

router.post("/challenge", async (req, res, next) => {
  try {
    const parsed = challengeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { opponentId, puzzleId, timeLimitSeconds = 600 } = parsed.data;
    const challengerId = req.user!.userId;

    if (challengerId === opponentId) {
      res.status(400).json({ error: "You cannot challenge yourself" });
      return;
    }

    // Verify friendship — opponent must be an accepted friend
    const friendCheck = await pool.query(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = $1 AND addressee_id = $2)
           OR (addressee_id = $1 AND requester_id = $2))`,
      [challengerId, opponentId]
    );
    if (!friendCheck.rows[0]) {
      res.status(403).json({ error: "You can only challenge friends" });
      return;
    }

    // Verify puzzle exists and is published
    const puzzleCheck = await pool.query(
      `SELECT title FROM puzzles WHERE id = $1 AND status = 'published'`,
      [puzzleId]
    );
    if (!puzzleCheck.rows[0]) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    const puzzleTitle: string = puzzleCheck.rows[0].title;

    const challengerResult = await pool.query(
      `SELECT display_name FROM users WHERE id = $1`,
      [challengerId]
    );
    const challengerName: string = challengerResult.rows[0]?.display_name ?? "Someone";

    const matchResult = await pool.query(
      `INSERT INTO competitive_matches (challenger_id, opponent_id, puzzle_id, time_limit_seconds)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [challengerId, opponentId, puzzleId, timeLimitSeconds]
    );
    const matchId: string = matchResult.rows[0].id;

    const wsPayload = { matchId, challengerName, puzzleTitle, timeLimitSeconds };
    await pub
      .publish(
        `channel:user:${opponentId}`,
        JSON.stringify({ event: "match_invite", payload: wsPayload, sourceUserId: challengerId })
      )
      .catch((err) => logger.error({ err }, "Failed to publish match_invite"));

    logger.info({ matchId, challengerId, opponentId }, "Competitive challenge sent");

    const response: ChallengeResponse = { matchId };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/competitive/matches  — list active + recent for caller
// Must be registered BEFORE /:matchId
// ---------------------------------------------------------------------------
router.get("/matches", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `${MATCH_SELECT}
       WHERE (m.challenger_id = $1 OR m.opponent_id = $1)
         AND m.status IN ('pending', 'active', 'completed', 'timed_out', 'cancelled')
       ORDER BY m.created_at DESC
       LIMIT 20`,
      [userId]
    );
    const response: ListMatchesResponse = { matches: result.rows.map(mapMatchRow) };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/competitive/matches/:matchId
// ---------------------------------------------------------------------------
router.get("/matches/:matchId", async (req, res, next) => {
  try {
    const matchIdParsed = z.string().uuid().safeParse(req.params.matchId);
    if (!matchIdParsed.success) {
      res.status(400).json({ error: "Invalid match ID" });
      return;
    }
    const matchId = matchIdParsed.data;
    const userId = req.user!.userId;

    const matchResult = await pool.query(
      `${MATCH_SELECT} WHERE m.id = $1`,
      [matchId]
    );
    if (!matchResult.rows[0]) {
      res.status(404).json({ error: "Match not found" });
      return;
    }
    const match = mapMatchRow(matchResult.rows[0]);

    if (match.challengerId !== userId && match.opponentId !== userId) {
      res.status(403).json({ error: "Not a participant in this match" });
      return;
    }

    const opponentId = match.challengerId === userId ? match.opponentId : match.challengerId;

    const [puzzleResult, ownCellsResult, opponentCellsResult] = await Promise.all([
      pool.query(
        `SELECT id, title, author, author_id, width, height, grid, clues, status, created_at, updated_at
         FROM puzzles WHERE id = $1`,
        [match.puzzleId]
      ),
      pool.query(
        `SELECT row, col, value FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
        [matchId, userId]
      ),
      pool.query(
        `SELECT row, col FROM competitive_cells WHERE match_id = $1 AND user_id = $2`,
        [matchId, opponentId]
      ),
    ]);

    const puzzle: Puzzle = mapPuzzleRow(puzzleResult.rows[0]);
    const ownCells: OwnCell[] = ownCellsResult.rows.map((r) => ({
      row: r.row as number,
      col: r.col as number,
      value: r.value as string,
    }));
    const opponentCells: OpponentCell[] = opponentCellsResult.rows.map((r) => ({
      row: r.row as number,
      col: r.col as number,
    }));

    const response: GetMatchResponse = { match, puzzle, ownCells, opponentCells };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
