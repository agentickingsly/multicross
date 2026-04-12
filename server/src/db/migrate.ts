import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import pool from "./pool";
import fs from "fs";

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      "SELECT 1 FROM _migrations WHERE filename = $1", [file]
    );
    if (rows.length > 0) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query(
      "INSERT INTO _migrations (filename) VALUES ($1)", [file]
    );
    console.log(`Applied ${file}`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log("Migrations complete");
      return pool.end();
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
