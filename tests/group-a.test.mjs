import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gamesA, museum, recipes, selections, repetitions, houses,
  combinations, uniquePermutations, sumRecipes, selectionSolutions, boxDistributions,
} from '../src/games/group-a.js';

const clone = x => JSON.parse(JSON.stringify(x));
const act = (game, state, type, value = '') => game.act(state, { type, value: String(value) });
const h = {
  tile: (id, options = {}) => `<button data-face="${id}" data-action="${options.action || ''}"></button>`,
  button: (text, action, value = '') => `<button data-action="${action}" data-value="${value}">${text}</button>`,
  escape: text => String(text).replaceAll('<', '&lt;'),
  progress: (a, b) => `${a}/${b}`,
};

function chooseRanks(game, state, ranks) {
  const chosenIds = [];
  for (const rank of ranks) {
    const card = state.cards.find(c => c.rank === rank && !chosenIds.includes(c.id));
    assert.ok(card, 'required physical copy exists');
    chosenIds.push(card.id); act(game, state, 'pick', card.id);
  }
}

test('all five descriptors have serializable states, at least four levels and render each level', () => {
  assert.deepEqual(gamesA.map(g => g.id), ['G01', 'G02', 'G03', 'G04', 'G05']);
  for (const game of gamesA) {
    assert.ok(game.levels.length >= 4);
    for (let i = 0; i < game.levels.length; i++) {
      const state = game.create(i, 20261027);
      assert.deepEqual(clone(state), state);
      assert.ok(typeof state.goal === 'string' && state.goal.length >= 20 && state.goal.length <= 45, `${game.id}:${i} goal is short and specific`);
      const html = game.view(state, h);
      assert.ok(html.includes('data-action='));
      assert.ok(!html.includes('undefined'));
      assert.ok(game.hints(state).length >= 3);
      assert.ok(game.explain(state).length > 20);
      assert.equal(state.complete, false);
    }
  }
});

test('seeded challenges repeat the same inventory and display order', () => {
  assert.deepEqual(museum.create(3, 'same'), museum.create(3, 'same'));
  assert.notDeepEqual(museum.create(3, 'same').missing, museum.create(3, 'another').missing);
  assert.deepEqual(recipes.create(3, 42).cards, recipes.create(3, 42).cards);
});

test('G01 classifies all nine tiles and rejects a misplacement before completing', () => {
  const s = museum.create(0, 1);
  act(museum, s, 'pick', 'dots_01'); act(museum, s, 'place', 'dots_02'); act(museum, s, 'check');
  assert.equal(s.complete, false);
  assert.equal(s.feedback.kind, 'error');
  assert.ok(s.feedback.text.includes('二筒'));
  act(museum, s, 'return', 'dots_02'); act(museum, s, 'place', 'dots_01');
  for (const key of s.order.filter(key => key !== 'dots_01')) {
    act(museum, s, 'pick', key); act(museum, s, 'place', key);
  }
  act(museum, s, 'check');
  assert.equal(s.complete, true); assert.equal(s.progress.current, 9);
  assert.equal(new Set(Object.values(s.cells)).size, 9);
});

test('G01 missing-card conclusion requires the full missing set and preserves state on transpose', () => {
  const s = museum.create(2, 1);
  for (const key of s.order) { act(museum, s, 'pick', key); act(museum, s, 'place', key); }
  act(museum, s, 'place', 'dots_03'); act(museum, s, 'check'); assert.equal(s.complete, false);
  act(museum, s, 'place', 'characters_07');
  const before = clone(s.cells); act(museum, s, 'transpose'); assert.deepEqual(s.cells, before);
  act(museum, s, 'check'); assert.equal(s.complete, true);
});

test('G02 recipe solver respects copies, unordered equivalence, and the seven triple recipes', () => {
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(sumRecipes(ranks, 2, 2, 10), [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]]);
  assert.equal(sumRecipes(ranks, 1, 2, 10).length, 4);
  assert.equal(sumRecipes(ranks, 1, 3, 12).length, 7);
});

test('G02 cannot use one physical five twice and gives an exact sum difference', () => {
  const s = recipes.create(1, 1);
  const five = s.cards.find(c => c.rank === 5);
  act(recipes, s, 'pick', five.id); act(recipes, s, 'pick', five.id);
  assert.equal(s.chosen.length, 1); assert.equal(s.feedback.kind, 'error');
  act(recipes, s, 'clear'); chooseRanks(recipes, s, [2, 7]); act(recipes, s, 'submit');
  assert.match(s.feedback.text, /还差1/); assert.equal(s.found.length, 0);
});

test('G02 completes only the full unique answer set and restores inventory after submission', () => {
  const s = recipes.create(1, 1);
  for (const answer of s.answers) { chooseRanks(recipes, s, answer); act(recipes, s, 'submit'); assert.equal(s.chosen.length, 0); }
  assert.equal(s.complete, true); assert.equal(s.found.length, 5); assert.equal(s.cards.length, 18);
  chooseRanks(recipes, s, [9, 1]); act(recipes, s, 'submit'); assert.equal(s.found.length, 5);
});

test('G03 combination and permutation answer spaces have the correct counts', () => {
  assert.equal(combinations([1, 2, 3], 2).length, 3);
  assert.deepEqual(Object.values(selectionSolutions(3, 2)).map(a => a.length), [3, 6]);
  assert.deepEqual(Object.values(selectionSolutions(4, 2)).map(a => a.length), [6, 12]);
  assert.deepEqual(Object.values(selectionSolutions(3, 3)).map(a => a.length), [1, 6]);
  assert.deepEqual(Object.values(selectionSolutions(3, 2, 1)).map(a => a.length), [3, 4]);
});

test('G03 inverse order is duplicate in selection but new in queue, and both books are retained', () => {
  const s = selections.create(0, 1);
  for (const n of [1, 2]) act(selections, s, 'pick', n); act(selections, s, 'submit');
  for (const n of [2, 1]) act(selections, s, 'pick', n); act(selections, s, 'submit');
  assert.equal(s.found.choose.length, 1); act(selections, s, 'mode', 'queue');
  for (const n of [1, 2]) act(selections, s, 'pick', n); act(selections, s, 'submit');
  for (const n of [2, 1]) act(selections, s, 'pick', n); act(selections, s, 'submit');
  assert.equal(s.found.queue.length, 2); assert.equal(s.found.choose.length, 1); assert.equal(s.complete, false);
});

test('G03 full small two-book flow and position restriction are validated', () => {
  const s = selections.create(0, 1);
  for (const mode of ['choose', 'queue']) {
    act(selections, s, 'mode', mode);
    for (const answer of s.answers[mode]) { for (const n of answer) act(selections, s, 'pick', n); act(selections, s, 'submit'); }
  }
  assert.equal(s.complete, true);
  const limited = selections.create(3, 1); act(selections, limited, 'mode', 'queue');
  for (const n of [1, 2]) act(selections, limited, 'pick', n); act(selections, limited, 'submit');
  assert.equal(limited.found.queue.length, 0); assert.equal(limited.feedback.kind, 'error');
});

test('G04 counts repeated arrangements and explicitly distinct identities correctly', () => {
  assert.equal(uniquePermutations([1, 1, 2]).length, 3);
  assert.equal(uniquePermutations([1, 1, 1, 2]).length, 4);
  assert.equal(uniquePermutations([1, 1, 2, 2]).length, 6);
  assert.equal(uniquePermutations([1, 1, 2, 3]).length, 12);
  assert.equal(repetitions.create(4, 1).answers.length, 6);
});

test('G04 exchanging same-face physical copies does not create a new arrangement', () => {
  const s = repetitions.create(0, 1); act(repetitions, s, 'submit');
  const positions = s.arrangement.map((id, i) => s.cards.find(c => c.id === id).rank === 1 ? i : -1).filter(i => i >= 0);
  act(repetitions, s, 'swap-pick', positions[0]); act(repetitions, s, 'swap-pick', positions[1]);
  assert.match(s.feedback.text, /图案没有改变/); act(repetitions, s, 'submit'); assert.equal(s.found.length, 1);
});

test('G04 mirror arrangements stay distinct and all legal diagrams complete the collection', () => {
  const s = repetitions.create(0, 1);
  for (const answer of s.answers) {
    const used = [];
    s.arrangement = answer.map(n => { const c = s.cards.find(c => c.rank === n && !used.includes(c.id)); used.push(c.id); return c.id; });
    act(repetitions, s, 'submit');
  }
  assert.equal(s.found.length, 3); assert.equal(s.complete, true);
});

test('G05 labelled box counts match empty/nonempty/capacity/first-box constraints', () => {
  assert.equal(boxDistributions(4, 3).length, 15);
  assert.equal(boxDistributions(4, 3, { min: 1 }).length, 3);
  assert.equal(boxDistributions(4, 3, { max: 2 }).length, 6);
  assert.equal(boxDistributions(4, 3, { first: 1 }).length, 4);
  assert.equal(boxDistributions(2, 2).length, 3);
});

test('G05 refuses incomplete and empty forbidden allocations without losing cards', () => {
  const s = houses.create(2, 1);
  act(houses, s, 'add', 0); act(houses, s, 'submit'); assert.equal(s.found.length, 0);
  for (let i = 0; i < 3; i++) act(houses, s, 'add', 0); act(houses, s, 'submit');
  assert.equal(s.found.length, 0); assert.equal(s.feedback.kind, 'error');
  act(houses, s, 'remove', 0); assert.equal(s.counts.reduce((a, b) => a + b, 0), 3);
});

test('G05 keeps labelled permutations distinct and completes exactly all fifteen', () => {
  const s = houses.create(1, 1);
  for (const answer of s.answers) {
    for (let i = 0; i < answer.length; i++) for (let j = 0; j < answer[i]; j++) act(houses, s, 'add', i);
    act(houses, s, 'submit'); assert.deepEqual(s.counts, [0, 0, 0]);
  }
  assert.equal(s.found.length, 15); assert.equal(s.complete, true);
  assert.ok(s.found.some(a => a.join() === '2,1,1'));
  assert.ok(s.found.some(a => a.join() === '1,2,1'));
  for (const [i, n] of [2, 1, 1].entries()) for (let j = 0; j < n; j++) act(houses, s, 'add', i);
  act(houses, s, 'submit'); assert.equal(s.found.length, 15);
});
