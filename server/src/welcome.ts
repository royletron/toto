// How a Toto with no Bluetooth to hand its keys over (one in a container, say) tells its owner how
// to reach it: the address and token to type in, and the same as a link inside a QR code that the
// phone's camera opens in the app. Printed to a terminal, never to a log (see entrypoint.sh).
import makeQR from 'qrcode-generator';

export type Login = {
  name: string;
  token: string;
  port: number;
  /** The address phones on the same network use, as host:port, if it is known. */
  address?: string;
  /** The relay for reaching it from away, if it has one. */
  relay?: string;
};

/** The link that adds this Toto in the app. The app reads it with additionIn (app/src/invite.ts). */
export function addLink({ name, token, address, relay }: Login): string {
  const fields: [string, string | undefined][] = [['a', address ? `ws://${address}` : undefined], ['r', relay || undefined], ['t', token], ['n', name]];
  return 'toto://add?' + fields.filter((f): f is [string, string] => !!f[1]).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/**
 * A QR code for `text` as lines of a terminal: black squares on white, two rows of squares to a
 * line with half blocks, and a margin round it. A dark terminal would otherwise show it inverted,
 * which many cameras will not read.
 */
export function qrLines(text: string): string[] {
  const code = makeQR(0, 'L');
  code.addData(text);
  code.make();
  const n = code.getModuleCount();
  const margin = 2;
  const dark = (row: number, col: number) => row >= margin && col >= margin && row < n + margin && col < n + margin && code.isDark(row - margin, col - margin);
  const lines: string[] = [];
  for (let row = 0; row < n + 2 * margin; row += 2) {
    let line = '';
    for (let col = 0; col < n + 2 * margin; col++) line += `\x1b[${dark(row, col) ? 30 : 97};${dark(row + 1, col) ? 40 : 107}m▀`;
    lines.push(line + '\x1b[0m');
  }
  return lines;
}

/** Everything to say to the owner, a line at a time. `plain` leaves out the colour. */
export function loginLines(login: Login): string[] {
  const { name, token, port, address, relay } = login;
  const lines = [
    `${name} is ready. To add it in the Toto app:`,
    '',
    `  address  ${address ? `ws://${address}` : '(not known: see below)'}`,
    `  token    ${token}`,
    `  relay    ${relay || '(none: reachable on this network only)'}`,
    '',
    'Or point the phone\'s camera at this, which opens the app and adds it:',
    '',
    ...qrLines(addLink(login)).map((l) => `  ${l}`),
    '',
    'Or open this link on the phone:',
    `  ${addLink(login)}`,
    '',
  ];
  if (!address) lines.push(`This machine's address is not known from inside the container. Run it with TOTO_ADDRESS=<this machine's address>:${port} to put it here, or add it by address once you know it.`);
  if (!relay) lines.push('With no relay it is reachable only on the network this machine is on.');
  return lines;
}
