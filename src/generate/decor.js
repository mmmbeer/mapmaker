import { rectPoly } from "../geometry.js";

export function generateDecor(rng, params) {
  const R = params.townRadius;
  const fields = [];
  const fieldCount = 8 + Math.floor(rng() * 7);
  for (let i = 0; i < fieldCount; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = lerp(R * 1.2, R * 2.0, rng());
    const cx = Math.cos(ang) * dist;
    const cy = Math.sin(ang) * dist;
    const w = lerp(R * 0.6, R * 1.2, rng());
    const h = lerp(R * 0.4, R * 1.0, rng());
    const rot = (rng() - 0.5) * 0.8;
    const poly = rectPoly(cx, cy, w, h, rot);
    fields.push({
      id: `field_${i}`,
      poly,
      tone: rng() < 0.45 ? "light" : (rng() < 0.6 ? "mid" : "dark")
    });
  }

  const pondAng = rng() * Math.PI * 2;
  const pondDist = lerp(R * 1.25, R * 1.7, rng());
  const water = {
    cx: Math.cos(pondAng) * pondDist,
    cy: Math.sin(pondAng) * pondDist,
    rx: lerp(R * 0.10, R * 0.18, rng()),
    ry: lerp(R * 0.08, R * 0.15, rng()),
    rot: (rng() - 0.5) * 0.6
  };

  const trees = [];
  const treeCount = 420 + Math.floor(rng() * 280);
  for (let i = 0; i < treeCount; i++) {
    const a = rng() * Math.PI * 2;
    const d = lerp(R * 0.5, R * 2.3, Math.pow(rng(), 0.6));
    const x = Math.cos(a) * d + (rng() - 0.5) * 40;
    const y = Math.sin(a) * d + (rng() - 0.5) * 40;
    if (Math.hypot(x, y) < R * 0.25) continue;
    trees.push({ x, y, s: lerp(1, 2.4, rng()) });
  }

  const townBoundary = { cx: 0, cy: 0, r: R };

  return { fields, trees, water, townBoundary };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
