import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useConnection } from '../../connection';
import { Terminal } from '../../terminal';
import { ProjectTabs } from '../../tabs';
import { Btn, Empty, Header, Reaching, Screen } from '../../ui';

// A tab's id is picked here and the Toto makes the session when it is first opened. Not a secret, only unique.
const newTab = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 16);

/** A project's terminals, a tab each. Opening the screen always lands in one: the newest, or a new one if there are none. */
export default function TerminalScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { projects, terminals, post, status, loaded } = useConnection();
  const project = projects.find((p) => p.id === id);
  const online = status === 'open';
  const ids = terminals[id];
  // `tab` is the one to open on, when coming from another kind of tab.
  const [chosen, setChosen] = useState<string | undefined>(tab);
  // A tab asked for here that the Toto has not listed yet, while it makes the session.
  const [making, setMaking] = useState<string>();
  const [listed, setListed] = useState(ids);
  if (ids !== listed) {
    setListed(ids);
    if (making && ids?.includes(making)) setMaking(undefined);
  }
  const open = () => {
    const tab = newTab();
    setMaking(tab);
    setChosen(tab);
  };
  // None at all: one is made, so the screen always lands in a terminal.
  if (ids && !ids.length && !making) open();
  const tabs = ids && (making && !ids.includes(making) ? [...ids, making] : ids);
  const shown = chosen && tabs?.includes(chosen) ? chosen : tabs?.at(-1);

  useEffect(() => {
    if (online) post({ type: 'term_list', projectId: id });
    // `post` is new each render; the list is wanted again only when the connection comes back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, online]);

  const close = () =>
    shown &&
    Alert.alert('Close this terminal?', 'Whatever is running in it is stopped.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close terminal', style: 'destructive', onPress: () => post({ type: 'term_kill', projectId: id, terminalId: shown }) },
    ]);

  const small = { minHeight: 32, paddingHorizontal: 10 };
  return (
    <Screen bare>
      <Header parent={project?.name ?? 'toto'} title="terminal" right={shown && <Btn label="Close" onPress={close} disabled={!online} spoken="Close this terminal" style={small} />} />
      {!loaded ? (
        <Reaching what="this project" />
      ) : !project ? (
        <Empty mood="offline">This project is no longer on this Toto. It may have been deleted from another phone.</Empty>
      ) : (
        <>
          <ProjectTabs projectId={id} current={{ kind: 'term', id: shown }} making={making} onTerminal={setChosen} onNew={open} />
          {/* Keyed, so switching tabs closes one session's screen and opens the other's. */}
          {shown ? <Terminal key={shown} projectId={id} terminalId={shown} /> : <Reaching what="its terminals" />}
        </>
      )}
    </Screen>
  );
}
