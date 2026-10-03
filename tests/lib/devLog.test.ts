import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('devLog', () => {
  it('logs to the console when running as a development install', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'development' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { devLog } = await import('../../src/lib/devLog');
    devLog('Nouvel onglet → envoyé en sync', { group: 'Work', url: 'https://a.example' });
    await flush();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^%c\[sync-tab-group]%c \d{2}:\d{2}:\d{2}\.\d{3} Nouvel onglet → envoyé en sync$/),
      expect.any(String),
      expect.any(String),
      { group: 'Work', url: 'https://a.example' },
    );
    logSpy.mockRestore();
  });

  it('does not log when normally installed', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { devLog } = await import('../../src/lib/devLog');
    devLog('Nouvel onglet → envoyé en sync', { group: 'Work' });
    await flush();

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('logs on a normal install once the debug flag is set', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    await browserMock.storage.local.set({ debugMode: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { devLog } = await import('../../src/lib/devLog');
    devLog('Debug visible');
    await flush();

    expect(logSpy).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
    browserMock.storage.local.__reset();
  });

  it('keeps a persisted copy of the logs, capped, so they survive a restart', async () => {
    browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
    browserMock.storage.local.__reset();
    await browserMock.storage.local.set({ debugMode: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { devLog, readPersistedLog } = await import('../../src/lib/devLog');
    for (let i = 0; i < 450; i++) {
      devLog(`entry ${i}`, { i });
    }
    await flush();
    await flush();
    const entries = await readPersistedLog();

    expect(entries).toHaveLength(400);
    expect(entries[399]).toMatchObject({ message: 'entry 449', details: { i: 449 } });
    logSpy.mockRestore();
    browserMock.storage.local.__reset();
  });
});
