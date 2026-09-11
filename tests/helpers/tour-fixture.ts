import { expect, type Page } from '@playwright/test';
import type { PlanetTestTourRoutes } from '../../src/dev/test-bridge-types';
import { createTourPlan, TOUR_LOCATION_IDS } from '../../src/tour-itinerary';
import type { TourStopId } from '../../src/tour-layout';
import { dockAtTarget, tourSnapshot } from './planet-test';

export const NORTHERN_SEED = 227;

// Both end at Garden so the original Garden -> Bay closing road is continuous.
// Different first bags also exercise a non-Bay departure from the fixed Bay spawn.
export const fullTourCases = [
  { variant: 'wide', plan: createTourPlan(9) },
  { variant: 'short', plan: createTourPlan(55) },
] as const;
export const firstTargetPlans = [10, 16, 2, 4, 0].map((seed, index) => {
  const plan = createTourPlan(seed);
  if (plan.order[0] !== TOUR_LOCATION_IDS[index]) throw new Error(`First-target fixture changed for seed ${seed}`);
  return plan;
});

export function location(data: Pick<PlanetTestTourRoutes, 'catalog'>, id: TourStopId) {
  const site = data.catalog.find(site => site.id === id);
  if (!site) throw new Error(`Missing physical location ${id}`);
  return site;
}

/** Delivery/state isolation only; never use this as route-playability evidence. */
export async function deliverFixture(page: Page, index: number) {
  expect((await tourSnapshot(page)).index).toBe(index);
  await dockAtTarget(page);
  await expect.poll(async () => (await tourSnapshot(page)).index).toBe(index + 1);
  return tourSnapshot(page);
}
