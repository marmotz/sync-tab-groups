export const TRIPLE_CLICK_WINDOW_MS = 3000;
export const TRIPLE_CLICK_COUNT = 3;

/**
 * Returns a function to call on every click; it reports true when the last
 * TRIPLE_CLICK_COUNT clicks all happened within TRIPLE_CLICK_WINDOW_MS, then resets.
 */
export function createTripleClickDetector(now: () => number = Date.now): () => boolean {
  let clicks: number[] = [];

  return () => {
    const current = now();
    clicks = [...clicks, current].filter((time) => current - time <= TRIPLE_CLICK_WINDOW_MS);

    if (clicks.length >= TRIPLE_CLICK_COUNT) {
      clicks = [];
      return true;
    }
    return false;
  };
}
