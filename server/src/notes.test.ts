import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LIMITS, openMemories } from './memory.ts';
import { TAG_COLORS as OFFERED } from '../../app/src/tagcolors.ts';
import { openTasks, LIMITS as TASKS, TAG_COLORS } from './tasks.ts';

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

test('tasks carry tags: cleaned, never twice, coloured from the name unless someone chooses, renamed and deleted everywhere', () => {
  const root = dir();
  const t = openTasks(join(root, 't.json'), join(root, 'task-files'));
  const a = t.create({ title: 'a', description: '', projectId: 'p', tags: ['  Bug ', 'bug', 'CI  flaky'] }, 'you');
  assert.deepEqual(a.tags, ['bug', 'ci flaky']);
  const b = t.create({ title: 'b', description: '', projectId: 'p', tags: ['bug', 'docs'] }, 'agent');
  assert.deepEqual(t.create({ title: 'old', description: '', projectId: 'p' }, 'you').tags, []);
  assert.deepEqual(t.tags().map((x) => x.name), ['bug', 'ci flaky', 'docs']);
  // A colour made up from the name: the same each time, from the palette, and never amber.
  const [bug] = t.tags();
  assert.equal(openTasks(join(root, 't.json'), join(root, 'task-files')).tags()[0].color, bug.color);
  assert.ok(TAG_COLORS.includes(bug.color) && !TAG_COLORS.some((c) => c.toLowerCase() === '#ffb000'));
  // Chosen, kept across a restart, and back to made-up when cleared.
  t.setColor('Bug', '#112233');
  assert.equal(t.tags()[0].color, '#112233');
  assert.equal(openTasks(join(root, 't.json'), join(root, 'task-files')).tags()[0].color, '#112233');
  for (const bad of ['red', '#12345', '#FFB000', 5]) assert.throws(() => t.setColor('bug', bad), /colour|Amber/, String(bad));
  t.setColor('bug');
  assert.equal(t.tags()[0].color, bug.color);
  // Editing leaves tags alone unless given; giving them replaces them.
  assert.deepEqual(t.edit(b.id, { title: 'b2' }).tags, ['bug', 'docs']);
  assert.deepEqual(t.edit(b.id, { tags: ['docs'] }).tags, ['docs']);
  assert.throws(() => t.edit(b.id, { tags: 'docs' }), /list/);
  assert.throws(() => t.edit(b.id, { tags: [''] }), /1 to 24/);
  assert.throws(() => t.edit(b.id, { tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }), /up to 8/);
  assert.throws(() => t.edit(b.id, { tags: ['x'.repeat(25)] }), /1 to 24/);
  // Renaming onto an existing tag joins them, and takes the colour with it where there is none.
  t.setColor('docs', '#445566');
  t.renameTag('docs', 'bug');
  assert.deepEqual(t.get(b.id)!.tags, ['bug']);
  assert.equal(t.tags().find((x) => x.name === 'bug')!.color, '#445566');
  t.deleteTag('bug');
  assert.deepEqual(t.list().flatMap((x) => x.tags ?? []), ['ci flaky']);
});

test('the colours the app offers for a tag are the ones the Toto makes them up from', () => {
  assert.deepEqual(OFFERED, TAG_COLORS);
});
