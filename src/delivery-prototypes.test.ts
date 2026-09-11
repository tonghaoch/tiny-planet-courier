import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPES, selectPrototype, selectTourSeed } from './delivery-prototypes';
import { createTourPlan, tourRecordKey } from './tour-itinerary';
import { BAY_RECORD_KEY, readBest, saveBest } from './game';

afterEach(() => vi.unstubAllGlobals());

describe('prototype entry policy', () => {
  it.each(['bay', 'station', 'garden', 'tour'] as const)('selects the authored %s definition in development', id => {
    expect(selectPrototype(`?prototype=${id}`, true)).toBe(PROTOTYPES[id]);
    expect(selectPrototype(`?test=1&prototype=${id}&other=value`, true)).toBe(PROTOTYPES[id]);
  });

  it.each([
    '',
    '?test=1',
    '?other=value',
    '?prototype',
    '?prototype=',
    '?prototype=unknown',
    '?prototype=Bay',
    '?prototype=Station',
    '?prototype=Garden',
    '?prototype=Tour',
    '?prototype=Standard',
    '?prototype=constructor',
    '?prototype=__proto__',
    '?prototype=prototype',
    '?prototype=toString',
    '?prototype=hasOwnProperty',
    '?prototype=%20tour',
    '?prototype=tour%20',
  ])('defaults to Tour in development for %j', search => {
    expect(selectPrototype(search, true)).toBe(PROTOTYPES.tour);
  });

  it.each(['?prototype=standard', '?prototype=standard&test=1'])(
    'selects the explicit original comparison for %j',
    search => {
      expect(selectPrototype(search, true)).toBeNull();
    },
  );

  it.each([
    ['?prototype=bay&prototype=tour', PROTOTYPES.bay],
    ['?prototype=tour&prototype=standard', PROTOTYPES.tour],
    ['?prototype=standard&prototype=bay', null],
    ['?prototype=&prototype=bay', PROTOTYPES.tour],
    ['?prototype=unknown&prototype=standard', PROTOTYPES.tour],
    ['?prototype=__proto__&prototype=garden', PROTOTYPES.tour],
  ] as const)('retains first-selector semantics in development for %j', (search, definition) => {
    expect(selectPrototype(search, true)).toBe(definition);
  });

  it.each([
    '',
    '?test=1',
    '?prototype',
    '?prototype=',
    '?prototype=standard',
    '?prototype=standard&test=1',
    '?prototype=bay',
    '?prototype=station',
    '?prototype=garden',
    '?prototype=tour',
    '?prototype=bay&test=1',
    '?prototype=station&test=1',
    '?prototype=garden&test=1',
    '?prototype=tour&test=1',
    '?prototype=unknown',
    '?prototype=Tour',
    '?prototype=constructor',
    '?prototype=__proto__',
    '?prototype=toString',
    '?prototype=standard&prototype=bay&test=1',
    '?prototype=bay&prototype=standard',
    '?prototype=&prototype=standard',
    '?prototype=__proto__&prototype=garden&test=1',
  ])('always selects the official Tour in production for %j', search => {
    expect(selectPrototype(search, false)).toBe(PROTOTYPES.tour);
  });

  it('releases Tour copy while retaining standalone playtest labels', () => {
    expect(PROTOTYPES.tour.home.eyebrow).toBe('TEN-STOP TOUR');
    expect(PROTOTYPES.tour.home.title).toBe('Five places.<br>One big <span class="warm-word">day.</span>');
    expect(PROTOTYPES.tour.home.description).toContain('Five places. Ten little deliveries.');
    expect(JSON.stringify(PROTOTYPES.tour)).not.toMatch(/three|bakery first|returns to the bay/i);
    expect(JSON.stringify(PROTOTYPES.tour)).not.toMatch(/playtest/i);
    for (const id of ['bay', 'station', 'garden'] as const) expect(PROTOTYPES[id].home.eyebrow).toMatch(/PLAYTEST/);
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

describe('new Tour seed selection', () => {
  it.each(['?test&tourSeed=-1', '?test=0&tourSeed=4294967295', '?test=false&tourSeed=8589934591'])(
    'uses test presence and normalizes safe integers: %s',
    search => {
      const random = vi.fn(() => 0.25);
      expect(selectTourSeed(search, true, random)).toBe(0xffffffff);
      expect(random).not.toHaveBeenCalled();
    },
  );

  it.each([
    '',
    '?tourSeed=42',
    '?test&tourSeed',
    '?test&tourSeed=',
    '?test&tourSeed=%20',
    '?test&tourSeed=oops',
    '?test&tourSeed=1.5',
    '?test&tourSeed=Infinity',
    '?test&tourSeed=9007199254740992',
  ])('falls back harmlessly for %s', search => {
    const random = vi.fn(() => 0.25);
    expect(selectTourSeed(search, true, random)).toBe(0x40000000);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('ignores the override in production and takes an independent fresh draw per offer', () => {
    const random = vi.fn().mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    expect(selectTourSeed('?test&tourSeed=42', false, random)).toBe(0x40000000);
    expect(selectTourSeed('?test&tourSeed=42', false, random)).toBe(0xc0000000);
    expect(random).toHaveBeenCalledTimes(2);
  });
});

describe('prototype record identity', () => {
  it('retains standalone keys and requires a selected itinerary for Tour records', () => {
    expect(Object.keys(PROTOTYPES)).toEqual(['bay', 'station', 'garden', 'tour']);
    for (const id of ['bay', 'station', 'garden', 'tour'] as const) expect(PROTOTYPES[id].id).toBe(id);
    expect(PROTOTYPES.bay.bestScoreKey).toBe('tiny-planet-courier:bay-leap:best:v1');
    expect(PROTOTYPES.bay.bestScoreKey).toBe(BAY_RECORD_KEY);
    expect(PROTOTYPES.station.bestScoreKey).toBe('tiny-planet-courier:station:best:v1');
    expect(PROTOTYPES.station.bestScoreKey).not.toBe(PROTOTYPES.bay.bestScoreKey);
    expect(PROTOTYPES.garden.bestScoreKey).toBe('tiny-planet-courier:garden:best:v1');
    expect(PROTOTYPES.tour.bestScoreKey).toBeNull();
    expect(new Set(Object.values(PROTOTYPES).map(p => p.bestScoreKey)).size).toBe(4);
  });

  it('reads and writes standard, Bay, Station, Garden and Tour records independently', () => {
    const records = new Map<string, string>([['tiny-planet-courier:tour:best:v1', '9']]);
    const recordKey = tourRecordKey(createTourPlan(7));
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
    expect(saveBest(100, recordKey)).toBe(true);
    expect(saveBest(101, recordKey)).toBe(false);
    expect(records).toEqual(
      new Map([
        ['tiny-planet-courier:best:v1', '67'],
        ['tiny-planet-courier:bay-leap:best:v1', '12.5'],
        ['tiny-planet-courier:station:best:v1', '18.5'],
        ['tiny-planet-courier:garden:best:v1', '14'],
        ['tiny-planet-courier:tour:best:v1', '9'],
        [recordKey, '100'],
      ]),
    );
    expect(readBest()).toBe(67);
    expect(readBest(PROTOTYPES.bay.bestScoreKey)).toBe(12.5);
    expect(readBest(PROTOTYPES.station.bestScoreKey)).toBe(18.5);
    expect(readBest(PROTOTYPES.garden.bestScoreKey)).toBe(14);
    expect(readBest(recordKey)).toBe(100);
    expect(readBest(tourRecordKey(createTourPlan(8)))).toBeNull();
  });
});
