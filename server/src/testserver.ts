import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { keysFromToken, session } from './secure.ts';

// What signing in to a plugin puts in the environment (GH_TOKEN, CLOUDFLARE_API_TOKEN, SLURP_BACKEND and so on).
// A person or an agent working on Toto may be signed in to some of them, and a test server must not
// start out as though it were: it would be "signed in" to things it has not been, and tests that say otherwise would fail.
const loginVariables = readdirSync(new URL('../../plugins/', import.meta.url).pathname, { withFileTypes: true }).flatMap((entry) => {
  try {
    const { login } = JSON.parse(readFileSync(new URL(`../../plugins/${entry.name}/manifest.json`, import.meta.url), 'utf8'));
    return login ? [login.env, ...(login.paste?.also ?? []).map((f: { env: string }) => f.env)] : [];
  } catch {
    return [];
  }
});
const cleanEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !loginVariables.includes(name)));

export type Line = { said: any[]; send: (m: object) => void; next: (type: string) => Promise<any>; ended: Promise<'refused' | 'closed'> };

/** A real server, with its token `owner-token`, to be talked to as phones. It is stopped when the test file ends. */
export function startServer(env: Record<string, string> = {}, seed?: (dataDir: string) => void) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const dataDir = mkdtempSync(join(tmpdir(), 'toto-test-'));
  // What was in the data directory before this version, put there before the server starts.
  seed?.(dataDir);
  const server = spawn(process.execPath, [new URL('./index.ts', import.meta.url).pathname], {
    env: { ...cleanEnvironment(), TOTO_PORT: String(port), TOTO_TOKEN: 'owner-token', TOTO_DATA_DIR: dataDir, TOTO_RELAY_URL: '',
      // Not the internet: a release or a plugin list arriving mid-test changes the state a test is waiting on.
      TOTO_RELEASES: 'http://127.0.0.1:9', TOTO_PLUGIN_INDEX: 'http://127.0.0.1:9/index.json', ...env },
    stdio: 'ignore',
  });
  after(() => server.kill());

  /** Opens a line with the device's token, or as phone `p` with a secret of its own. */
  async function dial(secret: string, p?: string): Promise<Line> {
    for (let tries = 0; ; tries++) {
      try {
        return await new Promise<Line>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}`);
          const nonce = randomBytes(16).toString('hex');
          const said: any[] = [];
          const waiting: { type: string; got: (m: any) => void }[] = [];
          let s: ReturnType<typeof session>;
          let end: (how: 'refused' | 'closed') => void;
          const line: Line = {
            said,
            send: (m) => ws.send(JSON.stringify({ t: 'data', b: s.seal(JSON.stringify(m)) })),
            next: (type) => new Promise((got) => waiting.push({ type, got })),
            ended: new Promise((r) => (end = r)),
          };
          ws.onerror = () => reject(new Error('not up yet'));
          ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', n: nonce, p }));
          ws.onclose = () => end('closed');
          ws.onmessage = ({ data }) => {
            const f = JSON.parse(data);
            if (f.t === 'refused') return end('refused');
            if (f.t === 'hello') {
              s = session(keysFromToken(secret).psk, 'client', nonce, f.n);
              return resolve(line);
            }
            const m = JSON.parse(s.open(f.b));
            said.push(m);
            const i = waiting.findIndex((w) => w.type === m.type);
            if (i >= 0) waiting.splice(i, 1)[0].got(m);
          };
        });
      } catch (err) {
        if (tries > 40) throw err;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }
  const soon = <T,>(p: Promise<T>) => Promise.race([p, new Promise<'nothing'>((r) => setTimeout(() => r('nothing'), 1500))]);
  return { port, dial, soon, dataDir };
}
