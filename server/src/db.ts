// This Toto's database: one SQLite file in its data directory, for what is kept as records (now the
// memories and tasks). It is Node's own SQLite, so there is nothing to compile on a Pi.
//
// The file says which version of the layout it has (`PRAGMA user_version`), and opening it brings it
// up to date by running, in order, each step it has not had. A step and its version number change
// together or not at all. A file from a newer Toto than this is refused, never touched.
// Secrets, keys, pictures and attachments are not in it: they stay files, so a copy of the database
// can be kept or shared without them (see PLAN.md).
import { chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/** The layout, one step per version. A step that has shipped is never edited: add another. */
export const MIGRATIONS: string[] = [
  `CREATE TABLE memories (
     id TEXT PRIMARY KEY,
     layer TEXT NOT NULL,
     scope TEXT,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     by TEXT NOT NULL,
     author TEXT,
     created INTEGER NOT NULL,
     updated INTEGER NOT NULL,
     pending INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX memories_where ON memories (layer, scope);
   CREATE TABLE tasks (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     description TEXT NOT NULL,
     project_id TEXT NOT NULL,
     agent_id TEXT,
     by TEXT NOT NULL,
     created INTEGER NOT NULL,
     updated INTEGER NOT NULL,
     state TEXT NOT NULL
   );
   CREATE INDEX tasks_project ON tasks (project_id);
   CREATE TABLE task_files (
     task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
     id TEXT NOT NULL,
     name TEXT NOT NULL,
     mime TEXT NOT NULL,
     bytes INTEGER NOT NULL,
     position INTEGER NOT NULL,
     PRIMARY KEY (task_id, id)
   );
   CREATE TABLE task_tags (
     task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
     tag TEXT NOT NULL,
     position INTEGER NOT NULL,
     PRIMARY KEY (task_id, tag)
   );
   CREATE INDEX task_tags_tag ON task_tags (tag);
   CREATE TABLE tag_colors (tag TEXT PRIMARY KEY, color TEXT NOT NULL);`,
];

/** Runs `work` as one change that happens whole or not at all. Inside another, it is part of it. */
export function transaction<T>(db: Db, work: () => T): T {
  if (db.isTransaction) return work();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Opens the database at `file` (or `:memory:`), making it or bringing it up to date. */
export function openDb(file: string, migrations: string[] = MIGRATIONS): Db {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') {
    // The write-ahead log: readers are not stopped by a write, and a power cut loses at most the last change.
    db.exec('PRAGMA journal_mode = WAL');
    chmodSync(file, 0o600);
  }
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL');
  const have = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (have > migrations.length) {
    db.close();
    throw new Error(`This database is from a newer Toto (layout ${have}) than this one knows (${migrations.length}). Update this Toto, or restore from a backup.`);
  }
  for (let version = have; version < migrations.length; version++)
    transaction(db, () => {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  return db;
}
