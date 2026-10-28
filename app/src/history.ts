// Putting a replayed conversation together with the one already held. Pure, so it can be tested.
//
// Every event has a place in its agent's history, counted from the very first (0). What the app
// holds of one is a run of them starting at `start`, which is 0 unless it was only sent the end.
import type { AgentEvent } from '../../protocol';

type Histories = Record<string, AgentEvent[]>;
type Starts = Record<string, number>;

/**
 * The histories after a sync. `news` is what arrived for each agent and `from` is the place its first
 * event has. Where that is inside, or just after, the run we hold, ours is kept up to there and the
 * new joined on; otherwise the new replaces it and starts at `from`. With no `from` at all (an older
 * device) it came whole. Agents the device did not mention are gone.
 */
export function joinHistories(had: Histories, starts: Starts, news: Histories, from: Starts): { events: Histories; starts: Starts } {
  const events: Histories = {};
  const next: Starts = {};
  for (const id of new Set([...Object.keys(news), ...Object.keys(from)])) {
    const start = starts[id] ?? 0;
    const held = had[id] ?? [];
    const place = from[id] ?? 0;
    const joins = from[id] !== undefined && place >= start && place <= start + held.length;
    events[id] = joins ? [...held.slice(0, place - start), ...(news[id] ?? [])] : (news[id] ?? []);
    next[id] = joins ? start : place;
  }
  return { events, starts: next };
}

/** An earlier page, put in front of what is held, only if it ends exactly where that begins. */
export function addEarlier(held: AgentEvent[], start: number, from: number, page: AgentEvent[]): { events: AgentEvent[]; start: number } {
  return from + page.length === start ? { events: [...page, ...held], start: from } : { events: held, start };
}
