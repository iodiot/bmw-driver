// The road differs on every visit: its bends, bumps and holes and where the
// bridges and the tunnel stand follow a number drawn when the page loads.
// `?road=N` shows layout N again. Outside a browser (the tests) the number
// is 0: the original layout.
const query =
  typeof location !== 'undefined' ? new URLSearchParams(location.search).get('road') : null;
export const roadSeed =
  query !== null && query !== '' && Number.isFinite(Number(query))
    ? Math.abs(Math.trunc(Number(query))) % 2147483647
    : typeof window !== 'undefined'
      ? 1 + Math.floor(Math.random() * 999999)
      : 0;

// A small seeded generator (mulberry32): the same numbers for the same seed.
export function seededRandom(seed, salt = 0) {
  let a = (seed * 2654435761 + salt * 40503) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
