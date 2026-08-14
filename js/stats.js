/**
 * Summary numbers for the stats panel.
 *
 * Kept separate from rendering so the arithmetic can be tested directly — see
 * tools/test_logic.js. Everything here is computed from whatever list of sets it
 * is handed, which means the panel can describe the filtered view rather than
 * only the whole collection.
 *
 * Averages ignore sets with no value rather than counting them as zero. A set
 * you haven't rated shouldn't drag the average down.
 */

import { TIME_OF_DAY_ORDER } from './schema.js';

const mean = (values) =>
  values.length ? values.reduce((total, v) => total + v, 0) / values.length : null;

const numbers = (sets, key) => sets.map((s) => s[key]).filter((v) => Number.isFinite(v));

export function computeStats(sets) {
  const ratings = numbers(sets, 'rating');
  const energies = numbers(sets, 'energy');

  // --- per time of day ---
  // Rating and energy are averaged separately, because a set can have one and
  // not the other, and both are reported so neither figure is ambiguous.
  const buckets = new Map();
  for (const set of sets) {
    for (const value of set.timeOfDay ?? []) {
      if (!buckets.has(value)) {
        buckets.set(value, { value, count: 0, ratings: [], energies: [] });
      }
      const bucket = buckets.get(value);
      bucket.count += 1;
      if (Number.isFinite(set.rating)) bucket.ratings.push(set.rating);
      if (Number.isFinite(set.energy)) bucket.energies.push(set.energy);
    }
  }
  const rank = (value) => {
    const index = TIME_OF_DAY_ORDER.indexOf(value);
    return index === -1 ? TIME_OF_DAY_ORDER.length : index;
  };
  const byTimeOfDay = [...buckets.values()]
    .sort((a, b) => rank(a.value) - rank(b.value) || a.value.localeCompare(b.value))
    .map((b) => ({
      value: b.value,
      count: b.count,
      avgRating: mean(b.ratings),
      avgEnergy: mean(b.energies),
    }));

  // --- artists ---
  const artistCounts = new Map();
  for (const set of sets) {
    const artist = String(set.artist ?? '').trim();
    if (artist) artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
  }
  let topArtist = null;
  for (const [name, count] of artistCounts) {
    const better =
      !topArtist || count > topArtist.count ||
      (count === topArtist.count && name.localeCompare(topArtist.name) < 0);
    if (better) topArtist = { name, count };
  }

  // --- the pick of the bunch ---
  const rated = sets.filter((s) => Number.isFinite(s.rating));
  const best = rated.length
    ? rated.reduce((champion, s) => (s.rating > champion.rating ? s : champion))
    : null;

  return {
    total: sets.length,
    ratedCount: ratings.length,
    avgRating: mean(ratings),
    avgEnergy: mean(energies),
    artistCount: artistCounts.size,
    topArtist,
    byTimeOfDay,
    best: best ? { id: best.id, setName: best.setName, artist: best.artist, rating: best.rating } : null,
  };
}
