import { useState } from 'react';

import { AnnotationOut, api } from '../api/client';
import { UploadItem } from '../store/useAppStore';

const LABELS = ['ground', 'vegetation', 'wire', 'tower', 'insulator'];
const BBOX_KEYS = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'] as const;

export function AnnotationPanel({ upload }: { upload: UploadItem }) {
  const [label, setLabel] = useState('tower');
  const [bbox, setBbox] = useState<Record<string, number>>({
    minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
  });
  const [annotations, setAnnotations] = useState<AnnotationOut[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!upload.lasFileId) return;
    setAnnotations(await api.listAnnotations(upload.lasFileId));
  }

  async function submit() {
    if (!upload.lasFileId) return;
    setBusy(true);
    try {
      await api.createAnnotation({
        las_file_id: upload.lasFileId,
        label,
        source: 'box',
        bbox,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function exportLabels() {
    if (!upload.lasFileId) return;
    setBusy(true);
    try {
      const out = await api.exportAnnotations(upload.lasFileId);
      const blob = await fetch(out.url).then((r) => r.blob());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `labeled_${upload.filename}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <h3 className="text-xs font-bold">标注</h3>
      <div className="flex gap-2">
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-xs bg-slate-900/60 rounded px-2 py-1"
        >
          {LABELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button onClick={load} disabled={busy} className="text-xs px-2 py-1 rounded bg-white/10">刷新</button>
        <button onClick={exportLabels} disabled={busy} className="text-xs px-2 py-1 rounded bg-emerald-500/80">导出训练集</button>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        {BBOX_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-1">
            <span className="w-8">{k}</span>
            <input
              type="number"
              step="any"
              value={bbox[k]}
              onChange={(e) => setBbox({ ...bbox, [k]: Number(e.target.value) })}
              className="w-full bg-slate-900/60 rounded px-1 py-0.5"
            />
          </label>
        ))}
      </div>
      <button onClick={submit} disabled={busy} className="text-xs px-3 py-1 rounded bg-sky-500/80">提交标注</button>
      <ul className="text-[10px] text-white/70 space-y-1">
        {annotations.map((a) => (
          <li key={a.id}>{a.label} · {a.points_count} 点 · {a.source}</li>
        ))}
      </ul>
    </div>
  );
}
