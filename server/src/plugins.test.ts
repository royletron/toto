import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkToken, describe, installed, startPluginLogin } from './plugins.ts';

const login = { run: ['sh', '-c', 'echo "Open https://example.test/device and enter ABCD-1234"; sleep 1; echo $HOME > "$HOME/token"'], url: 'https://example\\.test/device', code: '[A-Z0-9]{4}-[A-Z0-9]{4}', token: ['sh', '-c', 'cat "$HOME/token"'], env: 'X_TOKEN' };

test('what is installed is what is on disk, and the relay only adds what is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'toto-plugins-'));
  mkdirSync(`${dir}/gh`);
  writeFileSync(`${dir}/gh/manifest.json`, JSON.stringify({ name: 'gh', version: '1.0.0', description: 'GitHub', login }));
  mkdirSync(`${dir}/lies`);
  writeFileSync(`${dir}/lies/manifest.json`, JSON.stringify({ name: 'other', version: '1.0.0' }));
  mkdirSync(`${dir}/.incoming-x`);
  const have = installed(dir);
  assert.deepEqual(have.map((m) => m.name), ['gh']);
  const offered = [{ name: 'gh', version: '1.1.0', description: 'GitHub' }, { name: 'notes', version: '0.1.0', description: 'Notes' }];
  assert.deepEqual(describe(have, offered, {}), [
    { name: 'gh', description: 'GitHub', version: '1.0.0', latest: '1.1.0', login: true },
    { name: 'notes', description: 'Notes' },
  ]);
  assert.equal(describe(have, [], { X_TOKEN: 'x' })[0].signedIn, true);
  assert.deepEqual(installed('/nowhere'), []);
});

test('a plugin sign-in shows its address and code, then hands back the token it earned', async () => {
  const done = new Promise<[string | undefined, string | undefined]>((resolve) => void startPluginLogin(login, 'test', (token, why) => resolve([token, why])).then((shown) => assert.deepEqual(shown, { url: 'https://example.test/device', code: 'ABCD-1234' })));
  const [token, why] = await done;
  assert.equal(why, undefined);
  assert.match(token!, /toto-login-/);
});

test('a sign-in that never shows a code gives up with a reason', async () => {
  await assert.rejects(startPluginLogin({ ...login, run: ['sh', '-c', 'echo nothing useful'] }, 'test2', () => {}), /did not show a code/);
});

const paste = { env: 'Y_TOKEN', paste: { url: 'https://example.test/tokens', help: 'Make one.', pattern: '^[a-z0-9]{12}$', check: ['sh', '-c', '[ "$Y_TOKEN" = goodtoken123 ]'] } };

test('a pasted token must have the right shape and, where the plugin can tell, work', async () => {
  assert.equal(await checkToken(paste, ' goodtoken123\n'), 'goodtoken123');
  await assert.rejects(checkToken(paste, 'goodtoken124'), /not accepted/);
  for (const bad of ['', 'short', 'x'.repeat(600), 'goodtoken123 && reboot', 5, undefined]) await assert.rejects(checkToken(paste, bad), /does not look like/, String(bad));
  await assert.rejects(checkToken({ env: 'Y_TOKEN' }, 'goodtoken123'), /does not look like/);
  // With nothing to check it against, the shape is all there is.
  assert.equal(await checkToken({ ...paste, paste: { ...paste.paste, check: undefined } }, 'anything1234'), 'anything1234');
});

test('a plugin that is signed in to by pasting says where, and is told apart from one that shows a code', () => {
  const have = [{ name: 'wrangler', version: '1.0.0', description: 'W', login: paste }];
  assert.deepEqual(describe(have, [], {}), [{ name: 'wrangler', description: 'W', version: '1.0.0', login: true, paste: { url: 'https://example.test/tokens', help: 'Make one.' } }]);
});

test('a plugin that needs a newer server than this one is not offered, and nothing malformed is', async () => {
  const { offerable } = await import('./plugins.ts');
  const found = [
    { name: 'gh', version: '1.0.0', description: 'a' },
    { name: 'spacevim', version: '1.0.0', description: 'b', needs: '0.9.0' },
    { name: 'odd', version: '1.0.0', description: 'c', needs: 'soon' },
    { name: 'Bad Name', version: '1.0.0', description: 'd' },
  ];
  assert.deepEqual(offerable(found, '0.8.4').map((m) => m.name), ['gh']);
  assert.deepEqual(offerable(found, '0.9.0').map((m) => m.name), ['gh', 'spacevim']);
  assert.deepEqual(offerable(found, '0.10.0').map((m) => m.name), ['gh', 'spacevim'], 'ten is more than nine');
  assert.deepEqual(offerable('not a list', '1.0.0'), []);
});

test('a sign-in with a second value: each is checked for its shape, both reach the plugin\'s own check, and it counts as signed in only with both', async () => {
  const { checkAlso, describe, loginNames } = await import('./plugins.ts');
  const slurp = JSON.parse(readFileSync(new URL('../../plugins/slurp/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkAlso(slurp.login, { SLURP_BACKEND: ' https://events.example.workers.dev\n' }), { SLURP_BACKEND: 'https://events.example.workers.dev' });
  for (const bad of [{}, { SLURP_BACKEND: '' }, { SLURP_BACKEND: 'http://events.example.workers.dev' }, { SLURP_BACKEND: 'https://a.example/path?x=1' }, { SLURP_BACKEND: 'events.example' }, { SLURP_BACKEND: 'https://x.example; reboot' }, { SLURP_BACKEND: 5 }, null, 'https://events.example.workers.dev']) assert.throws(() => checkAlso(slurp.login, bad), /address/, JSON.stringify(bad));
  // A login with nothing extra has nothing to check.
  assert.deepEqual(checkAlso({ env: 'GH_TOKEN' }, { anything: 'x' }), {});

  // The plugin's check, run as it would be: the token only in the environment, against a server that wants the right one.
  const seen: string[] = [];
  const worker = createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization}`);
    res.writeHead(req.headers.authorization === 'Bearer goodtoken1234567890' ? 200 : 401).end('{}');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => worker.once('listening', r));
  try {
    const address = `http://127.0.0.1:${(worker.address() as { port: number }).port}`;
    assert.equal(await checkToken(slurp.login, ' goodtoken1234567890\n', { SLURP_BACKEND: address }), 'goodtoken1234567890');
    assert.deepEqual(seen, ['POST /v1/rpc/Whoami Bearer goodtoken1234567890']);
    await assert.rejects(checkToken(slurp.login, 'wrongtoken12345678', { SLURP_BACKEND: address }), /not accepted/);
    // And an address nobody answers at is not accepted either.
    await assert.rejects(checkToken(slurp.login, 'goodtoken1234567890', { SLURP_BACKEND: 'http://127.0.0.1:9' }), /not accepted/);
  } finally {
    worker.close();
  }

  // Signed in only when both are there; the names are what agents are given.
  const have = [{ name: 'slurp', version: '1.0.0', ...slurp }];
  const listed = (env: Record<string, string>) => describe(have, [], env).find((p) => p.name === 'slurp')!;
  assert.equal(listed({ SLURP_TOKEN: 'x' }).signedIn, undefined);
  assert.equal(listed({ SLURP_BACKEND: 'x' }).signedIn, undefined);
  assert.equal(listed({ SLURP_TOKEN: 'x', SLURP_BACKEND: 'y' }).signedIn, true);
  assert.deepEqual(listed({}).paste?.also, [{ env: 'SLURP_BACKEND', label: 'Address' }]);
  const dir = mkdtempSync(join(tmpdir(), 'toto-pl-'));
  mkdirSync(join(dir, 'slurp'));
  writeFileSync(join(dir, 'slurp', 'manifest.json'), JSON.stringify(slurp));
  assert.deepEqual(loginNames(dir), ['SLURP_TOKEN', 'SLURP_BACKEND']);
});
