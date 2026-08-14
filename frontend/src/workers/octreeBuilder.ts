// Front-end octree builder for point cloud LOD.
// Runs inside the parse worker so a 5M-point index build does not block the UI.
//
// Tree layout: every node stores a spatially uniform sample of the points in
// its box (up to maxPointsPerNode); the remaining points are distributed to the
// 8 child octants. Renderers walk the tree by screen size / frustum and only
// show the coarsest nodes that still satisfy the LOD threshold.

export interface OctreeNodeData {
  id: number;
  depth: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  pointStart: number; // first point index into the flattened arrays below
  pointCount: number;
  children: number[];
}

export interface OctreeData {
  nodes: OctreeNodeData[];
  rootId: number;
  positions: Float32Array; // node points concatenated (x,y,z per point)
  colors: Float32Array; // node colors concatenated (r,g,b, 0..1); empty when no RGB
  classIds: Uint8Array; // node classes concatenated
  totalPoints: number;
}

export interface OctreeBuildOptions {
  maxPointsPerNode?: number;
  maxDepth?: number;
}

const DEFAULT_MAX_POINTS = 20000;
const DEFAULT_MAX_DEPTH = 8;

export function buildOctree(
  positions: Float32Array,
  classIds: Uint8Array,
  colors: Float32Array | null,
  options: OctreeBuildOptions = {}
): OctreeData {
  const maxPointsPerNode = options.maxPointsPerNode ?? DEFAULT_MAX_POINTS;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const count = classIds.length;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = positions[i3];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!isFinite(minX)) {
    return {
      nodes: [],
      rootId: -1,
      positions: new Float32Array(0),
      colors: new Float32Array(0),
      classIds: new Uint8Array(0),
      totalPoints: 0,
    };
  }

  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;

  const nodes: OctreeNodeData[] = [];
  const flatPos: number[] = [];
  const flatCol: number[] = [];
  const flatCls: number[] = [];

  const appendPoint = (i: number) => {
    const i3 = i * 3;
    flatPos.push(positions[i3], positions[i3 + 1], positions[i3 + 2]);
    if (colors && colors.length >= i3 + 3) {
      flatCol.push(colors[i3], colors[i3 + 1], colors[i3 + 2]);
    }
    flatCls.push(classIds[i]);
  };

  const build = (idx: Uint32Array, bounds: number[], depth: number): number => {
    const nodeId = nodes.length;
    const node: OctreeNodeData = {
      id: nodeId,
      depth,
      minX: bounds[0],
      minY: bounds[1],
      minZ: bounds[2],
      maxX: bounds[3],
      maxY: bounds[4],
      maxZ: bounds[5],
      pointStart: flatPos.length / 3,
      pointCount: 0,
      children: [],
    };
    nodes.push(node);

    const n = idx.length;
    if (n <= maxPointsPerNode || depth >= maxDepth) {
      for (let k = 0; k < n; k++) appendPoint(idx[k]);
      node.pointCount = n;
      return nodeId;
    }

    const stride = Math.max(1, Math.ceil(n / maxPointsPerNode));
    const buckets: number[][] = Array.from({ length: 8 }, () => []);
    const cx = (bounds[0] + bounds[3]) / 2;
    const cy = (bounds[1] + bounds[4]) / 2;
    const cz = (bounds[2] + bounds[5]) / 2;

    for (let k = 0; k < n; k++) {
      const i = idx[k];
      if (k % stride === 0) {
        appendPoint(i);
      } else {
        const i3 = i * 3;
        const x = positions[i3];
        const y = positions[i3 + 1];
        const z = positions[i3 + 2];
        const bx = x >= cx ? 1 : 0;
        const by = y >= cy ? 1 : 0;
        const bz = z >= cz ? 1 : 0;
        buckets[(bx << 2) | (by << 1) | bz].push(i);
      }
    }
    node.pointCount = flatPos.length / 3 - node.pointStart;

    for (let b = 0; b < 8; b++) {
      const bucket = buckets[b];
      if (bucket.length === 0) continue;
      const childBounds = [
        b & 4 ? cx : bounds[0],
        b & 2 ? cy : bounds[1],
        b & 1 ? cz : bounds[2],
        b & 4 ? bounds[3] : cx,
        b & 2 ? bounds[4] : cy,
        b & 1 ? bounds[5] : cz,
      ];
      const childId = build(new Uint32Array(bucket), childBounds, depth + 1);
      node.children.push(childId);
    }
    return nodeId;
  };

  const rootId = build(indices, [minX, minY, minZ, maxX, maxY, maxZ], 0);

  return {
    nodes,
    rootId,
    positions: new Float32Array(flatPos),
    colors: flatCol.length ? new Float32Array(flatCol) : new Float32Array(0),
    classIds: new Uint8Array(flatCls),
    totalPoints: count,
  };
}
