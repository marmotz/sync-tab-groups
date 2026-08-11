import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { registerTabRenameMenu } from '../../src/background/tabRenameMenu';

function getListener(target: { addListener: ReturnType<typeof vi.fn> }): (...args: unknown[]) => unknown {
  const call = target.addListener.mock.calls[0];
  if (call === undefined) {
    throw new Error('addListener was not called');
  }
  return call[0];
}

// Listeners registered by registerTabRenameMenu() are synchronous and delegate to a
// fire-and-forget async handler (`void handleX(...)`), so awaiting the listener call
// itself doesn't wait for the underlying chain of awaited browser calls to settle.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  browserMock.tabs.query.mockResolvedValue([]);
});

describe('registerTabRenameMenu', () => {
  it('creates the rename and reset menu items, reset hidden by default', () => {
    registerTabRenameMenu();

    expect(browserMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'renameTab', contexts: ['tab'] }),
    );
    expect(browserMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resetTabTitle', contexts: ['tab'], visible: false }),
    );
  });

  it('reapplies stored custom titles to already-open tabs on startup', async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    browserMock.sessions.getTabValue.mockImplementation((tabId: number) =>
      Promise.resolve(tabId === 1 ? 'Renamed' : undefined),
    );

    registerTabRenameMenu();
    await flush();

    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } }),
    );
  });
});

describe('onClicked - rename', () => {
  it('prompts for a title, stores it and applies it to the tab', async () => {
    registerTabRenameMenu();
    const onClicked = getListener(browserMock.contextMenus.onClicked);

    browserMock.scripting.executeScript
      .mockResolvedValueOnce([{ frameId: 0, result: 'New name' }]) // prompt()
      .mockResolvedValueOnce([{ frameId: 0 }]); // document.title assignment

    await onClicked({ menuItemId: 'renameTab' }, { id: 5, title: 'Original' });
    await flush();

    expect(browserMock.sessions.setTabValue).toHaveBeenCalledWith(5, 'customTitle', 'New name');
    expect(browserMock.scripting.executeScript).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: { tabId: 5 }, args: ['New name'] }),
    );
  });

  it('does nothing when the prompt is cancelled', async () => {
    registerTabRenameMenu();
    const onClicked = getListener(browserMock.contextMenus.onClicked);

    browserMock.scripting.executeScript.mockResolvedValueOnce([{ frameId: 0, result: null }]);

    await onClicked({ menuItemId: 'renameTab' }, { id: 5, title: 'Original' });
    await flush();

    expect(browserMock.sessions.setTabValue).not.toHaveBeenCalled();
  });
});

describe('onClicked - reset', () => {
  it('clears the stored title and reloads the tab', async () => {
    registerTabRenameMenu();
    const onClicked = getListener(browserMock.contextMenus.onClicked);

    await onClicked({ menuItemId: 'resetTabTitle' }, { id: 5, title: 'Renamed' });
    await flush();

    expect(browserMock.sessions.removeTabValue).toHaveBeenCalledWith(5, 'customTitle');
    expect(browserMock.tabs.reload).toHaveBeenCalledWith(5);
  });
});

describe('onShown', () => {
  it('shows the reset entry only when the tab has a custom title', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    browserMock.sessions.getTabValue.mockResolvedValue('Renamed');
    await onShown({ contexts: ['tab'] }, { id: 5 });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('resetTabTitle', { visible: true });
    expect(browserMock.contextMenus.refresh).toHaveBeenCalled();
  });

  it('hides the reset entry when the tab has no custom title', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    browserMock.sessions.getTabValue.mockResolvedValue(undefined);
    await onShown({ contexts: ['tab'] }, { id: 5 });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('resetTabTitle', { visible: false });
  });
});

describe('runtime.onMessage - answering the content script', () => {
  it('replies with the stored custom title for the sender tab', async () => {
    registerTabRenameMenu();
    const onMessage = getListener(browserMock.runtime.onMessage);

    browserMock.sessions.getTabValue.mockResolvedValue('Renamed');

    await expect(onMessage('sync-tab-groups/get-custom-title', { tab: { id: 5 } })).resolves.toBe('Renamed');
    expect(browserMock.sessions.getTabValue).toHaveBeenCalledWith(5, 'customTitle');
  });

  it('ignores messages of a different type', async () => {
    registerTabRenameMenu();
    const onMessage = getListener(browserMock.runtime.onMessage);

    const result = onMessage('some-other-message', { tab: { id: 5 } });

    expect(result).toBeUndefined();
    expect(browserMock.sessions.getTabValue).not.toHaveBeenCalled();
  });

  it('ignores messages without a sender tab', async () => {
    registerTabRenameMenu();
    const onMessage = getListener(browserMock.runtime.onMessage);

    const result = onMessage('sync-tab-groups/get-custom-title', {});

    expect(result).toBeUndefined();
    expect(browserMock.sessions.getTabValue).not.toHaveBeenCalled();
  });
});
