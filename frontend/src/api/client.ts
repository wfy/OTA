const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface UploadInitResponse {
  upload_id: string;
  chunk_size: number;
}

export interface TaskOut {
  id: string;
  las_file_id: string;
  pipeline: string;
  status: string;
  progress: number;
  message: string;
  result_las_key: string;
  error: string;
}

export interface AnnotationOut {
  id: string;
  las_file_id: string;
  label: string;
  source: string;
  bbox: Record<string, number> | null;
  points_count: number;
  created_at: string;
}

export interface AnnotationExportOut {
  key: string;
  url: string;
  counts: Record<string, number>;
}

export const api = {
  initUpload: (filename: string, size: number) =>
    jsonFetch<UploadInitResponse>('/files/init', {
      method: 'POST',
      body: JSON.stringify({ filename, size }),
    }),
  uploadChunk: (uploadId: string, index: number, data: Blob) =>
    fetch(`${BASE}/files/${uploadId}/chunks/${index}`, { method: 'PUT', body: data }),
  completeUpload: (uploadId: string) =>
    jsonFetch<{ las_file_id: string; storage_key: string }>(`/files/${uploadId}/complete`, {
      method: 'POST',
    }),
  createTask: (lasFileId: string, pipeline = 'geometry-v1') =>
    jsonFetch<TaskOut>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ las_file_id: lasFileId, pipeline }),
    }),
  getTask: (taskId: string) => jsonFetch<TaskOut>(`/tasks/${taskId}`),
  resultUrl: (key: string) => `${BASE}/files/raw/${key}`,
  createAnnotation: (input: {
    las_file_id: string;
    label: string;
    source: string;
    bbox?: Record<string, number>;
    points?: number[];
  }) =>
    jsonFetch<AnnotationOut>('/annotations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listAnnotations: (lasFileId: string) =>
    jsonFetch<AnnotationOut[]>(`/annotations?las_file_id=${lasFileId}`),
  exportAnnotations: (lasFileId: string) =>
    jsonFetch<AnnotationExportOut>('/annotations/export', {
      method: 'POST',
      body: JSON.stringify({ las_file_id: lasFileId }),
    }),
};
