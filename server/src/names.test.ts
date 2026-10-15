import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentName, repoName } from '../../app/src/names.ts';

test('a repository address gives its name', () => {
  for (const [repo, name] of [
    ['git@github.com:you/repo.git', 'repo'],
    ['https://github.com/you/my-thing.git', 'my-thing'],
    ['https://github.com/you/my-thing/', 'my-thing'],
    ['  https://host/you/thing  ', 'thing'],
    ['thing.git', 'thing'],
    ['', ''],
  ]) assert.equal(repoName(repo), name);
});

test('agent names look like name-the-job, and vary', () => {
  assert.match(agentName(), /^[a-z]+-the-[a-z]+$/);
  assert.equal(new Set(Array.from({ length: 50 }, () => agentName())).size > 10, true);
  assert.equal(agentName(() => 0), agentName(() => 0));
});
