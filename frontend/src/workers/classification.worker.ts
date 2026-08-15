// Persistent classification worker: holds a copy of the active segment's
// positions/classIds and runs all heavy O(N) classification loops off the
// main thread. Results (classIds) are transferred back; the worker keeps the
// new copy so main thread and worker stay in sync.
import {
  fitWireSagFromPointCloud,
  recomputeManualClassificationsData,
  computeBoxBrushClassIds,
  computeTowerFitFromClick,
  scanInsulatorAnchors,
  detectPowerCorridorFeatures,
} from '../classification/classificationCore';
import type {
  ManualInsulatorTag,
  ManualTowerTag,
  ManualWireTag,
} from '../classification/classificationCore';

type CachedSegment = {
  positions: Float32Array;
  classIds: Uint8Array;
  pointCount: number;
  spanX: number;
  spanY: number;
  spanZ: number;
};

type WireQuery = {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  corridorRadius?: number;
};

const cache = new Map<string, CachedSegment>();

function getSegment(segmentId: string): CachedSegment | undefined {
  return cache.get(segmentId);
}

function post(id: number, data: Record<string, unknown>) {
  (self as unknown as Worker).postMessage({ requestId: id, ...data });
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as Record<string, unknown>;
  const requestId = msg.requestId as number;
  const segmentId = msg.segmentId as string;

  switch (msg.type) {
    case 'init': {
      const positions = msg.positions as Float32Array;
      const classIds = msg.classIds as Uint8Array;
      cache.set(segmentId, {
        positions,
        classIds,
        pointCount: (msg.pointCount as number) ?? positions.length / 3,
        spanX: (msg.spanX as number) ?? 1,
        spanY: (msg.spanY as number) ?? 1,
        spanZ: (msg.spanZ as number) ?? 1,
      });
      post(requestId, { type: 'initOk' });
      break;
    }

    case 'setClassIds': {
      const seg = cache.get(segmentId);
      if (seg) {
        seg.classIds = new Uint8Array(msg.classIds as ArrayBuffer);
      }
      break;
    }

    case 'recompute': {
      const seg = getSegment(segmentId);
      if (!seg) {
        post(requestId, { type: 'error', error: 'segment not initialized' });
        break;
      }
      const classIds = new Uint8Array(seg.classIds);
      const stats = recomputeManualClassificationsData(
        seg.positions,
        classIds,
        seg.pointCount,
        msg.towers as ManualTowerTag[],
        msg.wires as ManualWireTag[],
        msg.insulators as ManualInsulatorTag[] | undefined
      );
      seg.classIds = classIds;
      post(requestId, {
        type: 'recomputeResult',
        classIds: classIds.buffer as unknown as ArrayBuffer,
        stats,
      });
      break;
    }

    case 'boxBrush': {
      const seg = getSegment(segmentId);
      if (!seg) {
        post(requestId, { type: 'error', error: 'segment not initialized' });
        break;
      }
      const classIds = new Uint8Array(seg.classIds);
      const { count } = computeBoxBrushClassIds(
        seg.positions,
        classIds,
        seg.pointCount,
        msg.matrix as number[],
        msg.width as number,
        msg.height as number,
        msg.minX as number,
        msg.minY as number,
        msg.maxX as number,
        msg.maxY as number,
        msg.targetClass as number
      );
      seg.classIds = classIds;
      post(requestId, {
        type: 'boxBrushResult',
        classIds: classIds.buffer as unknown as ArrayBuffer,
        count,
      });
      break;
    }

    case 'fitSags': {
      const seg = getSegment(segmentId);
      if (!seg) {
        post(requestId, { type: 'error', error: 'segment not initialized' });
        break;
      }
      const queries = msg.queries as WireQuery[];
      const sagRatios = queries.map((q) =>
        fitWireSagFromPointCloud(seg.positions, seg.pointCount, q.start, q.end, q.corridorRadius)
      );
      post(requestId, { type: 'fitSagsResult', sagRatios });
      break;
    }

    case 'towerFit': {
      const seg = getSegment(segmentId);
      if (!seg) {
        post(requestId, { type: 'error', error: 'segment not initialized' });
        break;
      }
      const scan = computeTowerFitFromClick(
        seg.positions,
        seg.pointCount,
        msg.clickPt as { x: number; y: number; z: number },
        msg.searchRadius as number
      );
      post(requestId, { type: 'towerFitResult', scan });
      break;
    }

    case 'insulScan': {
      const seg = getSegment(segmentId);
      if (!seg) {
        post(requestId, { type: 'error', error: 'segment not initialized' });
        break;
      }
      const scans = scanInsulatorAnchors(
        seg.positions,
        seg.pointCount,
        msg.anchors as Array<{ x: number; y: number; z: number }>,
        msg.refLength as number,
        msg.refRadius as number
      );
      post(requestId, { type: 'insulScanResult', scans });
      break;
    }

    case 'detect': {
      const seg = getSegment(segmentId);
      if (!seg) {
        post(requestId, { type: 'error', error: 'segment not initialized' });
        break;
      }
      const result = detectPowerCorridorFeatures({
        positions: seg.positions,
        classIds: seg.classIds,
        pointCount: seg.pointCount,
        spanX: seg.spanX,
        spanY: seg.spanY,
        spanZ: seg.spanZ,
      });
      seg.classIds = result.classIds;
      post(requestId, {
        type: 'detectResult',
        classIds: result.classIds.buffer as unknown as ArrayBuffer,
        towers: result.towers,
        wirePointCount: result.wirePointCount,
        towerPointCount: result.towerPointCount,
        groundPointCount: result.groundPointCount,
        vegPointCount: result.vegPointCount,
      });
      break;
    }

    default:
      post(requestId, { type: 'error', error: `unknown message type: ${String(msg.type)}` });
  }
};