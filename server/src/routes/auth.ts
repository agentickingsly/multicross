import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import pool from "../db/pool";
import { BLOCKED_EMAIL_DOMAINS } from "../config/blockedDomains";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(30),
  password: z.string().min(8),
  inviteCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function generateFriendInviteCode(): string {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alpha[Math.floor(Math.random() * 26)];
  }
  code += "-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * 36)];
  }
  return code;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const INVITE_CODE = process.env.INVITE_CODE;
  if (INVITE_CODE) {
    const { inviteCode } = req.body;
    if (!inviteCode || inviteCode !== INVITE_CODE) {
      return res.status(403).json({ error: "Invalid invite code" });
    }
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { email, displayName, password } = parsed.data;

  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
    res.status(400).json({ error: "Email domain not allowed" });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    let row: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const friendCode = generateFriendInviteCode();
      try {
        const result = await pool.query(
          `INSERT INTO users (email, display_name, password_hash, invite_code)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, display_name, created_at, invite_code, is_searchable`,
          [email, displayName, passwordHash, friendCode]
        );
        row = result.rows[0];
        break;
      } catch (err: unknown) {
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === "23505") {
          if (pgErr.constraint === "uq_users_invite_code") {
            continue; // rare collision on friend invite code — retry
          }
          res.status(409).json({ error: "Email already exists" });
          return;
        }
        throw err;
      }
    }

    if (!row) {
      throw new Error("Failed to generate unique friend invite code");
    }

    const user = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
      inviteCode: row.invite_code,
      isSearchable: row.is_searchable,
    };
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );
    res.status(201).json({ user, token });
  } catch (err) {
    throw err;
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      `SELECT id, email, display_name, password_hash, created_at, invite_code, is_searchable
       FROM users WHERE email = $1`,
      [email]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
      inviteCode: row.invite_code,
      isSearchable: row.is_searchable,
    };
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
});

export default router;
