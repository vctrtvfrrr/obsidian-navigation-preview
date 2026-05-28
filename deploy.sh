#!/usr/bin/env bash
# deploy.sh — Build and deploy the plugin to the Obsidian vault.
# Usage: ./deploy.sh [vault_path]

set -euo pipefail

VAULT="/mnt/d/Obsidian"
PLUGIN_ID="obsidian-navigation-preview"
DEST="$VAULT/.obsidian/plugins/$PLUGIN_ID"

echo "▶  Building..."
npm run build

echo "▶  Deploying to $DEST"
mkdir -p "$DEST"
cp main.js manifest.json styles.css "$DEST/"

echo "✅  Done. Reload the plugin in Obsidian (disable → enable)."
