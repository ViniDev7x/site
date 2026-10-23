import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function createStore(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY(kind,id));",
  );
  return {
    db,
    get(kind, id) {
      if (id === undefined || id === null) return null;
      const row = db
        .prepare("SELECT data FROM records WHERE kind=? AND id=?")
        .get(kind, id);
      return row ? JSON.parse(row.data) : null;
    },
    all(kind) {
      return db
        .prepare("SELECT data FROM records WHERE kind=?")
        .all(kind)
        .map((r) => JSON.parse(r.data));
    },
    put(kind, value) {
      db.prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      ).run(kind, String(value.id), JSON.stringify(value));
      return value;
    },
    remove(kind, id) {
      db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
    },
    transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}
