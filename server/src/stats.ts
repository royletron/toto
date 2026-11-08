// How this machine is doing, read from the system's own counters, which need no special rights.
import { readFileSync, readdirSync, statfsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import type { Stats } from '../../protocol.ts';
import { cardRoom, resizePending } from './card.ts';

/** Memory and swap in bytes, out of /proc/meminfo, which counts in kilobytes. */
export function parseMeminfo(text: string) {
  const bytes = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0) * 1024;
  return { total: bytes('MemTotal'), available: bytes('MemAvailable'), swapTotal: bytes('SwapTotal'), swapFree: bytes('SwapFree') };
}

/** The processor's time, in all and idle, out of the first line of /proc/stat. */
export function parseCpu(text: string) {
  const [, ...times] = (text.split('\n')[0] ?? '').trim().split(/\s+/).map(Number);
  // user nice system idle iowait irq softirq steal: waiting for the disk is idle too.
  return { total: times.slice(0, 8).reduce((sum, n) => sum + (n || 0), 0), idle: (times[3] || 0) + (times[4] || 0) };
}

/** How busy it was between two readings, as a whole percentage. */
export const cpuPercent = (before: { total: number; idle: number }, after: { total: number; idle: number }) =>
  after.total > before.total ? Math.min(100, Math.max(0, Math.round(100 * (1 - (after.idle - before.idle) / (after.total - before.total))))) : 0;

const read = (path: string) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

/** The processor's temperature, where the system says it. */
function temperature() {
  const milli = Number(read('/sys/class/thermal/thermal_zone0/temp'));
  return milli > 0 ? Math.round(milli / 100) / 10 : undefined;
}

/** Whether a Raspberry Pi is being given too little power, which its voltage monitor reports. Undefined elsewhere. */
function undervoltage() {
  try {
    for (const hwmon of readdirSync('/sys/class/hwmon'))
      if (read(`/sys/class/hwmon/${hwmon}/name`)?.trim() === 'rpi_volt') return read(`/sys/class/hwmon/${hwmon}/in0_lcrit_alarm`)?.trim() === '1';
  } catch {}
  return undefined;
}

// Busy-ness is between two readings. Anyone asking gets the last measurement if it is under a second
// old, so a few phones asking at once do not shorten what is measured.
let last: { at: number; total: number; idle: number; percent: number } | undefined;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function busy() {
  const now = parseCpu(read('/proc/stat') ?? '');
  // The first time there is nothing to compare with, so take a short look.
  if (!last) {
    await wait(250);
    const later = parseCpu(read('/proc/stat') ?? '');
    last = { at: Date.now(), ...later, percent: cpuPercent(now, later) };
  } else if (Date.now() - last.at >= 1000) last = { at: Date.now(), ...now, percent: cpuPercent(last, now) };
  return last.percent;
}

/** How this machine is doing now. `dir` is where the projects are kept, whose disk is the one that matters. */
export async function readStats(dir: string): Promise<Stats> {
  const cpu = await busy();
  const memory = parseMeminfo(read('/proc/meminfo') ?? '');
  const disk = statfsSync(dir);
  const load = (read('/proc/loadavg') ?? '').split(' ').slice(0, 3).map(Number);
  const [temp, volt, room] = [temperature(), undervoltage(), cardRoom()];
  return {
    cpu,
    cores: availableParallelism(),
    load: [load[0] || 0, load[1] || 0, load[2] || 0],
    memory: { total: memory.total, available: memory.available },
    swap: { total: memory.swapTotal, free: memory.swapFree },
    disk: { total: disk.blocks * disk.frsize, free: disk.bavail * disk.frsize },
    uptime: Math.round(Number((read('/proc/uptime') ?? '').split(' ')[0]) || 0),
    ...(temp !== undefined ? { temp } : null),
    ...(volt !== undefined ? { undervoltage: volt } : null),
    ...(room !== undefined ? { room } : null),
    ...(resizePending() ? { resizePending: true } : null),
  };
}
