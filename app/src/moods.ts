// Toto's face, as data. Pure, and tested from the server's suite. The app draws it from
// app/src/moods.ts and the device's console tool from server/src/moods.ts; a test fails if the
// two copies differ.
//
// The mark is a dog in six characters: `/` and `\` for floppy ears, the two o's from the name for
// eyes, and a bullet for a nose. It moves the way a terminal would move it: every character stays
// where it is and is swapped for another. Nothing slides, turns or stretches.

/** What the face is saying. One per thing an agent, or the link to a Toto, can be doing. */
export type Mood = 'awake' | 'working' | 'waiting' | 'resting' | 'failed' | 'offline' | 'looking';

/**
 * One frame: the ears and eyes (always five characters), anything trailing after them (z's,
 * counting dots), the nose (a space for none), and how long to hold it.
 */
export type Frame = { face: string; extra: string; nose: string; ms: number };

const NOSE = '•';
const f = (face: string, ms: number, nose = NOSE, extra = ''): Frame => ({ face, extra, nose, ms });

/**
 * How a mood behaves: the face it holds between gestures, how long it holds it (a range, so no two
 * holds match), and the gestures it picks from. The home frame is also what a still face shows.
 * `gesture` plays one at random, so faces side by side do not blink together.
 */
const MOODS: Record<Mood, { home: Frame; hold: [number, number]; moves: Frame[][] }> = {
  // The everyday dog: blinks, glances, ear flicks, a squint, a grin, a wink.
  awake: {
    home: f('/o o\\', 0),
    hold: [1200, 3600],
    moves: [
      [f('/- -\\', 140)], [f('/- -\\', 140)], [f('/- -\\', 110), f('/o o\\', 110), f('/- -\\', 140)],
      [f('/o O\\', 700)], [f('/O o\\', 700)], [f('/O o\\', 500), f('/o O\\', 700)],
      [f('|o o\\', 170)], [f('/o o|', 170)],
      [f('/. .\\', 600)], [f('/^ ^\\', 800)], [f('/- o\\', 300)], [f('/o -\\', 300)],
    ],
  },
  // On the job: dots counting along beside it, a glance at the work, a blink. Open eyes keep it
  // apart from resting at list size, where narrowed and shut look alike.
  working: {
    home: f('/o o\\', 0),
    hold: [300, 700],
    moves: [
      [f('/o o\\', 450, NOSE, ' .'), f('/. .\\', 450, NOSE, ' ..'), f('/o o\\', 450, NOSE, ' ...')],
      [f('/o o\\', 400, NOSE, ' .'), f('/o o\\', 400, NOSE, ' ..')],
      [f('/o O\\', 400, NOSE, ' .'), f('/O o\\', 400, NOSE, ' ..'), f('/o o\\', 400, NOSE, ' ...')],
      [f('/- -\\', 140)], [f('|o o\\', 170)],
    ],
  },
  // Ears up, eyes wide, and the nose turns into a question.
  waiting: {
    home: f('|O O|', 0, '?'),
    hold: [1000, 2200],
    moves: [
      [f('|- -|', 140, '?')], [f('\\O O/', 420, '?')], [f('|O o|', 500, '?')], [f('|o O|', 500, '?')],
      [f('\\O O/', 200, '?'), f('|O O|', 200, '?'), f('\\O O/', 300, '?')],
    ],
  },
  // Nothing running. Eyes shut, a few z's, now and then an ear twitches or an eye peeks.
  resting: {
    home: f('/- -\\', 0),
    hold: [1500, 3500],
    moves: [
      [f('/- -\\', 700, NOSE, ' z'), f('/- -\\', 900, NOSE, ' zZ')],
      [f('/- -\\', 600, NOSE, ' z'), f('/- -\\', 700, NOSE, ' zZ'), f('/- -\\', 800, NOSE, ' zZz')],
      [f('|- -\\', 170)], [f('/- .\\', 500)], [f('/. .\\', 400)],
    ],
  },
  // Stopped on an error. Crossed eyes, still.
  failed: { home: f('/x x\\', 0), hold: [0, 0], moves: [] },
  // Cannot be reached. The nose is gone.
  offline: { home: f('/. .\\', 0, ' '), hold: [0, 0], moves: [] },
  // Trying to find a Toto: peering about.
  looking: {
    home: f('/. .\\', 0, ' '),
    hold: [250, 450],
    moves: [
      [f('/o o\\', 450, ' '), f('/. .\\', 450, ' '), f('/O O\\', 450, ' ')],
      [f('/o o\\', 450, ' '), f('/. .\\', 450, ' ')],
      [f('/O O\\', 450, ' '), f('/. .\\', 450, ' '), f('/o O\\', 450, ' ')],
    ],
  },
};

/** The face a mood rests on, which is also all a still face (reduced motion) ever shows. */
export const home = (mood: Mood): Frame => ({ ...MOODS[mood].home });

/**
 * A few frames to play next: the home face held for a random time, then one gesture picked at
 * random with its timings varied a little. Ask again when they run out. A face that never moves
 * (failed, offline) gets its one frame, held for ever (ms 0).
 */
export function gesture(mood: Mood, random = Math.random): Frame[] {
  const { home, hold, moves } = MOODS[mood];
  if (!moves.length) return [{ ...home, ms: 0 }];
  const move = moves[Math.floor(random() * moves.length)];
  const vary = (ms: number) => Math.round(ms * (0.8 + random() * 0.4));
  return [{ ...home, ms: Math.round(hold[0] + random() * (hold[1] - hold[0])) }, ...move.map((m) => ({ ...m, ms: vary(m.ms) }))];
}

/**
 * The frames for a face that has only its five characters to work with, as in a list or a line
 * of text: trailing extras are dropped, and frames that then look the same are joined.
 */
export function compact(frames: Frame[]): Frame[] {
  const out: Frame[] = [];
  for (const frame of frames) {
    const last = out[out.length - 1];
    if (last && last.face === frame.face && last.nose === frame.nose) last.ms += frame.ms;
    else out.push({ ...frame, extra: '' });
  }
  return out;
}

/** The mood for what a chat agent is doing. */
export const moodOf = (activity: 'idle' | 'working' | 'waiting' | 'failed'): Mood =>
  activity === 'idle' ? 'resting' : activity;

/** One mood for a group of agents: whoever most needs attention sets it. */
export function moodOfMany(activities: ('idle' | 'working' | 'waiting' | 'failed')[]): Mood {
  for (const urgent of ['waiting', 'failed', 'working'] as const) if (activities.includes(urgent)) return urgent;
  return 'resting';
}
