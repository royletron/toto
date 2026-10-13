import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

const { dial, dataDir } = startServer();
const tokens = () => {
  try {
    return JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8')).pushTokens as string[];
  } catch {
    return [];
  }
};
const until = async (what: string, ok: () => boolean) => {
  for (let tries = 0; tries < 100 && !ok(); tries++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(ok(), what);
};
const [A, B, C] = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'].map((id) => `ExponentPushToken[${id}]`);

test('a phone that forgets a Toto takes its notifications back, and one shared in may only take back its own', async () => {
  const owner = await dial('owner-token');
  owner.send({ type: 'sync' });
  await owner.next('state');
  owner.send({ type: 'register_push', token: A });
  owner.send({ type: 'register_push', token: B });
  await until('both are kept', () => tokens().length === 2);

  owner.send({ type: 'unregister_push', token: A });
  await until('one is taken back', () => tokens().length === 1);
  assert.deepEqual(tokens(), [B]);
  // What is not a token, or is not there, changes nothing.
  owner.send({ type: 'unregister_push', token: 'nonsense' });
  owner.send({ type: 'unregister_push', token: C });
  owner.send({ type: 'ping' });
  await owner.next('pong');
  assert.deepEqual(tokens(), [B]);

  // A phone shared in has a token of its own, and cannot take the owner's.
  owner.send({ type: 'share', name: 'Friend' });
  const invite = await owner.next('invite');
  const joining = await dial(invite.secret, invite.phoneId);
  joining.send({ type: 'join' });
  const { secret } = await joining.next('joined');
  const guest = await dial(secret, invite.phoneId);
  guest.send({ type: 'sync' });
  await guest.next('state');
  guest.send({ type: 'register_push', token: C });
  await until('the guest\'s is kept', () => tokens().includes(C));
  guest.send({ type: 'unregister_push', token: B });
  guest.send({ type: 'ping' });
  await guest.next('pong');
  assert.ok(tokens().includes(B), 'a guest cannot take back the owner\'s notifications');
  guest.send({ type: 'unregister_push', token: C });
  await until('the guest takes its own back', () => !tokens().includes(C));
  assert.deepEqual(tokens(), [B]);
});
