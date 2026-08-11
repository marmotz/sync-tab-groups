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
  // isTabRenamable() devLog()s on failure, which calls management.getSelf(): give it a
  // resolved value so that doesn't produce unhandled rejections unrelated to these tests.
  browserMock.management.getSelf.mockResolvedValue({ installType: 'normal' });
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
  it('opens a dedicated extension window for the clicked tab, carrying its id and current title', async () => {
    browserMock.windows.get.mockResolvedValue({});

    registerTabRenameMenu();
    const onClicked = getListener(browserMock.contextMenus.onClicked);

    await onClicked({ menuItemId: 'renameTab' }, { id: 5, title: 'Original title' });
    await flush();

    expect(browserMock.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'popup',
        url: `renameTab/index.html?tabId=5&title=${encodeURIComponent('Original title')}`,
      }),
    );
  });

  it('centers the popup over the source window bounds when known', async () => {
    browserMock.windows.get.mockResolvedValue({ left: 2000, top: 100, width: 1600, height: 900 });

    registerTabRenameMenu();
    const onClicked = getListener(browserMock.contextMenus.onClicked);

    await onClicked({ menuItemId: 'renameTab' }, { id: 5, title: 'Original title', windowId: 7 });
    await flush();

    expect(browserMock.windows.get).toHaveBeenCalledWith(7);
    expect(browserMock.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 2000 + (1600 - 420) / 2,
        top: 100 + (900 - 160) / 2,
      }),
    );
  });

  it('falls back to no explicit position when the source window bounds are unknown', async () => {
    browserMock.windows.get.mockResolvedValue({});

    registerTabRenameMenu();
    const onClicked = getListener(browserMock.contextMenus.onClicked);

    await onClicked({ menuItemId: 'renameTab' }, { id: 5, title: 'Original title', windowId: 7 });
    await flush();

    const call = browserMock.windows.create.mock.calls[0]?.[0];
    expect(call).not.toHaveProperty('left');
    expect(call).not.toHaveProperty('top');
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
  it('shows both entries on a renamable tab that already has a custom title', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    browserMock.scripting.executeScript.mockResolvedValue([{ frameId: 0, result: true }]);
    browserMock.sessions.getTabValue.mockResolvedValue('Renamed');

    await onShown({ contexts: ['tab'] }, { id: 5, url: 'https://example.com' });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('renameTab', { visible: true });
    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('resetTabTitle', { visible: true });
    expect(browserMock.contextMenus.refresh).toHaveBeenCalled();
  });

  it('shows rename but hides reset on a renamable tab with no custom title', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    browserMock.scripting.executeScript.mockResolvedValue([{ frameId: 0, result: true }]);
    browserMock.sessions.getTabValue.mockResolvedValue(undefined);

    await onShown({ contexts: ['tab'] }, { id: 5, url: 'https://example.com' });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('renameTab', { visible: true });
    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('resetTabTitle', { visible: false });
  });

  it('hides both entries on a page whose script injection is rejected', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    browserMock.scripting.executeScript.mockRejectedValue(new Error('Cannot access a privileged page'));

    await onShown({ contexts: ['tab'] }, { id: 5, url: 'https://addons.mozilla.org' });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('renameTab', { visible: false });
    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('resetTabTitle', { visible: false });
    // No point looking up a stored title for a tab that was never renamable in the first place.
    expect(browserMock.sessions.getTabValue).not.toHaveBeenCalled();
  });

  it('hides both entries on a known privileged URL (e.g. about:debugging) without probing it', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    await onShown({ contexts: ['tab'] }, { id: 5, url: 'about:debugging#/runtime/this-firefox' });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('renameTab', { visible: false });
    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('resetTabTitle', { visible: false });
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('treats a discarded ordinary page as renamable without probing it', async () => {
    registerTabRenameMenu();
    const onShown = getListener(browserMock.contextMenus.onShown);

    browserMock.sessions.getTabValue.mockResolvedValue(undefined);

    await onShown({ contexts: ['tab'] }, { id: 5, url: 'https://example.com', discarded: true });
    await flush();

    expect(browserMock.contextMenus.update).toHaveBeenCalledWith('renameTab', { visible: true });
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
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
