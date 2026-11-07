import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useConnection } from './connection';
import XTerm, { type XTermHandle } from './xterm.dom';

/** Whether a Toto of this version can send a terminal as bytes. An older one sends screens, which `Terminal` draws. */
export const hasRawTerminals = (version?: string) => {
  const [major, minor] = (version ?? '0.0').split('.').map(Number);
  return major > 0 || minor >= 8;
};

/**
 * One of a project's terminals, drawn by a real emulator (see xterm.dom.tsx) from what the Toto's
 * session prints. It opens the terminal once the emulator knows how big it is, keeps the session that
 * size, and types into it whatever the emulator says a key comes to.
 */
export function RawTerminal({ projectId, terminalId }: { projectId: string; terminalId: string }) {
  const { post, status, listenTerm } = useConnection();
  const online = status === 'open';
  const emulator = useRef<XTermHandle>(null);
  // Read when the emulator speaks, which may be after this render's values have been replaced.
  const latest = useRef({ post, online });
  useEffect(() => {
    latest.current = { post, online };
  });
  const size = useRef<{ cols: number; rows: number }>(undefined);
  const opened = useRef(false);

  // What the terminal prints goes into the emulator. The first message of a visit clears it first.
  useEffect(() => listenTerm(terminalId, (m) => emulator.current?.write(m.data, m.reset)), [terminalId, listenTerm]);

  // Opened when there is a line and a size, and again after the line has been lost, which starts the screen afresh.
  const open = () => {
    const { post, online } = latest.current;
    if (!online || !size.current) return;
    post({ type: 'term_open', projectId, terminalId, ...size.current, raw: true });
    opened.current = true;
  };
  useEffect(() => {
    opened.current = false;
    open();
    return () => {
      if (opened.current) latest.current.post({ type: 'term_close', terminalId });
    };
    // `open` reads what it needs from `latest`; this is about the line and the terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, terminalId]);

  return (
    <View style={{ flex: 1 }}>
      <XTerm
        ref={emulator}
        dom={{ style: { flex: 1 }, scrollEnabled: false, bounces: false, hideKeyboardAccessoryView: true, keyboardDisplayRequiresUserAction: false }}
        onData={async (data) => latest.current.post({ type: 'term_raw', terminalId, data })}
        onSize={async (cols, rows) => {
          size.current = { cols, rows };
          if (!opened.current) open();
          else if (latest.current.online) latest.current.post({ type: 'term_resize', terminalId, cols, rows });
        }}
      />
    </View>
  );
}
