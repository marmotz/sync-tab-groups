import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { applyCustomTitle, clearCustomTitle, getCustomTitle, setCustomTitle } from '../../src/lib/tabTitle';

beforeEach(() => {
  vi.clearAllMocks();
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
