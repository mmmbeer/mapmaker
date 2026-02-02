/*
Raster block extraction method:
1) Draw all roads to an offscreen mask canvas with inflated widths.
2) Threshold the mask into a binary road/non-road grid.
3) Flood-fill connected components on the non-road region inside the town boundary.
4) Trace each component boundary with a marching-squares contour,
   simplify with RDP, and convert to world coordinates.
This favors deterministic, stable blocks over perfect geometry.
*/
import { polyArea, polyBounds, polyCentroid, polySimplifyRDP } from "../geometry.js";
import { stableId } from "../rng.js";

export function generateBlocks(rng, params, roadDrawData, canvasSize) {
  const w = Math.max(1, Math.floor(canvasSize.width));
  const h = Math.max(1, Math.floor(canvasSize.height));
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const ctx = mask.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.strokeStyle = "white";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const road of roadDrawData) {
    const margin = 6;
    ctx.lineWidth = road.width + margin;
    ctx.beginPath();
    ctx.moveTo(road.points[0].x, road.points[0].y);
    for (let i = 1; i < road.points.length; i++) {
      ctx.lineTo(road.points[i].x, road.points[i].y);
    }
    ctx.stroke();
  }
  ctx.restore();

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const road = new Uint8Array(w * h);
  for (let i = 0; i < road.length; i++) {
    road[i] = data[i * 4] > 10 ? 1 : 0;
  }

  const labels = new Int32Array(w * h);
  const components = [];
  const R = params.townRadius;
  const R2 = (R * 1.02) * (R * 1.02);

  let compId = 0;
  const queue = new Int32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (road[idx] || labels[idx]) continue;
      const wx = x - w / 2;
      const wy = y - h / 2;
      if (wx * wx + wy * wy > R2) continue;

      compId++;
      let head = 0;
      let tail = 0;
      queue[tail++] = idx;
      labels[idx] = compId;
      let area = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      let touchesEdge = false;

      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % w;
        const cy = (cur / w) | 0;
        area++;
        if (cx <= 1 || cy <= 1 || cx >= w - 2 || cy >= h - 2) touchesEdge = true;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const [ox, oy] of NEIGHBORS) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
          const nidx = ny * w + nx;
          if (road[nidx] || labels[nidx]) continue;
          const wx2 = nx - w / 2;
          const wy2 = ny - h / 2;
          if (wx2 * wx2 + wy2 * wy2 > R2) continue;
          labels[nidx] = compId;
          queue[tail++] = nidx;
        }
      }

      components.push({ id: compId, area, minX, maxX, minY, maxY, touchesEdge });
    }
  }

  const blocks = [];
  const minArea = 140;
  for (const comp of components) {
    if (comp.touchesEdge) continue;
    if (comp.area < minArea) continue;

    const contour = traceContour(labels, w, h, comp);
    if (!contour || contour.length < 4) continue;

    const worldPoly = contour.map((p) => ({
      x: p.x - w / 2,
      y: p.y - h / 2
    }));

    const simplified = polySimplifyRDP(worldPoly, 2);
    if (simplified.length < 4) continue;

    const area = Math.abs(polyArea(simplified));
    if (area < minArea) continue;
    const centroid = polyCentroid(simplified);
    if (centroid.x * centroid.x + centroid.y * centroid.y > R * R) continue;

    const id = stableId("block_", params.seed, `${Math.round(centroid.x)}:${Math.round(centroid.y)}:${Math.round(area)}`);
    blocks.push({ id, poly: simplified, area, bbox: polyBounds(simplified) });
  }

  if (!blocks.length) {
    const fallback = circlePoly(params.townRadius * 0.92, 48);
    const area = Math.abs(polyArea(fallback));
    const id = stableId("block_", params.seed, `fallback:${Math.round(area)}`);
    blocks.push({ id, poly: fallback, area, bbox: polyBounds(fallback) });
  }

  return blocks;
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1]
];

function traceContour(labels, w, h, comp) {
  const segments = [];
  const { minX, maxX, minY, maxY, id } = comp;
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const v0 = labels[y * w + x] === id ? 1 : 0;
      const v1 = labels[y * w + (x + 1)] === id ? 1 : 0;
      const v2 = labels[(y + 1) * w + (x + 1)] === id ? 1 : 0;
      const v3 = labels[(y + 1) * w + x] === id ? 1 : 0;
      const idx = v0 | (v1 << 1) | (v2 << 2) | (v3 << 3);
      if (idx === 0 || idx === 15) continue;
      const e0 = { x: x + 0.5, y };
      const e1 = { x: x + 1, y: y + 0.5 };
      const e2 = { x: x + 0.5, y: y + 1 };
      const e3 = { x, y: y + 0.5 };
      switch (idx) {
        case 1:
          segments.push([e3, e0]);
          break;
        case 2:
          segments.push([e0, e1]);
          break;
        case 3:
          segments.push([e3, e1]);
          break;
        case 4:
          segments.push([e1, e2]);
          break;
        case 5:
          segments.push([e3, e0]);
          segments.push([e1, e2]);
          break;
        case 6:
          segments.push([e0, e2]);
          break;
        case 7:
          segments.push([e3, e2]);
          break;
        case 8:
          segments.push([e2, e3]);
          break;
        case 9:
          segments.push([e0, e2]);
          break;
        case 10:
          segments.push([e0, e1]);
          segments.push([e2, e3]);
          break;
        case 11:
          segments.push([e1, e2]);
          break;
        case 12:
          segments.push([e1, e3]);
          break;
        case 13:
          segments.push([e0, e1]);
          break;
        case 14:
          segments.push([e0, e3]);
          break;
        default:
          break;
      }
    }
  }

  if (!segments.length) return null;
  const pointMap = new Map();
  const key = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  for (const seg of segments) {
    const k0 = key(seg[0]);
    const k1 = key(seg[1]);
    if (!pointMap.has(k0)) pointMap.set(k0, []);
    if (!pointMap.has(k1)) pointMap.set(k1, []);
    pointMap.get(k0).push(seg[1]);
    pointMap.get(k1).push(seg[0]);
  }

  const startKey = pointMap.keys().next().value;
  if (!startKey) return null;
  const startParts = startKey.split(",");
  let current = { x: parseFloat(startParts[0]), y: parseFloat(startParts[1]) };
  const contour = [current];
  let prevKey = null;

  for (let i = 0; i < segments.length * 2; i++) {
    const neighbors = pointMap.get(key(current));
    if (!neighbors || neighbors.length === 0) break;
    let next = neighbors[0];
    if (neighbors.length > 1 && prevKey) {
      const cand = neighbors.find((p) => key(p) !== prevKey);
      if (cand) next = cand;
    }
    prevKey = key(current);
    current = next;
    if (key(current) === startKey) break;
    contour.push(current);
  }

  return contour.length >= 4 ? contour : null;
}

function circlePoly(r, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
  }
  return pts;
}
