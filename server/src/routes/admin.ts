import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { logger } from "../logger";

const router = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// POST /api/admin/users/:id/ban
router.post("/users/:id/ban", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const userId = idParsed.data;

    const bodyParsed = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error.issues[0].message });
      return;
    }
    const reason = bodyParsed.data.reason ?? null;

    const result = await pool.query(
      `UPDATE users
       SET is_banned = true, banned_at = now(), banned_reason = $2
       WHERE id = $1
       RETURNING id`,
      [userId, reason]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    logger.info({ userId, reason }, "User banned by admin");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/unban
router.post("/users/:id/unban", async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }
    const userId = idParsed.data;

    const result = await pool.query(
      `UPDATE users
       SET is_banned = false, banned_at = null, banned_reason = null
       WHERE id = $1
       RETURNING id`,
      [userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    logger.info({ userId }, "User unbanned by admin");
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users
router.get("/users", async (req, res, next) => {
  try {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [usersResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, email, display_name, is_banned, banned_at, banned_reason, is_admin, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM users"),
    ]);

    const total = countResult.rows[0].total as number;
    res.json({
      users: usersResult.rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        isBanned: u.is_banned,
        bannedAt: u.banned_at,
        bannedReason: u.banned_reason,
        isAdmin: u.is_admin,
        createdAt: u.created_at,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports
router.get("/reports", async (req, res, next) => {
  try {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const [reportsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
           gr.id,
           gr.game_id,
           gr.reason,
           gr.created_at,
           reporter.id          AS reporter_id,
           reporter.email       AS reporter_email,
           reporter.display_name AS reporter_name,
           reported.id          AS reported_id,
           reported.email       AS reported_email,
           reported.display_name AS reported_name
         FROM game_reports gr
         JOIN users reporter ON reporter.id = gr.reporter_id
         JOIN users reported ON reported.id = gr.reported_user_id
         ORDER BY gr.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM game_reports"),
    ]);

    const total = countResult.rows[0].total as number;
    res.json({
      reports: reportsResult.rows.map((r) => ({
        id: r.id,
        gameId: r.game_id,
        reason: r.reason,
        createdAt: r.created_at,
        reporter: { id: r.reporter_id, email: r.reporter_email, displayName: r.reporter_name },
        reportedUser: { id: r.reported_id, email: r.reported_email, displayName: r.reported_name },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
