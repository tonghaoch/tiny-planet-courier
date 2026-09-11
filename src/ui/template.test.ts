import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PROTOTYPES } from '../delivery-prototypes';
import { renderDeliveryQueue, renderUIShell } from './template';

const variants = [
  { name: 'standard', prototype: null, hash: 'aa4872f42eec2035ff57b01591413e3879273c8520627d0968b6311d1c4e7880' },
  { name: 'bay', prototype: PROTOTYPES.bay, hash: 'edede7ad2eac2ab6301440c5f347b982782db04c368a1e83f152717ceb77ba44' },
  {
    name: 'station',
    prototype: PROTOTYPES.station,
    hash: '7c264d28dac04497a9c0dfd6de1b8d14f76f1dc26ebb0b2f1100d4727ac322fb',
  },
  {
    name: 'garden',
    prototype: PROTOTYPES.garden,
    hash: '2171dd342e3a989f6ff89eadddaa99ee137ad67f7f4a98ec0b966860a35ae092',
  },
  { name: 'tour', prototype: PROTOTYPES.tour },
];

describe('initial UI shell', () => {
  // Solo/standard shells retain their original byte-for-byte baseline.
  it.each(variants.filter(variant => variant.name !== 'tour'))(
    'preserves the complete $name shell',
    ({ prototype, hash }) => {
      expect(createHash('sha256').update(renderUIShell(prototype)).digest('hex')).toBe(hash);
    },
  );

  it('offers ten deliveries and a native collapsed, keyboard-focusable split disclosure', () => {
    const shell = renderUIShell(PROTOTYPES.tour);
    expect(shell).toContain('TEN-STOP TOUR');
    expect(shell).toContain('Five places.<br>One big');
    expect(shell).toContain('Ten smiles, delivered.');
    expect(shell).toContain('Route best');
    expect(shell).toContain(
      '<details id="tour-details"><summary>10 delivery splits <span>· same itinerary</span></summary><ol id="tour-splits" aria-label="Tour leg splits" tabindex="0"></ol></details>',
    );
    expect(shell).not.toMatch(/three|bakery first|returns to the bay|<details[^>]*\bopen/i);
    const queue = renderDeliveryQueue(10);
    expect([...queue.matchAll(/data-stop="(\d+)"/g)].map(match => Number(match[1]))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(queue).toContain('<span>10</span>');
  });

  it.each(variants)('retains navigation, actions and accessible overlays for $name', ({ prototype }) => {
    const shell = renderUIShell(prototype);
    const ids = [...shell.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(shell).toContain(
      '<section id="navigation-hud" class="navigation-hud" aria-label="Next delivery" aria-live="off" hidden>',
    );
    expect(shell).toContain('<div id="mission-context" class="mission-context" hidden>');
    expect(shell).toContain('<div id="queue-stops"></div>');
    expect(shell).toContain(
      prototype?.id === 'tour'
        ? '<ol id="tour-splits" aria-label="Tour leg splits" tabindex="0"></ol>'
        : '<ol id="tour-splits" aria-label="Tour leg splits"></ol>',
    );
    expect(shell).toContain('role="dialog" aria-modal="true" aria-labelledby="pause-title"');
    expect(shell).toContain('role="dialog" aria-modal="true" aria-labelledby="complete-title"');
    expect(shell).toContain('<div id="toast" class="toast" role="status" aria-live="polite">');
    expect(shell).toContain('<section id="error-panel" class="error-panel" hidden role="alert">');
    expect([...shell.matchAll(/data-action="([^"]+)"/g)].map(match => match[1])).toEqual([
      'home',
      'sound',
      'pause',
      'start',
      'resume',
      'restart',
      'home',
      'restart',
      'home',
      'restart',
      'restart',
      'reload',
    ]);
    expect([...shell.matchAll(/data-press="([^"]+)"/g)].map(match => match[1])).toEqual([
      'left',
      'right',
      'brake',
      'boost',
      'gas',
    ]);
  });

  it.each(variants)('keeps playtest and tour copy distinct for $name', ({ prototype }) => {
    const shell = renderUIShell(prototype);
    const isPlaytest = prototype !== null && prototype.id !== 'tour';
    expect(shell).toContain(isPlaytest ? `${prototype.name.toUpperCase()} PLAYTEST` : 'TINY PLANET COURIER');
    expect(shell).toContain(
      isPlaytest
        ? 'One parcel. One smile.'
        : prototype?.id === 'tour'
          ? 'Ten parcels. Ten smiles.'
          : 'Three parcels. Three smiles.',
    );
    expect(shell).toContain(
      `<div class="delivery-queue"><span>${isPlaytest ? 'One little mission' : 'Little missions'}</span>`,
    );
    expect(shell).toContain(
      `<button data-action="restart">${prototype?.id === 'tour' ? 'Restart tour' : 'Restart delivery'}</button>`,
    );
    expect(shell).toContain(`<p id="mission-hint">${prototype?.hints.choice ?? 'Take the scenic route'}</p>`);
  });
});

describe('delivery queue markup', () => {
  const parcel =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5v4"/></svg>';
  const line = '<span class="queue-line"></span>';

  it('renders no markup for an empty delivery list', () => {
    expect(renderDeliveryQueue(0)).toBe('');
  });

  it('preserves the complete single-stop markup without a connector', () => {
    expect(renderDeliveryQueue(1)).toBe(`<span class="queue-stop" data-stop="0">${parcel}<span>01</span></span>`);
  });

  it('preserves the complete three-stop Tour markup and connector order', () => {
    expect(renderDeliveryQueue(3)).toBe(
      `<span class="queue-stop" data-stop="0">${parcel}<span>01</span></span>${line}<span class="queue-stop" data-stop="1">${parcel}<span>02</span></span>${line}<span class="queue-stop" data-stop="2">${parcel}<span>03</span></span>`,
    );
  });

  it.each([12, 101])('keeps zero-based indices and untruncated labels for %s stops', count => {
    const queue = renderDeliveryQueue(count);
    expect([...queue.matchAll(/data-stop="(\d+)"/g)].map(match => Number(match[1]))).toEqual(
      Array.from({ length: count }, (_, i) => i),
    );
    expect(queue.split(line)).toHaveLength(count);
    expect(queue).toContain(`data-stop="${count - 1}">${parcel}<span>${count}</span>`);
    expect(queue.startsWith(line)).toBe(false);
    expect(queue.endsWith(line)).toBe(false);
  });
});
