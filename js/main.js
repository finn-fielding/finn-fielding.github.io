/**
 * Wiring: load the data, build the controls, keep the URL in step with the view.
 *
 * The filter state lives in the URL hash so a filtered view can be bookmarked or
 * sent to someone — "here are my sunrise sets" is a link, not instructions.
 */

import { SORTS, DEFAULT_SORT, filterableFields } from './schema.js';
import {
  state, load, allSets, visible, findSet, hasPlaceholders,
} from './store.js';
import {
  buildFilterUI, syncControls, activeFilters, hasFilters, clearAll, clearOne,
} from './filters.js';
import { renderGrid, renderCount, renderActive, detailHTML } from './render.js';

const $ = (id) => document.getElementById(id);

const el = {
  form: $('filter-form'),
  search: $('search'),
  sort: $('sort'),
  grid: $('grid'),
  count: $('count'),
  active: $('active-filters'),
  empty: $('empty'),
  emptyDetail: $('empty-detail'),
  error: $('error'),
  errorDetail: $('error-detail'),
  clearAll: $('clear-all'),
  banner: $('placeholder-banner'),
  detail: $('detail'),
  detailBody: $('detail-body'),
  themeBtn: $('theme-toggle'),
  themeLabel: $('theme-label'),
};

// ---------------------------------------------------------------------------
// Theme: auto (follow the OS) -> light -> dark -> auto
// ---------------------------------------------------------------------------

const THEME_KEY = 'set-ranker-theme';
const THEMES = ['auto', 'light', 'dark'];

function applyTheme(name) {
  document.documentElement.dataset.theme = name === 'auto' ? '' : name;
  el.themeLabel.textContent = name[0].toUpperCase() + name.slice(1);
  el.themeBtn.setAttribute('aria-label', `Colour theme: ${name}. Click to change.`);
}

function initTheme() {
  let current = 'auto';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) current = saved;
  } catch {
    // Private browsing can throw on localStorage; the default is fine.
  }
  applyTheme(current);
  el.themeBtn.addEventListener('click', () => {
    current = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    applyTheme(current);
    try { localStorage.setItem(THEME_KEY, current); } catch { /* not important */ }
  });
}

// ---------------------------------------------------------------------------
// URL hash <-> state
// ---------------------------------------------------------------------------

const CHIP_SEP = '|';

function stateToHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort && state.sort !== DEFAULT_SORT) p.set('sort', state.sort);

  for (const field of filterableFields()) {
    const key = field.key;
    if (field.filter === 'chips') {
      const chosen = state.chips[key];
      if (chosen?.size) p.set(key, [...chosen].join(CHIP_SEP));
    } else if (field.filter === 'select') {
      if (state.select[key]) p.set(key, state.select[key]);
    } else if (field.filter === 'min') {
      if (state.min[key]) p.set(`min-${key}`, String(state.min[key]));
    }
  }
  return p.toString();
}

function hashToState() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));

  state.q = p.get('q') || '';
  const sort = p.get('sort');
  state.sort = SORTS.some((s) => s.id === sort) ? sort : DEFAULT_SORT;

  for (const field of filterableFields()) {
    const key = field.key;
    if (field.filter === 'chips') {
      const raw = p.get(key);
      state.chips[key] = new Set(
        raw ? raw.split(CHIP_SEP).map((v) => v.trim()).filter(Boolean) : []
      );
    } else if (field.filter === 'select') {
      state.select[key] = p.get(key) || '';
    } else if (field.filter === 'min') {
      const n = Number(p.get(`min-${key}`));
      state.min[key] = Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
}

let writingHash = false;
function writeHash() {
  const next = stateToHash();
  const target = next ? `#${next}` : location.pathname + location.search;
  writingHash = true;
  // replaceState rather than pushState: typing in the search box shouldn't
  // stack up dozens of history entries to click back through.
  history.replaceState(null, '', target);
  writingHash = false;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  const shown = visible();
  const total = allSets().length;

  renderGrid(el.grid, shown);
  renderCount(el.count, shown.length, total);

  const active = activeFilters(state);
  renderActive(el.active, active);
  el.clearAll.hidden = active.length === 0;

  const isEmpty = shown.length === 0 && total > 0;
  el.empty.hidden = !isEmpty;
  el.grid.hidden = isEmpty;
  if (isEmpty) {
    el.emptyDetail.textContent = active.length
      ? `Nothing satisfies all ${active.length} of the filters you've got on at once: ${active
          .map((a) => a.label)
          .join(', ')}.`
      : 'There are no sets in the data yet.';
  }
}

function changed() {
  writeHash();
  render();
}

// ---------------------------------------------------------------------------
// Detail sheet
// ---------------------------------------------------------------------------

function openDetail(id) {
  const set = findSet(id);
  if (!set) return;
  el.detailBody.innerHTML = detailHTML(set);
  el.detail.setAttribute('aria-labelledby', 'detail-title');
  el.detail.showModal(); // Escape-to-close and focus return come free with <dialog>
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function showError(message) {
  el.errorDetail.textContent = message;
  el.error.hidden = false;
  el.grid.hidden = true;
  el.empty.hidden = true;
  document.querySelector('.rail').hidden = true;
  document.querySelector('.toolbar').hidden = true;
  el.count.textContent = '';
}

async function boot() {
  initTheme();

  // Sort options come from the schema, so adding a sortable field is one edit.
  el.sort.innerHTML = SORTS.map(
    (s) => `<option value="${s.id}">${s.label}</option>`
  ).join('');

  try {
    await load();
  } catch (err) {
    showError(err.message);
    return;
  }

  el.banner.hidden = !hasPlaceholders();

  hashToState();
  buildFilterUI(el.form, allSets(), state, changed);
  el.search.value = state.q;
  el.sort.value = state.sort;

  render();

  // --- events ---

  let searchTimer;
  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = el.search.value.trim();
      changed();
    }, 120);
  });

  el.sort.addEventListener('change', () => {
    state.sort = el.sort.value;
    changed();
  });

  el.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (btn) openDetail(btn.dataset.open);
  });

  el.active.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if (!btn) return;
    const entry = activeFilters(state)[Number(btn.dataset.clear)];
    if (!entry) return;
    clearOne(state, entry);
    if (entry.kind === 'q') el.search.value = '';
    syncControls(el.form, state);
    changed();
  });

  const doClearAll = () => {
    clearAll(state);
    el.search.value = '';
    syncControls(el.form, state);
    changed();
  };
  el.clearAll.addEventListener('click', doClearAll);
  el.empty.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-all"]')) doClearAll();
  });

  // Someone hand-editing the hash, or arriving via a shared link mid-session.
  window.addEventListener('hashchange', () => {
    if (writingHash) return;
    hashToState();
    el.search.value = state.q;
    el.sort.value = state.sort;
    syncControls(el.form, state);
    render();
  });
}

boot().catch((err) => {
  console.error(err);
  showError(err.message ?? String(err));
});
