export const SCENE_VERSION = 2;

export function defaultParams() {
  return {
    seed: "winack",
    townRadius: 420,
    mainRoads: 9,
    ringRoads: 2,
    density: 1.2,
    bMin: 10,
    bMax: 26,
    roadWidth: 8
  };
}

export function createScene(params) {
  return {
    version: SCENE_VERSION,
    params: { ...params },
    layers: {
      roads: { graph: null, polylines: [] },
      blocks: { items: [] },
      parcels: { items: [] },
      buildings: { items: [] },
      decor: { fields: [], trees: [], water: null, townBoundary: null }
    },
    selection: { buildingId: null }
  };
}
