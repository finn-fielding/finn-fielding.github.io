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
import { fieldByKey } from '../js/schema.js';
import { formatDate, formatDuration } from '../js/render.js';

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
    date: '2026-08-10', url: 'https://x/a',
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
