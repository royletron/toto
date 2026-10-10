// What an agent's memory and task tools talk to. Agents run as users of their own, which cannot
// write to this server's files, so the tools (see plugins/node) call this small HTTP server on the
// loopback address, which project users may reach, and which does the writing.
//
// Who is asking comes from a token each project is given (in its private ~/.toto-env), and which of
// the project's agents from a header. The token is derived from the device's own, so nothing about
// it is stored, and a project's token opens nothing outside the project: its own tasks, its own
// agents' memories, its project's, and the whole Toto's.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { Task } from '../../protocol.ts';
import { MAX_FILE } from './images.ts';
import type { openMemories } from './memory.ts';
import type { openTasks } from './tasks.ts';

export type Who = { agentId: string; projectId: string };

/** The token a project's agents call with. */
export const apiToken = (deviceToken: string, projectId: string) => createHmac('sha256', deviceToken).update(`agent-api\0${projectId}`).digest('hex').slice(0, 32);

export type Deps = {
  memories: ReturnType<typeof openMemories>;
  tasks: ReturnType<typeof openTasks>;
  /** Which agent is calling, if the token and agent go together. */
  who: (token: string | undefined, agentId: string | undefined) => Who | undefined;
  /** Reads files from an agent's project, as the project's user. */
  readFiles: (who: Who, paths: string[]) => Promise<{ path: string; bytes?: Buffer }[]>;
  /** Something changed that phones should hear about. */
  changed: (what: 'memories' | 'tasks') => void;
};

const text = (t: string) => ({ text: t });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** What one tool call does. Throws a plain sentence for what cannot be done. */
export async function call(who: Who, route: string, args: any, deps: Deps): Promise<object> {
  const { memories, tasks } = deps;
  const mine = { by: 'agent' as const, agentId: who.agentId, projectId: who.projectId };
  switch (route) {
    case 'index': {
      const known = memories.forAgent(who.agentId, who.projectId);
      const open = tasks.list().filter((t) => t.projectId === who.projectId && t.state !== 'done').length;
      return text(
        [
          'This Toto keeps notes for its agents, and a list of things to do for later.',
          known.length ? 'What it remembers that applies to you (titles only; `recall` gives the whole text):' : 'It has nothing remembered for you yet.',
          ...known.slice(0, 40).map((m) => `- [${m.layer}] ${m.id}: ${m.title}`),
          known.length > 40 ? `- …and ${known.length - 40} more: \`recall\` with a few words to search them.` : '',
          'Use `remember` for what is worth knowing next time: how something is done here, what to do or avoid. Use `raise_task` to put something on the list for later when you should not do it now.',
          open ? `There ${open === 1 ? 'is 1 task' : `are ${open} tasks`} open in this project (\`list_tasks\`).` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    case 'recall': {
      const known = memories.forAgent(who.agentId, who.projectId);
      const query = typeof args?.query === 'string' ? args.query.toLowerCase().trim() : '';
      const found = typeof args?.id === 'string' ? known.filter((m) => m.id === args.id) : known.filter((m) => !query || `${m.title}\n${m.body}`.toLowerCase().includes(query));
      if (!found.length) return text('Nothing remembered matches that.');
      return text(found.slice(0, 8).map((m) => `[${m.layer}] ${m.id}: ${m.title}\n${clip(m.body, 2000)}`).join('\n\n'));
    }
    case 'remember': {
      const layer = args?.layer ?? 'agent';
      const m = memories.save({ layer, title: args?.title, body: args?.body }, mine);
      deps.changed('memories');
      return text(m.pending ? `Suggested ${m.id} for the whole Toto. It waits for the person to accept it.` : `Remembered as ${m.id} (${m.layer}).`);
    }
    case 'forget': {
      if (!memories.remove(args?.id, mine)) throw new Error('There is no such memory.');
      deps.changed('memories');
      return text('Forgotten.');
    }
    case 'raise_task': {
      const task = tasks.create({ title: args?.title, description: args?.description ?? '', projectId: who.projectId, agentId: who.agentId }, 'agent');
      const missed: string[] = [];
      const paths = Array.isArray(args?.files) ? args.files.filter((p: unknown): p is string => typeof p === 'string').slice(0, 10) : [];
      for (const { path, bytes } of paths.length ? await deps.readFiles(who, paths) : []) {
        try {
          if (!bytes) throw new Error('unreadable');
          tasks.addFile(task.id, bytes, path);
        } catch {
          missed.push(path);
        }
      }
      deps.changed('tasks');
      return text(`Raised task ${task.id}.${missed.length ? ` These files could not be attached (missing, empty, or over ${MAX_FILE / 1024 / 1024} MB): ${missed.join(', ')}.` : ''}`);
    }
    case 'list_tasks': {
      const open = tasks.list().filter((t) => t.projectId === who.projectId && t.state !== 'done');
      return text(open.length ? open.slice(0, 50).map((t: Task) => `${t.id} [${t.state}] ${t.title}${t.files.length ? ` (${t.files.length} file${t.files.length === 1 ? '' : 's'})` : ''}${t.description ? `\n  ${clip(t.description, 300).replaceAll('\n', '\n  ')}` : ''}`).join('\n') : 'No open tasks in this project.');
    }
    case 'done_task': {
      const task = tasks.get(args?.id);
      if (!task || task.projectId !== who.projectId) throw new Error('There is no such task in this project.');
      tasks.setState(task.id, 'done');
      deps.changed('tasks');
      return text('Marked done.');
    }
    case 'task_file': {
      const task = tasks.get(args?.task);
      if (!task || task.projectId !== who.projectId) throw new Error('There is no such task in this project.');
      const file = task.files.find((f) => f.id === args?.file || f.name === args?.file);
      const bytes = file && tasks.readFile(task.id, file.id);
      if (!file || !bytes) throw new Error('That task has no such file.');
      return { name: file.name, base64: bytes.toString('base64') };
    }
    default:
      throw new Error('Unknown request.');
  }
}

/** Listens on the loopback address only. Resolves to the server, or nothing if the port is taken. */
export function startAgentApi(port: number, deps: Deps): Promise<Server | undefined> {
  const server = createServer((req, res) => {
    const reply = (status: number, body: object) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
    const who = req.method === 'POST' ? deps.who(bearer, String(req.headers['x-toto-agent'] ?? '')) : undefined;
    if (!who) return reply(401, { error: 'Not allowed.' });
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 512 * 1024) return void req.destroy();
      chunks.push(c);
    });
    req.on('end', async () => {
      try {
        const args = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        reply(200, await call(who, (req.url ?? '').replace(/^\/api\//, ''), args, deps));
      } catch (err) {
        reply(400, { error: err instanceof Error ? err.message : 'That did not work.' });
      }
    });
  });
  return new Promise((resolve) => {
    server.once('error', (err) => {
      console.error(`memory and tasks are not available for agents: ${err.message}`);
      resolve(undefined);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Whether a presented token is the one for a project, without giving away how much of it matched. */
export function sameToken(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
