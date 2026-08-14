import { create } from 'zustand';

export interface UploadItem {
  id: string;
  filename: string;
  segmentId?: string;
  lasFileId?: string;
  progress: number;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  message: string;
  resultKey?: string;
  resultBinKey?: string;
}

interface AppState {
  uploads: UploadItem[];
  addUpload: (item: UploadItem) => void;
  updateUpload: (id: string, patch: Partial<UploadItem>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  uploads: [],
  addUpload: (item) => set((s) => ({ uploads: [...s.uploads, item] })),
  updateUpload: (id, patch) =>
    set((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
}));
