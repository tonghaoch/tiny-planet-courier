import { seededRandom } from './math';

export const TOUR_LOCATION_IDS = ['bay', 'station', 'garden', 'beacon', 'depot'] as const;
export type TourLocationId = (typeof TOUR_LOCATION_IDS)[number];
export const TOUR_PLAN_VERSION = 'five-location-v2';
export const TOUR_START = 'bay-entry';
export interface TourPlan {
  readonly version: typeof TOUR_PLAN_VERSION;
  readonly seed: number;
  readonly start: typeof TOUR_START;
  readonly order: readonly TourLocationId[];
}

/** Finite safe integers normalize to the unsigned 32-bit PRNG domain. */
export function normalizeTourSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) throw new RangeError('Tour seed must be a finite safe integer');
  return seed >>> 0;
}

function permutations(ids: readonly TourLocationId[]): TourLocationId[][] {
  if (!ids.length) return [[]];
  return ids.flatMap((id, index) => permutations(ids.filter((_, i) => i !== index)).map(rest => [id, ...rest]));
}
const BAGS = permutations(TOUR_LOCATION_IDS);

export function isTourOrder(order: readonly TourLocationId[]): boolean {
  if (order.length !== 10) return false;
  for (const start of [0, 5])
    if (!TOUR_LOCATION_IDS.every(id => order.slice(start, start + 5).filter(value => value === id).length === 1))
      return false;
  const pairs = new Set<string>();
  for (let i = 1; i < order.length; i++) {
    if (order[i] === order[i - 1] || order[i] === order[i - 2]) return false;
    const pair = `${order[i - 1]}>${order[i]}`;
    if (pairs.has(pair)) return false;
    pairs.add(pair);
  }
  return true;
}

/** Exactly 120 bounded candidates; every first bag has exactly 20 eligible continuations. */
export function eligibleSecondBags(first: readonly TourLocationId[]): readonly (readonly TourLocationId[])[] {
  return BAGS.filter(second => isTourOrder([...first, ...second])).map(bag => Object.freeze([...bag]));
}

export function createTourPlan(seed: number): TourPlan {
  const normalized = normalizeTourSeed(seed);
  const random = seededRandom(normalized);
  const first = [...TOUR_LOCATION_IDS];
  for (let i = first.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [first[i], first[j]] = [first[j], first[i]];
  }
  const candidates = eligibleSecondBags(first);
  return copyTourPlan({
    version: TOUR_PLAN_VERSION,
    seed: normalized,
    start: TOUR_START,
    order: [...first, ...candidates[Math.floor(random() * candidates.length)]],
  });
}

/** Validate externally restored plans and take immutable ownership. */
export function copyTourPlan(plan: TourPlan): TourPlan {
  if (plan.version !== TOUR_PLAN_VERSION || plan.start !== TOUR_START || !isTourOrder(plan.order))
    throw new RangeError('Invalid Tour plan');
  return Object.freeze({ ...plan, seed: normalizeTourSeed(plan.seed), order: Object.freeze([...plan.order]) });
}

export function tourRecordKey(plan: TourPlan): string {
  return `tiny-planet-courier:tour:best:${plan.version}:score-v2:${plan.start}:${plan.order.join('.')}`;
}
