// What this Toto has been asked to remember, at three layers: one agent, one project, or all of them.
// Kept in the database (see db.ts), a row for each.
import { randomBytes } from 'node:crypto';
import type { Memory, MemoryLayer } from '../../protocol.ts';
import { type Db, transaction } from './db.ts';

export const LIMITS = { title: 120, body: 8000, perScope: 200 };
const LAYERS: MemoryLayer[] = ['node', 'project', 'agent'];

/** What a person or an agent is saving. `scope` is a project's id or an agent's, by layer. */
export type MemoryInput = { layer: unknown; scope?: unknown; title: unknown; body: unknown };
/** Who is saving it: the person, or an agent, whose project is `projectId`. */
export type Writer = { by: 'you' } | { by: 'agent'; agentId: string; projectId: string };

type Row = { id: string; layer: string; scope: string | null; title: string; body: string; by: string; author: string | null; created: number; updated: number; pending: number };

const toMemory = (r: Row): Memory => ({
  id: r.id,
  layer: r.layer as MemoryLayer,
  ...(r.scope ? { scope: r.scope } : null),
  title: r.title,
  body: r.body,
  by: r.by as 'you' | 'agent',
  ...(r.author ? { author: r.author } : null),
  created: r.created,
  updated: r.updated,
  ...(r.pending ? { pending: true } : null),
});

export function openMemories(db: Db) {
  const find = (id: unknown): Memory | undefined => {
    const row = typeof id === 'string' ? (db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Row | undefined) : undefined;
    return row && toMemory(row);
  };
  const inScope = (layer: string, scope: string | undefined) => (db.prepare('SELECT count(*) AS n FROM memories WHERE layer = ? AND scope IS ?').get(layer, scope ?? null) as { n: number }).n;

  return {
    list: (): Memory[] => (db.prepare('SELECT * FROM memories ORDER BY created, rowid').all() as Row[]).map(toMemory),
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
      return transaction(db, () => {
        const was = id === undefined ? undefined : find(id);
        if (id !== undefined && !was) throw new Error('That memory is not there any more.');
        // An agent may only change what an agent of its own wrote, or it could rewrite your notes.
        if (was && writer.by === 'agent' && !(was.by === 'agent' && was.author === writer.agentId)) throw new Error('That memory is not yours to change.');
        const moved = !was || was.layer !== layer || was.scope !== scope;
        if (moved && inScope(layer, scope as string | undefined) >= LIMITS.perScope) throw new Error(`That is as many memories as one place keeps (${LIMITS.perScope}). Delete some first.`);
        const made = was?.id ?? randomBytes(4).toString('hex');
        const now = Date.now();
        const author = was?.author ?? (writer.by === 'agent' ? writer.agentId : undefined);
        // What an agent proposes for the whole Toto waits for you; anything you save is as good as accepted.
        const pending = writer.by === 'agent' && layer === 'node' ? 1 : 0;
        if (was)
          db.prepare('UPDATE memories SET layer = ?, scope = ?, title = ?, body = ?, pending = ?, updated = ? WHERE id = ?').run(layer, (scope as string | undefined) ?? null, title.trim(), body.trim(), pending, now, was.id);
        else
          db.prepare('INSERT INTO memories (id, layer, scope, title, body, by, author, created, updated, pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            made, layer, (scope as string | undefined) ?? null, title.trim(), body.trim(), writer.by, author ?? null, now, now, pending,
          );
        return find(made)!;
      });
    },

    /** Takes an agent's suggestion as it is. */
    accept(id: unknown): boolean {
      return typeof id === 'string' && Number(db.prepare('UPDATE memories SET pending = 0 WHERE id = ? AND pending = 1').run(id).changes) > 0;
    },

    /** Deletes one; an agent may only delete what it wrote itself. */
    remove(id: unknown, writer: Writer): boolean {
      const m = find(id);
      if (!m) return false;
      if (writer.by === 'agent' && !(m.by === 'agent' && m.author === writer.agentId)) throw new Error('That memory is not yours to delete.');
      db.prepare('DELETE FROM memories WHERE id = ?').run(m.id);
      return true;
    },

    /** Forgets everything kept for an agent or a project that is gone. */
    forget(scopes: string[]) {
      if (scopes.length) db.prepare(`DELETE FROM memories WHERE scope IN (${scopes.map(() => '?').join(',')})`).run(...scopes);
    },

    /** What applies to an agent: the whole Toto's (once accepted), its project's, and its own. */
    forAgent(agentId: string, projectId: string): Memory[] {
      return (
        db.prepare("SELECT * FROM memories WHERE pending = 0 AND (layer = 'node' OR (layer = 'project' AND scope = ?) OR (layer = 'agent' AND scope = ?)) ORDER BY created, rowid").all(projectId, agentId) as Row[]
      ).map(toMemory);
    },
  };
}
