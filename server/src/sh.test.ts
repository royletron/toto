import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sh } from './projects.ts';

test('a command that is over before it is given its input does not take the server down', async () => {
  // Each of these exits at once without reading its input: writing to it fails with EPIPE, which unheard is an uncaught error.
  for (let i = 0; i < 150; i++) {
    await sh('true', []);
    await sh('false', []).catch(() => {});
    await sh('sh', ['-c', 'exit 0'], {}, 'a lot of input that nobody reads\n'.repeat(5000));
  }
  // And what it says is still what comes back.
  assert.equal((await sh('echo', ['hello'])).stdout, 'hello\n');
  assert.equal((await sh('cat', [], {}, 'passed through')).stdout, 'passed through');
});
