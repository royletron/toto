'use dom';
// The terminal itself: xterm.js, which does what a terminal does (the alternate screen full-screen
// programs such as vi switch to, the cursor keys they ask for, the mouse, wide characters, scrollback)
// and says what a key comes to. Expo draws this in the page on the web and in a web view on a phone, so
// it is one thing for both. It is told what the terminal printed (`write`) and tells what to type
// (`onData`) and how big it is (`onSize`); src/rawterminal.tsx joins that to the Toto.
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useDOMImperativeHandle, type DOMImperativeFactory } from 'expo/dom';
import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { NAMED } from './ansi';
import { color } from './theme';

export interface XTermHandle extends DOMImperativeFactory {
  /** Bytes the terminal printed, as base64 (a string). `reset` (true) first clears it to the state of a fresh one. Expo's bridge types its arguments as any JSON, so these are checked when used. */
  write(base64: unknown, reset?: unknown): void;
  focus(): void;
}

// What a phone's keyboard lacks or buries, and what each sends. Arrows and Home/End send other codes
// when a program has asked for application cursor keys, which is why they are worked out at the time.
const KEYS: { label: string; label2?: string; send: (app: boolean) => string }[] = [
  { label: 'esc', send: () => '\x1b' },
  { label: 'tab', send: () => '\t' },
  { label: '^C', send: () => '\x03' },
  { label: '↑', send: (app) => (app ? '\x1bOA' : '\x1b[A') },
  { label: '↓', send: (app) => (app ? '\x1bOB' : '\x1b[B') },
  { label: '←', send: (app) => (app ? '\x1bOD' : '\x1b[D') },
  { label: '→', send: (app) => (app ? '\x1bOC' : '\x1b[C') },
  { label: '/', send: () => '/' },
  { label: '-', send: () => '-' },
  { label: '|', send: () => '|' },
  { label: '~', send: () => '~' },
  { label: 'home', send: (app) => (app ? '\x1bOH' : '\x1b[H') },
  { label: 'end', send: (app) => (app ? '\x1bOF' : '\x1b[F') },
  { label: 'pgup', send: () => '\x1b[5~' },
  { label: 'pgdn', send: () => '\x1b[6~' },
];

const FONT = '"IBMPlexMono_400Regular", "IBM Plex Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

type Props = {
  /** How Expo draws this on a phone (a web view); not used on the web. */
  dom?: import('expo/dom').DOMProps;
  ref?: Ref<XTermHandle>;
  /** What to type: the bytes a key or paste comes to, as text. */
  onData: (data: string) => Promise<void>;
  /** Called with the size in characters, once it is known and whenever it changes. */
  onSize: (cols: number, rows: number) => Promise<void>;
};

export default function XTerm({ ref, onData, onSize }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | undefined>(undefined);
  // Kept as the latest each render, so the terminal made once never calls an old one.
  const data = useRef(onData);
  const size = useRef(onSize);
  useEffect(() => {
    data.current = onData;
    size.current = onSize;
  });
  // Armed by the ctrl key: the next letter typed is sent with control held.
  const ctrl = useRef(false);
  const [armed, setArmed] = useState(false);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    const t = new Terminal({
      fontFamily: FONT,
      fontSize: 13,
      cursorBlink: true,
      scrollback: 2000,
      macOptionIsMeta: true,
      theme: {
        background: color.tube,
        foreground: color.phosphor,
        cursor: color.amber,
        cursorAccent: color.tube,
        selectionBackground: '#4A5240',
        black: NAMED[0], red: NAMED[1], green: NAMED[2], yellow: NAMED[3], blue: NAMED[4], magenta: NAMED[5], cyan: NAMED[6], white: NAMED[7],
        brightBlack: NAMED[8], brightRed: NAMED[9], brightGreen: NAMED[10], brightYellow: NAMED[11], brightBlue: NAMED[12], brightMagenta: NAMED[13], brightCyan: NAMED[14], brightWhite: NAMED[15],
      },
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(host.current!);
    fit.fit();
    term.current = t;
    t.onData((typed) => {
      let out = typed;
      if (ctrl.current && /^[a-z]$/i.test(typed)) {
        out = String.fromCharCode(typed.toUpperCase().charCodeAt(0) - 64);
        ctrl.current = false;
        setArmed(false);
      }
      void data.current(out);
    });
    t.onResize(({ cols, rows }) => void size.current(cols, rows));
    void size.current(t.cols, t.rows);
    const watch = new ResizeObserver(() => fit.fit());
    watch.observe(host.current!);
    t.focus();
    return () => {
      watch.disconnect();
      t.dispose();
      term.current = undefined;
    };
  }, []);

  useDOMImperativeHandle(
    ref as Ref<XTermHandle>,
    () => ({
      write(base64: unknown, reset?: unknown) {
        const t = term.current;
        if (!t || typeof base64 !== 'string') return;
        if (reset === true) t.reset();
        t.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
      },
      focus() {
        term.current?.focus();
      },
    }),
    [],
  );

  // Buttons do not take focus from the terminal, or the keyboard would go down at every tap.
  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  const press = (send: (app: boolean) => string) => term.current?.input(send(!!term.current.modes.applicationCursorKeysMode));
  const key: CSSProperties = { minWidth: 40, minHeight: 36, padding: '0 10px', border: 0, borderBottom: `2px solid ${color.rule}`, borderRadius: 4, background: color.tube, color: color.phosphor, font: `14px ${FONT}`, flex: '0 0 auto' };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: color.tube }}>
      {/* The terminal fills what the keys leave; fitted to it by the ResizeObserver above. */}
      <div ref={host} style={{ flex: 1, minHeight: 0, padding: '6px 0 0 8px' }} />
      {touch && (
        <div style={{ display: 'flex', gap: 6, padding: 6, overflowX: 'auto', background: color.bezel, borderTop: `1px solid ${color.rule}` }}>
          <button type="button" onPointerDown={keep} onClick={() => ((ctrl.current = !ctrl.current), setArmed(ctrl.current))} style={{ ...key, borderBottomColor: armed ? color.amber : color.rule, color: armed ? color.amber : color.phosphor }} aria-pressed={armed}>
            ctrl
          </button>
          {KEYS.map((k) => (
            <button key={k.label} type="button" onPointerDown={keep} onClick={() => press(k.send)} style={key}>
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
