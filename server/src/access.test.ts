import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

// A real server with the stand-in for Claude, and a local repository standing in for a remote one (see queue.test.ts).
const fake = fileURLToPath(new URL('./fake-claude.mjs', import.meta.url));
chmodSync(fake, 0o755);
const origin = mkdtempSync(join(tmpdir(), 'toto-origin-'));
execFileSync('git', ['init', '-q', origin]);
execFileSync('git', ['-C', origin, '-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'start']);
const { dial, soon } = startServer({ TOTO_CLAUDE_BIN: fake, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${origin}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://example.test/origin.git' });

/** The latest message of a type that has what is asked for, whenever it arrives. */
async function latest(line: { said: any[] }, type: string, has: (m: any) => boolean = () => true) {
  for (let tries = 0; tries < 200; tries++) {
    const found = line.said.findLast((m) => m.type === type && has(m));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no ${type} like that came: ${JSON.stringify(line.said.filter((m) => m.type === 'failed'))}`);
}

test('a phone shared in sees only its projects, and a paused one changes nothing', { timeout: 60_000 }, async () => {
  const owner = await dial('owner-token');
  owner.send({ type: 'sync' });
  for (const name of ['mine', 'theirs']) owner.send({ type: 'create_project', name, repo: 'https://example.test/origin.git' });
  const projects = (await latest(owner, 'state', (s) => s.projects.length === 2)).projects;
  const [mine, theirs] = ['mine', 'theirs'].map((n) => projects.find((p: any) => p.name === n).id);
  for (const projectId of [mine, theirs]) owner.send({ type: 'create_agent', projectId, name: 'a', harness: 'claude', mode: 'ask', worktree: false });
  const agents = (await latest(owner, 'state', (s) => s.agents.length === 2)).agents;
  const [inMine, inTheirs] = [mine, theirs].map((id) => agents.find((a: any) => a.projectId === id).id);
  owner.send({ type: 'task_save', title: 'secret task', description: '', projectId: theirs, state: 'open' });
  await latest(owner, 'tasks', (m) => m.items.length === 1);

  owner.send({ type: 'share', name: 'Kid' });
  const invite = await owner.next('invite');
  const joining = await dial(invite.secret, invite.phoneId);
  joining.send({ type: 'join' });
  const { secret } = await joining.next('joined');
  owner.send({ type: 'set_access', phoneId: invite.phoneId, projects: [mine], paused: false });
  assert.deepEqual((await latest(owner, 'state', (s) => s.phones[0]?.projects)).phones[0].projects, [mine]);

  // Limited: only its project and that project's agent, and nothing of the other one's, however it arrives.
  const kid = await dial(secret, invite.phoneId);
  kid.send({ type: 'sync' });
  await kid.next('synced');
  const seen = await latest(kid, 'state');
  assert.deepEqual([seen.projects.map((p: any) => p.id), seen.agents.map((a: any) => a.id), seen.limited, seen.paused], [[mine], [inMine], true, undefined]);
  assert.deepEqual((await latest(kid, 'tasks')).items, []);
  owner.send({ type: 'prompt', agentId: inTheirs, text: 'hidden words' });
  owner.send({ type: 'prompt', agentId: inMine, text: 'shared words' });
  await latest(kid, 'event', (m) => m.event.type === 'user' && m.event.text === 'shared words');
  await latest(owner, 'event', (m) => m.agentId === inTheirs && m.event.type === 'approval_request');
  assert.ok(!JSON.stringify(kid.said).includes(inTheirs) && !JSON.stringify(kid.said).includes('hidden words'), 'nothing of the other project reaches it');

  // It may work in its project, but not reach into the other one, nor change the whole Toto.
  kid.send({ type: 'prompt', agentId: inTheirs, text: 'let me in' });
  assert.match((await kid.next('failed')).message, /not shared with this phone/);
  // Nor read the other one's earlier history; its own it can.
  kid.send({ type: 'older', agentId: inTheirs, before: 5 });
  assert.match((await kid.next('failed')).message, /not shared with this phone/);
  kid.send({ type: 'older', agentId: inMine, before: 5 });
  assert.equal((await kid.next('older')).agentId, inMine);
  kid.send({ type: 'create_project', name: 'more', repo: 'https://example.test/origin.git' });
  assert.match((await kid.next('failed')).message, /every project/);
  kid.send({ type: 'memory_save', layer: 'node', title: 'for everyone', body: 'x' });
  assert.match((await kid.next('failed')).message, /every project/);
  kid.send({ type: 'interrupt', agentId: inMine });
  await latest(owner, 'event', (m) => m.agentId === inMine && m.event.type === 'done' && m.event.stopped);

  // Paused: its line is started again, and it can still read but not change anything.
  owner.send({ type: 'set_access', phoneId: invite.phoneId, projects: [mine], paused: true });
  assert.equal(await soon(kid.ended), 'closed');
  const paused = await dial(secret, invite.phoneId);
  paused.send({ type: 'sync' });
  await paused.next('synced');
  assert.equal((await latest(paused, 'state')).paused, true);
  assert.ok(paused.said.some((m) => m.type === 'event' && m.event.text === 'shared words'), 'it still reads the conversation');
  paused.send({ type: 'prompt', agentId: inMine, text: 'hello' });
  assert.match((await paused.next('failed')).message, /paused/);
  paused.send({ type: 'create_agent', projectId: mine, name: 'b', harness: 'claude', mode: 'ask', worktree: false });
  assert.match((await paused.next('failed')).message, /paused/);
  paused.send({ type: 'term_open', projectId: mine, terminalId: 'new', cols: 80, rows: 24 });
  assert.match((await paused.next('failed')).message, /paused/);

  // Every project again, new ones included, and no longer paused.
  owner.send({ type: 'set_access', phoneId: invite.phoneId, paused: false });
  assert.equal(await soon(paused.ended), 'closed');
  const back = await dial(secret, invite.phoneId);
  back.send({ type: 'sync' });
  await back.next('synced');
  const all = await latest(back, 'state');
  assert.deepEqual([all.projects.length, all.limited, all.paused], [2, undefined, undefined]);
  assert.equal((await latest(back, 'tasks')).items.length, 1);
});
