import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { Pool } from "pg";
import fs from "fs";

export async function runMigrations(): Promise<void> {
  // Always connect via DATABASE_URL so migrations have CREATE TABLE rights
  // regardless of which DB_USER the app pool is configured to use.
  const migrationPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrationPool.query(`
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
      const { rows } = await migrationPool.query(
        "SELECT 1 FROM _migrations WHERE filename = $1", [file]
      );
      if (rows.length > 0) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await migrationPool.query(sql);
      await migrationPool.query(
        "INSERT INTO _migrations (filename) VALUES ($1)", [file]
      );
      console.log(`Applied ${file}`);
    }
  } finally {
    await migrationPool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log("Migrations complete"))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
