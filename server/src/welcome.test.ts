import assert from 'node:assert/strict';
import { test } from 'node:test';
import makeQR from 'qrcode-generator';
import { additionIn } from '../../app/src/invite.ts';
import { addLink, loginLines, qrLines } from './welcome.ts';

const login = { name: 'Workshop', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', port: 7860, address: '192.168.1.20:7860', relay: 'wss://relay.example.test' };
const params = (link: string) => Object.fromEntries(new URL(link).searchParams);

test('the link a Toto prints is the one the app reads, with or without an address or a relay', () => {
  const link = addLink(login);
  assert.ok(link.startsWith('toto://add?'));
  assert.deepEqual(additionIn(params(link)), { address: 'ws://192.168.1.20:7860', relay: 'wss://relay.example.test', token: login.token, name: 'Workshop' });
  // Reachable by relay only, or on the network only.
  assert.deepEqual(additionIn(params(addLink({ ...login, address: undefined }))), { address: '', relay: 'wss://relay.example.test', token: login.token, name: 'Workshop' });
  assert.deepEqual(additionIn(params(addLink({ ...login, relay: undefined }))), { address: 'ws://192.168.1.20:7860', relay: '', token: login.token, name: 'Workshop' });
  // Odd characters in a name survive the trip.
  assert.equal(additionIn(params(addLink({ ...login, name: 'Dev & test #2' })))?.name, 'Dev & test #2');
});

test('the app refuses what is not a whole Toto, or not somewhere it would dial', () => {
  const ok = { a: 'ws://host:7860', r: '', t: login.token, n: 'x' };
  for (const bad of [{ ...ok, t: '' }, { ...ok, t: 'short' }, { ...ok, a: 'http://host' }, { ...ok, a: 'javascript:alert(1)' }, { ...ok, a: '', r: '' }, { ...ok, r: 'ftp://relay' }, { ...ok, n: 'x'.repeat(400) }, { ...ok, t: 'has spaces in it ok' }]) assert.equal(additionIn(bad), undefined, JSON.stringify(bad).slice(0, 60));
  assert.equal(additionIn({ ...ok, n: '  ' })?.name, '');
  assert.equal(additionIn({}), undefined);
});

test('the QR code on the terminal is the code for the link, read back square by square', () => {
  const link = addLink(login);
  const code = makeQR(0, 'L');
  code.addData(link);
  code.make();
  const n = code.getModuleCount();
  const margin = 2;
  // Each cell is a half block coloured for the square above and the one below it.
  const cells = qrLines(link).map((line) => [...line.matchAll(/\x1b\[(\d+);(\d+)m▀/g)].map((m) => [m[1] === '30', m[2] === '40'] as const));
  const dark = (row: number, col: number) => {
    const [top, bottom] = cells[Math.floor(row / 2)][col];
    return row % 2 ? bottom : top;
  };
  assert.equal(cells.length, Math.ceil((n + 2 * margin) / 2));
  for (let row = 0; row < n + 2 * margin; row++)
    for (let col = 0; col < n + 2 * margin; col++) {
      const inside = row >= margin && col >= margin && row < n + margin && col < n + margin;
      assert.equal(dark(row, col), inside && code.isDark(row - margin, col - margin), `${row},${col}`);
    }
});

test('what it says to the owner has the token and what to do when the address is not known', () => {
  const text = loginLines(login).join('\n');
  assert.match(text, /token\s+a1b2c3d4e5f60718293a4b5c6d7e8f90/);
  assert.match(text, /ws:\/\/192\.168\.1\.20:7860/);
  assert.ok(text.includes(addLink(login)), 'the link is there to copy as well');
  const blind = loginLines({ ...login, address: undefined, relay: undefined }).join('\n');
  assert.match(blind, /TOTO_ADDRESS/);
  assert.match(blind, /only on the network/);
});
