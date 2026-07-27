import { isDevMode } from './devMode';

const PREFIX_STYLE = 'color:#7C3AED;font-weight:bold';
const RESET_STYLE = 'color:inherit;font-weight:normal';

export function devLog(message: string, details?: Record<string, unknown>): void {
  void isDevMode().then((devMode) => {
    if (!devMode) {
      return;
    }
    if (details !== undefined) {
      console.log(`%c[sync-tab-group]%c ${message}`, PREFIX_STYLE, RESET_STYLE, details);
    } else {
      console.log(`%c[sync-tab-group]%c ${message}`, PREFIX_STYLE, RESET_STYLE);
    }
  });
}
