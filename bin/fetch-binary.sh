#!/data/data/com.termux/files/usr/bin/bash
# fetch-binary.sh — re-fetch the ZESRouter binary (BitRouter 1.0.0-alpha.27, aarch64-linux)
# Downloads from upstream GitHub releases, extracts to ~/.local/bin/bitrouter.orig,
# verifies live byte-match against the pinned sha256.
# Usage: bash fetch-binary.sh
set -euo pipefail

TAG="v1.0.0-alpha.27"
ARCH="${ZESROUTER_ARCH:-aarch64-unknown-linux-gnu}"
ASSET="bitrouter-${ARCH}.tar.xz"
URL="https://github.com/bitrouter/bitrouter/releases/download/${TAG}/${ASSET}"
PINNED_SHA256="e72611fb2adfb2be614b7357d7c11526230f28b47840ea66e8268d15717ec581"
DEST="${HOME}/.local/bin/bitrouter.orig"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Downloading ${ASSET} (${TAG})"
curl -fSL --max-time 300 -o "$TMP/${ASSET}" "$URL"

echo "==> Verifying tarball against upstream .sha256"
curl -fSL --max-time 60 -o "$TMP/${ASSET}.sha256" "${URL}.sha256"
UPSTREAM_SHA=$(awk '{print $1}' "$TMP/${ASSET}.sha256")
ACTUAL_SHA=$(sha256sum "$TMP/${ASSET}" | cut -d' ' -f1)
[ "$ACTUAL_SHA" = "$UPSTREAM_SHA" ] || { echo "FAIL: tarball sha256 mismatch vs upstream"; exit 1; }
echo "    tarball ok (${ACTUAL_SHA:0:16}...)"

echo "==> Extracting"
tar -xJf "$TMP/${ASSET}" -C "$TMP"

echo "==> Installing to ${DEST}"
find "$TMP" -type f -name 'bitrouter' -exec cp {} "$DEST" \;
chmod 700 "$DEST"

# Live byte-match verification against the pinned reference
ACTUAL=$(sha256sum "$DEST" | cut -d' ' -f1)
if [ "$ACTUAL" = "$PINNED_SHA256" ]; then
    echo "[OK] Binary verified — ${ACTUAL:0:16}... matches pinned build"
else
    echo "[FAIL] Installed binary sha256 ${ACTUAL:0:16}... != pinned ${PINNED_SHA256:0:16}..."; exit 1
fi