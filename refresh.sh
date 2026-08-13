#!/bin/sh
# Pull the latest Notion export into the site.
#
#   ./refresh.sh                     find the newest export in ~/Downloads
#   ./refresh.sh path/to/export.zip  use a specific zip
#   ./refresh.sh path/to/sets.csv    use a specific CSV
#
# Notion wraps its export in a zip containing another zip, and puts two CSVs
# inside that. This finds its way through all of it and picks the "_all" CSV,
# which contains every row rather than just whatever your current Notion view
# happens to be showing.
#
# Your previous data is backed up to data/sets.json.bak before anything is
# written, so a bad import is always recoverable.

set -e
cd "$(dirname "$0")"

DOWNLOADS="$HOME/Downloads"
INPUT="$1"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# --- find an export -------------------------------------------------------

if [ -z "$INPUT" ]; then
  INPUT=$(ls -t "$DOWNLOADS"/*.zip 2>/dev/null | while read -r candidate; do
    if unzip -l "$candidate" 2>/dev/null | grep -qE 'ExportBlock|\.csv'; then
      echo "$candidate"
      break
    fi
  done)

  if [ -z "$INPUT" ]; then
    echo "Couldn't find a Notion export in $DOWNLOADS"
    echo
    echo "In Notion: open the Sets Tracker board, then the ... menu at the top"
    echo "right, Export, and choose 'Markdown & CSV'. Then run this again."
    exit 1
  fi
  echo "Using the newest export found: $(basename "$INPUT")"
fi

if [ ! -f "$INPUT" ]; then
  echo "No such file: $INPUT"
  exit 1
fi

# --- unwrap it ------------------------------------------------------------

case "$INPUT" in
  *.csv)
    csv="$INPUT"
    ;;
  *.zip)
    unzip -q "$INPUT" -d "$work"
    # Notion nests a second zip inside the first.
    for inner in "$work"/*.zip; do
      [ -f "$inner" ] || continue
      unzip -q "$inner" -d "$work"
      rm -f "$inner"
    done
    # Prefer the "_all" CSV: every row, not just the current view.
    csv=$(find "$work" -name '*_all.csv' | head -1)
    if [ -z "$csv" ]; then
      csv=$(find "$work" -name '*.csv' | head -1)
    fi
    if [ -z "$csv" ]; then
      echo "That zip doesn't contain a CSV. Was it exported as 'Markdown & CSV'?"
      exit 1
    fi
    ;;
  *)
    echo "Expected a .zip or a .csv, got: $INPUT"
    exit 1
    ;;
esac

# --- import and check -----------------------------------------------------

echo
python3 tools/import_notion_csv.py "$csv"

echo
python3 tools/validate_data.py

echo
echo "Done. Refresh the browser to see it."
echo "(If the site isn't running: ./serve.sh)"
