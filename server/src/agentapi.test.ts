import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { apiToken, call, sameToken, startAgentApi, type Deps, type Who } from './agentapi.ts';
import { openMemories } from './memory.ts';
import { openTasks } from './tasks.ts';

const root = mkdtempSync(join(tmpdir(), 'toto-api-'));
const memories = openMemories(join(root, 'm.json'));
const tasks = openTasks(join(root, 't.json'), join(root, 'task-files'));
const alice: Who = { agentId: 'a1', projectId: 'p1' };
const bob: Who = { agentId: 'b1', projectId: 'p2' };
const told: string[] = [];
const files: Record<string, Buffer> = { 'logs/ci.log': Buffer.from('boom') };
const deps: Deps = {
  memories,
  tasks,
  who: (token, agentId) => (sameToken(token, apiToken('device', 'p1')) && agentId === 'a1' ? alice : sameToken(token, apiToken('device', 'p2')) && agentId === 'b1' ? bob : undefined),
  readFiles: async (_who, paths) => paths.map((path) => ({ path, bytes: files[path] })),
  changed: (what) => void told.push(what),
};

test('a project has a token of its own, and only that one fits', () => {
  assert.notEqual(apiToken('device', 'p1'), apiToken('device', 'p2'));
  assert.notEqual(apiToken('device', 'p1'), apiToken('another', 'p1'));
  assert.equal(apiToken('device', 'p1').length, 32);
  assert.ok(sameToken(apiToken('device', 'p1'), apiToken('device', 'p1')));
  assert.ok(!sameToken(apiToken('device', 'p1'), apiToken('device', 'p2')) && !sameToken(undefined, 'x') && !sameToken('short', 'longer'));
});

test('an agent remembers, is shown what applies to it, and recalls it', async () => {
  const text = async (who: Who, route: string, args: object = {}) => ((await call(who, route, args, deps)) as { text: string }).text;
  assert.match(await text(alice, 'index'), /nothing remembered for you yet/);
  assert.match(await text(alice, 'remember', { title: 'Tests', body: 'Run npm test, not jest.' }), /Remembered as \w+ \(agent\)/);
  assert.match(await text(alice, 'remember', { title: 'House style', body: 'Plain verbs.', layer: 'project' }), /\(project\)/);
  assert.match(await text(alice, 'remember', { title: 'Everywhere', body: 'Use UTC.', layer: 'node' }), /waits for the person/);
  const index = await text(alice, 'index');
  assert.match(index, /\[agent\] \w+: Tests/);
  assert.match(index, /\[project\] \w+: House style/);
  assert.ok(!index.includes('Everywhere'), 'a suggestion for the whole Toto is not shown until accepted');
  // Another project's agent sees none of it, and what is for the whole Toto only once accepted.
  assert.match(await text(bob, 'index'), /nothing remembered/);
  memories.accept(memories.list().find((m) => m.title === 'Everywhere')!.id);
  assert.match(await text(bob, 'index'), /Everywhere/);
  assert.match(await text(alice, 'recall', { query: 'jest' }), /Run npm test, not jest/);
  assert.match(await text(bob, 'recall', { query: 'jest' }), /Nothing remembered matches/);
  const mine = memories.list().find((m) => m.title === 'Tests')!;
  assert.match(await text(alice, 'recall', { id: mine.id }), /Run npm test/);
  // Alice may forget her own, and not what Bob's side could not even see.
  await assert.rejects(call(bob, 'forget', { id: mine.id }, deps), /not yours|no such/);
  assert.match(await text(alice, 'forget', { id: mine.id }), /Forgotten/);
  assert.ok(told.includes('memories'));
});

test('an agent raises a task with a file, lists its project\'s, and marks one done', async () => {
  const text = async (who: Who, route: string, args: object = {}) => ((await call(who, route, args, deps)) as { text: string }).text;
  const raised = await text(alice, 'raise_task', { title: 'Fix CI', description: 'It fails at night.', files: ['logs/ci.log', 'missing.log'] });
  assert.match(raised, /Raised task \w+\./);
  assert.match(raised, /could not be attached.*missing\.log/);
  const task = tasks.list()[0];
  assert.deepEqual([task.projectId, task.agentId, task.by, task.files.map((f) => f.name)], ['p1', 'a1', 'agent', ['ci.log']]);
  assert.match(await text(alice, 'list_tasks'), /Fix CI.*\(1 file\)/s);
  assert.match(await text(bob, 'list_tasks'), /No open tasks/);
  const file = (await call(alice, 'task_file', { task: task.id, file: 'ci.log' }, deps)) as { name: string; base64: string };
  assert.deepEqual([file.name, Buffer.from(file.base64, 'base64').toString()], ['ci.log', 'boom']);
  await assert.rejects(call(bob, 'task_file', { task: task.id, file: 'ci.log' }, deps), /no such task/);
  await assert.rejects(call(bob, 'done_task', { id: task.id }, deps), /no such task/);
  assert.match(await text(alice, 'done_task', { id: task.id }), /done/);
  assert.match(await text(alice, 'list_tasks'), /No open tasks/);
  await assert.rejects(call(alice, 'raise_task', { title: '' }, deps), /title/);
  await assert.rejects(call(alice, 'nonsense', {}, deps), /Unknown/);
});

test('the server answers only a project\'s own token, and the tools reach it', async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = await startAgentApi(port, deps);
  assert.ok(server);
  after(() => server.close());
  const post = (route: string, headers: Record<string, string>, body: object = {}) => fetch(`http://127.0.0.1:${port}/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const auth = { authorization: `Bearer ${apiToken('device', 'p1')}`, 'x-toto-agent': 'a1' };
  assert.equal((await post('index', {})).status, 401);
  assert.equal((await post('index', { ...auth, 'x-toto-agent': 'b1' })).status, 401);
  assert.equal((await post('index', { authorization: `Bearer ${apiToken('device', 'p2')}`, 'x-toto-agent': 'a1' })).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/index`, { headers: auth })).status, 401);
  assert.equal((await post('index', auth)).status, 200);
  assert.equal((await post('remember', auth, { title: '', body: '' })).status, 400);

  // The tools themselves, over the same line a real agent uses.
  const env = { ...process.env, TOTO_API_URL: `http://127.0.0.1:${port}`, TOTO_API_TOKEN: apiToken('device', 'p1'), TOTO_AGENT_ID: 'a1' };
  const cwd = mkdtempSync(join(tmpdir(), 'toto-project-'));
  // Asynchronous: this process is also the server they talk to.
  const run = (script: string, input: string, where: { cwd?: string; env: NodeJS.ProcessEnv }) =>
    new Promise<{ status: number | null; stdout: string }>((done) => {
      const child = spawn('node', [new URL(`../plugins/node/${script}`, import.meta.url).pathname], where);
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.on('close', (status) => done({ status, stdout }));
      child.stdin.end(input);
    });
  const rpc = async (...msgs: object[]) => (await run('toto-node.mjs', msgs.map((m) => JSON.stringify(m) + '\n').join(''), { cwd, env })).stdout.trim().split('\n').map((l) => JSON.parse(l));
  const callTool = (id: number, name: string, args: object) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  const task = tasks.create({ title: 'With a file', description: '', projectId: 'p1', agentId: 'a1' }, 'you');
  tasks.addFile(task.id, Buffer.from('attached'), 'notes.txt');
  const [init, list, saved, listed, got, escaped] = await rpc(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    callTool(3, 'remember', { title: 'Via the tool', body: 'It works.' }),
    callTool(4, 'list_tasks', {}),
    callTool(5, 'get_task_file', { task: task.id, file: 'notes.txt', to: 'inbox/notes.txt' }),
    callTool(6, 'get_task_file', { task: task.id, file: 'notes.txt', to: '../outside.txt' }),
  );
  assert.equal(init.result.serverInfo.name, 'toto-node');
  assert.deepEqual(list.result.tools.map((t: any) => t.name), ['recall', 'remember', 'forget', 'raise_task', 'list_tasks', 'done_task', 'get_task_file']);
  assert.match(saved.result.content[0].text, /Remembered as/);
  assert.match(listed.result.content[0].text, /With a file/);
  assert.match(got.result.content[0].text, /Saved to .*inbox\/notes\.txt/);
  assert.equal(readFileSync(join(cwd, 'inbox/notes.txt'), 'utf8'), 'attached');
  assert.equal(escaped.result.isError, true);
  assert.match(escaped.result.content[0].text, /outside this project/);

  // Without the Toto's token there is nothing to talk to, and the hook says nothing.
  const bare = { ...process.env, TOTO_API_TOKEN: '', TOTO_AGENT_ID: '' };
  const hook = await run('session.mjs', '', { env: bare });
  assert.deepEqual([hook.status, hook.stdout], [0, '']);
  const withToken = await run('session.mjs', '', { env });
  assert.match(withToken.stdout, /This Toto keeps notes for its agents/);
});
