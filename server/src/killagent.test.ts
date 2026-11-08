import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { KILL_AGENT } from './projects.ts';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A process that sleeps, with this in its environment, and, like a tool the agent ran, one of its own. */
const sleeper = (marker?: string) => {
  const child = spawn('sh', ['-c', 'sleep 300 & wait'], { env: { PATH: process.env.PATH, ...(marker ? { TOTO_AGENT_ID: marker } : null) }, stdio: 'ignore', detached: true });
  child.unref();
  return child.pid!;
};

test("stopping an agent ends what it started, and nothing else, not even another agent whose id starts the same", async () => {
  const mine = sleeper('agent1');
  const lookalike = sleeper('agent10'); // another agent, whose id begins with this one's
  const other = sleeper('agent2');
  const unrelated = sleeper();
  await wait(500);
  try {
    // As the project's user runs it: a shell with the id as its argument.
    assert.equal(spawnSync('sh', ['-c', KILL_AGENT, 'sh', 'agent1'], { env: { PATH: process.env.PATH } }).status, 0);
    await wait(500);
    assert.ok(!alive(mine), 'the agent is ended');
    assert.ok(alive(lookalike) && alive(other) && alive(unrelated), 'and no other process is');
    // An agent that is not running is not a failure.
    assert.equal(spawnSync('sh', ['-c', KILL_AGENT, 'sh', 'nobody'], { env: { PATH: process.env.PATH } }).status, 0);
  } finally {
    // Each one with the sleep it started, as a group.
    for (const pid of [mine, lookalike, other, unrelated]) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {}
    }
  }
});
