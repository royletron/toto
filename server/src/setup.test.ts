import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SETUP } from './plugins.ts';

const dir = (what: string) => mkdtempSync(join(tmpdir(), `toto-${what}-`));
/** What the server runs for a plugin's setup, in a home of its own: `sh -c SETUP sh <name> <version> <script>`. */
const setUp = (home: string, name: string, version: string, script: string) => spawnSync('sh', ['-c', SETUP, 'sh', name, version, script], { env: { PATH: process.env.PATH, HOME: home }, encoding: 'utf8' });
const script = (body: string) => {
  const file = join(dir('script'), 'setup.sh');
  writeFileSync(file, body);
  return file;
};

test('a plugin setup runs once for each version, in the home folder, and only counts when it worked', () => {
  const home = dir('home');
  const counting = script('pwd >> "$HOME/ran.txt"\n');
  assert.equal(setUp(home, 'p', '1.0.0', counting).status, 0);
  assert.ok(readFileSync(join(home, 'ran.txt'), 'utf8').trim().endsWith(home.split('/').pop()!), 'it ran in the home folder');
  // Again, as every start of the server does: not again.
  setUp(home, 'p', '1.0.0', counting);
  assert.equal(readFileSync(join(home, 'ran.txt'), 'utf8').trim().split('\n').length, 1);
  // A new version of the plugin is a new setup, and another plugin is its own.
  setUp(home, 'p', '1.1.0', counting);
  setUp(home, 'other', '1.0.0', counting);
  assert.equal(readFileSync(join(home, 'ran.txt'), 'utf8').trim().split('\n').length, 3);
  // One that fails leaves no mark, so it is tried again.
  const failing = script('echo tried >> "$HOME/failed.txt"; exit 3\n');
  assert.notEqual(setUp(home, 'bad', '1.0.0', failing).status, 0);
  setUp(home, 'bad', '1.0.0', failing);
  assert.equal(readFileSync(join(home, 'failed.txt'), 'utf8').trim().split('\n').length, 2);
  assert.ok(!existsSync(join(home, '.toto-setup', 'bad-1.0.0')));
});

test('the SpaceVim setup puts it where Neovim looks, at a release, and leaves anyone who has a configuration alone', () => {
  const real = new URL('../../plugins/spacevim/setup.sh', import.meta.url).pathname;
  // A git that only says what it was asked and makes the folder, so nothing is fetched.
  const bin = dir('bin');
  writeFileSync(join(bin, 'git'), ['#!/bin/sh', 'echo "$@" >> "$HOME/git.log"', 'for last; do :; done', 'mkdir -p "$last"', ''].join('\n'));
  chmodSync(join(bin, 'git'), 0o755);
  const run = (home: string) => spawnSync('sh', [real], { env: { PATH: `${bin}:${process.env.PATH}`, HOME: home }, encoding: 'utf8' });

  const fresh = dir('home');
  const result = run(fresh);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(fresh, 'git.log'), 'utf8'), /clone .*--branch v2\.4\.0 https:\/\/github\.com\/SpaceVim\/SpaceVim /);
  assert.equal(readlinkSync(join(fresh, '.config', 'nvim')), join(fresh, '.SpaceVim'));
  // Run again: nothing is fetched or replaced.
  assert.equal(run(fresh).status, 0);
  assert.equal(readFileSync(join(fresh, 'git.log'), 'utf8').trim().split('\n').length, 1);

  // Someone with their own Neovim configuration keeps it: no clone, no link.
  const own = dir('home');
  mkdirSync(join(own, '.config', 'nvim'), { recursive: true });
  assert.equal(run(own).status, 0);
  assert.ok(!existsSync(join(own, 'git.log')) && !existsSync(join(own, '.SpaceVim')));
  assert.ok(!lstatSync(join(own, '.config', 'nvim')).isSymbolicLink());
});

test('the Slurp setup installs only a download that matches its checksum, says plainly when there is no build for the machine, and does nothing if the right one is there', () => {
  const real = new URL('../../plugins/slurp/setup.sh', import.meta.url).pathname;
  /** Stand-ins for what it calls: a curl that "downloads" what it is given, and a uname that says what machine this is. */
  const tools = (machine: string, download: string) => {
    const bin = dir('bin');
    const file = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    file('uname', `echo ${machine}`);
    file('curl', `while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done; printf %s '${download}' > "$out"; echo "$@" >> "$HOME/curl.log"`);
    return bin;
  };
  const run = (home: string, bin: string) => spawnSync('sh', [real], { env: { PATH: `${bin}:${process.env.PATH}`, HOME: home }, encoding: 'utf8' });

  // A download that is not the release it should be: refused, and nothing installed.
  const wrong = dir('home');
  const refused = run(wrong, tools('aarch64', 'not the release'));
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /not the release it should be/);
  assert.ok(!existsSync(join(wrong, '.local', 'bin', 'slurp')), 'nothing was put in place');
  assert.ok(!existsSync(join(wrong, '.bashrc')), 'and nothing else was changed');

  // A machine it has no build for.
  const odd = dir('home');
  const none = run(odd, tools('riscv64', 'x'));
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /no build of it for riscv64/);
  assert.ok(!existsSync(join(odd, 'curl.log')), 'it did not even try to download');

  // The right one already there: it is left alone, and nothing is fetched.
  const done = dir('home');
  mkdirSync(join(done, '.local', 'bin'), { recursive: true });
  writeFileSync(join(done, '.local', 'bin', 'slurp'), '#!/bin/sh\necho "slurp-cli 0.3.0"\n');
  chmodSync(join(done, '.local', 'bin', 'slurp'), 0o755);
  assert.equal(run(done, tools('x86_64', 'x')).status, 0);
  assert.ok(!existsSync(join(done, 'curl.log')), 'nothing was fetched');
});
