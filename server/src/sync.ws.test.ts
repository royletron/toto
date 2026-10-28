import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

// A real server with the stand-in for Claude, as in queue.test.ts, to make a history to sync.
const fake = fileURLToPath(new URL('./fake-claude.mjs', import.meta.url));
chmodSync(fake, 0o755);
const origin = mkdtempSync(join(tmpdir(), 'toto-origin-'));
execFileSync('git', ['init', '-q', origin]);
execFileSync('git', ['-C', origin, '-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'start']);
const { dial } = startServer({ TOTO_CLAUDE_BIN: fake, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${origin}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://example.test/origin.git' });

async function eventually(what: string, ok: () => boolean) {
  for (let tries = 0; tries < 100 && !ok(); tries++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(ok(), what);
}

test('a phone that holds the start of a history is sent only the rest, and told where it continues from', { timeout: 60_000 }, async () => {
  const first = await dial('owner-token');
  first.send({ type: 'sync' });
  await first.next('state');
  const state = async (has: (s: any) => boolean) => {
    for (let tries = 0; tries < 200; tries++) {
      const found = first.said.findLast((m) => m.type === 'state' && has(m));
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('the state never had it');
  };
  first.send({ type: 'create_project', name: 'p', repo: 'https://example.test/origin.git' });
  const project = (await state((s) => s.projects.length)).projects[0];
  first.send({ type: 'create_agent', projectId: project.id, name: 'a', harness: 'claude', mode: 'ask', worktree: false });
  const agent = (await state((s) => s.agents.length)).agents[0];
  first.send({ type: 'prompt', agentId: agent.id, text: 'hello' });
  const mine = () => first.said.filter((m) => m.type === 'event' && m.agentId === agent.id);
  await eventually('the agent has a few events', () => mine().length >= 3);
  const total = mine().length;

  /** A new phone's sync, and what it was sent for the agent. */
  const sync = async (have?: Record<string, number>, tail?: number) => {
    const phone = await dial('owner-token');
    phone.send({ type: 'sync', have, tail });
    await phone.next('synced');
    const history = phone.said.filter((m) => m.type === 'history' && m.agentId === agent.id);
    return { history, events: phone.said.filter((m) => m.type === 'event' && m.agentId === agent.id) };
  };

  const all = await sync();
  assert.deepEqual(all.history.map((h) => h.from), [0]);
  assert.equal(all.events.length, total);
  // Each says its place in the history.
  assert.deepEqual(all.events.map((m) => m.at), [...all.events.keys()]);
  const rest = await sync({ [agent.id]: 2 });
  assert.deepEqual(rest.history.map((h) => h.from), [2]);
  assert.deepEqual(rest.events.map((m) => m.event), all.events.slice(2).map((m) => m.event));
  // Holding all of it: nothing more to send, and it still says so.
  const none = await sync({ [agent.id]: total });
  assert.deepEqual([none.history.map((h) => h.from), none.events.length], [[total], 0]);
  // Counts that make no sense, or are about something else, start over.
  for (const have of [{ [agent.id]: total + 5 }, { [agent.id]: -1 }, { [agent.id]: 1.5 }, { [agent.id]: 'x' }, { other: 3 }] as any[]) assert.deepEqual((await sync(have)).history.map((h) => h.from), [0], JSON.stringify(have));

  // Holding nothing, only the last few are sent, with their places; holding some, the tail does not apply.
  const last = await sync(undefined, 2);
  assert.deepEqual([last.history.map((h) => h.from), last.events.map((m) => m.at)], [[total - 2], [total - 2, total - 1]]);
  assert.deepEqual((await sync({ [agent.id]: 2 }, 2)).history.map((h) => h.from), [2]);
  assert.deepEqual((await sync({ [agent.id]: total + 5 }, 2)).history.map((h) => h.from), [total - 2]);

  // The page before what it holds comes in one message, in order, ending where asked.
  const phone = await dial('owner-token');
  phone.send({ type: 'older', agentId: agent.id, before: total - 1 });
  const page = await phone.next('older');
  assert.deepEqual([page.agentId, page.from, page.events.length], [agent.id, 0, total - 1]);
  assert.deepEqual(page.events, all.events.slice(0, total - 1).map((m) => m.event));
  // Nothing before the start; and a place past the end is the end.
  phone.send({ type: 'older', agentId: agent.id, before: 0 });
  assert.deepEqual((await phone.next('older')).events, []);
  phone.send({ type: 'older', agentId: agent.id, before: total + 50 });
  assert.equal((await phone.next('older')).events.length, total);
});
