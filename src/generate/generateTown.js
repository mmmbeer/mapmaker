import { makeRng } from "../rng.js";
import { generateDecor } from "./decor.js";
import { generateRoadGraph, roadsToDrawData } from "./roads.js";
import { generateBlocks } from "./blocks.js";
import { generateParcels } from "./parcels.js";
import { generateBuildings } from "./buildings.js";

export function generateTown(scene, canvasSize) {
  const rng = makeRng(scene.params.seed);

  scene.layers.decor = generateDecor(rng, scene.params);

  const graph = generateRoadGraph(rng, scene.params);
  const drawData = roadsToDrawData(graph);
  scene.layers.roads = { graph, polylines: drawData };

  const blocks = generateBlocks(rng, scene.params, drawData, canvasSize);
  scene.layers.blocks = { items: blocks };

  const parcels = generateParcels(rng, scene.params, blocks, drawData);
  scene.layers.parcels = { items: parcels };

  const buildings = generateBuildings(rng, scene.params, parcels, drawData);
  scene.layers.buildings = { items: buildings };

  return scene;
}
