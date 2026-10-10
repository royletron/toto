// What this Toto has been asked to remember, at three layers: one agent, one project, or all of them.
// Kept in one JSON file, written whole each time it changes.
// ponytail: the file is read once and held in memory, and is small by the limits below. Move to a
// database if people keep thousands.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Memory, MemoryLayer } from '../../protocol.ts';

export const LIMITS = { title: 120, body: 8000, perScope: 200 };
const LAYERS: MemoryLayer[] = ['node', 'project', 'agent'];

/** What a person or an agent is saving. `scope` is a project's id or an agent's, by layer. */
export type MemoryInput = { layer: unknown; scope?: unknown; title: unknown; body: unknown };
/** Who is saving it: the person, or an agent, whose project is `projectId`. */
export type Writer = { by: 'you' } | { by: 'agent'; agentId: string; projectId: string };

export function openMemories(file: string) {
  let items: Memory[] = [];
  try {
    if (existsSync(file)) items = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // A damaged file is not worth stopping for; it starts again empty.
  }
  const persist = () => {
    writeFileSync(`${file}.tmp`, JSON.stringify(items), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  const find = (id: unknown) => items.find((m) => m.id === id);
  const inScope = (layer: MemoryLayer, scope?: string) => items.filter((m) => m.layer === layer && m.scope === scope).length;

  return {
    list: () => items,
    get: find,

    /**
     * Makes a memory, or with `id` changes one (which is also how one moves between layers). An agent
     * may write only to its own layer and its own project's, and what it writes for the whole node
     * waits to be accepted. Throws what is wrong, in plain words.
     */
    save(input: MemoryInput, writer: Writer, id?: string): Memory {
      const { layer, title, body } = input;
      if (typeof layer !== 'string' || !LAYERS.includes(layer as MemoryLayer)) throw new Error('A memory belongs to the agent, the project or the whole Toto.');
      if (typeof title !== 'string' || !title.trim() || title.length > LIMITS.title) throw new Error(`A memory needs a title of up to ${LIMITS.title} characters.`);
      if (typeof body !== 'string' || !body.trim() || body.length > LIMITS.body) throw new Error(`A memory needs some text, of up to ${LIMITS.body} characters.`);
      let scope = layer === 'node' ? undefined : input.scope;
      if (writer.by === 'agent') scope = layer === 'agent' ? writer.agentId : layer === 'project' ? writer.projectId : undefined;
      if (layer !== 'node' && (typeof scope !== 'string' || !scope)) throw new Error('Say which project or agent this memory is for.');
      const was = id === undefined ? undefined : find(id);
      if (id !== undefined && !was) throw new Error('That memory is not there any more.');
      // An agent may only change what an agent of its own wrote, or it could rewrite your notes.
      if (was && writer.by === 'agent' && !(was.by === 'agent' && was.author === writer.agentId)) throw new Error('That memory is not yours to change.');
      const moved = !was || was.layer !== layer || was.scope !== scope;
      if (moved && inScope(layer as MemoryLayer, scope as string | undefined) >= LIMITS.perScope) throw new Error(`That is as many memories as one place keeps (${LIMITS.perScope}). Delete some first.`);
      const now = Date.now();
      const author = was?.author ?? (writer.by === 'agent' ? writer.agentId : undefined);
      const memory: Memory = {
        id: was?.id ?? randomBytes(4).toString('hex'),
        layer: layer as MemoryLayer,
        ...(scope ? { scope: scope as string } : null),
        title: title.trim(),
        body: body.trim(),
        by: was?.by ?? writer.by,
        ...(author ? { author } : null),
        created: was?.created ?? now,
        updated: now,
        // What an agent proposes for the whole Toto waits for you; anything you save is as good as accepted.
        ...(writer.by === 'agent' && layer === 'node' ? { pending: true } : null),
      };
      items = was ? items.map((m) => (m === was ? memory : m)) : [...items, memory];
      persist();
      return memory;
    },

    /** Takes an agent's suggestion as it is. */
    accept(id: unknown) {
      const m = find(id);
      if (!m?.pending) return false;
      delete m.pending;
      persist();
      return true;
    },

    /** Deletes one; an agent may only delete what it wrote itself. */
    remove(id: unknown, writer: Writer): boolean {
      const m = find(id);
      if (!m) return false;
      if (writer.by === 'agent' && !(m.by === 'agent' && m.author === writer.agentId)) throw new Error('That memory is not yours to delete.');
      items = items.filter((x) => x !== m);
      persist();
      return true;
    },

    /** Forgets everything kept for an agent or a project that is gone. */
    forget(scopes: string[]) {
      const before = items.length;
      items = items.filter((m) => !(m.scope && scopes.includes(m.scope)));
      if (items.length !== before) persist();
    },

    /** What applies to an agent: the whole Toto's (once accepted), its project's, and its own. */
    forAgent(agentId: string, projectId: string): Memory[] {
      return items.filter((m) => !m.pending && (m.layer === 'node' || (m.layer === 'project' && m.scope === projectId) || (m.layer === 'agent' && m.scope === agentId)));
    },
  };
}
