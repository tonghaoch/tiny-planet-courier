import { TOUR_RECORD_KEY } from './tour-session';

export type PrototypeId = 'bay' | 'station' | 'garden' | 'tour';

/** Authored delivery identity and copy only; scene construction stays outside the UI. */
export interface PrototypeDefinition {
  readonly id: PrototypeId;
  readonly bestScoreKey: string;
  readonly name: string;
  readonly destinationName: string;
  readonly parcelDescription: string;
  readonly home: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly ticketHeading: string;
    readonly place: string;
    readonly code: string;
    readonly parcelLabel: string;
    readonly ticketDetail: string;
  };
  readonly hints: {
    readonly start: string;
    readonly recovery: string;
    readonly choice: string;
    readonly outer: string;
    readonly inner: string;
    readonly nearDestination: string;
  };
  readonly result: {
    readonly heading: string;
    readonly description: string;
    readonly bestLabel: string;
    readonly newRecord: string;
    readonly delivered: string;
  };
}

export const PROTOTYPES: Readonly<Record<PrototypeId, PrototypeDefinition>> = {
  bay: {
    id: 'bay',
    bestScoreKey: 'tiny-planet-courier:bay-leap:best:v1',
    name: 'Bay Leap',
    destinationName: 'Sunrise Bakery',
    parcelDescription: 'Warm croissants',
    home: {
      eyebrow: 'BAY LEAP · A LITTLE PLAYTEST',
      title: 'A little leap.<br>A big <span class="warm-word">smile.</span>',
      description: 'One warm parcel. Two ways across the bay.<br>Take the coast road—or boost off the ramp.',
      ticketHeading: 'ONE BAY · TWO WAYS',
      place: 'Sunrise Bay',
      code: 'BAY-01',
      parcelLabel: 'warm parcel',
      ticketDetail: 'Warm croissants ↗',
    },
    hints: {
      start: 'Coast road for a cruise. Hold boost for the ramp.',
      recovery: 'Ready for another go. Boost before the ramp—or take the coast.',
      choice: 'Coast road, or hold boost off the ramp.',
      outer: 'Enjoy the coast. Follow the pale road.',
      inner: 'Hold boost. Keep it straight.',
      nearDestination: 'Bakery ahead. Brake before the glow.',
    },
    result: {
      heading: 'Good morning,<br>Sunrise Bakery.',
      description: 'The parcel is home. Stay for the view.',
      bestLabel: 'Bay best',
      newRecord: 'A new bay best. Nicely delivered!',
      delivered: 'Delivered to Sunrise Bakery. Thank you!',
    },
  },
  station: {
    id: 'station',
    bestScoreKey: 'tiny-planet-courier:station:best:v1',
    name: 'Stargaze',
    destinationName: 'Stargaze Station',
    parcelDescription: 'A letter from Earth',
    home: {
      eyebrow: 'STARGAZE · A LITTLE PLAYTEST',
      title: 'A little turn.<br>A big <span class="warm-word">hello.</span>',
      description: 'One parcel. Two ways to Stargaze Station.<br>Cruise the outer road—or brake into the inner bends.',
      ticketHeading: 'ONE STATION · TWO WAYS',
      place: 'Stargaze Station',
      code: 'STAR-01',
      parcelLabel: 'little letter',
      ticketDetail: 'A letter from Earth ↗',
    },
    hints: {
      start: 'Outer road for wide turns. Inner lane? Brake early and turn gently.',
      recovery: 'Back on the road. Your parcel is safe.',
      choice: 'Take the outer road, or brake into the tighter inner lane.',
      outer: 'Outer road. Wide turns; brake before the station.',
      inner: 'Inner lane. Brake early for the tight turns.',
      nearDestination: 'Station ahead. Brake before the glow.',
    },
    result: {
      heading: 'Special delivery,<br>Stargaze Station.',
      description: 'A letter from Earth, safely delivered. Stay for the view.',
      bestLabel: 'Station best',
      newRecord: 'A new station best. Nicely delivered!',
      delivered: 'Delivered to Stargaze Station. Thank you!',
    },
  },
  garden: {
    id: 'garden',
    bestScoreKey: 'tiny-planet-courier:garden:best:v1',
    name: 'Garden',
    destinationName: 'Windmill Garden',
    parcelDescription: 'Flower seeds for the gardener',
    home: {
      eyebrow: 'WINDMILL GARDEN · A LITTLE PLAYTEST',
      title: 'A little path.<br>A big <span class="warm-word">bloom.</span>',
      description: 'One parcel. A garden full of little turns.<br>Take the wide loop—or flow between the flowers.',
      ticketHeading: 'ONE GARDEN · TWO WAYS',
      place: 'Windmill Garden',
      code: 'GARDEN-01',
      parcelLabel: 'packet of seeds',
      ticketDetail: 'A little more color ↗',
    },
    hints: {
      start: 'Wide garden loop, or a flowing path through the flowers.',
      recovery: 'Back at the approach. Your seeds are safe.',
      choice: 'Take the garden loop, or weave between the flower beds.',
      outer: 'Garden loop. Take the wide way round.',
      inner: 'Flower path. Look ahead and link the bends.',
      nearDestination: 'Garden ahead. Ease off and park in the glow.',
    },
    result: {
      heading: 'A little more color,<br>Windmill Garden.',
      description: 'Your seeds made someone’s day. Watch the garden bloom.',
      bestLabel: 'Garden best',
      newRecord: 'A new garden best. Beautifully delivered!',
      delivered: 'Delivered to Windmill Garden. Thank you!',
    },
  },
  tour: {
    id: 'tour',
    bestScoreKey: TOUR_RECORD_KEY,
    name: 'Three-stop Tour',
    destinationName: 'Sunrise Bakery',
    parcelDescription: 'Three parcels for three neighbors',
    home: {
      eyebrow: 'THREE-STOP TOUR',
      title: 'Three stops.<br>One big <span class="warm-word">day.</span>',
      description:
        'Bakery, station, garden. One connected journey.<br>Pick your paths and follow the roads between stops.',
      ticketHeading: 'ONE PLANET · THREE STOPS',
      place: 'Mint Planet',
      code: 'TOUR-01',
      parcelLabel: 'little parcels',
      ticketDetail: 'Bay → Station → Garden',
    },
    hints: {
      start: 'Bakery first. Take the coast road—or boost across the bay.',
      recovery: 'Back at your last reached safe point. Your deliveries are safe.',
      choice: 'Choose a local path, then follow the connecting road.',
      outer: 'Take the wide way round.',
      inner: 'Take the shorter local path.',
      nearDestination: 'Brake and park in the glow.',
    },
    result: {
      heading: 'Three smiles, delivered.',
      description: 'Keep exploring. The road returns to the bay.',
      bestLabel: 'Tour best',
      newRecord: 'A new tour best!',
      delivered: 'All three parcels delivered.',
    },
  },
};

export function selectPrototype(search: string, development: boolean): PrototypeDefinition | null {
  if (!development) return PROTOTYPES.tour;
  const id = new URLSearchParams(search).get('prototype');
  if (id === 'standard') return null;
  return id === 'bay' || id === 'station' || id === 'garden' || id === 'tour' ? PROTOTYPES[id] : PROTOTYPES.tour;
}
