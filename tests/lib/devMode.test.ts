import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('isDevMode', () => {
  it('is true when the extension was loaded as a temporary/unpacked add-on', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'development' });
    const { isDevMode } = await import('../../src/lib/devMode');
    expect(await isDevMode()).toBe(true);
  });

  it('is false for a normally installed add-on', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    const { isDevMode } = await import('../../src/lib/devMode');
    expect(await isDevMode()).toBe(false);
  });

  it('caches the result without re-querying management.getSelf', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'development' });
    const { isDevMode } = await import('../../src/lib/devMode');
    await isDevMode();
    browserMock.management.getSelf.mockClear();
    await isDevMode();
    expect(browserMock.management.getSelf).not.toHaveBeenCalled();
  });
});
