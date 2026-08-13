/**
 * Loads the set data and holds the current view state (search, filters, sort).
 *
 * Deliberately kept free of DOM code: this module answers "which sets should be
 * on screen, in what order", and render.js decides what that looks like.
 */

import { FIELDS, SORTS, DEFAULT_SORT } from './schema.js';
import { matches, compare } from './filters.js';

export const state = {
  q: '',
  sort: DEFAULT_SORT,
  chips: {},   // field key -> Set of selected values
  select: {},  // field key -> single selected value ('' means any)
  min: {},     // field key -> numeric floor (0 means any)
  open: '',    // id of the set whose detail view is open, so it can be linked to
};

let sets = [];

export const allSets = () => sets;

export async function load(url = 'data/sets.json') {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`The server returned ${res.status} ${res.statusText}.`);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`${url} isn't valid JSON — ${err.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`Expected ${url} to contain a list of sets, got ${typeof data}.`);
  }

  sets = data.map(normalise);
  return sets;
}

/**
 * Coerce each record into the shapes the rest of the code expects, so a stray
 * "4" string from a CSV export doesn't quietly break sorting. Unrecognised
 * columns are left untouched — the detail sheet shows them rather than dropping
 * them, which matters when a Notion board has columns this schema doesn't know.
 */
export function normalise(raw, i) {
  const set = { ...raw };

  for (const field of FIELDS) {
    const v = set[field.key];

    if (field.type === 'multiEnum' || field.type === 'tags') {
      set[field.key] = toList(v);
    } else if (field.type === 'rating' || field.type === 'scale' || field.type === 'duration') {
      const n = v === '' || v === null || v === undefined ? null : Number(v);
      set[field.key] = Number.isFinite(n) ? n : null;
    } else if (v === null || v === undefined) {
      set[field.key] = '';
    } else if (typeof v !== 'string') {
      set[field.key] = String(v);
    } else {
      set[field.key] = v.trim();
    }
  }

  if (!set.id) {
    set.id = slug(`${set.artist || ''} ${set.setName || ''}`) || `set-${i + 1}`;
  }
  return set;
}

/** Accepts a real array, or the comma-separated string a CSV export produces. */
function toList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v === null || v === undefined || String(v).trim() === '') return [];
  return String(v)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export const currentSort = () => SORTS.find((s) => s.id === state.sort) || SORTS[0];

/** The sets that pass the current filters, in the current sort order. */
export function visible() {
  const sort = currentSort();
  return sets.filter((s) => matches(s, state)).sort((a, b) => compare(a, b, sort));
}

export const findSet = (id) => sets.find((s) => s.id === id);

/** True while the sample data is still in place, so the banner can show. */
export const hasPlaceholders = () => sets.some((s) => s.placeholder === true);
