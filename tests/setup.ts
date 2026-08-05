import { vi } from 'vitest';

type StorageData = Record<string, unknown>;

function createStorageArea() {
  let data: StorageData = {};

  return {
    get: vi.fn(async (keys?: string | string[] | StorageData | null) => {
      if (keys === null || keys === undefined) {
        return { ...data };
      }
      if (typeof keys === 'string') {
        return keys in data ? { [keys]: data[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const result: StorageData = {};
        for (const key of keys) {
          if (key in data) {
            result[key] = data[key];
          }
        }
        return result;
      }
      const result: StorageData = {};
      for (const [key, defaultValue] of Object.entries(keys)) {
        result[key] = key in data ? data[key] : defaultValue;
      }
      return result;
    }),
    set: vi.fn(async (items: StorageData) => {
      data = { ...data, ...items };
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete data[key];
      }
    }),
    clear: vi.fn(async () => {
      data = {};
    }),
    __reset: (): void => {
      data = {};
    },
  };
}

export const browserMock = {
  storage: {
    local: createStorageArea(),
    sync: createStorageArea(),
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    group: vi.fn(),
    ungroup: vi.fn(),
    get: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    onMoved: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
  },
  tabGroups: {
    get: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
  },
  windows: {
    getCurrent: vi.fn(),
  },
  management: {
    getSelf: vi.fn(),
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
    getUILanguage: vi.fn(() => 'fr'),
  },
};

vi.mock('webextension-polyfill', () => ({ default: browserMock }));
