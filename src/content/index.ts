// Loaded as a plain (non-module) content script by the manifest, and re-injected fresh
// by the browser on every navigation — which is what makes a renamed tab survive
// navigating to a new page. It must stay entirely self-contained (no imports): sharing a
// module with the background/popup bundles would make Vite split it into a separate chunk
// file loaded via `import`, but content scripts are not loaded as ES modules here.
//
// Firefox exposes the promise-based `browser` API natively in content scripts, so no
// polyfill import is needed for this Firefox-only extension.
declare const browser: {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
};

const GET_CUSTOM_TITLE_MESSAGE = 'sync-tab-groups/get-custom-title';

function installTitleOverride(title: string): void {
  const marker = window as unknown as { __syncTabGroupsTitleObserver__?: MutationObserver };
  marker.__syncTabGroupsTitleObserver__?.disconnect();

  document.title = title;

  const observer = new MutationObserver(() => {
    if (document.title !== title) {
      document.title = title;
    }
  });

  const titleElement = document.querySelector('title');
  if (titleElement) {
    observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
  }
  observer.observe(document.head ?? document.documentElement, { childList: true });

  marker.__syncTabGroupsTitleObserver__ = observer;
}

browser.runtime
  .sendMessage(GET_CUSTOM_TITLE_MESSAGE)
  .then((title) => {
    if (typeof title === 'string') {
      installTitleOverride(title);
    }
  })
  .catch(() => {
    // Background script not ready yet (e.g. right after install/update) — nothing to do.
  });
