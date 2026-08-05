import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserMock } from '../setup';
import { consumeIntentionalClose, markIntentionalClose } from '../../src/lib/intentionalClose';

beforeEach(() => {
  browserMock.storage.local.__reset();
  vi.clearAllMocks();
});

describe('intentionalClose', () => {
  it('reports false for a group that was never marked', async () => {
    expect(await consumeIntentionalClose(7)).toBe(false);
  });

  it('reports true once for a marked group, then false on subsequent checks', async () => {
    await markIntentionalClose(7);

    expect(await consumeIntentionalClose(7)).toBe(true);
    expect(await consumeIntentionalClose(7)).toBe(false);
  });

  it('tracks multiple groups independently', async () => {
    await markIntentionalClose(7);
    await markIntentionalClose(9);

    expect(await consumeIntentionalClose(7)).toBe(true);
    expect(await consumeIntentionalClose(9)).toBe(true);
  });

  it('does not duplicate an already-marked group', async () => {
    await markIntentionalClose(7);
    await markIntentionalClose(7);

    expect(await consumeIntentionalClose(7)).toBe(true);
    expect(await consumeIntentionalClose(7)).toBe(false);
  });
});
