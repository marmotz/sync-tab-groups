import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';

beforeEach(() => {
  browserMock.storage.local.__reset();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('getDeviceId', () => {
  it('generates and persists a device id on first call', async () => {
    const { getDeviceId } = await import('../../src/lib/deviceId');
    const id = await getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const stored = await browserMock.storage.local.get('deviceId');
    expect(stored.deviceId).toBe(id);
  });

  it('reuses the previously persisted device id', async () => {
    await browserMock.storage.local.set({ deviceId: 'existing-id' });
    const { getDeviceId } = await import('../../src/lib/deviceId');
    expect(await getDeviceId()).toBe('existing-id');
  });

  it('caches the id in-memory across calls without re-reading storage', async () => {
    const { getDeviceId } = await import('../../src/lib/deviceId');
    const first = await getDeviceId();
    browserMock.storage.local.get.mockClear();
    const second = await getDeviceId();
    expect(second).toBe(first);
    expect(browserMock.storage.local.get).not.toHaveBeenCalled();
  });
});
