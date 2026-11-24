import {TileSounds} from './solitaire-sounds.js';

export const WORKSHOP_SOUND_KEY = 'mahjong-math-workshop:sounds';
const submissions = new Set(['check', 'submit', 'sample-submit']);
const cues = {
  submit: [{hz: 392, at: 0, length: .07, level: .58}],
  correct: [{hz: 523.25, at: 0, length: .19, level: .68}, {hz: 783.99, at: .105, length: .24, level: .71}],
  retry: [{hz: 392, at: 0, length: .14, level: .56}, {hz: 293.66, at: .093, length: .19, level: .52}],
};

export function workshopFeedbackCue(type, previousFeedback, feedback) {
  const submitted = submissions.has(type);
  const kind = previousFeedback === feedback ? null : feedback?.kind;
  const verdict = kind === 'success' ? 'correct' : kind === 'error' ? 'retry' : null;
  if (submitted && verdict) return `submit-${verdict}`;
  return verdict || (submitted ? 'submit' : null);
}

function makeCue(context, cue) {
  let notes = cues[cue];
  // Leave a short gap between the confirmation and its verdict.
  if (!notes) notes = [...cues.submit, ...cues[cue.slice('submit-'.length)].map(note => ({...note, at: note.at + .105}))];
  const sampleRate = context.sampleRate;
  const duration = Math.max(...notes.map(note => note.at + note.length));
  const buffer = context.createBuffer(1, Math.ceil(duration * sampleRate) + 1, sampleRate);
  const samples = buffer.getChannelData(0);
  for (const {hz, at, length, level} of notes) {
    const first = Math.round(at * sampleRate);
    const count = Math.floor(length * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(t / .006, 1) * (1 - i / count) ** 3;
      const phase = t * 2 * Math.PI * hz;
      samples[first + i] += level * envelope * (.82 * Math.sin(phase) + .18 * Math.sin(2 * phase));
    }
  }
  return buffer;
}

export class WorkshopSounds extends TileSounds {
  constructor() {
    super(undefined, {storageKey: WORKSHOP_SOUND_KEY});
    this.cueBuffers = new Map();
  }

  async playAction({theme, contact, cue}) {
    if (!this.enabled || (!contact && !cue)) return;
    const generation = this.generation;
    try {
      const contactPlaying = contact && this.play(theme, contact);
      if (!cue) return;
      const context = this.audioContext();
      if (!context) return;
      // Request playback while the click or keyboard gesture is still active.
      await Promise.all([context.resume(), contactPlaying]);
      if (!this.enabled || generation !== this.generation || context.state !== 'running') return;
      if (!this.cueBuffers.has(cue)) this.cueBuffers.set(cue, makeCue(context, cue));
      this.startBuffer(this.cueBuffers.get(cue), {kind: cue, clip: cue, volume: .16, delay: contact ? .075 : 0});
    } catch {
      // Feedback remains visible if audio is unavailable on this device.
    }
  }
}
