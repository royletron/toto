import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// The root helper, run for real with stand-ins for the system tools it calls.
const priv = new URL('../../bin/toto-priv', import.meta.url).pathname;
const bin = mkdtempSync(join(tmpdir(), 'toto-priv-'));
const fake = (name, script) => {
  writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`);
  chmodSync(join(bin, name), 0o755);
};
const run = (...args) => spawnSync('bash', [priv, ...args], { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}` } });

test('listing Wi-Fi prints the networks and succeeds', () => {
  fake('nmcli', 'echo "*:70:WPA2:Home"; echo " :40::Cafe"');
  const { status, stdout, stderr } = run('wifi-list');
  assert.equal(stderr, '');
  assert.equal(status, 0);
  assert.equal(stdout, '*:70:WPA2:Home\n :40::Cafe\n');
});

test('anything that is not one of its commands, or names no project user, is refused', () => {
  for (const args of [[], ['wifi-list-all'], ['delete-user', 'root'], ['create-user', 'toto-p-zzzzzzzz'], ['wifi-country', 'gb; reboot'], ['plugin-install'], ['plugin-install', '../gh'], ['plugin-remove', 'gh;reboot'], ['plugin-install', 'Gh']]) assert.equal(run(...args).status, 2, args.join(' '));
});

test('without the capability to change the firewall, the helper still says so, and only a file root wrote lets it carry on', () => {
  // A firewall tool that cannot do its job, as in a container without NET_ADMIN.
  fake('nft', 'echo "Operation not permitted" >&2; exit 1');
  fake('id', 'echo 50001');
  const walled = { PATH: `${bin}:${process.env.PATH}`, TOTO_NO_FIREWALL_FILE: '/nonexistent/no-firewall' };
  const without = spawnSync('bash', [priv, 'restrict-lan', 'toto-p-aaaaaaaa'], { encoding: 'utf8', env: walled });
  assert.notEqual(without.status, 0, 'no firewall and no file: it fails, it does not carry on');
  const marker = join(mkdtempSync(join(tmpdir(), 'toto-nofw-')), 'no-firewall');
  writeFileSync(marker, '');
  const allowed = { PATH: walled.PATH, TOTO_NO_FIREWALL_FILE: marker };
  for (const verb of ['restrict-lan', 'allow-lan']) assert.equal(spawnSync('bash', [priv, verb, 'toto-p-aaaaaaaa'], { encoding: 'utf8', env: allowed }).status, 0, verb);
});

test('the display log runs its fixed checks, shows what each said even when it failed, and takes no arguments', () => {
  for (const name of ['getent', 'passwd', 'ls', 'cat', 'systemctl', 'sudo', 'timeout']) fake(name, `echo "${name} said $1"; exit 1`);
  fake('journalctl', 'echo "Oct 01 getty[1]: login: PAM failure for totoscreen"; echo "Oct 01 unrelated"');
  const { status, stdout } = run('display-log');
  assert.equal(status, 0);
  assert.match(stdout, /--- \/opt\/toto\/bin\/toto-screen status\n/);
  assert.match(stdout, /--- journal\n.*PAM failure for totoscreen/);
  assert.doesNotMatch(stdout, /unrelated/);
});
