/**
 * FIELD DEFINITIONS
 * =================
 * This is the one file to edit when your data changes.
 *
 * Every filter control, sort option, card layout and detail row on the site is
 * generated from the list below. Nothing else in the code knows your column
 * names. So if a column in your Notion board is renamed, added or removed, you
 * change it here and the whole site follows.
 *
 * These fields mirror the "Sets Tracker" board as exported on 13 Aug 2026.
 * The Notion column each one came from is noted where the name differs.
 *
 * Each field takes:
 *   key         the property name inside data/sets.json
 *   label       what the reader sees
 *   type        how it is displayed and filtered (see the table below)
 *   searchable  include this field's text in the search box
 *   sortable    offer this field in the sort dropdown
 *   filter      which filter control to build: 'chips' | 'select' | 'min' | none
 *   card        show this on the card face (everything shows in the detail view)
 *   max         the top of the scale, for 'rating' and 'scale'
 *
 * Types:
 *   title      the set name — the card heading
 *   text       short free text (artist)
 *   longText   paragraph text (description, big moments) — detail view only
 *   rating     a 0-10 score, shown as the big number, filtered by minimum
 *   scale      a 1-10 level, shown as a segmented meter, filtered by exact level
 *   enum       one value from a small fixed set (status)
 *   multiEnum  a list of values from a small fixed set (time of day)
 *   tags       an open-ended list of labels
 *   date       an ISO date (YYYY-MM-DD)
 *   duration   a whole number of minutes
 *   url        a link — becomes the "Listen" button
 *
 * To add a category you keep in Notion but haven't listed here: add a line
 * below, then add the Notion column name to ALIASES in
 * tools/import_notion_csv.py so the importer knows where to put it.
 */

export const FIELDS = [
  { key: 'setName',     label: 'Set',          type: 'title',     searchable: true, sortable: true,  card: true },
  { key: 'artist',      label: 'Artist',       type: 'text',      searchable: true, sortable: true,  card: true,  filter: 'select' },
  { key: 'rating',      label: 'Rating',       type: 'rating',    sortable: true,   card: true,      filter: 'min', max: 10 },
  { key: 'energy',      label: 'Energy',       type: 'scale',     sortable: true,   card: true,      filter: 'chips', max: 10 },
  { key: 'timeOfDay',   label: 'Time of day',  type: 'multiEnum', searchable: true, card: true,      filter: 'chips' },
  { key: 'status',      label: 'Status',       type: 'enum',      searchable: true, card: true,      filter: 'chips' },
  { key: 'description', label: 'Description',  type: 'longText',  searchable: true },
  { key: 'bestMoments', label: 'Big moments',  type: 'longText',  searchable: true },
  { key: 'referredBy',  label: 'Referred by',  type: 'text',      searchable: true, filter: 'select' },
  { key: 'date',        label: 'Listen date',  type: 'date',      sortable: true },
  { key: 'url',         label: 'Listen',       type: 'url' },
];

/**
 * Time of day is an ordered run through the day rather than an unordered set of
 * categories, so the chips follow this order instead of appearing alphabetically
 * or by frequency. "Anytime" leads because it's the least restrictive.
 *
 * Any value in your data that isn't listed here still works — it just sorts to
 * the end. Add new ones in the position they belong.
 */
export const TIME_OF_DAY_ORDER = [
  'Anytime',
  'Sunrise',
  'Morning',
  'Afternoon',
  'Sunset',
  'Evening',
  'Peak time',
  'Late night',
  'After hours',
];

/**
 * A small glyph per time of day, so the chips are told apart by shape and text
 * rather than by colour.
 */
export const TIME_OF_DAY_GLYPH = {
  'Anytime': '◍',
  'Sunrise': '◓',
  'Morning': '○',
  'Afternoon': '●',
  'Sunset': '◒',
  'Evening': '◑',
  'Peak time': '◆',
  'Late night': '◐',
  'After hours': '◌',
};

/**
 * Which colour band each time of day belongs to: amber for daytime listening,
 * violet for night. Move a period between bands by editing this — no CSS needed.
 *
 * Why two bands and not a colour per period: nine distinct hues was measured and
 * failed. Several pairs came out so close that nobody could tell them apart —
 * not a colour-blindness edge case, just too many hues competing in one space.
 * Two well-separated bands are what the measurements allow, and the chip still
 * prints its exact period, so nothing is lost.
 *
 * Anything not listed here — including 'Anytime', deliberately — renders neutral.
 */
export const TIME_OF_DAY_BAND = {
  'Sunrise': 'day',
  'Morning': 'day',
  'Afternoon': 'day',
  'Sunset': 'night',
  'Evening': 'night',
  'Peak time': 'night',
  'Late night': 'night',
  'After hours': 'night',
};

/** '' for values with no band, which the CSS treats as neutral. */
export const bandOf = (value) => TIME_OF_DAY_BAND[value] ?? '';

/** Sort options. Each names a sortable field above and a direction. */
export const SORTS = [
  { id: 'rating-desc',  label: 'Highest rated',   key: 'rating',   dir: -1 },
  { id: 'rating-asc',   label: 'Lowest rated',    key: 'rating',   dir: 1  },
  { id: 'energy-desc',  label: 'Most energetic',  key: 'energy',   dir: -1 },
  { id: 'energy-asc',   label: 'Least energetic', key: 'energy',   dir: 1  },
  { id: 'date-desc',    label: 'Listened newest', key: 'date',     dir: -1 },
  { id: 'date-asc',     label: 'Listened oldest', key: 'date',     dir: 1  },
  { id: 'artist-asc',   label: 'Artist A–Z',      key: 'artist',   dir: 1  },
  { id: 'setName-asc',  label: 'Set name A–Z',    key: 'setName',  dir: 1  },
];

export const DEFAULT_SORT = 'rating-desc';

// ---------------------------------------------------------------------------
// Helpers — derived views over FIELDS, so nothing else has to filter the list.
// ---------------------------------------------------------------------------

export const fieldByKey = (key) => FIELDS.find((f) => f.key === key);

export const searchableFields = () => FIELDS.filter((f) => f.searchable);

export const filterableFields = () => FIELDS.filter((f) => f.filter);

export const cardFields = () => FIELDS.filter((f) => f.card);

/** Keys the code handles explicitly; anything else in the data becomes a plain detail row. */
export const knownKeys = () => new Set(FIELDS.map((f) => f.key));
