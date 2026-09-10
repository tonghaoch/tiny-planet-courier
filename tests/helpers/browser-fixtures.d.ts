import type { DeliveryRun } from '../../src/game';
import type { UI } from '../../src/ui';

declare global {
  interface Window {
    __geometryErrors?: string[];
    __presentation?: { ui: UI; run: DeliveryRun };
  }
}
