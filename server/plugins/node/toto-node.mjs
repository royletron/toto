#!/usr/bin/env node
// An MCP server with the tools an agent uses to keep notes and a list of things to do. All it does
// is pass them to the Toto (see api.mjs), which holds the notes and the list; the people it works for
// read and change them in the app.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { api } from './api.mjs';

const str = (description) => ({ type: 'string', description });

export const TOOLS = [
  {
    name: 'recall',
    description: 'Look up what this Toto remembers: give the id from the list you were shown, or a few words to search the titles and text. Returns the whole text.',
    inputSchema: { type: 'object', properties: { id: str('A memory id, from the list.'), query: str('A few words to look for.') } },
  },
  {
    name: 'remember',
    description:
      'Keep something worth knowing next time: how something is done here, what to do or avoid, what the person prefers. Short and specific, with a clear title. Never a password, key or token. layer is agent (just you; the default), project (every agent in this project) or node (every project; it waits for the person to accept it).',
    inputSchema: { type: 'object', required: ['title', 'body'], properties: { title: str('A short title.'), body: str('What to remember.'), layer: { type: 'string', enum: ['agent', 'project', 'node'] } } },
  },
  { name: 'forget', description: 'Delete a memory you wrote yourself, by its id.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('The memory id.') } } },
  {
    name: 'raise_task',
    description: 'Put something on the person\'s list of things to do for later, when it is not for you to do now: a follow-up, a bug you noticed, an idea. Say enough that it makes sense on its own. files are paths inside the project to attach (up to 10 MB each).',
    inputSchema: { type: 'object', required: ['title'], properties: { title: str('A short title.'), description: str('What and why.'), files: { type: 'array', items: { type: 'string' } } } },
  },
  { name: 'list_tasks', description: 'The tasks still open in this project, with their ids.', inputSchema: { type: 'object', properties: {} } },
  { name: 'done_task', description: 'Mark a task of this project done, once the work on it is finished.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('The task id.') } } },
  {
    name: 'get_task_file',
    description: 'Save a file attached to a task into this project, so you can read it. Gives the path it was saved to.',
    inputSchema: { type: 'object', required: ['task', 'file'], properties: { task: str('The task id.'), file: str('The file\'s name or id.'), to: str('Where to put it, inside the project. Defaults to its name, here.') } },
  },
];

/** Saves a downloaded task file under the current directory, and nowhere else. */
function save(name, base64, to, cwd = process.cwd()) {
  const root = realpathSync(cwd);
  const target = resolve(root, to || basename(name));
  mkdirSync(dirname(target), { recursive: true });
  const real = resolve(realpathSync(dirname(target)), basename(target));
  if (real !== root && !real.startsWith(root + sep)) throw new Error('That is outside this project.');
  writeFileSync(real, Buffer.from(base64, 'base64'));
  return real;
}

/** What one tool call comes to, as the text to tell the agent. Throws a sentence if it cannot be done. */
export async function run(name, args, cwd = process.cwd()) {
  if (name === 'get_task_file') {
    const file = await api('task_file', { task: args?.task, file: args?.file });
    return `Saved to ${save(file.name, file.base64, args?.to, cwd)}.`;
  }
  const routes = { recall: 'recall', remember: 'remember', forget: 'forget', raise_task: 'raise_task', list_tasks: 'list_tasks', done_task: 'done_task' };
  if (!routes[name]) throw new Error('There is no such tool.');
  return (await api(routes[name], args ?? {})).text;
}

/** The answer to one JSON-RPC message, or nothing for a notification. */
export async function answer(msg, cwd) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  if (msg.id === undefined) return undefined;
  switch (msg.method) {
    case 'initialize':
      return reply({ protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'toto-node', version: '1.0.0' } });
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      try {
        return reply({ content: [{ type: 'text', text: await run(msg.params?.name, msg.params?.arguments, cwd) }] });
      } catch (err) {
        return reply({ isError: true, content: [{ type: 'text', text: err instanceof Error ? err.message : 'That did not work.' }] });
      }
    }
    default:
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Not supported.' } };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  createInterface({ input: process.stdin }).on('line', async (line) => {
    try {
      const out = await answer(JSON.parse(line));
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    } catch {
      // Not JSON-RPC; nothing to answer.
    }
  });
