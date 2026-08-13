# Set Ranker

A public, browsable catalogue of DJ sets — filterable by energy, time of day and
status, sortable however you like, with your descriptions and big-moment notes on
each set.

It has **no dependencies and no build step**. It's HTML, CSS and JavaScript that
browsers run directly. Nothing to install, nothing to update, nothing that can
break while you aren't looking. That's the main design decision in the project.

---

## Running it

```sh
./serve.sh
```

Then open <http://localhost:8000>. Ctrl+C stops it. Use `./serve.sh 9000` if port
8000 is taken.

**Why a command instead of just double-clicking `index.html`?** Because your set
data lives in a separate file (`data/sets.json`), and browsers block pages opened
from Finder from reading local data files. The one-line server gets around that,
and it's also exactly how the site behaves once it's published.

---

## Your columns

These mirror the Notion "Sets Tracker" board, as imported on 13 Aug 2026.

| On the site | From Notion | Type | How you can use it |
|---|---|---|---|
| Set | `Set name` | text | search, sort A–Z |
| Artist | `Artist` | text | search, sort, dropdown filter |
| Rating | `Rating` | 0–10 | the big number; sort, minimum-rating slider |
| Energy | `Energy Level` | 1–10 | segmented meter; sort, filter by level |
| Time of day | `Time of Day` | list | chip filter, ordered through the day |
| Status | `Status` | one value | chip filter (`Listened` / `Sampled`) |
| Description | `Description` | paragraph | search; shown in the detail view |
| Big moments | `Big Moments?` | paragraph | search; shown in the detail view |
| Referred by | `Referred By` | text | dropdown filter — currently empty on every set, so no filter appears until you fill some in |
| Listen date | `Listen Date` | date | sort newest/oldest |
| Listen | `Link` | url | the Listen button |

Both `Rating` and `Energy Level` are treated as 1–10 scales, which is what your
data uses. If you ever switch to 1–5, change `max` on those fields in
`js/schema.js` and nothing else needs touching.

---

## Adding a set — the normal routine

**Notion is where your sets live.** Add and rank them there, exactly as you did
before this site existed. When you want the site to catch up:

1. In Notion, open the Sets Tracker board → `···` menu → Export → **Markdown & CSV**.
2. Run one command:

```sh
./refresh.sh
```

That finds the newest export in your Downloads folder, unpacks it, replaces the
site's data, and checks it for problems. Refresh the browser and you're done.

It picks the export automatically, so you don't have to find or unzip anything. If
you'd rather point it at a specific file, `./refresh.sh path/to/export.zip` works
too.

**The site does not update itself.** It shows whatever your last `./refresh.sh`
captured. Add a set in Notion and the site won't know until you run it again. That
is the tradeoff for having no server to maintain.

### Don't edit data/sets.json by hand

`data/sets.json` is a *copy* of your Notion board, not a second place to keep your
rankings. `./refresh.sh` overwrites it completely — so a set you typed in there
directly disappears the next time you refresh from Notion, quietly.

Pick one place. Right now that place is Notion.

(If you ever want to switch — abandon Notion and edit the file directly — that
works fine, you just stop running `./refresh.sh` from then on. Don't do both.)

---

## The data format

You shouldn't need this while Notion is your source, but it's here for when
something looks wrong. Each set in `data/sets.json` looks like this:

```json
{
  "id": "mph-live-in-tokyo",
  "setName": "MPH - Live in Tokyo, Japan | UKF On Air",
  "artist": "MPH",
  "rating": 9,
  "energy": 9,
  "timeOfDay": ["Afternoon"],
  "status": "Listened",
  "description": "",
  "bestMoments": "Beat at 30:00",
  "referredBy": "",
  "date": "2026-08-03",
  "url": "https://www.youtube.com/watch?v=KEszhQvHH-s"
}
```

Rules worth knowing:

- `id` must be unique — it's what the detail view opens by.
- `rating` and `energy` are numbers 1–10, not strings: `9` not `"9"`.
- `timeOfDay` is a list even with one entry: `["Afternoon"]`.
- `date` must be `YYYY-MM-DD` to sort correctly (note: **not** the `08/03/2026`
  format Notion exports — the importer converts it for you).
- Leave anything out and the site just omits it. Only `setName` and `id` are
  needed. One of your sets has no rating, energy or time of day and displays fine.

To check the file at any time:

```sh
python3 tools/validate_data.py
```

That catches misspelled fields, duplicate ids, out-of-range numbers, and ratings
accidentally typed as text. `./refresh.sh` runs it for you after every import.

---

## Tests

```sh
./tools/test.sh
```

Runs 56 checks on the filtering and sorting logic, 35 on the import parsing, then
validates your data file. Worth running after you edit `js/schema.js` — if you
rename a field, the tests will tell you.

The logic tests use the JavaScript engine built into macOS, so there's nothing to
install. They're a convenience for you, not part of what gets published.

---

## When an import goes wrong

`./refresh.sh` is a wrapper around `tools/import_notion_csv.py`. To see what an
import *would* do without writing anything:

```sh
python3 tools/import_notion_csv.py "path/to/export_all.csv" --dry-run
```

That reports which Notion columns it matched, which it didn't recognise, and any
values it couldn't read.

**If you add a column in Notion**, the importer keeps it — it just appears in a
set's detail view rather than as a filter, and the dry run lists it as
unrecognised. To promote it to a real filter or sort, add it to `FIELDS` in
`js/schema.js` and to `ALIASES` in the import script.

**If an import produces something wrong**, your previous data is in
`data/sets.json.bak`. Copy it back:

```sh
cp data/sets.json.bak data/sets.json
```

That backup is only one deep — it holds the state from just before the most recent
import, and the next import replaces it.

---

## Changing the categories

`js/schema.js` is the one file that defines your columns. Every filter, sort
option, card row and detail row is generated from the list in it — so adding a
category is one edit there, not a change across five files.

Each field declares a `type`, which decides how it looks and how it filters:

| type | looks like | filters as |
|---|---|---|
| `rating` | the big number on the card | minimum-value slider |
| `scale` | segmented meter (energy) | one chip per level |
| `enum` | dashed chip (status) | multi-select chips |
| `multiEnum` | outlined chips (time of day) | multi-select chips |
| `tags` | filled chips | multi-select chips |
| `text` | plain line | dropdown, or search only |
| `longText` | paragraphs in the detail view | search only |
| `url` | the Listen button | — |
| `date`, `duration` | formatted metadata | sort only |

`tags` and `duration` aren't used by any of your current fields, but they work if
you add a genre or set-length column later.

A filter only appears when a field has at least two different values in the data —
otherwise it couldn't narrow anything down.

---

## Publishing it

Not published yet — this is running locally only, and nothing has been committed.

When you're ready, remembering that **everything in `sets.json` becomes
world-readable**, including your descriptions:

```sh
git add -A && git commit -m "Set Ranker"
gh repo create set-ranker --public --source=. --push
```

Then in the repo's Settings → Pages, set the source to the `main` branch, root
folder. The site appears at `https://finn-fielding.github.io/set-ranker/` within a
minute or two. Every later change is `git add`, `git commit`, `git push`.

Because there's no build step, what you see locally is exactly what gets served.

---

## What's where

```
index.html                    page structure
css/style.css                 all styling, light and dark themes
js/schema.js                  ← your column definitions; start here
js/store.js                   loads the data, holds filter/sort state
js/filters.js                 filter logic, sort logic, builds the filter rail
js/render.js                  cards, detail view, chips
js/main.js                    wiring, and keeping filters in the URL
data/sets.json                your sets
tools/import_notion_csv.py    Notion CSV -> sets.json
tools/validate_data.py        checks sets.json for mistakes
tools/schema_reader.py        lets the Python tools read schema.js
tools/test_logic.js           tests for filtering and sorting
tools/test_import.py          tests for the import parsing
tools/test.sh                 runs all of the above
refresh.sh                    pull the latest Notion export into the site
serve.sh                      local server
```

Day to day you only need two of these: `./serve.sh` to look at the site, and
`./refresh.sh` to update it from Notion.

One nicety: the filters are stored in the URL, so a filtered view is a link you
can send someone or bookmark.
