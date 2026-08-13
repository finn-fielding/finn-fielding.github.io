#!/usr/bin/env python3
"""Check data/sets.json against the field definitions in js/schema.js.

Run this after editing sets.json by hand, or after an import. It catches the
mistakes that are easy to make and annoying to spot in a browser: a misspelled
column name, a rating typed as "9.5" instead of 9.5, a duplicated id, an energy
level of 7 on a 1-5 scale.

    python3 tools/validate_data.py

Exits 0 if the data is usable, 1 if something will actually break the site.
Warnings on their own don't fail the run.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schema_reader import DATA_PATH, LIST_TYPES, NUMBER_TYPES, field_map, load_fields

errors = []
warnings = []


def error(message):
    errors.append(message)


def warn(message):
    warnings.append(message)


def main():
    fields = load_fields()
    fmap = field_map(fields)
    known = set(fmap) | {"id", "placeholder"}

    if not DATA_PATH.exists():
        raise SystemExit("No data file at {}".format(DATA_PATH))

    try:
        data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(
            "{} isn't valid JSON.\n  {}\n  Line {}, column {}. A stray comma after the "
            "last item in a list is the usual cause.".format(
                DATA_PATH.name, exc.msg, exc.lineno, exc.colno
            )
        )

    if not isinstance(data, list):
        raise SystemExit("Expected a list of sets, found {}.".format(type(data).__name__))
    if not data:
        raise SystemExit("{} is an empty list — no sets to show.".format(DATA_PATH.name))

    seen_ids = {}
    unknown_keys = {}

    for index, record in enumerate(data, start=1):
        where = "set {}".format(index)
        if not isinstance(record, dict):
            error("{}: expected an object, found {}".format(where, type(record).__name__))
            continue

        name = record.get("setName")
        if isinstance(name, str) and name.strip():
            where = "{!r}".format(name.strip())
        else:
            error("{}: setName is missing or empty".format(where))

        identifier = record.get("id")
        if not isinstance(identifier, str) or not identifier.strip():
            error("{}: id is missing — the detail view needs it to open".format(where))
        elif identifier in seen_ids:
            error("{}: duplicate id {!r}, also used by set {}".format(where, identifier, seen_ids[identifier]))
        else:
            seen_ids[identifier] = index

        for key, value in record.items():
            if key not in known:
                unknown_keys.setdefault(key, []).append(where)
                continue

            field = fmap.get(key)
            if field is None:
                continue
            kind = field["type"]

            if value is None or value == "" or value == []:
                continue  # empty is always allowed; the site just omits it

            if kind in NUMBER_TYPES:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    error("{}: {} should be a number, found {!r}".format(where, key, value))
                    continue
                top = field.get("max")
                if kind == "rating" and top and not (0 <= value <= top):
                    error("{}: {} is {}, outside 0-{}".format(where, key, value, int(top)))
                if kind == "scale" and top and not (1 <= value <= top):
                    error("{}: {} is {}, outside 1-{}".format(where, key, value, int(top)))
                if kind == "duration" and value <= 0:
                    warn("{}: {} is {} — expected minutes".format(where, key, value))

            elif kind in LIST_TYPES:
                if not isinstance(value, list):
                    error(
                        "{}: {} should be a list like [\"a\", \"b\"], found {!r}".format(where, key, value)
                    )
                elif any(not isinstance(item, str) for item in value):
                    error("{}: every entry in {} should be text".format(where, key))

            elif kind == "url":
                if not isinstance(value, str):
                    error("{}: {} should be text".format(where, key))
                elif not value.startswith(("http://", "https://")):
                    error("{}: {} doesn't start with http:// or https://".format(where, key))

            elif kind == "date":
                text = str(value)
                parts = text.split("-")
                if not (len(parts) == 3 and all(p.isdigit() for p in parts) and len(parts[0]) == 4):
                    warn("{}: date {!r} isn't YYYY-MM-DD, so it won't sort correctly".format(where, text))

            elif not isinstance(value, str):
                warn("{}: {} is {!r}, expected text".format(where, key, value))

        if record.get("rating") in (None, ""):
            warn("{}: no rating, so it sorts to the end of the default view".format(where))

    for key, places in unknown_keys.items():
        warn(
            "{!r} isn't in FIELDS (on {} set{}) — it shows in the detail view but can't be "
            "filtered or sorted".format(key, len(places), "" if len(places) == 1 else "s")
        )

    placeholders = sum(1 for r in data if isinstance(r, dict) and r.get("placeholder"))
    if placeholders:
        warn("{} of {} sets are still sample data".format(placeholders, len(data)))

    # --- report -----------------------------------------------------------
    print("Checked {} sets in {}".format(len(data), DATA_PATH.name))

    if warnings:
        print("\n{} warning{}:".format(len(warnings), "" if len(warnings) == 1 else "s"))
        for message in warnings:
            print("  - {}".format(message))

    if errors:
        print("\n{} error{}:".format(len(errors), "" if len(errors) == 1 else "s"))
        for message in errors:
            print("  x {}".format(message))
        print("\nFix these — the site will misbehave otherwise.")
        return 1

    print("\nNo errors." if warnings else "\nAll good.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
