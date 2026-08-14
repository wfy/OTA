// Front-end octree LOD renderer.
//
// Each frame it walks the octree with frustum + screen-size tests, shows the
// coarsest nodes that still meet the LOD threshold, and keeps total drawn
// points under the budget. Node meshes are cached and reused (show/hide),
// so camera movement does not rebuild GPU buffers.

import * as THREE from 'three';
import type { OctreeData, OctreeNodeData } from '../workers/octreeBuilder';

const CLASS_COLORS: Record<number, [number, number, number]> = {
  0: [0.22, 0.72, 0.97],
  1: [0.38, 0.65, 0.98],
  2: [0.85, 0.47, 0.02],
  3: [0.64, 0.9, 0.21],
  4: [0.13, 0.77, 0.37],
  5: [0.08, 0.5, 0.24],
  6: [0.98, 0.45, 0.09],
  7: [0.96, 0.25, 0.37],
  8: [1, 0, 0],
  9: [0.01, 0.52, 0.78],
  14: [0.02, 0.71, 0.83],
  15: [0.96, 0.62, 0.04],
  16: [0.85, 0.27, 0.94],
  17: [0.55, 0.36, 0.96],
};

interface CachedNode {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  lastUsed: number;
}

export class OctreeLODRenderer {
  private scene: THREE.Scene;
  private octree: OctreeData;
  private material: THREE.PointsMaterial;
  private meshes = new Map<number, CachedNode>();
  private pointSize: number;
  private budget: number;
  private screenThreshold = 56;
  private maxCached = 512;
  private frame = 0;
  private colorMode: 'rgb' | 'class' = 'rgb';
  private hasColor: boolean;
  readonly lastStats = { visibleNodes: 0, drawnPoints: 0, cachedNodes: 0 };

  private tmpFrustum = new THREE.Frustum();
  private tmpMatrix = new THREE.Matrix4();
  private tmpSphere = new THREE.Sphere();
  private tmpCenter = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    octree: OctreeData,
    hasColor: boolean,
    pointSize = 0.5,
    budget = 400000
  ) {
    this.scene = scene;
    this.octree = octree;
    this.hasColor = hasColor;
    this.pointSize = pointSize;
    this.budget = budget;
    this.material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      sizeAttenuation: true,
    });
  }

  setPointSize(size: number) {
    this.pointSize = size;
    this.material.size = size;
  }

  setBudget(budget: number) {
    this.budget = budget;
  }

  setColorMode(mode: string) {
    const next: 'rgb' | 'class' = mode === 'rgb' ? 'rgb' : 'class';
    if (next === this.colorMode) return;
    this.colorMode = next;
    for (const [, m] of this.meshes) {
      const node = this.octree.nodes.find((n) => n.id === this.meshNodeId(m));
      if (node) this.applyNodeColors(m, node);
    }
  }

  private meshNodeId(m: CachedNode): number {
    return m.geometry.userData.nodeId as number;
  }

  update(camera: THREE.PerspectiveCamera, height: number) {
    if (this.octree.rootId < 0) return;
    this.frame++;
    this.tmpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.tmpFrustum.setFromProjectionMatrix(this.tmpMatrix);

    const stack: OctreeNodeData[] = [this.octree.nodes[this.octree.rootId]];
    const candidates: Array<{ node: OctreeNodeData; score: number }> = [];

    while (stack.length) {
      const node = stack.pop()!;
      if (!this.frustumTest(node)) continue;
      const score = this.screenScore(node, camera, height);
      if (node.children.length === 0 || score < this.screenThreshold) {
        candidates.push({ node, score });
      } else {
        for (let c = node.children.length - 1; c >= 0; c--) {
          stack.push(this.octree.nodes[node.children[c]]);
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const visibleIds = new Set<number>();
    let used = 0;
    for (const cand of candidates) {
      if (used + cand.node.pointCount > this.budget) continue;
      used += cand.node.pointCount;
      visibleIds.add(cand.node.id);
    }

    for (const [id, m] of this.meshes) {
      if (!visibleIds.has(id)) m.points.visible = false;
    }
    for (const cand of candidates) {
      if (!visibleIds.has(cand.node.id)) continue;
      let m = this.meshes.get(cand.node.id);
      if (!m) {
        m = this.createMesh(cand.node);
        this.meshes.set(cand.node.id, m);
      }
      m.points.visible = true;
      m.lastUsed = this.frame;
    }
    this.lastStats.visibleNodes = visibleIds.size;
    this.lastStats.drawnPoints = used;
    this.lastStats.cachedNodes = this.meshes.size;
    this.evict();
  }

  private frustumTest(node: OctreeNodeData): boolean {
    const cx = (node.minX + node.maxX) / 2;
    const cy = (node.minY + node.maxY) / 2;
    const cz = (node.minZ + node.maxZ) / 2;
    const r =
      Math.hypot(node.maxX - node.minX, node.maxY - node.minY, node.maxZ - node.minZ) / 2;
    this.tmpSphere.center.set(cx, cy, cz);
    this.tmpSphere.radius = r;
    return this.tmpFrustum.intersectsSphere(this.tmpSphere);
  }

  private screenScore(node: OctreeNodeData, camera: THREE.PerspectiveCamera, height: number): number {
    this.tmpCenter.set(
      (node.minX + node.maxX) / 2,
      (node.minY + node.maxY) / 2,
      (node.minZ + node.maxZ) / 2
    );
    const dist = camera.position.distanceTo(this.tmpCenter);
    const radius =
      Math.hypot(node.maxX - node.minX, node.maxY - node.minY, node.maxZ - node.minZ) / 2;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    return (radius / Math.max(dist, 1e-3)) / Math.tan(fov / 2) * (height / 2);
  }

  private createMesh(node: OctreeNodeData): CachedNode {
    const n = node.pointCount;
    const pos = new Float32Array(
      this.octree.positions.buffer,
      node.pointStart * 12,
      n * 3
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.userData.nodeId = node.id;

    const points = new THREE.Points(geometry, this.material);
    points.visible = false;
    points.frustumCulled = false; // our own culling
    this.scene.add(points);

    const cached: CachedNode = { points, geometry, lastUsed: 0 };
    this.applyNodeColors(cached, node);
    return cached;
  }

  private applyNodeColors(m: CachedNode, node: OctreeNodeData) {
    const n = node.pointCount;
    const colors = new Float32Array(n * 3);
    const useRgb = this.colorMode === 'rgb' && this.hasColor && this.octree.colors.length > 0;
    for (let k = 0; k < n; k++) {
      const i3 = k * 3;
      if (useRgb) {
        const src = node.pointStart * 3 + i3;
        colors[i3] = this.octree.colors[src];
        colors[i3 + 1] = this.octree.colors[src + 1];
        colors[i3 + 2] = this.octree.colors[src + 2];
      } else {
        const cls = this.octree.classIds[node.pointStart + k];
        const c = CLASS_COLORS[cls] || [0.58, 0.65, 0.73];
        colors[i3] = c[0];
        colors[i3 + 1] = c[1];
        colors[i3 + 2] = c[2];
      }
    }
    const attr = m.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (attr) {
      (attr.array as Float32Array).set(colors);
      attr.needsUpdate = true;
    } else {
      m.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
  }

  private evict() {
    if (this.meshes.size <= this.maxCached) return;
    const stale = [...this.meshes.entries()]
      .filter(([, m]) => m.lastUsed !== this.frame)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const removeCount = this.meshes.size - this.maxCached;
    for (let i = 0; i < removeCount && i < stale.length; i++) {
      const [id, m] = stale[i];
      this.scene.remove(m.points);
      m.geometry.dispose();
      this.meshes.delete(id);
    }
  }

  dispose() {
    for (const [, m] of this.meshes) {
      this.scene.remove(m.points);
      m.geometry.dispose();
    }
    this.meshes.clear();
    this.material.dispose();
  }
}
