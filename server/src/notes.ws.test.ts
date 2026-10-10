import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { apiToken } from './agentapi.ts';
import { startServer } from './testserver.ts';

// A real server and the stand-in for Claude: memories and tasks from a phone's side and an agent's.
const fake = fileURLToPath(new URL('./fake-claude.mjs', import.meta.url));
chmodSync(fake, 0o755);
const origin = mkdtempSync(join(tmpdir(), 'toto-origin-'));
execFileSync('git', ['init', '-q', origin]);
execFileSync('git', ['-C', origin, '-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'start']);
const apiPort = 40000 + Math.floor(Math.random() * 20000);
const { dial } = startServer({ TOTO_CLAUDE_BIN: fake, TOTO_API_PORT: String(apiPort), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${origin}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://example.test/origin.git' });

const until = async (what: string, ok: () => boolean) => {
  for (let tries = 0; tries < 200 && !ok(); tries++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(ok(), what);
};

test('memories and tasks, from the phone and from an agent', { timeout: 90_000 }, async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  await phone.next('state');
  const last = (type: string) => phone.said.findLast((m) => m.type === type);
  const state = async (has: (s: any) => boolean) => {
    await until('the state to have it', () => !!phone.said.findLast((m) => m.type === 'state' && has(m)));
    return phone.said.findLast((m) => m.type === 'state' && has(m));
  };
  await until('the lists to arrive', () => !!last('memories') && !!last('tasks'));
  assert.deepEqual([last('memories').items, last('tasks').items], [[], []]);

  phone.send({ type: 'create_project', name: 'p', repo: 'https://example.test/origin.git' });
  const project = (await state((s) => s.projects.length)).projects[0];
  phone.send({ type: 'create_agent', projectId: project.id, name: 'a', harness: 'claude', mode: 'ask', worktree: false });
  const agent = (await state((s) => s.agents.length)).agents[0];
  const itemsOf = (type: string) => last(type).items;

  // Memories: made, moved between layers by saving, accepted, deleted.
  phone.send({ type: 'memory_save', layer: 'agent', scope: agent.id, title: 'Tests', body: 'npm test' });
  await until('the memory', () => itemsOf('memories').length === 1);
  const memory = itemsOf('memories')[0];
  phone.send({ type: 'memory_save', id: memory.id, layer: 'project', scope: project.id, title: 'Tests', body: 'npm test' });
  await until('the memory to move', () => itemsOf('memories')[0].layer === 'project');
  assert.equal(itemsOf('memories').length, 1);
  phone.send({ type: 'memory_save', layer: 'project', scope: 'nowhere', title: 'x', body: 'y' });
  assert.match((await phone.next('failed')).message, /not there any more/);

  // An agent's own call, with its project's token: a suggestion for the whole Toto waits to be accepted.
  const post = (route: string, body: object) => fetch(`http://127.0.0.1:${apiPort}/api/${route}`, { method: 'POST', headers: { authorization: `Bearer ${apiToken('owner-token', project.id)}`, 'x-toto-agent': agent.id }, body: JSON.stringify(body) }).then((r) => r.json());
  assert.match((await post('remember', { title: 'Everywhere', body: 'UTC', layer: 'node' })).text, /waits for the person/);
  await until('the suggestion to reach the phone', () => itemsOf('memories').some((m: any) => m.pending));
  const suggestion = itemsOf('memories').find((m: any) => m.pending);
  phone.send({ type: 'memory_accept', id: suggestion.id });
  await until('it to be accepted', () => !itemsOf('memories').find((m: any) => m.id === suggestion.id).pending);

  // Tasks: one raised by the agent with a file from you attached, fetched back, pushed, and deleted.
  assert.match((await post('raise_task', { title: 'Look at CI', description: 'Flaky.' })).text, /Raised task/);
  await until('the task', () => itemsOf('tasks').length === 1);
  const task = itemsOf('tasks')[0];
  assert.deepEqual([task.by, task.agentId, task.projectId, task.state], ['agent', agent.id, project.id, 'open']);
  const upload = 'abcdef0123456789';
  phone.send({ type: 'upload', id: upload, at: 0, of: 1, data: Buffer.from('some notes').toString('base64') });
  phone.send({ type: 'task_attach', id: task.id, upload, name: 'notes.txt' });
  await until('the file', () => itemsOf('tasks')[0].files.length === 1);
  const file = itemsOf('tasks')[0].files[0];
  phone.send({ type: 'task_file', taskId: task.id, id: file.id });
  assert.equal(Buffer.from((await phone.next('file')).data, 'base64').toString(), 'some notes');

  phone.send({ type: 'task_push', id: task.id, agentId: agent.id });
  await until('the agent to be told', () => phone.said.some((m) => m.type === 'event' && m.event.type === 'user' && /A task from your list: Look at CI/.test(m.event.text)));
  assert.equal(itemsOf('tasks')[0].state, 'working');
  assert.match((await post('list_tasks', {})).text, /Look at CI/);
  assert.match((await post('done_task', { id: task.id })).text, /done/);
  await until('it to be done', () => itemsOf('tasks')[0].state === 'done');

  // A task for a project that is not there, or an agent that works elsewhere, is refused.
  phone.send({ type: 'task_save', title: 't', description: '', projectId: 'nowhere', state: 'open' });
  assert.match((await phone.next('failed')).message, /not there any more/);
  phone.send({ type: 'task_save', id: task.id, title: 'Look at CI', description: 'Flaky.', projectId: project.id, agentId: 'ffffffff', state: 'open' });
  assert.match((await phone.next('failed')).message, /does not work in that project/);
  phone.send({ type: 'task_delete', id: task.id });
  await until('the task to go', () => itemsOf('tasks').length === 0);

  // Deleting the agent takes its own memories and leaves a task nobody is on.
  phone.send({ type: 'task_save', title: 'Orphan', description: '', projectId: project.id, agentId: agent.id, state: 'open' });
  phone.send({ type: 'memory_save', layer: 'agent', scope: agent.id, title: 'Mine', body: 'x' });
  await until('both', () => itemsOf('tasks').length === 1 && itemsOf('memories').some((m: any) => m.title === 'Mine'));
  phone.send({ type: 'delete_agent', agentId: agent.id });
  await until('the agent\'s memory to go', () => !itemsOf('memories').some((m: any) => m.title === 'Mine'));
  assert.equal(itemsOf('tasks')[0].agentId, undefined);
  // And its project's token no longer opens anything for it.
  assert.equal((await fetch(`http://127.0.0.1:${apiPort}/api/index`, { method: 'POST', headers: { authorization: `Bearer ${apiToken('owner-token', project.id)}`, 'x-toto-agent': agent.id } })).status, 401);
});
