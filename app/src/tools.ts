// What a tool is called on screen. Claude names the tools of an MCP server `mcp__<server>__<tool>`
// (a server from a plugin: `mcp__plugin_<plugin>_<server>__<tool>`), which reads as noise; a person
// wants "Browser: navigate page". The tools built into Claude (Bash, Read, Edit…) are left as they are.

// What each server or plugin is called, by what its name is made from.
const GROUPS: Record<string, string> = {
  'toto-browser': 'Browser',
  'toto-files': 'Files',
  'toto-gh': 'GitHub',
  'toto-wrangler': 'Wrangler',
  playwright: 'Browser',
  puppeteer: 'Browser',
  'chrome-devtools': 'Browser',
};

// Toto's own memory and task tools share one server, so they are told apart by the tool.
const NODE_TOOLS: Record<string, string> = {
  recall: 'Memory',
  remember: 'Memory',
  forget: 'Memory',
  raise_task: 'Tasks',
  update_task: 'Tasks',
  list_tasks: 'Tasks',
  done_task: 'Tasks',
  get_task_file: 'Tasks',
};

const words = (text: string) => text.replaceAll('_', ' ').replaceAll('-', ' ').trim();
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The name to show for a tool call: a plain one for an MCP tool, and the name itself for any other. */
export function toolLabel(name: string): string {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!match) return name;
  const [, server, tool] = match;
  // From a plugin the server is `plugin_<plugin>_<server>`; the plugin is the part that names what it is for.
  const plugin = server.startsWith('plugin_') ? server.slice('plugin_'.length).split('_')[0] : server;
  const group = (plugin === 'toto-node' ? NODE_TOOLS[tool] : undefined) ?? GROUPS[plugin] ?? capital(words(plugin.replace(/^toto-/, '')));
  // A browser's tools say so again in their own names (browser_navigate): once is enough.
  const action = words(group === 'Browser' ? tool.replace(/^browser_/, '') : tool);
  return `${group}: ${action}`;
}
