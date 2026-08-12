import { useRef, useState } from 'react';

import { api } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { AnnotationPanel } from './AnnotationPanel';

const CHUNK = 8 * 1024 * 1024;

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { uploads, addUpload, updateUpload } = useAppStore();

  async function handleFile(file: File) {
    const tempId = `up-${Date.now()}`;
    addUpload({ id: tempId, filename: file.name, progress: 0, status: 'uploading', message: '初始化上传' });
    setBusy(true);
    let uploadId = tempId;
    try {
      const { upload_id } = await api.initUpload(file.name, file.size);
      uploadId = upload_id;
      updateUpload(tempId, { id: uploadId, message: '上传中' });
      for (let i = 0; i < file.size; i += CHUNK) {
        const blob = file.slice(i, Math.min(i + CHUNK, file.size));
        await api.uploadChunk(upload_id, i / CHUNK, blob);
        updateUpload(upload_id, {
          progress: Math.min(99, Math.round(((i + blob.size) / file.size) * 100)),
        });
      }
      const { las_file_id } = await api.completeUpload(upload_id);
      updateUpload(upload_id, { lasFileId: las_file_id });
      const task = await api.createTask(las_file_id);
      updateUpload(upload_id, { status: 'processing', message: '任务已提交' });
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsBase = import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;
      const ws = new WebSocket(`${wsBase}/ws/tasks/${task.id}`);
      ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.status === 'done') {
          updateUpload(upload_id, { status: 'done', progress: 100, message: '分类完成', resultKey: data.result });
          ws.close();
        } else if (data.status === 'failed') {
          updateUpload(upload_id, { status: 'failed', message: data.error });
          ws.close();
        } else {
          updateUpload(upload_id, { progress: data.progress, message: data.message });
        }
      };
    } catch (err) {
      updateUpload(uploadId, { status: 'failed', message: String(err) });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-bold">点云上传与分类</h2>
      <input
        ref={inputRef}
        type="file"
        accept=".las,.laz"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="block w-full text-xs"
      />
      <ul className="space-y-2">
        {uploads.map((u) => (
          <li key={u.id} className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="truncate">{u.filename}</span>
              <span>{u.status}</span>
            </div>
            <div className="h-1 rounded bg-white/10">
              <div className="h-1 rounded bg-emerald-400" style={{ width: `${u.progress}%` }} />
            </div>
            <p className="text-white/60">{u.message}</p>
            {u.status === 'done' && u.lasFileId && <AnnotationPanel upload={u} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
