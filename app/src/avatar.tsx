import { Text, View } from 'react-native';
import { avatarFor } from './avatars';
import { color, font } from './theme';

// What an agent is up to, as a ring: amber for waiting on you, as everywhere in the app.
const RING = { waiting: color.amber, working: color.signal, failed: color.raspberry } as const;

/** An agent's face: its dog, made from its id (see avatars.ts), on a circle, ringed when the agent is busy or waiting. */
export function Avatar({ seed, size = 32, state }: { seed: string; size?: number; state?: 'idle' | 'working' | 'waiting' | 'failed' }) {
  const { face, mouth, tilt, fill, ink } = avatarFor(seed);
  // Five characters across make up about three quarters of the circle.
  const fontSize = size * 0.25;
  const line = { fontFamily: font.bold, fontSize, lineHeight: fontSize * 1.15, color: ink, textAlign: 'center' } as const;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, ...(state && state !== 'idle' ? { borderWidth: Math.max(2, size / 14), borderColor: RING[state] } : null), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ transform: [{ rotate: `${tilt}deg` }] }}>
        <Text style={line} allowFontScaling={false}>{face}</Text>
        {/* Pulled up under the eyes, as the nose is on the mark. */}
        <Text style={[line, { marginTop: -fontSize * 0.4 }]} allowFontScaling={false}>{mouth}</Text>
      </View>
    </View>
  );
}
