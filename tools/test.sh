#!/bin/sh
# Run the logic tests, then check the data file.
#
# Uses the JavaScript engine that ships inside macOS, so there is nothing to
# install and no test dependencies to age. If Apple ever moves that binary this
# script will say so and the site itself is unaffected — the tests are a
# convenience, not part of what gets published.

cd "$(dirname "$0")/.." || exit 1

JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"

status=0

if [ -x "$JSC" ]; then
  echo "Logic tests"
  "$JSC" -m tools/test_logic.js || status=1
else
  echo "Skipping logic tests: no JavaScript engine found at"
  echo "  $JSC"
  echo "(If you have Node installed, 'node tools/test_logic.js' also works.)"
fi

echo "Import tests"
python3 tools/test_import.py || status=1

echo "Data check"
python3 tools/validate_data.py || status=1

exit "$status"
