import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpuPercent, parseCpu, parseMeminfo, readStats } from './stats.ts';

test('memory is read from /proc/meminfo, in bytes', () => {
  const text = 'MemTotal:        3886840 kB\nMemFree:         1007216 kB\nMemAvailable:    1752804 kB\nSwapTotal:        524288 kB\nSwapFree:         500000 kB\n';
  assert.deepEqual(parseMeminfo(text), { total: 3886840 * 1024, available: 1752804 * 1024, swapTotal: 524288 * 1024, swapFree: 500000 * 1024 });
  // A machine with no swap says nothing of it.
  assert.deepEqual(parseMeminfo('MemTotal: 10 kB\nMemAvailable: 4 kB\n'), { total: 10240, available: 4096, swapTotal: 0, swapFree: 0 });
});

test('how busy the processor was is the share of the time between two readings that was not idle', () => {
  const before = parseCpu('cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3');
  assert.deepEqual(before, { total: 1000, idle: 800 });
  // 400 more units went by, of which 300 were idle or waiting.
  assert.equal(cpuPercent(before, parseCpu('cpu  150 0 150 900 200 0 0 0 0 0')), 25);
  assert.equal(cpuPercent(before, before), 0, 'no time passing is not a division by zero');
  assert.equal(cpuPercent({ total: 10, idle: 0 }, { total: 20, idle: 0 }), 100);
  assert.deepEqual(parseCpu(''), { total: 0, idle: 0 });
});

test('this machine can say how it is doing, in sizes that make sense', async () => {
  const stats = await readStats('/tmp');
  assert.ok(stats.cpu >= 0 && stats.cpu <= 100, `cpu ${stats.cpu}`);
  assert.ok(stats.cores >= 1);
  assert.equal(stats.load.length, 3);
  assert.ok(stats.memory.total > 0 && stats.memory.available > 0 && stats.memory.available <= stats.memory.total);
  assert.ok(stats.disk.total > 0 && stats.disk.free >= 0 && stats.disk.free <= stats.disk.total);
  assert.ok(stats.uptime > 0);
  if (stats.temp !== undefined) assert.ok(stats.temp > -20 && stats.temp < 130, `temp ${stats.temp}`);
  // Asked again at once, the last measurement stands.
  assert.equal((await readStats('/tmp')).cpu, stats.cpu);
});
