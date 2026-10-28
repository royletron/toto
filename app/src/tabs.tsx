import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar } from './avatar';
import { useConnection } from './connection';
import { color, gutter, tap } from './theme';
import { Txt } from './ui';

/** How much of a name or command a tab shows. */
const SHOWN = 10;
export const cut = (text: string) => ([...text].length > SHOWN ? `${[...text].slice(0, SHOWN - 1).join('')}…` : text);

/**
 * A project's agents and terminals as one row of tabs: each agent by its face and name, each terminal
 * by the last command typed into it. It scrolls sideways, and brings the tab you are on into view.
 * Choosing a tab goes to that agent or terminal, in place of this one; `onTerminal` lets the terminal
 * screen change tabs without leaving itself, and `onNew` adds a "+" for a new terminal.
 */
export function ProjectTabs({ projectId, current, making, onTerminal, onNew }: { projectId: string; current: { kind: 'agent' | 'term'; id?: string }; making?: string; onTerminal?: (id: string) => void; onNew?: () => void }) {
  const { agents, terminals, termTitles, activity, post, status, software } = useConnection();
  const router = useRouter();
  const online = status === 'open';
  const mine = agents.filter((a) => a.projectId === projectId);
  const listed = terminals[projectId] ?? [];
  const shells = making && !listed.includes(making) ? [...listed, making] : listed;

  // The terminal screen asks for its own list; anywhere else this is how the tabs learn of the terminals.
  // An older Toto, from before terminals, would answer with an error to put up.
  const [major, minor] = (software?.version ?? '0.0').split('.').map(Number);
  const hasTerminals = major > 0 || minor >= 7;
  useEffect(() => {
    if (online && hasTerminals && !onTerminal) post({ type: 'term_list', projectId });
    // `post` is a new function each render; the list is wanted again only when the line comes back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, online, hasTerminals]);

  const here = current.id && `${current.kind}:${current.id}`;
  const scroll = useRef<ScrollView>(null);
  const spots = useRef<Record<string, { x: number; width: number }>>({});
  const reveal = (key?: string | false) => {
    const spot = key ? spots.current[key] : undefined;
    // Not flush with the edge, so the tab after it can be seen to be there.
    if (spot) scroll.current?.scrollTo({ x: Math.max(0, spot.x - 48), animated: true });
  };
  useEffect(() => reveal(here), [here, mine.length, shells.length]);
  const place = (key: string) => (e: { nativeEvent: { layout: { x: number; width: number } } }) => {
    spots.current[key] = e.nativeEvent.layout;
    if (key === here) reveal(key);
  };

  // One thing only is not worth a row of tabs.
  if (mine.length + shells.length < 2 && !onNew) return null;
  return (
    <View style={local.bar}>
      <ScrollView ref={scroll} horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: gutter, paddingVertical: 6 }}>
        {mine.map((a) => {
          const on = current.kind === 'agent' && current.id === a.id;
          const waiting = activity[a.id] === 'waiting';
          return (
            <Pressable
              key={a.id}
              onLayout={place(`agent:${a.id}`)}
              onPress={() => !on && router.replace({ pathname: '/agent/[id]', params: { id: a.id } })}
              accessibilityRole="tab"
              accessibilityLabel={`${a.name}${waiting ? ', waiting for you' : ''}`}
              accessibilityState={{ selected: on }}
              style={[local.tab, on && local.here, { flexDirection: 'row', gap: 8 }]}>
              <Avatar seed={a.id} size={18} state={activity[a.id]} />
              <Txt tone={waiting ? 'amber' : on ? 'phosphor' : 'ghost'} weight={on || waiting ? 'bold' : 'regular'}>{cut(a.name)}</Txt>
            </Pressable>
          );
        })}
        {shells.map((t, i) => {
          const on = current.kind === 'term' && current.id === t;
          const last = termTitles[t];
          return (
            <Pressable
              key={t}
              onLayout={place(`term:${t}`)}
              onPress={() => !on && (onTerminal ? onTerminal(t) : router.replace({ pathname: '/terminal/[id]', params: { id: projectId, tab: t } }))}
              accessibilityRole="tab"
              accessibilityLabel={last ? `Terminal, last ran ${last}` : `Terminal ${i + 1}`}
              accessibilityState={{ selected: on }}
              style={[local.tab, on && local.here]}>
              <Txt tone={on ? 'phosphor' : 'ghost'} weight={on ? 'bold' : 'regular'}>{`$ ${last ? cut(last) : i + 1}`}</Txt>
            </Pressable>
          );
        })}
        {onNew && (
          <Pressable onPress={onNew} disabled={!online} accessibilityRole="button" accessibilityLabel="New terminal" style={local.tab}>
            <Txt tone={online ? 'amber' : 'ghost'}>+</Txt>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  bar: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule },
  tab: { minWidth: tap, minHeight: tap - 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  here: { backgroundColor: color.bezel, borderBottomColor: color.phosphor },
});
