import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gamesC, flipReachable, flipMinimum, entityPairs, exactPairCounts,
  drawEntityPair, equationValue, equationSolutions, applyEquationOperation,
  mirrorIndex, symmetryValid, magicSquares, magicValid, magicCompletions,
  winningTable, optimalTake,
} from '../src/games/group-c.js';

const game = id => gamesC.find(g => g.id === id);
const act = (g, state, type, value = '') => g.act(state, {type, value});
const h = {
  escape: v => String(v).replace(/[&<>"']/g, x => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[x])),
  tile: (face, opts = {}) => `<button data-face="${face}" data-action="${opts.action || ''}">${opts.label || face}</button>`,
  button: (text, action, value = '') => `<button data-action="${action}" data-value="${value}">${text}</button>`,
  progress: (n, total) => `${n}/${total}`,
};

test('six complete descriptors have four serializable levels and render without DOM', () => {
  assert.deepEqual(gamesC.map(g => g.id), ['G11', 'G12', 'G13', 'G14A', 'G14B', 'G15']);
  for (const g of gamesC) {
    assert.equal(g.levels.length, 4);
    for (let level = 0; level < 4; level++) {
      const s = g.create(level, 20261027);
      assert.equal(s.level, level);
      assert.equal(s.complete, false);
      assert.equal(typeof s.goal, 'string');
      assert.ok([...s.goal].length >= 20 && [...s.goal].length <= 45, `${g.id} level ${level} goal should be concise and specific`);
      assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
      assert.ok(g.view(s, h).includes('data-action'));
      assert.ok(g.hints(s).length >= 3);
      assert.ok(g.explain(s).length > 40);
    }
  }
});

test('G11 exact parity criterion and minimum for distinct paired flips', () => {
  const from = Array(6).fill(false);
  assert.equal(flipReachable(from, [true, false, false, false, false, false]), false);
  assert.equal(flipMinimum(from, [true, true, true, true, false, false]), 2);
  assert.equal(flipMinimum([true, false], [false, false]), null);
  assert.equal(flipReachable([false], [false, false]), false);
  const g = game('G11'); const s = g.create(0, 1);
  act(g, s, 'flip', 0); act(g, s, 'flip', 0);
  assert.equal(s.moves.length, 0); assert.equal(s.pending, null);
  assert.ok(s.bits.every(x => !x));
  act(g, s, 'flip', 0); act(g, s, 'flip', 2);
  assert.equal(s.moves.length, 1); assert.equal(s.complete, true);
});

test('G11 a failed experiment is not accepted as impossibility proof', () => {
  const g = game('G11'); const s = g.create(2, 1);
  act(g, s, 'judge', 'no'); act(g, s, 'reason', 'tried'); act(g, s, 'check');
  assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
  act(g, s, 'reason', 'parity'); act(g, s, 'check');
  assert.equal(s.complete, true);
});

test('G12 physical pairs partition into 1:2:2:1 and cannot reuse one identity', () => {
  const g = game('G12'); const s = g.create(0, 1); const exact = exactPairCounts(s.bag);
  assert.equal(exact.total, 6); assert.deepEqual(exact.counts, {'11': 1, '12': 2, '13': 2, '23': 1});
  const seq = [0, 0]; const drawn = drawEntityPair(s.bag, () => seq.shift());
  assert.notEqual(drawn[0].id, drawn[1].id); assert.deepEqual(drawn.map(e => e.value), [1, 1]);
  assert.equal(s.bag.length, 4);
  act(g, s, 'draw', 10);
  assert.equal(s.rounds, 10); assert.equal(s.bag.length, 4);
  assert.equal(Object.values(s.counts).reduce((a, b) => a + b, 0), 10);
  assert.ok(s.history.every(r => r.ids[0] !== r.ids[1]));
  const before = JSON.stringify(s.counts); act(g, s, 'labels');
  assert.equal(JSON.stringify(s.counts), before);
});

test('G12 counts vary correctly with inventory and completion never gates on random frequency', () => {
  assert.deepEqual(game('G12').create(2, 1).exact, {'11': 3, '12': 3});
  const g = game('G12'); const s = g.create(0, 9);
  act(g, s, 'predict', 'equal');
  act(g, s, 'draw', 10);
  for (const sample of s.samples) {
    for (const id of sample.entities) act(g, s, 'sample-pick', id);
    act(g, s, 'group', sample.key); act(g, s, 'sample-submit');
  }
  assert.equal(s.collected.length, 6);
  act(g, s, 'reason', 'entities'); act(g, s, 'check');
  assert.equal(s.complete, true); // initial prediction is allowed to be revised
  assert.equal(s.progress.current, s.progress.total);
  const extreme = g.create(0, 9);
  Object.assign(extreme, {prediction: 'different', rounds: 10, counts: {'11': 10, '12': 0, '13': 0, '23': 0}, collected: extreme.samples.map(p => p.id), reason: 'entities'});
  act(g, extreme, 'check'); assert.equal(extreme.complete, true);
});

test('G12 wrong sample bin and duplicate sample cannot advance collection', () => {
  const g = game('G12'); const s = g.create(0, 1);
  act(g, s, 'sample-pick', s.bag[0].id); act(g, s, 'sample-pick', s.bag[1].id);
  act(g, s, 'group', '12'); act(g, s, 'sample-submit'); assert.equal(s.collected.length, 0);
  act(g, s, 'group', '11'); act(g, s, 'sample-submit'); assert.equal(s.collected.length, 1);
  act(g, s, 'sample-pick', s.bag[0].id); act(g, s, 'sample-pick', s.bag[1].id);
  act(g, s, 'group', '11'); act(g, s, 'sample-submit'); assert.equal(s.collected.length, 1);
});

test('G13 equivalent operations preserve all original solutions', () => {
  const original = {la: 2, lb: 2, ra: 0, rb: 8};
  assert.deepEqual(equationSolutions(original), [3]);
  const subtract = applyEquationOperation(original, 'subtract', 2);
  assert.equal(subtract.ok, true); assert.deepEqual(equationSolutions(subtract.equation), [3]);
  const divide = applyEquationOperation(subtract.equation, 'divide', 2);
  assert.deepEqual(divide.equation, {la: 1, lb: 0, ra: 0, rb: 3});
  assert.deepEqual(equationSolutions(divide.equation), [3]);
  assert.equal(applyEquationOperation(original, 'divide', 0).ok, false);
  assert.equal(applyEquationOperation(original, 'divide', 3).ok, false);
  assert.equal(applyEquationOperation(original, 'left-only', 2).ok, false);
  assert.deepEqual(original, {la: 2, lb: 2, ra: 0, rb: 8});
});

test('G13 guesses, original substitution and derivation are distinct', () => {
  const g = game('G13'); const s = g.create(1, 1);
  act(g, s, 'assign', 4); assert.match(s.feedback.text, /10.*8/);
  act(g, s, 'check'); assert.equal(s.complete, false);
  act(g, s, 'subtract'); act(g, s, 'divide');
  act(g, s, 'assign', 3); act(g, s, 'check');
  assert.equal(s.complete, true); assert.equal(s.steps.length, 2); assert.equal(s.verifiedBy, '等价变形后验证');
  const guess = g.create(1, 1); act(g, guess, 'assign', 3); act(g, guess, 'check');
  assert.equal(guess.complete, true); assert.equal(guess.verifiedBy, '试填后验证');
  assert.deepEqual(equationValue(guess.original, 3), {left: 8, right: 8});
  for (let seed = 0; seed < 25; seed++) assert.equal(equationSolutions(g.create(3, seed).original).length, 1);
});

test('G14A maps positions, includes empties, and preserves physical inventory', () => {
  assert.equal(mirrorIndex(0, 'vertical'), 2);
  assert.equal(mirrorIndex(0, 'horizontal'), 6);
  assert.equal(mirrorIndex(4, 'horizontal'), 4);
  assert.equal(symmetryValid(Array(9).fill(null)), false);
  const g = game('G14A');
  for (let level = 0; level < 4; level++) {
    const s = g.create(level, 812);
    assert.ok(symmetryValid(s.solution, s.axes));
    const counts = {};
    for (const face of s.solution) counts[face] = (counts[face] || 0) + 1;
    assert.ok(Math.max(...Object.values(counts)) <= 4);
    for (let i = 0; i < 9; i++) if (!s.board[i]) {
      const e = s.pool.find(e => e.face === s.solution[i]);
      act(g, s, 'sym-pick', e.id); act(g, s, 'sym-cell', i);
    }
    act(g, s, 'check'); assert.equal(s.complete, true);
    assert.equal(s.pool.length, 0);
  }
});

test('G14A rejected mismatch and immutable clue do not consume inventory', () => {
  const g = game('G14A'); const s = g.create(1, 1);
  const count = s.pool.length; act(g, s, 'sym-pick', s.pool[0].id); act(g, s, 'sym-cell', 0);
  assert.equal(s.pool.length, count);
  s.board[2] = {id: 'fake', face: 'dots_09'}; s.board[5] = {id: 'fake2', face: 'dots_09'}; s.board[8] = {id: 'fake3', face: 'dots_09'};
  act(g, s, 'check'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
});

test('G14B has eight orientations and checks both diagonals', () => {
  assert.equal(magicSquares.length, 8); assert.equal(new Set(magicSquares.map(b => b.join(','))).size, 8);
  assert.ok(magicSquares.every(magicValid));
  assert.equal(magicValid([1, 5, 9, 6, 7, 2, 8, 3, 4]), false); // row/column sums 15, diagonals fail
  assert.equal(magicValid([8, 1, 6, 3, 5, 7, 4, 9, 9]), false);
  assert.equal(magicCompletions(Array(9).fill(null)).length, 8);
  const centered = Array(9).fill(null); centered[4] = 5;
  assert.equal(magicCompletions(centered).length, 8);
});

test('G14B accepts all matching solutions and deduplicates fixed-direction collection', () => {
  const g = game('G14B');
  for (let seed = 0; seed < 8; seed++) {
    for (let level = 0; level < 4; level++) {
      const s = g.create(level, seed); const solutions = magicCompletions(s.givens);
      if (level === 3) assert.equal(solutions.length, 2);
      for (const b of solutions.slice(0, s.goalCount)) {
        for (let i = 0; i < 9; i++) if (!s.givens[i]) {act(g, s, 'magic-pick', b[i]); act(g, s, 'magic-cell', i);}
        act(g, s, 'check');
      }
      assert.equal(s.complete, true);
      const count = s.collection.length; act(g, s, 'check'); assert.equal(s.collection.length, count);
    }
  }
});

test('G15 optimal table matches the control modulus and legal limit', () => {
  for (const maxTake of [1, 2, 3, 4]) {
    const wins = winningTable(100, maxTake);
    for (let n = 0; n <= 100; n++) assert.equal(wins[n], n % (maxTake + 1) !== 0);
    for (let n = 1; n <= 100; n++) {
      const k = optimalTake(n, maxTake); assert.ok(k >= 1 && k <= Math.min(n, maxTake));
      if (wins[n]) assert.equal(wins[n - k], false);
    }
  }
  assert.equal(optimalTake(13, 3), 1); assert.equal(optimalTake(0, 3), 0);
});

test('G15 thirteen-tile strategy wins against every legal response tree', () => {
  function respond(n) {
    if (n === 0) return true;
    assert.equal(n % 4, 0);
    for (let opponent = 1; opponent <= Math.min(3, n); opponent++) {
      const reply = 4 - opponent;
      assert.ok(reply <= n - opponent);
      assert.equal(respond(n - opponent - reply), true);
    }
    return true;
  }
  assert.equal(respond(12), true);
});

test('G15 actual game, explanation, ending and two-person mode', () => {
  const g = game('G15'); const s = g.create(1, 1);
  act(g, s, 'reason', 'group');
  while (s.phase === 'playing') act(g, s, 'take', optimalTake(s.remaining, s.maxTake));
  assert.equal(s.winner, 0); assert.equal(s.complete, true); assert.equal(s.remaining, 0);
  const history = s.history.length; act(g, s, 'take', 1); assert.equal(s.history.length, history);
  const invalid = g.create(0, 2); const before = invalid.remaining; act(g, invalid, 'take', 9); assert.equal(invalid.remaining, before);
  const two = g.create(2, 1); act(g, two, 'predict', 'second'); act(g, two, 'reason', 'group');
  while (two.phase === 'playing') act(g, two, 'take', 1);
  act(g, two, 'check'); assert.equal(two.complete, true);
  const five = g.create(3, 1); act(g, five, 'reason', 'group');
  while (five.phase === 'playing') act(g, five, 'take', optimalTake(five.remaining, 4));
  assert.equal(five.winner, 0); assert.equal(five.complete, true);
});

test('G11 changing a validated judgment or reason revokes current completion', () => {
  const g = game('G11'); const s = g.create(2, 1);
  act(g, s, 'judge', 'no'); act(g, s, 'reason', 'parity'); act(g, s, 'check');
  assert.equal(s.complete, true);
  act(g, s, 'judge', 'yes'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.feedback.kind, 'error'); assert.equal(s.complete, false);
  act(g, s, 'judge', 'no'); act(g, s, 'check'); assert.equal(s.complete, true);
  act(g, s, 'reason', 'tried'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.feedback.kind, 'error'); assert.equal(s.complete, false);
  const reach = g.create(0, 1);
  act(g, reach, 'flip', 0); act(g, reach, 'flip', 2); assert.equal(reach.complete, true);
  act(g, reach, 'flip', 0); act(g, reach, 'flip', 1); assert.equal(reach.complete, false);
  act(g, reach, 'check'); assert.equal(reach.complete, false);
});

test('G12 changed explanation needs a new check while historical samples remain', () => {
  const g = game('G12'); const s = g.create(0, 1);
  act(g, s, 'predict', 'different'); act(g, s, 'draw', 10);
  for (const sample of s.samples) {
    sample.entities.forEach(id => act(g, s, 'sample-pick', id));
    act(g, s, 'group', sample.key); act(g, s, 'sample-submit');
  }
  act(g, s, 'reason', 'entities'); act(g, s, 'check'); assert.equal(s.complete, true);
  const saved = JSON.stringify(s.collected);
  act(g, s, 'reason', 'frequency'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
  assert.equal(JSON.stringify(s.collected), saved);
  act(g, s, 'reason', 'entities'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, true);
  act(g, s, 'labels'); assert.equal(s.complete, true); // display-only switch
  act(g, s, 'predict', 'equal'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, true); // a prediction is not forced to be correct
  act(g, s, 'draw', 1); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, true);
});

test('G13 changed value and new equation operations revoke completion before rechecking', () => {
  const g = game('G13'); const s = g.create(1, 1);
  act(g, s, 'assign', 3); act(g, s, 'check'); assert.equal(s.complete, true);
  act(g, s, 'assign', 4); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
  act(g, s, 'assign', 3); act(g, s, 'check'); assert.equal(s.complete, true);
  act(g, s, 'divide'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, true);
  const equation = JSON.stringify(s.equation);
  act(g, s, 'one-side'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
  assert.equal(JSON.stringify(s.equation), equation);
});

test('G14A removing or mismatching a completed board does not keep its completion flag', () => {
  const g = game('G14A'); const s = g.create(1, 1);
  for (let i = 0; i < 9; i++) if (!s.board[i]) {
    const e = s.pool.find(e => e.face === s.solution[i]);
    act(g, s, 'sym-pick', e.id); act(g, s, 'sym-cell', i);
  }
  act(g, s, 'check'); assert.equal(s.complete, true);
  act(g, s, 'sym-cell', 2); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, false);
  act(g, s, 'sym-cell', 5);
  const wrong = s.pool.find(e => e.face === s.solution[5]);
  act(g, s, 'sym-pick', wrong.id); act(g, s, 'sym-cell', 2);
  const other = s.pool[0]; act(g, s, 'sym-pick', other.id); act(g, s, 'sym-cell', 5);
  act(g, s, 'check'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
});

test('G14B historical collection survives editing, but current board must be valid again', () => {
  const g = game('G14B'); const s = g.create(0, 1);
  const answer = magicCompletions(s.givens)[0];
  act(g, s, 'magic-pick', answer[8]); act(g, s, 'magic-cell', 8); act(g, s, 'check');
  assert.equal(s.complete, true); assert.equal(s.collection.length, 1);
  act(g, s, 'magic-cell', 8); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
  assert.equal(s.collection.length, 1);
  act(g, s, 'magic-pick', answer[8]); act(g, s, 'magic-cell', 8); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, true); assert.equal(s.collection.length, 1);
});

test('G15 changing strategy or outcome judgment requires revalidation after a finished game', () => {
  const g = game('G15'); const s = g.create(1, 1);
  act(g, s, 'reason', 'group');
  while (s.phase === 'playing') act(g, s, 'take', optimalTake(s.remaining, s.maxTake));
  assert.equal(s.complete, true);
  act(g, s, 'reason', 'most'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, false); assert.equal(s.feedback.kind, 'error');
  act(g, s, 'reason', 'group'); assert.equal(s.complete, false);
  act(g, s, 'check'); assert.equal(s.complete, true);
  const two = g.create(2, 1); act(g, two, 'predict', 'second'); act(g, two, 'reason', 'group');
  while (two.phase === 'playing') act(g, two, 'take', 1);
  act(g, two, 'check'); assert.equal(two.complete, true);
  act(g, two, 'predict', 'first'); assert.equal(two.complete, false);
  act(g, two, 'check'); assert.equal(two.complete, false);
  act(g, two, 'predict', 'second'); assert.equal(two.complete, false);
  act(g, two, 'check'); assert.equal(two.complete, true);
});

test('all six checkers clear stale completion on an unfinished or invalid state', () => {
  for (const g of gamesC) {
    const s = g.create(0, 123); s.complete = true; // simulate a stale persisted flag
    act(g, s, 'check');
    assert.equal(s.complete, false, `${g.id} must not preserve a stale completion flag`);
  }
});

test('per-level goals describe actual targets, inventory, axes and take limits', () => {
  const flip = game('G11').create(0, 1); assert.match(flip.goal, /第1、3张.*背面.*其他朝正面/);
  assert.match(game('G11').create(2, 1).goal, /一张背面.*奇偶/);
  const lab = game('G12').create(3, 1); assert.ok(lab.goal.includes(`${lab.goalRounds}轮`)); assert.ok(lab.goal.includes(`${lab.samples.length}种实体组合`));
  assert.match(game('G13').create(1, 1).goal, /2×白板＋2＝8.*代回原式/);
  assert.match(game('G14A').create(2, 1).goal, /中间横线/);
  assert.match(game('G14A').create(3, 1).goal, /同时关于中间横线和竖线/);
  assert.match(game('G14B').create(3, 1).goal, /收齐2种.*两条对角线/);
  for (let seed = 0; seed < 12; seed++) {
    const take = game('G15').create(3, seed);
    assert.ok(take.goal.includes(`从${take.start}张开始`));
    assert.match(take.goal, /每次取1—4张/);
    assert.doesNotMatch(take.goal, /取1—3张/);
  }
});
