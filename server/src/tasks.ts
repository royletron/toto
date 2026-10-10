// What there is to do on this Toto: tasks an agent raised for later, or you wrote, and who is on
// them. One JSON file, written whole on each change, and a folder of files beside it for what is
// attached.
// ponytail: held in memory and capped, like the memories; move to a database if people keep thousands.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { FileRef, Task, TaskState } from '../../protocol.ts';
import { dropFile, dropFiles, readFile, saveFile } from './images.ts';

export const LIMITS = { title: 120, description: 8000, total: 500, files: 10 };
const STATES: TaskState[] = ['open', 'working', 'done'];

export type TaskInput = { title: unknown; description: unknown; projectId: string; agentId?: string; state?: unknown };

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
      };
      items = [...items, task];
      persist();
      return task;
    },

    /** Changes a task. Giving it another project or agent is how it is moved. */
    update(id: string, input: TaskInput): Task {
      const was = need(id);
      check(input);
      const task: Task = { ...was, title: (input.title as string).trim(), description: (input.description as string).trim(), projectId: input.projectId, state: (input.state as TaskState | undefined) ?? was.state, updated: Date.now() };
      if (input.agentId) task.agentId = input.agentId;
      else delete task.agentId;
      items = items.map((t) => (t === was ? task : t));
      persist();
      return task;
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
