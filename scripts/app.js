(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  // ----------------------------
  // Utilities: seeded RNG
  // ----------------------------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seedStr) {
    const seed = xmur3(seedStr)();
    return mulberry32(seed);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ----------------------------
  // View transform (simple pan/zoom ready, default fixed)
  // ----------------------------
  const view = {
    cx: 0,
    cy: 0,
    scale: 1,
    reset(w, h) {
      this.cx = w / 2;
      this.cy = h / 2;
      this.scale = 1;
    }
  };

  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    view.reset(rect.width, rect.height);
    draw();
  }

  window.addEventListener("resize", resizeCanvas);

  // ----------------------------
  // Data model
  // ----------------------------
  let state = {
    params: null,
    roads: [],        // { kind, points:[{x,y}], width }
    rings: [],        // { r, width }
    buildings: [],    // { id, poly:[{x,y}], angle, color, meta:{...}, path:Path2D }
    decor: {
      fields: [],     // polygons
      trees: [],      // points
      water: null     // ellipse-like
    },
    selectedId: null
  };

  // ----------------------------
  // UI bindings
  // ----------------------------
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
    exportPng: document.getElementById("exportPng"),
    selection: document.getElementById("selection"),
    buildingCount: document.getElementById("buildingCount"),
    randomizeSelected: document.getElementById("randomizeSelected"),
    deleteSelected: document.getElementById("deleteSelected"),
  };

  function syncLabels() {
    el.townRadiusVal.textContent = el.townRadius.value;
    el.mainRoadsVal.textContent = el.mainRoads.value;
    el.ringRoadsVal.textContent = el.ringRoads.value;
    el.densityVal.textContent = Number(el.density.value).toFixed(2);
    el.roadWidthVal.textContent = el.roadWidth.value;
  }

  ["input", "change"].forEach(evt => {
    el.townRadius.addEventListener(evt, syncLabels);
    el.mainRoads.addEventListener(evt, syncLabels);
    el.ringRoads.addEventListener(evt, syncLabels);
    el.density.addEventListener(evt, syncLabels);
    el.roadWidth.addEventListener(evt, syncLabels);
  });

  el.regen.addEventListener("click", () => {
    generateFromUi();
  });

  el.resetView.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    view.reset(rect.width, rect.height);
    draw();
  });

  el.exportJson.addEventListener("click", () => downloadJson());
  el.exportPng.addEventListener("click", () => downloadPng());

  el.randomizeSelected.addEventListener("click", () => {
    const b = state.buildings.find(x => x.id === state.selectedId);
    if (!b) return;
    const rng = makeRng(state.params.seed + "::color::" + b.id + "::" + Date.now());
    b.color = buildingFill(rng);
    draw();
    updateSelectionPanel();
  });

  el.deleteSelected.addEventListener("click", () => {
    const id = state.selectedId;
    if (!id) return;
    state.buildings = state.buildings.filter(b => b.id !== id);
    state.selectedId = null;
    draw();
    updateSelectionPanel();
    el.buildingCount.textContent = String(state.buildings.length);
  });

  syncLabels();

  // ----------------------------
  // Generation
  // ----------------------------
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

  function generateFromUi() {
    const params = readParams();
    const rng = makeRng(params.seed);

    state.params = params;
    state.selectedId = null;

    // World coords: centered at (0,0)
    const R = params.townRadius;

    // Decor: fields + trees + water
    state.decor = generateDecor(rng, R);

    // Roads
    const roads = generateRadialRoads(rng, R, params.mainRoads, params.roadWidth);
    const rings = generateRingRoads(rng, R, params.ringRoads, params.roadWidth);

    state.roads = roads;
    state.rings = rings;

    // Buildings along roads
    state.buildings = generateBuildings(rng, params, roads, rings);

    el.buildingCount.textContent = String(state.buildings.length);
    updateSelectionPanel();
    draw();
  }

  function generateDecor(rng, R) {
    // Background fields as big patch polygons outside town core
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
        id: "field_" + i,
        poly,
        tone: rng() < 0.45 ? "light" : (rng() < 0.6 ? "mid" : "dark")
      });
    }

    // Water pond
    const pondAng = rng() * Math.PI * 2;
    const pondDist = lerp(R * 1.25, R * 1.7, rng());
    const water = {
      cx: Math.cos(pondAng) * pondDist,
      cy: Math.sin(pondAng) * pondDist,
      rx: lerp(R * 0.10, R * 0.18, rng()),
      ry: lerp(R * 0.08, R * 0.15, rng()),
      rot: (rng() - 0.5) * 0.6
    };

    // Trees sprinkled around town and fields
    const trees = [];
    const treeCount = 420 + Math.floor(rng() * 280);
    for (let i = 0; i < treeCount; i++) {
      const a = rng() * Math.PI * 2;
      const d = lerp(R * 0.5, R * 2.3, Math.pow(rng(), 0.6));
      const x = Math.cos(a) * d + (rng() - 0.5) * 40;
      const y = Math.sin(a) * d + (rng() - 0.5) * 40;

      // keep some space in very center
      if (Math.hypot(x, y) < R * 0.25) continue;
      trees.push({ x, y, s: lerp(1, 2.4, rng()) });
    }

    return { fields, trees, water };
  }

  function generateRadialRoads(rng, R, count, width) {
    const roads = [];
    const baseStep = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const jitter = (rng() - 0.5) * baseStep * 0.35;
      const ang = i * baseStep + jitter;

      // add a slight curve by perturbing midpoints
      const p0 = { x: 0, y: 0 };
      const p2 = { x: Math.cos(ang) * R, y: Math.sin(ang) * R };
      const mid = {
        x: Math.cos(ang) * (R * 0.55) + (rng() - 0.5) * (R * 0.15),
        y: Math.sin(ang) * (R * 0.55) + (rng() - 0.5) * (R * 0.15)
      };

      roads.push({
        kind: "radial",
        width,
        points: [p0, mid, p2]
      });
    }
    return roads;
  }

  function generateRingRoads(rng, R, ringCount, width) {
    const rings = [];
    if (ringCount <= 0) return rings;

    // Even-ish rings inside town radius
    for (let i = 0; i < ringCount; i++) {
      const t = (i + 1) / (ringCount + 1);
      const r = lerp(R * 0.28, R * 0.82, t) * lerp(0.95, 1.05, rng());
      rings.push({ r, width: Math.max(3, width - 2) });
    }
    return rings;
  }

  function generateBuildings(rng, params, roads, rings) {
    const buildings = [];
    const R = params.townRadius;

    // Spatial hash for overlap control
    const cell = Math.max(18, params.bMax);
    const grid = new Map();
    function key(ix, iy) { return ix + "," + iy; }
    function insert(b) {
      const bb = polyBounds(b.poly);
      const minX = Math.floor(bb.minX / cell);
      const maxX = Math.floor(bb.maxX / cell);
      const minY = Math.floor(bb.minY / cell);
      const maxY = Math.floor(bb.maxY / cell);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const k = key(x, y);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(b);
        }
      }
    }
    function overlaps(poly) {
      const bb = polyBounds(poly);
      const minX = Math.floor(bb.minX / cell);
      const maxX = Math.floor(bb.maxX / cell);
      const minY = Math.floor(bb.minY / cell);
      const maxY = Math.floor(bb.maxY / cell);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const k = key(x, y);
          const bucket = grid.get(k);
          if (!bucket) continue;
          for (const other of bucket) {
            if (boundsOverlap(bb, polyBounds(other.poly))) return true;
          }
        }
      }
      return false;
    }

    // Place buildings along road polylines
    const spacingBase = 26 / params.density;
    let idCounter = 1;

    for (const road of roads) {
      const samples = samplePolyline(road.points, spacingBase);
      for (let i = 0; i < samples.length; i++) {
        // Place buildings on both sides with some probability
        for (const side of [-1, 1]) {
          if (rng() < 0.25) continue;

          const s = samples[i];
          const size = lerp(params.bMin, params.bMax, rng());
          const w = lerp(size * 0.8, size * 1.25, rng());
          const h = lerp(size * 0.7, size * 1.35, rng());
          const offset = lerp(10, 26, rng()) + road.width * 0.6;

          const ox = Math.cos(s.ang + Math.PI / 2) * offset * side;
          const oy = Math.sin(s.ang + Math.PI / 2) * offset * side;

          const px = s.x + ox;
          const py = s.y + oy;

          // Keep inside town radius, with a little margin
          if (Math.hypot(px, py) > R * 0.98) continue;

          const rot = s.ang + (rng() - 0.5) * 0.25;
          const poly = rectPoly(px, py, w, h, rot);

          // Avoid the very center "civic core"
          if (Math.hypot(px, py) < R * 0.18 && rng() < 0.7) continue;

          // Avoidff: basic overlap check
          if (overlaps(poly)) continue;

          const b = {
            id: "b" + (idCounter++),
            poly,
            angle: rot,
            color: buildingFill(rng),
            meta: {
              kind: rng() < 0.08 ? "civic" : (rng() < 0.25 ? "shop" : "home"),
              levels: 1 + (rng() < 0.25 ? 1 : 0) + (rng() < 0.08 ? 1 : 0)
            }
          };
          b.path = polyToPath2D(b.poly);
          insert(b);
          buildings.push(b);
        }
      }
    }

    // Add a few "bigger" landmark blocks near center
    const landmarkCount = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < landmarkCount; i++) {
      const a = rng() * Math.PI * 2;
      const d = lerp(R * 0.05, R * 0.28, rng());
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const w = lerp(params.bMax * 2.2, params.bMax * 3.8, rng());
      const h = lerp(params.bMax * 2.0, params.bMax * 3.5, rng());
      const rot = rng() * Math.PI * 2;

      const poly = rectPoly(x, y, w, h, rot);
      if (overlaps(poly)) continue;

      const b = {
        id: "b" + (idCounter++),
        poly,
        angle: rot,
        color: "#d0d5db",
        meta: { kind: "landmark", levels: 2 + (rng() < 0.4 ? 1 : 0) }
      };
      b.path = polyToPath2D(b.poly);
      insert(b);
      buildings.push(b);
    }

    // Optional: small buildings sprinkled along ring roads (gives a denser “belt”)
    for (const ring of rings) {
      const ringSamples = Math.floor((2 * Math.PI * ring.r) / (40 / params.density));
      for (let i = 0; i < ringSamples; i++) {
        if (rng() < 0.55) continue;
        const ang = (i / ringSamples) * Math.PI * 2 + (rng() - 0.5) * 0.05;

        const r = ring.r + (rng() - 0.5) * 14;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;

        if (Math.hypot(x, y) > R * 0.98) continue;

        const size = lerp(params.bMin, params.bMax, rng());
        const w = lerp(size * 0.8, size * 1.2, rng());
        const h = lerp(size * 0.8, size * 1.35, rng());
        const rot = ang + Math.PI / 2;

        const poly = rectPoly(x, y, w, h, rot);
        if (overlaps(poly)) continue;

        const b = {
          id: "b" + (idCounter++),
          poly,
          angle: rot,
          color: buildingFill(rng),
          meta: { kind: rng() < 0.18 ? "shop" : "home", levels: 1 + (rng() < 0.18 ? 1 : 0) }
        };
        b.path = polyToPath2D(b.poly);
        insert(b);
        buildings.push(b);
      }
    }

    return buildings;
  }

  function buildingFill(rng) {
    // Warm browns / clay roofs / some gray
    const palette = ["#6c4a3a", "#715243", "#5d3f33", "#7a5a47", "#4f3a32", "#8a6a53", "#9aa3ab"];
    return palette[Math.floor(rng() * palette.length)];
  }

  // ----------------------------
  // Geometry helpers
  // ----------------------------
  function rectPoly(cx, cy, w, h, rot) {
    const hw = w / 2, hh = h / 2;
    const pts = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh }
    ];
    const c = Math.cos(rot), s = Math.sin(rot);
    return pts.map(p => ({
      x: cx + p.x * c - p.y * s,
      y: cy + p.x * s + p.y * c
    }));
  }

  function polyBounds(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  function boundsOverlap(a, b) {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }

  function polyToPath2D(poly) {
    const path = new Path2D();
    if (!poly.length) return path;
    path.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
    path.closePath();
    return path;
  }

  function samplePolyline(points, step) {
    // Returns samples with position + tangent angle
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;

      const ang = Math.atan2(dy, dx);
      const n = Math.max(2, Math.floor(len / step));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        out.push({ x: a.x + dx * t, y: a.y + dy * t, ang });
      }
    }
    return out;
  }

  // ----------------------------
  // Rendering
  // ----------------------------
  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Transform: put world (0,0) at center
    ctx.translate(view.cx, view.cy);
    ctx.scale(view.scale, view.scale);

    if (!state.params) {
      drawEmpty(w, h);
      ctx.restore();
      return;
    }

    // Background
    drawFields();
    drawWater();
    drawTownHalo();
    drawTrees();

    // Roads
    drawRoads();

    // Buildings
    drawBuildings();

    ctx.restore();
  }

  function drawEmpty(w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Click Regenerate to create a town", 0, 0);
    ctx.restore();
  }

  function drawFields() {
    for (const f of state.decor.fields) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.poly[0].x, f.poly[0].y);
      for (let i = 1; i < f.poly.length; i++) ctx.lineTo(f.poly[i].x, f.poly[i].y);
      ctx.closePath();

      if (f.tone === "light") ctx.fillStyle = "rgba(235, 227, 160, 0.85)";
      else if (f.tone === "mid") ctx.fillStyle = "rgba(165, 196, 140, 0.55)";
      else ctx.fillStyle = "rgba(155, 118, 92, 0.50)";

      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWater() {
    const w = state.decor.water;
    if (!w) return;
    ctx.save();
    ctx.translate(w.cx, w.cy);
    ctx.rotate(w.rot);

    ctx.beginPath();
    ctx.ellipse(0, 0, w.rx, w.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(105, 156, 196, 0.85)";
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawTownHalo() {
    const R = state.params.townRadius;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(173, 192, 160, 0.55)";
    ctx.fill();
    ctx.restore();
  }

  function drawTrees() {
    ctx.save();
    ctx.fillStyle = "rgba(92, 120, 84, 0.55)";
    for (const t of state.decor.trees) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoads() {
    const R = state.params.townRadius;

    // light ground under dense city center
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(226, 227, 222, 0.70)";
    ctx.fill();
    ctx.restore();

    // ring roads
    for (const ring of state.rings) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(210, 212, 205, 0.95)";
      ctx.lineWidth = ring.width;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // radials
    for (const road of state.roads) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(road.points[0].x, road.points[0].y);
      ctx.quadraticCurveTo(
        road.points[1].x, road.points[1].y,
        road.points[2].x, road.points[2].y
      );

      ctx.strokeStyle = "rgba(210, 212, 205, 0.95)";
      ctx.lineWidth = road.width;
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBuildings() {
    for (const b of state.buildings) {
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;

      ctx.fill(b.path);
      ctx.stroke(b.path);

      // selection highlight
      if (b.id === state.selectedId) {
        ctx.strokeStyle = "rgba(30, 140, 255, 0.95)";
        ctx.lineWidth = 2.5;
        ctx.stroke(b.path);

        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 1;
        ctx.stroke(b.path);
      }
      ctx.restore();
    }
  }

  // ----------------------------
  // Hit testing & selection
  // ----------------------------
  function canvasToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // invert view transform: world -> screen was (x*scale + cx, y*scale + cy)
    return {
      x: (x - view.cx) / view.scale,
      y: (y - view.cy) / view.scale
    };
  }

  canvas.addEventListener("click", (e) => {
    if (!state.params) return;

    const p = canvasToWorld(e.clientX, e.clientY);

    // reverse order = topmost last drawn
    let hit = null;
    for (let i = state.buildings.length - 1; i >= 0; i--) {
      const b = state.buildings[i];
      if (ctx.isPointInPath(b.path, p.x, p.y)) {
        hit = b;
        break;
      }
    }

    state.selectedId = hit ? hit.id : null;
    updateSelectionPanel();
    draw();
  });

  function updateSelectionPanel() {
    const b = state.buildings.find(x => x.id === state.selectedId);
    const has = !!b;

    el.randomizeSelected.disabled = !has;
    el.deleteSelected.disabled = !has;

    if (!state.params) {
      el.selection.textContent = "No town yet.";
      el.selection.classList.add("muted");
      return;
    }

    if (!b) {
      el.selection.textContent = "Click a building…";
      el.selection.classList.add("muted");
      return;
    }

    el.selection.classList.remove("muted");

    const bb = polyBounds(b.poly);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;

    el.selection.textContent =
      `id: ${b.id}\n` +
      `kind: ${b.meta.kind}\n` +
      `levels: ${b.meta.levels}\n` +
      `color: ${b.color}\n` +
      `center: (${cx.toFixed(1)}, ${cy.toFixed(1)})`;
  }

  // ----------------------------
  // Export
  // ----------------------------
  function downloadJson() {
    if (!state.params) return;

    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      params: state.params,
      roads: state.roads.map(r => ({
        kind: r.kind,
        width: r.width,
        points: r.points
      })),
      rings: state.rings,
      buildings: state.buildings.map(b => ({
        id: b.id,
        color: b.color,
        angle: b.angle,
        meta: b.meta,
        poly: b.poly
      })),
      decor: {
        fields: state.decor.fields,
        trees: state.decor.trees,
        water: state.decor.water
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `town_${safeName(state.params.seed)}.json`);
  }

  function downloadPng() {
    if (!state.params) return;

    // Export at current canvas resolution. If you want higher-res, render to an offscreen canvas at a larger size.
    const url = canvas.toDataURL("image/png");
    downloadDataUrl(url, `town_${safeName(state.params.seed)}.png`);
  }

  function safeName(s) {
    return String(s || "seed").trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "_").slice(0, 40) || "seed";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, filename, true);
  }

  function downloadDataUrl(url, filename, revoke = false) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  // ----------------------------
  // Boot
  // ----------------------------
  resizeCanvas();
  generateFromUi();
})();
