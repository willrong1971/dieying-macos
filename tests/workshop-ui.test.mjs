import test from 'node:test';
import assert from 'node:assert/strict';
import {gamesA} from '../src/games/group-a.js';
import {gamesB} from '../src/games/group-b.js';
import {gamesC} from '../src/games/group-c.js';
import {h, resetTileCount} from '../src/ui.js';
import {validateProfile} from '../src/records.js';
import {
  renderWorkshop, renderCatalog, renderTask, renderLevels, renderSettings,
} from '../src/workshop-view.js';

const games = [...gamesA, ...gamesB, ...gamesC];
const clone = value => JSON.parse(JSON.stringify(value));
const fresh = () => ({schema: 1, material: 'ivory', states: {}, notes: {}, discoveries: [], lastGame: 'G08'});
const render = (current, level = 0, options = {}) => renderWorkshop({
  games, current, level, state: current.create(level, 20261027), profile: fresh(),
  historyCount: 0, futureCount: 0, helpers: h, ...options,
});
const tags = html => [...html.matchAll(/<[a-z][^>]*>/gi)].map(match => match[0]);
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
function actionSignatures(html) {
  const counts = new Map();
  for (const tag of tags(html)) {
    const action = attribute(tag, 'data-action');
    if (!action) continue;
    const signature = JSON.stringify([
      tag.match(/^<([a-z]+)/i)[1].toLowerCase(), action,
      attribute(tag, 'data-value') ?? '', /\sdisabled(?:[\s=>])/.test(tag),
    ]);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  return counts;
}
function globalControls(html, name) {
  return tags(html).filter(tag => attribute(tag, 'data-global') === name);
}
function occurrences(html, value) {
  return value ? html.split(value).length - 1 : 0;
}
function hasNoPermanentTeachingChrome(html) {
  assert.doesNotMatch(html, /class="[^"]*\b(?:sidebar|thinking-panel|nav-game|level-tabs)\b/);
  assert.equal(globalControls(html, 'game').length, 0, 'full game directory lives in the catalog');
  assert.equal(globalControls(html, 'level').length, 0, 'all level choices live in their panel');
  assert.equal(globalControls(html, 'hint').length, 0, 'hints are opened on demand');
  assert.doesNotMatch(html, /<textarea|id="discovery-note"/i, 'notes live in the task panel');
}

test('all 16 games and 69 levels render a focused table without losing a mathematical action', () => {
  assert.equal(games.length, 16);
  assert.equal(games.reduce((total, game) => total + game.levels.length, 0), 69);
  for (const game of games) {
    for (let level = 0; level < game.levels.length; level++) {
      const state = game.create(level, 20261027);
      const profile = fresh();
      const before = clone({state, profile});
      resetTileCount();
      const original = game.view(state, h);
      resetTileCount();
      const html = render(game, level, {state, profile});
      assert.equal(typeof html, 'string', `${game.id}:${level}`);
      assert.match(html, /id="game-surface"/);
      assert.doesNotMatch(html, /\b(?:undefined|NaN)\b/, `${game.id}:${level}`);
      hasNoPermanentTeachingChrome(html);
      const actual = actionSignatures(html);
      for (const [signature, count] of actionSignatures(original)) {
        assert.equal(actual.get(signature), count, `${game.id}:${level} preserves ${signature}`);
      }
      const goal = state.goal || game.levels[level]?.goal || game.intro;
      assert.equal(occurrences(html, h.escape(goal)), 1, `${game.id}:${level} presents its goal once`);
      assert.deepEqual({state, profile}, before, `${game.id}:${level} rendering does not change saved work`);
    }
  }
});

test('each game declares a layout family and keeps the shared undo and redo controls', () => {
  const families = new Set();
  for (const game of games) {
    const html = render(game, 0, {historyCount: 1, futureCount: 1});
    const family = tags(html).map(tag => attribute(tag, 'data-family')).find(Boolean);
    assert.ok(family, `${game.id} has an explicit layout family`);
    families.add(family);
    for (const action of ['undo', 'redo']) {
      const controls = globalControls(html, action);
      assert.equal(controls.length, 1, `${game.id} ${action}`);
      assert.doesNotMatch(controls[0], /\sdisabled(?:[\s=>])/);
    }
  }
  assert.ok(families.size >= 4, 'different mathematical table structures retain useful layout families');
  const html = render(games[0]);
  for (const action of ['undo', 'redo']) assert.match(globalControls(html, action)[0], /\sdisabled(?:[\s=>])/);
});

test('the on-demand catalog exposes every game and category filters select only their category', () => {
  const profile = fresh();
  const html = renderCatalog({games, profile, filter: 'all'});
  const ids = globalControls(html, 'game').map(tag => attribute(tag, 'data-value'));
  assert.deepEqual([...new Set(ids)].sort(), games.map(game => game.id).sort());
  for (const category of ['count', 'logic', 'explore']) {
    const filtered = renderCatalog({games, profile, filter: category});
    const selected = globalControls(filtered, 'game').map(tag => attribute(tag, 'data-value'));
    assert.deepEqual([...new Set(selected)].sort(), games.filter(game => game.category === category).map(game => game.id).sort());
  }
  assert.deepEqual(profile, fresh());
});

test('level panels preserve every published level, current level and recorded discoveries', () => {
  for (const game of games) {
    const level = game.levels.length - 1;
    const profile = fresh();
    profile.discoveries.push({gameId: game.id, title: game.title, level: 0, seed: 42,
      time: '2026-10-27T00:00:00.000Z', hintsUsed: 0, viewedExplanation: false, explanation: '', note: ''});
    const html = renderLevels({game, level, profile});
    const controls = globalControls(html, 'level');
    assert.equal(controls.length, game.levels.length, game.id);
    assert.deepEqual(controls.map(tag => Number(attribute(tag, 'data-value'))), game.levels.map((_, index) => index));
    const current = controls.find(tag => attribute(tag, 'data-value') === String(level));
    assert.match(current, /aria-current="(?:step|true)"|aria-pressed="true"/, `${game.id} identifies the current level`);
    for (const item of game.levels) assert.ok(html.includes(h.escape(item.label)));
  }
});

test('task panels provide progressive hints, explanations and the old schema note without changing it', () => {
  for (const game of games) {
    const state = game.create(0, 42);
    const profile = fresh();
    profile.states[`${game.id}:0`] = {state: clone(state), hintIndex: 0, explanation: true};
    profile.notes[`${game.id}:0`] = `我想继续研究${game.title}。`;
    const before = clone(profile);
    assert.deepEqual(validateProfile(profile, games, h), profile);
    const html = renderTask({game, level: 0, state, profile, hintIndex: 0, explanation: true, helpers: h});
    assert.equal(globalControls(html, 'hint').length, 1, game.id);
    assert.ok(html.includes(h.escape(game.hints(state)[0])), `${game.id} current hint`);
    assert.ok(html.includes(h.escape(game.explain(state))), `${game.id} explanation`);
    assert.match(html, /<textarea[^>]*id="discovery-note"/);
    const note = tags(html).find(tag => attribute(tag, 'id') === 'discovery-note');
    assert.equal(attribute(note, 'data-note-key'), `${game.id}:0`, 'notes remain bound to the displayed game and level');
    assert.ok(html.includes(h.escape(profile.notes[`${game.id}:0`])));
    assert.deepEqual(profile, before);
  }
});

test('completion offers next level only when one exists and never advances the saved state during render', () => {
  for (const game of games) {
    for (const level of [0, game.levels.length - 1]) {
      const state = {...game.create(level, 7), complete: true};
      const before = clone(state);
      const html = render(game, level, {state});
      assert.equal(globalControls(html, 'next').length, level < game.levels.length - 1 ? 1 : 0, `${game.id}:${level}`);
      assert.deepEqual(state, before);
    }
  }
});

test('all three material choices remain available in settings and use the saved material', () => {
  for (const material of ['ivory', 'bamboo', 'porcelain']) {
    const profile = {...fresh(), material};
    const html = renderSettings({profile, renderStatus: {state: 'ready', count: 42}});
    const controls = globalControls(html, 'material');
    assert.deepEqual(controls.map(tag => attribute(tag, 'data-value')).sort(), ['bamboo', 'ivory', 'porcelain']);
    assert.match(controls.find(tag => attribute(tag, 'data-value') === material), /aria-pressed="true"/);
    assert.equal(profile.material, material);
  }
});

test('shell and panels escape imported text in goals, feedback, titles, notes, hints and explanations', () => {
  const unsafe = '<img src=x onerror="alert(1)"> & " <script>alert(2)</script>';
  const safe = h.escape(unsafe);
  const base = games[0];
  const game = {...base, title: unsafe, kicker: unsafe, description: unsafe, intro: unsafe, grade: unsafe,
    levels: base.levels.map(item => ({...item, label: unsafe})), hints: () => [unsafe], explain: () => unsafe};
  const state = {...base.create(0, 3), goal: unsafe, feedback: {text: unsafe, kind: 'info'}};
  const profile = {...fresh(), notes: {'G01:0': unsafe}};
  for (const html of [
    render(game, 0, {state, profile}),
    renderCatalog({games: [game], profile, filter: 'all'}),
    renderLevels({game, level: 0, profile}),
    renderTask({game, level: 0, state, profile, hintIndex: 0, explanation: true, helpers: h}),
  ]) {
    assert.ok(html.includes(safe));
    assert.ok(!html.includes(unsafe));
    assert.doesNotMatch(html, /<script|<img src=x|onerror="alert/);
  }
});
