#!/bin/sh
# Serve the site locally.
#
# Browsers refuse to read local data files when a page is opened straight from
# Finder (a security rule about file:// URLs), so the site needs a tiny web
# server to load data/sets.json. Python is already on macOS, so there's nothing
# to install.
#
#   ./serve.sh          -> http://localhost:8000
#   ./serve.sh 9000     -> pick a different port if 8000 is busy
#
# Press Ctrl+C to stop it.

cd "$(dirname "$0")" || exit 1

PORT="${1:-8000}"

echo "Set Ranker is running at http://localhost:$PORT"
echo "Press Ctrl+C to stop."
echo

exec python3 -m http.server "$PORT"
