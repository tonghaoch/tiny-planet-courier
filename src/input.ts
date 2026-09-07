import type { Controls } from './vehicle';

export class Input {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, string>();
  private readonly gameplayKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  constructor(isPlaying: () => boolean, pause: () => void, recover: () => void) {
    window.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.code === 'Escape' && !event.repeat) { pause(); return; }
      if (!isPlaying()) return;
      if (this.gameplayKeys.has(event.code)) event.preventDefault();
      // Native buttons still respond to keyboard activation; do not drive while focusing them.
      if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
      this.keys.add(event.code);
      if (event.code === 'KeyR' && !event.repeat) recover();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    document.querySelectorAll<HTMLElement>('[data-press]').forEach(button => {
      button.addEventListener('pointerdown', event => {
        if (!isPlaying()) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, button.dataset.press!);
        button.classList.add('pressed');
      });
      const release = (event: PointerEvent) => {
        this.pointers.delete(event.pointerId);
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
    window.addEventListener('blur', () => { this.clear(); if (isPlaying()) pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.clear(); if (isPlaying()) pause(); }
    });
  }

  clear() {
    this.keys.clear();
    this.pointers.clear();
    document.querySelectorAll('.pressed').forEach(element => element.classList.remove('pressed'));
  }

  get controls(): Controls {
    const touch = new Set(this.pointers.values());
    const down = (...codes: string[]) => codes.some(code => this.keys.has(code));
    return {
      throttle: Number(down('KeyW', 'ArrowUp') || touch.has('gas')) - Number(down('KeyS', 'ArrowDown') || touch.has('brake')),
      steer: Number(down('KeyD', 'ArrowRight') || touch.has('right')) - Number(down('KeyA', 'ArrowLeft') || touch.has('left')),
      boost: down('Space') || touch.has('boost'),
    };
  }
}
