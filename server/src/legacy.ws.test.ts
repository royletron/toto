import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

// A Toto that has memories and tasks from before the database, as a real server starting on them.
const { dial, dataDir } = startServer({}, (dir) => {
  writeFileSync(join(dir, 'memories.json'), JSON.stringify([{ id: 'aaaaaaaa', layer: 'node', title: 'From before', body: 'Kept in a file once.', by: 'you', created: 1000, updated: 1000 }]));
  writeFileSync(join(dir, 'tasks.json'), JSON.stringify([{ id: 'bbbbbbbb', title: 'Task from before', description: '', projectId: 'p1', by: 'you', created: 2000, updated: 2000, state: 'open', files: [] }]));
  writeFileSync(join(dir, 'tasks.tags.json'), '{}');
});

test('a server started on the old JSON files brings them in, and a phone sees them', async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  await phone.next('synced');
  const last = (type: string) => phone.said.findLast((m) => m.type === type);
  assert.deepEqual(last('memories').items.map((m: any) => [m.id, m.title]), [['aaaaaaaa', 'From before']]);
  assert.deepEqual(last('tasks').items.map((t: any) => [t.id, t.title, t.tags]), [['bbbbbbbb', 'Task from before', []]]);
  assert.ok(existsSync(join(dataDir, 'toto.db')));
  for (const name of ['memories', 'tasks', 'tasks.tags']) assert.ok(existsSync(join(dataDir, `${name}.json.imported`)) && !existsSync(join(dataDir, `${name}.json`)), name);
  // And it can be changed, and the change is in the database and not a file.
  phone.send({ type: 'memory_save', layer: 'node', title: 'After', body: 'Kept in the database.' });
  await phone.next('memories');
  assert.deepEqual(last('memories').items.map((m: any) => m.title), ['From before', 'After']);
});
