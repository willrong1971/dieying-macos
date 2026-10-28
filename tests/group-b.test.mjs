import test from 'node:test';
import assert from 'node:assert/strict';
import { gamesB, guaranteeThreshold, sieveRegion, sieveCounts, familyType, allFamilies, sampleGrid, gridIssues, gridCandidates, solveGrid, adjacent, canonicalRoute, routeValid, routeSolutions } from '../src/games/group-b.js';

const byId = id => gamesB.find(g => g.id === id);
const act = (g, s, type, value = '') => g.act(s, { type, value: String(value) });
const nine = ['dots', 'bamboo', 'characters'].flatMap(s => [1, 2, 3].map(n => s + '_0' + n));
const pool27 = ['dots', 'bamboo', 'characters'].flatMap(s => Array.from({ length: 9 }, (_, i) => s + '_0' + (i + 1)));

test('G06: finite-stock guarantee handles suits, ranks and impossible targets', () => {
  assert.equal(guaranteeThreshold(pool27, 'suit', 2).threshold, 4);
  assert.equal(guaranteeThreshold(pool27, 'suit', 3).threshold, 7);
  assert.equal(guaranteeThreshold(pool27, 'rank', 2).threshold, 10);
  assert.equal(guaranteeThreshold(['dots_01', 'bamboo_01'], 'suit', 2).threshold, null);
  assert.equal(guaranteeThreshold(['dots_01', 'bamboo_01', 'bamboo_02'], 'suit', 2).threshold, 3);
});

test('G06: a maximal actual counterexample plus a valid reason is required', () => {
  const g = byId('G06');
  for (let level = 0; level < g.levels.length; level++) {
    const s = g.create(level, 321), counts = {};
    for (const id of s.cards) {
      const k = s.attribute === 'suit' ? id.split('_')[0] : Number(id.split('_')[1]);
      if ((counts[k] || 0) < s.repeat - 1) { act(g, s, 'pick', id); counts[k] = (counts[k] || 0) + 1; }
    }
    assert.equal(s.chosen.length, s.safe);
    act(g, s, 'guess', s.threshold); act(g, s, 'reason', 'trial'); act(g, s, 'check');
    assert.equal(s.complete, false, 'one successful trial is not proof');
    act(g, s, 'reason', 'capacity'); act(g, s, 'check'); assert.equal(s.complete, true);
    act(g, s, 'guess', 99); assert.equal(s.complete, false);
  }
});

test('G07: overlap and complement counts are exact', () => {
  assert.deepEqual(sieveCounts(), { '10': 5, '11': 4, '01': 8, '00': 10 });
  assert.equal(sieveRegion('bamboo_02'), '11');
  assert.equal(sieveRegion('dots_02'), '01');
  assert.equal(sieveRegion('bamboo_03'), '10');
  assert.equal(sieveRegion('characters_03'), '00');
  assert.equal(sieveCounts(pool27, { above: 5 })['10'], 5);
});

test('G07: right total with a wrong region cannot pass; all four tasks can finish', () => {
  const g = byId('G07');
  for (let level = 0; level < g.levels.length; level++) {
    const s = g.create(level, 3);
    for (const id of s.cards) { act(g, s, 'pick', id); act(g, s, 'place', sieveRegion(id, s)); }
    act(g, s, 'guess', s.total);
    s.assignments.bamboo_02 = sieveRegion('bamboo_02', s) === '10' ? '11' : '10'; act(g, s, 'check'); assert.equal(s.complete, false);
    s.assignments.bamboo_02 = sieveRegion('bamboo_02', s); act(g, s, 'check'); assert.equal(s.complete, true);
    assert.equal(Object.keys(s.assignments).length, 27);
  }
});

test('G08: twelve distinct families split into 3 + 3 + 6', () => {
  const families = allFamilies(); assert.equal(families.length, 12);
  const counts = families.reduce((out, f) => { const key = familyType(f); out[key] = (out[key] || 0) + 1; return out; }, {});
  assert.deepEqual(counts, { suit: 3, rank: 3, both: 6 });
  assert.equal(familyType(['dots_01', 'bamboo_01', 'characters_02']), null);
  assert.equal(familyType(['dots_01', 'dots_01', 'dots_02']), null);
});

test('G08: collection ignores order and restores cards; complete means actual set', () => {
  const g = byId('G08'), s = g.create(2, 4), answers = allFamilies(s.cards);
  for (const id of answers[0]) act(g, s, 'pick', id); act(g, s, 'check');
  for (const id of [...answers[0]].reverse()) act(g, s, 'pick', id); act(g, s, 'check');
  assert.equal(s.found.length, 1); assert.equal(s.used.length, 0);
  act(g, s, 'clear');
  for (const family of answers.slice(1)) { for (const id of family) act(g, s, 'pick', id); act(g, s, 'check'); }
  assert.equal(s.found.length, 12); assert.equal(s.complete, true);
});

test('G08: disjoint grouping consumes each of the nine faces only once', () => {
  const g = byId('G08'), s = g.create(4, 2);
  for (const suit of ['dots', 'bamboo', 'characters']) {
    for (const n of [1, 2, 3]) act(g, s, 'pick', suit + '_0' + n);
    act(g, s, 'check');
  }
  assert.equal(s.complete, true); assert.equal(new Set(s.used).size, 9);
  act(g, s, 'pick', 'dots_01'); assert.equal(s.selected.length, 0);
});

test('G08: a one-family goal remains reached when the child keeps exploring', () => {
  const g = byId('G08'), s = g.create(0, 5);
  for (const family of allFamilies().slice(0, 2)) {
    for (const id of family) act(g, s, 'pick', id);
    act(g, s, 'check'); assert.equal(s.complete, true);
  }
  assert.equal(s.found.length, 2); assert.equal(s.progress.current, 1);
});

test('G09: solve counts 72 / 2 / 1 and never adds diagonal constraints', () => {
  assert.equal(solveGrid().length, 72);
  const firstRow = sampleGrid.map((id, i) => i < 3 ? id : null);
  assert.equal(solveGrid(firstRow).length, 2);
  firstRow[3] = sampleGrid[3]; assert.equal(solveGrid(firstRow).length, 1);
  assert.deepEqual(gridIssues(sampleGrid), []);
  assert.equal(new Set([sampleGrid[0], sampleGrid[4], sampleGrid[8]].map(id => Number(id.split('_')[1]))).size, 1, 'sample repeats on diagonal and is valid');
  assert.equal(solveGrid(['dots_01', 'dots_02', ...Array(7).fill(null)]).length, 0);
});

test('G09: each published level is playable, locked clues stay fixed, any valid completion passes', () => {
  const g = byId('G09');
  for (let level = 0; level < g.levels.length; level++) for (const seed of [1, 7, 23]) {
    const s = g.create(level, seed), original = [...s.givens], solution = solveGrid(s.board, 1)[0];
    assert.ok(solution);
    for (const i of s.fixed) { act(g, s, 'cell', i); assert.equal(s.board[i], original[i]); }
    for (let i = 0; i < 9; i++) if (!s.fixed.includes(i)) { act(g, s, 'pick', solution[i]); act(g, s, 'cell', i); }
    act(g, s, 'check'); assert.equal(s.complete, true);
    assert.deepEqual(gridIssues(s.board), []);
    if (level === 4) assert.equal(s.solutionCount, 1);
  }
});

test('G09: moving and swapping cannot duplicate a physical tile', () => {
  const g = byId('G09'), s = g.create(3, 1);
  act(g, s, 'pick', 'dots_01'); act(g, s, 'cell', 0);
  act(g, s, 'pick', 'bamboo_02'); act(g, s, 'cell', 1);
  act(g, s, 'cell', 0); act(g, s, 'cell', 1);
  assert.equal(s.board[0], 'bamboo_02'); assert.equal(s.board[1], 'dots_01');
  act(g, s, 'cell', 1); act(g, s, 'return');
  assert.equal(s.board[1], null); assert.deepEqual(gridCandidates(s.board, 1).includes('dots_01'), true);
});

const six = ['dots_01', 'dots_02', 'dots_03', 'bamboo_01', 'bamboo_02', 'bamboo_03'];
const goodRing = ['dots_01', 'dots_02', 'dots_03', 'bamboo_03', 'bamboo_02', 'bamboo_01'];
const badRing = ['dots_01', 'dots_02', 'dots_03', 'bamboo_03', 'bamboo_01', 'bamboo_02'];
test('G10: a valid line need not be a ring', () => {
  assert.ok(adjacent('dots_01', 'dots_03'));
  assert.ok(adjacent('dots_01', 'bamboo_01'));
  assert.equal(adjacent('dots_01', 'bamboo_02'), false);
  assert.equal(routeValid(six, badRing, { ring: false }), true);
  assert.equal(routeValid(six, badRing, { ring: true }), false);
  assert.equal(routeValid(six, goodRing, { ring: true }), true);
});

test('G10: cycles merge rotations and reversals; fixed endpoints preserve direction', () => {
  const key = canonicalRoute(goodRing, { ring: true });
  for (let i = 0; i < 6; i++) assert.equal(canonicalRoute(goodRing.slice(i).concat(goodRing.slice(0, i)), { ring: true }), key);
  assert.equal(canonicalRoute([...goodRing].reverse(), { ring: true }), key);
  assert.notEqual(canonicalRoute(goodRing, { directed: true }), canonicalRoute([...goodRing].reverse(), { directed: true }));
  assert.equal(routeSolutions(six, { ring: true }).length, 3);
});

test('G10: all five levels finish via actual legal moves, and ring collection deduplicates', () => {
  const g = byId('G10');
  for (let level = 0; level < g.levels.length; level++) {
    const s = g.create(level, 18), solutions = routeSolutions(s.cards, s, level === 4 ? Infinity : 1);
    assert.ok(solutions.length);
    for (const route of solutions) { for (const id of route) act(g, s, 'pick', id); act(g, s, 'check'); }
    assert.equal(s.complete, true);
  }
});

test('every group-B level emits usable HTML and JSON-only resumable state', () => {
  const h = { escape: x => String(x), tile: (id, options = {}) => '<button data-face="' + id + '" data-action="' + (options.action || '') + '"></button>', button: (text, action) => '<button data-action="' + action + '">' + text + '</button>', progress: () => '' };
  for (const g of gamesB) for (let i = 0; i < g.levels.length; i++) {
    const s = g.create(i, 42), restored = JSON.parse(JSON.stringify(s));
    const markup = g.view(restored, h);
    assert.ok(markup.includes('data-action='), g.id);
    assert.equal(typeof g.explain(s), 'string');
    assert.ok(g.hints(s).length >= 3);
    assert.equal(s.complete, false);
  }
});
