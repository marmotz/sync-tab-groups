import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/lib/i18n';
import { browserMock } from '../setup';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('t', () => {
  it('delegates to browser.i18n.getMessage with the given key', () => {
    browserMock.i18n.getMessage.mockReturnValue('Partager');

    expect(t('buttonShare')).toBe('Partager');
    expect(browserMock.i18n.getMessage).toHaveBeenCalledWith('buttonShare', undefined);
  });

  it('forwards substitutions', () => {
    browserMock.i18n.getMessage.mockReturnValue('Groupe "Work" supprimé');

    expect(t('groupDeleted', ['Work'])).toBe('Groupe "Work" supprimé');
    expect(browserMock.i18n.getMessage).toHaveBeenCalledWith('groupDeleted', ['Work']);
  });
});
