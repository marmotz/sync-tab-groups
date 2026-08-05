import browser from 'webextension-polyfill';

export function t(key: string, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key, substitutions);
}
