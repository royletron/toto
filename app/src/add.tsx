import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useConnection } from './connection';
import { Face } from './face';
import type { Addition } from './invite';
import { gutter } from './theme';
import { Btn, Txt, Waiting, styles } from './ui';

/** Adds the Toto a scanned link describes, saying what is happening and what went wrong if it does. */
export function Adding({ addition, onDone }: { addition: Addition | undefined; onDone: () => void }) {
  const { addNode } = useConnection();
  const [problem, setProblem] = useState(addition ? '' : 'That code is not a Toto, or part of it is missing.');
  // Once per link: this screen can be drawn more than once, and adding is not free.
  const used = useRef(false);
  useEffect(() => {
    if (!addition || used.current) return;
    used.current = true;
    addNode({ name: addition.name, address: addition.address, relay: addition.relay, token: addition.token }).then((wrong) => (wrong ? setProblem(wrong) : onDone()));
    // `addNode` and `onDone` are new each render; the link is what this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addition]);

  return (
    <View style={[{ paddingHorizontal: gutter, paddingVertical: 24, gap: 16 }, styles.readable]}>
      <Face mood={problem ? 'failed' : 'looking'} size={34} nose />
      {problem ? (
        <>
          <Txt weight="bold">That did not work.</Txt>
          <Txt tone="raspberry" accessibilityLiveRegion="polite">{problem}</Txt>
          <Btn label="OK" onPress={onDone} />
        </>
      ) : (
        <Waiting hint="It is looked for on this network first, then through the relay." after={5}>{`Adding ${addition?.name || 'your Toto'}…`}</Waiting>
      )}
    </View>
  );
}
