export type CompanionSound = 'typing' | 'popup' | 'select' | 'complete';

let audioContext: AudioContext | undefined;

export function playCompanionSound(kind: CompanionSound, muted: boolean): void {
  if (muted || typeof window === 'undefined') return;
  try {
    audioContext ??= new AudioContext();
    const context = audioContext;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const notes = soundNotes(kind);
    notes.forEach(({ frequency, delay, duration, gain }) => {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = kind === 'typing' ? 'square' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      volume.gain.setValueAtTime(0.0001, now + delay);
      volume.gain.exponentialRampToValueAtTime(gain, now + delay + 0.006);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + 0.02);
    });
  } catch {
    // Sound is decorative; browser autoplay restrictions must never block the app.
  }
}

function soundNotes(kind: CompanionSound) {
  if (kind === 'typing') return [{ frequency: 520, delay: 0, duration: 0.025, gain: 0.012 }];
  if (kind === 'popup') return [
    { frequency: 392, delay: 0, duration: 0.09, gain: 0.035 },
    { frequency: 587, delay: 0.08, duration: 0.13, gain: 0.035 },
  ];
  if (kind === 'select') return [{ frequency: 466, delay: 0, duration: 0.08, gain: 0.03 }];
  return [
    { frequency: 523, delay: 0, duration: 0.11, gain: 0.035 },
    { frequency: 659, delay: 0.1, duration: 0.13, gain: 0.035 },
    { frequency: 784, delay: 0.2, duration: 0.18, gain: 0.04 },
  ];
}
