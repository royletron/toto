// How a Toto's figures are shown, as text in the app's one typeface. Pure, so it can be tested.

/** A bar of `width` blocks, `fraction` of them filled. */
export const bar = (fraction: number, width = 20) => {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

const STEPS = '▁▂▃▄▅▆▇█';
/** One character a reading, as high as it is against `max`: how it has been going. */
export const spark = (values: number[], max = 100) => values.map((v) => STEPS[Math.min(STEPS.length - 1, Math.max(0, Math.floor((v / max) * STEPS.length)))]).join('');

/** A size in bytes, in the unit that reads best. */
export function size(bytes: number) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return bytes > 0 && bytes < 1024 ** 2 ? 'under 1 MB' : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** A length of time, as the two biggest units it has. */
export function span(seconds: number) {
  const [d, h, m] = [Math.floor(seconds / 86400), Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60)];
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
