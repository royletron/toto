import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { controlOutput, killTerminal, openTerminal, snapshotBytes, snapshotTerminal, streamTerminal, typeCommands, typing, unescapeOutput } from './terminal.ts';

test('control-mode output is unescaped to the bytes the program printed', () => {
  assert.deepEqual([...unescapeOutput(Buffer.from('\\033[1mhi\\033[0m a\\134b\\015\\012'))], [...Buffer.from('\x1b[1mhi\x1b[0m a\\b\r\n')]);
  // Bytes above ASCII come through as they are, and a backslash that is not an escape is left alone.
  assert.equal(unescapeOutput(Buffer.from('é✓ \\x \\12')).toString(), 'é✓ \\x \\12');
});

test('only pane output is taken from control mode, whole lines at a time, however the chunks fall', () => {
  const got: string[] = [];
  const feed = controlOutput((b) => got.push(b.toString()));
  const stream = '%begin 1 2 1\n%end 1 2 1\n%output %0 hel\\033[Alo\n%layout-change @0 x\n%output %3 \\015\\012wor\n%exit\n';
  // Split in the middle of a line, and of an escape.
  for (const piece of [stream.slice(0, 40), stream.slice(40, 60), stream.slice(60)]) feed(Buffer.from(piece));
  assert.deepEqual(got, ['hel\x1b[Alo', '\r\nwor']);
});

test('typing is sent as raw bytes, hexadecimal, in lines of a size tmux will take', () => {
  assert.deepEqual(typeCommands('toto-p-x', '\x1b[A'), ['send-keys -t toto-p-x -H 1b 5b 41']);
  assert.deepEqual(typeCommands('n', 'é'), ['send-keys -t n -H c3 a9']);
  assert.deepEqual(typeCommands('n', 'abcd', 3).map((l) => l.split(' -H ')[1]), ['61 62 63', '64']);
  assert.deepEqual(typeCommands('n', ''), []);
});

test('a snapshot paints the screen, in the modes the program set, with the cursor where it is', () => {
  const flags = (o: Partial<Record<string, number>>) => ['alt', 'appCursor', 'appKeypad', 'cursor', 'wrap', 'insert', 'mouse', 'drag', 'any', 'sgr', 'utf8', 'x', 'y'].map((k) => o[k] ?? (k === 'cursor' || k === 'wrap' ? 1 : 0)).join(' ');
  const plain = snapshotBytes(`${flags({ x: 3, y: 1 })}\0top\n\x1b[31mred\x1b[0m\n`).toString();
  assert.equal(plain, '\x1b[H\x1b[2Jtop\x1b[0m\r\n\x1b[31mred\x1b[0m\x1b[0m\x1b[2;4H');
  const vi = snapshotBytes(`${flags({ alt: 1, appCursor: 1, cursor: 0, mouse: 1, sgr: 1, x: 0, y: 0 })}\0~\n`).toString();
  assert.ok(vi.startsWith('\x1b[?1049h\x1b[?1h'), 'it switches to the alternate screen first, and sets application cursor keys');
  assert.ok(vi.includes('\x1b[?1000h') && vi.includes('\x1b[?1006h'), 'mouse reporting as the program asked for it');
  assert.ok(vi.endsWith('\x1b[1;1H\x1b[?25l'), 'and the cursor hidden if it was');
});

test('typing at a real terminal is followed too: arrows and history are not text', () => {
  const t = typing();
  t.feed('ls -la\r');
  assert.equal(t.last, 'ls -la');
  // Recalling history with the up arrow, then Enter: not known, so left as it was.
  t.feed('\x1b[A\r');
  assert.equal(t.last, 'ls -la');
  // A slip put right with backspace, and an arrow's letters not mistaken for typing.
  t.feed('echo hx\x7fi\x1b[D\x1b[C');
  t.feed('\r');
  assert.equal(t.last, 'ls -la', 'a line moved about in is not guessed at');
  t.feed('echo hx\x7fi\r');
  assert.equal(t.last, 'echo hi');
  t.feed('sleep 9\x03');
  t.feed('pwd\r');
  assert.equal(t.last, 'pwd');
});

// Needs tmux, as the server does. It makes its own session and removes it.
const hasTmux = (() => {
  try {
    execFileSync('tmux', ['-V']);
    return true;
  } catch {
    return false;
  }
})();

test('a live session streams what it prints, takes raw keystrokes, and a late viewer is given the screen as it is', { skip: !hasTmux, timeout: 30_000 }, async () => {
  const where = { cwd: '/tmp', projectId: `streamtest${process.pid}` };
  const id = 'a1';
  await openTerminal(where, id, 80, 24);
  try {
    let seen = '';
    const stream = streamTerminal(where, id, (b) => (seen += b.toString()), () => {});
    const until = async (what: string, ok: () => boolean) => {
      for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
      assert.ok(ok(), `${what}; saw ${JSON.stringify(seen.slice(-200))}`);
    };
    await new Promise((r) => setTimeout(r, 400));
    // Typed as an emulator's keys: text, then Enter as the carriage return a terminal sends.
    stream.type("printf 'one\\033[1mtwo\\033[0m %s\\n' é\r");
    await until('the output comes back with its escape codes', () => seen.includes('one\x1b[1mtwo\x1b[0m é'));
    // Resizing fits the session to the emulator.
    stream.resize(100, 30);
    await until('resized', () => execFileSync('tmux', ['display-message', '-p', '-t', `toto-${where.projectId}-${id}`, '#{pane_width}x#{pane_height}']).toString().trim() === '100x30');
    // Someone arriving now is shown what is on the screen, colours and all, and where the cursor is.
    const snap = (await snapshotTerminal(where, id)).toString();
    assert.ok(snap.includes('one\x1b[1mtwo') || snap.includes('two'), 'the earlier output is in it');
    assert.match(snap, /\x1b\[\d+;\d+H$/);
    stream.stop();
  } finally {
    await killTerminal(where, id);
  }
});
