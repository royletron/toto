import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PALETTE, avatarFor } from '../../app/src/avatars.ts';

// WCAG contrast between two #rrggbb colours.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('an id always has the same avatar, and different ids have different ones', () => {
  assert.deepEqual(avatarFor('a1b2c3d4'), avatarFor('a1b2c3d4'));
  const ids = Array.from({ length: 2000 }, (_, i) => Math.imul(i + 1, 2654435761).toString(16).padStart(8, '0'));
  const looks = new Set(ids.map((id) => JSON.stringify(avatarFor(id), (_, v) => v)));
  // Nearly all are told apart by sight, and tilt alone makes them differ in the data.
  const faces = new Set(ids.map((id) => { const a = avatarFor(id); return `${a.face}|${a.mouth}|${a.fill}`; }));
  assert.ok(looks.size > 1990, `${looks.size} of ${ids.length} told apart`);
  assert.ok(faces.size > 1000, `only ${faces.size} different looks in 2000`);
});

test('every avatar is Toto\'s dog, in five characters, turned a little, in a colour that can be read', () => {
  const seen = { eyes: new Set<string>(), mouths: new Set<string>(), ears: new Set<string>() };
  for (let i = 0; i < 3000; i++) {
    const a = avatarFor(`seed-${i}`);
    assert.equal([...a.face].length, 5);
    assert.equal(a.face[2], ' ');
    assert.equal([...a.mouth].length, 1);
    assert.ok(a.tilt >= -14 && a.tilt <= 14, String(a.tilt));
    assert.ok(PALETTE.some((p) => p.fill === a.fill && p.ink === a.ink));
    seen.eyes.add(a.face[1]).add(a.face[3]);
    seen.mouths.add(a.mouth);
    seen.ears.add(a.face[0] + a.face[4]);
  }
  // Everything on offer turns up somewhere, so nothing is dead weight.
  assert.ok(seen.eyes.size >= 8 && seen.mouths.size >= 8 && seen.ears.size >= 6, JSON.stringify([...seen.eyes, ...seen.mouths]));
  for (const { fill, ink } of PALETTE) assert.ok(contrast(fill, ink) >= 4.5, `${fill} on ${ink}`);
  // Amber means "waiting on you", so it is not a circle.
  assert.ok(!PALETTE.some((p) => p.fill.toLowerCase() === '#ffb000'));
});

test('Toto\'s own face is the commonest', () => {
  let brand = 0;
  for (let i = 0; i < 4000; i++) if (avatarFor(`x${i}`).face === '/o o\\') brand++;
  assert.ok(brand > 100 && brand < 600, String(brand));
});
