import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../../bin/toto-screen', import.meta.url).pathname;
const cli = new URL('./cli.ts', import.meta.url).pathname;

// The script run for real, under a prefix, with stand-ins for the commands that would change the machine.
function machine() {
  const root = mkdtempSync(join(tmpdir(), 'toto-screen-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const log = join(root, 'log');
  for (const [name, body] of Object.entries({ useradd: 'echo "useradd $*" >> "$LOG"', userdel: 'echo "userdel $*" >> "$LOG"', id: 'if [ "$1" = -u ]; then echo 0; else exit 1; fi', systemctl: 'echo "systemctl $*" >> "$LOG"', visudo: 'exit 0' })) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  mkdirSync(join(root, 'etc'), { recursive: true });
  writeFileSync(join(root, 'etc/shells'), '/bin/sh\n/bin/bash\n');
  const env = { PATH: `${bin}:${process.env.PATH}`, TOTO_ROOT: root, LOG: log };
  return { root, log, run: (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8', env }) };
}

test('the screen is put on the display, shows as on, and taken away again, leaving nothing behind', () => {
  const m = machine();
  assert.match(m.run('status').stdout, /^off/);
  const on = m.run('on');
  assert.equal(on.status, 0, on.stderr);
  assert.match(m.run('status').stdout, /^on/);
  const dropin = readFileSync(join(m.root, 'etc/systemd/system/getty@tty1.service.d/zz-toto.conf'), 'utf8');
  assert.match(dropin, /--autologin totoscreen/);
  assert.match(readFileSync(join(m.root, 'etc/sudoers.d/toto-screen'), 'utf8'), /^totoscreen ALL=\(root\) NOPASSWD: \/usr\/local\/bin\/toto\n?$/);
  assert.match(readFileSync(join(m.root, 'usr/local/bin/toto-screen'), 'utf8'), /exec sudo -n \/usr\/local\/bin\/toto/);
  assert.match(readFileSync(join(m.root, 'etc/shells'), 'utf8'), /\/usr\/local\/bin\/toto-screen/);
  // Pi OS leaves tty1's login off for its first-boot wizard to switch on; with no wizard we must.
  assert.match(readFileSync(m.log, 'utf8'), /systemctl enable getty@tty1\.service/);
  assert.match(readFileSync(m.log, 'utf8'), /useradd --system --create-home --shell \/usr\/local\/bin\/toto-screen totoscreen/);
  // Again is harmless: the shell is listed once.
  m.run('on');
  assert.equal(readFileSync(join(m.root, 'etc/shells'), 'utf8').split('\n').filter((l) => l.includes('toto-screen')).length, 1);

  assert.equal(m.run('off').status, 0);
  assert.match(m.run('status').stdout, /^off/);
  for (const file of ['etc/systemd/system/getty@tty1.service.d/zz-toto.conf', 'etc/sudoers.d/toto-screen', 'usr/local/bin/toto-screen']) assert.ok(!existsSync(join(m.root, file)), file);
  assert.ok(!readFileSync(join(m.root, 'etc/shells'), 'utf8').includes('toto-screen'));
  assert.equal(m.run('nonsense').status, 2);
});

test('toto login says the address, the token and the relay, with a code to scan, and toto screen takes only on, off or status', () => {
  const env = { ...process.env, TOTO_TOKEN: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', TOTO_ADDRESS: '192.0.2.9:7860', TOTO_NAME: 'Box', TOTO_RELAY_URL: 'wss://relay.example.test', TOTO_CTL: '/nonexistent/ctl.sock', TOTO_ENV_FILE: '/nonexistent/toto.env' };
  const login = spawnSync('node', [cli, 'login'], { encoding: 'utf8', env });
  assert.equal(login.status, 0, login.stderr);
  for (const text of ['Box is ready', 'ws://192.0.2.9:7860', 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 'wss://relay.example.test', 'toto://add?', '▀']) assert.ok(login.stdout.includes(text), text);
  assert.equal(spawnSync('node', [cli, 'screen', 'sideways'], { encoding: 'utf8', env }).status, 2);
  const none = spawnSync('node', [cli, 'login'], { encoding: 'utf8', env: { ...env, TOTO_TOKEN: '', TOTO_DATA_DIR: mkdtempSync(join(tmpdir(), 'toto-none-')) } });
  assert.notEqual(none.status, 0);
});
