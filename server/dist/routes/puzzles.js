"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pool_1 = __importDefault(require("../db/pool"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/puzzles
router.get("/", auth_1.requireAuth, async (_req, res) => {
    const result = await pool_1.default.query(`SELECT id, title, author, width, height, grid, clues, created_at
     FROM puzzles ORDER BY created_at DESC`);
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
router.get("/:id", auth_1.requireAuth, async (req, res) => {
    const result = await pool_1.default.query(`SELECT id, title, author, width, height, grid, clues, created_at
     FROM puzzles WHERE id = $1`, [req.params.id]);
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
exports.default = router;
//# sourceMappingURL=puzzles.js.map