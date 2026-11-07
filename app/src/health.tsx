import { useEffect } from 'react';
import { View } from 'react-native';
import { useConnection } from './connection';
import { bar, size, span, spark } from './figures';
import { Txt, Waiting } from './ui';

/** Bars turn red when there is little left of something. */
const LOW = 0.9;

function Row({ label, fraction, detail, history }: { label: string; fraction: number; detail: string; history?: string }) {
  const tone = fraction >= LOW ? 'raspberry' : 'phosphor';
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`${label}: ${Math.round(fraction * 100)} percent. ${detail}`}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Txt tone="ghost" style={{ width: 66 }}>{label}</Txt>
        <Txt tone={tone}>{bar(fraction)}</Txt>
        <Txt tone={tone} weight="bold">{`${Math.round(fraction * 100)}%`}</Txt>
      </View>
      <Txt tone="ghost" small>{detail}</Txt>
      {!!history && <Txt tone="ghost" small style={{ opacity: 0.7 }}>{history}</Txt>}
    </View>
  );
}

/**
 * How the Toto is doing, live: it is asked every few seconds for as long as this is on screen. Its
 * owner sees it; a Toto older than the question does not get asked.
 */
export function Health() {
  const { post, stats, statsHistory, status } = useConnection();
  useEffect(() => {
    if (status !== 'open') return;
    post({ type: 'stats' });
    const timer = setInterval(() => post({ type: 'stats' }), 3000);
    return () => clearInterval(timer);
    // `post` is a new function each render; the question is asked again for the line, not for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!stats) return <Waiting>{status === 'open' ? 'Checking how it is doing…' : 'Its figures will show once it is reached.'}</Waiting>;
  const used = stats.memory.total - stats.memory.available;
  const swapUsed = stats.swap.total - stats.swap.free;
  const taken = stats.disk.total - stats.disk.free;
  const hot = stats.temp !== undefined && stats.temp >= 80;
  return (
    <View style={{ gap: 14 }}>
      <Row label="cpu" fraction={stats.cpu / 100} detail={`${stats.cores} ${stats.cores === 1 ? 'core' : 'cores'}. Load ${stats.load.map((n) => n.toFixed(2)).join(' ')} over 1, 5 and 15 minutes.`} history={spark(statsHistory.cpu)} />
      <Row label="memory" fraction={stats.memory.total ? used / stats.memory.total : 0} detail={`${size(used)} of ${size(stats.memory.total)} in use, ${size(stats.memory.available)} available.`} history={spark(statsHistory.memory)} />
      {stats.swap.total > 0 && <Row label="swap" fraction={swapUsed / stats.swap.total} detail={`${size(swapUsed)} of ${size(stats.swap.total)} in use.`} />}
      <Row label="disk" fraction={stats.disk.total ? taken / stats.disk.total : 0} detail={`${size(stats.disk.free)} free of ${size(stats.disk.total)}, where projects are kept.`} />
      <Txt tone="ghost" small>
        {stats.temp !== undefined ? `${stats.temp.toFixed(1)} °C. ` : ''}Up {span(stats.uptime)}.
      </Txt>
      {hot && <Txt tone="raspberry" small>It is running hot, and will slow itself down. Give it some air, or a fan.</Txt>}
      {stats.undervoltage && <Txt tone="raspberry" small>Its power supply is not giving it enough, which can slow it down or corrupt its card. Use the official supply and a good cable.</Txt>}
    </View>
  );
}
