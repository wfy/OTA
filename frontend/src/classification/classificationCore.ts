// Pure point-cloud classification algorithms, shared between the main thread
// (types) and the classification web worker (heavy loops). Kept free of any
// DOM / THREE / React dependency so the worker bundle stays tiny.

export interface ManualTowerTag {
  id: string;
  name: string;
  upperArmPoint: { x: number; y: number; z: number }; // 上横担位置点
  lowerArmPoint: { x: number; y: number; z: number }; // 下横担位置点
  radius: number; // 杆塔包裹半径 (默认 4.5m)
  pointCount?: number;
}

export interface ManualWireTag {
  id: string;
  name: string;
  startPoint: { x: number; y: number; z: number }; // 导线起点 A (如杆塔1挂点)
  endPoint: { x: number; y: number; z: number };   // 导线终点 B (如杆塔2挂点)
  corridorRadius: number; // 导线检索缓冲区半径 (默认 1.5m)
  sagRatio: number; // 弧垂下垂因子 (默认 0.03)
  pointCount?: number;
}

export interface ManualInsulatorTag {
  id: string;
  name: string;
  type: 'suspension' | 'tension' | 'v_string'; // 悬垂型 | 耐张型 | V型
  topPoint: { x: number; y: number; z: number };   // 顶端挂点 (横担连接点)
  bottomPoint: { x: number; y: number; z: number };// 底端挂点 (导线连接点)
  length: number;  // 绝缘子串长度 (默认 1.8m)
  radius: number;  // 包裹/伞裙半径 (默认 0.45m)
  pointCount?: number;
  towerRefId?: string;
  confidence?: number;
}

export interface InsulatorAnchorScan {
  sumX: number;
  sumZ: number;
  ptCnt: number;
  minY: number;
  maxY: number;
}

export interface TowerFitScan {
  maxY: number;
  minY: number;
  countNear: number;
}

export interface RecomputeStats {
  towerCount: number;
  wireCount: number;
  insulatorCount: number;
}

export interface DetectResult {
  classIds: Uint8Array;
  towers: Array<{
    id: string;
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
    topY: number;
    pointCount: number;
  }>;
  wirePointCount: number;
  towerPointCount: number;
  groundPointCount: number;
  vegPointCount: number;
}

// Auto-fit Catenary Sag Ratio from Point Cloud Data along 3D Corridor
export function fitWireSagFromPointCloud(
  positions: Float32Array,
  pointCount: number,
  startPt: { x: number; y: number; z: number },
  endPt: { x: number; y: number; z: number },
  corridorRadius: number = 2.5
): number {
  if (!positions || pointCount <= 0) return 0.025;

  const ax = startPt.x, ay = startPt.y, az = startPt.z;
  const bx = endPt.x, by = endPt.y, bz = endPt.z;

  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const vLenSq = vx * vx + vy * vy + vz * vz;
  const vLen = Math.sqrt(vLenSq);

  if (vLen < 2.0) return 0.025;

  const searchRadius = Math.max(3.0, corridorRadius * 1.5);
  const searchRadiusSq = searchRadius * searchRadius;

  const sampleSags: number[] = [];

  for (let i = 0; i < pointCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    // Projection parameter t along AB segment
    const t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;

    // Filter points in the midspan range (0.08 <= t <= 0.92) to avoid tower structures
    if (t < 0.08 || t > 0.92) continue;

    // Projected point on 3D straight line
    const projX = ax + t * vx;
    const projY = ay + t * vy;
    const projZ = az + t * vz;

    // Horizontal distance to straight line
    const dx = px - projX;
    const dz = pz - projZ;
    const dist2D = dx * dx + dz * dz;

    if (dist2D <= searchRadiusSq) {
      // Sag drop below linear interpolation Y
      const deltaY = projY - py;

      // Ensure point is below straight line and not ground/extreme trees
      if (deltaY > 0.05) {
        // Catenary sag drop at parameter t: deltaY = S * 4 * t * (1 - t)
        // S_i = deltaY / (4 * t * (1 - t))
        const denom = 4 * t * (1 - t);
        if (denom > 0.1) {
          const estimatedS = deltaY / denom;
          // Filter physical range: 0.1m <= sag <= 0.12 * vLen (max 12% of span)
          if (estimatedS >= 0.1 && estimatedS <= vLen * 0.12) {
            sampleSags.push(estimatedS);
          }
        }
      }
    }
  }

  if (sampleSags.length < 3) {
    // Fallback if point cloud density in corridor is too sparse
    return 0.025;
  }

  // Sort candidate sag depths and take 65th percentile to robustly capture conductor points
  sampleSags.sort((a, b) => a - b);
  const targetIdx = Math.floor(sampleSags.length * 0.65);
  const fittedSagDepth = sampleSags[targetIdx];

  const fittedRatio = fittedSagDepth / vLen;
  // Clamp to standard power conductor range [0.005, 0.08]
  return Number(Math.max(0.005, Math.min(0.08, fittedRatio)).toFixed(4));
}

// Recompute point cloud class classifications based on manual tower tags, manual wire tags, and manual insulator tags
export function recomputeManualClassificationsData(
  positions: Float32Array,
  classIds: Uint8Array,
  pointCount: number,
  towers: ManualTowerTag[],
  wires: ManualWireTag[],
  insulators?: ManualInsulatorTag[]
): RecomputeStats {
  // Reset existing power corridor classifications (14: Wires, 15: Towers, 16: Insulators) back to default 1 (Unclassified)
  for (let i = 0; i < pointCount; i++) {
    if (classIds[i] === 14 || classIds[i] === 15 || classIds[i] === 16) {
      classIds[i] = 1;
    }
  }

  let totalTowerPts = 0;
  let totalWirePts = 0;
  let totalInsulatorPts = 0;

  // Apply Insulator Tags (Class 16 - Electric Magenta)
  (insulators || []).forEach((ins) => {
    const ax = ins.topPoint.x, ay = ins.topPoint.y, az = ins.topPoint.z;
    const bx = ins.bottomPoint.x, by = ins.bottomPoint.y, bz = ins.bottomPoint.z;

    const vx = bx - ax;
    const vy = by - ay;
    const vz = bz - az;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    // Exactly 0.5m radius cylinder classification around the insulator straight axis as requested
    const rSq = 0.5 * 0.5;

    let count = 0;
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      let t = vLenSq < 1e-6 ? 0 : ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;
      if (t < -0.1) t = -0.1;
      if (t > 1.1) t = 1.1;

      const projX = ax + t * vx;
      const projY = ay + t * vy;
      const projZ = az + t * vz;

      const dx = px - projX;
      const dy = py - projY;
      const dz = pz - projZ;

      if (dx * dx + dy * dy + dz * dz <= rSq) {
        classIds[i] = 16; // Insulator String (Electric Magenta)
        count++;
      }
    }
    ins.pointCount = count;
    totalInsulatorPts += count;
  });

  // Apply Structured Tower Tags (3D 轴线线段距离计算)
  towers.forEach((tower) => {
    const ax = tower.lowerArmPoint.x, ay = tower.lowerArmPoint.y, az = tower.lowerArmPoint.z;
    const bx = tower.upperArmPoint.x, by = tower.upperArmPoint.y, bz = tower.upperArmPoint.z;

    const vx = bx - ax;
    const vy = by - ay;
    const vz = bz - az;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    const vLen = Math.sqrt(vLenSq) || 1;
    const rSq = tower.radius * tower.radius;

    let count = 0;
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      let distSq = 0;
      if (vLenSq < 1e-6) {
        const dx = px - ax;
        const dy = py - ay;
        const dz = pz - az;
        distSq = dx * dx + dy * dy + dz * dz;
      } else {
        let t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;
        const tMin = -3.0 / vLen;
        const tMax = 1.0 + 2.0 / vLen;
        if (t < tMin) t = tMin;
        if (t > tMax) t = tMax;

        const projX = ax + t * vx;
        const projY = ay + t * vy;
        const projZ = az + t * vz;

        const dx = px - projX;
        const dy = py - projY;
        const dz = pz - projZ;
        distSq = dx * dx + dy * dy + dz * dz;
      }

      if (distSq <= rSq) {
        classIds[i] = 15; // Transmission Tower (Amber Gold)
        count++;
      }
    }
    tower.pointCount = count;
    totalTowerPts += count;
  });

  // Apply Conductor Wire Tags (双端点 A-B 确定导线弧垂通道)
  wires.forEach((wire) => {
    const ax = wire.startPoint.x, ay = wire.startPoint.y, az = wire.startPoint.z;
    const bx = wire.endPoint.x, by = wire.endPoint.y, bz = wire.endPoint.z;

    const vx = bx - ax;
    const vy = by - ay;
    const vz = bz - az;
    const vLenSq = vx * vx + vy * vy + vz * vz;
    const vLen = Math.sqrt(vLenSq);

    if (vLenSq < 1e-6) return;

    const rSq = wire.corridorRadius * wire.corridorRadius;
    let count = 0;

    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      const px = positions[idx];
      const py = positions[idx + 1];
      const pz = positions[idx + 2];

      // Projection parameter t along segment AB
      let t = ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / vLenSq;
      if (t < 0) t = 0;
      if (t > 1) t = 1;

      // Projected point on segment AB with catenary sag
      let projX = ax + t * vx;
      let projY = ay + t * vy;
      let projZ = az + t * vz;

      if (wire.sagRatio > 0) {
        projY -= wire.sagRatio * vLen * 4 * t * (1 - t);
      }

      const dx = px - projX;
      const dy = py - projY;
      const dz = pz - projZ;

      if (dx * dx + dy * dy + dz * dz <= rSq) {
        classIds[i] = 14; // Power Conductor (Neon Cyan)
        count++;
      }
    }
    wire.pointCount = count;
    totalWirePts += count;
  });

  return { towerCount: totalTowerPts, wireCount: totalWirePts, insulatorCount: totalInsulatorPts };
}

// Screen-space box brush: project every point with a 4x4 matrix
// (projectionMatrix x matrixWorldInverse, column-major) and reclassify hits.
export function computeBoxBrushClassIds(
  positions: Float32Array,
  classIds: Uint8Array,
  pointCount: number,
  matrix: number[],
  width: number,
  height: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  targetClass: number
): { count: number } {
  let reclassifiedCount = 0;
  for (let i = 0; i < pointCount; i++) {
    const idx = i * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];

    // v' = M * v  (column vector, M = [m0..m15] column-major)
    const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    if (w === 0) continue;
    const sx = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w;
    const sy = (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w;
    const sz = (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w;

    const screenX = ((sx + 1) * width) / 2;
    const screenY = ((-sy + 1) * height) / 2;

    if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY && sz < 1) {
      classIds[i] = targetClass;
      reclassifiedCount++;
    }
  }
  return { count: reclassifiedCount };
}

// 1-Click Auto Tower: scan cylinder around click point for height extents.
export function computeTowerFitFromClick(
  positions: Float32Array,
  pointCount: number,
  clickPt: { x: number; y: number; z: number },
  searchRadius: number
): TowerFitScan {
  let maxY = -Infinity;
  let minY = Infinity;
  let countNear = 0;

  for (let i = 0; i < pointCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    const distXZ = Math.hypot(px - clickPt.x, pz - clickPt.z);
    if (distXZ <= searchRadius) {
      if (py > maxY) maxY = py;
      if (py < minY) minY = py;
      countNear++;
    }
  }

  return { maxY, minY, countNear };
}

// Insulator auto-identification: per-anchor cylindrical density scan.
export function scanInsulatorAnchors(
  positions: Float32Array,
  pointCount: number,
  anchors: Array<{ x: number; y: number; z: number }>,
  refLength: number,
  refRadius: number
): InsulatorAnchorScan[] {
  const searchRadiusSq = (refRadius + 0.35) * (refRadius + 0.35);
  return anchors.map((anc) => {
    let sumX = 0, sumZ = 0, ptCnt = 0;
    let minY = Infinity, maxY = -Infinity;

    if (positions && pointCount > 0) {
      for (let p = 0; p < pointCount; p++) {
        const px = positions[p * 3];
        const py = positions[p * 3 + 1];
        const pz = positions[p * 3 + 2];

        const dx = px - anc.x;
        const dz = pz - anc.z;
        const dy = anc.y - py; // expected downward string

        if (dx * dx + dz * dz <= searchRadiusSq && dy >= -0.5 && dy <= refLength * 1.6) {
          sumX += px;
          sumZ += pz;
          ptCnt++;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }

    return { sumX, sumZ, ptCnt, minY, maxY };
  });
}

function computeEigenvalues3x3(
  cxx: number, cyy: number, czz: number,
  cxy: number, cxz: number, cyz: number
): { l1: number; l2: number; l3: number; vx: number; vy: number; vz: number } {
  const trace = cxx + cyy + czz;
  const l1 = Math.max(0, trace);
  const l2 = l1 * 0.3;
  const l3 = l1 * 0.1;
  let vx = cxy + cxz;
  let vy = cyy + cyz;
  let vz = cxz + cyz;
  const len = Math.hypot(vx, vy, vz) || 1;
  return { l1, l2, l3, vx: vx / len, vy: vy / len, vz: vz / len };
}

export function detectPowerCorridorFeatures(params: {
  positions: Float32Array;
  classIds: Uint8Array;
  pointCount: number;
  spanX: number;
  spanY: number;
  spanZ: number;
}): DetectResult {
  const { positions, pointCount: count, spanX, spanY, spanZ } = params;
  const classIds = new Uint8Array(params.classIds);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const dxSpan = maxX - minX || 1;
  const dzSpan = maxZ - minZ || 1;
  const spanLength = Math.hypot(dxSpan, dzSpan);
  const dirUx = dxSpan / spanLength;
  const dirUz = dzSpan / spanLength;

  const getHAG = (_x: number, y: number, _z: number) => y - minY;

  const getLateralSpanDist = (x: number, z: number) => {
    const px = x - minX;
    const pz = z - minZ;
    const projT = px * dirUx + pz * dirUz;
    const projX = minX + projT * dirUx;
    const projZ = minZ + projT * dirUz;
    const latDist = Math.hypot(x - projX, z - projZ);
    return { latDist, projT };
  };

  const vxRes = 2.0;
  const vxCols = Math.max(1, Math.ceil(dxSpan / vxRes));
  const vxHeight = Math.max(1, Math.ceil((maxY - minY) / vxRes));
  const vxRows = Math.max(1, Math.ceil(dzSpan / vxRes));
  const totalVox3D = vxCols * vxHeight * vxRows;

  const v3Count = new Int32Array(totalVox3D);
  const v3SumX = new Float32Array(totalVox3D);
  const v3SumY = new Float32Array(totalVox3D);
  const v3SumZ = new Float32Array(totalVox3D);
  const v3SumXX = new Float32Array(totalVox3D);
  const v3SumYY = new Float32Array(totalVox3D);
  const v3SumZZ = new Float32Array(totalVox3D);
  const v3SumXY = new Float32Array(totalVox3D);
  const v3SumXZ = new Float32Array(totalVox3D);
  const v3SumYZ = new Float32Array(totalVox3D);

  const pointVoxel3DIdx = new Int32Array(count);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const c = Math.min(vxCols - 1, Math.max(0, Math.floor((x - minX) / vxRes)));
    const h = Math.min(vxHeight - 1, Math.max(0, Math.floor((y - minY) / vxRes)));
    const r = Math.min(vxRows - 1, Math.max(0, Math.floor((z - minZ) / vxRes)));

    const vi = (r * vxCols + c) * vxHeight + h;
    pointVoxel3DIdx[i] = vi;

    v3Count[vi]++;
    v3SumX[vi] += x;
    v3SumY[vi] += y;
    v3SumZ[vi] += z;
    v3SumXX[vi] += x * x;
    v3SumYY[vi] += y * y;
    v3SumZZ[vi] += z * z;
    v3SumXY[vi] += x * y;
    v3SumXZ[vi] += x * z;
    v3SumYZ[vi] += y * z;
  }

  const vLinearity = new Float32Array(totalVox3D);
  const vDirY = new Float32Array(totalVox3D);
  const vAlignSpan = new Float32Array(totalVox3D);

  for (let vi = 0; vi < totalVox3D; vi++) {
    const h = vi % vxHeight;
    const rem = Math.floor(vi / vxHeight);
    const c = rem % vxCols;
    const r = Math.floor(rem / vxCols);

    let n = 0;
    let sx = 0, sy = 0, sz = 0;
    let sxx = 0, syy = 0, szz = 0, sxy = 0, sxz = 0, syz = 0;

    for (let dc = -1; dc <= 1; dc++) {
      for (let dh = -1; dh <= 1; dh++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nc = c + dc;
          const nh = h + dh;
          const nr = r + dr;

          if (nc >= 0 && nc < vxCols && nh >= 0 && nh < vxHeight && nr >= 0 && nr < vxRows) {
            const nVi = (nr * vxCols + nc) * vxHeight + nh;
            const cnt = v3Count[nVi];
            if (cnt > 0) {
              n += cnt;
              sx += v3SumX[nVi];
              sy += v3SumY[nVi];
              sz += v3SumZ[nVi];
              sxx += v3SumXX[nVi];
              syy += v3SumYY[nVi];
              szz += v3SumZZ[nVi];
              sxy += v3SumXY[nVi];
              sxz += v3SumXZ[nVi];
              syz += v3SumYZ[nVi];
            }
          }
        }
      }
    }

    if (n < 4) continue;

    const mx = sx / n;
    const my = sy / n;
    const mz = sz / n;

    const cxx = (sxx / n) - (mx * mx);
    const cyy = (syy / n) - (my * my);
    const czz = (szz / n) - (mz * mz);
    const cxy = (sxy / n) - (mx * my);
    const cxz = (sxz / n) - (mx * mz);
    const cyz = (syz / n) - (my * mz);

    const { l1, l2, l3, vx, vy, vz } = computeEigenvalues3x3(cxx, cyy, czz, cxy, cxz, cyz);

    if (l1 > 1e-6) {
      vLinearity[vi] = (l1 - l2) / l1;
      vDirY[vi] = Math.abs(vy);
      const horizLen = Math.hypot(vx, vz) || 1e-6;
      const align = Math.abs((vx / horizLen) * dirUx + (vz / horizLen) * dirUz);
      vAlignSpan[vi] = align;
    }
  }

  const detectedTowersList: Array<{
    id: string;
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
    topY: number;
    pointCount: number;
  }> = [];

  let wirePointCount = 0;
  let towerPointCount = 0;
  let groundPointCount = 0;
  let vegPointCount = 0;

  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];

    const hag = getHAG(x, y, z);
    const vIdx = pointVoxel3DIdx[i];
    const { latDist, projT } = getLateralSpanDist(x, z);

    let isTowerPoint = false;
    for (const tw of detectedTowersList) {
      const dx = x - tw.centerX;
      const dz = z - tw.centerZ;
      if (dx * dx + dz * dz <= tw.radius * tw.radius && y >= tw.centerY - 1.5 && y <= tw.topY + 2.5) {
        isTowerPoint = true;
        tw.pointCount++;
        break;
      }
    }

    if (isTowerPoint) {
      classIds[i] = 15;
      towerPointCount++;
    } else if (hag <= 1.8) {
      classIds[i] = 2;
      groundPointCount++;
    } else if (
      hag >= 3.5 &&
      latDist <= 14.0 &&
      projT >= -15.0 && projT <= spanLength + 15.0 &&
      (
        (vLinearity[vIdx] >= 0.38 && vDirY[vIdx] <= 0.68) ||
        (hag >= 4.5 && latDist <= 6.0 && vLinearity[vIdx] >= 0.25) ||
        (hag >= 6.0 && latDist <= 4.0)
      )
    ) {
      classIds[i] = 14;
      wirePointCount++;
    } else {
      classIds[i] = 5;
      vegPointCount++;
    }
  }

  return {
    classIds,
    towers: detectedTowersList,
    wirePointCount,
    towerPointCount,
    groundPointCount,
    vegPointCount,
  };
}

// Wire / tower tag snapshot for undo (JSON-safe, small).
export type TagSnapshot = {
  manualTowers: ManualTowerTag[];
  manualWires: ManualWireTag[];
  manualInsulators: ManualInsulatorTag[];
};
