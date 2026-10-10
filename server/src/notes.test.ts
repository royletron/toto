import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LIMITS, openMemories } from './memory.ts';
import { openTasks, LIMITS as TASKS } from './tasks.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'toto-notes-'));
const you = { by: 'you' } as const;
const agent = { by: 'agent', agentId: 'a1', projectId: 'p1' } as const;

test('memories live at three layers, and an agent writes only where it may', () => {
  const file = join(dir(), 'm.json');
  const m = openMemories(file);
  const node = m.save({ layer: 'node', title: 'Style', body: 'Plain verbs.' }, you);
  assert.equal(node.pending, undefined);
  // An agent's own and its project's are saved at once, whatever scope it names; the node's waits.
  const own = m.save({ layer: 'agent', scope: 'someone-else', title: 'Mine', body: 'x' }, agent);
  assert.equal(own.scope, 'a1');
  const proj = m.save({ layer: 'project', scope: 'p2', title: 'Ours', body: 'y' }, agent);
  assert.equal(proj.scope, 'p1');
  const suggested = m.save({ layer: 'node', title: 'For all', body: 'z' }, agent);
  assert.equal(suggested.pending, true);
  // What applies to an agent leaves out a suggestion until it is accepted, and other agents' notes.
  m.save({ layer: 'agent', scope: 'a2', title: 'Theirs', body: 'q' }, you);
  assert.deepEqual(m.forAgent('a1', 'p1').map((x) => x.title).sort(), ['Mine', 'Ours', 'Style']);
  assert.ok(m.accept(suggested.id));
  assert.ok(m.forAgent('a1', 'p1').some((x) => x.title === 'For all'));
  assert.ok(!m.accept(node.id));
  // It all survives being opened again.
  assert.equal(openMemories(file).list().length, 5);
});

test('a memory can be moved by saving it at another layer, and an agent cannot touch what is not its own', () => {
  const m = openMemories(join(dir(), 'm.json'));
  const a = m.save({ layer: 'agent', scope: 'a1', title: 'Note', body: 'x' }, you);
  const moved = m.save({ layer: 'project', scope: 'p1', title: 'Note', body: 'x' }, you, a.id);
  assert.deepEqual([moved.id, moved.layer, moved.scope, moved.created], [a.id, 'project', 'p1', a.created]);
  assert.equal(m.list().length, 1);
  assert.throws(() => m.save({ layer: 'project', title: 'Note', body: 'changed' }, agent, a.id), /not yours/);
  assert.throws(() => m.remove(a.id, agent), /not yours/);
  const mine = m.save({ layer: 'agent', title: 'Mine', body: 'x' }, agent);
  assert.ok(m.remove(mine.id, agent));
  assert.ok(!m.remove(mine.id, you));
});

test('memories refuse what is not one, and keep to their limits', () => {
  const m = openMemories(join(dir(), 'm.json'));
  for (const bad of [{ layer: 'galaxy' }, { title: '' }, { title: 'x'.repeat(LIMITS.title + 1) }, { body: ' ' }, { body: 'x'.repeat(LIMITS.body + 1) }, { layer: 'project' }])
    assert.throws(() => m.save({ layer: 'node', title: 't', body: 'b', ...bad }, you), /memory|title|text|project/i, JSON.stringify(bad).slice(0, 40));
  for (let i = 0; i < LIMITS.perScope; i++) m.save({ layer: 'node', title: `n${i}`, body: 'b' }, you);
  assert.throws(() => m.save({ layer: 'node', title: 'one more', body: 'b' }, you), /as many/);
  m.save({ layer: 'project', scope: 'p1', title: 'elsewhere is fine', body: 'b' }, you);
  m.forget(['p1']);
  assert.equal(m.list().filter((x) => x.scope === 'p1').length, 0);
});

test('tasks carry files, move between agents and projects, and go with their project', () => {
  const root = dir();
  const t = openTasks(join(root, 't.json'), join(root, 'task-files'));
  const task = t.create({ title: 'Fix the flaky test', description: 'It fails on CI.', projectId: 'p1', agentId: 'a1' }, 'agent');
  assert.deepEqual([task.state, task.by, task.files], ['open', 'agent', []]);
  const file = t.addFile(task.id, Buffer.from('log lines'), '/var/log/ci.log');
  assert.deepEqual([file.name, file.mime, file.bytes], ['ci.log', 'text/plain', 9]);
  assert.equal(t.readFile(task.id, file.id)?.toString(), 'log lines');
  assert.equal(t.readFile('00000000', file.id), undefined);
  const moved = t.update(task.id, { title: 'Fix the flaky test', description: 'It fails on CI.', projectId: 'p2', agentId: 'a9', state: 'working' });
  assert.deepEqual([moved.projectId, moved.agentId, moved.state, moved.files.length], ['p2', 'a9', 'working', 1]);
  t.unassign('a9');
  assert.equal(t.get(task.id)?.agentId, undefined);
  t.removeFile(task.id, file.id);
  assert.equal(t.readFile(task.id, file.id), undefined);
  assert.equal(t.setState(task.id, 'done').state, 'done');
  t.removeProject('p2');
  assert.equal(t.list().length, 0);
});

test('tasks refuse what is not one, and too many', () => {
  const root = dir();
  const t = openTasks(join(root, 't.json'), join(root, 'task-files'));
  for (const bad of [{ title: '' }, { title: 'x'.repeat(TASKS.title + 1) }, { description: 5 }, { state: 'later' }]) assert.throws(() => t.create({ title: 't', description: '', projectId: 'p', ...bad }, 'you'), /task|title|open/i);
  const one = t.create({ title: 't', description: '', projectId: 'p' }, 'you');
  for (let i = 0; i < TASKS.files; i++) t.addFile(one.id, Buffer.from(`file ${i}`), `f${i}.txt`);
  assert.throws(() => t.addFile(one.id, Buffer.from('one more'), 'x.txt'), /up to/);
  assert.throws(() => t.addFile(one.id, Buffer.alloc(0), 'empty'), /files|empty/);
  assert.ok(t.remove(one.id));
  assert.ok(!t.remove(one.id));
});
