#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Packing tarball..."
TARBALL=$(npm pack --silent | tail -n1)
TARBALL_PATH="$(pwd)/$TARBALL"
echo "    Packed: $TARBALL"
trap 'rm -f "$TARBALL_PATH"' EXIT

INSTALL_DIR=$(mktemp -d)
trap 'rm -rf "$INSTALL_DIR" "$TARBALL_PATH"' EXIT

echo "==> Installing into clean directory: $INSTALL_DIR"
npm install --prefix "$INSTALL_DIR" "$TARBALL_PATH" --no-save --silent

COBUILD_BIN="$INSTALL_DIR/node_modules/.bin/cobuild"

if [[ ! -x "$COBUILD_BIN" ]]; then
  echo "ERROR: cobuild binary not found at $COBUILD_BIN" >&2
  exit 1
fi

echo "==> Running: cobuild --help"
OUTPUT=$("$COBUILD_BIN" --help 2>&1)

if ! echo "$OUTPUT" | grep -q "cobuild"; then
  echo "ERROR: cobuild --help output did not mention 'cobuild'" >&2
  echo "Output was:" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "    Help output looks correct."
echo "==> Smoke check passed."
