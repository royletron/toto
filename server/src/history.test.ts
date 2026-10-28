import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addEarlier, joinHistories } from '../../app/src/history.ts';

const e = (text: string) => ({ type: 'text' as const, text });

test('only the end of a history sent: it joins on to what is held; sent whole: it replaces; not mentioned: gone', () => {
  const had = { a: [e('1'), e('2'), e('3')], b: [e('x')], gone: [e('y')] };
  const joined = joinHistories(had, {}, { a: [e('4')], b: [e('x'), e('z')], c: [e('new')] }, { a: 3, b: 0 });
  assert.deepEqual(joined.events.a, [e('1'), e('2'), e('3'), e('4')]);
  assert.deepEqual(joined.events.b, [e('x'), e('z')]);
  // Sent by a device that cannot send less (no `from`).
  assert.deepEqual(joined.events.c, [e('new')]);
  assert.equal('gone' in joined.events, false);
  assert.deepEqual(joined.starts, { a: 0, b: 0, c: 0 });
  // Nothing new for an agent we are up to date with.
  assert.deepEqual(joinHistories(had, {}, {}, { a: 3 }).events, { a: had.a });
  // A device that sent less than we hold (a history it started over) is believed: ours is cut to where it says.
  assert.deepEqual(joinHistories(had, {}, { a: [e('q')] }, { a: 1 }).events.a, [e('1'), e('q')]);
});

test('a history we only hold the end of: joined on where the places line up, replaced where they do not', () => {
  // We hold events 50 and 51 of an agent.
  const had = { a: [e('50'), e('51')] };
  const starts = { a: 50 };
  // The rest from 52: joined, and still starting at 50.
  assert.deepEqual(joinHistories(had, starts, { a: [e('52')] }, { a: 52 }), { events: { a: [e('50'), e('51'), e('52')] }, starts: { a: 50 } });
  // From 51: the overlap is cut, not repeated.
  assert.deepEqual(joinHistories(had, starts, { a: [e('51'), e('52')] }, { a: 51 }).events.a, [e('50'), e('51'), e('52')]);
  // From 60: there is a gap, so what we hold is no use; the new starts at 60.
  assert.deepEqual(joinHistories(had, starts, { a: [e('60')] }, { a: 60 }), { events: { a: [e('60')] }, starts: { a: 60 } });
  // From 10: before what we hold, so the same.
  assert.deepEqual(joinHistories(had, starts, { a: [e('10')] }, { a: 10 }), { events: { a: [e('10')] }, starts: { a: 10 } });
});

test('an earlier page goes in front only if it ends exactly where the held run begins', () => {
  const held = [e('50'), e('51')];
  assert.deepEqual(addEarlier(held, 50, 48, [e('48'), e('49')]), { events: [e('48'), e('49'), e('50'), e('51')], start: 48 });
  // A page for somewhere else (a late answer to an old question) changes nothing.
  assert.deepEqual(addEarlier(held, 50, 40, [e('40'), e('41')]), { events: held, start: 50 });
  assert.deepEqual(addEarlier(held, 50, 49, [e('49'), e('x')]), { events: held, start: 50 });
});
