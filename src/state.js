export const SCENE_VERSION = 3;

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
    ui: {
      layerVisibility: {
        roads: true,
        trees: true,
        fields: true,
        buildings: true
      }
    },
    layers: {
      roads: { graph: null, polylines: [] },
      blocks: { items: [] },
      parcels: { items: [] },
      buildings: { items: [] },
      decor: { fields: [], trees: [], water: null, townBoundary: null }
    },
    selection: { buildingIds: [] }
  };
}
