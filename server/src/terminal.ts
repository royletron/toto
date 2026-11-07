import { spawn } from 'node:child_process';
import type { TermKey } from '../../protocol.ts';
import { run, command } from './projects.ts';

// A project's terminal is a tmux session owned by the project's user, one per tab. tmux keeps it alive across
// server restarts and with nobody watching, and is the terminal emulator: we send the app its
// finished screen, colour codes included, each time the session prints something.
//
// ponytail: whole-screen snapshots, not a byte stream, so every update resends the screen and
// very fast output is sampled at about 20 frames a second. A pty streamed to an emulator in the
// app would be finer-grained; this needs no emulator and no native code on either side.
// tmux is also the list of them: a session called toto-<project>-<tab>, so nothing is kept here
// that could disagree with what is really running.
const session = (projectId: string, id: string) => `toto-${projectId}-${id}`;

/** A tab's id: chosen by the app when it opens one, so it is checked before going near tmux. */
export const isTerminalId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9]{1,16}$/.test(id);

const NAMED: Record<string, string> = {
  enter: 'Enter', tab: 'Tab', escape: 'Escape', backspace: 'BSpace',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  home: 'Home', end: 'End', pageup: 'PPage', pagedown: 'NPage',
};

/** tmux's name for a key, or undefined if it is not one we pass on. */
export function tmuxKey(key: unknown): string | undefined {
  if (typeof key !== 'string') return undefined;
  if (Object.hasOwn(NAMED, key)) return NAMED[key];
  const ctrl = /^ctrl-([a-z])$/.exec(key);
  return ctrl ? `C-${ctrl[1]}` : undefined;
}

/**
 * Follows what is typed into one terminal to know the last command run in it, for naming its tab.
 * It goes by keystrokes, not by asking the shell, so it is a good guess and no more: a line changed
 * by recalling history or tab completion is not known, and is left out; text typed into a program
 * that is running counts as a command.
 */
export function typing() {
  let line = '';
  let unsure = false;
  let last: string | undefined;
  const enter = () => {
    const command = line.trim();
    const changed = !!command && !unsure && command.slice(0, 60) !== last;
    if (command && !unsure) last = command.slice(0, 60);
    line = '';
    unsure = false;
    return changed;
  };
  return {
    get last() {
      return last;
    },
    /** Takes in some typing; says whether the last command changed. */
    feed(text?: string, key?: unknown) {
      let changed = false;
      const chars = [...(text ?? '')];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === '\n' || ch === '\r') changed = enter() || changed;
        else if (ch === '\x7f' || ch === '\b') line = line.slice(0, -1);
        else if (ch === '\x03' || ch === '\x15' || ch === '\x04') [line, unsure] = ['', false];
        else if (ch === '\x1b') {
          // A real terminal sends keys as escape sequences (an arrow is ESC [ A). They are not text, and
          // whatever they did to the line is not known.
          unsure = true;
          if (chars[i + 1] === '[') for (i += 2; i < chars.length && !(chars[i] >= '@' && chars[i] <= '~'); i++);
          else i += 1;
        } else if (ch < ' ') unsure = true;
        else line += ch;
      }
      if (key === 'enter') changed = enter() || changed;
      else if (key === 'backspace') line = line.slice(0, -1);
      else if (key === 'ctrl-c' || key === 'ctrl-u' || key === 'ctrl-d') [line, unsure] = ['', false];
      // Anything else that moves about or edits the line leaves it not what was typed.
      else if (typeof key === 'string' && !/^(pageup|pagedown)$/.test(key)) unsure = true;
      return changed;
    },
  };
}

const ENSURE = `tmux has-session -t "$1" 2>/dev/null || tmux new-session -d -s "$1" -x "$2" -y "$3"; tmux resize-window -t "$1" -x "$2" -y "$3"`;
const SCROLLBACK = 300;

// One long-lived process per open terminal, run as the project's user. It carries keystrokes in
// and screens out, so nothing typed ever passes through sudo's command line (which sudo logs).
//
// Out: a frame per change: "cursor_x cursor_y rows", the scrollback and screen with escape
// codes, then a NUL. In: a line per keystroke: "t <base64>" types text, "k <name>" presses a key.
const SERVE = `
name=$1
# In the user's home, so that deleting a project (which kills this without warning) takes it too.
fifo=$(mktemp -u "$HOME/.toto-term.XXXXXX")
mkfifo -m 600 "$fifo" || exit 1
typist=
cleanup() {
  tmux pipe-pane -t "$name" 2>/dev/null
  [ -n "$typist" ] && kill "$typist" 2>/dev/null
  rm -f "$fifo"
}
trap cleanup EXIT
trap 'exit 0' PIPE HUP INT TERM

# Whatever the session prints is also copied into the fifo. Nobody reads it for its content: data
# arriving is the signal that the screen has changed.
tmux pipe-pane -t "$name" "cat > '$fifo'"
exec 3<>"$fifo" # held open both ways, so the writer never blocks and a read never sees end-of-file
exec 5<"$fifo"  # a second handle for draining without waiting

exec 4<&0 # a background loop gets no stdin of its own
while IFS=' ' read -r kind arg; do
  case $kind in
    t) tmux send-keys -t "$name" -l -- "$(printf %s "$arg" | base64 -d)" ;;
    k) tmux send-keys -t "$name" "$arg" ;;
  esac
done <&4 &
typist=$!

while tmux display-message -p -t "$name" '#{cursor_x} #{cursor_y} #{pane_height}' &&
  tmux capture-pane -e -p -S -${SCROLLBACK} -t "$name" && printf '\\0'; do
  # Sleep until the session prints something, or a second passes in case a change was missed.
  timeout 1 dd bs=65536 count=1 <&3 >/dev/null 2>&1
  # Let a burst finish, then throw away the rest of it so one burst means one frame.
  sleep 0.03
  dd bs=65536 count=64 iflag=nonblock <&5 >/dev/null 2>&1
done
`;

export type Screen = { screen: string; cursor: { row: number; col: number } };

/** Reads one frame of SERVE's output. The cursor comes back as a position within `screen`. */
export function readFrame(frame: string): Screen {
  const [head, ...lines] = frame.replace(/\n$/, '').split('\n');
  const [x = 0, y = 0, rows = lines.length] = head.split(' ').map(Number);
  // The visible rows are the last `rows` lines; everything above is scrollback.
  const row = Math.max(0, lines.length - rows) + y;
  // Blank rows below both the text and the cursor are just the unused part of the pane.
  let last = lines.length - 1;
  while (last > row && lines[last].trim() === '') last--;
  return { screen: lines.slice(0, last + 1).join('\n'), cursor: { row, col: x } };
}

type Where = { user?: string; cwd: string; projectId: string };

/** The ids of a project's sessions, oldest first, out of `tmux list-sessions` lines of "created name". */
export function terminalIds(projectId: string, listed: string) {
  const prefix = session(projectId, '');
  return listed
    .split('\n')
    .map((line) => line.split(' '))
    .filter(([, name]) => name?.startsWith(prefix) && isTerminalId(name.slice(prefix.length)))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, name]) => name.slice(prefix.length));
}

export const listTerminals = ({ user, cwd, projectId }: Where) =>
  run(user, cwd, 'tmux', ['list-sessions', '-F', '#{session_created} #{session_name}']).then(({ stdout }) => terminalIds(projectId, stdout), () => []);

/** Creates the session if it is not there, and fits it to the viewer's screen. */
export const openTerminal = ({ user, cwd, projectId }: Where, id: string, cols: number, rows: number) =>
  run(user, cwd, 'sh', ['-c', ENSURE, 'sh', session(projectId, id), String(cols), String(rows)]);

export const killTerminal = ({ user, cwd, projectId }: Where, id: string) =>
  run(user, cwd, 'tmux', ['kill-session', '-t', session(projectId, id)]).catch(() => {});

/** Gives a session made under an older name, `toto-<id>` for what used to be a terminal agent, its place as a tab. */
export const adoptTerminal = ({ user, cwd, projectId }: Where, id: string) =>
  run(user, cwd, 'tmux', ['rename-session', '-t', `toto-${id}`, session(projectId, id)]).catch(() => {});

/**
 * Attaches to a session: `onScreen` is called with its screen each time it changes, `type` sends
 * it keystrokes, and `stop` lets go. `onEnd` is called once it has let go, for whatever reason.
 */
export function watchTerminal({ user, cwd, projectId }: Where, id: string, onScreen: (screen: Screen) => void, onEnd: () => void) {
  const [file, args, opts] = command(user, cwd, 'sh', ['-c', SERVE, 'sh', session(projectId, id)]);
  const child = spawn(file, args, { ...opts, stdio: ['pipe', 'pipe', 'ignore'] });
  child.on('error', () => {});
  // Also when the shell in it exits, which ends the session: the tab is gone.
  child.on('exit', onEnd);
  child.stdin.on('error', () => {}); // the session ended under a keystroke
  let buffer = '';
  let last: string | undefined;
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    const frames = (buffer + chunk).split('\0');
    buffer = frames.pop()!;
    const frame = frames.pop();
    if (frame !== undefined && frame !== last) onScreen(readFrame((last = frame)));
  });
  return {
    /** Types `text`, then presses `key`. Unknown keys are dropped. */
    type: (text?: string, key?: TermKey) => {
      if (text) child.stdin.write(`t ${Buffer.from(text).toString('base64')}\n`);
      const name = tmuxKey(key);
      if (name) child.stdin.write(`k ${name}\n`);
    },
    // Under sudo the process is not ours to signal; closing both ends makes it exit and clean up.
    stop: () => {
      child.stdin.end();
      child.stdout.destroy();
    },
  };
}

// --- A terminal as a stream of bytes, for an emulator in the app (xterm.js) to draw. The frames above
// are snapshots of what tmux has already worked out; this is what the session prints, as it prints it,
// so the app's emulator does the work and full-screen programs such as vi look as they should.
//
// It rides on tmux's control mode, which can run beside the frame watcher (a pane has only one
// pipe-pane, so that could not be shared): `tmux -C attach` prints `%output %<pane> <bytes>` for
// everything the pane prints, with control characters and backslashes as three-digit octal (\033),
// and takes commands on stdin.

/** The bytes of a control-mode `%output` line's data: `\ooo` is the byte with that octal value. */
export function unescapeOutput(data: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const octal = data[i] === 0x5c && i + 3 < data.length ? data.subarray(i + 1, i + 4).toString('latin1') : '';
    if (/^[0-7]{3}$/.test(octal)) {
      out.push(parseInt(octal, 8));
      i += 3;
    } else out.push(data[i]);
  }
  return Buffer.from(out);
}

/**
 * Reads control-mode output a chunk at a time, and calls `onOutput` with the bytes of each pane's output.
 * Everything else it says (replies to commands, layout changes) is not wanted. A line ends at a newline;
 * the newlines in output itself are escaped, so one cannot be mistaken for the end.
 * ponytail: all panes, which is the one pane of a terminal unless someone splits it with tmux's own keys.
 */
export function controlOutput(onOutput: (bytes: Buffer) => void) {
  let rest: Buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    rest = Buffer.concat([rest, chunk]);
    for (let end = rest.indexOf(0x0a); end >= 0; end = rest.indexOf(0x0a)) {
      const line = rest.subarray(0, end);
      rest = rest.subarray(end + 1);
      if (line.subarray(0, 8).toString('latin1') !== '%output ') continue;
      // After "%output %<pane> ".
      const space = line.indexOf(0x20, 8);
      if (space >= 0) onOutput(unescapeOutput(line.subarray(space + 1)));
    }
  };
}

/** The bytes to type for `text`, as the hexadecimal `send-keys -H` takes, a command line for every so many. */
export function typeCommands(name: string, text: string, per = 400): string[] {
  const bytes = Buffer.from(text, 'utf8');
  const lines: string[] = [];
  for (let at = 0; at < bytes.length; at += per) lines.push(`send-keys -t ${name} -H ${[...bytes.subarray(at, at + per)].map((b) => b.toString(16)).join(' ')}`);
  return lines;
}

/** The modes a program in the session has set, and where its cursor is, as tmux reports them. */
const FLAGS = ['alternate_on', 'keypad_cursor_flag', 'keypad_flag', 'cursor_flag', 'wrap_flag', 'insert_flag', 'mouse_standard_flag', 'mouse_button_flag', 'mouse_any_flag', 'mouse_sgr_flag', 'mouse_utf8_flag', 'cursor_x', 'cursor_y'];
const SNAPSHOT = `tmux display-message -p -t "$1" '${FLAGS.map((f) => `#{${f}}`).join(' ')}' && printf '\\0' && tmux capture-pane -e -p -S -${SCROLLBACK} -t "$1"`;

/**
 * What to feed an emulator that has only just been attached, to make it look like the session does now:
 * the screen the program has switched to, its modes, the text with its colours, and the cursor. Takes
 * the output of the script above (flags, a NUL, the screen with scrollback).
 */
export function snapshotBytes(raw: string): Buffer {
  const [head = '', ...body] = raw.split('\0');
  const [alt, appCursor, appKeypad, cursor, wrap, insert, mouse, drag, any, sgr, utf8, x = 0, y = 0] = head.trim().split(' ').map(Number);
  const lines = body.join('\0').replace(/\n$/, '').split('\n');
  const on = (flag: number | undefined, set: string, unset = '') => (flag ? set : unset);
  return Buffer.from(
    on(alt, '\x1b[?1049h') +
      on(appCursor, '\x1b[?1h') +
      on(appKeypad, '\x1b=') +
      on(!wrap ? 1 : 0, '\x1b[?7l') +
      on(insert, '\x1b[4h') +
      on(mouse, '\x1b[?1000h') +
      on(drag, '\x1b[?1002h') +
      on(any, '\x1b[?1003h') +
      on(utf8, '\x1b[?1005h') +
      on(sgr, '\x1b[?1006h') +
      '\x1b[H\x1b[2J' +
      lines.map((l) => `${l}\x1b[0m`).join('\r\n') +
      `\x1b[${y + 1};${x + 1}H` +
      on(!cursor ? 1 : 0, '\x1b[?25l'),
  );
}

/** A fresh emulator's view of the session as it is now. */
export const snapshotTerminal = ({ user, cwd, projectId }: Where, id: string) =>
  run(user, cwd, 'sh', ['-c', SNAPSHOT, 'sh', session(projectId, id)]).then(({ stdout }) => snapshotBytes(stdout));

/**
 * Attaches to a session in control mode: `onData` gets what it prints, in bytes, `type` types raw bytes
 * (what an emulator's keys come to), `resize` fits the session to the emulator, and `stop` lets go.
 * `onEnd` is called once it has let go, for whatever reason, which includes the session ending.
 */
export function streamTerminal({ user, cwd, projectId }: Where, id: string, onData: (bytes: Buffer) => void, onEnd: () => void) {
  const name = session(projectId, id);
  const [file, args, opts] = command(user, cwd, 'sh', ['-c', 'exec tmux -C attach-session -t "$1"', 'sh', name]);
  const child = spawn(file, args, { ...opts, stdio: ['pipe', 'pipe', 'ignore'] });
  child.on('error', () => {});
  child.on('exit', onEnd);
  child.stdin.on('error', () => {});
  const parse = controlOutput(onData);
  // Attached once it has said anything (even an empty reply), after which nothing the session prints is missed.
  let attached = () => {};
  const ready = new Promise<void>((done) => (attached = done));
  child.stdout.on('data', (chunk: Buffer) => {
    attached();
    parse(chunk);
  });
  child.on('exit', () => attached());
  const tell = (line: string) => child.stdin.write(line + '\n');
  return {
    ready,
    type: (text: string) => typeCommands(name, text).forEach(tell),
    resize: (cols: number, rows: number) => tell(`resize-window -t ${name} -x ${cols} -y ${rows}`),
    stop: () => {
      child.stdin.end();
      child.stdout.destroy();
    },
  };
}
