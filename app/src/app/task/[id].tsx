import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { chooseFile } from '../../attach';
import { useConnection, type Task, type TaskState } from '../../connection';
import { Files } from '../../files';
import { Choice, Writing, ago, projectName } from '../../notes';
import { gutter } from '../../theme';
import { Btn, Field, Header, Rule, Screen, Txt, styles } from '../../ui';

const STATES: { value: TaskState; label: string }[] = [
  { value: 'open', label: 'open' },
  { value: 'working', label: 'working' },
  { value: 'done', label: 'done' },
];

/** One task: what it says, who has it, what is attached, and what can be done with it. */
export default function TaskScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>();
  const { tasks, loaded } = useConnection();
  const task = id === 'new' ? undefined : tasks.find((t) => t.id === id);
  if (id !== 'new' && !task)
    return (
      <Screen>
        <Header parent="tasks" title="task" />
        <View style={{ padding: gutter }}>
          <Txt tone="ghost">{loaded ? 'That task is not there any more.' : 'Fetching…'}</Txt>
        </View>
      </Screen>
    );
  return <Form key={task?.id ?? 'new'} task={task} startIn={projectId} />;
}

function Form({ task, startIn }: { task?: Task; startIn?: string }) {
  const { projects, agents, post, attachFile, status } = useConnection();
  const router = useRouter();
  const online = status === 'open';
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [state, setState] = useState<TaskState>(task?.state ?? 'open');
  const [project, setProject] = useState<string | undefined>(task?.projectId ?? startIn ?? projects[0]?.id);
  const [agent, setAgent] = useState<string | undefined>(task?.agentId);
  const [giving, setGiving] = useState(false);
  const [adding, setAdding] = useState(false);

  const here = agents.filter((a) => a.projectId === project);
  const save = () => {
    if (!project) return;
    post({ type: 'task_save', id: task?.id, title, description, projectId: project, agentId: agent, state });
    router.back();
  };
  const remove = () =>
    Alert.alert('Delete this task?', 'Its files go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          post({ type: 'task_delete', id: task!.id });
          router.back();
        },
      },
    ]);
  const attach = async () => {
    setAdding(true);
    try {
      const file = await chooseFile();
      if (file) attachFile(task!.id, file.name, file.base64);
    } catch (err) {
      Alert.alert('That did not work', err instanceof Error ? err.message : 'That file could not be read.');
    }
    setAdding(false);
  };
  const give = (agentId: string) => {
    post({ type: 'task_push', id: task!.id, agentId });
    router.back();
  };

  return (
    <Screen bare>
      <Header parent="tasks" title={task ? 'task' : 'new task'} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingHorizontal: gutter, paddingVertical: 16, gap: 4 }, styles.readable]}>
        <Field label="title" value={title} onChangeText={setTitle} placeholder="what is to be done" autoCapitalize="sentences" />
        <Writing label="description" value={description} onChangeText={setDescription} placeholder="what and why, enough to make sense on its own" />
        <Choice label="state" options={STATES} value={state} onChange={setState} />
        <Choice
          label="project"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={project}
          onChange={(p) => {
            // An agent belongs to one project, so moving the task leaves it with nobody until someone is chosen.
            if (p !== project) setAgent(undefined);
            setProject(p);
          }}
        />
        <Choice label="agent" options={[{ value: '', label: 'nobody' }, ...here.map((a) => ({ value: a.id, label: a.name }))]} value={agent ?? ''} onChange={(a) => setAgent(a || undefined)} />
        {!!task && <Txt tone="ghost" small style={{ paddingVertical: 8 }}>Raised {task.by === 'agent' ? 'by an agent' : 'by you'} in {projectName(projects, task.projectId)}, {ago(task.created)}. Changed {ago(task.updated)}.</Txt>}

        {!!task && (
          <>
            <Rule />
            <Txt weight="bold" style={{ paddingTop: 12 }}>Files</Txt>
            {task.files.length ? <Files agentId={task.id} files={task.files} task onRemove={(f) => post({ type: 'task_detach', id: task.id, fileId: f.id })} /> : <Txt tone="ghost" small>None attached.</Txt>}
            <Btn label="+ Add a file" onPress={attach} busy={adding} disabled={!online || task.files.length >= 10} style={{ marginTop: 8 }} />
          </>
        )}
        {!task && <Txt tone="ghost" small style={{ paddingTop: 8 }}>Save it first, then you can attach files.</Txt>}

        <View style={{ flexDirection: 'row', gap: 12, paddingTop: 16 }}>
          <Btn kind="primary" label="Save" onPress={save} disabled={!online || !title.trim() || !project} style={{ flex: 1 }} />
        </View>

        {!!task && (
          <>
            <Rule />
            {giving ? (
              <View style={{ gap: 8, paddingTop: 12 }}>
                <Txt tone="ghost" small>Which agent should work on it? It is told now, or when it has finished what it is doing.</Txt>
                {agents.filter((a) => a.harness === 'claude').map((a) => (
                  <Btn key={a.id} label={`${projectName(projects, a.projectId)} / ${a.name}`} onPress={() => give(a.id)} disabled={!online} />
                ))}
                {!agents.some((a) => a.harness === 'claude') && <Txt tone="ghost" small>There are no chat agents yet.</Txt>}
                <Btn label="Cancel" onPress={() => setGiving(false)} />
              </View>
            ) : (
              <View style={{ gap: 12, paddingTop: 12 }}>
                <Btn label="Give it to an agent…" onPress={() => setGiving(true)} disabled={!online} />
                <Btn label="Delete" kind="danger" onPress={remove} disabled={!online} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
