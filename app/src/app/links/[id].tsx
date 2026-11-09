import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Avatar } from '../../avatar';
import { useConnection } from '../../connection';
import { Choice } from '../../notes';
import { gutter } from '../../theme';
import { Empty, Header, Reaching, Rule, Screen, Txt, styles } from '../../ui';

type Level = 'none' | 'ask' | 'work';

/**
 * Which other agents this one may talk to. Agents are kept apart: none can reach another until the owner
 * connects them here, one pair at a time, as questions only or as questions and work. It is the same both
 * ways, since one connection is between two agents.
 */
export default function Connections() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { agents, projects, links, post, owner, status, loaded, activity } = useConnection();
  const agent = agents.find((a) => a.id === id);
  const online = status === 'open';
  const levelWith = (other: string): Level => links.find((l) => (l.a === id && l.b === other) || (l.b === id && l.a === other))?.level ?? 'none';
  const others = agents.filter((a) => a.id !== id);
  // By project, this agent's own first, since agents in the same project are the likeliest to want to talk.
  const groups = projects
    .map((p) => ({ project: p, members: others.filter((a) => a.projectId === p.id) }))
    .filter((g) => g.members.length)
    .sort((a, b) => Number(b.project.id === agent?.projectId) - Number(a.project.id === agent?.projectId));

  return (
    <Screen bare>
      <Header parent={agent?.name ?? 'agent'} title="connections" />
      {!loaded ? (
        <Reaching what="the agents" />
      ) : !agent ? (
        <Empty mood="offline">This agent is no longer on this Toto.</Empty>
      ) : (
        <ScrollView contentContainerStyle={[{ paddingHorizontal: gutter, paddingVertical: 20, gap: 16 }, styles.readable]}>
          <Txt tone="ghost" small>
            Agents are kept apart: none can reach another unless you connect them here. Connected agents can ask each other questions, and, if you allow it, ask each other to do work, which shows up as a task on the other&apos;s list. What they say to each other appears in their conversations.
          </Txt>
          {!owner && <Txt tone="amber" small>Only the phone that set this Toto up can connect agents.</Txt>}
          {!groups.length && <Empty mood="resting">There are no other agents to connect to yet.</Empty>}
          {groups.map(({ project, members }) => (
            <View key={project.id} style={{ gap: 14 }}>
              <Rule />
              <Txt tone="ghost" weight="bold">{project.id === agent.projectId ? `${project.name} (this project)` : project.name}</Txt>
              {members.map((other) => {
                const level = levelWith(other.id);
                // A request for work is acted on as if asked, by an agent that does not check with you first when it is in full auto.
                const auto = level === 'work' ? [agent, other].filter((a) => a.mode === 'auto').map((a) => a.name) : [];
                return (
                  <View key={other.id} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar seed={other.id} size={24} state={activity[other.id]} />
                      <Txt weight="bold" style={{ flex: 1 }} numberOfLines={1}>{other.name}</Txt>
                      <Txt tone={level === 'none' ? 'ghost' : 'sky'} small>{level === 'none' ? 'not connected' : level === 'ask' ? 'questions' : 'questions and work'}</Txt>
                    </View>
                    <Choice<Level>
                      label="allow"
                      options={[{ value: 'none', label: 'nothing' }, { value: 'ask', label: 'questions' }, { value: 'work', label: 'and work' }]}
                      value={level}
                      onChange={(next) => online && owner && next !== level && post({ type: 'set_link', a: id, b: other.id, level: next })}
                    />
                    {!!auto.length && (
                      <Txt tone="amber" small>{`${auto.join(' and ')} ${auto.length === 1 ? 'works' : 'work'} in full auto, so a request for work is acted on without asking you first.`}</Txt>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
