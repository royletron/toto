// Keeping an eye on the disk. A Toto on a Raspberry Pi has a small card, and what fills it (package
// caches, agents' copies of a project, container images) fills it quietly, until nothing can be written
// and the Toto stops answering. So it says when space is getting short, shows what is using it, and can
// clear what is only a cache.
import { statfsSync } from 'node:fs';
import type { Disk, DiskUsage } from '../../protocol.ts';
import { cleanApt, run, sh } from './projects.ts';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/**
 * How short of space the disk is. Under two gigabytes is low, and under half of one is critical, on any
 * disk. On a small card the share matters too, since a tenth of it is not much to work in, but a share
 * of a big disk is plenty, so it counts only while the space left is smallish.
 */
export function diskLevel(free: number, total: number): 'ok' | 'low' | 'critical' {
  if (free < 500 * MB || (free < 1 * GB && free / total < 0.05)) return 'critical';
  if (free < 2 * GB || (free / total < 0.1 && free < 10 * GB)) return 'low';
  return 'ok';
}

/** The disk `dir` is on. `TOTO_TEST_DISK_FREE` (bytes) stands in for what is free, for tests of what happens when it is short. */
export function readDisk(dir: string): Disk {
  const fs = statfsSync(dir);
  const total = fs.blocks * fs.frsize;
  const fake = Number(process.env.TOTO_TEST_DISK_FREE);
  const free = Number.isFinite(fake) && process.env.TOTO_TEST_DISK_FREE ? fake : fs.bavail * fs.frsize;
  return { total, free, level: diskLevel(free, total) };
}

/**
 * Where things a project's tools keep only to go faster, in the project user's home. Each can be
 * deleted at any time and is made again when it is wanted, at the cost of a download. Not here: the
 * project's own files, `node_modules` and the agents' copies (that is their work), or container images.
 */
export const CACHES = ['.npm/_cacache', '.npm/_npx', '.cache/node-gyp', '.cache/pip', '.cache/yarn', '.cache/go-build', '.local/share/pnpm/store', '.cache/puppeteer'];

/** Run as a project's user: how much its home holds in all and how much of that is cache, in kilobytes: "<all> <cache>". */
export const MEASURE = `cache=0; for d in ${CACHES.join(' ')}; do [ -e "$HOME/$d" ] && cache=$((cache + $(du -skx "$HOME/$d" 2>/dev/null | cut -f1))); done; echo "$(du -skx "$HOME" 2>/dev/null | cut -f1) $cache"`;

/** Run as a project's user: removes the caches. */
export const CLEAN = `for d in ${CACHES.join(' ')}; do rm -rf "$HOME/$d"; done`;

/** The two numbers MEASURE prints, in bytes. */
export function parseMeasure(out: string) {
  const [all, cache] = out.trim().split(/\s+/).map((n) => (Number(n) || 0) * 1024);
  return { bytes: all || 0, cache: Math.min(cache || 0, all || 0) };
}

type Measured = { id: string; name: string; user?: string; dir: string };
// `du` exits with an error if it cannot read some folder in it (apt keeps one private), but still says the total of the rest.
const kilobytes = async (path: string) => (Number((await sh('sh', ['-c', 'du -skx "$1" 2>/dev/null; true', 'sh', path]).catch(() => ({ stdout: '' }))).stdout.split('\t')[0]) || 0) * 1024;

/**
 * What is using the space, for each project (measured as its own user, since its home is private to it),
 * the system's downloaded packages, and this Toto's own records. One at a time: a card is slow, and
 * measuring is a lot of reading.
 * ponytail: a project with no user of its own (a Toto run for development) is measured by its folder and has no caches counted.
 */
export async function diskUsage(projects: Measured[], dataDir: string): Promise<DiskUsage> {
  const sized: DiskUsage['projects'] = [];
  for (const p of projects) {
    const measured = p.user ? parseMeasure((await run(p.user, `/home/${p.user}`, 'sh', ['-c', MEASURE]).catch(() => ({ stdout: '' }))).stdout) : { bytes: await kilobytes(p.dir), cache: 0 };
    sized.push({ id: p.id, name: p.name, ...measured });
  }
  return { projects: sized, apt: await kilobytes('/var/cache/apt'), data: await kilobytes(dataDir), disk: readDisk(dataDir) };
}

/** Clears every project's caches (as its own user) and the system's downloaded packages. Never throws: one that cannot be cleared is skipped. */
export async function cleanDisk(projects: Measured[]) {
  for (const p of projects) if (p.user) await run(p.user, `/home/${p.user}`, 'sh', ['-c', CLEAN]).catch((err) => console.error(`clearing caches for ${p.name}: ${err.message}`));
  await cleanApt().catch((err) => console.error(`clearing apt: ${err.message}`));
}
