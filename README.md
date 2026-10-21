# Toto

```
/o o\
  •
```

Your coding agents keep working at home. Toto is a small box on your own network, a Raspberry Pi or any Linux machine, that runs your agents around the clock. You talk to them, and approve what they do, from your phone.

**[toto.royletron.dev](https://toto.royletron.dev)** · [Documentation](https://toto.royletron.dev/docs) · [Latest release](https://github.com/royletron/toto/releases/latest)

Toto is early. It works, for the handful of people running it, and parts of it have been tested on one or two machines only. The [known limits](https://toto.royletron.dev/docs#limits) are listed honestly.

## What it does

- **Runs agents on your hardware.** Claude Code in a chat you can read on your phone, or anything else in a terminal you can type into from it.
- **Asks before anything risky.** An agent that wants to run a command stops, your phone buzzes, and you allow or deny it. Or put an agent on full auto.
- **Keeps projects apart.** A project is a git repository with its own Linux user, so agents in one cannot read another's files or credentials, and cannot reach the rest of your home network unless you allow it.
- **Works when you are out.** A relay passes messages between your phone and your Toto. Everything is encrypted between the two, so the relay cannot read any of it. You can run your own.
- **Sets up from your phone.** A new Toto is found over Bluetooth, given your Wi-Fi, and signed in to Claude, without a keyboard or a screen.
- **Remembers, and keeps a to-do list.** Agents keep notes for next time, for themselves, their project or the whole Toto, and share a task list you edit in the app.
- **Takes plugins.** Signed bundles that give agents more tools, such as GitHub's `gh` and Cloudflare's `wrangler`, signed in once from your phone.
- **Updates itself when you say.** From signed releases, checked on the device before anything is installed.

## Getting one going

**On a Raspberry Pi 4 or 5:** download [`toto.img.xz`](https://github.com/royletron/toto/releases/latest/download/toto.img.xz), flash it to a card with Raspberry Pi Imager (Choose OS, then Use custom), and plug the Pi in.

**On 64-bit Debian or Raspberry Pi OS you already run:**

```sh
git clone https://github.com/royletron/toto
cd toto
sudo ./install.sh
```

**In Docker, on any machine:** the server, without the relay, as an image.

```sh
docker run -it --name toto --cap-add NET_ADMIN \
  -v toto-data:/var/lib/toto -v toto-home:/home \
  -e TOTO_ADDRESS=<this machine's address>:7860 -p 7860:7860 \
  ghcr.io/royletron/toto
```

It prints the address, the token and a QR code to add it in the app; `docker exec -it toto toto login` shows them again. [More on running it in Docker](https://toto.royletron.dev/docs#docker).

Then, in the app, choose **Find a new Toto nearby** (or scan the code, for one in Docker). The app is not in a store yet: each release has the Android app as `toto.apk`, or see [Building the app](#the-app) below. The [documentation](https://toto.royletron.dev/docs) covers the rest.

## What is in here

| Path | What it is |
| --- | --- |
| `server/` | What runs on the Toto: projects, agents, the encrypted connection to phones, Bluetooth setup. Node 24, TypeScript run directly. |
| `app/` | The phone app. Expo and React Native. |
| `relay/` | The relay, and the site it serves. A Cloudflare Worker with Durable Objects. |
| `site/` | The site at toto.royletron.dev. Plain HTML, CSS and a little JavaScript. |
| `bin/` | What runs as root on a Toto: the helper the server asks for privileged things, the updater, first-boot setup. |
| `image/` | Builds the flashable Raspberry Pi image from the official Raspberry Pi OS Lite. |
| `plugins/` | Plugins the device can install (`gh`, `wrangler`), and `pack.mjs`, which signs them for the site to serve. The ones that ship with the server are in `server/plugins/`. |
| `store/` | The app store listings, screenshots and notes for reviewers. |
| `docker/` | The Dockerfile and entrypoint for the server as a container image. |
| `protocol.ts` | The messages the app and the server exchange. Types only. |
| `install.sh` | Installs or upgrades Toto on a machine. |
| [`PLAN.md`](PLAN.md), [`SPEC.md`](SPEC.md) | Where this is going, and the decisions made so far. |

## Working on it

### The server

```sh
cd server
npm install
TOTO_TOKEN=dev TOTO_DATA_DIR=/tmp/toto npm start   # listens on :7860
npm test
npm run typecheck
```

Run like this, on a laptop, it does not isolate projects or touch Bluetooth and Wi-Fi: those need the installed service on Linux.

### The app

```sh
cd app
npm install
EXPO_PUBLIC_TOTO_URL=ws://localhost:7860 EXPO_PUBLIC_TOTO_TOKEN=dev npx expo start
npx tsc --noEmit && npx expo lint
```

Bluetooth setup and push notifications need a real build rather than Expo Go: `npx expo prebuild -p android`, then `./gradlew assembleRelease` in `app/android`.

### The relay and the site

```sh
cd relay
npm install
npx wrangler dev      # the relay and the site, on :8787
npx wrangler deploy   # to your own Cloudflare account
```

To use your own relay, put its `wss://` address in `TOTO_RELAY_URL` in `/etc/toto.env` on the Toto and in the app's settings.

### The image

```sh
sudo image/build.sh   # on 64-bit ARM Linux; the result is /var/tmp/toto-image/toto.img.xz
```

## Releases

Pushing a tag that matches the version in `server/package.json` publishes a release:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

The [workflow](.github/workflows/release.yml) tests, bundles and signs the update, publishes it with the flashable image, and tells the Totos that are online. A Toto installs an update only if it is signed with the release key, whose public half is [`release.pub`](release.pub), and is newer than what it has.

The app is versioned separately: `expo.version` in `app/app.json`, tagged `app-v1.2.3`. Pushing an app tag builds the Android app on GitHub ([workflow](.github/workflows/app.yml)) and the iOS app on Xcode Cloud; `app/release.sh` does the Android build on your own machine instead. App tags do not become GitHub Releases, because a Toto takes the latest release as its next update.

A fork that wants to publish its own updates needs its own key pair: replace `release.pub`, keep the private half in the `RELEASE_KEY` secret, and point `RELEASES` in `server/src/index.ts` and `bin/toto-update.mjs` at your repository. Plugins have a key of their own: replace `plugin.pub`, keep its private half in the `PLUGIN_KEY` secret, and point `PLUGINS` in `bin/toto-plugin.mjs` and `LISTED` in `server/src/plugins.ts` at where you serve them.

## Security

How Toto keeps things private, and where it does not yet, is written up in the [documentation](https://toto.royletron.dev/docs#security). If you find a way around any of it, please report it privately through [GitHub's security advisories](https://github.com/royletron/toto/security/advisories/new) rather than in a public issue.

## Licence

[MIT](LICENSE).
