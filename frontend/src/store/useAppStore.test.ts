import { describe, expect, it } from 'vitest';

import { useAppStore } from './useAppStore';


describe('useAppStore', () => {
  it('adds and updates upload items', () => {
    useAppStore
      .getState()
      .addUpload({ id: 'u1', filename: 'a.las', progress: 0, status: 'uploading', message: '' });
    useAppStore.getState().updateUpload('u1', { progress: 50, message: '半程' });
    const item = useAppStore.getState().uploads.find((u) => u.id === 'u1')!;
    expect(item.progress).toBe(50);
    expect(item.message).toBe('半程');
  });
});
