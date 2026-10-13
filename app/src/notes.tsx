// Small things the memory and task screens share.
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Agent, Project } from './connection';
import { color, font, gutter, size } from './theme';
import { Btn, Txt } from './ui';

/** How long ago, in a few words. */
export function ago(time: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 14 * 86_400) return `${Math.round(s / 86_400)} d ago`;
  return new Date(time).toLocaleDateString();
}

export const projectName = (projects: Project[], id?: string) => projects.find((p) => p.id === id)?.name ?? 'a project that is gone';
export const agentName = (agents: Agent[], id?: string) => agents.find((a) => a.id === id)?.name;

export const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** One choice among a few, as a row of buttons with the chosen one lit. */
export function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T | undefined; onChange: (value: T) => void }) {
  return (
    <View style={{ gap: 8, paddingVertical: 8 }}>
      <Txt tone="ghost" small>{label}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Btn key={o.value} label={o.label} kind={o.value === value ? 'primary' : 'plain'} onPress={() => onChange(o.value)} spoken={`${label}: ${o.label}${o.value === value ? ', chosen' : ''}`} style={{ minHeight: 36, paddingHorizontal: 12 }} />
        ))}
      </View>
    </View>
  );
}

/** A box of several lines to write in, with its name above it. */
export function Writing({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 6, paddingVertical: 8 }}>
      <Txt tone="ghost" small>{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.hint}
        selectionColor={color.amber}
        keyboardAppearance="dark"
        multiline
        textAlignVertical="top"
        style={local.box}
      />
    </View>
  );
}

const local = StyleSheet.create({
  box: { minHeight: 140, maxHeight: 360, padding: 10, color: color.phosphor, fontFamily: font.regular, fontSize: size.body, borderWidth: 1, borderColor: color.rule, borderRadius: 2, paddingHorizontal: gutter - 6 },
});

/** A tag as a small chip: its colour, and its name. With `onRemove` it can be taken off. */
export function TagChip({ name, color, onPress, onRemove, selected }: { name: string; color: string; onPress?: () => void; onRemove?: () => void; selected?: boolean }) {
  const body = (
    <View style={[chip.pill, selected && { borderColor: color }]}>
      <View style={[chip.dot, { backgroundColor: color }]} />
      <Txt small weight={selected ? 'bold' : 'regular'}>{name}</Txt>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Take off ${name}`}>
          <Txt small tone="ghost" weight="bold">x</Txt>
        </Pressable>
      )}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={`Tag ${name}`} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const chip = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: color.rule, borderRadius: 12 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
