#!/usr/bin/env bash
# Fails when any Mach-O binary inside the packaged macOS app requires a newer
# macOS than the app declares (electron-builder.yml mac.minimumSystemVersion).
#
# Why: the build runs on the newest available GitHub macOS runner, and pip on
# that runner can prefer a wheel tagged for the runner's own macOS (for example
# macosx_15_0_arm64) whenever the hash lock lists one. The app would still
# declare 14.0 in Info.plist, install on macOS 14, and then fail to load that
# extension at runtime. This gate reads each binary's LC_BUILD_VERSION minos
# (or the legacy LC_VERSION_MIN_MACOSX) and refuses anything above the floor.
#
# Usage: scripts/ci-check-macos-minos.sh "release/mac-arm64/Vision Studio.app" 14.0
set -euo pipefail

APP="${1:?usage: ci-check-macos-minos.sh <path-to-.app> <floor, e.g. 14.0>}"
FLOOR="${2:?usage: ci-check-macos-minos.sh <path-to-.app> <floor, e.g. 14.0>}"

if [ ! -d "$APP" ]; then
  echo "::error::App bundle not found: $APP"
  exit 1
fi

# "14", "14.0" and "14.0.0" all compare equal: major*10000 + minor*100 + patch.
version_key() {
  awk -F. '{ printf "%d", ($1 * 10000) + ($2 * 100) + $3 }' <<<"$1"
}

# Highest minos across every architecture slice of one binary, or empty.
binary_minos() {
  local f="$1" v
  v=$(vtool -show-build "$f" 2>/dev/null | awk '$1 == "minos" { print $2 }' | sort -V | tail -n 1)
  if [ -z "$v" ]; then
    v=$(otool -l "$f" 2>/dev/null | awk '/LC_VERSION_MIN_MACOSX/ { seen = 1 } seen && $1 == "version" { print $2; seen = 0 }' | sort -V | tail -n 1)
  fi
  printf '%s' "$v"
}

checked=0
bad=0
while IFS= read -r -d '' f; do
  file -b "$f" | grep -q 'Mach-O' || continue
  checked=$((checked + 1))
  v=$(binary_minos "$f")
  [ -n "$v" ] || continue
  if [ "$(version_key "$v")" -gt "$(version_key "$FLOOR")" ]; then
    echo "::error file=$f::requires macOS $v, above the $FLOOR floor"
    bad=$((bad + 1))
  fi
done < <(find "$APP" -type f \( -name '*.so' -o -name '*.dylib' -o -perm -u+x \) -print0)

echo "Checked $checked Mach-O binaries against macOS $FLOOR; $bad above the floor."
if [ "$checked" -eq 0 ]; then
  echo "::error::No Mach-O binaries found under $APP - the scan did not run on the app."
  exit 1
fi
[ "$bad" -eq 0 ]
