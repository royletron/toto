#!/bin/sh
# After an archive: put the App Store build on EAS as well, beside the Android ones. Only when the
# workflow has an EXPO_TOKEN, and never failing the build, which goes to TestFlight either way.
set -eu
ipa="$(ls "${CI_APP_STORE_SIGNED_APP_PATH:-/nowhere}"/*.ipa 2>/dev/null | head -1)"
[ -n "${EXPO_TOKEN:-}" ] && [ -n "$ipa" ] || exit 0
cd "$(dirname "$0")/../.."
npx --yes eas-cli@latest upload --platform ios --build-path "$ipa" --non-interactive || echo "warning: the build was not uploaded to EAS"
