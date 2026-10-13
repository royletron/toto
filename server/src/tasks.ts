// What there is to do on this Toto: tasks an agent raised for later, or you wrote, and who is on
// them. One JSON file, written whole on each change, and a folder of files beside it for what is
// attached.
// ponytail: held in memory and capped, like the memories; move to a database if people keep thousands.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { FileRef, Tag, Task, TaskState } from '../../protocol.ts';
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

export function openTasks(file: string, filesRoot: string) {
  let items: Task[] = [];
  try {
    if (existsSync(file)) items = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // A damaged file is not worth stopping for; it starts again empty.
  }
  const persist = () => {
    writeFileSync(`${file}.tmp`, JSON.stringify(items), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  // The colours people have chosen for tags, by name. The rest are made up.
  const colorFile = file.replace(/\.json$/, '') + '.tags.json';
  let chosen: Record<string, string> = {};
  try {
    if (existsSync(colorFile)) chosen = JSON.parse(readFileSync(colorFile, 'utf8'));
  } catch {
    // A damaged file is not worth stopping for.
  }
  const persistColors = () => {
    writeFileSync(`${colorFile}.tmp`, JSON.stringify(chosen), { mode: 0o600 });
    renameSync(`${colorFile}.tmp`, colorFile);
  };
  const find = (id: unknown) => items.find((t) => t.id === id);
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

  return {
    list: () => items,
    get: find,

    create(input: TaskInput, by: 'you' | 'agent'): Task {
      check(input);
      if (items.length >= LIMITS.total) throw new Error(`That is as many tasks as this Toto keeps (${LIMITS.total}). Delete some first.`);
      const now = Date.now();
      const task: Task = {
        id: randomBytes(4).toString('hex'),
        title: (input.title as string).trim(),
        description: (input.description as string).trim(),
        projectId: input.projectId,
        ...(input.agentId ? { agentId: input.agentId } : null),
        by,
        created: now,
        updated: now,
        state: (input.state as TaskState | undefined) ?? 'open',
        files: [],
        tags: input.tags === undefined ? [] : cleanTags(input.tags),
      };
      items = [...items, task];
      persist();
      return task;
    },

    /** Changes a task. Giving it another project or agent is how it is moved. */
    update(id: string, input: TaskInput): Task {
      const was = need(id);
      check(input);
      const task: Task = { ...was, title: (input.title as string).trim(), description: (input.description as string).trim(), projectId: input.projectId, state: (input.state as TaskState | undefined) ?? was.state, tags: input.tags === undefined ? (was.tags ?? []) : cleanTags(input.tags), updated: Date.now() };
      if (input.agentId) task.agentId = input.agentId;
      else delete task.agentId;
      items = items.map((t) => (t === was ? task : t));
      persist();
      return task;
    },

    /** Changes some of a task and leaves the rest as it was. */
    edit(id: string, patch: { title?: unknown; description?: unknown; state?: unknown; tags?: unknown }): Task {
      const was = need(id);
      return this.update(id, { title: patch.title ?? was.title, description: patch.description ?? was.description, projectId: was.projectId, agentId: was.agentId, state: patch.state ?? was.state, tags: patch.tags });
    },

    /** Marks a task done, working or open without touching anything else. */
    setState(id: string, state: TaskState): Task {
      const task = need(id);
      task.state = state;
      task.updated = Date.now();
      persist();
      return task;
    },

    remove(id: unknown): boolean {
      const task = find(id);
      if (!task) return false;
      items = items.filter((t) => t !== task);
      dropFiles(task.id, filesRoot);
      persist();
      return true;
    },

    addFile(id: string, bytes: Buffer, name: string): FileRef {
      const task = need(id);
      if (task.files.length >= LIMITS.files) throw new Error(`A task keeps up to ${LIMITS.files} files.`);
      const ref = saveFile(task.id, bytes, name, filesRoot);
      if (!ref) throw new Error('That file is empty, or larger than 10 MB.');
      if (!task.files.some((f) => f.id === ref.id)) task.files = [...task.files, ref];
      task.updated = Date.now();
      persist();
      return ref;
    },

    removeFile(id: string, fileId: unknown) {
      const task = need(id);
      const gone = task.files.find((f) => f.id === fileId);
      if (!gone) return;
      task.files = task.files.filter((f) => f !== gone);
      task.updated = Date.now();
      dropFile(task.id, gone.id, filesRoot);
      persist();
    },

    readFile: (taskId: unknown, id: unknown) => readFile(taskId, id, filesRoot),

    /** Every tag on any task, with its colour: the one chosen for it, or one made up from its name. */
    tags(): Tag[] {
      const names = [...new Set(items.flatMap((t) => t.tags ?? []))].sort();
      return names.map((name) => ({ name, color: chosen[name] ?? colorFromName(name) }));
    },

    /** Chooses a tag's colour (a #rrggbb), or with none goes back to the one made up from its name. */
    setColor(name: unknown, color?: unknown) {
      const tag = cleanTag(name);
      if (color === undefined) delete chosen[tag];
      else if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('A colour is six hex digits, like #8BD45F.');
      else if (color.toLowerCase() === AMBER) throw new Error('Amber is for whatever is waiting on you, so it is not for a tag.');
      else chosen[tag] = color.toUpperCase();
      persistColors();
    },

    /** Renames a tag on every task. If there is a tag by the new name the two become one, with that one's colour. */
    renameTag(name: unknown, to: unknown) {
      const [from, next] = [cleanTag(name), cleanTag(to)];
      if (from === next) return;
      for (const t of items) if (t.tags?.includes(from)) t.tags = [...new Set(t.tags.map((x) => (x === from ? next : x)))];
      // Its colour goes with it, unless the new name already has one.
      if (chosen[from] && !chosen[next]) chosen[next] = chosen[from];
      delete chosen[from];
      persist();
      persistColors();
    },

    /** Takes a tag off every task. */
    deleteTag(name: unknown) {
      const tag = cleanTag(name);
      for (const t of items) if (t.tags?.includes(tag)) t.tags = t.tags.filter((x) => x !== tag);
      delete chosen[tag];
      persist();
      persistColors();
    },

    /** An agent is gone: what was its to do is nobody's, and still there. */
    unassign(agentId: string) {
      let changed = false;
      for (const t of items) {
        if (t.agentId !== agentId) continue;
        delete t.agentId;
        changed = true;
      }
      if (changed) persist();
    },

    /** A project is gone, and its tasks with it. */
    removeProject(projectId: string) {
      const gone = items.filter((t) => t.projectId === projectId);
      for (const t of gone) dropFiles(t.id, filesRoot);
      if (gone.length) {
        items = items.filter((t) => !gone.includes(t));
        persist();
      }
    },
  };
}
