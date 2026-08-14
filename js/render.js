/**
 * Turning sets into markup: the card grid, the detail sheet, the active-filter
 * chips, and the result count.
 */

import {
  FIELDS,
  fieldByKey,
  knownKeys,
  TIME_OF_DAY_GLYPH,
  bandOf,
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

/**
 * Work out where a link goes from the URL itself, so the button can say "Watch
 * on YouTube" rather than a vague "Listen". No extra column needed in Notion —
 * the information is already in the link.
 */
const PLATFORMS = [
  [/(?:^|\.)youtube\.com|youtu\.be/i, 'YouTube', 'Watch on YouTube'],
  [/soundcloud\.com/i, 'SoundCloud', 'Play on SoundCloud'],
  [/mixcloud\.com/i, 'Mixcloud', 'Play on Mixcloud'],
  [/open\.spotify\.com|spotify\.com/i, 'Spotify', 'Play on Spotify'],
  [/twitch\.tv/i, 'Twitch', 'Watch on Twitch'],
  [/bandcamp\.com/i, 'Bandcamp', 'Play on Bandcamp'],
  [/vimeo\.com/i, 'Vimeo', 'Watch on Vimeo'],
];

export function platformOf(url) {
  const link = String(url ?? '');
  if (!link) return { name: '', cta: '' };
  for (const [pattern, name, cta] of PLATFORMS) {
    if (pattern.test(link)) return { name, cta };
  }
  return { name: '', cta: 'Listen' };
}

/** The primary action on a set: go and actually hear it. */
function listenButton(url) {
  if (!url) return '';
  const { cta } = platformOf(url);
  return `<a class="btn btn--primary btn--listen" href="${esc(url)}"
             target="_blank" rel="noopener noreferrer">${esc(cta)} <span aria-hidden="true">↗</span></a>`;
}

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
      // Amber for daytime, violet for night, neutral for anything unbanded.
      const band = bandOf(v);
      return `<li class="tag tag--tod${band ? ` tag--${band}` : ''}">${glyph}${esc(v)}</li>`;
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
  const listen = listenButton(set.url);

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

  const listen = listenButton(set.url);

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
    <div class="sheet__actions">
      ${listen}
      <button type="button" class="btn" data-copy-link="${esc(set.id)}">Copy link to this set</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Stats panel
// ---------------------------------------------------------------------------

/**
 * A compact summary of whichever sets are currently on screen, so filtering to
 * "Afternoon" answers "and how do those rate on average?".
 *
 * Deliberately restrained: with a small collection, a ten-bucket histogram of
 * energy would be mostly empty bars pretending to be information. Every number
 * shown here is also printed as text beside its bar, so nothing depends on
 * reading a bar length.
 */
export function renderStats(el, stats, { ratingMax = 10, energyMax = 10, caption = '' } = {}) {
  if (!stats.total) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;

  const num = (value, max) =>
    value == null
      ? '<span class="tile__val tile__val--none">—</span>'
      : `<span class="tile__val">${esc(value.toFixed(1))}</span><span class="tile__max">/${esc(max)}</span>`;

  const tiles = `
    <li class="tile">
      <span class="tile__label">${stats.total === 1 ? 'Set' : 'Sets'}</span>
      <span class="tile__val">${esc(stats.total)}</span>
    </li>
    <li class="tile">
      <span class="tile__label">Average rating</span>
      ${num(stats.avgRating, ratingMax)}
    </li>
    <li class="tile">
      <span class="tile__label">Average energy</span>
      ${num(stats.avgEnergy, energyMax)}
    </li>
    <li class="tile">
      <span class="tile__label">${stats.artistCount === 1 ? 'Artist' : 'Artists'}</span>
      <span class="tile__val">${esc(stats.artistCount)}</span>
    </li>`;

  const peak = Math.max(1, ...stats.byTimeOfDay.map((b) => b.count));
  const bars = stats.byTimeOfDay
    .map((b) => {
      const band = bandOf(b.value);
      const glyph = TIME_OF_DAY_GLYPH[b.value]
        ? `<span class="tag__glyph${band ? ` glyph--${band}` : ''}" aria-hidden="true">${
            esc(TIME_OF_DAY_GLYPH[b.value])}</span>`
        : '';
      // Both averages are named. An unlabelled "avg 8.7" is unreadable — there
      // are two things here it could plausibly be averaging.
      const figures = [
        `${b.count} ${b.count === 1 ? 'set' : 'sets'}`,
        b.avgRating == null ? 'unrated' : `avg rating ${b.avgRating.toFixed(1)}`,
        b.avgEnergy == null ? null : `avg energy ${b.avgEnergy.toFixed(1)}`,
      ].filter(Boolean);
      return `
        <li class="bar">
          <span class="bar__label">${glyph}${esc(b.value)}</span>
          <span class="bar__track">
            <span class="bar__fill" style="width:${((b.count / peak) * 100).toFixed(1)}%"></span>
          </span>
          <span class="bar__val">${esc(figures.join(' · '))}</span>
        </li>`;
    })
    .join('');

  const notes = [];
  if (stats.topArtist && stats.topArtist.count > 1) {
    notes.push(`Most logged: <strong>${esc(stats.topArtist.name)}</strong> (${esc(stats.topArtist.count)} sets)`);
  }
  if (stats.best) {
    notes.push(
      `Top rated: <button type="button" class="linkish" data-open="${esc(stats.best.id)}">` +
      `${esc(stats.best.setName)}</button> (${esc(formatRating(stats.best.rating))}/${esc(ratingMax)})`
    );
  }

  el.innerHTML = `
    <div class="stats__head">
      <h2 id="stats-heading">At a glance</h2>
      ${caption ? `<p class="stats__caption">${esc(caption)}</p>` : ''}
    </div>
    <ul class="tiles">${tiles}</ul>
    ${stats.byTimeOfDay.length
      ? `<div class="statchart">
           <h3 class="statchart__title">Sets by time of day</h3>
           <ul class="bars">${bars}</ul>
         </div>`
      : ''}
    ${notes.length ? `<p class="stats__notes">${notes.join(' &nbsp;·&nbsp; ')}</p>` : ''}`;
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
