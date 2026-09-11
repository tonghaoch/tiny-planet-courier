import { describe, expect, it } from 'vitest';
import {
  createTourPlan,
  copyTourPlan,
  eligibleSecondBags,
  isTourOrder,
  normalizeTourSeed,
  TOUR_LOCATION_IDS,
  tourRecordKey,
} from './tour-itinerary';

describe('bounded five-location itinerary', () => {
  it('has exactly 20 continuations for every one of the 120 first permutations', () => {
    const permutations = <T>(ids: readonly T[]): T[][] =>
      ids.length
        ? ids.flatMap((id, i) => permutations(ids.filter((_, j) => i !== j)).map(rest => [id, ...rest]))
        : [[]];
    const bags = permutations(TOUR_LOCATION_IDS);
    expect(bags).toHaveLength(120);
    for (const first of bags) expect(eligibleSecondBags(first)).toHaveLength(20);
    expect(eligibleSecondBags(['bay'])).toEqual([]);
  });

  it('replays broad seeds, all five first targets, and all constraints without rejection', () => {
    const first = new Set<string>();
    const orders = new Set<string>();
    for (let seed = -500; seed < 1500; seed++) {
      const plan = createTourPlan(seed);
      expect(plan).toEqual(createTourPlan(seed));
      expect(isTourOrder(plan.order)).toBe(true);
      expect(plan.order).toHaveLength(10);
      for (const id of TOUR_LOCATION_IDS) expect(plan.order.filter(value => value === id)).toHaveLength(2);
      for (let i = 1; i < 10; i++) {
        expect(plan.order[i]).not.toBe(plan.order[i - 1]);
        expect(plan.order[i]).not.toBe(plan.order[i - 2]);
      }
      expect(new Set(plan.order.slice(1).map((id, i) => `${plan.order[i]}>${id}`)).size).toBe(9);
      first.add(plan.order[0]);
      orders.add(plan.order.join());
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.order)).toBe(true);
    }
    expect(first.size).toBe(5);
    expect(orders.size).toBeGreaterThan(500);
  });

  it('normalizes safe integer seeds and rejects invalid seeds/plans', () => {
    for (const seed of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => createTourPlan(seed)).toThrow(RangeError);
    for (const seed of [0, -1, 2 ** 32, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      expect(createTourPlan(seed)).toEqual(createTourPlan(normalizeTourSeed(seed)));
    }
    expect(() => copyTourPlan({ ...createTourPlan(0), order: [] })).toThrow(RangeError);
    const plan = createTourPlan(4);
    expect(tourRecordKey({ ...plan, seed: 123 })).toBe(tourRecordKey(plan));
    expect(tourRecordKey(createTourPlan(5))).not.toBe(tourRecordKey(plan));
  });
});
