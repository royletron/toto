import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { INSTALL_ENV } from './projects.ts';

/** The setup a project user's home gets, run for real in a home of its own, with `env` as what it is given. */
const setUp = (home: string, env = "export A='1'\n") => spawnSync('sh', ['-c', INSTALL_ENV], { env: { PATH: process.env.PATH, HOME: home }, input: env, encoding: 'utf8' });
const home = () => mkdtempSync(join(tmpdir(), 'toto-home-'));

test('a project user gets a vim setup that works while typing, only if they have none, and the environment file as before', () => {
  const fresh = home();
  assert.equal(setUp(fresh).status, 0);
  assert.equal(readFileSync(join(fresh, '.toto-env'), 'utf8'), "export A='1'\n");
  assert.equal(statSync(join(fresh, '.toto-env')).mode & 0o777, 0o600, 'secrets are private, as they were');
  const rc = readFileSync(join(fresh, '.vimrc'), 'utf8');
  assert.match(rc, /^set nocompatible$/m);
  assert.match(rc, /^set backspace=indent,eol,start$/m);
  // Run again (every start of the server does): what the person changed is theirs.
  writeFileSync(join(fresh, '.vimrc'), 'set number\n');
  assert.equal(setUp(fresh, "export A='2'\n").status, 0);
  assert.equal(readFileSync(join(fresh, '.vimrc'), 'utf8'), 'set number\n');
  assert.equal(readFileSync(join(fresh, '.toto-env'), 'utf8'), "export A='2'\n", 'the environment is rewritten each time');
  // Someone with a vim setup in a folder, as many keep it, is not given a file that would override it.
  const keeps = home();
  mkdirSync(join(keeps, '.vim'));
  assert.equal(setUp(keeps).status, 0);
  assert.ok(!existsSync(join(keeps, '.vimrc')));
});

const hasVi = spawnSync('vi', ['--version']).status === 0;
test('with it, vi is not in Vi-compatible mode and its arrow keys are understood while typing', { skip: !hasVi }, () => {
  const made = home();
  setUp(made);
  const out = join(made, 'out.txt');
  // Started as vi is, not in Ex mode (-e) or silently (-s), which would not read the files this is about.
  spawnSync('vi', ['-c', `redir! > ${out} | set compatible? esckeys? | redir END`, '-c', 'q'], { env: { PATH: process.env.PATH, HOME: made, TERM: 'xterm' }, input: '', timeout: 10_000 });
  // Whatever vi was before (Debian's starts compatible, others do not): with the file it is not, and it reads escape sequences.
  const asked = readFileSync(out, 'utf8').replace(/\s+/g, ' ').trim();
  assert.match(asked, /\bnocompatible\b/);
  assert.match(asked, /\besckeys\b/);
});
