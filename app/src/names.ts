// Names for things the person did not name. Nothing here knows about React, so it can be tested.

/** The last part of a repository address, without `.git`: `git@host:you/thing.git` is `thing`. */
export function repoName(repo: string) {
  return repo.trim().replace(/[/\\]+$/, '').replace(/\.git$/i, '').split(/[/:\\]/).pop() ?? '';
}

const WHO = ['toby', 'greg', 'fiona', 'tina', 'bob', 'wendy', 'mavis', 'otto', 'pip', 'nell', 'barney', 'ines', 'ravi', 'dot', 'hugo', 'maya', 'stan', 'edna', 'kofi', 'luna', 'felix', 'darren', 'bill', 'kiki'];
const WHAT = ['maker', 'builder', 'creator', 'architect', 'fixer', 'tinkerer', 'wrangler', 'planner', 'sketcher', 'weaver', 'mender', 'scribe', 'explorer', 'inventor', 'polisher'];

/** A fun name for an agent, like `greg-the-builder`. */
export function agentName(random = Math.random) {
  const pick = (from: string[]) => from[Math.floor(random() * from.length)];
  return `${pick(WHO)}-the-${pick(WHAT)}`;
}
