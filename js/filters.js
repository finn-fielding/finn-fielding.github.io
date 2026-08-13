/**
 * Filtering, sorting, and the filter controls themselves.
 *
 * Everything here is driven by the field list in schema.js — no column name is
 * hardcoded. Add a field there with `filter: 'chips'` and a chip group appears.
 *
 * Filter semantics: values selected *within* one field are OR'd (a set matching
 * any of them passes), and separate fields are AND'd (a set must satisfy all of
 * them). That's the behaviour people expect from faceted search.
 */

import {
  filterableFields,
  fieldByKey,
  searchableFields,
  TIME_OF_DAY_ORDER,
  TIME_OF_DAY_GLYPH,
} from './schema.js';

const NUMERIC_TYPES = new Set(['rating', 'scale', 'duration']);

/** Normalise any field value to a list of strings, for chip matching. */
export function valueList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v === null || v === undefined || v === '') return [];
  return [String(v).trim()];
}

/** Flatten any field value to plain text, for the search index. */
function textOf(v) {
  if (Array.isArray(v)) return v.join(' ');
  if (v === null || v === undefined) return '';
  return String(v);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export function matches(set, state) {
  // Search: every whitespace-separated term must appear somewhere searchable.
  if (state.q) {
    const hay = searchableFields()
      .map((f) => textOf(set[f.key]))
      .join('  ')
      .toLowerCase();
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every((t) => hay.includes(t))) return false;
  }

  for (const [key, chosen] of Object.entries(state.chips)) {
    if (!chosen || chosen.size === 0) continue;
    const vals = valueList(set[key]);
    if (!vals.some((v) => chosen.has(v))) return false;
  }

  for (const [key, want] of Object.entries(state.select)) {
    if (!want) continue;
    if (String(set[key] ?? '') !== want) return false;
  }

  for (const [key, floor] of Object.entries(state.min)) {
    if (!floor) continue;
    const n = Number(set[key]);
    if (!Number.isFinite(n) || n < floor) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const isBlank = (v) => v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0);

/** Sets missing the sort field always land at the end, whichever direction. */
export function compare(a, b, sort) {
  const field = fieldByKey(sort.key);
  const av = a[sort.key];
  const bv = b[sort.key];

  const aBlank = isBlank(av);
  const bBlank = isBlank(bv);
  if (aBlank && bBlank) return tiebreak(a, b);
  if (aBlank) return 1;
  if (bBlank) return -1;

  let c;
  if (field && NUMERIC_TYPES.has(field.type)) {
    c = Number(av) - Number(bv);
  } else {
    c = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true });
  }
  return (c * sort.dir) || tiebreak(a, b);
}

function tiebreak(a, b) {
  return String(a.setName ?? '').localeCompare(String(b.setName ?? ''), undefined, {
    sensitivity: 'base',
  });
}

// ---------------------------------------------------------------------------
// Facets — the distinct values of a field, with counts, in a sensible order
// ---------------------------------------------------------------------------

export function orderedFacet(field, sets) {
  const counts = new Map();
  for (const s of sets) {
    for (const v of valueList(s[field.key])) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  const items = [...counts.entries()].map(([value, count]) => ({ value, count }));

  if (field.type === 'scale') {
    // Highest level first — "most energetic" is the more natural entry point.
    items.sort((x, y) => Number(y.value) - Number(x.value));
  } else if (field.key === 'timeOfDay') {
    // Time of day is an ordered cycle, so respect the documented order and
    // park anything unrecognised at the end.
    const rank = (v) => {
      const i = TIME_OF_DAY_ORDER.indexOf(v);
      return i === -1 ? TIME_OF_DAY_ORDER.length : i;
    };
    items.sort((x, y) => rank(x.value) - rank(y.value) || x.value.localeCompare(y.value));
  } else if (field.type === 'tags') {
    items.sort((x, y) => y.count - x.count || x.value.localeCompare(y.value));
  } else {
    items.sort((x, y) => x.value.localeCompare(y.value, undefined, { sensitivity: 'base' }));
  }
  return items;
}

// ---------------------------------------------------------------------------
// Building the controls
// ---------------------------------------------------------------------------

export function buildFilterUI(form, sets, state, changed) {
  form.replaceChildren();

  for (const field of filterableFields()) {
    if (field.filter === 'min') {
      form.append(minGroup(field, state, changed));
      continue;
    }
    const items = orderedFacet(field, sets);
    if (items.length < 2) continue; // a filter with one option filters nothing
    form.append(
      field.filter === 'select'
        ? selectGroup(field, items, state, changed)
        : chipGroup(field, items, state, changed)
    );
  }
}

function group(legendText) {
  const fs = document.createElement('fieldset');
  fs.className = 'fgroup';
  const lg = document.createElement('legend');
  lg.className = 'fgroup__legend';
  lg.textContent = legendText;
  fs.append(lg);
  return fs;
}

function chipGroup(field, items, state, changed) {
  const fs = group(field.label);
  const list = document.createElement('div');
  list.className = 'chips';

  for (const { value, count } of items) {
    const wrap = document.createElement('label');
    wrap.className = 'chip';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'chip__input';
    input.value = value;
    input.dataset.filterKey = field.key;
    input.checked = Boolean(state.chips[field.key]?.has(value));
    input.addEventListener('change', () => {
      const set = (state.chips[field.key] ||= new Set());
      if (input.checked) set.add(value);
      else set.delete(value);
      changed();
    });

    const face = document.createElement('span');
    face.className = 'chip__face';

    if (field.key === 'timeOfDay' && TIME_OF_DAY_GLYPH[value]) {
      const g = document.createElement('span');
      g.className = 'chip__glyph';
      g.setAttribute('aria-hidden', 'true');
      g.textContent = TIME_OF_DAY_GLYPH[value];
      face.append(g);
    }

    const text = document.createElement('span');
    text.textContent = field.type === 'scale' ? `${value}` : value;
    face.append(text);

    const c = document.createElement('span');
    c.className = 'chip__count';
    c.textContent = count;
    face.append(c);

    wrap.append(input, face);
    list.append(wrap);
  }

  fs.append(list);
  return fs;
}

function selectGroup(field, items, state, changed) {
  const fs = group(field.label);
  const sel = document.createElement('select');
  sel.className = 'input';
  sel.dataset.filterKey = field.key;

  const any = document.createElement('option');
  any.value = '';
  any.textContent = `All ${field.label.toLowerCase()}s`;
  sel.append(any);

  for (const { value, count } of items) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = `${value} (${count})`;
    sel.append(o);
  }
  sel.value = state.select[field.key] || '';
  sel.addEventListener('change', () => {
    state.select[field.key] = sel.value;
    changed();
  });

  fs.append(sel);
  return fs;
}

function minGroup(field, state, changed) {
  const fs = group(`Minimum ${field.label.toLowerCase()}`);
  const wrap = document.createElement('div');
  wrap.className = 'range';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(field.max ?? 10);
  input.step = '0.5';
  input.value = String(state.min[field.key] || 0);
  input.dataset.filterKey = field.key;
  input.id = `min-${field.key}`;

  const out = document.createElement('span');
  out.className = 'range__value';
  out.id = `min-${field.key}-out`;
  const paint = () => {
    const v = Number(input.value);
    out.textContent = v > 0 ? `${v.toFixed(1)} and above` : 'Any rating';
  };
  paint();
  input.setAttribute('aria-describedby', out.id);
  input.addEventListener('input', () => {
    state.min[field.key] = Number(input.value);
    paint();
    changed();
  });

  wrap.append(input, out);
  fs.append(wrap);
  return fs;
}

/**
 * Push state back into the controls. Used after the URL hash is applied or an
 * active-filter chip is dismissed — cheaper than rebuilding the rail, and it
 * doesn't steal focus from whatever the reader was using.
 */
export function syncControls(form, state) {
  for (const input of form.querySelectorAll('input.chip__input')) {
    input.checked = Boolean(state.chips[input.dataset.filterKey]?.has(input.value));
  }
  for (const sel of form.querySelectorAll('select[data-filter-key]')) {
    sel.value = state.select[sel.dataset.filterKey] || '';
  }
  for (const range of form.querySelectorAll('input[type="range"][data-filter-key]')) {
    const key = range.dataset.filterKey;
    range.value = String(state.min[key] || 0);
    const out = document.getElementById(`min-${key}-out`);
    if (out) {
      const v = Number(range.value);
      out.textContent = v > 0 ? `${v.toFixed(1)} and above` : 'Any rating';
    }
  }
}

// ---------------------------------------------------------------------------
// Active filters — what the reader currently has switched on
// ---------------------------------------------------------------------------

export function activeFilters(state) {
  const out = [];
  if (state.q) out.push({ kind: 'q', label: `“${state.q}”` });

  for (const [key, chosen] of Object.entries(state.chips)) {
    if (!chosen) continue;
    const field = fieldByKey(key);
    for (const value of chosen) {
      const shown = field?.type === 'scale' ? `${field.label} ${value}` : value;
      out.push({ kind: 'chip', key, value, label: shown });
    }
  }
  for (const [key, value] of Object.entries(state.select)) {
    if (!value) continue;
    out.push({ kind: 'select', key, value, label: value });
  }
  for (const [key, floor] of Object.entries(state.min)) {
    if (!floor) continue;
    const field = fieldByKey(key);
    out.push({ kind: 'min', key, value: floor, label: `${field?.label ?? key} ≥ ${Number(floor).toFixed(1)}` });
  }
  return out;
}

export const hasFilters = (state) => activeFilters(state).length > 0;

export function clearAll(state) {
  state.q = '';
  for (const key of Object.keys(state.chips)) state.chips[key] = new Set();
  for (const key of Object.keys(state.select)) state.select[key] = '';
  for (const key of Object.keys(state.min)) state.min[key] = 0;
}

export function clearOne(state, entry) {
  if (entry.kind === 'q') state.q = '';
  else if (entry.kind === 'chip') state.chips[entry.key]?.delete(entry.value);
  else if (entry.kind === 'select') state.select[entry.key] = '';
  else if (entry.kind === 'min') state.min[entry.key] = 0;
}
