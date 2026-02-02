export function hash32(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hashToUnitFloat(str) {
  return hash32(str) / 4294967296;
}

export function makeRng(seedStr) {
  const seed = hash32(seedStr);
  return mulberry32(seed);
}

export function rngFor(seed, entityId, channel) {
  return makeRng(`${seed}::${entityId}::${channel}`);
}

export function stableId(prefix, seed, signature) {
  const h = hash32(`${seed}::${signature}`);
  return `${prefix}${h.toString(36)}`;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
