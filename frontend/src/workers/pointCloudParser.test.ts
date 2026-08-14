import { describe, expect, it } from 'vitest';
import { parsePointCloudArrayBuffer } from './pointCloudParser';

function buildOtabBuffer(): ArrayBuffer {
  const count = 3;
  const hasColor = true;
  const hasIntensity = true;
  const header = 36;
  const posBytes = count * 3 * 4;
  const colorBytes = count * 3;
  const buf = new ArrayBuffer(header + posBytes + colorBytes + count + count * 2);
  const view = new DataView(buf);
  'OTAB'.split('').forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint8(4, 1); // version
  view.setUint8(5, (hasColor ? 1 : 0) | (hasIntensity ? 2 : 0));
  view.setUint32(8, count, true);
  view.setFloat32(12, 0, true); // minX
  view.setFloat32(16, 20, true); // minY
  view.setFloat32(20, 30, true); // minZ
  view.setFloat32(24, 10, true); // maxX
  view.setFloat32(28, 50, true); // maxY
  view.setFloat32(32, 90, true); // maxZ

  const positions = new Float32Array(buf, header, count * 3);
  positions.set([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  const colors = new Uint8Array(buf, header + posBytes, count * 3);
  colors.set([255, 0, 0, 0, 255, 0, 0, 0, 255]);
  const classIds = new Uint8Array(buf, header + posBytes + colorBytes, count);
  classIds.set([0, 14, 15]);
  const intensity = new Uint16Array(buf, header + posBytes + colorBytes + count, count);
  intensity.set([65535, 32768, 0]);
  return buf;
}

describe('pointCloudParser', () => {
  it('parses OTAB with centering, color, class and intensity mapping', () => {
    const data = parsePointCloudArrayBuffer(buildOtabBuffer(), 'corridor.otabin');
    expect(data.pointCount).toBe(3);
    // raw(10,20,30), center(5,35), baseZ=30 -> (5, 0, 15)
    expect(Array.from(data.positions.slice(0, 3))).toEqual([5, 0, 15]);
    expect(Array.from(data.positions.slice(3, 6))).toEqual([35, 30, -15]);
    expect(Array.from(data.classIds)).toEqual([1, 14, 15]);
    expect(data.intensities[0]).toBe(1);
    expect(data.intensities[1]).toBeCloseTo(32768 / 65535, 5);
    expect(data.colors?.[0]).toBe(1);
    expect(data.colors?.[4]).toBe(1);
    expect(data.colors?.[8]).toBe(1);
    expect(data.bounds.maxZ).toBe(90);
  });

  it('returns empty stats for invalid input', () => {
    const data = parsePointCloudArrayBuffer(new ArrayBuffer(2), 'bad.bin');
    expect(data.pointCount).toBe(0);
  });
});
