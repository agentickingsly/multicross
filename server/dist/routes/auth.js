"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const pool_1 = __importDefault(require("../db/pool"));
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    displayName: zod_1.z.string().min(1).max(30),
    password: zod_1.z.string().min(8),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
// POST /api/auth/register
router.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
    }
    const { email, displayName, password } = parsed.data;
    try {
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        const result = await pool_1.default.query(`INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`, [email, displayName, passwordHash]);
        const row = result.rows[0];
        const user = {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            createdAt: row.created_at,
        };
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.status(201).json({ user, token });
    }
    catch (err) {
        if (err.code === "23505") {
            res.status(409).json({ error: "Email already exists" });
            return;
        }
        throw err;
    }
});
// POST /api/auth/login
router.post("/login", async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
    }
    const { email, password } = parsed.data;
    try {
        const result = await pool_1.default.query(`SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = $1`, [email]);
        const row = result.rows[0];
        if (!row) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        const match = await bcrypt_1.default.compare(password, row.password_hash);
        if (!match) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        const user = {
            id: row.id,
            email: row.email,
            displayName: row.display_name,
            createdAt: row.created_at,
        };
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.json({ user, token });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map