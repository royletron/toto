---
name: slurp
description: Set up this project's events on the person's Slurp, their own event store, and send events to it. Use it when asked to track events, add analytics, or work with Slurp.
---

# Slurp

[Slurp](https://slurp.run/docs/) keeps a product's events in a Worker the person runs in their own Cloudflare account. This Toto is signed in to it as an admin, so you can set up a project's events and send them. The command is `~/.local/bin/slurp`: use that whole path, since it may not be on your `PATH`. `SLURP_BACKEND` and `SLURP_TOKEN` are in your environment and it reads them itself, so you need no `slurp connect` and no flag.

## Setting up a project for events

1. **Say what you are about to create first,** unless you were asked to do it. These commands change the person's Worker, and other people may see it.
2. **Make the project:** `~/.local/bin/slurp project create "<this project's name>" --json`. Asking again for the same name gives the same project, so it is safe to repeat. Note its id (`prj_…`).
3. **Make a publishable key for each place that will send events,** each with its own source, which every event it sends carries: `~/.local/bin/slurp project key create prj_ID --scope publishable --source web`. Use short names such as `web`, `ios`, `server`.
4. **Print the endpoint and keys** with `~/.local/bin/slurp project setup prj_ID`.
5. **Wire up the app,** with the endpoint and the publishable key as configuration (an environment variable or the project's usual config), not written into code. Either of:
   - the SDK: `npm install @hitslop/slurp-sdk`, then `init({ endpoint, key })`, `track('signed_up', { plan: 'pro' })`, and `await flush()` before a script exits;
   - a plain request: `POST <endpoint>/v1/events?key=<publishable key>` with a JSON body that has at least `event`, or newline-separated JSON for several. Give each an `id` so a retry does not count twice. A `200` with `{"ok":true,"accepted":N}` means it is stored; a `400` lists the bad lines and stores none.
6. **Check it works** with `~/.local/bin/slurp send test_event --to prj_ID --source cli --data '{"test":true}'`, and say which test event you sent.

## What to keep to

- **The publishable key may go in an app or a web page; the admin token may not.** Never put `SLURP_TOKEN` in a file, a commit, a build, client code, a message or a command line, and never run `slurp connect`, which would save it to a file.
- **The admin token reaches every project's events on that Worker,** not only this project's. Keep to this project: do not list, read or query other projects (`slurp projects`, `read`, `sql`, `sync`), and do not revoke a key you did not make in this session.
- **Do not run `slurp init`** unless asked. It makes a local database and fetches a database engine, which is heavy on a Raspberry Pi. Reading events back is the person's job, on their own computer.
- **If a command is refused or cannot reach the Worker,** say so and stop. Tell the person to sign in again from the Toto app (Plugins, then slurp). Do not try other credentials.
