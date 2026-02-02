## Fantasy Town Builder Mission

Continue development of the fantasy town/village/city generator as a **pure HTML/CSS/JS** web app that:

- Renders a **procedurally generated town** on a single `<canvas>`.
- Treats **every building as a selectable object** (hit-testable geometry).
- Supports editing “fixed values” (user-adjustable parameters) and regenerating deterministically from a seed.
- Exports:
  - **PNG** of the rendered canvas
  - **JSON** describing the full scene, parameters, and geometry
- Can also **import JSON** to restore the exact same map, selection metadata, and visual styling.

The immediate goal is to evolve the current “buildings along roads” approach into a **block/parcel-based** town layout that looks closer to hand-drawn fantasy town maps (dense core, irregular blocks, neighborhoods, farmland, water/trees).

---

## Non-negotiables

1. **No frameworks** (no React/Vue, no build step). Vanilla JS, single canvas.
2. **Deterministic** generation with seeded RNG. Same seed + same params = same town.
3. **Selectable buildings** must remain stable across exports/imports. Building IDs must be stable.
4. **Export JSON** must contain enough data to:
   - Re-render the town exactly
   - Restore selection state and per-building metadata
   - Support future migrations via a `version` field
5. Keep code maintainable:
   - Split into modules/files when it grows (recommended).
   - Each file should have a clear responsibility.
   - Avoid giant monolithic functions.

---

## Repository layout (target)

If you refactor, use this structure (no build tooling required):

/index.html
/styles.css
/src/
main.js # bootstrap, UI wiring, event loop
state.js # scene state + selection + undo skeleton
rng.js # seeded RNG utilities
geometry.js # poly ops, bounds, intersects, transforms
spatialIndex.js # grid or rbush-style simple index
generate/
generateTown.js # orchestrator
roads.js # road graph + sampling + styling data
blocks.js # block extraction from road network
parcels.js # parcel subdivision
buildings.js # building placement + footprints
decor.js # trees, fields, water, town boundary
render/
renderer.js # draw pipeline
styles.js # palettes, stroke widths, theme knobs
hitTest.js # Path2D caching + point-in-poly
io/
exportJson.js
importJson.js
exportPng.js

If you do not split yet, keep the same logical separation inside the single file with clear headings.

---

## Data model (must converge to this)

### Scene

```js
scene = {
  version: 1,
  params: {...},
  layers: {
    terrain: {...},        // fields/water/trees
    roads: {...},          // road graph, polylines, widths, hierarchy
    blocks: {...},         // polygons (derived or stored)
    parcels: {...},        // polygons (derived or stored)
    buildings: {...},      // list of building objects
    labels: {...}          // optional text placements
  },
  selection: { buildingId: null }
}
```

### Building object (minimum)

```js
building = {
  id: "b1234",             // stable deterministic id
  footprint: [{x,y}, ...], // polygon in world coords
  style: {
    fill: "#6c4a3a",
    stroke: "rgba(...)",
    roof: "gable|flat|hip" // optional, later
  },
  meta: {
    kind: "home|shop|civic|landmark",
    levels: 1,
    district: "core|inner|outer|farm",
    name: ""               // optional
  }
}
```

### Requirements for selection/hit-testing

* Maintain a `Path2D` cache per selectable polygon.
* Invalidate/rebuild only when geometry changes.
* Provide a single `hitTestBuildings(x,y)` that returns topmost hit (draw order aware).

---

## Current shortcomings to address

* Buildings are rectangles sprinkled near roads; they do not form coherent blocks.
* Roads are a small set of radials/rings; needs richer network.
* No import flow.
* No zoom/pan editing (optional but likely needed).
* No editing of building shapes or drag handles.

---

## Development phases & deliverables

### Phase 1 — Refactor & IO (short)

**Goal:** Make the codebase safe to extend.
Deliverables:

1. Refactor into `/src` modules or at minimum clean file sections:
   * RNG
   * geometry
   * generation
   * render
   * hit test
   * export/import
2. Add **Import JSON** button:
   * Load file picker
   * Validate `version`
   * Restore scene and re-render
3. Add `scene.version` and migration placeholder:
   * `migrateScene(scene)` that upgrades older versions.

Acceptance:

* Export JSON then import it reproduces identical PNG (within anti-alias tolerance).

---

### Phase 2 — Road graph (core)

**Goal:** Replace “radial polyline list” with a small **road graph** model that can support block extraction.

Road graph model:

```js
graph = {
  nodes: [{id, x, y}],
  edges: [{id, a, b, kind:"main|minor", width}]
}
```

Deliverables:

1. Generate a graph that resembles:
   * a few main spines,
   * branching minor streets,
   * optional ring roads,
   * irregularity/jitter
2. Convert graph edges to drawable polylines.
3. Keep deterministic output.

Acceptance:

* A seed generates consistent graph nodes/edges.
* Roads draw with hierarchy and intersections look clean.

---

### Phase 3 — Block extraction (hard, high value)

**Goal:** Compute **block polygons** from the road network.

Approach options (pick one, implement well):

1. **Planar embedding + face walking** :

* Treat edges as segments, split at intersections.
* For each directed half-edge, sort outgoing edges by angle.
* Walk faces by “take next edge clockwise” rule to find cycles.
* Filter exterior face (largest area).

1. **Rasterize + contour** (easier but less precise):
   * Draw roads onto an offscreen mask canvas.
   * Flood fill / contour extraction to get block boundaries.
   * Convert contours to polygons and simplify (RDP).
   * This can work surprisingly well for fantasy style.

Deliverables:

* `blocks = [{id, poly:[...], area, bbox}]`
* Filter blocks by area range and inside town boundary.

Acceptance:

* Blocks exist and are visually plausible.
* Blocks are stable with a seed.

---

### Phase 4 — Parcel subdivision

**Goal:** Split blocks into parcels and place buildings aligned to parcel edges.

Deliverables:

1. For each block polygon:
   * Simplify polygon
   * Pick a subdivision strategy:
     * recursive split by random chord
     * offset-inwards + slice
     * “street-front strips” along perimeter
2. Generate parcels:
   * `parcel = {id, poly, blockId}`
3. Place buildings:
   * Most buildings should align to a parcel edge facing the nearest road.
   * Use setbacks and avoid overlaps.

Acceptance:

* Buildings appear in rows along streets.
* Dense core uses smaller parcels, outskirts larger.

---

### Phase 5 — Editing tools (selection is already there)

**Goal:** Turn this into a usable map editor.

Deliverables:

1. Pan/zoom (mouse wheel zoom, drag pan).
2. Building editing:
   * click selects
   * properties panel updates metadata + color
   * drag to move (optional)
   * delete
3. Multi-select (shift-click).
4. Layer toggles (roads, trees, fields, buildings).

Acceptance:

* Editing persists into JSON export/import.

---

## Rendering style requirements

Target look: “fantasy cartography” clean vector-ish.

* Terrain: desaturated greens/browns.
* Fields: patch polygons with subtle stroke.
* Roads: light fill, darker edge stroke, round caps.
* Buildings: roof/brown fill, thin outline, selected highlight.
* Trees: small circles with slight alpha is fine initially.

Avoid:

* heavy gradients
* overly saturated colors
* noisy textures (unless optional)

---

## Determinism rules (important)

* All randomness must come from seeded RNG.
* If you need “random per building” after generation, derive it from:
  * `hash(seed + "::" + building.id + "::" + propertyName)`
* Building IDs must be deterministic:
  * Derive from placement index within deterministic loops, or
  * Use a stable hash of geometry centroid quantized.

Do not use `Date.now()` for anything that affects saved scenes (allowed only for UI-only actions).

---

## Geometry toolkit requirements

Implement these utilities (or improve existing):

* `polyArea(poly)`
* `polyCentroid(poly)`
* `polyBounds(poly)`
* `boundsOverlap(a,b)`
* `pointInPoly(pt, poly)` (fallback if Path2D missing)
* `polySimplifyRDP(poly, epsilon)`
* `segmentIntersect(a,b,c,d)` and intersection splitting (if using planar method)
* `offsetPoly(poly, dist)` (optional later; hard but useful)

Spatial indexing:

* grid hash is fine (current).
* Make it reusable for parcels/buildings.

---

## Export / Import spec (v1)

Export must include:

* `version`
* `params`
* `roads` (graph or polylines, but prefer graph once Phase 2 lands)
* `blocks` (if computed)
* `parcels` (if computed)
* `buildings` with `id`, `footprint`, `style`, `meta`
* `decor` (fields/trees/water)
* `selection` (optional)

Import must:

* validate presence/shape
* migrate if needed
* rebuild Path2D caches

---

## Testing checklist (manual)

For each change:

1. Generate with seed A, export JSON, reload page, import JSON:
   * Visual match
   * Building count match
   * Selecting a building shows same ID/meta
2. Change one parameter:
   * Map changes
   * Export/import still stable
3. Try extreme params:
   * very high density
   * low density
   * small town radius
   * large town radius
     No crashes, no infinite loops.

---

## Performance constraints

* Target: 60 FPS on redraw for ~3k buildings (stretch).
* Do not rebuild Path2D every frame. Cache.
* Use dirty flags:
  * geometry changed
  * style changed
  * selection changed
  * view changed
* Redraw full canvas is okay early; later consider partial redraw only if needed.

---

## Immediate next tasks (do these first)

1. Add Import JSON.
2. Refactor into modules OR clean sections with explicit APIs.
3. Replace road representation with a graph structure.
4. Add pan/zoom (even basic) because block/parcel editing will need it.

---

## Coding conventions

* Prefer small pure functions.
* No hidden global state beyond a single `scene`/`state` object.
* Keep parameters in `scene.params` only.
* Avoid UI logic inside generation code.
* Keep rendering side-effectful but deterministic from `scene`.

---

## “Definition of Done” for this project

A user can:

* Type a seed + tweak parameters
* Generate a believable fantasy town
* Click buildings to select and edit properties
* Export PNG + JSON
* Reload and import JSON to get the exact same town back

---

## Notes to Codex

When making large changes, include a short summary in the PR/commit message:

* what changed
* where to look
* how to test
  Avoid adding dependencies. Keep it portable and offline-friendly.

```

```
