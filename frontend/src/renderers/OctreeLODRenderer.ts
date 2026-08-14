// Front-end octree LOD renderer.
//
// Each frame it walks the octree with frustum + screen-size tests, shows the
// coarsest nodes that still meet the LOD threshold, and keeps total drawn
// points under the budget. Node meshes are cached and reused (show/hide),
// so camera movement does not rebuild GPU buffers.

import * as THREE from 'three';
import type { OctreeData, OctreeNodeData } from '../workers/octreeBuilder';

interface CachedNode {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  lastUsed: number;
}

export class OctreeLODRenderer {
  private scene: THREE.Scene;
  private octree: OctreeData;
  private material: THREE.Material;
  private meshes = new Map<number, CachedNode>();
  private budget: number;
  private screenThreshold = 96;
  private maxCached = 512;
  private frame = 0;
  private preloaded = false;
  readonly lastStats = { visibleNodes: 0, drawnPoints: 0, cachedNodes: 0 };
  private updateMs = 0;

  /**
   * Pre-create node meshes in small batches so camera movement never triggers
   * GPU buffer creation (the main source of rotation stutter).
   * Returns true when all nodes are preloaded.
   */
  preloadStep(limit = 24): boolean {
    if (this.preloaded) return true;
    let created = 0;
    for (const node of this.octree.nodes) {
      if (this.meshes.has(node.id)) continue;
      this.meshes.set(node.id, this.createMesh(node));
      created++;
      if (created >= limit) return false;
    }
    this.preloaded = true;
    return true;
  }

  private tmpFrustum = new THREE.Frustum();
  private tmpMatrix = new THREE.Matrix4();
  private tmpSphere = new THREE.Sphere();
  private tmpCenter = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    octree: OctreeData,
    material: THREE.Material,
    budget = 400000
  ) {
    this.scene = scene;
    this.octree = octree;
    this.material = material;
    this.budget = budget;
  }

  setBudget(budget: number) {
    this.budget = budget;
  }

  update(camera: THREE.PerspectiveCamera, height: number) {
    if (this.octree.rootId < 0) return;
    const t0 = performance.now();
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
    this.updateMs = performance.now() - t0;
    (this.lastStats as { updateMs?: number }).updateMs = this.updateMs;
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
    const colors = this.octree.colors.length
      ? new Float32Array(this.octree.colors.buffer, node.pointStart * 12, n * 3)
      : new Float32Array(n * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const cls = new Float32Array(n);
    for (let k = 0; k < n; k++) cls[k] = this.octree.classIds[node.pointStart + k];
    geometry.setAttribute('classification', new THREE.BufferAttribute(cls, 1));
    geometry.setAttribute('intensity', new THREE.BufferAttribute(new Float32Array(n).fill(0.5), 1));
    geometry.userData.nodeId = node.id;

    const points = new THREE.Points(geometry, this.material);
    points.visible = false;
    points.frustumCulled = false; // our own culling
    this.scene.add(points);

    const cached: CachedNode = { points, geometry, lastUsed: 0 };
    return cached;
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
  }
}
