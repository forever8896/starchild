#!/usr/bin/env bash
#
# Golden Rule guard (Phase 1 — core extraction).
#
# The shared `starchild_core` crate must compile to native AND wasm32, so it may
# never depend on the desktop-only stack: Tauri, SQLite (`rusqlite`), the async
# runtime (`tokio`), or the HTTP client (`reqwest`). Those live in the desktop
# adapter crate only.
#
# This script fails CI if any of those crates (or a sub-crate in their family,
# e.g. `tokio-util`, `tauri-utils`) appear in `starchild_core`'s normal
# dependency closure. A dependency-closure check is authoritative: code cannot
# reference a crate that is not in the closure, and — unlike a text grep — it
# never false-positives on doc comments that merely mention these names.
#
# Usage:  scripts/check-core-purity.sh
# Exit:   0 = pure, 1 = violation, 2 = environment/tooling error.

set -euo pipefail

# Resolve repo root from this script's location so it runs from anywhere.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
MANIFEST="${SCRIPT_DIR}/../src-tauri/core/Cargo.toml"

CRATE="starchild_core"
# Crate families forbidden in the shared core. `(-…)?` also catches sub-crates
# (tokio-util, tauri-utils, …) that would smuggle the same stack in.
FORBIDDEN='(tauri|rusqlite|tokio|reqwest)(-[a-z0-9_]+)?'

if ! command -v cargo >/dev/null 2>&1; then
  echo "core-purity: cargo not found on PATH" >&2
  exit 2
fi

if [[ ! -f "${MANIFEST}" ]]; then
  echo "core-purity: cannot find core manifest at ${MANIFEST}" >&2
  exit 2
fi

# `--edges normal` ignores build- and dev-dependencies (a dev-only dep can't
# leak into the shipped wasm/native lib). `-f {p}` prints "name vX.Y.Z [path]";
# the first whitespace field is the crate name (the root's path may itself live
# under `src-tauri/`, so we must compare names, not the whole line).
violations="$(
  cargo tree --manifest-path "${MANIFEST}" -p "${CRATE}" \
    --edges normal --prefix none -f '{p}' 2>/dev/null \
  | awk '{print $1}' \
  | sort -u \
  | grep -xE "${FORBIDDEN}" || true
)"

if [[ -n "${violations}" ]]; then
  echo "core-purity: FAIL — '${CRATE}' must stay free of Tauri/SQLite/tokio/reqwest." >&2
  echo "Forbidden crate(s) found in its dependency closure:" >&2
  echo "${violations}" | sed 's/^/  - /' >&2
  echo "Move the offending code into the desktop adapter crate." >&2
  exit 1
fi

echo "core-purity: OK — '${CRATE}' has no Tauri/SQLite/tokio/reqwest dependency."
