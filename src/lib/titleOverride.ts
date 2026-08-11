// Runs inside a web page (either as a static content script, or serialized and injected
// via browser.scripting.executeScript), so it must be fully self-contained: no closures
// over module-level state, no imports — only DOM/web globals.
//
// A one-off `document.title = value` assignment is not enough: pages routinely rewrite
// their own title after the initial load (SPA route changes, async data finishing,
// analytics scripts, ...), which would silently overwrite the custom title again. The
// MutationObserver keeps reasserting it for as long as the document is alive.
export function installTitleOverride(title: string): void {
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
