// Sent by the content script (on every navigation) to ask the background script whether
// this tab has a custom title to (re)apply. Duplicated as a literal in
// src/content/index.ts, which must stay import-free — keep both in sync.
export const GET_CUSTOM_TITLE_MESSAGE = 'sync-tab-groups/get-custom-title';
