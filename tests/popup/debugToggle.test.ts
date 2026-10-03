import { describe, expect, it } from 'vitest';
import { createTripleClickDetector } from '../../src/popup/debugToggle';

function detectorWithClock(): { click: () => boolean; advance: (ms: number) => void } {
  let time = 0;
  return { click: createTripleClickDetector(() => time), advance: (ms) => (time += ms) };
}

describe('createTripleClickDetector', () => {
  it('fires on the third click within 3 seconds', () => {
    const { click, advance } = detectorWithClock();
    expect(click()).toBe(false);
    advance(1000);
    expect(click()).toBe(false);
    advance(1000);
    expect(click()).toBe(true);
  });

  it('does not fire when the clicks span more than 3 seconds', () => {
    const { click, advance } = detectorWithClock();
    click();
    advance(2000);
    click();
    advance(1500);
    expect(click()).toBe(false);
  });

  it('resets after firing', () => {
    const { click } = detectorWithClock();
    click();
    click();
    expect(click()).toBe(true);
    expect(click()).toBe(false);
  });
});
