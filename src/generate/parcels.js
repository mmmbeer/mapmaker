import { polyArea, polyBounds, polyCentroid } from "../geometry.js";
import { stableId } from "../rng.js";

export function generateParcels(rng, params, blocks) {
  const parcels = [];
  const queue = [];

  for (const block of blocks) {
    const centroid = polyCentroid(block.poly);
    const district = districtForPoint(centroid, params.townRadius);
    queue.push({ poly: block.poly, blockId: block.id, district });
  }

  const target = Math.max(120, Math.round(420 * (params.density / 1.2)));
  let iterations = 0;
  while (queue.length + parcels.length < target && iterations < target * 6) {
    iterations++;
    const item = popLargest(queue);
    if (!item) break;
    const area = Math.abs(polyArea(item.poly));
    const minArea = minParcelArea(params, item.district);
    if (area < minArea * 1.8) {
      parcels.push(item);
      continue;
    }

    const bounds = polyBounds(item.poly);
    const axis = chooseAxis(rng, bounds);
    const split = randomSplit(rng, bounds, axis);
    const splitResult = splitPolygon(item.poly, axis, split);
    if (!splitResult) {
      parcels.push(item);
      continue;
    }
    const [a, b] = splitResult;
    if (Math.abs(polyArea(a)) < minArea || Math.abs(polyArea(b)) < minArea) {
      parcels.push(item);
      continue;
    }

    queue.push({ poly: a, blockId: item.blockId, district: item.district });
    queue.push({ poly: b, blockId: item.blockId, district: item.district });
  }

  for (const item of queue) parcels.push(item);

  const out = [];
  for (const parcel of parcels) {
    const centroid = polyCentroid(parcel.poly);
    const area = Math.abs(polyArea(parcel.poly));
    const id = stableId("parcel_", params.seed, `${parcel.blockId}:${Math.round(centroid.x)}:${Math.round(centroid.y)}:${Math.round(area)}`);
    out.push({
      id,
      poly: parcel.poly,
      blockId: parcel.blockId,
      bbox: polyBounds(parcel.poly),
      district: parcel.district
    });
  }

  return out;
}

function popLargest(list) {
  if (!list.length) return null;
  let best = 0;
  let bestArea = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const area = Math.abs(polyArea(list[i].poly));
    if (area > bestArea) {
      bestArea = area;
      best = i;
    }
  }
  return list.splice(best, 1)[0];
}

function chooseAxis(rng, bounds) {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (Math.abs(w - h) < 8) return rng() < 0.5 ? "x" : "y";
  return w > h ? "x" : "y";
}

function randomSplit(rng, bounds, axis) {
  if (axis === "x") {
    return lerp(bounds.minX + 6, bounds.maxX - 6, rng());
  }
  return lerp(bounds.minY + 6, bounds.maxY - 6, rng());
}

function splitPolygon(poly, axis, value) {
  const a = clipPoly(poly, axis, value, true);
  const b = clipPoly(poly, axis, value, false);
  if (!a || !b || a.length < 3 || b.length < 3) return null;
  return [a, b];
}

function clipPoly(poly, axis, value, keepLess) {
  const out = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const aIn = inside(a, axis, value, keepLess);
    const bIn = inside(b, axis, value, keepLess);

    if (aIn && bIn) {
      out.push(b);
    } else if (aIn && !bIn) {
      const inter = intersectEdge(a, b, axis, value);
      if (inter) out.push(inter);
    } else if (!aIn && bIn) {
      const inter = intersectEdge(a, b, axis, value);
      if (inter) out.push(inter);
      out.push(b);
    }
  }
  return out.length >= 3 ? out : null;
}

function inside(p, axis, value, keepLess) {
  return keepLess ? (axis === "x" ? p.x <= value : p.y <= value) : (axis === "x" ? p.x >= value : p.y >= value);
}

function intersectEdge(a, b, axis, value) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (axis === "x") {
    if (Math.abs(dx) < 1e-6) return { x: value, y: a.y };
    const t = (value - a.x) / dx;
    return { x: value, y: a.y + dy * t };
  }
  if (Math.abs(dy) < 1e-6) return { x: a.x, y: value };
  const t = (value - a.y) / dy;
  return { x: a.x + dx * t, y: value };
}

function districtForPoint(p, radius) {
  const d = Math.hypot(p.x, p.y);
  if (d < radius * 0.35) return "core";
  if (d < radius * 0.7) return "inner";
  return "outer";
}

function minParcelArea(params, district) {
  const base = params.bMax * params.bMax * 1.5;
  if (district === "core") return base * 0.8;
  if (district === "inner") return base * 1.2;
  return base * 1.6;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
