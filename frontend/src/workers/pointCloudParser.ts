// Pure point cloud parsers (LAS/LAZ binary, ASCII text, OTAB) that can run in a
// Web Worker so the browser main thread never blocks on parsing.

import type { OctreeData } from './octreeBuilder';

export interface ParsedPointCloudData {
  positions: Float32Array;
  classIds: Uint8Array;
  intensities: Float32Array;
  colors?: Float32Array;
  pointCount: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  spanX: number;
  spanY: number;
  spanZ: number;
  manualTowers: unknown[];
  manualWires: unknown[];
  stats: { wireCount: number; towerCount: number; groundCount: number; vegCount: number };
  octree?: OctreeData;
}

const OTAB_MAGIC = 'OTAB';
const OTAB_FLAG_HAS_COLOR = 1;
const OTAB_FLAG_HAS_INTENSITY = 2;
const OTAB_HEADER_SIZE = 36;

function readMagic(view: DataView): string {
  return String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
}

function emptyStatsData(): ParsedPointCloudData {
  return {
    positions: new Float32Array(0),
    classIds: new Uint8Array(0),
    intensities: new Float32Array(0),
    pointCount: 0,
    bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100, minZ: 0, maxZ: 50 },
    spanX: 200,
    spanY: 200,
    spanZ: 50,
    manualTowers: [],
    manualWires: [],
    stats: { wireCount: 0, towerCount: 0, groundCount: 0, vegCount: 0 },
  };
}

function parseOtab(buffer: ArrayBuffer): ParsedPointCloudData {
  const view = new DataView(buffer);
  if (buffer.byteLength < OTAB_HEADER_SIZE || readMagic(view) !== OTAB_MAGIC) {
    throw new Error('invalid OTAB file');
  }
  const version = view.getUint8(4);
  const flags = view.getUint8(5);
  const count = view.getUint32(8, true);
  if (version !== 1) throw new Error(`unsupported OTAB version ${version}`);
  if (count <= 0) throw new Error('empty OTAB file');

  const minX = view.getFloat32(12, true);
  const minY = view.getFloat32(16, true);
  const minZ = view.getFloat32(20, true);
  const maxX = view.getFloat32(24, true);
  const maxY = view.getFloat32(28, true);
  const maxZ = view.getFloat32(32, true);

  let offset = OTAB_HEADER_SIZE;
  const rawPositions = new Float32Array(buffer, offset, count * 3);
  offset += count * 3 * 4;

  const hasColor = (flags & OTAB_FLAG_HAS_COLOR) !== 0;
  const hasIntensity = (flags & OTAB_FLAG_HAS_INTENSITY) !== 0;

  const rawColors = hasColor ? new Uint8Array(buffer, offset, count * 3) : null;
  if (hasColor) offset += count * 3;

  const rawClassIds = new Uint8Array(buffer, offset, count);
  offset += count;

  const rawIntensity = hasIntensity ? new Uint16Array(buffer, offset, count) : null;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const baseZ = minZ;

  const positions = new Float32Array(count * 3);
  const classIds = new Uint8Array(count);
  const intensities = new Float32Array(count);
  const colors = hasColor ? new Float32Array(count * 3) : undefined;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = rawPositions[i3] - centerX;
    positions[i3 + 1] = rawPositions[i3 + 2] - baseZ;
    positions[i3 + 2] = -(rawPositions[i3 + 1] - centerY);

    let cls = rawClassIds[i];
    if (cls === 0) cls = 1;
    classIds[i] = cls;
    intensities[i] = rawIntensity ? Math.min(1, rawIntensity[i] / 65535) : 0.5;

    if (rawColors) {
      colors![i3] = rawColors[i3] / 255;
      colors![i3 + 1] = rawColors[i3 + 1] / 255;
      colors![i3 + 2] = rawColors[i3 + 2] / 255;
    }
  }

  return {
    positions,
    classIds,
    intensities,
    colors,
    pointCount: count,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    spanX: maxX - minX,
    spanY: maxY - minY,
    spanZ: maxZ - minZ,
    manualTowers: [],
    manualWires: [],
    stats: { wireCount: 0, towerCount: 0, groundCount: 0, vegCount: 0 },
  };
}

function parseLas(buffer: ArrayBuffer): ParsedPointCloudData {
  const view = new DataView(buffer);
  const offsetToPointData = view.getUint32(96, true);
  const pointFormat = view.getUint8(104);
  const pointRecordLength = view.getUint16(105, true) || 28;
  const legacyNumPoints = view.getUint32(107, true);

  const scaleX = view.getFloat64(131, true) || 0.01;
  const scaleY = view.getFloat64(139, true) || 0.01;
  const scaleZ = view.getFloat64(147, true) || 0.01;
  const offsetX = view.getFloat64(155, true) || 0;
  const offsetY = view.getFloat64(163, true) || 0;
  const offsetZ = view.getFloat64(171, true) || 0;
  const maxX = view.getFloat64(179, true);
  const minX = view.getFloat64(187, true);
  const maxY = view.getFloat64(195, true);
  const minY = view.getFloat64(203, true);
  const maxZ = view.getFloat64(211, true);
  const minZ = view.getFloat64(219, true);

  let totalPoints = legacyNumPoints;
  if (totalPoints === 0 || isNaN(totalPoints)) {
    totalPoints = Math.floor((buffer.byteLength - offsetToPointData) / pointRecordLength);
  }
  if (totalPoints <= 0) return emptyStatsData();

  const maxPointsToLoad = 5000000;
  const stride = Math.max(1, Math.ceil(totalPoints / maxPointsToLoad));
  const targetCount = Math.floor(totalPoints / stride);

  const positions = new Float32Array(targetCount * 3);
  const classIds = new Uint8Array(targetCount);
  const intensities = new Float32Array(targetCount);

  const hasRGB = [2, 3, 7, 8, 10].includes(pointFormat);
  let rgbOffset = 20;
  if (pointFormat === 3) rgbOffset = 28;
  else if (pointFormat === 7 || pointFormat === 8 || pointFormat === 10) rgbOffset = 30;

  let colorScale = 1.0 / 65535.0;
  if (hasRGB) {
    let maxRawRGB = 0;
    const sampleCount = Math.min(300, targetCount);
    for (let s = 0; s < sampleCount; s++) {
      const pOff = s * stride * pointRecordLength;
      if (pOff + rgbOffset + 6 <= view.byteLength) {
        const r = view.getUint16(pOff + rgbOffset, true);
        const g = view.getUint16(pOff + rgbOffset + 2, true);
        const b = view.getUint16(pOff + rgbOffset + 4, true);
        if (r > maxRawRGB) maxRawRGB = r;
        if (g > maxRawRGB) maxRawRGB = g;
        if (b > maxRawRGB) maxRawRGB = b;
      }
    }
    if (maxRawRGB > 255) colorScale = 1.0 / 65535.0;
    else if (maxRawRGB > 1) colorScale = 1.0 / 255.0;
    else colorScale = 1.0;
  }

  const colors = hasRGB ? new Float32Array(targetCount * 3) : undefined;
  const centerX = !isNaN(minX) && !isNaN(maxX) ? (minX + maxX) / 2 : 0;
  const centerY = !isNaN(minY) && !isNaN(maxY) ? (minY + maxY) / 2 : 0;
  const baseZ = !isNaN(minZ) ? minZ : 0;

  let validCount = 0;
  for (let i = 0; i < targetCount; i++) {
    const pointIdx = i * stride;
    const pOffset = offsetToPointData + pointIdx * pointRecordLength;
    if (pOffset + 16 > view.byteLength) break;

    const rawX = view.getInt32(pOffset, true);
    const rawY = view.getInt32(pOffset + 4, true);
    const rawZ = view.getInt32(pOffset + 8, true);
    const x = rawX * scaleX + offsetX;
    const y = rawY * scaleY + offsetY;
    const z = rawZ * scaleZ + offsetZ;
    const intensity = view.getUint16(pOffset + 12, true);
    let classification = view.getUint8(pOffset + 15) & 0x1f;
    if (classification === 0) classification = 1;

    const pIdx3 = validCount * 3;
    positions[pIdx3] = x - centerX;
    positions[pIdx3 + 1] = z - baseZ;
    positions[pIdx3 + 2] = -(y - centerY);
    classIds[validCount] = classification;
    intensities[validCount] = Math.min(1, intensity / 65535);

    if (hasRGB && colors && pOffset + rgbOffset + 6 <= view.byteLength) {
      colors[pIdx3] = Math.min(1.0, view.getUint16(pOffset + rgbOffset, true) * colorScale);
      colors[pIdx3 + 1] = Math.min(1.0, view.getUint16(pOffset + rgbOffset + 2, true) * colorScale);
      colors[pIdx3 + 2] = Math.min(1.0, view.getUint16(pOffset + rgbOffset + 4, true) * colorScale);
    }
    validCount++;
  }

  const finalPositions = positions.subarray(0, validCount * 3);
  const finalClassIds = classIds.subarray(0, validCount);
  const finalIntensities = intensities.subarray(0, validCount);
  let finalColors: Float32Array | undefined = undefined;
  if (colors) {
    let rgbSum = 0;
    const sampleStep = Math.max(1, Math.floor(validCount / 300));
    let samplesChecked = 0;
    for (let i = 0; i < validCount; i += sampleStep) {
      rgbSum += colors[i * 3] + colors[i * 3 + 1] + colors[i * 3 + 2];
      samplesChecked++;
    }
    if (samplesChecked > 0 && rgbSum / samplesChecked > 0.02) {
      finalColors = colors.subarray(0, validCount * 3);
    }
  }

  const sX = !isNaN(maxX) && !isNaN(minX) ? maxX - minX : 200;
  const sY = !isNaN(maxY) && !isNaN(minY) ? maxY - minY : 200;
  const sZ = !isNaN(maxZ) && !isNaN(minZ) ? maxZ - minZ : 50;

  return {
    positions: finalPositions,
    classIds: finalClassIds,
    intensities: finalIntensities,
    colors: finalColors,
    pointCount: validCount,
    bounds: { minX: minX || -100, maxX: maxX || 100, minY: minY || -100, maxY: maxY || 100, minZ: minZ || 0, maxZ: maxZ || 50 },
    spanX: sX,
    spanY: sY,
    spanZ: sZ,
    manualTowers: [],
    manualWires: [],
    stats: { wireCount: 0, towerCount: 0, groundCount: 0, vegCount: 0 },
  };
}

function parseText(buffer: ArrayBuffer): ParsedPointCloudData {
  const slice = buffer.slice(0, 100 * 1024 * 1024);
  const text = new TextDecoder('utf-8').decode(slice);
  const lines = text.split(/\r?\n/);

  const pts: Array<{ x: number; y: number; z: number; intensity: number; classId: number; r?: number; g?: number; b?: number }> = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l].trim();
    if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('ply') || line.startsWith('element') || line.startsWith('property') || line.startsWith('end_header')) continue;
    const tokens = line.split(/[\s,;]+/).map(Number).filter((n) => !isNaN(n));
    if (tokens.length < 3) continue;
    const x = tokens[0];
    const y = tokens[1];
    const z = tokens[2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;

    let intensity = 0.5;
    let classId = 1;
    let r: number | undefined;
    let g: number | undefined;
    let b: number | undefined;
    if (tokens.length === 6) {
      r = tokens[3] > 1 ? tokens[3] / 255 : tokens[3];
      g = tokens[4] > 1 ? tokens[4] / 255 : tokens[4];
      b = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
    } else if (tokens.length === 7) {
      if (tokens[3] <= 1 && tokens[4] > 1) {
        intensity = tokens[3];
        r = tokens[4] > 1 ? tokens[4] / 255 : tokens[4];
        g = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
        b = tokens[6] > 1 ? tokens[6] / 255 : tokens[6];
      } else {
        r = tokens[3] > 1 ? tokens[3] / 255 : tokens[3];
        g = tokens[4] > 1 ? tokens[4] / 255 : tokens[4];
        b = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
        intensity = tokens[6] > 1 ? tokens[6] / 255 : tokens[6];
      }
    } else if (tokens.length >= 8) {
      intensity = Math.min(1, tokens[3] / (tokens[3] > 1 ? 255 : 1));
      classId = Math.round(tokens[4]);
      if (classId < 1 || classId > 31) classId = 1;
      r = tokens[5] > 1 ? tokens[5] / 255 : tokens[5];
      g = tokens[6] > 1 ? tokens[6] / 255 : tokens[6];
      b = tokens[7] > 1 ? tokens[7] / 255 : tokens[7];
    }
    pts.push({ x, y, z, intensity, classId, r, g, b });
    if (pts.length >= 3000000) break;
  }

  if (pts.length === 0) return emptyStatsData();
  const maxPts = 3000000;
  const stride = Math.max(1, Math.ceil(pts.length / maxPts));
  const targetCount = Math.floor(pts.length / stride);
  const positions = new Float32Array(targetCount * 3);
  const classIds = new Uint8Array(targetCount);
  const intensities = new Float32Array(targetCount);
  const hasRGB = pts[0].r !== undefined;
  const colors = hasRGB ? new Float32Array(targetCount * 3) : undefined;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const baseZ = minZ;

  for (let i = 0; i < targetCount; i++) {
    const pt = pts[i * stride];
    const idx3 = i * 3;
    positions[idx3] = pt.x - centerX;
    positions[idx3 + 1] = pt.z - baseZ;
    positions[idx3 + 2] = -(pt.y - centerY);
    classIds[i] = pt.classId;
    intensities[i] = pt.intensity;
    if (colors && pt.r !== undefined) {
      colors[idx3] = pt.r;
      colors[idx3 + 1] = pt.g || 0;
      colors[idx3 + 2] = pt.b || 0;
    }
  }

  return {
    positions,
    classIds,
    intensities,
    colors,
    pointCount: targetCount,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    spanX: maxX - minX,
    spanY: maxY - minY,
    spanZ: maxZ - minZ,
    manualTowers: [],
    manualWires: [],
    stats: { wireCount: 0, towerCount: 0, groundCount: 0, vegCount: 0 },
  };
}

export function parsePointCloudArrayBuffer(buffer: ArrayBuffer, name: string): ParsedPointCloudData {
  if (buffer.byteLength < 4) return emptyStatsData();
  const magic = readMagic(new DataView(buffer));
  if (magic === OTAB_MAGIC) return parseOtab(buffer);
  if (magic === 'LASF' || /\.(las|laz)$/i.test(name)) return parseLas(buffer);
  return parseText(buffer);
}
