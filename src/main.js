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
  selection: document.getElementById("selection"),
  buildingCount: document.getElementById("buildingCount"),
  randomizeSelected: document.getElementById("randomizeSelected"),
  deleteSelected: document.getElementById("deleteSelected"),
  showBlocks: document.getElementById("showBlocks"),
  showParcels: document.getElementById("showParcels")
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
  scene.selection.buildingId = null;

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
  view.reset(rect.width, rect.height);
  draw();
}

function updateSelectionPanel() {
  const b = scene?.layers?.buildings?.items?.find((x) => x.id === scene.selection.buildingId);
  const has = !!b;
  el.randomizeSelected.disabled = !has;
  el.deleteSelected.disabled = !has;

  if (!scene) {
    el.selection.textContent = "No town yet.";
    el.selection.classList.add("muted");
    return;
  }
  if (!b) {
    el.selection.textContent = "Click a building...";
    el.selection.classList.add("muted");
    return;
  }
  el.selection.classList.remove("muted");
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
}

function updateCounts() {
  el.buildingCount.textContent = String(scene?.layers?.buildings?.items?.length || 0);
}

function onCanvasClick(e) {
  if (!scene) return;
  const rect = canvas.getBoundingClientRect();
  const p = view.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const hit = hitTestBuildings(scene, ctx, p);
  scene.selection.buildingId = hit ? hit.id : null;
  updateSelectionPanel();
  draw();
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
      scene = importSceneFromJson(reader.result);
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
  view.reset(rect.width, rect.height);
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
  const b = scene.layers.buildings.items.find((x) => x.id === scene.selection.buildingId);
  if (!b) return;
  const rng = makeRng(`${scene.params.seed}::color::${b.id}::${Date.now()}`);
  b.style.fill = buildingFill(rng);
  draw();
  updateSelectionPanel();
});

el.deleteSelected.addEventListener("click", () => {
  const id = scene.selection.buildingId;
  if (!id) return;
  scene.layers.buildings.items = scene.layers.buildings.items.filter((b) => b.id !== id);
  scene.selection.buildingId = null;
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

canvas.addEventListener("click", onCanvasClick);
window.addEventListener("resize", resizeCanvas);

function buildingFill(rng) {
  const palette = ["#6c4a3a", "#715243", "#5d3f33", "#7a5a47", "#4f3a32", "#8a6a53", "#9aa3ab"];
  return palette[Math.floor(rng() * palette.length)];
}

// Boot
resizeCanvas();
if (!el.seed.value) {
  const defaults = defaultParams();
  el.seed.value = defaults.seed;
}
regenerate();
