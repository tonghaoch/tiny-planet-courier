import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPES, selectPrototype } from './delivery-prototypes';
import { BAY_RECORD_KEY, readBest, saveBest } from './game';

afterEach(() => vi.unstubAllGlobals());

describe('development prototype selector', () => {
  it.each(['bay', 'station', 'garden', 'tour'] as const)('selects the authored %s definition in development', id => {
    expect(selectPrototype(`?prototype=${id}`, true)).toBe(PROTOTYPES[id]);
    expect(selectPrototype(`?test=1&prototype=${id}&other=value`, true)).toBe(PROTOTYPES[id]);
  });

  it.each(['', '?test=1', '?prototype=', '?prototype=unknown', '?prototype=Station', '?prototype=Garden', '?prototype=constructor', '?prototype=__proto__'])('keeps the standard route for %j', search => {
    expect(selectPrototype(search, true)).toBeNull();
  });

  it.each(['', '?prototype=bay', '?prototype=station', '?prototype=garden', '?prototype=tour&test=1', '?prototype=unknown'])('never exposes authored playtests in production (%j)', search => {
    expect(selectPrototype(search, false)).toBeNull();
  });

  it('keeps Station copy about a single parcel, roads, braking and turns', () => {
    const station = PROTOTYPES.station;
    expect(station.home.description).toMatch(/one parcel/i);
    expect(station.hints.outer).toMatch(/outer road/i);
    expect(station.hints.inner).toMatch(/inner lane.*brake.*turns/i);
    expect(JSON.stringify(station)).not.toMatch(/bay|bakery|jump|leap|ramp|water|sand|coast|three parcels/i);
  });

  it('gives Garden a flowing flower path rather than another tight-turn Station route', () => {
    const garden = PROTOTYPES.garden;
    expect(garden.home.description).toMatch(/one parcel/i);
    expect(garden.hints.outer).toMatch(/garden loop/i);
    expect(garden.hints.inner).toMatch(/flower path.*link.*bends/i);
    expect(garden.parcelDescription).toMatch(/seeds/i);
    expect(JSON.stringify(garden)).not.toMatch(/bakery|station|bay|ramp|leap|tight turns|three parcels/i);
  });
});

describe('prototype record identity', () => {
  it('retains the Bay and Station keys and gives Garden its own stable key', () => {
    expect(PROTOTYPES.bay.id).toBe('bay');
    expect(PROTOTYPES.station.id).toBe('station');
    expect(PROTOTYPES.bay.bestScoreKey).toBe('tiny-planet-courier:bay-leap:best:v1');
    expect(PROTOTYPES.bay.bestScoreKey).toBe(BAY_RECORD_KEY);
    expect(PROTOTYPES.station.bestScoreKey).toBe('tiny-planet-courier:station:best:v1');
    expect(PROTOTYPES.station.bestScoreKey).not.toBe(PROTOTYPES.bay.bestScoreKey);
    expect(PROTOTYPES.garden.bestScoreKey).toBe('tiny-planet-courier:garden:best:v1');
    expect(PROTOTYPES.tour.bestScoreKey).toBe('tiny-planet-courier:tour:best:v1');
    expect(new Set(Object.values(PROTOTYPES).map(p => p.bestScoreKey)).size).toBe(4);
  });

  it('reads and writes standard, Bay, Station and Garden records independently', () => {
    const records = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
    });
    expect(saveBest(67)).toBe(true);
    expect(saveBest(12.5, PROTOTYPES.bay.bestScoreKey)).toBe(true);
    expect(saveBest(20, PROTOTYPES.station.bestScoreKey)).toBe(true);
    expect(saveBest(21, PROTOTYPES.station.bestScoreKey)).toBe(false);
    expect(saveBest(18.5, PROTOTYPES.station.bestScoreKey)).toBe(true);
    expect(saveBest(15, PROTOTYPES.garden.bestScoreKey)).toBe(true);
    expect(saveBest(18, PROTOTYPES.garden.bestScoreKey)).toBe(false);
    expect(saveBest(14, PROTOTYPES.garden.bestScoreKey)).toBe(true);
    expect(saveBest(100, PROTOTYPES.tour.bestScoreKey)).toBe(true);
    expect(saveBest(101, PROTOTYPES.tour.bestScoreKey)).toBe(false);
    expect(records).toEqual(new Map([
      ['tiny-planet-courier:best:v1', '67'],
      ['tiny-planet-courier:bay-leap:best:v1', '12.5'],
      ['tiny-planet-courier:station:best:v1', '18.5'],
      ['tiny-planet-courier:garden:best:v1', '14'],
      ['tiny-planet-courier:tour:best:v1', '100'],
    ]));
    expect(readBest()).toBe(67);
    expect(readBest(PROTOTYPES.bay.bestScoreKey)).toBe(12.5);
    expect(readBest(PROTOTYPES.station.bestScoreKey)).toBe(18.5);
    expect(readBest(PROTOTYPES.garden.bestScoreKey)).toBe(14);
  });
});
