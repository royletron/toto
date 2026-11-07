#!/bin/sh
# Run once for each project, as that project's own user and in their home folder (never as root). It puts
# SpaceVim where Neovim looks for its configuration. Anyone who already has a Neovim configuration keeps it.
set -eu
[ -e "$HOME/.config/nvim" ] && exit 0
# A release, not whatever is newest: SpaceVim is no longer being changed (its author archived it in 2025),
# and a tag is the same for everyone.
if [ ! -d "$HOME/.SpaceVim" ]; then
  git clone --quiet --depth 1 --branch v2.4.0 https://github.com/SpaceVim/SpaceVim "$HOME/.SpaceVim" 2>/dev/null
  # Its history is a quarter of the size and is not wanted: nothing here updates it.
  rm -rf "$HOME/.SpaceVim/.git"
fi
mkdir -p "$HOME/.config"
ln -s "$HOME/.SpaceVim" "$HOME/.config/nvim"
