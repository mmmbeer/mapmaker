import { styles } from "./styles.js";

export function render(scene, ctx, view, debug) {
  const rect = ctx.canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(view.cx, view.cy);
  ctx.scale(view.scale, view.scale);

  if (!scene || !scene.params) {
    drawEmpty(ctx);
    ctx.restore();
    return;
  }

  const visibility = scene.ui?.layerVisibility || {};

  if (visibility.fields !== false) drawFields(ctx, scene.layers.decor.fields);
  drawWater(ctx, scene.layers.decor.water);
  drawTownHalo(ctx, scene.params.townRadius);
  if (visibility.trees !== false) drawTrees(ctx, scene.layers.decor.trees);

  if (visibility.roads !== false) drawRoads(ctx, scene);

  if (debug?.showBlocks) drawPolys(ctx, scene.layers.blocks.items, styles.debug.blocks);
  if (debug?.showParcels) drawPolys(ctx, scene.layers.parcels.items, styles.debug.parcels);

  if (visibility.buildings !== false) {
    drawBuildings(ctx, scene.layers.buildings.items, scene.selection.buildingIds);
  }

  ctx.restore();
}

function drawEmpty(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "14px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Click Regenerate to create a town", 0, 0);
  ctx.restore();
}

function drawFields(ctx, fields) {
  for (const f of fields) {
    ctx.save();
    drawPath(ctx, f.poly);
    if (f.tone === "light") ctx.fillStyle = styles.terrain.fieldLight;
    else if (f.tone === "mid") ctx.fillStyle = styles.terrain.fieldMid;
    else ctx.fillStyle = styles.terrain.fieldDark;
    ctx.fill();
    ctx.strokeStyle = styles.debug.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawWater(ctx, water) {
  if (!water) return;
  ctx.save();
  ctx.translate(water.cx, water.cy);
  ctx.rotate(water.rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, water.rx, water.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = styles.terrain.waterFill;
  ctx.fill();
  ctx.strokeStyle = styles.terrain.waterStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawTownHalo(ctx, R) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = styles.terrain.haloFill;
  ctx.fill();
  ctx.restore();
}

function drawTrees(ctx, trees) {
  ctx.save();
  ctx.fillStyle = styles.terrain.treeFill;
  for (const t of trees) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRoads(ctx, scene) {
  const R = scene.params.townRadius;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.98, 0, Math.PI * 2);
  ctx.fillStyle = styles.terrain.coreFill;
  ctx.fill();
  ctx.restore();

  for (const road of scene.layers.roads.polylines) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(road.points[0].x, road.points[0].y);
    for (let i = 1; i < road.points.length; i++) {
      ctx.lineTo(road.points[i].x, road.points[i].y);
    }
    ctx.strokeStyle = styles.roads.fill;
    ctx.lineWidth = road.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.strokeStyle = styles.roads.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function drawBuildings(ctx, buildings, selectedIds) {
  const selected = new Set(selectedIds || []);
  for (const b of buildings) {
    ctx.save();
    ctx.fillStyle = b.style.fill;
    ctx.strokeStyle = styles.buildings.stroke;
    ctx.lineWidth = 1;
    ctx.fill(b.path);
    ctx.stroke(b.path);

    if (selected.has(b.id)) {
      ctx.strokeStyle = styles.buildings.selection;
      ctx.lineWidth = 2.5;
      ctx.stroke(b.path);
      ctx.strokeStyle = styles.buildings.selectionInner;
      ctx.lineWidth = 1;
      ctx.stroke(b.path);
    }
    ctx.restore();
  }
}

function drawPolys(ctx, items, fillStyle) {
  for (const item of items) {
    ctx.save();
    drawPath(ctx, item.poly);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = styles.debug.outline;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawPath(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}
