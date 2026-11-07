import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bar, size, span, spark } from '../../app/src/figures.ts';
import { atLeast } from '../../app/src/version.ts';

test('a bar is as full as the fraction, and never more or less than its width', () => {
  assert.equal(bar(0.5, 10), '█████░░░░░');
  assert.equal(bar(0, 4), '░░░░');
  assert.equal(bar(1, 4), '████');
  assert.equal(bar(7, 4), '████');
  assert.equal(bar(-1, 4), '░░░░');
  assert.equal([...bar(0.33)].length, 20);
});

test('a history is a character a reading, as high as the reading is', () => {
  assert.equal(spark([0, 50, 100]), '▁▅█');
  assert.equal(spark([]), '');
  assert.equal(spark([250, -5]), '█▁', 'off the scale is the top or the bottom of it');
});

test('sizes and times are said the way a person would', () => {
  assert.equal(size(512 * 1024 ** 2), '512 MB');
  assert.equal(size(3.7 * 1024 ** 3), '3.7 GB');
  assert.equal(size(250 * 1024 ** 3), '250 GB');
  assert.equal(span(5 * 60), '5 min');
  assert.equal(span(3 * 3600 + 20 * 60), '3 h 20 min');
  assert.equal(span(2 * 86400 + 21 * 3600 + 900), '2 d 21 h');
});

test('a Toto is new enough if its version is at least the one that can do the thing', () => {
  assert.equal(atLeast('0.8.1', 0, 8, 1), true);
  assert.equal(atLeast('0.8.0', 0, 8, 1), false);
  assert.equal(atLeast('0.10.0', 0, 8, 1), true, 'ten is more than eight');
  assert.equal(atLeast('1.0.0', 0, 9), true);
  assert.equal(atLeast('0.7.9', 0, 8), false);
  assert.equal(atLeast('0.8.0', 0, 8), true);
  // Not versions at all: the demo's, none yet, something garbled.
  for (const odd of ['demo', undefined, '', '0.8']) assert.equal(atLeast(odd, 0, 0), false, String(odd));
});
