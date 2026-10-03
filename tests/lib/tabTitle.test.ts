import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import {
  applyCustomTitle,
  applyRemoteCustomTitle,
  clearCustomTitle,
  getCustomTitle,
  isTabRenamable,
  setCustomTitle,
} from '../../src/lib/tabTitle';

beforeEach(() => {
  vi.clearAllMocks();
  // isTabRenamable() devLog()s on failure, which calls management.getSelf(): give it a
  // resolved value so that doesn't produce unhandled rejections unrelated to these tests.
  browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
});

describe('getCustomTitle', () => {
  it('returns the stored string value', async () => {
    browserMock.sessions.getTabValue.mockResolvedValue('My tab');
    expect(await getCustomTitle(1)).toBe('My tab');
    expect(browserMock.sessions.getTabValue).toHaveBeenCalledWith(1, 'customTitle');
  });

  it('returns undefined when nothing is stored', async () => {
    browserMock.sessions.getTabValue.mockResolvedValue(undefined);
    expect(await getCustomTitle(1)).toBeUndefined();
  });
});

describe('setCustomTitle / clearCustomTitle', () => {
  it('stores the title under the tab', async () => {
    await setCustomTitle(1, 'My tab');
    expect(browserMock.sessions.setTabValue).toHaveBeenCalledWith(1, 'customTitle', 'My tab');
  });

  it('removes the stored title', async () => {
    await clearCustomTitle(1);
    expect(browserMock.sessions.removeTabValue).toHaveBeenCalledWith(1, 'customTitle');
  });
});

describe('applyCustomTitle', () => {
  it('injects a script that sets document.title', async () => {
    browserMock.scripting.executeScript.mockResolvedValue([{ frameId: 0 }]);
    await applyCustomTitle(1, 'My tab');
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 }, args: ['My tab'] }),
    );
  });

  it('silently ignores tabs that cannot be scripted', async () => {
    browserMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access a privileged page'));
    await expect(applyCustomTitle(1, 'My tab')).resolves.toBeUndefined();
  });
});

describe('isTabRenamable', () => {
  it('returns true when a loaded tab can be scripted', async () => {
    browserMock.scripting.executeScript.mockResolvedValue([{ frameId: 0, result: true }]);
    expect(await isTabRenamable({ id: 1, url: 'https://example.com', discarded: false })).toBe(true);
  });

  it('returns false for a loaded page whose script injection is rejected (e.g. a quarantined https domain)', async () => {
    browserMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access a privileged page'));
    expect(await isTabRenamable({ id: 1, url: 'https://addons.mozilla.org', discarded: false })).toBe(false);
  });

  it('returns false for a known privileged URL without even probing it', async () => {
    // Some internal pages (about:debugging in particular) don't actually reject
    // scripting.executeScript, so the URL check has to be authoritative and short-circuit
    // before the probe, not just act as a shortcut for the common case.
    expect(await isTabRenamable({ id: 1, url: 'about:debugging#/runtime/this-firefox', discarded: false })).toBe(
      false,
    );
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('returns false when the tab has no id', async () => {
    expect(await isTabRenamable({ id: undefined, url: 'https://example.com', discarded: false })).toBe(false);
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  describe('discarded tabs (restored at startup or unloaded to save memory)', () => {
    it('treats an ordinary http(s) page as renamable without probing it (no live document to inject into)', async () => {
      const result = await isTabRenamable({ id: 1, url: 'https://example.com', discarded: true });
      expect(result).toBe(true);
      expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('treats a privileged page as non-renamable based on its URL alone', async () => {
      expect(await isTabRenamable({ id: 1, url: 'about:addons', discarded: true })).toBe(false);
      expect(await isTabRenamable({ id: 1, url: undefined, discarded: true })).toBe(false);
    });
  });
});

describe('applyRemoteCustomTitle', () => {
  it('does nothing when the tab already has that title', async () => {
    browserMock.sessions.getTabValue.mockResolvedValue('Same');
    await applyRemoteCustomTitle(1, 'Same');
    expect(browserMock.sessions.setTabValue).not.toHaveBeenCalled();
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('does nothing when neither side has a custom title', async () => {
    browserMock.sessions.getTabValue.mockResolvedValue(undefined);
    await applyRemoteCustomTitle(1, undefined);
    expect(browserMock.sessions.removeTabValue).not.toHaveBeenCalled();
    expect(browserMock.tabs.reload).not.toHaveBeenCalled();
  });

  it('stores and injects a new remote title', async () => {
    browserMock.sessions.getTabValue.mockResolvedValue(undefined);
    browserMock.scripting.executeScript.mockResolvedValue([{ frameId: 0 }]);
    await applyRemoteCustomTitle(1, 'Remote');
    expect(browserMock.sessions.setTabValue).toHaveBeenCalledWith(1, 'customTitle', 'Remote');
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 }, args: ['Remote'] }),
    );
  });

  it('clears the title and reloads the tab when the remote one was reset', async () => {
    browserMock.sessions.getTabValue.mockResolvedValue('Old');
    await applyRemoteCustomTitle(1, undefined);
    expect(browserMock.sessions.removeTabValue).toHaveBeenCalledWith(1, 'customTitle');
    expect(browserMock.tabs.reload).toHaveBeenCalledWith(1);
  });
});
