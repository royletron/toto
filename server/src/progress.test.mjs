import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const file = join(mkdtempSync(join(tmpdir(), 'toto-progress-')), 'progress.json');
process.env.TOTO_PROGRESS = file;
const { track, lastLine } = await import('../../bin/toto-progress.mjs');
const { readLog, readProgress } = await import('./progress.ts');

test('a job says where it is up to, and the server reads it back', async () => {
  const steps = track('plugin:gh', 4);
  steps.next('Downloading it');
  assert.deepEqual(readProgress(file), { active: true, shown: { task: 'plugin:gh', text: 'Downloading it', step: 1, of: 4 } });
  // A command's last line of output rides along, without its colour codes.
  await steps.run('Installing packages', 'sh', ['-c', 'echo first; printf "\\033[1mSetting up gh\\033[0m\\r\\n"']);
  assert.equal(readProgress(file).shown.text, 'Installing packages: Setting up gh');
  await assert.rejects(steps.run('Installing packages', 'sh', ['-c', 'echo "E: Unable to locate package gh" >&2; exit 100']), /Unable to locate/);
  steps.done('Installed gh 1.0.0.');
  // A job that finished well is not news; one that failed is, for a while.
  assert.deepEqual(readProgress(file), { active: false });
  steps.fail('The update did not take.');
  assert.deepEqual(readProgress(file), { active: false, shown: { task: 'plugin:gh', text: 'The update did not take.', step: 1, of: 4, failed: true } });
});

test('what a job left long ago, or that is not a job, is not shown', () => {
  const was = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(readProgress(file, was.at + 11 * 60_000), { active: false });
  writeFileSync(file, '{"task": 5}');
  assert.deepEqual(readProgress(file), { active: false });
  writeFileSync(file, 'not json');
  assert.deepEqual(readProgress(file), { active: false });
  assert.deepEqual(readProgress('/nowhere'), { active: false });
  assert.equal(lastLine(''), '');
});

test('every step and line of output is kept to scroll back through, a new task starts the log again and a continued one adds to it', async () => {
  const log = file.replace(/\.json$/, '.log');
  const first = track('update', 5);
  first.next('Downloading the update');
  first.next('Downloading the update');
  await first.run('Installing', 'sh', ['-c', 'echo "Setting up   node"']);
  first.done('Updated to 1.0.0.');
  assert.deepEqual(readLog(log).map((l) => l.slice(9)), ['Downloading the update', 'Installing: Setting up node', 'Updated to 1.0.0.']);
  // Another process carrying the same update on.
  track('update', 5, 3).next('Installing');
  assert.equal(readLog(log).length, 4);
  // A new task, from the start.
  track('plugin:gh', 4).next('Downloading it');
  assert.deepEqual(readLog(log).map((l) => l.slice(9)), ['Downloading it']);
  assert.deepEqual(readLog('/nowhere'), []);
});
