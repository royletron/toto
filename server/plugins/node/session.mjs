#!/usr/bin/env node
// Runs when an agent's session starts, and says what this Toto remembers for it: what it prints
// goes into the agent's context. Silent if there is nobody to ask.
import { api, available } from './api.mjs';

if (available()) {
  try {
    process.stdout.write(`${(await api('index')).text}\n`);
  } catch {
    // Not worth stopping a session for.
  }
}
