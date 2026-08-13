"""Read the field definitions out of js/schema.js.

The website and these scripts have to agree on what the columns are, and the
worst way to arrange that is to write the list down twice. So schema.js stays the
single source of truth and this module parses it, rather than keeping a second
copy in Python that can drift out of step.

It is a small deliberate parser for the exact shape schema.js is written in — not
a general JavaScript parser. If you reformat the FIELDS array heavily, run
validate_data.py to confirm this still reads it (it will tell you if it finds no
fields).
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = PROJECT_ROOT / "js" / "schema.js"
DATA_PATH = PROJECT_ROOT / "data" / "sets.json"

_FIELDS_BLOCK = re.compile(r"export const FIELDS\s*=\s*\[(.*?)\n\];", re.S)
_ENTRY = re.compile(r"\{([^{}]*)\}")
_PROP = re.compile(r"(\w+)\s*:\s*('([^']*)'|true|false|\d+(?:\.\d+)?)")


def load_fields(schema_path=SCHEMA_PATH):
    """Return the FIELDS array as a list of dicts."""
    text = Path(schema_path).read_text(encoding="utf-8")
    block = _FIELDS_BLOCK.search(text)
    if not block:
        raise SystemExit(
            "Couldn't find the FIELDS array in {}.\n"
            "It should look like: export const FIELDS = [ ... ];".format(schema_path)
        )

    fields = []
    for entry in _ENTRY.finditer(block.group(1)):
        props = {}
        for match in _PROP.finditer(entry.group(1)):
            name, raw, quoted = match.group(1), match.group(2), match.group(3)
            if quoted is not None:
                props[name] = quoted
            elif raw == "true":
                props[name] = True
            elif raw == "false":
                props[name] = False
            else:
                props[name] = float(raw) if "." in raw else int(raw)
        if "key" in props:
            fields.append(props)

    if not fields:
        raise SystemExit(
            "Found the FIELDS array in {} but couldn't read any fields from it.".format(schema_path)
        )
    return fields


def field_map(fields=None):
    """Fields keyed by their `key`, for quick lookup."""
    return {f["key"]: f for f in (fields or load_fields())}


LIST_TYPES = {"multiEnum", "tags"}
NUMBER_TYPES = {"rating", "scale", "duration"}
