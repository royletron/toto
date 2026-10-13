// What there is to do on this Toto: tasks an agent raised for later, or you wrote, and who is on
// them. Kept in the database (see db.ts), with a folder of files beside it for what is attached.
// ponytail: capped at LIMITS.total, so a list is read whole; page it if that is ever raised a lot.
import { randomBytes } from 'node:crypto';
import type { FileRef, Tag, Task, TaskState } from '../../protocol.ts';
import { type Db, transaction } from './db.ts';
import { dropFile, dropFiles, readFile, saveFile } from './images.ts';

export const LIMITS = { title: 120, description: 8000, total: 500, files: 10, tags: 8, tagName: 24 };
const STATES: TaskState[] = ['open', 'working', 'done'];

export type TaskInput = { title: unknown; description: unknown; projectId: string; agentId?: string; state?: unknown; tags?: unknown };

// The colours tags are given when nobody has chosen: the app's own palette, less amber, which means "waiting on you".
export const TAG_COLORS = ['#8BD45F', '#7FC8E8', '#F25C82', '#B79CED', '#F2A07B', '#5FD4C0', '#6FA8F7', '#E58BD9', '#B8D86B', '#ECE6D2', '#959B85'];
const AMBER = '#ffb000';

/** One tag as it is kept: trimmed, spaces made single, lower case. Throws what is wrong with it. */
export function cleanTag(name: unknown): string {
  const tag = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';
  if (!tag || tag.length > LIMITS.tagName) throw new Error(`A tag is 1 to ${LIMITS.tagName} characters.`);
  return tag;
}

/** A list of tags as it is kept: each cleaned, none twice, no more than a task may have. Throws what is wrong with it. */
export function cleanTags(names: unknown): string[] {
  if (!Array.isArray(names)) throw new Error('Tags are a list of names.');
  const tags = [...new Set(names.map(cleanTag))];
  if (tags.length > LIMITS.tags) throw new Error(`A task has up to ${LIMITS.tags} tags.`);
  return tags;
}

// A colour made up from a name, the same on every phone because it is made here.
const colorFromName = (name: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return TAG_COLORS[(h >>> 0) % TAG_COLORS.length];
};

type TaskRow = { id: string; title: string; description: string; project_id: string; agent_id: string | null; by: string; created: number; updated: number; state: string };
type FileRow = { task_id: string; id: string; name: string; mime: string; bytes: number };
type TagRow = { task_id: string; tag: string };

export function openTasks(db: Db, filesRoot: string) {
  /** Tasks as the phone sees them, with their files and tags. */
  const assemble = (rows: TaskRow[]): Task[] => {
    if (!rows.length) return [];
    const marks = rows.map(() => '?').join(',');
    const ids = rows.map((r) => r.id);
    const files = db.prepare(`SELECT * FROM task_files WHERE task_id IN (${marks}) ORDER BY position`).all(...ids) as FileRow[];
    const tags = db.prepare(`SELECT * FROM task_tags WHERE task_id IN (${marks}) ORDER BY position`).all(...ids) as TagRow[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      projectId: r.project_id,
      ...(r.agent_id ? { agentId: r.agent_id } : null),
      by: r.by as 'you' | 'agent',
      created: r.created,
      updated: r.updated,
      state: r.state as TaskState,
      files: files.filter((f) => f.task_id === r.id).map(({ id, name, mime, bytes }): FileRef => ({ id, name, mime, bytes })),
      tags: tags.filter((t) => t.task_id === r.id).map((t) => t.tag),
    }));
  };
  const find = (id: unknown): Task | undefined => (typeof id === 'string' ? assemble(db.prepare('SELECT * FROM tasks WHERE id = ?').all(id) as TaskRow[])[0] : undefined);
  const need = (id: unknown) => {
    const t = find(id);
    if (!t) throw new Error('That task is not there any more.');
    return t;
  };
  const check = ({ title, description, state }: Pick<TaskInput, 'title' | 'description' | 'state'>) => {
    if (typeof title !== 'string' || !title.trim() || title.length > LIMITS.title) throw new Error(`A task needs a title of up to ${LIMITS.title} characters.`);
    if (typeof description !== 'string' || description.length > LIMITS.description) throw new Error(`A task's description may be up to ${LIMITS.description} characters.`);
    if (state !== undefined && !STATES.includes(state as TaskState)) throw new Error('A task is open, working or done.');
  };
  const putTags = (id: string, tags: string[]) => {
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(id);
    tags.forEach((tag, position) => db.prepare('INSERT INTO task_tags (task_id, tag, position) VALUES (?, ?, ?)').run(id, tag, position));
  };
  const touch = (id: string) => db.prepare('UPDATE tasks SET updated = ? WHERE id = ?').run(Date.now(), id);

  return {
    list: (): Task[] => assemble(db.prepare('SELECT * FROM tasks ORDER BY created, rowid').all() as TaskRow[]),
    get: find,

    create(input: TaskInput, by: 'you' | 'agent'): Task {
      check(input);
      const tags = input.tags === undefined ? [] : cleanTags(input.tags);
      return transaction(db, () => {
        if ((db.prepare('SELECT count(*) AS n FROM tasks').get() as { n: number }).n >= LIMITS.total) throw new Error(`That is as many tasks as this Toto keeps (${LIMITS.total}). Delete some first.`);
        const id = randomBytes(4).toString('hex');
        const now = Date.now();
        db.prepare('INSERT INTO tasks (id, title, description, project_id, agent_id, by, created, updated, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          id, (input.title as string).trim(), (input.description as string).trim(), input.projectId, input.agentId ?? null, by, now, now, (input.state as TaskState | undefined) ?? 'open',
        );
        putTags(id, tags);
        return find(id)!;
      });
    },

    /** Changes a task. Giving it another project or agent is how it is moved. */
    update(id: string, input: TaskInput): Task {
      check(input);
      const tags = input.tags === undefined ? undefined : cleanTags(input.tags);
      return transaction(db, () => {
        const was = need(id);
        db.prepare('UPDATE tasks SET title = ?, description = ?, project_id = ?, agent_id = ?, state = ?, updated = ? WHERE id = ?').run(
          (input.title as string).trim(), (input.description as string).trim(), input.projectId, input.agentId ?? null, (input.state as TaskState | undefined) ?? was.state, Date.now(), id,
        );
        if (tags) putTags(id, tags);
        return find(id)!;
      });
    },

    /** Changes some of a task and leaves the rest as it was. */
    edit(id: string, patch: { title?: unknown; description?: unknown; state?: unknown; tags?: unknown }): Task {
      const was = need(id);
      return this.update(id, { title: patch.title ?? was.title, description: patch.description ?? was.description, projectId: was.projectId, agentId: was.agentId, state: patch.state ?? was.state, tags: patch.tags });
    },

    /** Marks a task done, working or open without touching anything else. */
    setState(id: string, state: TaskState): Task {
      need(id);
      db.prepare('UPDATE tasks SET state = ?, updated = ? WHERE id = ?').run(state, Date.now(), id);
      return find(id)!;
    },

    remove(id: unknown): boolean {
      const task = find(id);
      if (!task) return false;
      db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
      dropFiles(task.id, filesRoot);
      return true;
    },

    addFile(id: string, bytes: Buffer, name: string): FileRef {
      const task = need(id);
      if (task.files.length >= LIMITS.files) throw new Error(`A task keeps up to ${LIMITS.files} files.`);
      const ref = saveFile(task.id, bytes, name, filesRoot);
      if (!ref) throw new Error('That file is empty, or larger than 10 MB.');
      transaction(db, () => {
        db.prepare('INSERT OR IGNORE INTO task_files (task_id, id, name, mime, bytes, position) VALUES (?, ?, ?, ?, ?, ?)').run(task.id, ref.id, ref.name, ref.mime, ref.bytes, task.files.length);
        touch(task.id);
      });
      return ref;
    },

    removeFile(id: string, fileId: unknown) {
      const task = need(id);
      const gone = task.files.find((f) => f.id === fileId);
      if (!gone) return;
      transaction(db, () => {
        db.prepare('DELETE FROM task_files WHERE task_id = ? AND id = ?').run(task.id, gone.id);
        touch(task.id);
      });
      dropFile(task.id, gone.id, filesRoot);
    },

    readFile: (taskId: unknown, id: unknown) => readFile(taskId, id, filesRoot),

    /** Every tag on any task, with its colour: the one chosen for it, or one made up from its name. */
    tags(): Tag[] {
      const chosen = new Map((db.prepare('SELECT tag, color FROM tag_colors').all() as { tag: string; color: string }[]).map((r) => [r.tag, r.color]));
      return (db.prepare('SELECT DISTINCT tag FROM task_tags ORDER BY tag').all() as { tag: string }[]).map(({ tag }) => ({ name: tag, color: chosen.get(tag) ?? colorFromName(tag) }));
    },

    /** Chooses a tag's colour (a #rrggbb), or with none goes back to the one made up from its name. */
    setColor(name: unknown, color?: unknown) {
      const tag = cleanTag(name);
      if (color === undefined) db.prepare('DELETE FROM tag_colors WHERE tag = ?').run(tag);
      else if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('A colour is six hex digits, like #8BD45F.');
      else if (color.toLowerCase() === AMBER) throw new Error('Amber is for whatever is waiting on you, so it is not for a tag.');
      else db.prepare('INSERT INTO tag_colors (tag, color) VALUES (?, ?) ON CONFLICT (tag) DO UPDATE SET color = excluded.color').run(tag, color.toUpperCase());
    },

    /** Renames a tag on every task. If there is a tag by the new name the two become one, with that one's colour. */
    renameTag(name: unknown, to: unknown) {
      const [from, next] = [cleanTag(name), cleanTag(to)];
      if (from === next) return;
      transaction(db, () => {
        // A task that had both keeps the one; the old name's rows then go.
        db.prepare('UPDATE OR IGNORE task_tags SET tag = ? WHERE tag = ?').run(next, from);
        db.prepare('DELETE FROM task_tags WHERE tag = ?').run(from);
        // Its colour goes with it, unless the new name already has one.
        db.prepare('INSERT OR IGNORE INTO tag_colors (tag, color) SELECT ?, color FROM tag_colors WHERE tag = ?').run(next, from);
        db.prepare('DELETE FROM tag_colors WHERE tag = ?').run(from);
      });
    },

    /** Takes a tag off every task. */
    deleteTag(name: unknown) {
      const tag = cleanTag(name);
      transaction(db, () => {
        db.prepare('DELETE FROM task_tags WHERE tag = ?').run(tag);
        db.prepare('DELETE FROM tag_colors WHERE tag = ?').run(tag);
      });
    },

    /** An agent is gone: what was its to do is nobody's, and still there. */
    unassign(agentId: string) {
      db.prepare('UPDATE tasks SET agent_id = NULL WHERE agent_id = ?').run(agentId);
    },

    /** A project is gone, and its tasks with it. */
    removeProject(projectId: string) {
      const gone = db.prepare('SELECT id FROM tasks WHERE project_id = ?').all(projectId) as { id: string }[];
      transaction(db, () => db.prepare('DELETE FROM tasks WHERE project_id = ?').run(projectId));
      for (const t of gone) dropFiles(t.id, filesRoot);
    },
  };
}
