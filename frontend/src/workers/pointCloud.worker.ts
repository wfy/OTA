import { parsePointCloudArrayBuffer } from './pointCloudParser';
import { buildOctree } from './octreeBuilder';

interface ParseRequest {
  id: number;
  type: 'parse';
  buffer: ArrayBuffer;
  name: string;
  buildOctree?: boolean;
}

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (ev: MessageEvent<ParseRequest>) => {
  const { id, buffer, name, buildOctree: wantOctree } = ev.data;
  try {
    const data = parsePointCloudArrayBuffer(buffer, name);
    if (wantOctree && data.pointCount > 0) {
      data.octree = buildOctree(data.positions, data.classIds, data.colors ?? null, {});
    }
    const transfer: Transferable[] = [data.positions.buffer, data.classIds.buffer, data.intensities.buffer];
    if (data.colors) transfer.push(data.colors.buffer);
    if (data.octree) {
      transfer.push(data.octree.positions.buffer, data.octree.colors.buffer, data.octree.classIds.buffer);
    }
    ctx.postMessage({ id, ok: true, data }, transfer);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: String(err) });
  }
};
