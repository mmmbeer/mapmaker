import { polyBounds, polyCentroid, rectPoly, pointInPoly, polyArea } from "../geometry.js";
import { SpatialGrid } from "../spatialIndex.js";
import { stableId, rngFor } from "../rng.js";
import { closestEdge } from "./roads.js";

export function generateBuildings(rng, params, parcels, roadDrawData) {
  const buildings = [];
  const grid = new SpatialGrid(Math.max(18, params.bMax));

  for (const parcel of parcels) {
    const prng = rngFor(params.seed, parcel.id, "building");
    const centroid = polyCentroid(parcel.poly);
    const district = parcel.district;
    const frontage = findFrontageEdge(parcel, roadDrawData) || { angle: 0 };
    const angle = frontage.angle;

    const bbox = parcel.bbox || polyBounds(parcel.poly);
    const maxW = Math.max(6, (bbox.maxX - bbox.minX) * 0.75);
    const maxH = Math.max(6, (bbox.maxY - bbox.minY) * 0.75);
    const sizeBase = lerp(params.bMin, params.bMax, prng());
    const scale = districtScale(district);
    let w = Math.min(maxW, sizeBase * scale * lerp(0.8, 1.2, prng()));
    let h = Math.min(maxH, sizeBase * scale * lerp(0.8, 1.3, prng()));

    let footprint = rectPoly(centroid.x, centroid.y, w, h, angle);
    if (!polyInside(footprint, parcel.poly)) {
      w *= 0.82;
      h *= 0.82;
      footprint = rectPoly(centroid.x, centroid.y, w, h, angle);
    }
    if (!polyInside(footprint, parcel.poly)) {
      // Fallback: accept if centroid is inside (keeps some buildings even on jagged parcels)
      if (!pointInPoly(centroid, parcel.poly)) continue;
    }

    const bBounds = polyBounds(footprint);
    const candidates = grid.query(bBounds);
    let overlap = false;
    for (const other of candidates) {
      if (boundsOverlap(bBounds, other.bbox)) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    const idSig = `${Math.round(centroid.x)}:${Math.round(centroid.y)}:${Math.round(w)}:${Math.round(h)}:${district}`;
    const id = stableId("b_", params.seed, idSig);
    const kind = pickKind(prng, district);
    const levels = pickLevels(prng, district, kind);

    const building = {
      id,
      footprint,
      bbox: bBounds,
      style: { fill: buildingFill(prng) },
      meta: { kind, levels, district }
    };
    grid.insert(building, bBounds);
    buildings.push(building);
  }

  return buildings;
}

function findFrontageEdge(parcel, roadDrawData) {
  const poly = parcel.poly;
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hit = closestEdge(mid, roadDrawData);
    if (!hit) continue;
    if (!best || hit.dist < best.dist) {
      best = { dist: hit.dist, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }
  return best;
}

function polyInside(poly, container) {
  for (const p of poly) {
    if (!pointInPoly(p, container)) return false;
  }
  return true;
}

function boundsOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function districtScale(district) {
  if (district === "core") return 0.8;
  if (district === "inner") return 1.0;
  return 1.25;
}

function pickKind(rng, district) {
  if (district === "core") return rng() < 0.18 ? "civic" : (rng() < 0.45 ? "shop" : "home");
  if (district === "inner") return rng() < 0.1 ? "civic" : (rng() < 0.35 ? "shop" : "home");
  return rng() < 0.08 ? "shop" : "home";
}

function pickLevels(rng, district, kind) {
  let base = 1;
  if (district === "core") base += rng() < 0.6 ? 1 : 0;
  if (kind === "civic") base += rng() < 0.6 ? 1 : 0;
  return base + (rng() < 0.1 ? 1 : 0);
}

function buildingFill(rng) {
  const palette = ["#6c4a3a", "#715243", "#5d3f33", "#7a5a47", "#4f3a32", "#8a6a53", "#9aa3ab"];
  return palette[Math.floor(rng() * palette.length)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
