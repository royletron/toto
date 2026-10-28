import assert from 'node:assert/strict';
import { test } from 'node:test';
import { typing } from './terminal.ts';

test('the last command is what was typed before Enter, and a line that was changed unseen is not guessed at', () => {
  const t = typing();
  assert.equal(t.last, undefined);
  // Typed a key at a time, as a phone does, with a slip put right.
  for (const ch of 'npm tse') assert.equal(t.feed(ch), false);
  for (const _ of 'se') t.feed(undefined, 'backspace');
  t.feed('est');
  assert.equal(t.feed(undefined, 'enter'), true);
  assert.equal(t.last, 'npm test');
  // The same again changes nothing worth telling anyone.
  t.feed('npm test');
  assert.equal(t.feed(undefined, 'enter'), false);
  // An empty line is not a command.
  assert.equal(t.feed(undefined, 'enter'), false);
  assert.equal(t.last, 'npm test');
  // History recalled with the up arrow, or completed with tab, is not what was typed: left alone.
  t.feed(undefined, 'up');
  t.feed(undefined, 'enter');
  t.feed('git sta');
  t.feed(undefined, 'tab');
  t.feed(undefined, 'enter');
  assert.equal(t.last, 'npm test');
  // Interrupting starts the line again, and is sure again afterwards.
  t.feed('git sta');
  t.feed(undefined, 'up');
  t.feed(undefined, 'ctrl-c');
  t.feed('ls -l', 'enter');
  assert.equal(t.last, 'ls -l');
  // Pasted lines are each a command; the last one is kept. Long ones are cut.
  assert.equal(t.feed('echo one\necho two\n'), true);
  assert.equal(t.last, 'echo two');
  t.feed('x'.repeat(100), 'enter');
  assert.equal((t.last as string).length, 60);
});
