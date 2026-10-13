import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MIGRATIONS, openDb, transaction } from './db.ts';
import { importLegacy } from './legacy.ts';
import { openMemories } from './memory.ts';
import { openTasks } from './tasks.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'toto-db-'));
const version = (db: ReturnType<typeof openDb>) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const tables = (db: ReturnType<typeof openDb>) => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((t) => t.name);

test('a new database is brought to the current layout, private to the server, and opening it again changes nothing', () => {
  const file = join(dir(), 'toto.db');
  const db = openDb(file);
  assert.equal(version(db), MIGRATIONS.length);
  assert.deepEqual(tables(db), ['memories', 'tag_colors', 'task_files', 'task_tags', 'tasks']);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal');
  db.prepare("INSERT INTO tag_colors (tag, color) VALUES ('a', '#112233')").run();
  db.close();
  const again = openDb(file);
  assert.equal(version(again), MIGRATIONS.length);
  assert.equal((again.prepare('SELECT count(*) AS n FROM tag_colors').get() as { n: number }).n, 1);
});

test('a database one step behind is brought up by that step alone, and a step that fails changes nothing', () => {
  const file = join(dir(), 'toto.db');
  openDb(file, [MIGRATIONS[0]]).close();
  const later = ['ALTER TABLE memories ADD COLUMN note TEXT'];
  const db = openDb(file, [MIGRATIONS[0], ...later]);
  assert.equal(version(db), 2);
  assert.ok((db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).some((c) => c.name === 'note'));
  db.close();
  // A step with a mistake in the middle: the part before it is not kept, and the version does not move.
  const keep = join(dir(), 'toto.db');
  openDb(keep, [MIGRATIONS[0]]).close();
  assert.throws(() => openDb(keep, [MIGRATIONS[0], 'CREATE TABLE half (a); INSERT INTO nowhere VALUES (1)']));
  const after = openDb(keep, [MIGRATIONS[0]]);
  assert.equal(version(after), 1);
  assert.ok(!tables(after).includes('half'));
});

test('a database from a newer Toto is refused, and left as it was', () => {
  const file = join(dir(), 'toto.db');
  const db = openDb(file);
  db.exec('PRAGMA user_version = 99');
  db.close();
  assert.throws(() => openDb(file), /newer Toto.*Update this Toto/);
  const peek = openDb(file, new Array(99).fill('SELECT 1'));
  assert.equal(version(peek), 99);
});

test('a change happens whole or not at all, and one inside another is part of it', () => {
  const db = openDb(':memory:');
  assert.throws(() => transaction(db, () => {
    db.prepare("INSERT INTO tag_colors (tag, color) VALUES ('one', '#000000')").run();
    throw new Error('stopped');
  }), /stopped/);
  assert.equal((db.prepare('SELECT count(*) AS n FROM tag_colors').get() as { n: number }).n, 0);
  assert.throws(() => transaction(db, () => {
    transaction(db, () => db.prepare("INSERT INTO tag_colors (tag, color) VALUES ('inner', '#000000')").run());
    throw new Error('outer stopped');
  }), /outer stopped/);
  assert.equal((db.prepare('SELECT count(*) AS n FROM tag_colors').get() as { n: number }).n, 0);
  assert.equal(transaction(db, () => 42), 42);
  assert.equal(db.isTransaction, false);
});

// What the files looked like before the database, including a task from before there were tags.
const OLD_MEMORIES = [
  { id: 'aaaaaaaa', layer: 'project', scope: 'p1', title: 'Tests', body: 'npm test', by: 'agent', author: 'a1', created: 1000, updated: 2000 },
  { id: 'bbbbbbbb', layer: 'node', title: 'Suggested', body: 'UTC', by: 'agent', author: 'a1', created: 3000, updated: 3000, pending: true },
  { nonsense: true },
];
const OLD_TASKS = [
  { id: 'cccccccc', title: 'Old task', description: 'before tags', projectId: 'p1', agentId: 'a1', by: 'agent', created: 4000, updated: 5000, state: 'working', files: [{ id: '0123456789abcdef', name: 'log.txt', mime: 'text/plain', bytes: 9 }] },
  { id: 'dddddddd', title: 'Tagged', description: '', projectId: 'p2', by: 'you', created: 6000, updated: 6000, state: 'open', files: [], tags: ['bug', 'ci'] },
];

test('what the old JSON files held comes into the database once, is put aside, and the stores read it', () => {
  const root = dir();
  writeFileSync(join(root, 'memories.json'), JSON.stringify(OLD_MEMORIES));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(OLD_TASKS));
  writeFileSync(join(root, 'tasks.tags.json'), JSON.stringify({ bug: '#112233' }));
  const db = openDb(join(root, 'toto.db'));
  assert.deepEqual(importLegacy(db, root), { memories: 2, tasks: 2 });
  for (const name of ['memories', 'tasks', 'tasks.tags']) assert.ok(!existsSync(join(root, `${name}.json`)) && existsSync(join(root, `${name}.json.imported`)), name);

  const memories = openMemories(db).list();
  assert.deepEqual(memories.map((m) => [m.id, m.layer, m.scope, m.by, m.author, m.created, m.updated, m.pending]), [
    ['aaaaaaaa', 'project', 'p1', 'agent', 'a1', 1000, 2000, undefined],
    ['bbbbbbbb', 'node', undefined, 'agent', 'a1', 3000, 3000, true],
  ]);
  const tasks = openTasks(db, join(root, 'task-files'));
  const [old, tagged] = tasks.list();
  assert.deepEqual([old.title, old.agentId, old.state, old.files, old.tags], ['Old task', 'a1', 'working', [{ id: '0123456789abcdef', name: 'log.txt', mime: 'text/plain', bytes: 9 }], []]);
  assert.deepEqual([tagged.agentId, tagged.tags], [undefined, ['bug', 'ci']]);
  assert.deepEqual(tasks.tags().map((t) => [t.name, t.color]), [['bug', '#112233'], ['ci', tasks.tags()[1].color]]);

  // A second start has nothing to bring in, and changes nothing.
  assert.deepEqual(importLegacy(db, root), { memories: 0, tasks: 0 });
  assert.equal(openMemories(db).list().length, 2);
});

test('a file that cannot be read is left where it is, and what can be read is still brought in', () => {
  const root = dir();
  writeFileSync(join(root, 'memories.json'), '{ not json');
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(OLD_TASKS));
  const db = openDb(join(root, 'toto.db'));
  assert.deepEqual(importLegacy(db, root), { memories: 0, tasks: 2 });
  assert.ok(existsSync(join(root, 'memories.json')), 'the damaged file stays for someone to look at');
  assert.ok(existsSync(join(root, 'tasks.json.imported')));
});
