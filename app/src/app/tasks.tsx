import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useConnection, type Task } from '../connection';
import { TagChip, agentName, ago, projectName } from '../notes';
import { Btn, Empty, Header, Reaching, Screen, Txt, styles } from '../ui';

type Show = 'open' | 'done' | 'all';

/** Everything on this Toto's list, whichever project or agent it belongs to. */
export default function Tasks() {
  const { tasks, tags, projects, agents, loaded, node } = useConnection();
  const router = useRouter();
  // Opened from a tag in the sidebar or a project, it starts on that tag, and in that project.
  const params = useLocalSearchParams<{ tag?: string; project?: string }>();
  const [show, setShow] = useState<Show>('open');
  // The choice lives in the address, so a tag chosen elsewhere and one chosen here are the same thing.
  const tag = params.tag;
  const setTag = (name?: string) => router.setParams({ tag: name });
  const project = params.project;
  const colorOf = (name: string) => tags.find((t) => t.name === name)?.color ?? '#959B85';
  const shown = tasks
    .filter((t) => (!project || t.projectId === project) && (!tag || t.tags?.includes(tag)))
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
      {!!item.tags?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6 }}>
          {item.tags.map((name) => (
            <TagChip key={name} name={name} color={colorOf(name)} />
          ))}
        </View>
      )}
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
      {tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12, alignItems: 'center' }}>
          {tags.map((t) => (
            <TagChip key={t.name} name={t.name} color={t.color} selected={t.name === tag} onPress={() => setTag(t.name === tag ? undefined : t.name)} />
          ))}
          <Btn label="tags…" onPress={() => router.push('/tags')} style={{ minHeight: 28, paddingHorizontal: 8 }} />
        </View>
      )}
      {!!project && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
          <Txt tone="ghost" small>Only {projectName(projects, project)}.</Txt>
          <Btn label="all projects" onPress={() => router.setParams({ project: undefined })} style={{ minHeight: 28, paddingHorizontal: 8 }} />
        </View>
      )}
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
