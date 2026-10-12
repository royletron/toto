import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Nothing here can build the image (that is docker.yml's job), but it can catch the commonest ways
// it breaks: a file it copies that has moved, a version that has drifted from install.sh, a script that does not parse.
const root = new URL('../../', import.meta.url).pathname;
const read = (file) => readFileSync(root + file, 'utf8');
const dockerfile = read('docker/Dockerfile');

test('every file the Dockerfile copies is in the repository, and what it leaves out of the build context is not among them', () => {
  const ignored = read('.dockerignore').split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  for (const line of dockerfile.split('\n').filter((l) => l.startsWith('COPY '))) {
    const sources = line.replace(/^COPY\s+/, '').split(/\s+/).slice(0, -1);
    for (const source of sources) {
      assert.ok(existsSync(root + source), `${source} is copied but is not there`);
      assert.ok(!ignored.some((i) => i === source || i === `${source}/`), `${source} is copied but .dockerignore leaves it out`);
    }
  }
});

test('the browser tools in the image are the version install.sh pins, and Node is the same major', () => {
  const pin = (text) => /chrome-devtools-mcp@([\d.]+)/.exec(text)?.[1];
  assert.ok(pin(dockerfile), 'the Dockerfile pins the browser tools');
  assert.equal(pin(dockerfile), pin(read('install.sh')));
  assert.equal(/setup_(\d+)\.x/.exec(dockerfile)?.[1], /setup_(\d+)\.x/.exec(read('install.sh'))?.[1]);
});

test('the entrypoint parses, never prints the token to a log unless asked, and starts the server unprivileged', () => {
  assert.equal(spawnSync('bash', ['-n', root + 'docker/entrypoint.sh']).status, 0);
  const entry = read('docker/entrypoint.sh');
  assert.match(entry, /-t 1.*TOTO_SHOW_LOGIN/s);
  assert.match(entry, /exec setpriv --reuid=toto/);
  // The helper's marker is only ever written by the entrypoint, and only when asked.
  assert.match(entry, /TOTO_NO_FIREWALL:-\}" = 1/);
});
