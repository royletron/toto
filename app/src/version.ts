/** Whether a Toto's version is at least this one. Anything that is not a version, such as the demo's, is not. */
export function atLeast(version: string | undefined, major: number, minor = 0, patch = 0) {
  const [a, b, c] = (version ?? '').split('.').map(Number);
  if (![a, b, c].every(Number.isFinite)) return false;
  return a !== major ? a > major : b !== minor ? b > minor : c >= patch;
}
