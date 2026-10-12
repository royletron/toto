import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

// A Toto in a container: named from outside, and updated by pulling a newer image.
const { dial } = startServer({ TOTO_CONTAINER: '1', TOTO_NAME: 'In a box', TOTO_ADDRESS: '192.0.2.7:7860' });

test('in a container it takes its name from the environment, says so, and will not update itself', async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  const state = await phone.next('state');
  assert.equal(state.name, 'In a box');
  assert.equal(state.container, true);
  assert.equal(state.latest, undefined);
  phone.send({ type: 'update' });
  assert.match((await phone.next('failed')).message, /container.*newer image/);
  // And the address it gives out in an invitation is the one it was told, not one inside the container.
  phone.send({ type: 'share', name: 'Friend' });
  assert.equal((await phone.next('invite')).address, 'ws://192.0.2.7:7860');
});
