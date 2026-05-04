import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../db/pool";

export interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ["HS256"] }) as JwtPayload;
      req.user = payload;
    } catch {
      // Invalid/expired token — proceed as unauthenticated
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ["HS256"] }) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireNotBanned(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { next(); return; }
  try {
    const result = await pool.query(
      "SELECT is_banned FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (result.rows[0]?.is_banned) {
      res.status(403).json({ error: "Account suspended" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "Missing or invalid Authorization header" }); return; }
  try {
    const result = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (!result.rows[0]?.is_admin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
