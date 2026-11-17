#!/usr/bin/env bash
#
# build-win.sh — Build EasyTV Windows installer on Ubuntu
#
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking prerequisites"

for cmd in node npm wine; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: $cmd is not installed"
        exit 1
    fi
done

echo
echo "==> Checking JavaScript"
npm run check

echo
echo "==> Building Windows installer"
npm run dist:win

echo
echo "==> Windows installer ready"

shopt -s nullglob
installers=(dist/*.exe)
shopt -u nullglob

if (( ${#installers[@]} == 0 )); then
    echo "ERROR: No Windows installer found"
    exit 1
fi

for installer in "${installers[@]}"; do
    echo
    ls -lh "$installer"
    sha256sum "$installer"
done

echo
echo "==> Build completed successfully"
