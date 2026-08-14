import { describe, expect, it } from 'vitest';
import { buildOctree } from './octreeBuilder';

describe('octreeBuilder', () => {
  it('stores every point exactly once and respects node limits', () => {
    const count = 20000;
    const positions = new Float32Array(count * 3);
    const classIds = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (i % 100) * 0.5;
      positions[i * 3 + 1] = Math.floor(i / 100) * 0.3;
      positions[i * 3 + 2] = (i % 37) * 0.2;
      classIds[i] = (i % 5) + 1;
    }

    const tree = buildOctree(positions, classIds, null, {
      maxPointsPerNode: 1000,
      maxDepth: 6,
    });

    expect(tree.totalPoints).toBe(count);
    expect(tree.rootId).toBe(0);
    const sum = tree.nodes.reduce((acc, n) => acc + n.pointCount, 0);
    expect(sum).toBe(count);
    expect(tree.positions.length).toBe(count * 3);
    expect(tree.classIds.length).toBe(count);
    expect(tree.nodes.every((n) => n.pointCount <= 1000)).toBe(true);

    // Every node's points must lie inside its bounds (sample a few nodes).
    for (const node of tree.nodes.slice(0, 40)) {
      for (let k = 0; k < Math.min(node.pointCount, 20); k++) {
        const i3 = (node.pointStart + k) * 3;
        expect(tree.positions[i3]).toBeGreaterThanOrEqual(node.minX - 1e-6);
        expect(tree.positions[i3]).toBeLessThanOrEqual(node.maxX + 1e-6);
        expect(tree.positions[i3 + 1]).toBeGreaterThanOrEqual(node.minY - 1e-6);
        expect(tree.positions[i3 + 1]).toBeLessThanOrEqual(node.maxY + 1e-6);
        expect(tree.positions[i3 + 2]).toBeGreaterThanOrEqual(node.minZ - 1e-6);
        expect(tree.positions[i3 + 2]).toBeLessThanOrEqual(node.maxZ + 1e-6);
      }
    }
  });

  it('returns empty tree for empty input', () => {
    const tree = buildOctree(new Float32Array(0), new Uint8Array(0), null);
    expect(tree.rootId).toBe(-1);
    expect(tree.totalPoints).toBe(0);
  });
});
