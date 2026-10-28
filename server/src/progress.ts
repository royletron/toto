// What the root jobs (an update, a plugin install) say they are doing: see bin/toto-progress.mjs.
// Read to be shown, and for nothing else.
import { readFileSync } from 'node:fs';
import type { Progress } from '../../protocol.ts';

const FILE = process.env.TOTO_PROGRESS ?? '/var/lib/toto-progress.json';
// A job that has said nothing for this long has stopped, whatever it last said.
const STALE = 10 * 60_000;

/** `shown` is a job under way or one that failed lately; `active` says it is still going. */
export function readProgress(file = FILE, now = Date.now()): { shown?: Progress; active: boolean } {
  try {
    const p = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof p?.task !== 'string' || typeof p.text !== 'string' || typeof p.at !== 'number' || now - p.at > STALE) return { active: false };
    const active = !p.done;
    if (!active && !p.failed) return { active };
    const number = (n: unknown) => (typeof n === 'number' && n >= 0 && n < 1000 ? n : undefined);
    return { active, shown: { task: p.task.slice(0, 50), text: p.text.slice(0, 300), step: number(p.step), of: number(p.of), ...(p.failed ? { failed: true } : null) } };
  } catch {
    return { active: false };
  }
}

/**
 * The end of what the latest root job did, oldest line first, as a terminal would have shown it: colour
 * codes are left in for the app to draw. A line that was redrawn in place (a progress bar, ending in a
 * carriage return) is the last drawing of it.
 */
export function readLog(file = `${FILE.replace(/\.json$/, '')}.log`, lines = 400, bytes = 150_000): string[] {
  try {
    const all = readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.split('\r').filter(Boolean).pop() ?? '')
      .filter((l) => l.trim())
      .slice(-lines)
      .map((l) => l.slice(0, 1000));
    // Whole lines only, so that a colour code is never cut in half; the oldest go first.
    let size = 0;
    return all.reverse().filter((l) => (size += l.length + 1) <= bytes).reverse();
  } catch {
    return [];
  }
}
