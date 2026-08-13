#!/usr/bin/env python3
"""Tests for the value parsing in import_notion_csv.py.

Run via ./tools/test.sh, or directly:  python3 tools/test_import.py

Date and number parsing is the part of the import worth testing: it guesses at
human-written values, and a wrong guess is quiet rather than loud — a date read
day-first instead of month-first still looks like a date, it just sorts wrong.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_notion_csv import normalise_header, parse_date, parse_number, slug, split_list

passed = 0
failures = []


def check(name, actual, expected):
    global passed
    if actual == expected:
        passed += 1
    else:
        failures.append("{}\n      expected: {!r}\n      actual:   {!r}".format(name, expected, actual))


# --- dates -----------------------------------------------------------------
# This board exports MM/DD/YYYY, which is ambiguous until a day above 12 shows up.

check("US slash date", parse_date("08/04/2026")[0], "2026-08-04")
check("US slash date, single digits", parse_date("8/4/2026")[0], "2026-08-04")
check("day above 12 must be the day, so read day-first",
      parse_date("22/07/2026")[0], "2026-07-22")
check("day-first with a valid month second", parse_date("13/05/2026")[0], "2026-05-13")
check("already ISO, left alone", parse_date("2026-08-04")[0], "2026-08-04")
check("year-first with slashes", parse_date("2026/08/04")[0], "2026-08-04")
check("two-digit year", parse_date("08/04/26")[0], "2026-08-04")
check("dotted date", parse_date("04.08.2026")[0], "2026-04-08")
check("empty date stays empty", parse_date(""), ("", None))
check("empty date raises no warning", parse_date("")[1], None)

unreadable, problem = parse_date("sometime in 2019")
check("unreadable date is kept verbatim", unreadable, "sometime in 2019")
check("unreadable date warns", problem is not None, True)

impossible, problem = parse_date("99/99/2026")
check("impossible date is kept verbatim", impossible, "99/99/2026")
check("impossible date warns", problem is not None, True)

# --- numbers ---------------------------------------------------------------

check("plain integer rating", parse_number("9", "rating")[0], 9)
check("decimal rating", parse_number("8.5", "rating")[0], 8.5)
check("rating written as a fraction takes the numerator",
      parse_number("9/10", "rating")[0], 9)
check("rating with a comment", parse_number("8 (great)", "rating")[0], 8)
check("empty rating is None", parse_number("", "rating"), (None, None))

unreadable, problem = parse_number("not rated", "rating")
check("unreadable number is None", unreadable, None)
check("unreadable number warns", problem is not None, True)

check("bare minutes", parse_number("90", "duration")[0], 90)
check("minutes with a unit", parse_number("75 min", "duration")[0], 75)
check("hours and minutes", parse_number("1h 30m", "duration")[0], 90)
check("colon notation", parse_number("2:00", "duration")[0], 120)
check("whole hours", parse_number("2h", "duration")[0], 120)
check("duration is a whole number", isinstance(parse_number("1h 30m", "duration")[0], int), True)

# --- headers and ids -------------------------------------------------------

check("punctuation is ignored when matching headers",
      normalise_header("Big Moments?"), "bigmoments")
check("case and spaces are ignored", normalise_header("Energy Level"), "energylevel")
check("id slug", slug("Craig Richards Fabric 95"), "craig-richards-fabric-95")
check("accents are folded to ascii, not turned into dashes",
      slug("salute | Vail Après Ski"), "salute-vail-apres-ski")
check("symbols become separators", slug("RÜFÜS DU SOL • Fred again.."), "rufus-du-sol-fred-again")

# --- lists -----------------------------------------------------------------

check("multi-select splits on commas", split_list("Morning, Afternoon"), ["Morning", "Afternoon"])
check("stray spacing is trimmed", split_list(" a ,b ,  c "), ["a", "b", "c"])
check("an empty cell is an empty list", split_list(""), [])

# --- report ----------------------------------------------------------------

if failures:
    print("\n  {} passed, {} FAILED:\n".format(passed, len(failures)))
    for f in failures:
        print("  x {}".format(f))
    print()
    sys.exit(1)

print("\n  All {} import tests passed.\n".format(passed))
