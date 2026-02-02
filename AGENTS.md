
# AGENTS.md — Codex Agent Roster (Very Specific) for Fantasy Town Generator

This file defines **exactly** which agents exist, what each one owns, and what they must produce. No agent is allowed to “help everywhere.” Ownership boundaries are strict.

---

## Global rules for all agents
- **Vanilla only:** HTML/CSS/JS. No frameworks. No build step.
- **Deterministic:** All randomness must come from seeded RNG utilities. No `Math.random()` in generation paths.
- **Stable IDs:** Building IDs must be deterministic and persist through export/import.
- **Single canvas:** Rendering is only to one `<canvas>`. UI is DOM, but map is canvas.
- **No giant files:** If a JS file exceeds ~500–800 lines, split it.
- **No cross-ownership edits:** An agent may not modify files owned by another agent without creating a clear request/change note for that agent.

---

## Agent 01 — `ARCH_INTEGRATOR`
**Role:** System architecture, wiring, and integration  
**Owns:** `/src/main.js`, `/src/state.js`, `/src/ui/*` (if created), and overall boot flow.

### Responsibilities
1. Maintain the authoritative `scene/state` structure.
2. Wire UI controls to `scene.params` and regeneration.
3. Coordinate calls into generator, renderer, hit testing, IO.
4. Maintain “dirty flags” and a clean redraw pipeline.
5. Ensure a consistent public API between modules.

### Must deliver
- `scene` object in one place with documented shape.
- `regenerate(scene.params)` pipeline:
  - clears derived layers
  - calls generator orchestrator
  - rebuilds caches
  - triggers redraw
- A single `draw()` entry point.
- A single `selectBuilding(id)` entry point that updates UI + state.

### Acceptance checks
- App loads without errors.
- UI changes regenerate and remain deterministic.

---

## Agent 02 — `RNG_DETERMINISM_ENGINEER`
**Role:** Seeded randomness, hashing, stable IDs  
**Owns:** `/src/rng.js`

### Responsibilities
1. Provide seeded RNG creation: `makeRng(seedString)`.
2. Provide stable hash utilities:
   - `hash32(str)`, `hashToUnitFloat(str)`.
3. Provide deterministic “per-entity” random:
   - `rngFor(entityId, channel)` => derived RNG.
4. Define stable ID policy:
   - `stableId(prefix, seed, dataSignature)`.

### Must deliver
- `makeRng(seed)` deterministic generator
- `stableId()` that does NOT rely on run order if possible:
  - Use quantized centroid + seed + type as signature for IDs
- Documented do/don’t list for randomness.

### Acceptance checks
- Same seed+params yields identical JSON and PNG across refresh.
- Exported IDs don’t change after import.

---

## Agent 03 — `GEOMETRY_KERNEL`
**Role:** All geometry operations and robustness  
**Owns:** `/src/geometry.js`

### Responsibilities
Provide clean, tested implementations for:
- Polygon:
  - `polyArea(poly)`
  - `polyCentroid(poly)`
  - `polyBounds(poly)`
  - `polySimplifyRDP(poly, eps)`
- Point tests:
  - `pointInPoly(pt, poly)`
- Segments:
  - `segmentIntersect(a,b,c,d)` (with intersection point)
  - `splitSegmentsAtIntersections(segments)` (if needed for planar faces)
- Utility:
  - `rotatePoint(p, rot)`
  - `rectPoly(cx,cy,w,h,rot)`
  - `distance(a,b)`

### Must deliver
- Geometry functions with clear input/output contracts.
- Zero DOM or canvas usage in this file.
- Small test harness function(s) callable from console (optional but recommended).

### Acceptance checks
- No NaNs, no crashes on degenerate polygons.
- Simplification preserves winding and does not self-intersect more than before.

---

## Agent 04 — `SPATIAL_INDEX_ENGINEER`
**Role:** Fast overlap queries and selection acceleration  
**Owns:** `/src/spatialIndex.js`

### Responsibilities
1. Implement a reusable grid spatial index:
   - `new SpatialGrid(cellSize)`
   - `insert(item, bounds)`
   - `remove(item, bounds)`
   - `query(bounds)` -> candidates
2. Used by:
   - building overlap avoidance
   - parcel placement
   - optional hit-test acceleration

### Must deliver
- A stable, minimal class/module.
- Clear bounds format used everywhere: `{minX,minY,maxX,maxY}`.
- No references to buildings specifically. Generic.

### Acceptance checks
- Large scenes (2k+ buildings) regenerate without stutter spikes from O(n²).

---

## Agent 05 — `ROAD_GRAPH_GENERATOR`
**Role:** Generate road network as a graph + polylines  
**Owns:** `/src/generate/roads.js`

### Responsibilities
1. Define road graph model:
   ```js
   graph = { nodes:[{id,x,y}], edges:[{id,a,b,kind,width}] }

2. Generate a town road network:
   * at least: main spines + branching minor roads
   * optional: ring roads
   * deterministic jitter, but consistent
3. Provide polyline conversion:
   * `graphToPolylines(graph)` returns drawable segments/polylines
4. Provide nearest-road queries:
   * `closestEdge(point)` (optional but useful for parcels)

### Must deliver

* `generateRoadGraph(rng, params)` => `graph`
* `roadsToDrawData(graph)` => list of polylines with widths and kind

### Acceptance checks

* Graph has intersections and variety.
* No disconnected tiny edges unless intended.

---

## Agent 06 — `BLOCK_EXTRACTOR`

**Role:** Convert road network into block polygons
**Owns:** `/src/generate/blocks.js`

### Responsibilities

Implement ONE extraction method (choose and commit):

* **Planar face-walk** (preferred for geometry purity), OR
* **Raster contour method** (preferred for speed of implementation)

### Planar face-walk deliverables

* Convert graph edges to segments
* Split at intersections
* Build half-edge adjacency
* Walk faces
* Filter outer face
* Produce:
  ```js
  blocks = [{id, poly, area, bbox}]
  ```

### Raster contour deliverables

* Offscreen mask canvas draw roads thick
* Flood fill / contour extraction
* Poly simplify
* Filter by area, inside town boundary

### Must deliver

* `extractBlocks(scene)` or `generateBlocks(rng, params, roads)` => blocks

### Acceptance checks

* Blocks exist in non-trivial count (e.g. 40–250 depending on params).
* Blocks remain deterministic.

---

## Agent 07 — `PARCEL_SUBDIVIDER`

**Role:** Subdivide blocks into parcels
**Owns:** `/src/generate/parcels.js`

### Responsibilities

1. Take block polygons and split into parcels based on density rules:
   * core: smaller parcels
   * outskirts: larger parcels
2. Strategy must be deterministic:
   * recursive split by chord
   * perimeter strip parcels facing roads
3. Produce:
   ```js
   parcels = [{id, poly, blockId, bbox}]
   ```

### Must deliver

* `generateParcels(rng, params, blocks, roads)` => parcels
* Parameters:
  * `parcelMinArea`, `parcelMaxArea` derived from density/district

### Acceptance checks

* Parcels fit within blocks.
* No obvious overlaps, no invalid polygons.

---

## Agent 08 — `BUILDING_PLACER`

**Role:** Place building footprints inside parcels, align to street edges
**Owns:** `/src/generate/buildings.js`

### Responsibilities

1. Place 1..N buildings per parcel:
   * choose frontage edge (nearest road)
   * apply setback
   * align building rotation to frontage edge angle
2. Avoid overlaps using `SpatialGrid`.
3. Assign deterministic:
   * `id`
   * `style.fill`
   * `meta.kind`, `levels`, `district`

### Must deliver

* `generateBuildings(rng, params, parcels, roads)` => buildings
* Each building includes:
  * `footprint` polygon
  * `bbox`
  * `meta`
  * `style`

### Acceptance checks

* Buildings mostly align along streets.
* Density changes result in visibly different building counts/sizes.

---

## Agent 09 — `DECOR_TERRAIN_DESIGNER`

**Role:** Fields, trees, water, town boundary layering
**Owns:** `/src/generate/decor.js`

### Responsibilities

1. Generate:
   * farmland patches outside town boundary
   * water feature (pond/river later)
   * tree scatter with falloff
2. Provide rendering-ready data with minimal work for renderer.
3. Keep decor deterministic.

### Must deliver

* `generateDecor(rng, params)` => `{fields, trees, water, townBoundary}`

### Acceptance checks

* Decor doesn’t cover roads excessively.
* Visual layering looks consistent (terrain under roads under buildings).

---

## Agent 10 — `RENDER_PIPELINE_ENGINEER`

**Role:** Canvas draw order, styles, performance
**Owns:** `/src/render/renderer.js`, `/src/render/styles.js`

### Responsibilities

1. Implement draw pipeline by layers:
   * terrain
   * roads
   * parcels/blocks (optional debug)
   * buildings
   * selection overlay
   * labels (optional)
2. Support:
   * pan/zoom transform
   * devicePixelRatio scaling
3. Cache expensive paths:
   * Path2D for buildings
   * optional Path2D for blocks/parcels

### Must deliver

* `render(scene, ctx, view)`
* Style knobs in `styles.js` (palettes, widths, alphas)
* Debug toggles:
  * show blocks
  * show parcels
  * show road graph nodes (optional)

### Acceptance checks

* 1k+ buildings render smoothly.
* Selection outline always on top.

---

## Agent 11 — `HIT_TEST_SELECTION_ENGINEER`

**Role:** Reliable selection, draw-order aware hit test
**Owns:** `/src/render/hitTest.js`

### Responsibilities

1. Convert building polygons to `Path2D` caches:
   * `ensureBuildingPaths(scene)`
2. Implement `hitTestBuildings(scene, worldPoint)`:
   * respects draw order (topmost)
   * uses Path2D `isPointInPath`
   * optional spatial pruning by bbox
3. Provide selection utilities:
   * `setSelection(scene, id)`
   * multi-select later (but design for it)

### Must deliver

* Single hit-test function used by `main.js`.
* Optional bbox prefilter for performance.

### Acceptance checks

* Clicking a building always selects correct one.
* Clicking empty space clears selection.

---

## Agent 12 — `IO_EXPORT_IMPORT_ENGINEER`

**Role:** JSON import/export + PNG export
**Owns:** `/src/io/exportJson.js`, `/src/io/importJson.js`, `/src/io/exportPng.js`

### Responsibilities

1. JSON export:
   * include `version`, `params`, layers, selection
   * no Path2D in JSON
2. JSON import:
   * validate schema
   * migrate old versions via `migrateScene(scene)`
   * rebuild caches
3. PNG export:
   * export current canvas
   * optional: add “export scale” (2x/4x) later

### Must deliver

* `exportSceneToJson(scene)` => string
* `importSceneFromJson(jsonText)` => scene
* `exportCanvasToPng(canvas)` => blob/dataURL

### Acceptance checks

* Export->Import produces same scene and same IDs.
* Exported PNG matches viewport (and is not blank on HiDPI).

---

## Agent 13 — `VIEW_PAN_ZOOM_ENGINEER`

**Role:** View transforms and user navigation
**Owns:** `/src/view.js` (or view logic in main if not split)

### Responsibilities

1. Maintain `view`:
   * `cx, cy, scale`
2. Provide conversions:
   * `screenToWorld(x,y)`
   * `worldToScreen(x,y)`
3. Add interactions:
   * wheel zoom (cursor-centered)
   * drag pan (spacebar or middle mouse)
4. Ensure selection uses world coords.

### Must deliver

* View module with no rendering logic.
* Input handlers that can be enabled/disabled.

### Acceptance checks

* Zoom does not break hit testing.
* Reset view returns to sensible framing.

---

## Work order (strict)

Agents should execute in this order unless a dependency is missing:

1. `ARCH_INTEGRATOR` creates `/src` structure and moves code safely.
2. `RNG_DETERMINISM_ENGINEER` finalizes RNG + stable IDs.
3. `GEOMETRY_KERNEL` + `SPATIAL_INDEX_ENGINEER` provide primitives.
4. `IO_EXPORT_IMPORT_ENGINEER` adds import and versioning.
5. `ROAD_GRAPH_GENERATOR` replaces current road list.
6. `BLOCK_EXTRACTOR` generates blocks.
7. `PARCEL_SUBDIVIDER` generates parcels.
8. `BUILDING_PLACER` places buildings from parcels.
9. `RENDER_PIPELINE_ENGINEER` integrates new layers and debug views.
10. `HIT_TEST_SELECTION_ENGINEER` ensures selection stays correct.
11. `VIEW_PAN_ZOOM_ENGINEER` adds navigation polish.
12. `DECOR_TERRAIN_DESIGNER` refines decor to match target style.

---

## Done criteria per agent (what counts as “finished”)

An agent is “done” only when:

* Their owned module is implemented
* It is wired in by `ARCH_INTEGRATOR`
* Manual tests in the checklist pass
* The app exports and imports without breaking determinism

---

## Manual regression checklist (run after each milestone)

* Seed A + params P => export JSON => refresh => import => identical building count + stable IDs.
* Click 10 random buildings => IDs remain same after export/import.
* Increase density and regenerate => building count increases and does not overlap badly.
* Zoom/pan does not break selection.
* PNG export is not blank and matches canvas content.

---

## Parameter contract (must remain stable)

`scene.params` should include at minimum:

* `seed`
* `townRadius`
* `mainRoads`
* `ringRoads`
* `density`
* `bMin`
* `bMax`
* `roadWidth`
  Optional additions must be additive and defaulted for old versions.

---

## Notes

* If you choose raster-based block extraction, it must be implemented cleanly and deterministically.
* If you choose planar face-walk extraction, you must handle segment splitting at intersections robustly.
* Whichever method you pick, document it at the top of `blocks.js`.

```

```
