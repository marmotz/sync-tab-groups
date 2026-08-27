import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/lib/i18n';
import { browserMock } from '../setup';
import frMessages from '../../public/_locales/fr/messages.json';
import enMessages from '../../public/_locales/en/messages.json';

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

describe('locale files', () => {
  it('define exactly the same set of keys in fr and en', () => {
    const frKeys = Object.keys(frMessages).sort();
    const enKeys = Object.keys(enMessages).sort();

    expect(frKeys).toEqual(enKeys);
  });

  it('declare the $NAME$ placeholder on both sides of mergeConflictHeading', () => {
    for (const messages of [frMessages, enMessages]) {
      const entry = (
        messages as Record<string, { message: string; placeholders?: Record<string, { content: string }> } | undefined>
      ).mergeConflictHeading;
      expect(entry?.message).toContain('$NAME$');
      expect(entry?.placeholders?.name?.content).toBe('$1');
    }
  });
});
