import test from 'node:test';
import assert from 'node:assert/strict';
import {gamesA} from '../src/games/group-a.js';
import {gamesB} from '../src/games/group-b.js';
import {WorkshopSounds, WORKSHOP_SOUND_KEY, workshopFeedbackCue} from '../src/workshop-sounds.js';

test('submissions confirm before the verdict and only new feedback sounds', () => {
  const family = gamesB.find(game => game.id === 'G08');
  const museum = gamesA.find(game => game.id === 'G01');
  function act(game, state, type, value, expected) {
    const previous = state.feedback;
    const next = game.act(state, {type, value});
    assert.equal(workshopFeedbackCue(type, previous, next.feedback), expected);
    return next;
  }
  let state = family.create(0, 1);
  state = act(family, state, 'check', '', 'submit');
  for (const face of ['dots_01', 'dots_02', 'bamboo_03']) state = act(family, state, 'pick', face, null);
  state = act(family, state, 'check', '', 'submit-retry');
  state = act(family, state, 'check', '', 'submit-retry');
  state = act(family, state, 'pick', 'bamboo_03', null);
  state = act(family, state, 'pick', 'dots_03', null);
  act(family, state, 'check', '', 'submit-correct');

  state = act(museum, museum.create(0, 1), 'check', '', 'submit-retry');
  act(museum, state, 'pick', state.order[0], null);
  const success = {kind: 'success'};
  assert.equal(workshopFeedbackCue('sample-submit', null, success), 'submit-correct');
  assert.equal(workshopFeedbackCue('flip', null, success), 'correct');
  assert.equal(workshopFeedbackCue('pick', null, {kind: 'error'}), 'retry');
});

test('material contact and offline verdict audio stop immediately when the workshop is muted', async () => {
  const saved = new Map([['mahjong-solitaire:tile-sounds', 'off']]);
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch, oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const starts = [], fetched = [], stops = [];
  class Context {
    sampleRate = 48000;
    currentTime = 4;
    state = 'suspended';
    resume() { this.state = 'running'; return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({contact: true}); }
    createBuffer(channels, length) {
      assert.equal(channels, 1);
      const samples = new Float32Array(length);
      return {samples, getChannelData: () => samples};
    }
    createBufferSource() {
      return {connect: target => target, disconnect() {},
        start(when) { starts.push({buffer: this.buffer, when}); }, stop() { stops.push(this.buffer); }};
    }
    createGain() { return {gain: {value: 0}, connect() {}, disconnect() {}}; }
  }
  try {
    globalThis.window = {AudioContext: Context};
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value)}});
    globalThis.fetch = async url => {
      fetched.push(url);
      return {ok: true, arrayBuffer: async () => new ArrayBuffer(32)};
    };
    const sound = new WorkshopSounds();
    assert.equal(sound.enabled, true);
    await sound.playAction({theme: 'bamboo', contact: 'pick', cue: 'correct'});
    await sound.playAction({cue: 'submit-retry'});
    assert.deepEqual(fetched, ['/public/audio/tiles/bamboo-pick-2.wav']);
    assert.equal(starts.length, 3);
    assert.ok(starts[0].buffer.contact);
    assert.equal(starts[1].when, 4.075);
    const wrong = starts[2].buffer.samples;
    assert.ok(wrong.slice(0, 3000).some(v => v !== 0));
    assert.ok(wrong.slice(3500, 5000).every(v => v === 0));
    assert.ok(wrong.slice(5100).some(v => v !== 0));

    const pending = sound.playAction({cue: 'submit-correct'});
    sound.toggle();
    assert.equal(saved.get(WORKSHOP_SOUND_KEY), 'off');
    assert.equal(stops.length, 3);
    assert.equal(new WorkshopSounds().enabled, false);
    await sound.playAction({cue: 'submit'});
    sound.toggle();
    await pending;
    assert.equal(starts.length, 3);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
    globalThis.fetch = oldFetch;
  }
});
