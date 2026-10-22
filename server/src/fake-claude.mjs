#!/usr/bin/env node
// Test stand-in for the claude CLI: each prompt asks permission for two tool calls,
// then reports the decision it was given for each. A prompt saying "crash now" makes it die mid-turn instead.
// An interrupt cancels whatever is unanswered and ends the turn as Claude does, with an error result.
import { createInterface } from 'node:readline';

const out = (o) => console.log(JSON.stringify(o));
const answers = [];
let turn = false;
createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.type === 'user' && line.includes('crash now')) return void setTimeout(() => process.exit(3), 500);
  if (msg.type === 'user') {
    turn = true;
    for (const n of [1, 2]) {
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${n}`, name: 'Bash', input: { n } }] } });
      out({ type: 'control_request', request_id: `r${n}`, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { n }, tool_use_id: `t${n}` } });
    }
  }
  if (msg.type === 'control_request' && msg.request.subtype === 'interrupt') {
    if (!turn) return;
    turn = false;
    for (const n of [1, 2]) if (!answers.some((a) => a.startsWith(`r${n}:`))) out({ type: 'control_cancel_request', request_id: `r${n}` });
    answers.length = 0;
    out({ type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
    return out({ type: 'result', subtype: 'error_during_execution', is_error: true });
  }
  if (msg.type === 'control_response') {
    const { behavior, updatedInput } = msg.response.response;
    answers.push(`${msg.response.request_id}:${behavior}${updatedInput?.answers ? '=' + JSON.stringify(updatedInput.answers) : ''}`);
    if (answers.length === 2) {
      out({ type: 'assistant', message: { content: [{ type: 'text', text: answers.sort().join(' ') }] } });
      turn = false;
      out({ type: 'result', is_error: false });
    }
  }
});
