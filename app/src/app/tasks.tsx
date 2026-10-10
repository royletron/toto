import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useConnection, type Task } from '../connection';
import { agentName, ago, projectName } from '../notes';
import { Btn, Empty, Header, Reaching, Screen, Txt, styles } from '../ui';

type Show = 'open' | 'done' | 'all';

/** Everything on this Toto's list, whichever project or agent it belongs to. */
export default function Tasks() {
  const { tasks, projects, agents, loaded, node } = useConnection();
  const router = useRouter();
  const [show, setShow] = useState<Show>('open');
  const shown = tasks
    .filter((t) => (show === 'all' ? true : show === 'done' ? t.state === 'done' : t.state !== 'done'))
    .sort((a, b) => b.updated - a.updated);

  const row = ({ item }: { item: Task }) => (
    <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: item.id } })} accessibilityRole="button" style={({ pressed }) => [styles.row, { paddingVertical: 12 }, pressed && { opacity: 0.6 }]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Txt weight="bold" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Txt>
        <Txt tone={item.state === 'working' ? 'signal' : item.state === 'open' ? 'amber' : 'ghost'} small>{item.state}</Txt>
      </View>
      <Txt tone="ghost" small numberOfLines={1}>
        {[projectName(projects, item.projectId), agentName(agents, item.agentId), item.files.length ? `${item.files.length} file${item.files.length === 1 ? '' : 's'}` : '', ago(item.updated)].filter(Boolean).join(' · ')}
      </Txt>
    </Pressable>
  );

  return (
    <Screen>
      <Header parent={node?.name ?? 'toto'} title="tasks" right={<Btn label="+ add" onPress={() => router.push({ pathname: '/task/[id]', params: { id: 'new' } })} style={{ minHeight: 32, paddingHorizontal: 10 }} />} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
        {(['open', 'done', 'all'] as Show[]).map((s) => (
          <Btn key={s} label={s} kind={s === show ? 'primary' : 'plain'} onPress={() => setShow(s)} style={{ minHeight: 36, paddingHorizontal: 12 }} />
        ))}
      </View>
      {!loaded ? (
        <Reaching what="your tasks" />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(t) => t.id}
          renderItem={row}
          ListEmptyComponent={<Empty>{show === 'done' ? 'Nothing is done yet.' : 'Nothing on the list. Agents add things here when they notice something for later, and you can add your own.'}</Empty>}
        />
      )}
    </Screen>
  );
}
