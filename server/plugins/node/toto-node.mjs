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
    inputSchema: { type: 'object', required: ['title'], properties: { title: str('A short title.'), description: str('What and why.'), tags: { type: 'array', items: { type: 'string' }, description: 'Labels, such as bug or docs. Up to 8, each up to 24 characters. Reuse the ones already in use where they fit.' }, files: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'update_task',
    description: 'Change a task of this project: its title, description, state (open, working or done) or tags, and attach more files. Only what you give changes. Use it to keep a task true as you work on it, such as adding what you found.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str('The task id.'), title: str('A new title.'), description: str('A new description, replacing the old.'), state: { type: 'string', enum: ['open', 'working', 'done'] }, tags: { type: 'array', items: { type: 'string' }, description: "The task's labels, replacing the old ones. Leave out to keep them." }, files: { type: 'array', items: { type: 'string' } } } },
  },
  { name: 'list_tasks', description: 'The tasks still open in this project, with their ids.', inputSchema: { type: 'object', properties: {} } },
  { name: 'done_task', description: 'Mark a task of this project done, once the work on it is finished.', inputSchema: { type: 'object', required: ['id'], properties: { id: str('The task id.') } } },
  { name: 'list_agents', description: 'The other agents the person has connected you to, with their ids, their projects, whether each is busy, and what you may do with each: ask questions, or also ask for work. Empty unless the person has connected you.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'ask_agent',
    description: 'Ask a connected agent a question about its project: how something works, where something is, what it needs from you. It answers later, and the answer arrives here as a message, so do not wait for it. Be specific and give the context they need, since they cannot see your project. Never send a secret.',
    inputSchema: { type: 'object', required: ['agent', 'question'], properties: { agent: str('Its name or id, from list_agents.'), question: str('What you want to know, with the context needed to answer it.') } },
  },
  {
    name: 'request_work',
    description: 'Ask a connected agent to implement something in its project, when the person has allowed you to (list_agents says). It becomes a task on their project\'s list, which the person can see. Say what is wanted and why, and how you will use it. You are told when they finish it, or if they cannot.',
    inputSchema: { type: 'object', required: ['agent', 'title'], properties: { agent: str('Its name or id, from list_agents.'), title: str('A short title.'), description: str('What and why, with whatever they need to do it. They cannot see your project.') } },
  },
  {
    name: 'reply_to_agent',
    description: 'Answer a request another agent made of you, by its id (given in the message you were sent). Use it to answer a question, or to say you cannot do work you were asked for, or need to know something first.',
    inputSchema: { type: 'object', required: ['request', 'answer'], properties: { request: str('The request id, such as req_1a2b3c4d.'), answer: str('Your answer.') } },
  },
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
  const routes = { recall: 'recall', remember: 'remember', forget: 'forget', raise_task: 'raise_task', update_task: 'update_task', list_tasks: 'list_tasks', done_task: 'done_task', list_agents: 'list_agents', ask_agent: 'ask_agent', request_work: 'request_work', reply_to_agent: 'reply_to_agent' };
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
