#!/bin/sh
# Run once for each project, as that project's own user and in their home folder (never as root). It puts the
# Slurp command line in ~/.local/bin and the DuckDB it reports with in ~/.slurp/bin, each at a version below,
# after checking the download against a checksum below, which came from the project's own release and is
# signed into this bundle with the rest. (Slurp's npm package fetches its file in an install script, which the
# installer does not let it run, and Slurp will not fetch DuckDB without being asked in person.)
set -eu
version=0.3.0
duck=2.0.0
case "$(uname -m)" in
  aarch64 | arm64) arch=aarch64 sum=a352ed8cd352589cf42ba473af84663066736d00f4819636f85d83afcdb056d2 duckarch=arm64 ducksum=859e1875d2a9515fbb4bf8871061437a14af82320da68c753f094c4b776348fe ;;
  x86_64 | amd64) arch=x86_64 sum=d6a914247eb32b3a18691264e36ccd5cdbdbab0355781fb4bae4bca04b84da7f duckarch=amd64 ducksum=c6507206baf7793c6013dbd82368469a45f20dc0e17a6f92f204602f652ed2bc ;;
  *) echo "slurp: there is no build of it for $(uname -m)" >&2; exit 1 ;;
esac
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Downloads $1 to $tmp/$2, unpacks it there with $3, and stops if it is not the file with the checksum $4.
fetch() {
  curl -fsSL --max-time 300 -o "$tmp/$2" "$1"
  echo "$4  $tmp/$2" | sha256sum -c - >/dev/null || { echo "slurp: the download is not the release it should be" >&2; exit 1; }
  tar "$3" "$tmp/$2" -C "$tmp"
}

bin="$HOME/.local/bin"
if ! { [ -x "$bin/slurp" ] && [ "$("$bin/slurp" --version 2>/dev/null)" = "slurp-cli $version" ]; }; then
  file="slurp-cli-$arch-unknown-linux-gnu"
  fetch "https://github.com/hitSlop/slurp/releases/download/v$version/$file.tar.xz" slurp.tar.xz xJf "$sum"
  mkdir -p "$bin"
  install -m 755 "$tmp/$file/slurp" "$bin/slurp"
fi

duckbin="$HOME/.slurp/bin/duckdb"
if ! { [ -x "$duckbin" ] && "$duckbin" --version 2>/dev/null | grep -q "^v$duck "; }; then
  fetch "https://github.com/duckdb/duckdb/releases/download/v$duck/duckdb-cli-linux-$duckarch.tar.gz" duckdb.tar.gz xzf "$ducksum"
  mkdir -p "$HOME/.slurp/bin"
  install -m 755 "$tmp/duckdb" "$duckbin"
fi

# Tell it where they are, and where to keep what it downloads. Without the sign-in in its environment, so
# that its settings hold only paths: the address and token stay in the environment, which wins over them.
env -u SLURP_BACKEND -u SLURP_TOKEN -u SLURP_READ_KEY -u SLURP_PUBLISHABLE_KEY "$bin/slurp" setup --library "$HOME/.slurp/library" --duckdb "$duckbin" --no-connect --no-open >/dev/null

# So a terminal tab finds it too. (Agents are told its whole path.)
grep -qsF 'toto: slurp' "$HOME/.bashrc" || printf '\n# toto: slurp\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
