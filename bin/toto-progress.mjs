// What a root task (an update, a plugin install) is doing, for the server to pass on to the app.
// Root writes it and anyone may read it; nothing in it is believed for anything but showing.
//
// One file for the latest task: { task, text, step, of, at, done, failed }. The server reads it
// while a task is under way, and again when it starts, because an update restarts the server in the
// middle of itself.
import { spawn } from 'node:child_process';
import { appendFileSync, renameSync, writeFileSync } from 'node:fs';

const FILE = process.env.TOTO_PROGRESS ?? '/var/lib/toto-progress.json';
// What the task did as a terminal would show it, colour codes and all: a heading for each step and
// everything the commands printed. The app draws it. A task that starts afresh begins it again; one
// carried on by another process (an update is two) adds to it.
const LOG = `${FILE.replace(/\.json$/, '')}.log`;
// ponytail: a log past this stops growing, so a command gone mad cannot fill the disk. Raise it if updates truly print more.
const BIGGEST = 2 * 1024 * 1024;

function write(record) {
  try {
    writeFileSync(`${FILE}.tmp`, JSON.stringify({ ...record, at: Date.now() }), { mode: 0o644 });
    renameSync(`${FILE}.tmp`, FILE);
  } catch {
    // Telling people how it is going is never worth stopping for.
  }
}

const stamp = () => new Date().toTimeString().slice(0, 8);

/** The last line of whatever a command printed, without the colour and cursor codes. */
export const lastLine = (text) =>
  text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .pop()
    ?.slice(0, 100) ?? '';

/** Progress for one task of `of` steps, `from` of them done already. `task` is 'update' or 'plugin:<name>'. */
export function track(task, of, from = 0) {
  let step = from;
  let last = 0;
  let size = 0;
  let atLineStart = true;
  try {
    writeFileSync(LOG, '', { flag: from ? 'a' : 'w', mode: 0o644 });
  } catch {
    // As with progress itself: never worth stopping for.
  }
  const put = (text) => {
    if (!text || size > BIGGEST) return;
    size += text.length;
    atLineStart = text.endsWith('\n');
    try {
      appendFileSync(LOG, text);
    } catch {}
  };
  // `heading`: a colour for this to be written in the log as a line of its own. The throttled
  // updates while a command runs are not, as everything the command prints is there already.
  const say = (text, extra = {}, heading) => {
    write({ task, text, step, of, ...extra });
    if (heading) put(`${atLineStart ? '' : '\n'}\x1b[2m${stamp()}\x1b[0m \x1b[${heading}m${text.replace(/\s+/g, ' ')}\x1b[0m\n`);
  };
  return {
    /** Moves to the next step. */
    next(text) {
      step++;
      say(text, {}, '1');
    },
    /** Runs a command as the current step, showing the last line it prints. Rejects with that line if it fails. */
    run(text, cmd, args, env = {}) {
      return new Promise((resolve, reject) => {
        // Colour asked for, since a pipe is not a terminal and most tools would otherwise leave it out.
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1', CLICOLOR_FORCE: '1', ...env } });
        let tail = '';
        const seen = (chunk) => {
          put(String(chunk));
          tail = (tail + chunk).slice(-2000);
          // Many lines go by; one write in a few is plenty to show it moving.
          if (Date.now() - last < 400) return;
          last = Date.now();
          const line = lastLine(tail);
          if (line) say(`${text}: ${line}`);
        };
        child.stdout.on('data', seen);
        child.stderr.on('data', seen);
        child.on('error', reject);
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(lastLine(tail) || `${cmd} stopped with ${code}`))));
      });
    },
    done: (text) => say(text, { done: true }, '32'),
    fail: (text) => say(text, { done: true, failed: true }, '31'),
  };
}
