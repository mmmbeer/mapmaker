import { distance } from "../geometry.js";

export function generateRoadGraph(rng, params) {
  const nodes = [];
  const edges = [];
  let nodeId = 1;
  let edgeId = 1;
  const ringNodeIds = [];

  function addNode(x, y) {
    const id = `n${nodeId++}`;
    nodes.push({ id, x, y });
    return id;
  }

  function addEdge(a, b, kind, width) {
    edges.push({ id: `e${edgeId++}`, a, b, kind, width });
  }

  const R = params.townRadius;
  const mainCount = Math.max(6, Math.round(24 * (params.mainRoads / 9)));
  const centerId = addNode(0, 0);

  // Main spines
  for (let i = 0; i < mainCount; i++) {
    const ang = (i / mainCount) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const len = R * (0.9 + rng() * 0.12);
    const midDist = len * (0.45 + rng() * 0.1);

    const mid = {
      x: Math.cos(ang) * midDist + (rng() - 0.5) * R * 0.08,
      y: Math.sin(ang) * midDist + (rng() - 0.5) * R * 0.08
    };
    const end = {
      x: Math.cos(ang) * len + (rng() - 0.5) * R * 0.06,
      y: Math.sin(ang) * len + (rng() - 0.5) * R * 0.06
    };

    const midId = addNode(mid.x, mid.y);
    const endId = addNode(end.x, end.y);
    const width = params.roadWidth * 1.6;
    addEdge(centerId, midId, "main", width);
    addEdge(midId, endId, "main", width);
  }

  // Ring roads
  const ringCount = Math.max(0, Math.floor(params.ringRoads));
  for (let i = 0; i < ringCount; i++) {
    const t = (i + 1) / (ringCount + 1);
    const r = lerp(R * 0.28, R * 0.82, t) * lerp(0.95, 1.05, rng());
    const segments = Math.max(18, Math.round(24 + r / 12));
    const width = Math.max(3, params.roadWidth * 1.15);
    let firstId = null;
    let prevId = null;
    for (let s = 0; s < segments; s++) {
      const ang = (s / segments) * Math.PI * 2 + (rng() - 0.5) * 0.02;
      const x = Math.cos(ang) * r + (rng() - 0.5) * 3;
      const y = Math.sin(ang) * r + (rng() - 0.5) * 3;
      const id = addNode(x, y);
      ringNodeIds.push(id);
      if (s === 0) firstId = id;
      if (prevId) addEdge(prevId, id, "ring", width);
      prevId = id;
    }
    if (firstId && prevId) addEdge(prevId, firstId, "ring", width);
  }

  // Minor streets branching off spines
  const minorTarget = Math.max(120, Math.round(818 * (params.density / 1.2)));
  const spineNodes = nodes.filter((n) => n.id !== centerId);
  for (let i = 0; i < minorTarget; i++) {
    const anchor = spineNodes[Math.floor(rng() * spineNodes.length)];
    const baseAngle = Math.atan2(anchor.y, anchor.x) + (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const ang = baseAngle + (rng() - 0.5) * 0.6;
    const len = lerp(R * 0.08, R * 0.22, rng());
    const end = {
      x: anchor.x + Math.cos(ang) * len,
      y: anchor.y + Math.sin(ang) * len
    };
    if (Math.hypot(end.x, end.y) > R * 1.05) continue;
    const endId = addNode(end.x, end.y);
    addEdge(anchor.id, endId, "minor", Math.max(2, params.roadWidth * 0.7));

    if (rng() < 0.35) {
      const bend = {
        x: end.x + (rng() - 0.5) * len * 0.6,
        y: end.y + (rng() - 0.5) * len * 0.6
      };
      const bendId = addNode(bend.x, bend.y);
      addEdge(endId, bendId, "minor", Math.max(2, params.roadWidth * 0.65));
    }
  }

  // Light snapping/connection pass so rings and spines feel connected
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  if (ringNodeIds.length) {
    const connectDist = Math.max(18, params.roadWidth * 2.5);
    for (const ringId of ringNodeIds) {
      const rNode = nodeMap.get(ringId);
      let best = null;
      let bestDist = Infinity;
      for (const n of nodes) {
        if (n.id === ringId) continue;
        const d = distance(rNode, n);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      if (best && bestDist < connectDist) {
        addEdge(ringId, best.id, "minor", Math.max(2, params.roadWidth * 0.65));
      }
    }
  }

  return { nodes, edges };
}

export function roadsToDrawData(graph) {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = graph.edges.map((e, idx) => ({ ...e, idx }));
  const adjacency = new Map();

  function groupKey(edge) {
    return `${edge.kind}|${edge.width.toFixed(3)}`;
  }

  function addAdj(nodeId, edge) {
    if (!adjacency.has(nodeId)) adjacency.set(nodeId, new Map());
    const groups = adjacency.get(nodeId);
    const key = groupKey(edge);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge.idx);
  }

  for (const edge of edges) {
    addAdj(edge.a, edge);
    addAdj(edge.b, edge);
  }

  function degree(nodeId, key) {
    return adjacency.get(nodeId)?.get(key)?.length || 0;
  }

  function otherEnd(edge, nodeId) {
    return edge.a === nodeId ? edge.b : edge.a;
  }

  const visited = new Array(edges.length).fill(false);
  const polylines = [];

  for (const edge of edges) {
    if (visited[edge.idx]) continue;
    const key = groupKey(edge);
    const degA = degree(edge.a, key);
    const degB = degree(edge.b, key);
    const startNode = degA !== 2 ? edge.a : (degB !== 2 ? edge.b : edge.a);

    const points = [];
    let currentNode = startNode;
    let currentEdge = edge;
    points.push(nodeMap.get(currentNode));

    for (let guard = 0; guard < edges.length + 2; guard++) {
      visited[currentEdge.idx] = true;
      const nextNode = otherEnd(currentEdge, currentNode);
      points.push(nodeMap.get(nextNode));

      const nextEdges = adjacency.get(nextNode)?.get(key) || [];
      const unvisited = [];
      for (const idx of nextEdges) {
        if (!visited[idx]) unvisited.push(idx);
      }
      if (unvisited.length !== 1) break;
      currentNode = nextNode;
      currentEdge = edges[unvisited[0]];
      if (currentNode === startNode) break;
    }

    if (points.length >= 2) {
      polylines.push({ kind: edge.kind, width: edge.width, points });
    }
  }

  return polylines;
}

export function closestEdge(point, polylines) {
  let best = null;
  let bestDist = Infinity;
  for (const line of polylines) {
    const pts = line.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const res = distancePointToSegment(point, a, b);
      if (res.dist < bestDist) {
        bestDist = res.dist;
        best = { line, point: res.point, dist: res.dist, angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
    }
  }
  return best;
}

function distancePointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-9) t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return { point: { x, y }, dist: distance(p, { x, y }) };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
