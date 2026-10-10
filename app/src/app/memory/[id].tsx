import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useConnection, type Memory, type MemoryLayer } from '../../connection';
import { Choice, Writing, agentName, ago } from '../../notes';
import { gutter } from '../../theme';
import { Btn, Field, Header, Screen, Txt, styles } from '../../ui';

const LAYERS: { value: MemoryLayer; label: string }[] = [
  { value: 'agent', label: 'one agent' },
  { value: 'project', label: 'a project' },
  { value: 'node', label: 'everything' },
];

/** One memory: what it says and who it is for, which can be changed, moving it between layers. */
export default function MemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { memories, loaded } = useConnection();
  const memory = id === 'new' ? undefined : memories.find((m) => m.id === id);
  if (id !== 'new' && !memory)
    return (
      <Screen>
        <Header parent="memory" title="memory" />
        <View style={{ padding: gutter }}>
          <Txt tone="ghost">{loaded ? 'That memory is not there any more.' : 'Fetching…'}</Txt>
        </View>
      </Screen>
    );
  return <Form key={memory?.id ?? 'new'} memory={memory} />;
}

function Form({ memory }: { memory?: Memory }) {
  const { projects, agents, post, status } = useConnection();
  const router = useRouter();
  const online = status === 'open';
  const [title, setTitle] = useState(memory?.title ?? '');
  const [body, setBody] = useState(memory?.body ?? '');
  const [layer, setLayer] = useState<MemoryLayer>(memory?.layer ?? 'project');
  const [scope, setScope] = useState<string | undefined>(memory?.scope ?? (memory ? undefined : projects[0]?.id));

  const save = () => {
    post({ type: 'memory_save', id: memory?.id, layer, scope: layer === 'node' ? undefined : scope, title, body });
    router.back();
  };
  const remove = () =>
    Alert.alert('Delete this memory?', 'Agents stop being told about it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          post({ type: 'memory_delete', id: memory!.id });
          router.back();
        },
      },
    ]);
  // Moving between layers means choosing again who it is for: an agent's id is no use as a project's.
  const pickLayer = (next: MemoryLayer) => {
    if (next === layer) return;
    setLayer(next);
    setScope(next === 'project' ? projects[0]?.id : next === 'agent' ? agents[0]?.id : undefined);
  };
  const ready = !!title.trim() && !!body.trim() && (layer === 'node' || !!scope);

  return (
    <Screen bare>
      <Header parent="memory" title={memory ? 'memory' : 'new memory'} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingHorizontal: gutter, paddingVertical: 16, gap: 4 }, styles.readable]}>
        {memory?.pending && <Txt tone="amber">An agent suggested this for the whole Toto. Saving it, or accepting it from the list, makes it count.</Txt>}
        <Field label="title" value={title} onChangeText={setTitle} placeholder="when it matters" autoCapitalize="sentences" />
        <Writing label="what to remember" value={body} onChangeText={setBody} placeholder="how it is done here, what to do or avoid" />
        <Choice label="who it is for" options={LAYERS} value={layer} onChange={pickLayer} />
        {layer === 'project' && <Choice label="project" options={projects.map((p) => ({ value: p.id, label: p.name }))} value={scope} onChange={setScope} />}
        {layer === 'agent' && (
          <Choice label="agent" options={agents.map((a) => ({ value: a.id, label: `${projects.find((p) => p.id === a.projectId)?.name ?? ''} / ${a.name}` }))} value={scope} onChange={setScope} />
        )}
        {!!memory && (
          <Txt tone="ghost" small style={{ paddingTop: 8 }}>
            Written {memory.by === 'agent' ? `by ${agentName(agents, memory.author) ?? 'an agent'}` : 'by you'} {ago(memory.created)}, changed {ago(memory.updated)}.
          </Txt>
        )}
        <View style={{ flexDirection: 'row', gap: 12, paddingTop: 16 }}>
          <Btn kind="primary" label={memory ? 'Save' : 'Add it'} onPress={save} disabled={!online || !ready} style={{ flex: 1 }} />
          {!!memory && <Btn kind="danger" label="Delete" onPress={remove} disabled={!online} />}
        </View>
      </ScrollView>
    </Screen>
  );
}
