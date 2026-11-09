import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

// The Slurp plugin as it is installed, signed in to through the protocol, against a Worker that wants the right token.
const plugins = mkdtempSync(join(tmpdir(), 'toto-plugins-'));
cpSync(new URL('../../plugins/slurp', import.meta.url).pathname, join(plugins, 'slurp'), { recursive: true });
// The address must be https in practice; the test's Worker is local, so only that pattern is loosened.
const manifest = JSON.parse(readFileSync(join(plugins, 'slurp', 'manifest.json'), 'utf8'));
manifest.login.paste.also[0].pattern = '^http://127\\.0\\.0\\.1:[0-9]+$';
writeFileSync(join(plugins, 'slurp', 'manifest.json'), JSON.stringify(manifest));

const asked: string[] = [];
const worker = createServer((req, res) => {
  asked.push(`${req.method} ${req.url} ${req.headers.authorization}`);
  res.writeHead(req.headers.authorization === 'Bearer admin-token-1234567890' ? 200 : 401).end('{}');
}).listen(0, '127.0.0.1');
await new Promise((r) => worker.once('listening', r));
const address = `http://127.0.0.1:${(worker.address() as { port: number }).port}`;
const { dial } = startServer({ TOTO_PLUGIN_DIR: plugins });

test('signing in to Slurp takes the address and the token, checks them with the Worker, and is signed in only then', { timeout: 60_000 }, async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  const first = (await phone.next('state')).plugins.find((p: any) => p.name === 'slurp');
  assert.equal(first.signedIn, undefined);
  assert.deepEqual(first.paste.also, [{ env: 'SLURP_BACKEND', label: 'Address' }]);

  // Without the address, or with the wrong token, it is not accepted and nothing is kept.
  phone.send({ type: 'plugin_token', name: 'slurp', token: 'admin-token-1234567890' });
  assert.match((await phone.next('failed')).message, /address/);
  phone.send({ type: 'plugin_token', name: 'slurp', token: 'wrong-token-0123456789', also: { SLURP_BACKEND: address } });
  assert.match((await phone.next('failed')).message, /not accepted/);
  assert.equal(phone.said.findLast((m) => m.type === 'state').plugins.find((p: any) => p.name === 'slurp').signedIn, undefined);

  // With both right, it is.
  phone.send({ type: 'plugin_token', name: 'slurp', token: 'admin-token-1234567890', also: { SLURP_BACKEND: address } });
  for (let i = 0; i < 100 && !phone.said.findLast((m) => m.type === 'state')?.plugins.find((p: any) => p.name === 'slurp')?.signedIn; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(phone.said.findLast((m) => m.type === 'state').plugins.find((p: any) => p.name === 'slurp').signedIn, true);
  assert.ok(asked.includes('POST /v1/rpc/Whoami Bearer admin-token-1234567890'), asked.join(' | '));

  // A fresh connection finds it still signed in, and signing out forgets both.
  const later = await dial('owner-token');
  later.send({ type: 'sync' });
  assert.equal((await later.next('state')).plugins.find((p: any) => p.name === 'slurp').signedIn, true);
  later.send({ type: 'plugin_logout', name: 'slurp' });
  for (let i = 0; i < 100 && later.said.findLast((m) => m.type === 'state')?.plugins.find((p: any) => p.name === 'slurp')?.signedIn !== undefined; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(later.said.findLast((m) => m.type === 'state').plugins.find((p: any) => p.name === 'slurp').signedIn, undefined);

  worker.close();
});
