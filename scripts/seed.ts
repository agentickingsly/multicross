import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/multicross",
});

interface Puzzle {
  title: string;
  author: string;
  width: number;
  height: number;
  grid: (string | null)[][];
  clues: {
    across: Record<string, string>;
    down: Record<string, string>;
  };
}

async function seed() {
  const puzzlesPath = path.join(__dirname, "puzzles.json");
  const puzzles: Puzzle[] = JSON.parse(fs.readFileSync(puzzlesPath, "utf-8"));

  console.log(`Seeding ${puzzles.length} puzzles...`);

  for (const puzzle of puzzles) {
    const result = await pool.query(
      `INSERT INTO puzzles (title, author, width, height, grid, clues)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        puzzle.title,
        puzzle.author,
        puzzle.width,
        puzzle.height,
        JSON.stringify(puzzle.grid),
        JSON.stringify(puzzle.clues),
      ]
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`  Inserted: "${puzzle.title}" (${puzzle.width}x${puzzle.height})`);
    } else {
      console.log(`  Skipped (already exists): "${puzzle.title}"`);
    }
  }

  await pool.end();
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
