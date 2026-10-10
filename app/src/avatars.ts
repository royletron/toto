// A face for each agent, made from its id, so the same agent has the same one everywhere and on
// every phone, and no two look alike for long. It is Toto's own dog (see moods.ts), with the ears,
// eyes and mouth varied a little, on a coloured circle and turned a little.
// Nothing here knows about React: a seed goes in and the pieces come out, so it can be tested.

/** The pieces of one avatar. */
export type Avatar = {
  /** The five characters of the face: left ear, eye, a space, eye, right ear. */
  face: string;
  /** What is under the eyes: the nose, or something else in its place. */
  mouth: string;
  /** How far the dog is turned on its circle, in degrees. */
  tilt: number;
  /** The circle, and what the dog is drawn in. */
  fill: string;
  ink: string;
};

// Each with how often it comes up. The first of each is Toto's own, and the commonest.
const LEFT_EARS: [string, number][] = [['/', 4], ['|', 2], ['\\', 2]];
const RIGHT_EARS: [string, number][] = [['\\', 4], ['|', 2], ['/', 2]];
const EYES: [string, number][] = [['o', 5], ['O', 2], ['.', 2], ['-', 2], ['^', 1], ['*', 1], ['@', 1], ['0', 1]];
const MOUTHS: [string, number][] = [['•', 5], ['w', 2], ['v', 2], ['u', 1], ['~', 1], ['o', 1], ['3', 1], ['-', 1]];

/** The colours: from the app's palette (theme.ts) less amber, which means "waiting on you" and so is not for decoration. */
export const PALETTE: { fill: string; ink: string }[] = [
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

/** A number from text: the same text always gives the same number. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A source of numbers from 0 up to 1 that is the same each time for a seed (mulberry32). */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, options: [T, number][]): T {
  let at = next() * options.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of options) if ((at -= weight) < 0) return value;
  return options[0][0];
}

/** The avatar for a seed, which is normally an agent's id. */
export function avatarFor(seed: string): Avatar {
  const next = random(hash(seed));
  const left = pick(next, LEFT_EARS);
  const right = pick(next, RIGHT_EARS);
  const eye = pick(next, EYES);
  // Most dogs have two eyes alike; a few wink, or have one wide.
  const other = next() < 0.65 ? eye : pick(next, EYES);
  const mouth = pick(next, MOUTHS);
  const { fill, ink } = PALETTE[Math.floor(next() * PALETTE.length)];
  return { face: `${left}${eye} ${other}${right}`, mouth, tilt: Math.round((next() * 28 - 14) * 10) / 10, fill, ink };
}
