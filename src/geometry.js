export function polyArea(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x * poly[i].y) - (poly[i].x * poly[j].y);
  }
  return area / 2;
}

export function polyCentroid(poly) {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = (poly[j].x * poly[i].y) - (poly[i].x * poly[j].y);
    area += cross;
    cx += (poly[j].x + poly[i].x) * cross;
    cy += (poly[j].y + poly[i].y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6) {
    const b = polyBounds(poly);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  const f = 1 / (6 * area);
  return { x: cx * f, y: cy * f };
}

export function polyBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polySimplifyRDP(poly, eps) {
  if (poly.length <= 3) return poly.slice();
  const keep = new Array(poly.length).fill(false);
  keep[0] = true;
  keep[poly.length - 1] = true;
  simplifySection(poly, 0, poly.length - 1, eps * eps, keep);
  const out = [];
  for (let i = 0; i < poly.length; i++) if (keep[i]) out.push(poly[i]);
  return out;
}

function simplifySection(pts, a, b, epsSq, keep) {
  let maxDist = 0;
  let index = -1;
  const ax = pts[a].x;
  const ay = pts[a].y;
  const bx = pts[b].x;
  const by = pts[b].y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  for (let i = a + 1; i < b; i++) {
    const px = pts[i].x;
    const py = pts[i].y;
    let t = 0;
    if (lenSq > 1e-9) t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const ix = ax + dx * t;
    const iy = ay + dy * t;
    const ddx = px - ix;
    const ddy = py - iy;
    const dist = ddx * ddx + ddy * ddy;
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > epsSq && index !== -1) {
    keep[index] = true;
    simplifySection(pts, a, index, epsSq, keep);
    simplifySection(pts, index, b, epsSq, keep);
  }
}

export function segmentIntersect(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  if (Math.abs(denom) < 1e-9) return null;
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a.x + t * r.x, y: a.y + t * r.y, t, u };
  }
  return null;
}

export function rotatePoint(p, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function rectPoly(cx, cy, w, h, rot) {
  const hw = w / 2;
  const hh = h / 2;
  const pts = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ];
  return pts.map((p) => {
    const rp = rotatePoint(p, rot);
    return { x: cx + rp.x, y: cy + rp.y };
  });
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
