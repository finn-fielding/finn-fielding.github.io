/**
 * Tests for the filtering, sorting and data-cleaning logic.
 *
 * Run with:   ./tools/test.sh
 *
 * These use macOS's built-in JavaScript engine, so there is nothing to install
 * and no test framework to keep up to date — consistent with the rest of the
 * project. They cover the logic modules only (no DOM), which is where the
 * behaviour that's easy to get quietly wrong lives: does combining two filters
 * narrow the results or replace them, do sets missing a rating sort to the end,
 * does a comma-separated string from a CSV become a real list.
 *
 * The fixtures below are made up rather than read from data/sets.json, so
 * editing your own sets can never make the tests fail. They do use the real
 * field names though — if you rename a field in schema.js and these start
 * failing, that's the tests doing their job.
 */

import { normalise } from '../js/store.js';
import {
  matches, compare, orderedFacet, activeFilters, clearAll, clearOne, valueList,
} from '../js/filters.js';
import { fieldByKey, bandOf, TIME_OF_DAY_ORDER } from '../js/schema.js';
import {
  formatDate, formatDuration, platformOf, renderGrid, renderStats, detailHTML,
} from '../js/render.js';
import { computeStats } from '../js/stats.js';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failures.push(`${name}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

const blankState = () => ({ q: '', sort: 'rating-desc', chips: {}, select: {}, min: {} });

// --- fixtures --------------------------------------------------------------

const raw = [
  {
    id: 'a', setName: 'Alpha', artist: 'Zeta', rating: 9, energy: 8,
    timeOfDay: ['Anytime'], status: 'Listened', description: 'techno workout',
    date: '2026-08-10', url: 'https://www.youtube.com/watch?v=abc',
  },
  {
    id: 'b', setName: 'Beta', artist: 'Alpha DJ', rating: 7, energy: 2,
    timeOfDay: ['Morning', 'Afternoon'], status: 'Sampled',
    description: 'ambient techno', date: '2026-08-03',
  },
  {
    id: 'c', setName: 'Gamma', artist: 'Mid', rating: null, energy: 5,
    timeOfDay: ['Afternoon'], status: 'Listened', description: '', date: '',
  },
];
const sets = raw.map(normalise);

const names = (list) => list.map((s) => s.setName);
const filtered = (state) => names(sets.filter((s) => matches(s, state)));
const sorted = (key, dir) => names([...sets].sort((x, y) => compare(x, y, { key, dir })));

// --- normalise -------------------------------------------------------------

check('rating given as text becomes a number',
  normalise({ setName: 'x', rating: '9.5' }, 0).rating, 9.5);

check('a comma-separated time of day becomes a list',
  normalise({ setName: 'x', timeOfDay: 'Morning, Afternoon' }, 0).timeOfDay,
  ['Morning', 'Afternoon']);

check('a single time of day still becomes a list',
  normalise({ setName: 'x', timeOfDay: 'Anytime' }, 0).timeOfDay, ['Anytime']);

check('empty energy becomes null rather than 0',
  normalise({ setName: 'x', energy: '' }, 0).energy, null);

check('unreadable rating becomes null',
  normalise({ setName: 'x', rating: 'not rated' }, 0).rating, null);

check('an artist billed as a b2b is left intact, not split on the comma',
  normalise({ setName: 'x', artist: 'Cloonee, Prospa' }, 0).artist, 'Cloonee, Prospa');

check('missing id is generated from artist and set name',
  normalise({ setName: 'Fabric 95', artist: 'Craig Richards' }, 0).id, 'craig-richards-fabric-95');

check('surrounding whitespace is trimmed',
  normalise({ setName: '  Alpha  ', status: ' Listened ' }, 0).status, 'Listened');

check('unknown columns survive normalising',
  normalise({ setName: 'x', Mood: 'reflective' }, 0).Mood, 'reflective');

check('numeric field values are stringified for chip matching',
  valueList(8), ['8']);

// --- search ----------------------------------------------------------------

check('empty state shows everything', filtered(blankState()), ['Alpha', 'Beta', 'Gamma']);

check('search matches the description',
  filtered({ ...blankState(), q: 'techno' }), ['Alpha', 'Beta']);

check('search matches set name and artist',
  filtered({ ...blankState(), q: 'alpha' }), ['Alpha', 'Beta']);

check('search is case-insensitive', filtered({ ...blankState(), q: 'AMBIENT' }), ['Beta']);

check('multiple terms must all match',
  filtered({ ...blankState(), q: 'techno ambient' }), ['Beta']);

check('search with no match returns nothing', filtered({ ...blankState(), q: 'zzz' }), []);

// --- chip filters ----------------------------------------------------------

check('one chip narrows to matching sets',
  filtered({ ...blankState(), chips: { timeOfDay: new Set(['Morning']) } }), ['Beta']);

check('two chips in the SAME field are OR (either matches)',
  filtered({ ...blankState(), chips: { timeOfDay: new Set(['Morning', 'Anytime']) } }),
  ['Alpha', 'Beta']);

check('chips in DIFFERENT fields are AND (both must match)',
  filtered({
    ...blankState(),
    chips: { timeOfDay: new Set(['Morning']), energy: new Set(['8']) },
  }), []);

check('AND across fields keeps a set that satisfies both',
  filtered({
    ...blankState(),
    chips: { timeOfDay: new Set(['Morning']), energy: new Set(['2']) },
  }), ['Beta']);

check('status filters like any other field',
  filtered({ ...blankState(), chips: { status: new Set(['Listened']) } }), ['Alpha', 'Gamma']);

check('a set with two times of day matches either one',
  filtered({ ...blankState(), chips: { timeOfDay: new Set(['Afternoon']) } }), ['Beta', 'Gamma']);

check('an empty chip set does not filter anything',
  filtered({ ...blankState(), chips: { timeOfDay: new Set() } }),
  ['Alpha', 'Beta', 'Gamma']);

check('search combines with chips as AND',
  filtered({ ...blankState(), q: 'techno', chips: { status: new Set(['Sampled']) } }), ['Beta']);

check('artist dropdown matches exactly',
  filtered({ ...blankState(), select: { artist: 'Mid' } }), ['Gamma']);

// --- minimum rating --------------------------------------------------------

check('minimum rating excludes lower-rated sets',
  filtered({ ...blankState(), min: { rating: 8 } }), ['Alpha']);

check('minimum rating excludes sets with no rating at all',
  filtered({ ...blankState(), min: { rating: 1 } }), ['Alpha', 'Beta']);

check('a zero minimum is treated as no filter',
  filtered({ ...blankState(), min: { rating: 0 } }), ['Alpha', 'Beta', 'Gamma']);

check('the boundary is inclusive', filtered({ ...blankState(), min: { rating: 7 } }),
  ['Alpha', 'Beta']);

// --- sorting ---------------------------------------------------------------

check('rating descending', sorted('rating', -1), ['Alpha', 'Beta', 'Gamma']);

check('rating ascending still parks the unrated set last',
  sorted('rating', 1), ['Beta', 'Alpha', 'Gamma']);

check('artist A-Z', sorted('artist', 1), ['Beta', 'Gamma', 'Alpha']);

check('artist Z-A', sorted('artist', -1), ['Alpha', 'Gamma', 'Beta']);

check('energy descending', sorted('energy', -1), ['Alpha', 'Gamma', 'Beta']);

check('energy ascending', sorted('energy', 1), ['Beta', 'Gamma', 'Alpha']);

check('date newest first, missing date last', sorted('date', -1), ['Alpha', 'Beta', 'Gamma']);

check('date oldest first, missing date still last', sorted('date', 1), ['Beta', 'Alpha', 'Gamma']);

check('set name A-Z', sorted('setName', 1), ['Alpha', 'Beta', 'Gamma']);

// Two sets with the same rating fall back to set name, so the order is stable
// rather than depending on how the browser's sort happens to behave.
const tied = [
  normalise({ id: 't1', setName: 'Zebra', rating: 8 }, 0),
  normalise({ id: 't2', setName: 'Aardvark', rating: 8 }, 1),
];
check('equal ratings tiebreak on set name',
  names([...tied].sort((x, y) => compare(x, y, { key: 'rating', dir: -1 }))),
  ['Aardvark', 'Zebra']);

// --- facets ----------------------------------------------------------------

const facetValues = (key) => orderedFacet(fieldByKey(key), sets).map((f) => f.value);

check('time of day is ordered through the day, not alphabetically',
  facetValues('timeOfDay'), ['Anytime', 'Morning', 'Afternoon']);

check('energy levels run highest first', facetValues('energy'), ['8', '5', '2']);

check('status values are listed alphabetically', facetValues('status'), ['Listened', 'Sampled']);

check('facet counts are right',
  orderedFacet(fieldByKey('timeOfDay'), sets).map((f) => `${f.value}:${f.count}`),
  ['Anytime:1', 'Morning:1', 'Afternoon:2']);

// --- active filters --------------------------------------------------------

const busy = {
  ...blankState(),
  q: 'techno',
  chips: { timeOfDay: new Set(['Morning']), energy: new Set(['8']) },
  min: { rating: 8 },
  select: { artist: 'Zeta' },
};

check('every active filter is listed', activeFilters(busy).length, 5);

check('scale filters are labelled with their field name',
  activeFilters(busy).some((f) => f.label === 'Energy 8'), true);

const oneRemoved = {
  ...busy,
  chips: { timeOfDay: new Set(['Morning']), energy: new Set(['8']) },
};
clearOne(oneRemoved, { kind: 'chip', key: 'energy', value: '8' });
check('removing one filter leaves the rest alone', activeFilters(oneRemoved).length, 4);

const cleared = {
  ...busy,
  chips: { timeOfDay: new Set(['Morning']) },
  min: { rating: 8 },
  select: { artist: 'Zeta' },
};
clearAll(cleared);
check('clear all removes everything', activeFilters(cleared).length, 0);
check('clear all restores the full list', filtered(cleared), ['Alpha', 'Beta', 'Gamma']);

// --- display formatting ----------------------------------------------------

check('an empty date shows nothing', formatDate(''), '');
check('a date that is not ISO is shown as-is', formatDate('sometime in 2019'), 'sometime in 2019');
check('an ISO date shows the year', formatDate('2026-08-04').includes('2026'), true);
check('a long date includes the day', formatDate('2026-08-04', { long: true }).includes('4'), true);

check('minutes under an hour', formatDuration(45), '45 min');
check('a whole number of hours drops the minutes', formatDuration(120), '2h');
check('hours and minutes', formatDuration(90), '1h 30m');
check('no duration shows nothing', formatDuration(null), '');

// --- platform detection ----------------------------------------------------

check('a youtube watch link', platformOf('https://www.youtube.com/watch?v=abc').cta,
  'Watch on YouTube');
check('a shortened youtu.be link', platformOf('https://youtu.be/abc').name, 'YouTube');
check('a soundcloud link', platformOf('https://soundcloud.com/x/y').cta, 'Play on SoundCloud');
check('a mixcloud link', platformOf('https://www.mixcloud.com/x/').name, 'Mixcloud');
check('an unrecognised host still gets a button',
  platformOf('https://example.com/mix.mp3').cta, 'Listen');
check('no link means no button', platformOf('').cta, '');
check('a null link is handled', platformOf(null).cta, '');

// --- stats -----------------------------------------------------------------

const st = computeStats(sets);

check('counts the sets it is given', st.total, 3);
check('counts only the rated ones', st.ratedCount, 2);
// (9 + 7) / 2 = 8 — the unrated set is excluded, not counted as zero.
check('average rating ignores unrated sets', st.avgRating, 8);
// (8 + 2 + 5) / 3 = 5
check('average energy', st.avgEnergy, 5);
check('counts distinct artists', st.artistCount, 3);
check('finds the top-rated set', st.best.setName, 'Alpha');

check('breaks down by time of day in day order',
  st.byTimeOfDay.map((b) => `${b.value}:${b.count}`),
  ['Anytime:1', 'Morning:1', 'Afternoon:2']);

// Beta (7) and Gamma (unrated) are both Afternoon, so the average is just 7.
check('per-bucket average rating skips unrated sets',
  st.byTimeOfDay.find((b) => b.value === 'Afternoon').avgRating, 7);

check('a bucket with nothing rated reports null',
  computeStats([normalise({ id: 'z', setName: 'Z', timeOfDay: ['Sunset'] }, 0)])
    .byTimeOfDay[0].avgRating, null);

// Rating and energy are averaged independently — Gamma has an energy but no
// rating, so the two figures for Afternoon come from different set counts.
check('per-bucket average energy',
  st.byTimeOfDay.find((b) => b.value === 'Afternoon').avgEnergy, 3.5);
check('per-bucket average rating is unaffected by the unrated set',
  st.byTimeOfDay.find((b) => b.value === 'Afternoon').avgRating, 7);
check('a bucket with no energy values reports null',
  computeStats([normalise({ id: 'z', setName: 'Z', timeOfDay: ['Sunset'], rating: 5 }, 0)])
    .byTimeOfDay[0].avgEnergy, null);

// --- time-of-day colour bands ----------------------------------------------

check('daytime periods band as day',
  ['Sunrise', 'Morning', 'Afternoon'].map(bandOf), ['day', 'day', 'day']);
check('evening and later band as night',
  ['Sunset', 'Evening', 'Peak time', 'Late night', 'After hours'].map(bandOf),
  ['night', 'night', 'night', 'night', 'night']);
check('Anytime is deliberately unbanded', bandOf('Anytime'), '');
check('an unrecognised period is unbanded rather than broken', bandOf('Brunch'), '');
check('every documented period except Anytime has a band',
  TIME_OF_DAY_ORDER.filter((v) => v !== 'Anytime' && !bandOf(v)), []);

const repeated = [
  normalise({ id: 'r1', setName: 'One', artist: 'Fred again..', rating: 9 }, 0),
  normalise({ id: 'r2', setName: 'Two', artist: 'Fred again..', rating: 8 }, 1),
  normalise({ id: 'r3', setName: 'Three', artist: 'Salute', rating: 7 }, 2),
];
check('finds the most-logged artist', computeStats(repeated).topArtist,
  { name: 'Fred again..', count: 2 });

const emptyStats = computeStats([]);
check('an empty list has no total', emptyStats.total, 0);
check('an empty list has no average', emptyStats.avgRating, null);
check('an empty list has no top artist', emptyStats.topArtist, null);
check('an empty list has no best set', emptyStats.best, null);

// Stats describe whatever subset they are handed, which is how the panel
// follows the filters.
const afternoonOnly = sets.filter((s) => (s.timeOfDay ?? []).includes('Afternoon'));
check('stats follow a filtered subset', computeStats(afternoonOnly).total, 2);
check('a filtered subset gets its own average', computeStats(afternoonOnly).avgRating, 7);

// --- markup ----------------------------------------------------------------
// These functions only assign to `innerHTML`, so a plain object stands in for a
// DOM node. Not a substitute for looking at the page, but it does catch a broken
// template — which is most of what can go wrong in there.

const count = (html, pattern) => (html.match(pattern) ?? []).length;

const gridStub = { innerHTML: '' };
renderGrid(gridStub, sets);

check('one card per set', count(gridStub.innerHTML, /class="card"/g), 3);
check('the listen button names the platform',
  gridStub.innerHTML.includes('Watch on YouTube'), true);
check('only the set with a link gets a listen button',
  count(gridStub.innerHTML, /btn--listen/g), 1);
check('the energy meter has one segment per point of the scale',
  count(gridStub.innerHTML, /meter__seg/g), 10 * 3);
check('the meter states the value as text too',
  gridStub.innerHTML.includes('8/10'), true);
check('every card can be opened', count(gridStub.innerHTML, /data-open=/g), 3);
check('status appears on the card', gridStub.innerHTML.includes('Sampled'), true);

// Band classes are what carry amber vs violet in the CSS.
check('a daytime chip is banded as day', gridStub.innerHTML.includes('tag--day'), true);
check('Anytime stays neutral — no band class beyond tag--tod',
  gridStub.innerHTML.includes('tag--night'), false);

const nightStub = { innerHTML: '' };
renderGrid(nightStub, [normalise(
  { id: 'n', setName: 'N', timeOfDay: ['Late night'], rating: 8, energy: 9 }, 0)]);
check('a late-night chip is banded as night', nightStub.innerHTML.includes('tag--night'), true);

// An apostrophe in a set name must not break out of the attribute or element.
const risky = [normalise({ id: 'x', setName: `Maka's "Birthday" & <b>Rome</b>`, rating: 5 }, 0)];
renderGrid(gridStub, risky);
check('quotes and tags in a set name are escaped',
  gridStub.innerHTML.includes('&lt;b&gt;') && !gridStub.innerHTML.includes('<b>Rome'), true);

const statsStub = { hidden: null, innerHTML: '' };
renderStats(statsStub, computeStats(sets), { caption: 'Across all 3 sets' });
check('the stats panel becomes visible', statsStub.hidden, false);
check('the stats panel shows its caption',
  statsStub.innerHTML.includes('Across all 3 sets'), true);
check('one bar per time of day', count(statsStub.innerHTML, /class="bar"/g), 3);
check('the average rating is shown', statsStub.innerHTML.includes('8.0'), true);
check('bar widths are percentages', statsStub.innerHTML.includes('width:100.0%'), true);

// The bug this replaced: rows read "3 · avg 8.7" with no way to tell which
// average it was. Both are now named, and a bare "avg <number>" must not appear.
check('bar rows name the rating average', statsStub.innerHTML.includes('avg rating'), true);
check('bar rows name the energy average', statsStub.innerHTML.includes('avg energy'), true);
check('no unlabelled average survives', /avg \d/.test(statsStub.innerHTML), false);
check('bar rows count their sets', statsStub.innerHTML.includes('2 sets'), true);
check('a single set is not called "1 sets"', statsStub.innerHTML.includes('1 set ·'), true);

renderStats(statsStub, computeStats([]), {});
check('the stats panel hides when nothing matches', statsStub.hidden, true);

const detail = detailHTML(sets[0]);
check('the detail view offers a copy-link button',
  detail.includes('data-copy-link="a"'), true);
check('the detail view shows the description',
  detail.includes('techno workout'), true);
check('the detail view repeats the listen button',
  detail.includes('Watch on YouTube'), true);

// --- report ----------------------------------------------------------------

print('');
if (failures.length === 0) {
  print(`  All ${passed} logic tests passed.`);
  print('');
} else {
  print(`  ${passed} passed, ${failures.length} FAILED:`);
  print('');
  for (const f of failures) print(`  x ${f}`);
  print('');
  throw new Error(`${failures.length} test(s) failed`);
}
