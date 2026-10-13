#!/bin/sh
# Xcode Cloud runs this straight after cloning, before it looks for the Xcode project. The project
# is generated, not committed, so this is what makes it: Node, the packages, `expo prebuild`, pods.
# This folder is the only part of ios/ in git, and has to be here: Xcode Cloud looks for
# ci_scripts beside the workspace.
set -eu
export CI=1 HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/../.."

command -v node >/dev/null || { brew install node@24 && brew link --overwrite --force node@24; }
command -v pod >/dev/null || brew install cocoapods

# The version is app.json's, as for Android. A build started by a tag has to be of that version.
version="$(node -p "require('./app.json').expo.version")"
if [ -n "${CI_TAG:-}" ] && [ "$CI_TAG" != "app-v$version" ]; then
  echo "error: the tag is $CI_TAG but app.json says $version" >&2
  exit 1
fi

npm ci
# In CI, prebuild clears an ios folder with no project in it, which would take these scripts with it.
keep="$(mktemp -d)"
cp -R "$here" "$keep/ci_scripts"
npx expo prebuild --platform ios
rm -rf ios/ci_scripts && cp -R "$keep/ci_scripts" ios/ci_scripts

# Xcode Cloud counts builds; that count is the build number, so each upload has a new one.
[ -z "${CI_BUILD_NUMBER:-}" ] || /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $CI_BUILD_NUMBER" ios/Toto/Info.plist
