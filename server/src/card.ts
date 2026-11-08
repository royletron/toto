// Whether the card (or disk) the root filesystem is on is bigger than the partition it uses, which is what
// is left after a Toto is moved to a larger card by copying the old one. Read from the system's own files,
// which need no special rights; growing the partition is toto-priv's expand-rootfs.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SECTOR = 512;
const read = (path: string) => {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
};

/**
 * How many bytes of the disk the root filesystem is on lie beyond its partition, when that partition is the
 * last one, which is what expanding it would add. Undefined when there are not enough to be worth having
 * (under a gigabyte), when the root is not on a partition of a real disk, or when it is not the last
 * partition, which cannot just be grown.
 */
export function cardRoom(mounts = '/proc/mounts', block = '/sys/class/block'): number | undefined {
  const source = (read(mounts) ?? '').split('\n').map((line) => line.split(' ')).find(([, at]) => at === '/')?.[0];
  const name = /^\/dev\/(mmcblk\d+p\d+|nvme\d+n\d+p\d+|sd[a-z]+\d+)$/.exec(source ?? '')?.[1];
  if (!name) return undefined;
  let part: string;
  try {
    part = realpathSync(join(block, name));
  } catch {
    return undefined;
  }
  const disk = dirname(part);
  const sectors = (dir: string, file: string) => Number(read(join(dir, file)));
  const [start, size, total] = [sectors(part, 'start'), sectors(part, 'size'), sectors(disk, 'size')];
  if (!(start >= 0 && size > 0 && total > 0)) return undefined;
  // A partition that begins after this one means it is not the last.
  for (const entry of readdirSync(disk)) if (sectors(join(disk, entry), 'start') > start) return undefined;
  const room = (total - (start + size)) * SECTOR;
  return room >= 1024 ** 3 ? room : undefined;
}

/** Expanding has been set up (raspi-config leaves a script to finish it) and waits for the next start. */
export const resizePending = () => existsSync('/etc/init.d/resize2fs_once');
