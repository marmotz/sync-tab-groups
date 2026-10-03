import browser from 'webextension-polyfill';
import { isLoggingEnabled } from './devMode';

const PREFIX_STYLE = 'color:#7C3AED;font-weight:bold';
const RESET_STYLE = 'color:inherit;font-weight:normal';

export const DEBUG_LOG_KEY = 'debugLog';
const MAX_PERSISTED_ENTRIES = 400;

export interface PersistedLogEntry {
  time: string;
  message: string;
  details?: unknown;
}

// Appends are chained so concurrent devLog() calls never read-modify-write the same array.
let persistChain: Promise<void> = Promise.resolve();

function persist(entry: PersistedLogEntry): void {
  persistChain = persistChain
    .then(async () => {
      const stored = await browser.storage.local.get(DEBUG_LOG_KEY);
      const entries = (stored[DEBUG_LOG_KEY] as PersistedLogEntry[] | undefined) ?? [];
      entries.push(entry);
      await browser.storage.local.set({ [DEBUG_LOG_KEY]: entries.slice(-MAX_PERSISTED_ENTRIES) });
    })
    .catch(() => {
      // logging must never break the extension
    });
}

function toPlain(details: Record<string, unknown>): unknown {
  try {
    return JSON.parse(JSON.stringify(details));
  } catch {
    return String(details);
  }
}

export async function readPersistedLog(): Promise<PersistedLogEntry[]> {
  const stored = await browser.storage.local.get(DEBUG_LOG_KEY);
  return (stored[DEBUG_LOG_KEY] as PersistedLogEntry[] | undefined) ?? [];
}

export async function clearPersistedLog(): Promise<void> {
  await persistChain;
  await browser.storage.local.remove(DEBUG_LOG_KEY);
}

export function devLog(message: string, details?: Record<string, unknown>): void {
  // Timestamp taken at call time: the enabled check below is async.
  const now = new Date();
  const time = now.toISOString().slice(11, 23);

  void isLoggingEnabled().then((enabled) => {
    if (!enabled) {
      return;
    }
    if (details !== undefined) {
      console.log(`%c[sync-tab-group]%c ${time} ${message}`, PREFIX_STYLE, RESET_STYLE, details);
    } else {
      console.log(`%c[sync-tab-group]%c ${time} ${message}`, PREFIX_STYLE, RESET_STYLE);
    }

    // The console is wiped on every browser restart, which is exactly when the sync
    // state gets lost: keep a rolling copy that the popup debug dump can export.
    persist({
      time: now.toISOString(),
      message,
      ...(details !== undefined ? { details: toPlain(details) } : {}),
    });
  });
}
