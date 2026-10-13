// Memories and tasks used to be JSON files in the data directory: memories.json, tasks.json and
// tasks.tags.json. This brings them into the database, once, and leaves each renamed to
// `<name>.imported` so that going back is a matter of renaming it. A file that cannot be read is
// left where it is, to be looked at, and tried again next start.
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { type Db, transaction } from './db.ts';

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = Date.now()): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Reads a legacy file, or says nothing if there is none or it will not parse. */
function read(file: string): unknown {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.error(`${file} could not be read, so it was not brought into the database. It is left as it is.`);
    return undefined;
  }
}

/** Brings in what the old files held. Returns how many memories and tasks came in. */
export function importLegacy(db: Db, dir: string): { memories: number; tasks: number } {
  const done = { memories: 0, tasks: 0 };
  const files = { memories: join(dir, 'memories.json'), tasks: join(dir, 'tasks.json'), colors: join(dir, 'tasks.tags.json') };
  const [memories, tasks, colors] = [read(files.memories), read(files.tasks), read(files.colors)];
  transaction(db, () => {
    for (const m of Array.isArray(memories) ? memories : []) {
      if (typeof m?.id !== 'string' || !str(m.title) || !str(m.body)) continue;
      db.prepare('INSERT OR IGNORE INTO memories (id, layer, scope, title, body, by, author, created, updated, pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        m.id, str(m.layer, 'node'), m.scope ? str(m.scope) : null, str(m.title), str(m.body), m.by === 'agent' ? 'agent' : 'you', m.author ? str(m.author) : null, num(m.created), num(m.updated, num(m.created)), m.pending ? 1 : 0,
      );
      done.memories++;
    }
    for (const t of Array.isArray(tasks) ? tasks : []) {
      if (typeof t?.id !== 'string' || !str(t.title) || !str(t.projectId)) continue;
      db.prepare('INSERT OR IGNORE INTO tasks (id, title, description, project_id, agent_id, by, created, updated, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        t.id, str(t.title), str(t.description), str(t.projectId), t.agentId ? str(t.agentId) : null, t.by === 'agent' ? 'agent' : 'you', num(t.created), num(t.updated, num(t.created)), ['open', 'working', 'done'].includes(t.state) ? t.state : 'open',
      );
      (Array.isArray(t.files) ? t.files : []).forEach((f: any, position: number) => {
        if (typeof f?.id === 'string') db.prepare('INSERT OR IGNORE INTO task_files (task_id, id, name, mime, bytes, position) VALUES (?, ?, ?, ?, ?, ?)').run(t.id, f.id, str(f.name, 'file'), str(f.mime, 'application/octet-stream'), num(f.bytes, 0), position);
      });
      (Array.isArray(t.tags) ? t.tags : []).forEach((tag: unknown, position: number) => {
        if (typeof tag === 'string' && tag) db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag, position) VALUES (?, ?, ?)').run(t.id, tag, position);
      });
      done.tasks++;
    }
    for (const [tag, color] of Object.entries(colors && typeof colors === 'object' ? (colors as Record<string, unknown>) : {}))
      if (typeof color === 'string') db.prepare('INSERT OR IGNORE INTO tag_colors (tag, color) VALUES (?, ?)').run(tag, color);
  });
  // Only now, with everything safely in, are the files put aside.
  for (const [data, file] of [[memories, files.memories], [tasks, files.tasks], [colors, files.colors]] as const) if (data !== undefined) renameSync(file, `${file}.imported`);
  return done;
}
