#!/bin/sh
# Pull the latest Notion export into the site.
#
#   ./refresh.sh                     find the newest export in ~/Downloads or ~/Desktop
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

# Both are searched, newest first, because exports land in either depending on
# where the browser was last told to put them.
DOWNLOADS="$HOME/Downloads"
DESKTOP="$HOME/Desktop"
INPUT="$1"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# --- find an export -------------------------------------------------------

# Newest zip, across both folders, whose contents match $1.
find_export() {
  ls -t "$DOWNLOADS"/*.zip "$DESKTOP"/*.zip 2>/dev/null | while read -r candidate; do
    if unzip -l "$candidate" 2>/dev/null | grep -qE "$1"; then
      echo "$candidate"
      break
    fi
  done
}

if [ -z "$INPUT" ]; then
  # Prefer something that is provably a Sets Tracker export. Matching any zip
  # that merely contains a CSV is too loose — there are unrelated CSV exports
  # floating around, and picking one would overwrite the set data with nonsense.
  INPUT=$(find_export 'Sets Tracker|ExportBlock')
  CERTAIN=yes

  if [ -z "$INPUT" ]; then
    INPUT=$(find_export '\.csv')
    CERTAIN=no
  fi

  if [ -z "$INPUT" ]; then
    echo "Couldn't find a Notion export in $DOWNLOADS or $DESKTOP"
    echo
    echo "In Notion: open the Sets Tracker board, then the ... menu at the top"
    echo "right, Export, and choose 'Markdown & CSV'. Then run this again."
    exit 1
  fi

  echo "Using: $INPUT"
  if [ "$CERTAIN" = no ]; then
    echo
    echo "WARNING: that zip contains a CSV but doesn't look like a Notion export"
    echo "of the Sets Tracker board. Check the row count and column names in the"
    echo "report below before trusting it. Your previous data is backed up to"
    echo "data/sets.json.bak either way."
  fi
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

# The link-preview image quotes the number of sets, so keep it in step.
echo
python3 tools/make_og_image.py || echo "(carrying on — the preview image is optional)"

echo
echo "Done. Refresh the browser to see it."
echo "(If the site isn't running: ./serve.sh)"
echo
echo "To publish:  git add -A && git commit -m 'Update sets' && git push"
