/**
 * Pings a connection every `every` ms, and if the last ping was never answered calls `dead`, once, and
 * stops. Whoever answers calls `heard`. `dead` has to stand on its own: `ws.close()` on a connection that
 * has gone silent waits for the other end to finish closing, and in Node never finishes, so nothing
 * can be left to run when it does.
 */
export function keepalive(ws: { readyState: number; send: (data: string) => void }, dead: () => void, every = 30_000) {
  let answered = true;
  const timer = setInterval(() => {
    if (!answered) {
      clearInterval(timer);
      return dead();
    }
    answered = false;
    if (ws.readyState === 1) ws.send('ping');
  }, every);
  return { heard: () => void (answered = true), stop: () => clearInterval(timer) };
}
