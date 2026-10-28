import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { parse } from './ansi';
import { progressText, useConnection } from './connection';
import { Face } from './face';
import { color, gutter } from './theme';
import { Line } from './terminal';
import { Btn, Screen, Spinner, Txt, useWide } from './ui';

/**
 * Output as a terminal shows it, colours and all, that stays at the newest line unless the person
 * scrolls up to read, and picks up again when they scroll back down.
 */
export function Transcript({ lines, height }: { lines: string[]; height?: number }) {
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  // One parse for the lot, so that a colour set on one line carries on to the next, as in a terminal.
  const rows = useMemo(() => parse(lines.join('\n')), [lines]);
  const onScroll = ({ nativeEvent: n }: NativeSyntheticEvent<NativeScrollEvent>) => {
    follow.current = n.contentSize.height - n.layoutMeasurement.height - n.contentOffset.y < 40;
  };
  return (
    <ScrollView
      ref={scroll}
      style={[{ borderWidth: 1, borderColor: color.rule, backgroundColor: color.bezel }, height ? { height } : { flex: 1 }]}
      contentContainerStyle={{ padding: 10 }}
      onScroll={onScroll}
      scrollEventThrottle={64}
      onContentSizeChange={() => follow.current && scroll.current?.scrollToEnd({ animated: false })}
      nestedScrollEnabled>
      {rows.length ? rows.map((spans, i) => <Line key={i} id={`${i}:${lines[i]}`} spans={spans} />) : <Txt small tone="ghost">Nothing has been logged yet.</Txt>}
    </ScrollView>
  );
}

/**
 * What every app shows while its Toto updates, in place of everything else: the Toto cannot do its
 * usual work, and it restarts partway through, which drops the line for a minute or two. `finished`
 * is the same screen once it is over, with how it went.
 */
export function UpdateScreen({ from, finished, onLeave, onDone }: { from: string; finished: boolean; onLeave: () => void; onDone: () => void }) {
  const { node, status, via, software, progress, jobLog, owner, post } = useConnection();
  const router = useRouter();
  const wide = useWide();
  const mine = progress?.task === 'update' ? progress : undefined;
  const worked = finished && !!software && software.version !== from;

  // The transcript is the owner's to read. Asked for again as it goes, and once more when the line comes back.
  useEffect(() => {
    if (!owner || status !== 'open') return;
    post({ type: 'job_log' });
    if (finished) return;
    const timer = setInterval(() => post({ type: 'job_log' }), 1500);
    return () => clearInterval(timer);
    // `post` is a new function each render; this is about the line and the job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, status, finished]);

  const step = mine?.step ?? 0;
  const of = mine?.of ?? 0;
  const bar = of ? '█'.repeat(Math.min(step, of)) + '░'.repeat(Math.max(of - step, 0)) : '';
  return (
    <Screen bare>
      <View style={{ flex: 1, paddingHorizontal: gutter, paddingVertical: 20, gap: 14, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Face mood={finished ? (worked ? 'awake' : 'failed') : status === 'open' ? 'working' : 'looking'} size={34} nose />
          <View style={{ flex: 1 }}>
            <Txt weight="bold" accessibilityRole="header">
              {finished ? (worked ? 'Updated' : 'The update did not finish') : 'Updating'} {node?.name ?? 'your Toto'}
            </Txt>
            <Txt tone="ghost" small>
              {status === 'open'
                ? `Connected ${via === 'relay' ? 'through the relay' : 'on your network'}.`
                : finished
                  ? 'Reconnecting…'
                  : 'The Toto restarts partway through. Reconnecting…'}
            </Txt>
          </View>
          {!finished && <Spinner wide />}
        </View>
        {finished ? (
          <Txt tone={worked ? 'phosphor' : 'raspberry'}>{worked ? `Now on version ${software?.version}.` : (mine?.text ?? `Still on version ${software?.version ?? from}.`)}</Txt>
        ) : (
          <Txt tone="amber" accessibilityLiveRegion="polite">
            {bar ? `${bar}  ` : ''}
            {mine ? progressText(mine) : 'Starting…'}
          </Txt>
        )}
        {owner ? <Transcript lines={jobLog ?? []} /> : <Txt tone="ghost" small style={{ flex: 1 }}>Only the phone that set this Toto up can follow the details. This changes by itself when the update is over.</Txt>}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {finished && <Btn kind="primary" label="Continue" onPress={onDone} style={{ flex: 1 }} />}
          {!wide && <Btn label="All my Totos" onPress={() => { onLeave(); setTimeout(() => router.navigate('/nodes'), 0); }} style={finished ? undefined : { flex: 1 }} />}
          {wide && !finished && <Btn label="Leave this screen" onPress={onLeave} />}
        </View>
      </View>
    </Screen>
  );
}
