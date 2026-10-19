import type { FileRef } from '../../protocol';

// Text an agent sent can be read in place, highlighted as code by its extension, or rendered if it is Markdown.
// ponytail: up to 256 KB, since it is all laid out at once; page it if agents send bigger logs to read.
const MAX_VIEW = 256 * 1024;
const TEXT = /\.(txt|log|md|json|csv|tsv|ya?ml|toml|ini|xml|html?|css|[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|c|h|cpp|sh|sql|diff|patch)$/i;
export const viewable = (file: FileRef) => file.bytes <= MAX_VIEW && (file.mime.startsWith('text/') || file.mime === 'application/json' || TEXT.test(file.name));

/** As Markdown: the file itself if it is Markdown, otherwise a code block in a fence longer than any run of backticks inside it. */
export function asMarkdown(name: string, text: string) {
  if (/\.md$/i.test(name)) return text;
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((run) => run.length + 1)));
  const ext = /\.(\w+)$/.exec(name)?.[1].toLowerCase();
  return `${fence}${ext && !['txt', 'log'].includes(ext) ? ext : ''}\n${text}\n${fence}`;
}
