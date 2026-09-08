import { describe, expect, it } from 'vitest';
import { unwrapNavigationHeading } from './ui';

describe('navigation heading presentation (canonical angles remain unchanged)', () => {
  it('initializes directly at the canonical angle', () => {
    expect(unwrapNavigationHeading(null, -2.4)).toBe(-2.4);
  });

  it.each([1, -1])('crosses the ±pi seam in the shortest direction (%s)', sign => {
    const previous = sign * (Math.PI - 0.02);
    const canonical = -sign * (Math.PI - 0.03);
    const visual = unwrapNavigationHeading(previous, canonical);
    expect(visual - previous).toBeCloseTo(sign * 0.05, 12);
    expect(Math.sin(visual)).toBeCloseTo(Math.sin(canonical), 12);
    expect(Math.cos(visual)).toBeCloseTo(Math.cos(canonical), 12);
  });

  it('retains visual direction over repeated turns and a recovery-sized jump', () => {
    let previous: number | null = null;
    for (const canonical of [0, 2, 3.1, -3.1, -1, 1, 3, -3, 0.4, -2.9, 2.9, 0]) {
      const visual = unwrapNavigationHeading(previous, canonical);
      if (previous !== null) expect(Math.abs(visual - previous)).toBeLessThanOrEqual(Math.PI);
      expect(Math.sin(visual)).toBeCloseTo(Math.sin(canonical), 12);
      expect(Math.cos(visual)).toBeCloseTo(Math.cos(canonical), 12);
      previous = visual;
    }
  });
});
