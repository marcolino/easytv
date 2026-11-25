#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
mkdir -p src/config
for name in tvs radios services build-info; do
  old="src/$name.json"
  new="src/config/$name.json"
  if [[ -f "$old" ]]; then
    # Preserve the local catalogue and build counter rather than replacing them.
    mv -f -- "$old" "$new"
  elif [[ ! -f "$new" ]]; then
    printf 'Missing configuration: %s\n' "$new" >&2
    exit 1
  fi
done
