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
