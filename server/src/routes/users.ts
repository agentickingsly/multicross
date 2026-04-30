import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { logger } from "../logger";

const router = Router();

// GET /api/users/me
router.get("/me", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await pool.query(
      `SELECT id, email, display_name, created_at, invite_code, is_searchable
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const row = result.rows[0];
    res.json({
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        createdAt: row.created_at,
        inviteCode: row.invite_code,
        isSearchable: row.is_searchable,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me/privacy
router.patch("/me/privacy", async (req, res, next) => {
  try {
    const parsed = z
      .object({ isSearchable: z.boolean() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { isSearchable } = parsed.data;
    const userId = req.user!.userId;

    await pool.query(
      `UPDATE users SET is_searchable = $1 WHERE id = $2`,
      [isSearchable, userId]
    );

    logger.info({ userId, isSearchable }, "Privacy setting updated");
    res.json({ success: true, isSearchable });
  } catch (err) {
    next(err);
  }
});

export default router;
