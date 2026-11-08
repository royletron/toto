import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CACHES, CLEAN, MEASURE, diskLevel, parseMeasure, readDisk } from './disk.ts';
import { startServer } from './testserver.ts';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

test('the disk is low at under two gigabytes or a tenth of a small card, and critical at a few hundred megabytes', () => {
  assert.equal(diskLevel(10 * GB, 100 * GB), 'ok');
  assert.equal(diskLevel(1.5 * GB, 15 * GB), 'low', 'a small card with a tenth left');
  assert.equal(diskLevel(1.1 * GB, 15 * GB), 'low');
  assert.equal(diskLevel(1.9 * GB, 500 * GB), 'low', 'two gigabytes is not much on any disk');
  assert.equal(diskLevel(30 * GB, 500 * GB), 'ok', 'a small share of a big disk is plenty');
  assert.equal(diskLevel(3 * GB, 20 * GB), 'ok', 'three gigabytes is a seventh of this and is fine');
  assert.equal(diskLevel(2.5 * GB, 40 * GB), 'low', 'a sixteenth of a card is not');
  assert.equal(diskLevel(400 * MB, 100 * GB), 'critical');
  assert.equal(diskLevel(0.6 * GB, 15 * GB), 'critical', 'a few percent of a small card');
  assert.equal(diskLevel(0.4 * GB, 10 * GB), 'critical');
  assert.equal(readDisk('/tmp').level, readDisk('/tmp').level);
});

const home = () => {
  const dir = mkdtempSync(join(tmpdir(), 'toto-diskhome-'));
  const put = (path: string, bytes: number) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), Buffer.alloc(bytes, 1));
  };
  return { dir, put };
};
const as = (dir: string, script: string) => spawnSync('sh', ['-c', script], { env: { PATH: process.env.PATH, HOME: dir }, encoding: 'utf8' });

test('measuring a project counts its caches, and clearing them takes only those', () => {
  const { dir, put } = home();
  put('.npm/_cacache/content/a', 300 * 1024);
  put('.npm/_npx/b', 100 * 1024);
  put('.cache/node-gyp/c', 50 * 1024);
  // The project's own work, and things that look like caches but are not.
  put('repo/node_modules/dep/index.js', 400 * 1024);
  put('repo/src/main.ts', 20 * 1024);
  put('agents/x/node_modules/dep/index.js', 400 * 1024);
  put('.cache/something-else/keep', 10 * 1024);
  put('.local/share/containers/storage/image', 10 * 1024);
  put('.vimrc', 100);
  const measured = parseMeasure(as(dir, MEASURE).stdout);
  assert.ok(measured.bytes >= 1280 * 1024, `all of it: ${measured.bytes}`);
  assert.ok(measured.cache >= 450 * 1024 && measured.cache < 600 * 1024, `just the caches: ${measured.cache}`);

  assert.equal(as(dir, CLEAN).status, 0);
  for (const gone of ['.npm/_cacache', '.npm/_npx', '.cache/node-gyp']) assert.ok(!existsSync(join(dir, gone)), gone);
  for (const kept of ['repo/node_modules/dep/index.js', 'repo/src/main.ts', 'agents/x/node_modules/dep/index.js', '.cache/something-else/keep', '.local/share/containers/storage/image', '.vimrc']) assert.ok(existsSync(join(dir, kept)), `${kept} is the person's, not a cache`);
  assert.equal(parseMeasure(as(dir, MEASURE).stdout).cache, 0);
  // Nothing to clear is not an error, and a home with nothing in it measures as nothing.
  assert.equal(as(dir, CLEAN).status, 0);
  assert.deepEqual(parseMeasure(as(mkdtempSync(join(tmpdir(), 'toto-empty-')), MEASURE).stdout).cache, 0);
  assert.deepEqual(parseMeasure(''), { bytes: 0, cache: 0 });
  assert.ok(CACHES.every((c) => !c.startsWith('/') && !c.includes('..')), 'only places inside a home');
});

const { dial } = startServer({ TOTO_TEST_DISK_FREE: String(100 * MB) });

test('a Toto that is nearly out of disk says so, starts nothing new, can say what is using it, and only to its owner', { timeout: 60_000 }, async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  const state = await phone.next('state');
  assert.equal(state.lowDisk.level, 'critical');
  assert.ok(state.lowDisk.free < 200 * MB && state.lowDisk.total > 0);

  for (const ask of [{ type: 'create_project', name: 'p', repo: 'https://example.test/x.git' }, { type: 'plugin_install', name: 'gh' }]) {
    phone.send(ask);
    assert.match((await phone.next('failed')).message, /disk is almost full/, ask.type);
  }

  phone.send({ type: 'disk_usage' });
  const { usage } = await phone.next('disk_usage');
  assert.equal(usage.disk.level, 'critical');
  assert.deepEqual(usage.projects, []);
  assert.ok(usage.data >= 0 && usage.apt >= 0);

  phone.send({ type: 'clean_disk' });
  const cleaned = await phone.next('disk_usage');
  assert.equal(cleaned.freed, 0, 'nothing here to clear, and it says so');
});
