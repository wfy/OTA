import { parsePointCloudArrayBuffer } from './pointCloudParser';

interface ParseRequest {
  id: number;
  type: 'parse';
  buffer: ArrayBuffer;
  name: string;
}

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (ev: MessageEvent<ParseRequest>) => {
  const { id, buffer, name } = ev.data;
  try {
    const data = parsePointCloudArrayBuffer(buffer, name);
    const transfer: Transferable[] = [data.positions.buffer, data.classIds.buffer, data.intensities.buffer];
    if (data.colors) transfer.push(data.colors.buffer);
    ctx.postMessage({ id, ok: true, data }, transfer);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: String(err) });
  }
};
