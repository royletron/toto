import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { apiToken } from './agentapi.ts';
import { startServer } from './testserver.ts';

// Real server, the stand-in for Claude (as in queue.test.ts), and its tool API on a port of its own.
const fake = fileURLToPath(new URL('./fake-claude.mjs', import.meta.url));
chmodSync(fake, 0o755);
const origin = mkdtempSync(join(tmpdir(), 'toto-origin-'));
execFileSync('git', ['init', '-q', origin]);
execFileSync('git', ['-C', origin, '-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'start']);
const apiPort = 41000 + Math.floor(Math.random() * 2000);
const { dial } = startServer({ TOTO_CLAUDE_BIN: fake, TOTO_API_PORT: String(apiPort), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${origin}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://example.test/origin.git' });

async function eventually(what: string, ok: () => boolean) {
  for (let tries = 0; tries < 150 && !ok(); tries++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(ok(), what);
}

test('connected agents ask and answer each other through the Toto, and the person made the connection', { timeout: 90_000 }, async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  await phone.next('state');
  const state = async (has: (s: any) => boolean) => {
    for (let tries = 0; tries < 150; tries++) {
      const found = phone.said.findLast((m) => m.type === 'state' && has(m));
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('the state never had it');
  };
  for (const name of ['shop', 'docs']) phone.send({ type: 'create_project', name, repo: 'https://example.test/origin.git' });
  const projects = (await state((s) => s.projects.length === 2)).projects;
  const [shop, docs] = ['shop', 'docs'].map((n) => projects.find((p: any) => p.name === n));
  phone.send({ type: 'create_agent', projectId: shop.id, name: 'Alice', harness: 'claude', mode: 'auto', worktree: false });
  phone.send({ type: 'create_agent', projectId: docs.id, name: 'Bob', harness: 'claude', mode: 'ask', worktree: false });
  const agents = (await state((s) => s.agents.length === 2)).agents;
  const [alice, bob] = ['Alice', 'Bob'].map((n) => agents.find((a: any) => a.name === n));
  /** A tool call as the agent's tools make it: its project's token, and which agent it is. */
  const call = async (agent: any, route: string, args: object) => {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/${route}`, { method: 'POST', headers: { authorization: `Bearer ${apiToken('owner-token', agent.projectId)}`, 'x-toto-agent': agent.id, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    return { ok: res.ok, body: (await res.json()) as any };
  };

  // Not connected: refused, and nothing reaches Bob.
  const refused = await call(alice, 'ask_agent', { agent: 'Bob', question: 'hello?' });
  assert.equal(refused.ok, false);
  assert.match(refused.body.error, /not connected/);

  // The person connects them (and only the person can).
  const stranger = await dial('owner-token');
  phone.send({ type: 'set_link', a: alice.id, b: bob.id, level: 'ask' });
  const linked = await state((s) => s.links?.length === 1);
  assert.deepEqual(linked.links, [{ a: [alice.id, bob.id].sort()[0], b: [alice.id, bob.id].sort()[1], level: 'ask' }]);
  phone.send({ type: 'set_link', a: alice.id, b: 'nobody', level: 'ask' });
  assert.match((await phone.next('failed')).message, /not there any more/);
  void stranger;

  // Alice asks Bob. Bob's conversation gets it, marked as from Alice and not the person.
  const asked = await call(alice, 'ask_agent', { agent: 'Bob', question: 'What does the docs build output?' });
  assert.equal(asked.ok, true, JSON.stringify(asked.body));
  const request = /req_[0-9a-f]+/.exec(asked.body.text)![0];
  await eventually("Bob is told, as from Alice", () => phone.said.some((m) => m.type === 'event' && m.agentId === bob.id && m.event.type === 'user' && m.event.from?.agentId === alice.id && /What does the docs build output\?/.test(m.event.text)));
  const said = phone.said.find((m) => m.type === 'event' && m.agentId === bob.id && m.event.type === 'user' && m.event.from)!.event;
  assert.deepEqual(said.from, { agentId: alice.id, name: 'Alice' });
  assert.match(said.text, new RegExp(`reply_to_agent, request ${request}`));

  // Bob answers, and Alice hears it, as from Bob. (Alice is mid-turn or idle: either way it reaches her.)
  assert.equal((await call(bob, 'reply_to_agent', { request, answer: 'A folder called dist.' })).ok, true);
  await eventually('Alice is told the answer', () => phone.said.some((m) => m.type === 'event' && m.agentId === alice.id && m.event.type === 'user' && m.event.from?.agentId === bob.id) || phone.said.some((m) => m.type === 'queue' && m.agentId === alice.id && m.items.some((i: any) => /A folder called dist\./.test(i.text))));

  // Disconnected, they cannot; and deleting an agent takes its links with it.
  phone.send({ type: 'set_link', a: bob.id, b: alice.id, level: 'none' });
  await eventually('no links', () => !phone.said.findLast((m) => m.type === 'state')?.links);
  assert.equal((await call(alice, 'ask_agent', { agent: 'Bob', question: 'again?' })).ok, false);
  phone.send({ type: 'set_link', a: alice.id, b: bob.id, level: 'work' });
  await state((s) => s.links?.length === 1);
  phone.send({ type: 'delete_agent', agentId: bob.id });
  await eventually('the link went with the agent', () => !phone.said.findLast((m) => m.type === 'state')?.links);
});
