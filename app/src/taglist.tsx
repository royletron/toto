import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useConnection } from './connection';
import { TagChip } from './notes';
import { color, gutter } from './theme';
import { Txt } from './ui';

/**
 * The tags in use, as a list that opens: each with how many tasks are still to do, and a tap away
 * from the tasks that have it. For one project, only the tags on its tasks.
 */
export function TagList({ projectId }: { projectId?: string }) {
  const { tags, tasks, notes } = useConnection();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!notes) return null;
  const here = tasks.filter((t) => !projectId || t.projectId === projectId);
  const shown = tags
    .map((tag) => ({ tag, todo: here.filter((t) => t.state !== 'done' && t.tags?.includes(tag.name)).length, any: here.some((t) => t.tags?.includes(tag.name)) }))
    .filter((t) => t.any);
  if (!shown.length) return null;
  const go = (params: Record<string, string>) => router.navigate({ pathname: '/tasks', params: { ...(projectId ? { project: projectId } : null), ...params } });
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Tags, ${shown.length}`} style={({ pressed }) => [local.head, pressed && { opacity: 0.6 }]}>
        <Txt tone="ghost">{open ? '▾' : '▸'} Tags</Txt>
        <Txt tone="ghost" small>{shown.length}</Txt>
      </Pressable>
      {open && (
        <>
          {shown.map(({ tag, todo }) => (
            <View key={tag.name} style={local.row}>
              <TagChip name={tag.name} color={tag.color} onPress={() => go({ tag: tag.name })} />
              <Txt tone="ghost" small>{todo ? `${todo} to do` : 'all done'}</Txt>
            </View>
          ))}
          <Pressable onPress={() => router.navigate('/tags')} accessibilityRole="link" style={({ pressed }) => [local.row, pressed && { opacity: 0.6 }]}>
            <Txt tone="ghost" small>Change colours, rename or delete…</Txt>
          </Pressable>
        </>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  head: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: gutter, borderLeftWidth: 2, borderLeftColor: 'transparent' },
  row: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: gutter + 8, paddingRight: gutter, borderLeftWidth: 2, borderLeftColor: color.rule },
});
