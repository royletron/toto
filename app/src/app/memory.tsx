import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useConnection, type Memory } from '../connection';
import { agentName } from '../notes';
import { gutter } from '../theme';
import { Btn, Empty, Header, Reaching, Rule, Screen, Txt, styles } from '../ui';

/** Everything this Toto remembers, by who it is for. */
export default function Memories() {
  const { memories, projects, agents, loaded, node, post } = useConnection();
  const router = useRouter();
  const open = (id: string) => router.push({ pathname: '/memory/[id]', params: { id } });

  const entry = (m: Memory) => (
    <Pressable key={m.id} onPress={() => open(m.id)} accessibilityRole="button" style={({ pressed }) => [styles.row, { paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Txt weight="bold" numberOfLines={1} style={{ flex: 1 }}>{m.title}</Txt>
        {m.by === 'agent' && <Txt tone="ghost" small>{agentName(agents, m.author) ?? 'an agent'} wrote this</Txt>}
      </View>
      <Txt tone="ghost" small numberOfLines={1}>{m.body.split('\n')[0]}</Txt>
    </Pressable>
  );
  const heading = (text: string, note?: string) => (
    <View style={{ paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 6 }}>
      <Txt weight="bold">{text}</Txt>
      {!!note && <Txt tone="ghost" small>{note}</Txt>}
    </View>
  );
  const where = (layer: Memory['layer'], scope?: string) => memories.filter((m) => !m.pending && m.layer === layer && m.scope === scope);
  const suggested = memories.filter((m) => m.pending);
  const everywhere = where('node');

  return (
    <Screen>
      <Header parent={node?.name ?? 'toto'} title="memory" right={<Btn label="+ add" onPress={() => open('new')} style={{ minHeight: 32, paddingHorizontal: 10 }} />} />
      {!loaded ? (
        <Reaching what="what it remembers" />
      ) : (
        <ScrollView contentContainerStyle={[{ paddingBottom: 32 }, styles.readable]}>
          {memories.length === 0 && <Empty>Nothing remembered yet. Agents keep notes here when something is worth knowing next time, and you can add your own.</Empty>}
          {suggested.length > 0 && (
            <>
              {heading('Suggested for every project', 'An agent wrote these for the whole Toto. They reach no agent until you accept them.')}
              {suggested.map((m) => (
                <View key={m.id}>
                  {entry(m)}
                  <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: gutter, paddingVertical: 8 }}>
                    <Btn kind="primary" label="Accept" onPress={() => post({ type: 'memory_accept', id: m.id })} style={{ minHeight: 36, flex: 1 }} />
                    <Btn kind="danger" label="Delete" onPress={() => post({ type: 'memory_delete', id: m.id })} style={{ minHeight: 36 }} />
                  </View>
                </View>
              ))}
              <Rule />
            </>
          )}
          {everywhere.length > 0 && (
            <>
              {heading('Every agent, every project')}
              {everywhere.map(entry)}
            </>
          )}
          {projects.map((p) => {
            const mine = agents.filter((a) => a.projectId === p.id);
            const shared = where('project', p.id);
            const own = mine.flatMap((a) => where('agent', a.id).map((m) => ({ a, m })));
            if (!shared.length && !own.length) return null;
            return (
              <View key={p.id}>
                {heading(p.name, 'Every agent in this project')}
                {shared.map(entry)}
                {mine.map((a) => {
                  const these = where('agent', a.id);
                  return these.length ? (
                    <View key={a.id}>
                      <Txt tone="ghost" small style={{ paddingHorizontal: gutter, paddingTop: 12 }}>Only {a.name}</Txt>
                      {these.map(entry)}
                    </View>
                  ) : null;
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}
