import { createScene, defaultParams } from "./state.js";
import { createView } from "./view.js";
import { generateTown } from "./generate/generateTown.js";
import { render } from "./render/renderer.js";
import { ensureBuildingPaths, hitTestBuildings } from "./render/hitTest.js";
import { exportSceneToJson } from "./io/exportJson.js";
import { importSceneFromJson } from "./io/importJson.js";
import { exportCanvasToPng } from "./io/exportPng.js";
import { makeRng } from "./rng.js";
import { polyBounds } from "./geometry.js";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const view = createView();

let scene = null;
const debug = { showBlocks: false, showParcels: false };

const el = {
  seed: document.getElementById("seed"),
  townRadius: document.getElementById("townRadius"),
  townRadiusVal: document.getElementById("townRadiusVal"),
  mainRoads: document.getElementById("mainRoads"),
  mainRoadsVal: document.getElementById("mainRoadsVal"),
  ringRoads: document.getElementById("ringRoads"),
  ringRoadsVal: document.getElementById("ringRoadsVal"),
  density: document.getElementById("density"),
  densityVal: document.getElementById("densityVal"),
  bMin: document.getElementById("bMin"),
  bMax: document.getElementById("bMax"),
  roadWidth: document.getElementById("roadWidth"),
  roadWidthVal: document.getElementById("roadWidthVal"),
  regen: document.getElementById("regen"),
  resetView: document.getElementById("resetView"),
  exportJson: document.getElementById("exportJson"),
  importJson: document.getElementById("importJson"),
  importFile: document.getElementById("importFile"),
  exportPng: document.getElementById("exportPng"),
  importWarning: document.getElementById("importWarning"),
  selection: document.getElementById("selection"),
  selectionEditor: document.getElementById("selectionEditor"),
  selectionKind: document.getElementById("selectionKind"),
  selectionLevels: document.getElementById("selectionLevels"),
  selectionFill: document.getElementById("selectionFill"),
  buildingCount: document.getElementById("buildingCount"),
  randomizeSelected: document.getElementById("randomizeSelected"),
  deleteSelected: document.getElementById("deleteSelected"),
  showBlocks: document.getElementById("showBlocks"),
  showParcels: document.getElementById("showParcels"),
  layerRoads: document.getElementById("layerRoads"),
  layerTrees: document.getElementById("layerTrees"),
  layerFields: document.getElementById("layerFields"),
  layerBuildings: document.getElementById("layerBuildings")
};

function syncLabels() {
  el.townRadiusVal.textContent = el.townRadius.value;
  el.mainRoadsVal.textContent = el.mainRoads.value;
  el.ringRoadsVal.textContent = el.ringRoads.value;
  el.densityVal.textContent = Number(el.density.value).toFixed(2);
  el.roadWidthVal.textContent = el.roadWidth.value;
}

function readParams() {
  const seed = (el.seed.value || "seed").trim();
  const townRadius = Number(el.townRadius.value);
  const mainRoads = Number(el.mainRoads.value);
  const ringRoads = Number(el.ringRoads.value);
  const density = Number(el.density.value);
  const bMin = clamp(Number(el.bMin.value), 6, 100);
  const bMax = clamp(Number(el.bMax.value), bMin + 1, 200);
  const roadWidth = Number(el.roadWidth.value);
  return { seed, townRadius, mainRoads, ringRoads, density, bMin, bMax, roadWidth };
}

function regenerate() {
  const params = readParams();
  scene = createScene(params);
  scene.selection.buildingIds = [];
  applyLayerVisibilityFromUi(scene);
  showImportWarning("");

  const rect = canvas.getBoundingClientRect();
  generateTown(scene, { width: rect.width, height: rect.height });
  ensureBuildingPaths(scene);
  updateSelectionPanel();
  updateCounts();
  draw();
}

function draw() {
  render(scene, ctx, view, debug);
}

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.cx = rect.width / 2;
  view.cy = rect.height / 2;
  draw();
}

function updateSelectionPanel() {
  const ids = scene?.selection?.buildingIds || [];
  const single = ids.length === 1;
  const b = single ? scene?.layers?.buildings?.items?.find((x) => x.id === ids[0]) : null;
  el.randomizeSelected.disabled = !single;
  el.deleteSelected.disabled = ids.length === 0;
  if (el.selectionEditor) el.selectionEditor.style.display = single ? "grid" : "none";

  if (!scene) {
    el.selection.textContent = "No town yet.";
    el.selection.classList.add("muted");
    return;
  }
  if (!b && ids.length !== 1) {
    el.selection.textContent = ids.length > 1 ? `Multiple selected (${ids.length})` : "Click a building...";
    el.selection.classList.add("muted");
    return;
  }
  el.selection.classList.remove("muted");
  if (!b) return;
  const bb = polyBounds(b.footprint);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  el.selection.textContent =
    `id: ${b.id}\n` +
    `kind: ${b.meta.kind}\n` +
    `levels: ${b.meta.levels}\n` +
    `district: ${b.meta.district}\n` +
    `color: ${b.style.fill}\n` +
    `center: (${cx.toFixed(1)}, ${cy.toFixed(1)})`;
  if (el.selectionKind) el.selectionKind.value = b.meta.kind || "home";
  if (el.selectionLevels) el.selectionLevels.value = String(b.meta.levels || 1);
  if (el.selectionFill) el.selectionFill.value = b.style.fill || "#6c4a3a";
}

function updateCounts() {
  el.buildingCount.textContent = String(scene?.layers?.buildings?.items?.length || 0);
}

function downloadJson() {
  if (!scene) return;
  const json = exportSceneToJson(scene);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, `town_${safeName(scene.params.seed)}.json`);
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const uiParams = readParams();
      scene = importSceneFromJson(reader.result);
      applyParamsToUi(scene.params);
      syncLabels();
      applyLayerVisibilityToUi(scene);
      if (!paramsEqual(uiParams, scene.params)) {
        showImportWarning("Loaded scene params differ from current UI. UI has been updated.");
      } else {
        showImportWarning("");
      }
      ensureBuildingPaths(scene);
      updateSelectionPanel();
      updateCounts();
      draw();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function downloadPng() {
  if (!scene) return;
  exportCanvasToPng(canvas, `town_${safeName(scene.params.seed)}.png`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function safeName(s) {
  return String(s || "seed").trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "_").slice(0, 40) || "seed";
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// UI wiring
syncLabels();
["input", "change"].forEach((evt) => {
  el.townRadius.addEventListener(evt, syncLabels);
  el.mainRoads.addEventListener(evt, syncLabels);
  el.ringRoads.addEventListener(evt, syncLabels);
  el.density.addEventListener(evt, syncLabels);
  el.roadWidth.addEventListener(evt, syncLabels);
});

el.regen.addEventListener("click", regenerate);
el.resetView.addEventListener("click", () => {
  const rect = canvas.getBoundingClientRect();
  const R = scene?.params?.townRadius || 400;
  view.resetToFit({ minX: -R, minY: -R, maxX: R, maxY: R }, rect.width, rect.height, 40);
  draw();
});

el.exportJson.addEventListener("click", downloadJson);
el.exportPng.addEventListener("click", downloadPng);

el.importJson.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleImportFile(file);
  e.target.value = "";
});

el.randomizeSelected.addEventListener("click", () => {
  const b = getSelectedBuilding();
  if (!b) return;
  const rng = makeRng(`${scene.params.seed}::color::${b.id}::${Date.now()}`);
  b.style.fill = buildingFill(rng);
  draw();
  updateSelectionPanel();
});

el.deleteSelected.addEventListener("click", () => {
  const ids = scene.selection.buildingIds || [];
  if (!ids.length) return;
  scene.layers.buildings.items = scene.layers.buildings.items.filter((b) => !ids.includes(b.id));
  scene.selection.buildingIds = [];
  updateSelectionPanel();
  updateCounts();
  draw();
});

if (el.showBlocks) {
  el.showBlocks.addEventListener("change", (e) => {
    debug.showBlocks = e.target.checked;
    draw();
  });
}
if (el.showParcels) {
  el.showParcels.addEventListener("change", (e) => {
    debug.showParcels = e.target.checked;
    draw();
  });
}
if (el.layerRoads) el.layerRoads.addEventListener("change", onLayerToggle);
if (el.layerTrees) el.layerTrees.addEventListener("change", onLayerToggle);
if (el.layerFields) el.layerFields.addEventListener("change", onLayerToggle);
if (el.layerBuildings) el.layerBuildings.addEventListener("change", onLayerToggle);

if (el.selectionKind) el.selectionKind.addEventListener("change", onSelectionEdit);
if (el.selectionLevels) el.selectionLevels.addEventListener("change", onSelectionEdit);
if (el.selectionFill) el.selectionFill.addEventListener("change", onSelectionEdit);

canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
canvas.addEventListener("mousedown", onCanvasMouseDown);
window.addEventListener("mousemove", onCanvasMouseMove);
window.addEventListener("mouseup", onCanvasMouseUp);
window.addEventListener("resize", resizeCanvas);

function buildingFill(rng) {
  const palette = ["#6c4a3a", "#715243", "#5d3f33", "#7a5a47", "#4f3a32", "#8a6a53", "#9aa3ab"];
  return palette[Math.floor(rng() * palette.length)];
}

let isSpaceDown = false;
const drag = {
  active: false,
  mode: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !isTypingTarget()) {
    isSpaceDown = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    isSpaceDown = false;
  }
});

function onCanvasWheel(e) {
  if (!scene) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const zoomFactor = Math.exp(-e.deltaY * 0.0015);
  view.zoomAtScreenPoint(screenPt, zoomFactor);
  draw();
}

function onCanvasMouseDown(e) {
  if (!scene) return;
  if (e.button === 1 || (e.button === 0 && isSpaceDown)) {
    drag.active = true;
    drag.mode = "pan";
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.moved = false;
    e.preventDefault();
    return;
  }
  if (e.button === 0) {
    drag.active = true;
    drag.mode = "select";
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.moved = false;
  }
}

function onCanvasMouseMove(e) {
  if (!drag.active) return;
  const dx = e.clientX - drag.lastX;
  const dy = e.clientY - drag.lastY;
  if (drag.mode === "pan") {
    view.panByScreenDelta(dx, dy);
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.moved = true;
    draw();
    return;
  }
  const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
  if (dist > 4) drag.moved = true;
}

function onCanvasMouseUp(e) {
  if (!drag.active) return;
  const wasSelect = drag.mode === "select";
  const wasClick = wasSelect && !drag.moved;
  drag.active = false;
  drag.mode = null;
  if (!wasClick || e.button !== 0) return;
  handleSelectionClick(e);
}

function handleSelectionClick(e) {
  if (!scene) return;
  if (scene.ui?.layerVisibility?.buildings === false) {
    clearSelection();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const p = view.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  const hit = hitTestBuildings(scene, ctx, p);
  if (!hit) {
    clearSelection();
    return;
  }
  if (e.shiftKey) toggleSelection(hit.id);
  else scene.selection.buildingIds = [hit.id];
  updateSelectionPanel();
  draw();
}

function clearSelection() {
  scene.selection.buildingIds = [];
  updateSelectionPanel();
  draw();
}

function toggleSelection(id) {
  const ids = scene.selection.buildingIds || [];
  const idx = ids.indexOf(id);
  if (idx >= 0) ids.splice(idx, 1);
  else ids.push(id);
  scene.selection.buildingIds = ids;
}

function getSelectedBuilding() {
  const ids = scene?.selection?.buildingIds || [];
  if (ids.length !== 1) return null;
  return scene.layers.buildings.items.find((x) => x.id === ids[0]) || null;
}

function onSelectionEdit() {
  const b = getSelectedBuilding();
  if (!b) return;
  if (el.selectionKind) b.meta.kind = el.selectionKind.value;
  if (el.selectionLevels) b.meta.levels = clampInt(Number(el.selectionLevels.value), 1, 10);
  if (el.selectionFill) b.style.fill = el.selectionFill.value;
  updateSelectionPanel();
  draw();
}

function onLayerToggle() {
  if (!scene) return;
  applyLayerVisibilityFromUi(scene);
  draw();
}

function applyLayerVisibilityFromUi(targetScene) {
  if (!targetScene.ui) targetScene.ui = {};
  targetScene.ui.layerVisibility = {
    roads: el.layerRoads ? !!el.layerRoads.checked : true,
    trees: el.layerTrees ? !!el.layerTrees.checked : true,
    fields: el.layerFields ? !!el.layerFields.checked : true,
    buildings: el.layerBuildings ? !!el.layerBuildings.checked : true
  };
}

function applyLayerVisibilityToUi(targetScene) {
  const vis = targetScene.ui?.layerVisibility;
  if (!vis) return;
  if (el.layerRoads) el.layerRoads.checked = vis.roads !== false;
  if (el.layerTrees) el.layerTrees.checked = vis.trees !== false;
  if (el.layerFields) el.layerFields.checked = vis.fields !== false;
  if (el.layerBuildings) el.layerBuildings.checked = vis.buildings !== false;
}

function showImportWarning(message) {
  if (!el.importWarning) return;
  if (!message) {
    el.importWarning.textContent = "";
    el.importWarning.style.display = "none";
    return;
  }
  el.importWarning.textContent = message;
  el.importWarning.style.display = "block";
}

function applyParamsToUi(params) {
  if (!params) return;
  el.seed.value = params.seed ?? el.seed.value;
  el.townRadius.value = params.townRadius ?? el.townRadius.value;
  el.mainRoads.value = params.mainRoads ?? el.mainRoads.value;
  el.ringRoads.value = params.ringRoads ?? el.ringRoads.value;
  el.density.value = params.density ?? el.density.value;
  el.bMin.value = params.bMin ?? el.bMin.value;
  el.bMax.value = params.bMax ?? el.bMax.value;
  el.roadWidth.value = params.roadWidth ?? el.roadWidth.value;
}

function paramsEqual(a, b) {
  if (!a || !b) return false;
  return (
    String(a.seed || "") === String(b.seed || "") &&
    Number(a.townRadius) === Number(b.townRadius) &&
    Number(a.mainRoads) === Number(b.mainRoads) &&
    Number(a.ringRoads) === Number(b.ringRoads) &&
    Number(a.density) === Number(b.density) &&
    Number(a.bMin) === Number(b.bMin) &&
    Number(a.bMax) === Number(b.bMax) &&
    Number(a.roadWidth) === Number(b.roadWidth)
  );
}

function clampInt(v, a, b) {
  return Math.max(a, Math.min(b, Math.round(v || a)));
}

function isTypingTarget() {
  const elActive = document.activeElement;
  if (!elActive) return false;
  const tag = elActive.tagName;
  if (!tag) return false;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || elActive.isContentEditable;
}

// Boot
resizeCanvas();
if (!el.seed.value) {
  const defaults = defaultParams();
  el.seed.value = defaults.seed;
}
regenerate();
