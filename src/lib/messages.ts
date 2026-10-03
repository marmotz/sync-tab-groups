// Sent by the content script (on every navigation) to ask the background script whether
// this tab has a custom title to (re)apply. Duplicated as a literal in
// src/content/index.ts, which must stay import-free — keep both in sync.
export const GET_CUSTOM_TITLE_MESSAGE = 'sync-tab-groups/get-custom-title';

// Sent by the rename window once a custom title was stored, so the background script can
// push the change to the synced group the tab belongs to.
export const TAB_CUSTOM_TITLE_CHANGED_MESSAGE = 'sync-tab-groups/tab-custom-title-changed';
