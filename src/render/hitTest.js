export function ensureBuildingPaths(scene) {
  if (!scene?.layers?.buildings) return;
  for (const b of scene.layers.buildings.items) {
    if (!b.path) b.path = polyToPath2D(b.footprint);
  }
}

export function hitTestBuildings(scene, ctx, point) {
  const buildings = scene.layers.buildings.items;
  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i];
    if (b.bbox && !pointInBounds(point, b.bbox)) continue;
    if (ctx.isPointInPath(b.path, point.x, point.y)) return b;
  }
  return null;
}

function pointInBounds(p, b) {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function polyToPath2D(poly) {
  const path = new Path2D();
  if (!poly.length) return path;
  path.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
  path.closePath();
  return path;
}
