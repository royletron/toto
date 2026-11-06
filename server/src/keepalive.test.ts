import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { test } from 'node:test';
import { keepalive } from './keepalive.ts';

// A "relay" that completes the WebSocket handshake and then says nothing, ever, as a stalled one does.
function silent(): Promise<Server & { sockets: Socket[] }> {
  return new Promise((ready) => {
    const sockets: Socket[] = [];
    const server = createServer((sock) => {
      sockets.push(sock);
      let buf = '';
      sock.on('data', (d) => {
        buf += d;
        const key = /Sec-WebSocket-Key: (.*)\r\n/i.exec(buf)?.[1];
        if (!key || !buf.includes('\r\n\r\n')) return;
        const accept = createHash('sha1').update(key.trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        sock.removeAllListeners('data');
      });
    }).listen(0, '127.0.0.1', () => ready(Object.assign(server, { sockets })));
  });
}

test('a connection that stops answering is given up on at once, not by waiting for it to close, which it never does', async () => {
  const server = await silent();
  const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/`);
  await new Promise((open) => (ws.onopen = open));
  const closed = new Promise((done) => (ws.onclose = done));
  let dead = 0;
  const beat = keepalive(ws, () => ((dead += 1), ws.close()), 40);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(dead, 1, 'it is called once, and does not go on');
  // The reason it cannot wait: closing a silent connection does not finish.
  const outcome = await Promise.race([closed.then(() => 'closed'), new Promise((r) => setTimeout(() => r('still closing'), 300))]);
  assert.equal(outcome, 'still closing');
  beat.stop();
  // Let go of the line from our side, so nothing is left holding the test open.
  for (const sock of server.sockets) sock.destroy();
  server.close();
});

test('a connection that answers is left alone', async () => {
  let sent = 0;
  let dead = 0;
  // Answering more often than it asks, as a live relay does.
  const beat = keepalive({ readyState: 1, send: () => void sent++ }, () => void dead++, 60);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10));
    beat.heard();
  }
  beat.stop();
  assert.equal(dead, 0);
  assert.ok(sent >= 4);
  // One that never opened has nothing to ping, and is given up on all the same.
  let gaveUp = false;
  keepalive({ readyState: 0, send: () => assert.fail('nothing to send to') }, () => void (gaveUp = true), 20);
  await new Promise((r) => setTimeout(r, 90));
  assert.ok(gaveUp);
});
