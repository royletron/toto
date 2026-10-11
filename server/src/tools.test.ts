import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toolLabel } from '../../app/src/tools.ts';

test('an MCP tool is named in plain words, and Claude\'s own tools are left alone', () => {
  for (const [name, shown] of [
    ['mcp__plugin_toto-node_node__remember', 'Memory: remember'],
    ['mcp__plugin_toto-node_node__recall', 'Memory: recall'],
    ['mcp__plugin_toto-node_node__raise_task', 'Tasks: raise task'],
    ['mcp__plugin_toto-node_node__get_task_file', 'Tasks: get task file'],
    ['mcp__plugin_toto-files_files__send_file', 'Files: send file'],
    ['mcp__plugin_toto-browser_browser__navigate_page', 'Browser: navigate page'],
    ['mcp__plugin_toto-browser_browser__take_screenshot', 'Browser: take screenshot'],
    ['mcp__playwright__browser_navigate', 'Browser: navigate'],
    ['mcp__playwright__browser_take_screenshot', 'Browser: take screenshot'],
    ['mcp__chrome-devtools__list_pages', 'Browser: list pages'],
    ['mcp__plugin_toto-gh_gh__anything', 'GitHub: anything'],
    ['mcp__github__create_issue', 'Github: create issue'],
    ['mcp__some-server__do_the_thing', 'Some server: do the thing'],
    ['Bash', 'Bash'],
    ['Read', 'Read'],
    ['AskUserQuestion', 'AskUserQuestion'],
    ['mcp__', 'mcp__'],
    ['mcp__only', 'mcp__only'],
  ] as const) assert.equal(toolLabel(name), shown, name);
});
