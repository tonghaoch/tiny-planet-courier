import { DELIVERY_RADIUS } from './game';

export type GuidanceMode = 'steering' | 'parking' | 'recovering' | 'hidden';

/** Presentation only; the actual delivery eligibility remains owned by DeliveryRun. */
export function arrivalActive(previous: boolean, distance: number, grounded: boolean): boolean {
  return grounded && distance < DELIVERY_RADIUS + (previous ? 0.25 : 0);
}

export function unwrapNavigationHeading(previous: number | null, canonical: number): number {
  return previous === null
    ? canonical
    : previous + Math.atan2(Math.sin(canonical - previous), Math.cos(canonical - previous));
}

/** Retarget from the displayed angle, never from a previous animation endpoint.
 * 95% settled in 150ms, independent of frame rate; no DOM/layout sampling. */
export function advanceNavigationHeading(
  displayed: number | null,
  canonical: number,
  dt: number,
  reducedMotion = false,
): number {
  if (displayed === null || reducedMotion) return canonical;
  const delta = unwrapNavigationHeading(displayed, canonical) - displayed;
  return displayed + delta * -Math.expm1(-20 * Math.max(0, dt));
}
