import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startServer } from './testserver.ts';

const hasTmux = (() => {
  try {
    execFileSync('tmux', ['-V']);
    return true;
  } catch {
    return false;
  }
})();
const origin = mkdtempSync(join(tmpdir(), 'toto-origin-'));
execFileSync('git', ['init', '-q', origin]);
execFileSync('git', ['-C', origin, '-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '--allow-empty', '-m', 'start']);
const { dial } = startServer({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${origin}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://example.test/origin.git' });

const text = (messages: any[]) => messages.filter((m) => m.type === 'term_out').map((m) => Buffer.from(m.data, 'base64').toString()).join('');

test('a terminal can be opened as bytes: the screen first, then what it prints, typing in as an emulator sends it', { skip: !hasTmux, timeout: 60_000 }, async () => {
  const phone = await dial('owner-token');
  phone.send({ type: 'sync' });
  phone.send({ type: 'create_project', name: 'p', repo: 'https://example.test/origin.git' });
  const until = async (what: string, ok: () => boolean) => {
    for (let i = 0; i < 150 && !ok(); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(ok(), what);
  };
  await until('the project is made', () => phone.said.some((m) => m.type === 'state' && m.projects.length));
  const project = phone.said.findLast((m) => m.type === 'state' && m.projects.length).projects[0];
  const tab = 'raw1';
  try {
    phone.send({ type: 'term_open', projectId: project.id, terminalId: tab, cols: 90, rows: 28, raw: true });
    await until('it opens with a fresh screen', () => phone.said.some((m) => m.type === 'term_out' && m.reset));
    // Typed as xterm.js sends it: text, and Enter as a carriage return.
    phone.send({ type: 'term_raw', terminalId: tab, data: "printf 'a\\033[1mb\\033[0mc %s\\n' é\r" });
    await until('what the shell prints comes back as bytes, with the escape codes in it', () => text(phone.said).includes('a\x1b[1mb\x1b[0mc é'));
    // Its tab is named for the command.
    await until('the last command names the tab', () => phone.said.some((m) => m.type === 'terms' && Object.values(m.titles ?? {}).some((t) => String(t).startsWith('printf'))));

    // Resized to the emulator.
    phone.send({ type: 'term_resize', terminalId: tab, cols: 100, rows: 30 });
    await until('the session is resized', () => execFileSync('tmux', ['display-message', '-p', '-t', `toto-${project.id}-${tab}`, '#{pane_width}x#{pane_height}']).toString().trim() === '100x30');

    // Someone else arriving later is shown the screen as it is, and then what follows.
    const other = await dial('owner-token');
    other.send({ type: 'sync' });
    other.send({ type: 'term_open', projectId: project.id, terminalId: tab, cols: 100, rows: 30, raw: true });
    await until('the late viewer is given the screen', () => other.said.some((m) => m.type === 'term_out' && m.reset));
    assert.match(text(other.said), /c é/, 'what was printed before they came is on it');
    phone.send({ type: 'term_raw', terminalId: tab, data: "echo later\r" });
    await until('both see what comes next', () => text(other.said).includes('later') && text(phone.said).includes('later'));

    // Typing from a client that has not opened it goes nowhere.
    const stranger = await dial('owner-token');
    stranger.send({ type: 'term_raw', terminalId: tab, data: 'echo sneaky\r' });
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(!text(phone.said).includes('sneaky'));
  } finally {
    phone.send({ type: 'term_kill', projectId: project.id, terminalId: tab });
    await new Promise((r) => setTimeout(r, 300));
  }
});
