# Toto: Plan

What Toto is lives in [SPEC.md](SPEC.md). This is what has been decided, what is built, and what is left. Last updated 2026-10-21 (server 0.7.3, app 1.4.2).

## Where things stand

| Milestone | State |
|---|---|
| M0: Walking skeleton | Done |
| M1: Projects and agents | Done, except the Codex and Gemini chat adapters (deferred) |
| M3: Remote access | Done on Android. iOS push is waiting on an Apple developer account |
| M2: Onboarding | Done: Bluetooth setup, the image, pairing mode, the local `toto` tool, sharing with another phone, in-app Claude sign-in. Per-device keys and mDNS left |
| M4: Consumer readiness | Done: firewall, signed updates on a tap, browser, files, memory and tasks, plugins (`gh`, `wrangler`), Docker image. Unattended OS and CLI updates, MCP setup, per-project credentials and other adapters left |
| M5: Web and launch | Done: the site and docs with a live count, the web app, a public repository. Pi Imager listing and app store releases left |

M3 was done before M2 because a working box already existed and reaching it from outside the house was the bigger gap.

## Decisions

| Area | Decision |
|---|---|
| Audience | Consumer product, open source, free for now |
| Distribution | User flashes a downloadable image (aim for a Raspberry Pi Imager listing) |
| Hardware | Pi 4 and Pi 5, 4GB+. Developed on a Debian 13 x86 machine; first run on a Pi 4 (4GB) on 2026-10-07 |
| Harnesses | Claude Code as a chat today. Codex CLI and Gemini CLI later; both usable now by hand in a project's terminal |
| Interaction | Native chat per harness, with each project's terminals as the fallback |
| Clients | One Expo app. Mobile first; web build from the same code later |
| Onboarding | Bluetooth from the mobile app: the phone finds a new Toto, puts it on Wi-Fi and collects its keys. Typing an address and token remains as a fallback |
| Pairing mode | A Toto advertises over Bluetooth only until it has an owner. After that, pairing mode is turned on by hand at the device, or by itself if the device loses its network |
| Identity | Pairing only, no accounts |
| Remote access | Hosted Cloudflare relay at `toto.royletron.dev`, same code self-hostable |
| Privacy | Every connection is end-to-end encrypted, on the local network and through the relay |
| Projects | A project = one cloned git repo + one dedicated Linux user. Many agents per project |
| Agent concurrency | Git worktree per agent by default; an agent can share the main checkout instead |
| Local network | Blocked per project by default, with a per-project switch |
| Approvals | Per agent: asks first (with a push notification) or full auto. Switchable mid-conversation |
| Model auth | An API key or a Claude subscription, signed in from the app; the device keeps the token |
| Git access | One SSH key per device, shown in the app to add to a git host |
| Push | Sent by the device through Expo's push service, with fixed text and no content |
| Server | TypeScript on Node 24, run directly with no build step |
| Design | Terminal-styled: one monospace face, dark only, amber for the user and for agents waiting on them |
| Mark | A dog in six characters, `/o o\\` over a bullet nose, animated by swapping characters, with a mood per state. Shown throughout the app and on the device's own console |
| App identity | `com.stellar.toto`, Expo project `@stellar-engineering/toto` |
| Plugins | First party only, for now. A plugin is a signed bundle, not code the server runs: a manifest, pinned packages, skills and MCP servers for Claude, environment for agents, and optionally a sign-in flow shown on the phone. Hosted by the relay, but the device checks every bundle against a plugin key of its own (not the release key) before installing; the relay only lists them. Installing anything needs a `toto-priv` verb that takes a plugin name and checks it against what the device has verified, never a package name from the caller. Sign-in is once per Toto, shared by every project; the token sits in a private file and never on a command line |

## How it is built

One repository, three parts, with the message types shared in [protocol.ts](protocol.ts).

**Device server (`server/`).** A single Node service, run by systemd as the unprivileged user `toto`.
- Reaches root only through [bin/toto-priv](bin/toto-priv), which can create or delete a project's Linux user and open or close the local network to it. Project users get ids from 50000 up.
- Runs each chat agent as a child process under the project's user, speaking Claude Code's streaming JSON. A conversation resumes from its session id after a restart; a turn in flight is lost.
- Runs each of a project's terminals (a tab in the app) as a tmux session under the project's user, named for the project and tab, so tmux itself is the list of them. tmux is the terminal emulator: the server sends its finished screen whenever it changes and takes keystrokes one at a time.
- Gives agents their credentials through a private file in the project user's home, never through sudo, which logs what it is handed.
- Keeps projects, agents and phones in `state.json`, memories and tasks in a SQLite database (`toto.db`), and one append-only log per agent, under `/var/lib/toto`.
- Listens on the local network and holds one outbound connection to the relay. Both carry the same encrypted frames.

**App (`app/`).** Expo with Expo Router. Remembers its Toto in secure storage, connects on launch, tries the local network first and falls back to the relay, and reconnects without losing your place. Chat renders markdown with highlighted code; terminals render colour and take typing key by key.

**Relay (`relay/`).** A Cloudflare Worker with one Durable Object per device, forwarding frames it cannot read between a device and its clients. See [relay/README.md](relay/README.md) to run your own.

**Encryption.** Each connection opens with a handshake of fresh nonces, then carries frames sealed with ChaCha20-Poly1305 under a per-direction counter, so forged, replayed and reordered frames fail. Keys are derived from the shared token.

## What is left

### M2: Onboarding
- Done: Bluetooth setup. The device offers a Bluetooth service through BlueZ; phone and device exchange keys and the phone lists and joins Wi-Fi and collects the device's keys. Run end to end on a Pixel against a Pi 4, except for joining a network.
- Done: flashable image: the smallest official Raspberry Pi OS with Toto already installed, a token made on first boot, and a console screen in place of a login.
- Done: a local tool on the device (`toto`): status with the mark alive, pairing mode, Wi-Fi and rename.
- Per-device keys from pairing. This also gives the relay path forward secrecy, which the shared token does not.
- Done: sharing a Toto with another phone or a browser by scanning a code from the phone that set it up. Each gets a key of its own, which that phone can take away.
- Finding the device on the local network by itself (mDNS).
- Done: in-app sign-in for Claude, replacing hand-editing `/etc/toto.env`. Other providers follow with their adapters.
- Check each provider's terms on using a consumer subscription from a third-party harness before offering it to customers.

### M3: leftovers
- iOS push, once there is an Apple developer account to build with.
- A notification icon, and a short explanation before the permission prompt.
- Rate limits and quotas on the relay before its address is public.

### M4: Consumer readiness
- Updates: the agent CLIs by themselves, Toto's server on a tap from signed releases, OS security patches unattended.
- Done: a headless browser for chat agents. Chromium on the device, driven by the Chrome DevTools MCP server, with a skill on using it, both in a plugin the server hands to Claude (`server/plugins/browser`). Not yet measured on a Pi 4, and terminals do not get it.
- Done: plugins, as in Decisions. `gh` (GitHub's device flow) and `wrangler` (a pasted token) are in `plugins/`, signed into `site/plugins/` at deploy. Still to do: the browser plugin onto the same mechanism. As planned: the plugin key and manifest format, the `toto-priv` verb, the sign-in message in `protocol.ts` (older servers answer it with `failed`, older apps ignore it), the app screen. First plugin `gh`, signing in with GitHub's device flow; then the browser plugin moves onto the same mechanism.
- Done: agents can send a file to the phone. A `send_file` tool (plugin `server/plugins/files`, shipped with the server) checks the file is inside the project and at most 10 MB; the server sees the call, reads the file as the project's user, and attaches it to the tool's result by reference; the app fetches it in pieces on a tap and hands it to the share sheet. Not yet tried through a real chat. Files are only ever sent from the project's own directory, and only to phones already paired.
- Done: debugging switches (`server/src/flags.ts`) set from Settings in the app, kept in a file of their own and read as used, so they need no restart. The first keeps the messages about subagents. A flag that is only read at start would need a restart message and a `toto-priv` verb.
- Done: memory and tasks on the node (`server/src/memory.ts`, `tasks.ts`, `agentapi.ts`, the bundled `server/plugins/node`). Memories at three layers (agent, project, whole Toto) and a task list across projects, edited in the app. Agents call a small HTTP server on the loopback address with a token each project is given in its private env file; they write freely to their own layer and their project's, and what they write for the whole Toto waits to be accepted. A session-start hook tells an agent the titles of what applies. Tasks hold files, can be moved between agents and projects, and be pushed to a chat agent. Not yet tried with a real agent calling the tools; the real claude loads the plugin and runs the hook.
- Done: the server as a Docker image (`docker/`), isolated like a Pi (project users, firewall with NET_ADMIN), the relay on by default, login shown as address, token and QR code (a `toto://add` link the app now opens), published to GHCR for amd64 and arm64 on each release. Written without Docker to hand: the CI job that builds and runs it is the first real test.
- Done: memories and tasks (and tags) are in a SQLite database, `toto.db` in the data directory (Node's own `node:sqlite`; `server/src/db.ts`), with a version number and ordered migrations, and imported once from the JSON files they used to be (which are renamed `*.imported`, so going back is renaming them; a server older than this will not see what was added since). Not in it, on purpose: the token, keys and credentials, and the pictures and attachments, so a copy of the database can be kept or shared without them. Next: the agent logs as an events table (paging on connect), then projects, agents and phones from `state.json`, then a `toto backup` that copies the database consistently and says what else matters (the projects' homes, the keys).
- MCP setup: a curated list first, with a fuller marketplace after.
- Per-project overrides for credentials and MCP servers.
- Codex and Gemini chat adapters. Full auto is straightforward for both; asking for approval needs each tool's richer host mode (`codex app-server`, Gemini's ACP), which is unproven.

### M5: Web and launch
- Done: a site that says what Toto is, with documentation and a live count of Totos online.
- Done: web build of the app, paired by scanning a code.
- Pi Imager listing and app store releases. Done: public repository.

## Known limits

- **First setup trusts whoever is nearby.** Until a Toto has an owner, any phone in Bluetooth range can claim it; a Pi has no screen to confirm on.
- **Keys that never change.** The phone that set a Toto up holds its token; phones and browsers it was shared with hold keys of their own. Anyone holding one has full control, and recorded traffic could be decrypted later by someone who obtained it. Fixed by per-device keys with forward secrecy.
- **Loopback is open to agents.** The firewall keeps agents off the local network but cannot separate their own `127.0.0.1` from services on the device listening there. Closing that needs a network namespace per project.
- **One sign-in per plugin for everything.** Every project's agents can use a plugin's sign-in (`gh`, `wrangler`), so it should be as narrowly scoped as the service allows. Per-project sign-in would be tighter.
- **One SSH key for everything.** Added to a git account, it gives every project's agents every repository that account can reach. Per-repository deploy keys would be tighter.
- **Firewall rules are re-applied only at server start.** If something else wipes them while the server runs, they stay gone until it restarts.
- **Histories are replayed whole on connect** and held in memory on both ends. This will need paging once conversations are long.
- **Terminals are screen snapshots,** not a byte stream: very fast output is sampled, and each update resends the screen.
- **No light theme, and no web or tablet layout.**

## Undecided

- Backup and restore of a device, factory reset, and re-pairing after a lost phone.
- Telemetry and crash reporting.
- Whether to ship pre-flashed cards, since flashing limits the audience to fairly technical users.
- Whether 4GB is enough for a browser plus several agents; needs measuring on a Pi 4.
