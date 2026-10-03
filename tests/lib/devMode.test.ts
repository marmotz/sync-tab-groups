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

describe('debug mode flag', () => {
  beforeEach(() => {
    browserMock.storage.local.__reset();
  });

  it('is off by default and persisted once set', async () => {
    const { isDebugMode, setDebugMode } = await import('../../src/lib/devMode');
    expect(await isDebugMode()).toBe(false);
    await setDebugMode(true);
    expect(await isDebugMode()).toBe(true);
    await setDebugMode(false);
    expect(await isDebugMode()).toBe(false);
  });

  it('enables logging on a normal install only when the flag is set', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    const { isLoggingEnabled, setDebugMode } = await import('../../src/lib/devMode');
    expect(await isLoggingEnabled()).toBe(false);
    await setDebugMode(true);
    expect(await isLoggingEnabled()).toBe(true);
  });
});
