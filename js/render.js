/**
 * Turning sets into markup: the card grid, the detail sheet, the active-filter
 * chips, and the result count.
 */

import {
  FIELDS,
  fieldByKey,
  knownKeys,
  TIME_OF_DAY_GLYPH,
} from './schema.js';

/** Escape anything interpolated into markup. The data is trusted, but a set
 *  name containing an apostrophe or an ampersand shouldn't break the page. */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

export function formatDuration(min) {
  if (!Number.isFinite(min) || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatDate(value, { long = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // not ISO — show whatever's there
  // Parse as UTC so the displayed day can't drift by a timezone offset.
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    day: long ? 'numeric' : undefined,
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const formatRating = (n) => (Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '');

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function meterHTML(value, max, label = 'Energy') {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
  const segs = Array.from(
    { length: max },
    (_, i) => `<span class="meter__seg${i < v ? ' is-on' : ''}"></span>`
  ).join('');
  // The numeral repeats the value as text, so the reading never rests on
  // counting segments — which matters more at 10 segments than at 5.
  return `
    <div class="meter-row">
      <span class="meter-row__label">${esc(label)}</span>
      <div class="meter" role="img" aria-label="${esc(label)} ${esc(v)} out of ${esc(max)}">${segs}</div>
      <span class="meter__val">${esc(v)}/${esc(max)}</span>
    </div>`;
}

const todChips = (list) =>
  list
    .map((v) => {
      const glyph = TIME_OF_DAY_GLYPH[v]
        ? `<span class="tag__glyph" aria-hidden="true">${esc(TIME_OF_DAY_GLYPH[v])}</span>`
        : '';
      return `<li class="tag tag--tod">${glyph}${esc(v)}</li>`;
    })
    .join('');

const tagChips = (list) => list.map((v) => `<li class="tag">${esc(v)}</li>`).join('');

/* Status is shown on every card rather than only when unusual: it tells the
   reader how much weight the rating carries — a "Sampled" set hasn't been heard
   all the way through. */
const statusChip = (value) => `<li class="tag tag--status">${esc(value)}</li>`;

// ---------------------------------------------------------------------------
// Card grid
// ---------------------------------------------------------------------------

export function renderGrid(gridEl, sets) {
  gridEl.innerHTML = sets.map(cardHTML).join('');
}

function cardHTML(set) {
  const energyField = fieldByKey('energy');
  const ratingField = fieldByKey('rating');

  const meta = formatDate(set.date);

  const listen = set.url
    ? `<a class="btn btn--listen" href="${esc(set.url)}" target="_blank" rel="noopener noreferrer">
         Listen <span aria-hidden="true">↗</span>
       </a>`
    : '';

  const rating = Number.isFinite(set.rating)
    ? `<div class="rating">
         <span class="rating__val">${esc(formatRating(set.rating))}</span><span class="rating__max">/${esc(ratingField?.max ?? 10)}</span>
         <span class="rating__label">${esc(ratingField?.label ?? 'Overall')}</span>
       </div>`
    : '';

  const chips = [
    ...(set.timeOfDay?.length ? [todChips(set.timeOfDay)] : []),
    ...(set.status ? [statusChip(set.status)] : []),
  ].join('');

  return `
    <li class="card">
      <div class="card__top">
        <div class="card__head">
          ${set.artist ? `<p class="card__artist">${esc(set.artist)}</p>` : ''}
          <h3 class="card__name">
            <button type="button" data-open="${esc(set.id)}">${esc(set.setName || 'Untitled set')}</button>
          </h3>
        </div>
        ${rating}
      </div>
      ${Number.isFinite(set.energy)
        ? meterHTML(set.energy, energyField?.max ?? 10, energyField?.label ?? 'Energy')
        : ''}
      ${chips ? `<ul class="tagline">${chips}</ul>` : ''}
      <div class="card__foot">
        <span class="card__meta">${esc(meta)}</span>
        ${listen}
      </div>
    </li>`;
}

// ---------------------------------------------------------------------------
// Detail sheet
// ---------------------------------------------------------------------------

/** Fields already shown in the sheet header, so they aren't repeated as rows. */
const HEADER_KEYS = new Set(['setName', 'artist', 'rating', 'url']);

export function detailHTML(set) {
  const ratingField = fieldByKey('rating');
  const rows = [];

  for (const field of FIELDS) {
    if (HEADER_KEYS.has(field.key)) continue;
    const value = set[field.key];
    if (value === '' || value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    let rendered;
    switch (field.type) {
      case 'scale':
        rendered = meterHTML(value, field.max ?? 10, field.label);
        break;
      case 'multiEnum':
        rendered = `<ul class="tagline">${todChips(value)}</ul>`;
        break;
      case 'enum':
        rendered = `<ul class="tagline">${statusChip(value)}</ul>`;
        break;
      case 'tags':
        rendered = `<ul class="tagline">${tagChips(value)}</ul>`;
        break;
      case 'date':
        rendered = esc(formatDate(value, { long: true }));
        break;
      case 'duration':
        rendered = esc(formatDuration(value));
        break;
      case 'longText':
        rendered = String(value)
          .split(/\n{1,}/)
          .filter((p) => p.trim())
          .map((p) => `<p>${esc(p.trim())}</p>`)
          .join('');
        break;
      default:
        rendered = esc(value);
    }
    if (rendered) rows.push({ label: field.label, html: rendered });
  }

  // Anything in the data this schema doesn't know about, rather than dropping it.
  const known = knownKeys();
  for (const [key, value] of Object.entries(set)) {
    if (known.has(key) || key === 'id' || key === 'placeholder') continue;
    if (value === '' || value === null || value === undefined) continue;
    rows.push({ label: key, html: esc(Array.isArray(value) ? value.join(', ') : value) });
  }

  const rating = Number.isFinite(set.rating)
    ? `<div class="rating">
         <span class="rating__val">${esc(formatRating(set.rating))}</span><span class="rating__max">/${esc(ratingField?.max ?? 10)}</span>
         <span class="rating__label">${esc(ratingField?.label ?? 'Overall')}</span>
       </div>`
    : '';

  const listen = set.url
    ? `<a class="btn btn--listen" href="${esc(set.url)}" target="_blank" rel="noopener noreferrer">
         Listen <span aria-hidden="true">↗</span>
       </a>`
    : '';

  return `
    <div class="sheet__top">
      <div>
        ${set.artist ? `<p class="sheet__artist">${esc(set.artist)}</p>` : ''}
        <h2 class="sheet__name" id="detail-title">${esc(set.setName || 'Untitled set')}</h2>
      </div>
      ${rating}
    </div>
    <div>
      ${rows.map((r) => `
        <div class="drow">
          <div class="drow__k">${esc(r.label)}</div>
          <div class="drow__v">${r.html}</div>
        </div>`).join('')}
    </div>
    ${listen ? `<div class="sheet__actions">${listen}</div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Count and active filters
// ---------------------------------------------------------------------------

export function renderCount(el, shown, total) {
  el.textContent =
    shown === total
      ? `${total} ${total === 1 ? 'set' : 'sets'}`
      : `${shown} of ${total} sets`;
}

export function renderActive(listEl, entries) {
  listEl.innerHTML = entries
    .map(
      (e, i) => `
      <li class="achip">
        <span>${esc(e.label)}</span>
        <button type="button" class="achip__x" data-clear="${i}"
                aria-label="Remove filter ${esc(e.label)}">✕</button>
      </li>`
    )
    .join('');
}
