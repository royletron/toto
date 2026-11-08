import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useConnection } from './connection';
import { Face } from './face';
import { size } from './figures';
import { Btn, Rule, Txt, styles } from './ui';
import { atLeast } from './version';

/** Above the projects when the Toto's disk is short of space: a full one stops it answering, so this does not wait to be asked. */
export function DiskWarning() {
  const { lowDisk } = useConnection();
  const router = useRouter();
  if (!lowDisk) return null;
  const critical = lowDisk.level === 'critical';
  return (
    <Pressable onPress={() => router.push('/device')} style={[styles.row, { flexDirection: 'row', alignItems: 'center' }]} accessibilityRole="button">
      <View style={styles.faceCol}><Face mood={critical ? 'failed' : 'waiting'} size={13} /></View>
      <View style={{ flex: 1 }}>
        <Txt tone={critical ? 'raspberry' : 'amber'} weight="bold">{critical ? 'The disk is almost full' : 'The disk is getting full'}</Txt>
        <Txt tone="ghost" small>
          {`${size(lowDisk.free)} left of ${size(lowDisk.total)}. ${critical ? 'Nothing new will start until some space is cleared.' : 'It stops answering when it is full.'} Open settings to see what is using it.`}
        </Txt>
      </View>
    </Pressable>
  );
}

/**
 * A card bigger than the Toto uses, as after copying it to a larger one: use the rest of it, which is set up
 * now and finishes when the Toto restarts, and restart it from here.
 */
function BiggerCard() {
  const { stats, software, post, status } = useConnection();
  const room = atLeast(software?.version, 0, 10, 1) ? stats?.room : undefined;
  const pending = !!stats?.resizePending;
  // Between asking and the answer, which says it is set up (or an alert says why not).
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!working) return;
    const timer = setTimeout(() => setWorking(false), 20_000);
    return () => clearTimeout(timer);
  }, [working]);
  if (!room && !pending) return null;
  const online = status === 'open';
  const expand = () =>
    Alert.alert('Use the rest of the card?', 'This grows the Toto’s main partition to the end of the card, and finishes when it restarts. Do it on a card that was copied from another, and keep a copy of anything you could not lose.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use it',
        onPress: () => {
          setWorking(true);
          post({ type: 'expand_disk' });
        },
      },
    ]);
  const restart = () =>
    Alert.alert('Restart this Toto?', 'It cannot be reached for a minute or two, and agents that are working stop it from restarting.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restart', style: 'destructive', onPress: () => post({ type: 'reboot' }) },
    ]);
  return (
    <View style={{ gap: 10 }}>
      <Txt weight="bold">A bigger card</Txt>
      <Txt tone="ghost" small>
        {pending ? 'Set up. The whole card is used once this Toto restarts, which can take a few minutes the first time.' : `This card has ${size(room!)} beyond what the Toto uses. Use the rest of it to give the projects more room.`}
      </Txt>
      {pending ? <Btn kind="primary" label="Restart now" onPress={restart} disabled={!online} /> : <Btn label={working ? 'Setting up…' : 'Use the rest of the card'} onPress={expand} busy={working} disabled={!online || working} />}
    </View>
  );
}

/** What is using the disk, by project, and a way to clear what is only a cache. */
export function DiskPanel() {
  const { request, pending, diskUsage, status, busy } = useConnection();
  const online = status === 'open';
  const measuring = pending?.type === 'disk_usage';
  const cleaning = pending?.type === 'clean_disk';
  const clear = () =>
    Alert.alert('Clear caches?', 'This clears each project’s package caches and the downloaded packages the system keeps. Nothing of yours is deleted, and anything that is wanted again is downloaded again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', onPress: () => request({ type: 'clean_disk' }) },
    ]);
  const usage = diskUsage?.usage;
  const clearable = usage ? usage.apt + usage.projects.reduce((sum, p) => sum + p.cache, 0) : 0;
  return (
    <View style={{ gap: 12 }}>
      <BiggerCard />
      {usage && (
        <View style={{ gap: 10 }}>
          {typeof diskUsage?.freed === 'number' && <Txt tone="phosphor" small>{diskUsage.freed > 0 ? `Cleared ${size(diskUsage.freed)}.` : 'There was nothing to clear.'}</Txt>}
          {[...usage.projects].sort((a, b) => b.bytes - a.bytes).map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', gap: 10 }} accessible accessibilityLabel={`${p.name}: ${size(p.bytes)}, of which ${size(p.cache)} is cache`}>
              <Txt style={{ flex: 1 }} numberOfLines={1}>{p.name}</Txt>
              <Txt weight="bold">{size(p.bytes)}</Txt>
              <Txt tone="ghost" small style={{ minWidth: 90, textAlign: 'right' }}>{p.cache ? `${size(p.cache)} cache` : ''}</Txt>
            </View>
          ))}
          <Rule />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Txt tone="ghost" style={{ flex: 1 }}>downloaded packages</Txt>
            <Txt>{size(usage.apt)}</Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Txt tone="ghost" style={{ flex: 1 }}>this Toto’s records</Txt>
            <Txt>{size(usage.data)}</Txt>
          </View>
          <Txt tone="ghost" small>
            Each project has its own caches, because projects are kept apart. An agent’s own copy of the project, and its <Txt small>node_modules</Txt>, count as that project’s; deleting an agent you no longer need frees them.
          </Txt>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Btn label={measuring ? 'Measuring…' : usage ? 'Measure again' : 'What is using the space'} onPress={() => request({ type: 'disk_usage' })} busy={measuring} disabled={busy || !online} />
        {(!usage || clearable > 0) && <Btn kind={usage ? 'primary' : 'plain'} label={cleaning ? 'Clearing…' : usage ? `Clear caches (${size(clearable)})` : 'Clear caches'} onPress={clear} busy={cleaning} disabled={busy || !online} />}
      </View>
      {measuring && <Txt tone="ghost" small>Measuring reads a lot of files, so on a full card this can take a minute.</Txt>}
    </View>
  );
}
