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
      '%c[sync-tab-group]%c Nouvel onglet → envoyé en sync',
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
});
