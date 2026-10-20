import { memo, useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { compact, gesture, home, type Frame, type Mood } from './moods';
import { color, font } from './theme';

export type { Mood } from './moods';

// The colour a mood is drawn in. Amber already means "waiting on you" everywhere else in the app.
const INK: Record<Mood, string> = {
  awake: color.phosphor,
  working: color.phosphor,
  resting: color.phosphor,
  looking: color.phosphor,
  waiting: color.amber,
  failed: color.raspberry,
  offline: color.ghost,
};

// Asked once, shared by every face: has this person asked their phone for less motion?
let stillPlease: Promise<boolean> | undefined;
export const prefersStill = () => (stillPlease ??= AccessibilityInfo.isReduceMotionEnabled().catch(() => false));

type Props = {
  mood: Mood;
  /** Height of the characters. */
  size?: number;
  /** With `nose`, the face is two lines tall. Without, it is one line of five characters, for lists and running text. */
  nose?: boolean;
  /** On one line, still show what trails after the face (z's, counting dots). Needs four characters of room to its right. */
  trail?: boolean;
  /** Draw every character in this colour, for when the face sits on something other than the screen. */
  ink?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Toto's face. It is text, and it is decoration: whatever it shows is always also said in words
 * beside it, so screen readers skip it.
 */
export const Face = memo(function Face({ mood, size = 15, nose = false, trail = false, ink, style }: Props) {
  const [still, setStill] = useState(false);
  const full = nose || trail;
  // Frames to play next, kept with the mood they are for: a new mood starts from its home face.
  const [playing, setPlaying] = useState<{ mood: Mood; frame: Frame }>({ mood, frame: home(mood) });
  const frame = playing.mood === mood ? playing.frame : home(mood);

  useEffect(() => {
    let alive = true;
    prefersStill().then((yes) => alive && setStill(yes));
    return () => {
      alive = false;
    };
  }, []);

  // Each gesture is chosen at random when the last runs out, so faces side by side do not move together.
  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => (full ? gesture(mood) : compact(gesture(mood)));
    let queue = next();
    const wait = (f: Frame) => {
      if (f.ms) timer = setTimeout(advance, f.ms);
    };
    const advance = () => {
      if (!queue.length) queue = next();
      const f = queue.shift()!;
      setPlaying({ mood, frame: f });
      wait(f);
    };
    wait(queue.shift()!);
    return () => clearTimeout(timer);
  }, [mood, full, still]);

  const shownFrame = still ? home(mood) : frame;
  const main = ink ?? INK[mood];
  const type = { fontFamily: font.bold, fontSize: size, lineHeight: Math.round(size * 1.25), color: main } as const;
  return (
    // A fixed five characters wide, so z's and counting dots trail off to the right without
    // nudging the face, and a column of faces lines up.
    <View style={[{ width: size * 0.6 * 5, overflow: 'visible' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Wider than the box around it, on purpose, so the dots can trail off beyond it. Text is only as wide as its parent unless told its widest (maxWidth), and a line that does not fit ends in an ellipsis, which is what the counting dots were turning into. */}
      <Text style={[type, { width: size * 0.6 * 9, maxWidth: size * 0.6 * 9 }]} numberOfLines={1} ellipsizeMode="clip" allowFontScaling={false}>
        {shownFrame.face}
        {shownFrame.extra}
      </Text>
      {nose && (
        // Pulled up under the eyes: a whole line down is too far away to read as a nose.
        <Text style={[type, { marginTop: -size * 0.5, width: size * 0.6 * 5, textAlign: 'center', color: ink ?? (mood === 'awake' || mood === 'working' || mood === 'resting' ? color.amber : main) }]} allowFontScaling={false}>
          {shownFrame.nose}
        </Text>
      )}
    </View>
  );
});
