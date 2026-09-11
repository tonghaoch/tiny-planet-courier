import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROTOTYPES, selectTourSeed } from '../delivery-prototypes';
import { DELIVERY_HOLD, formatTime, saveBest } from '../game';
import { createTourPlan } from '../tour-itinerary';
import { TourSession } from '../tour-session';
import { UI } from '../ui';
import { Vehicle } from '../vehicle';
import { PlanetWorld } from '../world';
import { installTestBridge } from './test-bridge';
import type { PlanetTestHandoff } from './test-bridge-types';

// Minimal result DOM: this tests text/state, not browser layout or native key handling.
class ElementFixture {
  textContent = '';
  innerHTML = '';
  hidden = false;
  children: ElementFixture[] = [];
  attributes = new Set<string>();
  classList = { remove: vi.fn() };
  replaceChildren(...children: ElementFixture[]) {
    this.children = children;
  }
  append(...children: ElementFixture[]) {
    this.children.push(...children);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

function resultUI() {
  const ids = [
    'parcel-count',
    'queue-stops',
    'ticket-next',
    'mission-index',
    'mission-name',
    'mission-parcel',
    'marker-label',
    'tour-details',
    'tour-splits',
    'tour-result',
    'tour-result-time',
    'tour-best-time',
    'tour-record-label',
    'bay-result',
    'toast',
  ];
  const elements = new Map(ids.map(id => [id, new ElementFixture()]));
  const ui = Object.create(UI.prototype) as UI;
  Object.assign(ui, {
    prototype: PROTOTYPES.tour,
    app: { dataset: {} },
    elements,
    lastMode: 'playing',
    invalidateGeometry: vi.fn(),
    syncNavigationVisibility: vi.fn(),
    resetNavigationPresentation: vi.fn(),
    getNavigationPresentation: () => ({
      mode: 'hidden' as const,
      commandedHeading: null,
      displayedHeading: null,
      arrival: false,
    }),
    getWelcomeFrame: () => ({ x: 0, y: 0, diameter: 0 }),
  });
  return { ui, element: (id: string) => elements.get(id)! };
}

afterEach(() => vi.unstubAllGlobals());

describe('Tour presentation integration contracts', () => {
  it('pins seed 227 for targeted legacy northern UI fixtures without fixing real new tours', () => {
    const seed = selectTourSeed('?test&tourSeed=227', true);
    expect(createTourPlan(seed).order).toEqual([
      'bay',
      'station',
      'garden',
      'depot',
      'beacon',
      'garden',
      'station',
      'bay',
      'beacon',
      'depot',
    ]);
  });
  it('renders ten numbered occurrence names and reads only the explicitly supplied route record', () => {
    vi.stubGlobal('document', { createElement: () => new ElementFixture() });
    const storage = new Map([['tiny-planet-courier:tour:best:v1', '0.1']]);
    const getItem = vi.fn((key: string) => storage.get(key) ?? null);
    vi.stubGlobal('localStorage', { getItem, setItem: (key: string, value: string) => storage.set(key, value) });
    const tour = new TourSession(undefined, createTourPlan(1));
    const { ui, element } = resultUI();
    ui.setDestinations(tour.destinations);
    expect(element('parcel-count').textContent).toBe('10');
    expect(element('mission-index').textContent).toBe('01 / 10');
    expect(element('ticket-next').textContent).toBe(`Next: ${tour.target!.name}`);
    expect(element('queue-stops').innerHTML.match(/data-stop=/g)).toHaveLength(10);
    tour.start();
    for (let i = 0; i < 10; i++) tour.update(DELIVERY_HOLD + i, tour.target!.normal, 0);
    const newRecord = saveBest(tour.elapsed, tour.recordKey);
    getItem.mockClear();
    element('tour-details').attributes.add('open');
    ui.showTourResults(tour.elapsed, tour.splits, newRecord, tour.recordKey);
    expect(getItem.mock.calls).toEqual([[tour.recordKey]]);
    expect(storage.get('tiny-planet-courier:tour:best:v1')).toBe('0.1');
    expect(element('tour-details').attributes.has('open')).toBe(false);
    expect(element('tour-splits').children.map(row => row.children.map(child => child.textContent))).toEqual(
      tour.splits.map(split => [
        `${String(split.index + 1).padStart(2, '0')} · ${tour.destinations[split.index].name}`,
        formatTime(split.elapsed, true),
      ]),
    );
    expect(element('tour-result-time').textContent).toBe(formatTime(tour.elapsed, true));
    expect(element('tour-best-time').textContent).toBe(formatTime(tour.elapsed, true));
    expect(element('tour-record-label').textContent).toBe('A new route best!');
    expect(element('tour-result').hidden).toBe(false);
    ui.showTourResults(tour.elapsed, tour.splits, false, tour.recordKey);
    expect(element('tour-record-label').textContent).toBe('All ten parcels delivered.');
    ui.resetJourney();
    expect(element('tour-splits').children).toEqual([]);
    expect(element('tour-result').hidden).toBe(true);
  });

  it('exposes five physical sites, ten route occurrences, defensive snapshots and repeat-aware docking', () => {
    vi.stubGlobal('window', {});
    const scene = new Scene();
    const world = new PlanetWorld('tour', true);
    scene.add(world.root);
    const random = vi.fn().mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    const offer = () => createTourPlan(selectTourSeed('', true, random));
    const tour = new TourSession(world.tourLayout!, offer());
    const vehicle = new Vehicle(scene, world.drivingEnvironment, true);
    vehicle.setCargoCapacity(10);
    const { ui } = resultUI();
    const handoffs: PlanetTestHandoff[] = [];
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 40);
    camera.updateMatrixWorld();
    const refreshHUD = vi.fn();
    installTestBridge({
      camera,
      scene,
      world,
      vehicle,
      ui,
      tour,
      run: tour,
      prototypeId: 'tour',
      renderer: { info: { render: { calls: 0, triangles: 0 } } } as WebGLRenderer,
      clearControls: vi.fn(),
      setControls: vi.fn(),
      resetNavigation: vi.fn(),
      refreshHUD,
      observe: () => ({
        width: 800,
        height: 600,
        guidance: null,
        roadRoute: null,
        tourRoute: null,
        tourNavigationPhase: 'local',
        handoffs,
        recentDriveEvents: [],
      }),
    });
    const bridge = window.__planetTest!;
    const offered = bridge.snapshot().tour!.plan;
    tour.start();
    tour.pause();
    bridge.snapshot();
    tour.resume();
    tour.restart();
    expect(tour.plan).toEqual(offered);
    expect(random).toHaveBeenCalledTimes(1);
    const routes = bridge.routes();
    if (!routes || !('legs' in routes)) throw new Error('Expected Tour routes');
    expect(routes.catalog.map(site => site.id)).toEqual(['bay', 'station', 'garden', 'beacon', 'depot']);
    expect(routes.legs).toHaveLength(10);
    expect(routes.connectors).toHaveLength(6);
    expect(routes.closing).toEqual(world.tourLayout!.connectors[2].path.map(point => point.toArray()));
    for (const leg of routes.legs) {
      expect(leg.stopId).toBe(tour.plan.order[leg.index]);
      expect(leg.occurrenceId).toBe(tour.occurrenceId(leg.index));
      expect(leg.wide).toEqual(tour.routeForLeg(leg.index, 'wide').map(point => point.toArray()));
      expect(leg.short).toEqual(tour.routeForLeg(leg.index, 'short').map(point => point.toArray()));
    }
    for (let index = 0; index < 10; index++) {
      const location = tour.currentStop!;
      bridge.setNavigationFixture({ x: 0, y: 0, reset: true });
      expect(vehicle.normal).toEqual(location.level.toNormal(0, 0));
      bridge.dockAtTarget();
      expect(vehicle.normal).toEqual(location.destination.normal);
      vehicle.syncVisual(0, 0);
      const event = tour.update(DELIVERY_HOLD, vehicle.normal, 0)!;
      expect(event.locationId).toBe(location.id);
      const origin = vehicle.consumeParcel()!;
      world.startLocationDelivery(origin, event.locationId);
      world.setActiveLocation(tour.currentLocationId ?? null);
      handoffs.push({
        index,
        occurrenceId: event.occurrenceId,
        locationId: event.locationId,
        origin: origin.toArray(),
        normal: vehicle.normal.toArray(),
        forward: vehicle.forward.toArray(),
        speed: vehicle.speed,
        charge: vehicle.charge,
        remaining: vehicle.cargoCount,
      });
      const snapshot = bridge.snapshot();
      expect(snapshot.cargoCount).toBe(9 - index);
      expect(snapshot.finished).toBe(index === 9);
      expect(snapshot.mode).toBe('playing');
      expect(snapshot.tour!.checkpoint.legIndex).toBe(index + 1);
      expect(snapshot.tour!.currentStop).toBe(tour.currentLocationId ?? null);
      expect(snapshot.tour!.reactions).toHaveLength(5);
      expect(snapshot.tour!.locals).toHaveLength(5);
      expect(snapshot.tour!.recipientScreens).toHaveLength(5);
      expect(snapshot.tour!.recipientScreens.every(screen => screen !== null)).toBe(true);
    }
    const completed = bridge.snapshot();
    expect(completed.reaction?.destination).toBe(tour.completedLocationId);
    expect(completed.tour!.currentStop).toBeNull();
    expect(completed.tour!.completedLocationId).toBe(tour.plan.order[9]);
    completed.tour!.handoffs[0].origin[0] = 99;
    completed.tour!.catalog[0].destination[0] = 99;
    const originalOrder = [...tour.plan.order];
    Object.assign(completed.tour!.plan.order, { 0: 'depot' });
    routes.legs[0].wide[0][0] = 99;
    expect(bridge.snapshot().tour!.handoffs[0].origin[0]).not.toBe(99);
    expect(bridge.snapshot().tour!.catalog[0].destination[0]).not.toBe(99);
    expect(tour.routeForLeg(0, 'wide')[0].x).not.toBe(99);
    expect(tour.plan.order).toEqual(originalOrder);
    expect(random).toHaveBeenCalledTimes(1);
    tour.startPlan(offer());
    tour.home();
    expect(random).toHaveBeenCalledTimes(2);
    expect(tour.plan).not.toEqual(offered);
    const nextOffer = tour.plan;
    tour.start();
    expect(tour.plan).toEqual(nextOffer);
    bridge.dockAtStop(4);
    expect(vehicle.normal).toEqual(world.tourLayout!.location('depot').destination.normal);
    bridge.dockAtLocation('beacon');
    expect(vehicle.normal).toEqual(world.tourLayout!.location('beacon').destination.normal);
    expect(refreshHUD).toHaveBeenCalledTimes(10);
  });
});
