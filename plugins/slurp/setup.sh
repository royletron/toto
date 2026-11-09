#!/bin/sh
# Run once for each project, as that project's own user and in their home folder (never as root). It puts
# the Slurp command line in ~/.local/bin, at the version below, after checking the download against the
# checksum below, which came from the project's own release and is signed into this bundle with the rest.
# (Its npm package fetches the same file when it installs, which the installer does not let it do.)
set -eu
version=0.3.0
case "$(uname -m)" in
  aarch64 | arm64) arch=aarch64 sum=a352ed8cd352589cf42ba473af84663066736d00f4819636f85d83afcdb056d2 ;;
  x86_64 | amd64) arch=x86_64 sum=d6a914247eb32b3a18691264e36ccd5cdbdbab0355781fb4bae4bca04b84da7f ;;
  *) echo "slurp: there is no build of it for $(uname -m)" >&2; exit 1 ;;
esac
bin="$HOME/.local/bin"
# Already the right one.
[ -x "$bin/slurp" ] && [ "$("$bin/slurp" --version 2>/dev/null)" = "slurp-cli $version" ] && exit 0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
file="slurp-cli-$arch-unknown-linux-gnu"
curl -fsSL --max-time 300 -o "$tmp/slurp.tar.xz" "https://github.com/hitSlop/slurp/releases/download/v$version/$file.tar.xz"
echo "$sum  $tmp/slurp.tar.xz" | sha256sum -c - >/dev/null || { echo "slurp: the download is not the release it should be" >&2; exit 1; }
tar xJf "$tmp/slurp.tar.xz" -C "$tmp"
mkdir -p "$bin"
install -m 755 "$tmp/$file/slurp" "$bin/slurp"
# So a terminal tab finds it too. (Agents are told its whole path.)
grep -qsF 'toto: slurp' "$HOME/.bashrc" || printf '\n# toto: slurp\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
