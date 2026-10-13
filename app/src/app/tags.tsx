import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useConnection, type Tag } from '../connection';
import { TagChip } from '../notes';
import { TAG_COLORS } from '../tagcolors';
import { color, gutter } from '../theme';
import { Btn, Empty, Field, Header, Reaching, Rule, Screen, Txt, styles } from '../ui';

/** Every tag, with how many tasks have it, to recolour, rename or delete. */
export default function Tags() {
  const { tags, tasks, post, loaded, node, status } = useConnection();
  const [open, setOpen] = useState<string>();
  const online = status === 'open';
  return (
    <Screen>
      <Header parent={node?.name ?? 'toto'} title="tags" />
      {!loaded ? (
        <Reaching what="your tags" />
      ) : (
        <ScrollView contentContainerStyle={[{ paddingBottom: 32 }, styles.readable]}>
          {tags.length === 0 && <Empty>No tags yet. Give a task a tag when you edit it, and agents add them as they raise tasks.</Empty>}
          {tags.map((tag) => (
            <View key={tag.name}>
              <Pressable onPress={() => setOpen(open === tag.name ? undefined : tag.name)} accessibilityRole="button" accessibilityState={{ expanded: open === tag.name }} style={({ pressed }) => [styles.row, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }, pressed && { opacity: 0.6 }]}>
                <TagChip name={tag.name} color={tag.color} />
                <Txt tone="ghost" small>{tasks.filter((t) => t.tags?.includes(tag.name)).length} tasks</Txt>
              </Pressable>
              {open === tag.name && <Editing tag={tag} online={online} post={post} done={() => setOpen(undefined)} />}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function Editing({ tag, online, post, done }: { tag: Tag; online: boolean; post: ReturnType<typeof useConnection>['post']; done: () => void }) {
  const [name, setName] = useState(tag.name);
  const remove = () =>
    Alert.alert(`Delete “${tag.name}”?`, 'It comes off every task that has it. The tasks stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          post({ type: 'tag_delete', name: tag.name });
          done();
        },
      },
    ]);
  return (
    <View style={{ paddingHorizontal: gutter, paddingVertical: 12, gap: 12, backgroundColor: color.bezel }}>
      <Txt tone="ghost" small>colour</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {TAG_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => post({ type: 'tag_color', name: tag.name, color: c })}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel={`Colour ${c}${c.toLowerCase() === tag.color.toLowerCase() ? ', chosen' : ''}`}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: c.toLowerCase() === tag.color.toLowerCase() ? color.phosphor : 'transparent' }}
          />
        ))}
      </View>
      <Btn label="Back to the colour made up from its name" onPress={() => post({ type: 'tag_color', name: tag.name })} disabled={!online} style={{ minHeight: 36 }} />
      <Rule />
      <Field label="name" value={name} onChangeText={setName} placeholder="a new name" />
      <Txt tone="ghost" small>Naming it as another tag joins them.</Txt>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Btn
          kind="primary"
          label="Rename"
          onPress={() => {
            post({ type: 'tag_rename', name: tag.name, to: name });
            done();
          }}
          disabled={!online || !name.trim() || name.trim().toLowerCase() === tag.name}
          style={{ flex: 1 }}
        />
        <Btn kind="danger" label="Delete" onPress={remove} disabled={!online} />
      </View>
    </View>
  );
}
