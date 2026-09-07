export class AudioFeedback {
  enabled = false;
  private context: AudioContext | null = null;

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    return this.enabled;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { this.enabled = false; }
  }

  chime(complete = false) {
    if (!this.enabled) return;
    this.unlock();
    const context = this.context;
    if (!context) return;
    const notes = complete ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 783.99, 987.77];
    notes.forEach((note, i) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const at = context.currentTime + i * 0.10;
      oscillator.type = 'sine';
      oscillator.frequency.value = note;
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.09, at + 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.5);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    });
  }
}
