---
name: spacevim
description: Neovim with SpaceVim is installed on this Toto for the person to use in a terminal tab. Know that it is there, and do not open it yourself.
---

# SpaceVim

`nvim` is Neovim set up with [SpaceVim](https://spacevim.org), for the person to use in a terminal tab of this project. It is not for you.

## Things to know

- **Do not run `nvim`, `vi` or any editor that takes over the screen.** There is nobody at the keyboard of your session, so it would wait for ever. Change files with the tools you have.
- **If you must run it unattended,** use `nvim --headless` with commands to run (`-c`) and `-c q` to finish, and nothing that asks for input.
- **The first time the person opens it, it fetches its plugins** from GitHub and takes a minute or two, so expect a pause and some messages. This is normal.
- **Its configuration is the person's.** It is in `~/.SpaceVim.d/init.toml` and is changed by them. Do not edit it without being asked.
