// A face for each agent, made from its id: the same code as app/src/avatars.ts, in JavaScript for
// this page. A test (server/src/avatar.test.ts) fails if the two ever give different faces.

const LEFT_EARS = [['/', 4], ['|', 2], ['\\', 2]];
const RIGHT_EARS = [['\\', 4], ['|', 2], ['/', 2]];
const EYES = [['o', 5], ['O', 2], ['.', 2], ['-', 2], ['^', 1], ['*', 1], ['@', 1], ['0', 1]];
const MOUTHS = [['•', 5], ['w', 2], ['v', 2], ['u', 1], ['~', 1], ['o', 1], ['3', 1], ['-', 1]];

export const PALETTE = [
  { fill: '#8BD45F', ink: '#11140F' },
  { fill: '#7FC8E8', ink: '#11140F' },
  { fill: '#F25C82', ink: '#11140F' },
  { fill: '#ECE6D2', ink: '#11140F' },
  { fill: '#B79CED', ink: '#11140F' },
  { fill: '#F2A07B', ink: '#11140F' },
  { fill: '#5FD4C0', ink: '#11140F' },
  { fill: '#959B85', ink: '#11140F' },
  { fill: '#2A3326', ink: '#8BD45F' },
  { fill: '#2C2A3A', ink: '#B79CED' },
  { fill: '#2E1E26', ink: '#F25C82' },
  { fill: '#233540', ink: '#7FC8E8' },
];

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(next, options) {
  let at = next() * options.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of options) if ((at -= weight) < 0) return value;
  return options[0][0];
}

export function avatarFor(seed) {
  const next = random(hash(seed));
  const left = pick(next, LEFT_EARS);
  const right = pick(next, RIGHT_EARS);
  const eye = pick(next, EYES);
  const other = next() < 0.65 ? eye : pick(next, EYES);
  const mouth = pick(next, MOUTHS);
  const { fill, ink } = PALETTE[Math.floor(next() * PALETTE.length)];
  return { face: `${left}${eye} ${other}${right}`, mouth, tilt: Math.round((next() * 28 - 14) * 10) / 10, fill, ink };
}
