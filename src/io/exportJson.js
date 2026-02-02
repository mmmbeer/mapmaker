import { SCENE_VERSION, createScene } from "../state.js";
import { polyBounds } from "../geometry.js";
import { roadsToDrawData } from "../generate/roads.js";

export function exportSceneToJson(scene) {
  const payload = {
    version: SCENE_VERSION,
    params: scene.params,
    ui: scene.ui,
    roads: { graph: scene.layers.roads.graph },
    blocks: scene.layers.blocks.items,
    parcels: scene.layers.parcels.items,
    buildings: scene.layers.buildings.items.map((b) => ({
      id: b.id,
      footprint: b.footprint,
      bbox: b.bbox,
      style: b.style,
      meta: b.meta
    })),
    decor: scene.layers.decor,
    selection: scene.selection
  };
  return JSON.stringify(payload, null, 2);
}

export function importSceneFromJson(jsonText) {
  const raw = JSON.parse(jsonText);
  if (!raw || typeof raw !== "object") throw new Error("Invalid JSON");
  const version = raw.version || 1;
  if (version > SCENE_VERSION) throw new Error("Unsupported scene version");
  if (version < SCENE_VERSION) return migrateScene(raw, version);

  const scene = createScene(raw.params);
  scene.ui = raw.ui || scene.ui;
  scene.layers.roads = raw.roads || { graph: null, polylines: [] };
  if (scene.layers.roads.graph && (!scene.layers.roads.polylines || !scene.layers.roads.polylines.length)) {
    scene.layers.roads.polylines = roadsToDrawData(scene.layers.roads.graph);
  }
  scene.layers.blocks = { items: raw.blocks || [] };
  scene.layers.parcels = { items: raw.parcels || [] };
  scene.layers.buildings = {
    items: (raw.buildings || []).map((b) => ({
      id: b.id,
      footprint: b.footprint,
      bbox: b.bbox || polyBounds(b.footprint),
      style: b.style,
      meta: b.meta
    }))
  };
  scene.layers.decor = raw.decor || { fields: [], trees: [], water: null, townBoundary: null };
  scene.selection = normalizeSelection(raw.selection);
  return scene;
}

function migrateScene(raw, version) {
  if (version !== 1 && version !== 2) throw new Error("Unsupported legacy version");
  if (version === 2) {
    const scene = createScene(raw.params || {});
    scene.ui = raw.ui || scene.ui;
    scene.layers.roads = raw.roads || { graph: null, polylines: [] };
    if (scene.layers.roads.graph && (!scene.layers.roads.polylines || !scene.layers.roads.polylines.length)) {
      scene.layers.roads.polylines = roadsToDrawData(scene.layers.roads.graph);
    }
    scene.layers.blocks = { items: raw.blocks || [] };
    scene.layers.parcels = { items: raw.parcels || [] };
    scene.layers.buildings = {
      items: (raw.buildings || []).map((b) => ({
        id: b.id,
        footprint: b.footprint,
        bbox: b.bbox || polyBounds(b.footprint),
        style: b.style,
        meta: b.meta
      }))
    };
    scene.layers.decor = raw.decor || { fields: [], trees: [], water: null, townBoundary: null };
    scene.selection = normalizeSelection(raw.selection);
    scene.version = SCENE_VERSION;
    return scene;
  }

  const scene = createScene(raw.params || {});
  scene.ui = raw.ui || scene.ui;
  scene.layers.decor = raw.decor || { fields: [], trees: [], water: null, townBoundary: null };
  scene.layers.roads = {
    graph: null,
    polylines: (raw.roads || []).map((r) => ({
      kind: r.kind || "legacy",
      width: r.width || 6,
      points: r.points
    }))
  };
  scene.layers.blocks = { items: [] };
  scene.layers.parcels = { items: [] };
  scene.layers.buildings = {
    items: (raw.buildings || []).map((b) => ({
      id: b.id,
      footprint: b.poly || b.footprint,
      bbox: b.bbox || polyBounds(b.poly || b.footprint),
      style: { fill: b.color || (b.style && b.style.fill) || "#6c4a3a" },
      meta: b.meta || { kind: "home", levels: 1 }
    }))
  };
  scene.selection = normalizeSelection(raw.selection);
  scene.version = SCENE_VERSION;
  return scene;
}

function normalizeSelection(selection) {
  if (selection && Array.isArray(selection.buildingIds)) {
    return { buildingIds: selection.buildingIds.slice() };
  }
  if (selection && selection.buildingId) {
    return { buildingIds: [selection.buildingId] };
  }
  return { buildingIds: [] };
}
