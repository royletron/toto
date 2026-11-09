import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from './db.ts';
import { LIMITS, openTalk } from './talk.ts';

const talk = (start = 1_000_000) => {
  let clock = start;
  return { t: openTalk(openDb(':memory:'), () => clock), tick: (ms: number) => void (clock += ms) };
};

test('a link is made between two agents, by the person, at a level, and can be changed or removed', () => {
  const { t } = talk();
  assert.deepEqual(t.links(), []);
  assert.equal(t.level('a', 'b'), undefined);
  t.setLink('b', 'a', 'ask');
  // One link for the pair, whichever way round it is asked.
  assert.equal(t.level('a', 'b'), 'ask');
  assert.equal(t.level('b', 'a'), 'ask');
  assert.deepEqual(t.links(), [{ a: 'a', b: 'b', level: 'ask' }]);
  t.setLink('a', 'b', 'work');
  assert.deepEqual(t.links(), [{ a: 'a', b: 'b', level: 'work' }]);
  t.setLink('a', 'c', 'ask');
  assert.deepEqual(t.linked('a').map((l) => `${l.agentId}:${l.level}`).sort(), ['b:work', 'c:ask']);
  assert.deepEqual(t.linked('b'), [{ agentId: 'a', level: 'work' }]);
  t.setLink('b', 'a', 'none');
  assert.equal(t.level('a', 'b'), undefined);
  assert.throws(() => t.setLink('a', 'a', 'ask'), /itself/);
  assert.throws(() => t.setLink('a', 'b', 'everything' as never), /ask each other/);
});

test('only linked agents can ask, and only at a level that allows what they ask for', () => {
  const { t } = talk();
  assert.throws(() => t.open({ from: 'a', to: 'b', kind: 'ask', text: 'hello' }, 'Bea'), /not connected to Bea. Only the person can connect/);
  t.setLink('a', 'b', 'ask');
  const asked = t.open({ from: 'a', to: 'b', kind: 'ask', text: '  how do I log in?  ' });
  assert.match(asked.id, /^req_[0-9a-f]{8}$/);
  assert.deepEqual([asked.from, asked.to, asked.kind, asked.text, asked.state], ['a', 'b', 'ask', 'how do I log in?', 'open']);
  // Questions only: no work, in either direction.
  assert.throws(() => t.open({ from: 'a', to: 'b', kind: 'work', text: 'build it', taskId: 't1' }, 'Bea'), /questions but not to do work/);
  t.setLink('a', 'b', 'work');
  // (B answers first: A is waiting on B.)
  t.close(asked.id, 'b', 'answered');
  assert.equal(t.open({ from: 'b', to: 'a', kind: 'work', text: 'build it', taskId: 't1' }).kind, 'work');
  // What is sent is checked.
  for (const bad of ['', '   ']) assert.throws(() => t.open({ from: 'a', to: 'b', kind: 'ask', text: bad }), /Say what/);
  assert.throws(() => t.open({ from: 'a', to: 'b', kind: 'ask', text: 'x'.repeat(LIMITS.text + 1) }), /too long/);
});

test('an answer closes a request, only for the agent it was made to, once', () => {
  const { t } = talk();
  t.setLink('a', 'b', 'work');
  const r = t.open({ from: 'a', to: 'b', kind: 'ask', text: 'what port?' });
  assert.deepEqual(t.waitingOn('b').map((x) => x.id), [r.id]);
  assert.throws(() => t.close(r.id, 'a', 'answered'), /no such request waiting on you/, 'not by the one who asked');
  assert.throws(() => t.close(r.id, 'c', 'answered'), /no such request/);
  assert.throws(() => t.close('req_nope', 'b', 'answered'), /no such request/);
  assert.equal(t.close(r.id, 'b', 'answered').state, 'answered');
  assert.throws(() => t.close(r.id, 'b', 'answered'), /already answered/);
  assert.deepEqual(t.waitingOn('b'), []);
  // A request made for a task is found by it, while it is open, and closes when the work is done.
  const work = t.open({ from: 'a', to: 'b', kind: 'work', text: 'add a route', taskId: 'task9' });
  assert.equal(t.forTask('task9')?.id, work.id);
  assert.equal(t.close(work.id, 'b', 'done').state, 'done');
  assert.equal(t.forTask('task9'), undefined);
});

test('two agents cannot be left waiting on each other, nor one run away with many requests', () => {
  const { t } = talk();
  for (const x of ['b', 'c', 'd', 'e', 'f', 'g']) t.setLink('a', x, 'ask');
  t.setLink('b', 'c', 'ask');
  // B is waiting on an answer from A: A must answer first, not ask B something in return.
  t.open({ from: 'b', to: 'a', kind: 'ask', text: 'one thing' });
  assert.throws(() => t.open({ from: 'a', to: 'b', kind: 'ask', text: 'and another' }, 'Bea'), /Bea is waiting for an answer from you/);
  // Five waiting on answers is as many as one agent may have.
  for (const x of ['c', 'd', 'e', 'f', 'g']) t.open({ from: 'a', to: x, kind: 'ask', text: `hello ${x}` });
  assert.throws(() => t.open({ from: 'a', to: 'c', kind: 'ask', text: 'again' }), /already have 5 requests waiting/);
  // Answering one makes room.
  t.close(t.waitingOn('c')[0].id, 'c', 'answered');
  t.open({ from: 'a', to: 'c', kind: 'ask', text: 'again' });
});

test('there are limits to how many requests wait on one agent, and how many go to it in an hour, and they let go', () => {
  const { t, tick } = talk();
  // Ten different agents ask one: that is as many as it should be waiting on.
  for (let i = 0; i < LIMITS.waitingOn; i++) {
    t.setLink(`x${i}`, 'target', 'ask');
    t.open({ from: `x${i}`, to: 'target', kind: 'ask', text: 'hi' });
  }
  t.setLink('late', 'target', 'ask');
  assert.throws(() => t.open({ from: 'late', to: 'target', kind: 'ask', text: 'hi' }, 'Tay'), /Tay already has as many requests waiting/);
  // A day later they have lapsed, and are no longer waiting.
  tick(LIMITS.lifetime + 1000);
  assert.deepEqual(t.waitingOn('target'), []);
  assert.equal(t.open({ from: 'late', to: 'target', kind: 'ask', text: 'hi' }).state, 'open');

  // Twenty an hour from one agent to another, however quickly they are answered.
  const fast = talk();
  fast.t.setLink('p', 'q', 'ask');
  for (let i = 0; i < LIMITS.perHour; i++) {
    const r = fast.t.open({ from: 'p', to: 'q', kind: 'ask', text: `q${i}` });
    fast.t.close(r.id, 'q', 'answered');
  }
  assert.throws(() => fast.t.open({ from: 'p', to: 'q', kind: 'ask', text: 'one more' }, 'Quin'), /20 requests in the last hour/);
  fast.tick(3600_000 + 1000);
  assert.equal(fast.t.open({ from: 'p', to: 'q', kind: 'ask', text: 'an hour on' }).state, 'open');
});

test('what is known of an agent goes when it does', () => {
  const { t } = talk();
  t.setLink('a', 'b', 'work');
  t.setLink('b', 'c', 'ask');
  t.open({ from: 'a', to: 'b', kind: 'ask', text: 'hi' });
  t.dropAgent('b');
  assert.deepEqual(t.links(), []);
  assert.deepEqual(t.waitingOn('b'), []);
  assert.equal(t.level('a', 'b'), undefined);
});
