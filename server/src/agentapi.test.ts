import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { apiToken, call, sameToken, startAgentApi, type Deps, type Who } from './agentapi.ts';
import { openDb } from './db.ts';
import { openMemories } from './memory.ts';
import { openTalk } from './talk.ts';
import { openTasks } from './tasks.ts';

const root = mkdtempSync(join(tmpdir(), 'toto-api-'));
const db = openDb(join(root, 'toto.db'));
const memories = openMemories(db);
const tasks = openTasks(db, join(root, 'task-files'));
const talk = openTalk(db);
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
  talk,
  // Three agents: Alice and Bob, whom the person connects, and Cleo, whom nobody has.
  agent: (id) => ({ a1: { id: 'a1', name: 'Alice', projectId: 'p1', project: 'Shop', working: false }, b1: { id: 'b1', name: 'Bob', projectId: 'p2', project: 'Docs', working: true }, c1: { id: 'c1', name: 'Cleo', projectId: 'p3', project: 'Site', working: false } } as Record<string, { id: string; name: string; projectId: string; project: string; working: boolean }>)[id],
  tell: (to, from, text) => void messages.push({ to, from, text }),
};
const messages: { to: string; from: string; text: string }[] = [];
const last = () => messages[messages.length - 1];

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
  // An agent keeps its project's task true: only what it names changes, and files can be added.
  assert.match(await text(alice, 'update_task', { id: task.id, description: 'It fails at night, after the backup.', state: 'working', files: ['logs/ci.log', 'missing.log'] }), /Updated task.*missing\.log/s);
  const edited = tasks.get(task.id)!;
  assert.deepEqual([edited.title, edited.description, edited.state, edited.projectId, edited.agentId], ['Fix CI', 'It fails at night, after the backup.', 'working', 'p1', 'a1']);
  await assert.rejects(call(bob, 'update_task', { id: task.id, title: 'Mine now' }, deps), /no such task/);
  await assert.rejects(call(alice, 'update_task', { id: task.id, state: 'maybe' }, deps), /open, working or done/);
  await assert.rejects(call(alice, 'update_task', { id: task.id, title: '' }, deps), /title/);
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
  assert.deepEqual(list.result.tools.map((t: any) => t.name), ['recall', 'remember', 'forget', 'raise_task', 'update_task', 'list_tasks', 'done_task', 'list_agents', 'ask_agent', 'request_work', 'reply_to_agent', 'get_task_file']);
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

test('agents that the person has connected can ask each other, and are answered, and told when requested work is done', async () => {
  const text = async (who: Who, route: string, args: object = {}) => ((await call(who, route, args, deps)) as { text: string }).text;
  messages.length = 0;
  // Not connected: nothing to list, nothing can be asked, and the sentence says why and who can change it.
  assert.match(await text(alice, 'list_agents'), /not connected to any other agent. Only the person can connect/);
  await assert.rejects(call(alice, 'ask_agent', { agent: 'Bob', question: 'hello?' }, deps), /not connected to any other agent/);
  assert.equal(messages.length, 0);

  talk.setLink('a1', 'b1', 'ask');
  assert.match(await text(alice, 'list_agents'), /Bob \(b1\) in the project Docs: working now; you may ask it questions\./);
  assert.match(await text(bob, 'list_agents'), /Alice \(a1\) in the project Shop: idle/);
  // Cleo is not one of them, by name or by id, and the sentence says who is.
  await assert.rejects(call(alice, 'ask_agent', { agent: 'Cleo', question: 'hi' }, deps), /not connected to any agent called Cleo. You are connected to: Bob \(b1\)/);
  await assert.rejects(call(alice, 'ask_agent', { agent: 'c1', question: 'hi' }, deps), /not connected/);

  // A question: Bob is told, as from Alice, with the request id and that it is not the person.
  assert.match(await text(alice, 'ask_agent', { agent: 'bob', question: 'What does the docs build output?' }), /Asked Bob \(request req_[0-9a-f]+\)/);
  assert.equal(messages.length, 1);
  assert.deepEqual([messages[0].to, messages[0].from], ['b1', 'a1']);
  assert.match(messages[0].text, /A question from Alice, in the project Shop\]\nWhat does the docs build output\?/);
  assert.match(messages[0].text, /reply_to_agent, request req_[0-9a-f]+/);
  assert.match(messages[0].text, /not from the person/);
  const id = /request (req_[0-9a-f]+)/.exec(messages[0].text)![1];
  assert.match(await text(bob, 'index'), new RegExp(`Alice is waiting for your answer \\(request ${id}\\): What does the docs`));
  // Only Bob can answer it, and the answer goes back to Alice.
  await assert.rejects(call(alice, 'reply_to_agent', { request: id, answer: 'me' }, deps), /no such request waiting on you/);
  assert.match(await text(bob, 'reply_to_agent', { request: id, answer: 'A folder called dist.' }), /Sent to Alice/);
  assert.deepEqual([messages[1].to, messages[1].from], ['a1', 'b1']);
  assert.match(messages[1].text, new RegExp(`Bob answers your request ${id}\\]\\nA folder called dist\\.`));
  await assert.rejects(call(bob, 'reply_to_agent', { request: id, answer: 'again' }, deps), /no such request waiting on you/);

  // Work needs more than a question's link.
  await assert.rejects(call(alice, 'request_work', { agent: 'Bob', title: 'Add a page' }, deps), /questions but not to do work/);
  talk.setLink('a1', 'b1', 'work');
  const before = tasks.list().length;
  assert.match(await text(alice, 'request_work', { agent: 'Bob', title: 'Add an API page', description: 'Document GET /orders.' }), /task \w+ on their project's list/);
  const task = tasks.list().find((t) => t.title === 'Add an API page')!;
  assert.equal(tasks.list().length, before + 1);
  assert.deepEqual([task.projectId, task.agentId, task.state, task.tags], ['p2', 'b1', 'working', ['from-agent']]);
  assert.match(task.description, /Document GET \/orders\.\n\nAsked for by Alice, in the project Shop\./);
  const asked = last();
  assert.match(asked.text, new RegExp(`A request for work from Alice[^]*\\nAdd an API page[^]*task ${task.id} on your project's list`));
  // When Bob marks it done, Alice is told; a task nobody asked for tells no one.
  const count = messages.length;
  await text(bob, 'done_task', { id: task.id });
  assert.equal(messages.length, count + 1);
  assert.deepEqual([last().to, last().from], ['a1', 'b1']);
  assert.match(last().text, /Bob has finished the task you asked for: Add an API page/);
  const own = tasks.create({ title: 'Own task', description: '', projectId: 'p2' }, 'agent');
  await text(bob, 'done_task', { id: own.id });
  assert.equal(messages.length, count + 1);
});

test('a message that cannot be delivered is not left waiting, and what an agent asks is checked', async () => {
  talk.setLink('a1', 'b1', 'work');
  // The agent has gone, or the disk is full: the request is not left open.
  const failing: Deps = { ...deps, tell: () => { throw new Error('Bob has as many messages waiting as can wait.'); } };
  await assert.rejects(call(alice, 'ask_agent', { agent: 'Bob', question: 'anyone?' }, failing), /as many messages waiting/);
  assert.deepEqual(talk.waitingOn('b1').filter((r) => r.text === 'anyone?'), []);
  await assert.rejects(call(alice, 'request_work', { agent: 'Bob', title: 'Never delivered' }, failing), /as many messages waiting/);
  assert.equal(talk.waitingOn('b1').filter((r) => r.text.startsWith('Never delivered')).length, 0);
  assert.equal(tasks.list().find((t) => t.title === 'Never delivered')?.state, 'open', 'its task goes back to open, for the person to see');
  // Empty and over-long questions, and an answer to nothing.
  await assert.rejects(call(alice, 'ask_agent', { agent: 'Bob', question: '  ' }, deps), /Say what you want to ask/);
  await assert.rejects(call(alice, 'ask_agent', { agent: 'Bob', question: 'x'.repeat(5000) }, deps), /too long/);
  await assert.rejects(call(bob, 'reply_to_agent', { request: 'req_none', answer: 'x' }, deps), /no such request/);
});
