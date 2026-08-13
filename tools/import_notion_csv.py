#!/usr/bin/env python3
"""Convert a Notion CSV export into data/sets.json.

Usage
-----
    python3 tools/import_notion_csv.py "~/Downloads/DJ Sets abc123.csv"
    python3 tools/import_notion_csv.py export.csv --dry-run     # preview, write nothing

What it does
------------
Notion's column names are yours, not this project's, so the script matches them
loosely: case, spaces and punctuation are ignored, and a handful of common
synonyms are recognised (see ALIASES). Anything it can't match is *kept anyway*
under its original column name and reported at the end — a column you forgot to
map is far less annoying than a column silently deleted.

Nothing is overwritten without a backup: an existing data/sets.json is copied to
data/sets.json.bak first.
"""

import argparse
import csv
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schema_reader import DATA_PATH, LIST_TYPES, NUMBER_TYPES, field_map, load_fields

# Normalised Notion header -> schema key. Add your own spellings here.
ALIASES = {
    "set": "setName", "setname": "setName", "name": "setName", "title": "setName",
    "artist": "artist", "dj": "artist", "artists": "artist",
    "energy": "energy", "energylevel": "energy", "energylevelranking": "energy",
    "energyranking": "energy", "energyrating": "energy",
    "timeofday": "timeOfDay", "timeofdayforlistening": "timeOfDay",
    "listeningtime": "timeOfDay", "time": "timeOfDay",
    "overall": "rating", "overallranking": "rating", "overallrating": "rating",
    "rating": "rating", "ranking": "rating", "score": "rating",
    "bestmoments": "bestMoments", "bestmoment": "bestMoments",
    "bigmoments": "bestMoments", "bigmoment": "bestMoments",
    "highlights": "bestMoments", "highlight": "bestMoments",
    "date": "date", "played": "date", "listendate": "date", "datelistened": "date",
    "status": "status", "state": "status",
    "description": "description", "notes": "description", "note": "description",
    "comments": "description", "comment": "description",
    "referredby": "referredBy", "recommendedby": "referredBy", "via": "referredBy",
    "url": "url", "link": "url", "listen": "url", "listenlink": "url",
    "tags": "tags", "tag": "tags", "genre": "tags", "genres": "tags", "style": "tags",
    "duration": "durationMin", "durationmin": "durationMin", "length": "durationMin",
    "event": "event", "festival": "event", "venue": "event", "club": "event",
    "platform": "platform", "source": "platform",
}
# The last four rows above map columns the current schema doesn't define. They are
# kept so that if you add such a column in Notion, the importer files it under a
# tidy key — but until you also add it to FIELDS in js/schema.js it will only
# appear in a set's detail view, not as a filter.


def normalise_header(header):
    return re.sub(r"[^a-z0-9]", "", header.lower())


def slug(text):
    """A short ascii identifier. Accents are folded rather than replaced with
    dashes, so "Vail Après Ski" gives "vail-apres-ski" not "vail-apr-s-ski"."""
    folded = unicodedata.normalize("NFKD", str(text))
    ascii_only = "".join(c for c in folded if not unicodedata.combining(c))
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()))[:60]


def parse_number(raw, kind):
    """Pull a number out of the many ways a person writes one in a Notion cell."""
    text = str(raw).strip()
    if not text:
        return None, None

    if kind == "duration":
        # "1h 30m" / "1:30" / "90 min" / "90"
        hm = re.match(r"^\s*(\d+)\s*[h:]\s*(\d+)", text)
        if hm:
            return int(hm.group(1)) * 60 + int(hm.group(2)), None
        hours = re.match(r"^\s*(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*$", text, re.I)
        if hours:
            return int(round(float(hours.group(1)) * 60)), None

    # "9.5", "9.5/10", "8 (great)", "★★★★" -> first number found
    found = re.search(r"-?\d+(?:\.\d+)?", text)
    if not found:
        return None, "couldn't read a number from {!r}".format(text)
    value = float(found.group(0))
    if kind == "duration":
        value = int(round(value))
    elif value == int(value):
        value = int(value)
    return value, None


def parse_date(raw):
    """Normalise a date to YYYY-MM-DD so it sorts correctly.

    Notion exports dates in the format of whatever locale the workspace uses, so
    this accepts the common ones. Slash dates are read month-first (US style,
    which is what this board exports) unless the first number is above 12, in
    which case it can only be a day.
    """
    text = str(raw).strip()
    if not text:
        return "", None

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text, None

    slash = re.fullmatch(r"\s*(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})\s*", text)
    if slash:
        a, b, c = (int(slash.group(i)) for i in (1, 2, 3))
        if len(slash.group(1)) == 4:            # 2026/08/04
            year, month, day = a, b, c
        else:
            year = c + 2000 if c < 100 else c
            month, day = (b, a) if a > 12 else (a, b)
        if 1 <= month <= 12 and 1 <= day <= 31:
            return "{:04d}-{:02d}-{:02d}".format(year, month, day), None

    return text, "couldn't read a date from {!r} — left as-is, so it won't sort".format(text)


def split_list(raw):
    """Notion exports multi-selects as a comma-separated string."""
    return [part.strip() for part in str(raw).split(",") if part.strip()]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path", help="the CSV file Notion exported")
    ap.add_argument("-o", "--out", default=str(DATA_PATH), help="where to write the JSON")
    ap.add_argument("--dry-run", action="store_true", help="report what would happen, write nothing")
    args = ap.parse_args()

    csv_path = Path(args.csv_path).expanduser()
    if not csv_path.exists():
        raise SystemExit("No such file: {}".format(csv_path))

    fields = load_fields()
    fmap = field_map(fields)
    schema_keys = [f["key"] for f in fields]

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))

    if not rows:
        raise SystemExit("{} has no data rows.".format(csv_path))

    headers = [h for h in (rows[0].keys()) if h is not None]
    mapping, unmapped = {}, []
    for header in headers:
        key = ALIASES.get(normalise_header(header))
        if key is None and normalise_header(header) in {normalise_header(k) for k in schema_keys}:
            key = next(k for k in schema_keys if normalise_header(k) == normalise_header(header))
        if key:
            mapping[header] = key
        else:
            unmapped.append(header)

    sets, warnings, seen_ids = [], [], {}

    for index, row in enumerate(rows, start=1):
        record = {}

        for header, value in row.items():
            if header is None:
                continue
            key = mapping.get(header, header)
            field = fmap.get(key)
            text = "" if value is None else str(value).strip()

            if field and field["type"] in LIST_TYPES:
                record[key] = split_list(text)
            elif field and field["type"] in NUMBER_TYPES:
                number, problem = parse_number(text, field["type"])
                record[key] = number
                if problem:
                    warnings.append("row {} ({}): {}".format(index, key, problem))
            elif field and field["type"] == "date":
                iso, problem = parse_date(text)
                record[key] = iso
                if problem:
                    warnings.append("row {} ({}): {}".format(index, key, problem))
            else:
                record[key] = text

        title = record.get("setName") or ""
        if not title:
            warnings.append("row {}: no set name — check the CSV's first column".format(index))

        base = slug("{} {}".format(record.get("artist", ""), title)) or "set-{}".format(index)
        identifier = base
        if base in seen_ids:
            seen_ids[base] += 1
            identifier = "{}-{}".format(base, seen_ids[base])
            warnings.append("row {}: duplicate name, id became {!r}".format(index, identifier))
        else:
            seen_ids[base] = 1
        record["id"] = identifier

        # Keep schema fields in schema order, then any extra columns.
        ordered = {"id": identifier}
        for key in schema_keys:
            if key in record:
                ordered[key] = record[key]
        for key, value in record.items():
            if key not in ordered:
                ordered[key] = value
        sets.append(ordered)

    # --- report -----------------------------------------------------------
    print("Read {} rows from {}".format(len(sets), csv_path.name))
    print("\nColumns matched:")
    for header, key in mapping.items():
        marker = "" if normalise_header(header) == normalise_header(key) else "  <- {!r}".format(header)
        print("  {}{}".format(key, marker))

    if unmapped:
        print("\nColumns kept but not recognised ({}):".format(len(unmapped)))
        for header in unmapped:
            print("  {!r}".format(header))
        print("  These still appear in the set's detail view. To give one a proper")
        print("  filter or sort, add it to FIELDS in js/schema.js and to ALIASES here.")

    missing = [k for k in ("setName", "artist", "rating", "energy") if k not in mapping.values()]
    if missing:
        print("\nNo column matched: {}".format(", ".join(missing)))
        print("  The site works without them, but those cards will look thin.")

    if warnings:
        print("\n{} warning(s):".format(len(warnings)))
        for warning in warnings[:25]:
            print("  {}".format(warning))
        if len(warnings) > 25:
            print("  ... and {} more".format(len(warnings) - 25))

    if args.dry_run:
        print("\nDry run — nothing written.")
        return

    out_path = Path(args.out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        backup = out_path.with_suffix(out_path.suffix + ".bak")
        shutil.copy2(out_path, backup)
        print("\nBacked up existing data to {}".format(backup.name))

    out_path.write_text(json.dumps(sets, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Wrote {} sets to {}".format(len(sets), out_path))
    print("\nNext: python3 tools/validate_data.py")


if __name__ == "__main__":
    main()
