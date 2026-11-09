// Which agents may talk to each other, and what they have asked of one another. Agents are kept apart on
// purpose: each project has its own user, and an agent can reach nothing of another's. Talking across that
// is something the person allows, one pair at a time, as a link with a level: `ask` (they may ask each other
// questions) or `work` (and may ask each other to do something). Everything else here is a limit, so that
// two agents cannot run each other, or the person's usage, away.
import { randomBytes } from 'node:crypto';
import type { AgentLink } from '../../protocol.ts';
import { type Db } from './db.ts';

export type Level = 'ask' | 'work';
export type Request = { id: string; from: string; to: string; kind: 'ask' | 'work'; text: string; taskId?: string; state: 'open' | 'answered' | 'done' | 'expired'; created: number; answered?: number };

type RequestRow = { id: string; from_agent: string; to_agent: string; kind: 'ask' | 'work'; text: string; task_id: string | null; state: Request['state']; created: number; answered: number | null };

/** The limits. A request is a message to a colleague, not a way to start a conversation that runs by itself. */
export const LIMITS = {
  /** Characters in one message. */
  text: 4000,
  /** How many an agent may send to one other in an hour. */
  perHour: 20,
  /** How many an agent may have waiting on answers, in all. */
  outstanding: 5,
  /** How many may be waiting on one agent. */
  waitingOn: 10,
  /** How long a request is open before it is let go. */
  lifetime: 24 * 3600_000,
};

const asRequest = (r: RequestRow): Request => ({ id: r.id, from: r.from_agent, to: r.to_agent, kind: r.kind, text: r.text, ...(r.task_id ? { taskId: r.task_id } : null), state: r.state, created: r.created, ...(r.answered ? { answered: r.answered } : null) });

export function openTalk(db: Db, now: () => number = Date.now) {
  const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
  const expire = () => db.prepare("UPDATE agent_requests SET state = 'expired' WHERE state = 'open' AND created < ?").run(now() - LIMITS.lifetime);
  const count = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;

  return {
    /** Every link, as the phone sees them. */
    links(): AgentLink[] {
      return (db.prepare('SELECT a, b, level FROM agent_links ORDER BY created').all() as { a: string; b: string; level: Level }[]).map(({ a, b, level }) => ({ a, b, level }));
    },
    /** What two agents may do with each other, if they are linked. */
    level(x: string, y: string): Level | undefined {
      const [a, b] = pair(x, y);
      return (db.prepare('SELECT level FROM agent_links WHERE a = ? AND b = ?').get(a, b) as { level: Level } | undefined)?.level;
    },
    /** The agents linked to this one, and at what level. */
    linked(id: string): { agentId: string; level: Level }[] {
      return (db.prepare('SELECT a, b, level FROM agent_links WHERE a = ? OR b = ?').all(id, id) as { a: string; b: string; level: Level }[]).map((l) => ({ agentId: l.a === id ? l.b : l.a, level: l.level }));
    },
    /** Links two agents at a level, or unlinks them. */
    setLink(x: string, y: string, level: Level | 'none') {
      if (x === y) throw new Error('An agent cannot be linked to itself.');
      const [a, b] = pair(x, y);
      if (level === 'none') db.prepare('DELETE FROM agent_links WHERE a = ? AND b = ?').run(a, b);
      else if (level === 'ask' || level === 'work') db.prepare('INSERT INTO agent_links (a, b, level, created) VALUES (?, ?, ?, ?) ON CONFLICT (a, b) DO UPDATE SET level = excluded.level').run(a, b, level, now());
      else throw new Error('A link lets agents ask each other, or ask and give each other work.');
    },
    /** Forgets everything about an agent that is gone. */
    dropAgent(id: string) {
      db.prepare('DELETE FROM agent_links WHERE a = ? OR b = ?').run(id, id);
      db.prepare('DELETE FROM agent_requests WHERE from_agent = ? OR to_agent = ?').run(id, id);
    },

    /**
     * Records a request from one agent to another, or throws, in a sentence for the agent, why it may not.
     * `name` is how the agent that is asked is called, for those sentences.
     */
    open(input: { from: string; to: string; kind: 'ask' | 'work'; text: string; taskId?: string }, name = 'that agent'): Request {
      const text = input.text.trim();
      if (!text) throw new Error('Say what you want to ask.');
      if (text.length > LIMITS.text) throw new Error(`That is too long for a message between agents (${LIMITS.text} characters). Say it more briefly, or put the detail in a file and say where it is.`);
      const level = this.level(input.from, input.to);
      if (!level) throw new Error(`You are not connected to ${name}. Only the person can connect agents, from the app.`);
      if (input.kind === 'work' && level !== 'work') throw new Error(`You may ask ${name} questions but not to do work: the person connected you for that only. Ask them, or raise a task for the person.`);
      expire();
      // They are waiting on you: answering them comes first, and a question back would only make two agents wait on each other.
      if (count("SELECT count(*) AS n FROM agent_requests WHERE from_agent = ? AND to_agent = ? AND state = 'open'", input.to, input.from))
        throw new Error(`${name} is waiting for an answer from you. Reply to them (reply_to_agent) before asking anything.`);
      if (count("SELECT count(*) AS n FROM agent_requests WHERE from_agent = ? AND state = 'open'", input.from) >= LIMITS.outstanding)
        throw new Error(`You already have ${LIMITS.outstanding} requests waiting on answers. Carry on with what you can do, and wait for them.`);
      if (count("SELECT count(*) AS n FROM agent_requests WHERE to_agent = ? AND state = 'open'", input.to) >= LIMITS.waitingOn) throw new Error(`${name} already has as many requests waiting as it should: ${LIMITS.waitingOn}. Try again later.`);
      if (count('SELECT count(*) AS n FROM agent_requests WHERE from_agent = ? AND to_agent = ? AND created > ?', input.from, input.to, now() - 3600_000) >= LIMITS.perHour)
        throw new Error(`You have sent ${name} ${LIMITS.perHour} requests in the last hour. Wait before sending more, or ask the person.`);
      const request: Request = { id: `req_${randomBytes(4).toString('hex')}`, from: input.from, to: input.to, kind: input.kind, text, ...(input.taskId ? { taskId: input.taskId } : null), state: 'open', created: now() };
      db.prepare('INSERT INTO agent_requests (id, from_agent, to_agent, kind, text, task_id, state, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(request.id, request.from, request.to, request.kind, request.text, request.taskId ?? null, 'open', request.created);
      return request;
    },
    /** Says which task a request was made for, once it exists. */
    attachTask(id: string, taskId: string) {
      db.prepare('UPDATE agent_requests SET task_id = ? WHERE id = ?').run(taskId, id);
    },
    get(id: string): Request | undefined {
      const row = db.prepare('SELECT * FROM agent_requests WHERE id = ?').get(id) as RequestRow | undefined;
      return row && asRequest(row);
    },
    /** The open request for a task someone was asked to do, if there is one. */
    forTask(taskId: string): Request | undefined {
      const row = db.prepare("SELECT * FROM agent_requests WHERE task_id = ? AND state = 'open'").get(taskId) as RequestRow | undefined;
      return row && asRequest(row);
    },
    /** The requests waiting on an agent to answer. */
    waitingOn(id: string): Request[] {
      expire();
      return (db.prepare("SELECT * FROM agent_requests WHERE to_agent = ? AND state = 'open' ORDER BY created").all(id) as RequestRow[]).map(asRequest);
    },
    /** Closes a request: answered, or (for work) done. Only the agent it was made to may answer it. */
    close(id: string, by: string, state: 'answered' | 'done'): Request {
      expire();
      const request = this.get(id);
      if (!request || request.to !== by) throw new Error('There is no such request waiting on you.');
      if (request.state !== 'open') throw new Error('That request is already answered.');
      db.prepare('UPDATE agent_requests SET state = ?, answered = ? WHERE id = ?').run(state, now(), id);
      return { ...request, state, answered: now() };
    },
  };
}
