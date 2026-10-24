import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useConnection, type Activity, type Agent } from '../../connection';
import { agentName } from '../../names';
import { Avatar } from '../../avatar';
import { Face } from '../../face';
import { TagList } from '../../taglist';
import { Btn, Check, Empty, Field, Header, Reaching, Screen, StatusLine, Txt, Waiting, styles } from '../../ui';

const STATE: Record<Activity, { glyph: string; tone: 'ghost' | 'signal' | 'amber' | 'raspberry'; label: string }> = {
  idle: { glyph: '○', tone: 'ghost', label: 'idle' },
  working: { glyph: '●', tone: 'signal', label: 'working' },
  waiting: { glyph: '◆', tone: 'amber', label: 'waiting on you' },
  failed: { glyph: '✕', tone: 'raspberry', label: 'stopped on an error' },
};

function AgentRow({ agent }: { agent: Agent }) {
  const { activity } = useConnection();
  const router = useRouter();
  const state = STATE[activity[agent.id] ?? 'idle'];
  return (
    <Pressable onPress={() => router.push({ pathname: '/agent/[id]', params: { id: agent.id } })} style={({ pressed }) => [styles.row, { flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${agent.name}, ${state.label}`}>
        {/* A fixed-width column, so names line up like a process list. */}
        <View style={styles.faceCol}><Avatar seed={agent.id} size={34} state={activity[agent.id] ?? 'idle'} /></View>
        <View style={{ flex: 1 }}>
          <Txt weight="bold" numberOfLines={1}>{agent.name}</Txt>
          <Txt tone="ghost" small>{agent.worktree ? 'own branch' : 'main checkout'}</Txt>
        </View>
        <Txt tone={state.tone} weight={state.label === 'waiting on you' ? 'bold' : 'regular'}>{state.label}</Txt>
    </Pressable>
  );
}

function StartAgent({ projectId }: { projectId: string }) {
  const { request, busy, status, paused } = useConnection();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  // What it is called if the person does not say; a new one each time the form is opened.
  const [suggested, setSuggested] = useState(agentName);
  const [worktree, setWorktree] = useState(true);
  const [auto, setAuto] = useState(false);
  if (paused) return null;
  // Nothing can be asked of a Toto that is not there, and asking would silently do nothing.
  if (status !== 'open')
    return (
      <View style={styles.row} accessibilityState={{ disabled: true }}>
        <Txt tone="ghost">+ Start an agent</Txt>
        <Txt tone="ghost" small>Once your Toto is reached again.</Txt>
      </View>
    );
  if (!open)
    return (
      <Pressable onPress={() => { setSuggested(agentName()); setOpen(true); }} style={styles.row} accessibilityRole="button">
        <Txt tone="amber">+ Start an agent</Txt>
      </Pressable>
    );
  const start = () => {
    request({ type: 'create_agent', projectId, name: name.trim() || suggested, harness: 'claude', worktree, mode: auto ? 'auto' : 'ask' });
    setName('');
    setOpen(false);
  };
  return (
    <View style={styles.form}>
      <Field label="name" value={name} onChangeText={setName} placeholder={suggested} autoFocus />
      <Check label="Own branch, so it cannot clash with other agents" value={worktree} onChange={setWorktree} />
      <Check label="Full auto: act without asking first" value={auto} onChange={setAuto} />
      <View style={{ flexDirection: 'row', gap: 12, paddingTop: 12 }}>
        <Btn kind="primary" label="Start it" onPress={start} disabled={busy} style={{ flex: 1 }} />
        <Btn label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, agents, post, node, loaded, pending, paused } = useConnection();
  const router = useRouter();
  const project = projects.find((p) => p.id === id);

  const remove = () =>
    Alert.alert(`Delete ${project?.name ?? 'this project'}?`, 'This removes its files from your Toto, along with every agent in it and any work they have not pushed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete project',
        style: 'destructive',
        onPress: () => {
          post({ type: 'delete_project', projectId: id });
          router.back();
        },
      },
    ]);

  const starting = pending?.type === 'create_agent' && pending.projectId === id ? pending : undefined;

  return (
    <Screen>
      <Header parent={node?.name ?? 'toto'} title={project?.name ?? (loaded ? 'gone' : '…')} />
      <View style={{ flex: 1 }}>
        {!loaded ? <Reaching what="this project" /> : !project ? <Empty mood="offline">This project is no longer on this Toto. It may have been deleted from another phone.</Empty> : (
        <FlatList
          data={agents.filter((a) => a.projectId === id)}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <AgentRow agent={item} />}
          ListEmptyComponent={starting ? null : <Empty mood="resting">Nobody is working here yet. Start an agent and give it something to do.</Empty>}
          ListFooterComponent={
            <>
              {starting ? (
                // Where the agent will be, while its branch and session are made.
                <View style={[styles.row, { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }]}>
                  <View style={styles.faceCol}><Face mood="working" size={13} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt weight="bold" numberOfLines={1}>{starting.name}</Txt>
                    <Waiting hint={starting.worktree ? 'Making its own copy of a large repository takes a little while.' : undefined}>Starting…</Waiting>
                  </View>
                </View>
              ) : (
                <StartAgent projectId={id} />
              )}
              {/* Shells in the project, kept running between visits, a tab each. */}
              <Pressable onPress={() => router.push({ pathname: '/terminal/[id]', params: { id } })} style={styles.row} accessibilityRole="button">
                <Txt>$ Terminal</Txt>
                <Txt tone="ghost" small>Shells in this project, to run anything by hand. They keep running when you leave.</Txt>
              </Pressable>
              <TagList projectId={id} />
              {project?.lan !== undefined && !paused && (
                <View style={[styles.row, { paddingVertical: 8 }]}>
                  <Check label="Let agents reach devices on your home network" value={project.lan} onChange={(allow) => post({ type: 'set_lan', projectId: id, allow })} />
                  <Txt tone="ghost" small>{project.lan ? 'Agents here can talk to your router, other computers and anything else on your network.' : 'Agents here can reach the internet, but nothing else on your network.'}</Txt>
                </View>
              )}
              {/* Out of the way at the end of the list: rarely wanted, and never by accident. */}
              {!paused && (
                <Pressable onPress={remove} style={styles.row} accessibilityRole="button">
                  <Txt tone="raspberry">Delete this project</Txt>
                </Pressable>
              )}
            </>
          }
        />
        )}
      </View>
      <StatusLine />
    </Screen>
  );
}
