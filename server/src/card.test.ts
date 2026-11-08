import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cardRoom } from './card.ts';

const GB = 1024 ** 3;
const SECTORS = (bytes: number) => bytes / 512;

/** A disk as the system describes it: its size, and its partitions (start and size, in sectors), with the root one at /dev/<name>. */
function machine(disk: string, total: number, parts: Record<string, [number, number]>, root: string) {
  const dir = mkdtempSync(join(tmpdir(), 'toto-card-'));
  const base = join(dir, 'devices', disk);
  mkdirSync(join(dir, 'block'), { recursive: true });
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'size'), String(SECTORS(total)));
  for (const [name, [start, size]] of Object.entries(parts)) {
    mkdirSync(join(base, name));
    writeFileSync(join(base, name, 'start'), String(start));
    writeFileSync(join(base, name, 'size'), String(size));
    symlinkSync(join(base, name), join(dir, 'block', name));
  }
  mkdirSync(join(base, 'queue')); // what a disk has that is not a partition
  writeFileSync(join(dir, 'mounts'), `/dev/${root} / ext4 rw,noatime 0 0\nproc /proc proc rw 0 0\n`);
  return { mounts: join(dir, 'mounts'), block: join(dir, 'block') };
}

test('how much of the card lies beyond the root partition, when that is the last one on it', () => {
  // A 64 GB card copied from a 16 GB one: the boot partition, then the root one that stops at 16 GB.
  const bigger = machine('mmcblk0', 64 * GB, { mmcblk0p1: [16384, 1048576], mmcblk0p2: [1064960, SECTORS(16 * GB) - 1064960] }, 'mmcblk0p2');
  assert.equal(cardRoom(bigger.mounts, bigger.block), 48 * GB);
  // One that already fills its card (the card a little over its partition, as they are) has nothing worth expanding.
  const full = machine('mmcblk0', 16 * GB + 4 * 1024 ** 2, { mmcblk0p1: [16384, 1048576], mmcblk0p2: [1064960, SECTORS(16 * GB) - 1064960] }, 'mmcblk0p2');
  assert.equal(cardRoom(full.mounts, full.block), undefined);
  // Not the last partition: something is after it, so it cannot just be grown.
  const crowded = machine('mmcblk0', 64 * GB, { mmcblk0p1: [16384, 1048576], mmcblk0p2: [1064960, 2097152], mmcblk0p3: [3162112, 2097152] }, 'mmcblk0p2');
  assert.equal(cardRoom(crowded.mounts, crowded.block), undefined);
  // The same layout on a USB disk or an NVMe drive.
  const usb = machine('sda', 128 * GB, { sda1: [16384, 1048576], sda2: [1064960, SECTORS(16 * GB) - 1064960] }, 'sda2');
  assert.equal(cardRoom(usb.mounts, usb.block), 112 * GB);
  // A root that is not on a partition of a disk (a container's overlay, a bare /dev/root), or a machine with no such files.
  const odd = machine('mmcblk0', 64 * GB, { mmcblk0p2: [1064960, 2097152] }, 'mmcblk0p2');
  writeFileSync(odd.mounts, 'overlay / overlay rw 0 0\n');
  assert.equal(cardRoom(odd.mounts, odd.block), undefined);
  assert.equal(cardRoom('/nonexistent/mounts', '/nonexistent/block'), undefined);
  // The partition table says something the card does not: nothing is guessed.
  const bad = machine('mmcblk0', 0, { mmcblk0p2: [1064960, 2097152] }, 'mmcblk0p2');
  assert.equal(cardRoom(bad.mounts, bad.block), undefined);
});
