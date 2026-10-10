// How the tools and the session hook reach this Toto. Where, who and the token come from the
// environment the Toto starts an agent with; without them there is nothing to talk to.
export const available = () => !!(process.env.TOTO_API_TOKEN && process.env.TOTO_AGENT_ID);

/** Calls the Toto. Resolves to what it answered, or throws a sentence saying what went wrong. */
export async function api(route, args = {}) {
  if (!available()) throw new Error('Memory and tasks are not available in this session.');
  const res = await fetch(`${process.env.TOTO_API_URL ?? 'http://127.0.0.1:7861'}/api/${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.TOTO_API_TOKEN}`, 'x-toto-agent': process.env.TOTO_AGENT_ID, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);
  if (!res) throw new Error('Could not reach the Toto.');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'That did not work.');
  return body;
}
