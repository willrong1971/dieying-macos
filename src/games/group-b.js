/* The five attribute, constraint and proof games.  Logic is DOM-independent. */
const SUITS = ['dots', 'bamboo', 'characters'];
const SUIT_NAMES = { dots: '筒', bamboo: '条', characters: '萬' };
const pad = n => String(n).padStart(2, '0');
const face = (s, n) => s + '_' + pad(n);
const info = id => ({ suit: id.slice(0, id.lastIndexOf('_')), rank: Number(id.slice(id.lastIndexOf('_') + 1)) });
const name = id => { const a = info(id); return a.rank + SUIT_NAMES[a.suit]; };
const numericFaces = (max = 9) => SUITS.flatMap(s => Array.from({ length: max }, (_, i) => face(s, i + 1)));
const nineFaces = numericFaces(3);
const feedback = (s, text, kind = 'info') => { s.feedback = { text, kind }; return s; };
const code = xs => [...xs].sort().join('|');
function random(seed = 1) { let n = Number(seed) >>> 0; return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(xs, seed) { const r = random(seed), out = [...xs]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
const base = (level, seed, text) => ({ level, seed, feedback: { text, kind: 'info' }, complete: false });
const tileRow = (xs, h, action = 'pick', selected = []) => xs.map(id => h.tile(id, { action, value: id, selected: selected.includes(id) })).join('');
const emptyChoice = (text, action, value, h, selected = false) => '<button type="button" class="choice-btn' + (selected ? ' active' : '') + '" data-action="' + action + '" data-value="' + value + '">' + h.escape(text) + '</button>';

export function guaranteeThreshold(cards, attribute, repeat) {
  const counts = {};
  for (const id of cards) { const a = info(id); const k = attribute === 'rank' ? String(a.rank) : a.suit; counts[k] = (counts[k] || 0) + 1; }
  const possible = Object.values(counts).some(n => n >= repeat);
  const safe = Object.values(counts).reduce((sum, n) => sum + Math.min(n, repeat - 1), 0);
  return { counts, safe, threshold: possible ? safe + 1 : null };
}

const guaranteeConfigs = [
  { attribute: 'suit', repeat: 2, max: 3 },
  { attribute: 'suit', repeat: 3, max: 4 },
  { attribute: 'rank', repeat: 2, max: 9 },
  { attribute: 'rank', repeat: 3, max: 4 }
];
const g06 = {
  id: 'G06', title: '一定会撞上的秘密', kicker: '找出必然', category: 'logic', grade: '小学中高段',
  description: '先摆出最难撞上的情况，再说明为什么多一张就一定重复。', tags: ['抽屉原理', '最坏情况'],
  intro: '从牌池选牌，尽量不让同一类达到目标张数。先把各类都装到安全上限，再选最小保证张数和理由。摆出一次重复，不能证明每次都重复。',
  levels: [{ label: '两张同花', goal: '摆满仍不出现两张同花色的反例，再找最小保证张数。' }, { label: '三张同花', goal: '让每种花色都还不到三张，研究再多一张会怎样。' }, { label: '同数字', goal: '按数字分类，摆出没有相同数字的最大反例。' }, { label: '数字挑战', goal: '让每个数字都还不到三张，找到保证出现三张同数字的界限。' }],
  create(level = 0, seed = 1) {
    const cfg = guaranteeConfigs[level] || guaranteeConfigs[0];
    const cards = numericFaces(cfg.max), result = guaranteeThreshold(cards, cfg.attribute, cfg.repeat);
    return { ...base(level, seed, '先选牌，摆出“还没有达到目标”的最大阵容。'), ...cfg, cards: shuffle(cards, seed), chosen: [], guess: null, reason: '', safe: result.safe, threshold: result.threshold, groups: Object.keys(result.counts), progress: { current: 0, total: result.safe, label: '反例中的牌' } };
  },
  view(s, h) {
    const attribute = s.attribute === 'suit' ? '花色' : '数字';
    const groups = s.groups.map(k => {
      const cards = s.chosen.filter(id => String(info(id)[s.attribute]) === k);
      const title = s.attribute === 'suit' ? SUIT_NAMES[k] + '牌' : '数字' + k;
      return '<div class="soft-panel"><div class="subheading">' + title + ' · ' + cards.length + '张</div><div class="tile-pool">' + cards.map(id => h.tile(id, { action: 'pick', value: id, small: true, selected: true })).join('') + '</div></div>';
    }).join('');
    const options = Array.from({ length: 5 }, (_, i) => Math.max(1, s.safe - 1) + i);
    return '<div class="soft-panel"><h3>保证至少' + s.repeat + '张同' + attribute + '</h3><p>先摆一个最大反例：每类都还不到' + s.repeat + '张。</p></div>' +
      '<div class="board-grid" style="--cols:' + (s.groups.length > 3 ? 3 : s.groups.length) + '">' + groups + '</div>' +
      '<h3 class="subheading">可取的牌 <span class="small-text">点已摆出的牌可以归还</span></h3><div class="tile-pool">' + tileRow(s.cards.filter(id => !s.chosen.includes(id)), h) + '</div>' +
      '<div class="soft-panel"><h3>再多一张：最少取几张才一定出现？</h3><div class="choice-row">' + options.map(n => emptyChoice(n + '张', 'guess', n, h, s.guess === n)).join('') + '</div>' +
      '<h3 class="subheading">用什么理由说明？</h3><div class="choice-row">' +
      emptyChoice('各类已到安全上限，再来一张必进某一类', 'reason', 'capacity', h, s.reason === 'capacity') +
      emptyChoice('我刚才已经抽到过一次重复', 'reason', 'trial', h, s.reason === 'trial') +
      '</div></div><div class="action-row">' + h.button('检查反例和理由', 'check', '', { primary: true }) + h.button('清空摆牌', 'clear') + '</div>';
  },
  act(s, a) {
    if (a.type === 'pick' && s.cards.includes(a.value)) { s.chosen = s.chosen.includes(a.value) ? s.chosen.filter(x => x !== a.value) : [...s.chosen, a.value]; s.complete = false; s.progress.current = s.chosen.length; return feedback(s, '继续检查每一类的张数。'); }
    if (a.type === 'guess') { s.guess = Number(a.value); s.complete = false; return feedback(s, '张数已选好，再看反例和理由。'); }
    if (a.type === 'reason') { s.reason = a.value; s.complete = false; return feedback(s, '现在把你的摆牌和理由一起检查。'); }
    if (a.type === 'clear') { s.chosen = []; s.progress.current = 0; s.complete = false; return feedback(s, '牌已归还，重新构造反例。'); }
    if (a.type === 'check') {
      const counts = {};
      s.chosen.forEach(id => { const k = info(id)[s.attribute]; counts[k] = (counts[k] || 0) + 1; });
      if (Object.values(counts).some(n => n >= s.repeat)) return feedback(s, '这一摆法已经达到目标了。反例需要让每一类都少于' + s.repeat + '张。', 'error');
      if (s.chosen.length !== s.safe) return feedback(s, '这个反例还没装满：再看看哪些类别还能加牌而不达到目标。', 'error');
      if (s.guess !== s.threshold) return feedback(s, '反例已经摆满了。想想在它的基础上再加一张，最少保证值是多少。', 'error');
      if (s.reason !== 'capacity') return feedback(s, '一次抽到重复只说明“可能”。要说明“一定”，需要所有类别的安全位置都装满这个理由。', 'error');
      s.complete = true; return feedback(s, s.safe + '张仍能避开目标；第' + s.threshold + '张必须进入某一类，所以一定达到目标。', 'success');
    }
    return s;
  },
  hints(s) { return ['先看看这里有几种' + (s.attribute === 'suit' ? '花色' : '数字') + '。', '为了还不达到' + s.repeat + '张，每类最多放' + (s.repeat - 1) + '张。', '让每一类都到安全上限，再想多出的一张能去哪里。']; },
  explain(s) { return '保证不是运气：' + s.groups.length + '类都放到' + (s.repeat - 1) + '张，共' + s.safe + '张仍能避开目标；再多一张就无处避让。因此最少是' + s.threshold + '张。'; }
};

export function sieveRegion(id, cfg = {}) {
  const a = info(id), left = a.suit === (cfg.suit || 'bamboo');
  const right = cfg.above ? a.rank > cfg.above : a.rank % 2 === 0;
  return (left ? '1' : '0') + (right ? '1' : '0');
}
export function sieveCounts(cards = numericFaces(), cfg = {}) { const counts = { '10': 0, '11': 0, '01': 0, '00': 0 }; cards.forEach(id => counts[sieveRegion(id, cfg)]++); return counts; }
const targetRegions = { union: ['10', '11', '01'], intersection: ['11'], neither: ['00'], leftOnly: ['10'] };
const sieveConfigs = [{ target: 'union' }, { target: 'intersection' }, { target: 'neither' }, { target: 'leftOnly', above: 5 }];
const g07 = {
  id: 'G07', title: '两个筛子', kicker: '看见重叠', category: 'logic', grade: '小学高段至初中',
  description: '把每张牌放进两个条件的交叠区域，发现为什么不能重复计算。', tags: ['集合', '容斥'],
  intro: '先选一张牌，再点它应该进入的区域。两个条件同时符合的牌放在重叠区，一张牌始终只占一个位置。整理好所有牌，再回答本关问题。',
  levels: [{ label: '或者', goal: '按两个条件整理27张牌，找出条牌或者偶数牌。' }, { label: '并且', goal: '整理四个区域，找出同时满足两个条件的牌。' }, { label: '都不是', goal: '找出既不是条牌，也不是偶数牌的所有牌。' }, { label: '只有左边', goal: '条件变了：找出是条牌、但不满足右边数字条件的牌。' }],
  create(level = 0, seed = 1) {
    const cfg = { ...(sieveConfigs[level] || sieveConfigs[0]) };
    if (level === 3) cfg.above = 4 + Number(seed) % 3;
    const cards = numericFaces(), counts = sieveCounts(cards, cfg), total = targetRegions[cfg.target].reduce((n, k) => n + counts[k], 0);
    return { ...base(level, seed, '选一张牌，想想它符合左边、右边，还是两个条件都符合。'), ...cfg, cards: shuffle(cards, seed), assignments: {}, selected: null, guess: null, counts, total, progress: { current: 0, total: cards.length, label: '已经分类' } };
  },
  view(s, h) {
    const b = s.above ? '数字大于' + s.above : '偶数牌';
    const ask = { union: '条牌或者' + b, intersection: '既是条牌，又是' + b, neither: '既不是条牌，也不是' + b, leftOnly: '是条牌，但不是' + b }[s.target];
    const labels = { '10': '只符合左边：条牌', '11': '两个条件都符合', '01': '只符合右边：' + b, '00': '两个条件都不符合' };
    const regions = ['10', '11', '01', '00'].map(k => '<div class="soft-panel"><button class="choice-btn" type="button" data-action="place" data-value="' + k + '">' + labels[k] + '</button><div class="tile-pool">' + s.cards.filter(id => s.assignments[id] === k).map(id => h.tile(id, { action: 'pick', value: id, small: true, selected: s.selected === id })).join('') + '</div></div>').join('');
    const options = [...new Set([s.total, s.total + (s.counts['11'] || 3), Math.max(0, s.total - 2), 27])].sort((a, b) => a - b);
    return '<div class="soft-panel"><h3>左边：条牌　右边：' + b + '</h3><p>本关找出：<strong>' + ask + '</strong>。</p></div>' +
      '<div class="board-grid" style="--cols:2">' + regions + '</div><h3 class="subheading">待分类的牌</h3><div class="tile-pool">' + tileRow(s.cards.filter(id => !(id in s.assignments)), h, 'pick', s.selected ? [s.selected] : []) + '</div>' +
      '<div class="soft-panel"><h3>符合本关问题的牌，一共有几张？</h3><div class="choice-row">' + options.map(n => emptyChoice(n + '张', 'guess', n, h, s.guess === n)).join('') + '</div></div><div class="action-row">' + h.button('检查分类与计数', 'check', '', { primary: true }) + '</div>';
  },
  act(s, a) {
    if (a.type === 'pick' && s.cards.includes(a.value)) { s.selected = s.selected === a.value ? null : a.value; return feedback(s, s.selected ? '已选' + name(s.selected) + '，再点一个分类区域。' : '已取消选择。'); }
    if (a.type === 'place' && ['10', '11', '01', '00'].includes(a.value)) {
      if (!s.selected) return feedback(s, '请先选一张牌，再选它的区域。');
      s.assignments[s.selected] = a.value; s.selected = null; s.complete = false; s.progress.current = Object.keys(s.assignments).length;
      return feedback(s, '已经归类；点区域里的牌还能修改。');
    }
    if (a.type === 'guess') { s.guess = Number(a.value); s.complete = false; return feedback(s, '计数已选择，准备检查。'); }
    if (a.type === 'check') {
      const bad = s.cards.find(id => id in s.assignments && s.assignments[id] !== sieveRegion(id, s));
      if (bad) return feedback(s, '再看看' + name(bad) + '：它应该' + ({ '10': '只符合条牌', '11': '同时符合两个条件', '01': '只符合右边的数字条件', '00': '两个条件都不符合' }[sieveRegion(bad, s)]) + '。', 'error');
      if (Object.keys(s.assignments).length !== s.cards.length) return feedback(s, '已有分类都合适。还有' + (s.cards.length - Object.keys(s.assignments).length) + '张牌没有分类。');
      if (s.guess !== s.total) return feedback(s, '分类已经正确。把本关符合的区域加起来，每张只计算一次。', 'error');
      s.complete = true; return feedback(s, '分类和计数都成立，共' + s.total + '张。交叠区里的牌始终只算一次。', 'success');
    }
    return s;
  },
  hints(s) { return ['先判断它是不是条牌，再判断数字条件，分两次看。', '二条、四条这样的牌可能同时符合两个条件。', s.target === 'union' ? '把两个名单直接相加，会把重叠区算两遍；需要减去一次重叠。' : '根据题目，只把对应区域里的牌数相加。']; },
  explain(s) { const c = s.counts; return '四个区域分别有' + c['10'] + '、' + c['11'] + '、' + c['01'] + '、' + c['00'] + '张，合起来27张。' + (s.target === 'union' ? '或者允许同时符合：9＋12−4＝17。' : '本关取对应区域，共' + s.total + '张。'); }
};

export function familyType(ids) {
  if (ids.length !== 3 || new Set(ids).size !== 3) return null;
  const ns = new Set(ids.map(id => info(id).suit)).size, nr = new Set(ids.map(id => info(id).rank)).size;
  if (![1, 3].includes(ns) || ![1, 3].includes(nr)) return null;
  return ns === 1 ? 'suit' : nr === 1 ? 'rank' : 'both';
}
export function allFamilies(cards = nineFaces) {
  const out = [];
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) for (let c = b + 1; c < cards.length; c++) {
    const set = [cards[a], cards[b], cards[c]];
    if (familyType(set)) out.push([...set].sort());
  }
  return out;
}
const TYPE_LABEL = { suit: '同花色', rank: '同数字', both: '两项都不同' };
const g08 = {
  id: 'G08', title: '三张成族', kicker: '一张牌，两种线索', category: 'logic', grade: '小学中高段',
  description: '花色与数字都要全相同或全不同。找出一族，再发现所有可能。', tags: ['双属性', '组合枚举'],
  intro: '每次选三张牌。先检查花色：要么全相同，要么全不同；数字也要满足同样要求。两项都成立才是一族。两张一样、一张不同的情况不成立。',
  levels: [{ label: '找到第一族', goal: '选三张牌，让花色和数字两项都全相同或全不同。' }, { label: '三种类型', goal: '同花色、同数字、两项都不同，三种类型各找一组。' }, { label: '十二族图鉴', goal: '不重复、不遗漏地收齐九张牌中的十二族。' }, { label: '小牌桌挑战', goal: '研究这六张牌，找齐它们能组成的全部三张族。' }, { label: '三族分组', goal: '把九张牌分成三族，这次每张牌只能用一次。' }],
  create(level = 0, seed = 1) {
    const cards = level === 3 ? shuffle(nineFaces, seed).slice(0, 6) : [...nineFaces];
    const answers = allFamilies(cards), total = level === 0 ? 1 : level === 1 || level === 4 ? 3 : answers.length;
    return { ...base(level, seed, level === 0 ? '先选三张牌，分别检查花色和数字。' : '选三张组成一族，按规则收进图鉴。'), cards: shuffle(cards, seed + 7), selected: [], found: [], types: [], used: [], total, answers: answers.map(code), progress: { current: 0, total, label: level === 1 ? '不同类型' : '找到的族' } };
  },
  view(s, h) {
    const selected = s.selected.map(id => info(id));
    const colors = new Set(selected.map(a => a.suit)).size, nums = new Set(selected.map(a => a.rank)).size;
    const check = s.selected.length === 3 ? '<div class="choice-row"><span class="soft-panel">花色：' + (colors === 1 ? '全相同 ✓' : colors === 3 ? '全不同 ✓' : '两同一异，再看看') + '</span><span class="soft-panel">数字：' + (nums === 1 ? '全相同 ✓' : nums === 3 ? '全不同 ✓' : '两同一异，再看看') + '</span></div>' : '<p class="small-text">选满三张后，可以逐项观察两种属性。</p>';
    const task = s.level === 0 ? '找到第一组成立的三张牌' : s.level === 1 ? '同花色、同数字、两项都不同，三种类型各找一组' : s.level === 4 ? '把九张牌分成三族，每张只能使用一次' : '收齐牌桌上的' + s.total + '种不同组合';
    return '<div class="soft-panel"><h3>' + task + '</h3><p>同一项必须全相同，或者全不同；两项都要通过。</p></div><div class="tile-pool">' + s.cards.map(id => h.tile(id, { action: 'pick', value: id, selected: s.selected.includes(id), disabled: s.used.includes(id), tag: s.used.includes(id) ? '已分组' : '' })).join('') + '</div>' + check +
      '<div class="action-row">' + h.button('检查这一族', 'check', '', { primary: true }) + h.button('取消选择', 'clear') + '</div><h3 class="subheading">我的发现图鉴 · ' + s.found.length + '组</h3><div class="collection-grid">' + s.found.map(key => '<div class="collection-card"><div class="tile-pool">' + key.split('|').map(id => h.tile(id, { small: true, disabled: true })).join('') + '</div><p class="small-text">' + TYPE_LABEL[familyType(key.split('|'))] + '</p></div>').join('') + '</div>';
  },
  act(s, a) {
    if (a.type === 'pick' && s.cards.includes(a.value) && !s.used.includes(a.value)) {
      if (s.selected.includes(a.value)) s.selected = s.selected.filter(x => x !== a.value);
      else if (s.selected.length < 3) s.selected.push(a.value);
      else return feedback(s, '已经有三张了，先取消一张再换牌。');
      return feedback(s, '已选' + s.selected.length + '张。先看花色，再看数字。');
    }
    if (a.type === 'clear') { s.selected = []; return feedback(s, '选择已清空，图鉴继续保留。'); }
    if (a.type === 'check') {
      if (s.selected.length !== 3) return feedback(s, '一族需要三张不同的牌。');
      const type = familyType(s.selected);
      if (!type) {
        const colors = new Set(s.selected.map(id => info(id).suit)).size;
        return feedback(s, colors === 2 ? '花色是两张一样、一张不同。花色这一项需要全相同或全不同。' : '数字是两张一样、一张不同。数字这一项也需要全相同或全不同。', 'error');
      }
      const key = code(s.selected);
      if (s.found.includes(key)) return feedback(s, '这一族已经在图鉴里了。调换三张的位置，不会成为新的一族。');
      s.found.push(key); if (!s.types.includes(type)) s.types.push(type);
      if (s.level === 4) s.used.push(...s.selected);
      s.selected = [];
      s.progress.current = Math.min(s.total, s.level === 1 ? s.types.length : s.found.length);
      s.complete = (s.level === 1 ? s.types.length : s.found.length) >= s.total;
      return feedback(s, '这一族成立：' + TYPE_LABEL[type] + '。' + (s.complete ? '本关的目标已经完成。' : s.level === 4 ? '这些牌已经用过，继续分剩下的牌。' : '牌已回到桌上，可以继续研究。'), 'success');
    }
    return s;
  },
  hints(s) { const missing = ['suit', 'rank', 'both'].filter(x => !s.types.includes(x)); return ['先找同花色的一、二、三，或者同数字的三种花色。', '三种花色各取一张时，数字可以全相同，也可以全不同。', missing.length ? '还可以研究“' + TYPE_LABEL[missing[0]] + '”这一类。' : '把答案按类型整理：同花色3组、同数字3组、两项都不同6组。']; },
  explain(s) { return s.level === 4 ? '分组时同一张牌只能用一次；图鉴收集时牌可以反复使用。这是两种不同任务。' : '完整九张牌共有十二族：同花色3族，同数字3族，花色与数字都不同6族。三类没有重复，合起来3＋3＋6＝12。'; }
};

export const sampleGrid = ['dots_01', 'bamboo_02', 'characters_03', 'bamboo_03', 'characters_01', 'dots_02', 'characters_02', 'dots_03', 'bamboo_01'];
export function gridIssues(board) {
  const issues = [];
  const nonempty = board.filter(Boolean);
  if (nonempty.some(id => !nineFaces.includes(id))) issues.push('出现了本关之外的牌');
  if (new Set(nonempty).size !== nonempty.length) issues.push('有一张牌被重复使用');
  const lines = [];
  for (let r = 0; r < 3; r++) lines.push({ ids: board.slice(r * 3, r * 3 + 3).filter(Boolean), title: '第' + (r + 1) + '行' });
  for (let c = 0; c < 3; c++) lines.push({ ids: [board[c], board[c + 3], board[c + 6]].filter(Boolean), title: '第' + (c + 1) + '列' });
  for (const line of lines) {
    if (new Set(line.ids.map(id => info(id).rank)).size !== line.ids.length) issues.push(line.title + '有重复数字');
    if (new Set(line.ids.map(id => info(id).suit)).size !== line.ids.length) issues.push(line.title + '有重复花色');
  }
  return issues;
}
export function gridCandidates(board, index) {
  if (board[index]) return [];
  const r = Math.floor(index / 3), c = index % 3;
  return nineFaces.filter(id => !board.includes(id) && board.every((other, j) => !other || !(Math.floor(j / 3) === r || j % 3 === c) || (info(id).rank !== info(other).rank && info(id).suit !== info(other).suit)));
}
export function solveGrid(givens = Array(9).fill(null), limit = Infinity) {
  const board = Array.isArray(givens) ? [...givens] : Array.from({ length: 9 }, (_, i) => givens[i] || null);
  if (board.length !== 9 || gridIssues(board).length) return [];
  const results = [];
  function visit() {
    if (results.length >= limit) return;
    let index = -1, candidates = null;
    for (let i = 0; i < 9; i++) if (!board[i]) {
      const options = gridCandidates(board, i);
      if (!options.length) return;
      if (!candidates || options.length < candidates.length) { index = i; candidates = options; }
    }
    if (index === -1) { results.push([...board]); return; }
    for (const id of candidates) { board[index] = id; visit(); board[index] = null; if (results.length >= limit) return; }
  }
  visit(); return results;
}
let gridLibrary;
const allGrids = () => gridLibrary || (gridLibrary = solveGrid());
const g09 = {
  id: 'G09', title: '双条件九宫格', kicker: '把两条线索放在一起', category: 'logic', grade: '小学中高段至初中',
  description: '每行每列，数字不重复，花色也不重复。用线索一步步补全。', tags: ['约束推理', '多解与唯一解'],
  intro: '先点牌池中的一张牌，再点空格。也可以点已摆的牌，再点另一个格子来移动或交换。带锁的牌是题目线索。每行每列都要同时有一、二、三和筒、条、萬。',
  levels: [{ label: '一起补阵', goal: '根据已摆好的线索，补齐每行每列的数字和花色。' }, { label: '四条线索', goal: '只用四张给定牌，找到唯一的完整摆法。' }, { label: '两种答案', goal: '这盘有两种答案，找到其中任意一种合法摆法。' }, { label: '自由摆阵', goal: '从空棋盘开始，让每行每列的数字和花色都不重复。' }, { label: '新阵挑战', goal: '根据新线索摆阵，先排除冲突，再一步步确定位置。' }],
  create(level = 0, seed = 1) {
    let solution = [...sampleGrid], fixed = level === 0 ? [0, 1, 2, 3, 4, 8] : level === 1 ? [0, 1, 2, 3] : level === 2 ? [0, 1, 2] : [];
    if (level === 4) {
      const all = allGrids(); solution = [...all[Number(seed) % all.length]]; fixed = Array.from({ length: 9 }, (_, i) => i);
      for (const index of shuffle(fixed, seed)) { const next = fixed.filter(i => i !== index), b = solution.map((id, i) => next.includes(i) ? id : null); if (solveGrid(b, 2).length === 1) fixed = next; }
    }
    const board = solution.map((id, i) => fixed.includes(i) ? id : null), solutionCount = solveGrid(board).length;
    return { ...base(level, seed, '先从缺一张的行或列开始。数字和花色都要看。'), board, givens: [...board], fixed, selection: null, solutionCount, progress: { current: board.filter(Boolean).length, total: 9, label: '已摆位置' } };
  },
  view(s, h) {
    const cells = s.board.map((id, i) => {
      const locked = s.fixed.includes(i), selected = s.selection && s.selection.from === i;
      return '<div class="slot' + (id ? ' filled' : ' empty') + '"><span class="slot-label">' + (Math.floor(i / 3) + 1) + '行' + (i % 3 + 1) + '列' + (locked ? ' · 锁定' : '') + '</span>' + (id ? h.tile(id, { action: 'cell', value: String(i), disabled: locked, selected, tag: locked ? '线索' : '' }) : h.button('放在这里', 'cell', String(i))) + '</div>';
    }).join('');
    return '<div class="soft-panel"><h3>每行每列：一二三各一次，筒条萬各一次</h3><p>' + (s.solutionCount === 1 ? '这些线索能确定唯一的完整摆法。' : s.level === 2 ? '这些线索有两种补全。找出任意一种就成立。' : '自由摆阵，所有满足条件的摆法都成立。') + '</p></div>' +
      '<div class="board-grid" style="--cols:3">' + cells + '</div><h3 class="subheading">待摆的牌</h3><div class="tile-pool">' + nineFaces.filter(id => !s.board.includes(id)).map(id => h.tile(id, { action: 'pick', value: id, selected: s.selection && s.selection.face === id })).join('') + '</div><div class="action-row">' + h.button('检查摆阵', 'check', '', { primary: true }) + h.button('把选中的牌归还', 'return') + '</div>';
  },
  act(s, a) {
    if (a.type === 'pick' && nineFaces.includes(a.value) && !s.board.includes(a.value)) { s.selection = { face: a.value, from: null }; return feedback(s, '已选' + name(a.value) + '，再点一个位置。'); }
    if (a.type === 'cell') {
      const i = Number(a.value); if (!Number.isInteger(i) || i < 0 || i > 8) return s;
      if (s.fixed.includes(i)) return feedback(s, '这张是题目给定的线索，位置已经锁定。');
      if (!s.selection) { if (s.board[i]) { s.selection = { face: s.board[i], from: i }; return feedback(s, '再点一个格子，可以移动或交换。'); } return feedback(s, '请先选一张牌，再选这个格子。'); }
      if (s.selection.from === i) { s.selection = null; return feedback(s, '已取消选择。'); }
      const previous = s.board[i];
      s.board[i] = s.selection.face;
      if (s.selection.from !== null) s.board[s.selection.from] = previous;
      s.selection = null; s.complete = false; s.progress.current = s.board.filter(Boolean).length;
      return feedback(s, '可以继续试摆；不确定时，检查这一行和这一列。');
    }
    if (a.type === 'return') { if (s.selection && s.selection.from !== null && !s.fixed.includes(s.selection.from)) s.board[s.selection.from] = null; s.selection = null; s.complete = false; s.progress.current = s.board.filter(Boolean).length; return feedback(s, '选择已归还，可以换一种安排。'); }
    if (a.type === 'check') {
      const issues = gridIssues(s.board);
      if (issues.length) return feedback(s, issues[0] + '。点可移动的牌，再点别的位置尝试交换。', 'error');
      if (s.board.some(id => !id)) return feedback(s, '当前已摆的牌没有行列冲突。还有' + s.board.filter(id => !id).length + '个空位。');
      if (s.givens.some((id, i) => id && s.board[i] !== id)) return feedback(s, '题目的固定线索不能改变。', 'error');
      s.complete = true; return feedback(s, '九宫格成立！每行每列的数字与花色都各出现一次。', 'success');
    }
    return s;
  },
  hints(s) {
    const empty = s.board.findIndex(id => !id);
    if (empty < 0) return ['逐行检查数字，再逐列检查花色。', '先找出现了两次的数字或花色。', '完整摆阵同时满足每一行、每一列两种条件。'];
    const options = gridCandidates(s.board, empty);
    const position = (Math.floor(empty / 3) + 1) + '行' + (empty % 3 + 1) + '列';
    return ['先看某行缺哪个数字，再看同一格所在列缺哪种花色。', '试着检查' + position + '，同时排除已经用过的牌。', options.length ? position + '当前候选是：' + options.map(name).join('、') + '。局部合适后，还要让整盘成立。' : position + '已经没有合法候选，先撤回最近一次试放。'];
  },
  explain(s) { return '同一格既属于一行，也属于一列；数字和花色两种条件要同时满足。当前初始线索共有' + s.solutionCount + '个完整解，所以' + (s.solutionCount === 1 ? '这是唯一解题。' : '满足规则的不同摆法都应该被接受。'); }
};

export const adjacent = (a, b) => a !== b && (info(a).suit === info(b).suit || info(a).rank === info(b).rank);
export function canonicalRoute(route, { ring = false, directed = false } = {}) {
  if (!route.length) return '';
  if (directed) return route.join('|');
  if (!ring) return [route.join('|'), [...route].reverse().join('|')].sort()[0];
  const variants = [];
  for (const xs of [route, [...route].reverse()]) for (let i = 0; i < xs.length; i++) variants.push(xs.slice(i).concat(xs.slice(0, i)).join('|'));
  return variants.sort()[0];
}
export function routeValid(cards, route, cfg = {}) {
  if (route.length !== cards.length || new Set(route).size !== cards.length || route.some(id => !cards.includes(id))) return false;
  if (cfg.start && route[0] !== cfg.start || cfg.end && route.at(-1) !== cfg.end) return false;
  if (route.some((id, i) => i > 0 && !adjacent(route[i - 1], id))) return false;
  return !cfg.ring || adjacent(route[0], route.at(-1));
}
export function routeSolutions(cards, cfg = {}, limit = Infinity) {
  const answers = [], keys = new Set();
  function visit(route, left) {
    if (answers.length >= limit) return;
    if (!left.length) {
      if (!routeValid(cards, route, cfg)) return;
      const key = canonicalRoute(route, { ring: cfg.ring, directed: !!(cfg.start || cfg.end) });
      if (!keys.has(key)) { keys.add(key); answers.push([...route]); } return;
    }
    for (const id of left) {
      if (!route.length && cfg.start && id !== cfg.start) continue;
      if (left.length > 1 && cfg.end === id) continue;
      if (route.length && !adjacent(route.at(-1), id)) continue;
      visit([...route, id], left.filter(x => x !== id));
      if (answers.length >= limit) return;
    }
  }
  visit([], cards); return answers;
}
function connectionGraph(cards) {
  const points = cards.map((id, i) => ({ id, x: 270 + 118 * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / cards.length), y: 145 + 110 * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / cards.length) }));
  const lines = points.flatMap((a, i) => points.slice(i + 1).filter(b => adjacent(a.id, b.id)).map(b => '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#b9c9be" stroke-width="2"/>')).join('');
  return '<svg viewBox="0 0 540 290" style="width:100%;max-height:250px" role="img" aria-label="牌与牌之间可以连接的关系图">' + lines + points.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="23" fill="#f8f5e9" stroke="#2b6854"/><text x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle" fill="#244f40" font-size="14">' + name(p.id) + '</text>').join('') + '</svg>';
}
const six = ['dots_01', 'dots_02', 'dots_03', 'bamboo_01', 'bamboo_02', 'bamboo_03'];
const g10 = {
  id: 'G10', title: '图案路线', kicker: '每张牌都经过一次', category: 'logic', grade: '小学高段至初中',
  description: '同花色或同数字就能相接，把全部牌连成一条线或一个环。', tags: ['图论', '路径与环'],
  intro: '依次点选牌，把它接在路线末尾。相邻两张要同花色或同数字，每张只能用一次。线形关只检查途中连接；环形关最后一张还必须连回第一张。',
  levels: [{ label: '接成一条线', goal: '把六张牌连成线，每张只经过一次。' }, { label: '首尾相接', goal: '把六张牌连成环，最后一张还能接回起点。' }, { label: '指定端点', goal: '从一筒出发，到三条结束，途中走遍全部牌。' }, { label: '九牌环游', goal: '把九张牌接成闭环，每一步同花色或同数字。' }, { label: '环形图鉴', goal: '找齐六张牌的三种不同环，换起点和反向只算一次。' }],
  create(level = 0, seed = 1) {
    const cards = level === 3 ? nineFaces : [...six], ring = [1, 3, 4].includes(level);
    const cfg = level === 2 ? { start: 'dots_01', end: 'bamboo_03', ring: false } : { start: null, end: null, ring };
    const total = level === 4 ? routeSolutions(cards, cfg).length : 1;
    return { ...base(level, seed, ring ? '接满全部牌之后，还要检查首尾能否相接。' : '先选起点，再选同花色或同数字的下一张。'), ...cfg, cards: shuffle(cards, seed), route: [], found: [], total, showGraph: false, progress: { current: 0, total: cards.length, label: '路线中的牌' } };
  },
  view(s, h) {
    const route = s.route.map((id, i) => (i ? '<span class="small-text" aria-hidden="true">→</span>' : '') + h.tile(id, { action: 'remove', value: String(i), small: true, selected: i === s.route.length - 1 })).join('');
    return '<div class="soft-panel"><h3>' + (s.ring ? '环形路线：最后要回到起点' : '线形路线：从头走到尾') + '</h3><p>' + (s.start ? '起点是' + name(s.start) + '，终点是' + name(s.end) + '。' : '相邻两张，同花色或者同数字。每张牌只经过一次。') + '</p></div><div class="soft-panel"><div class="tile-pool">' + (route || '<p class="small-text">这里是你的路线，先从下面选一张牌。</p>') + (s.ring && s.route.length ? '<span class="small-text">↩ 回起点</span>' : '') + '</div></div>' +
      '<h3 class="subheading">还没有经过的牌</h3><div class="tile-pool">' + s.cards.filter(id => !s.route.includes(id)).map(id => h.tile(id, { action: 'pick', value: id })).join('') + '</div><div class="action-row">' + h.button('检查完整路线', 'check', '', { primary: true }) + h.button('撤回末张', 'back') + h.button('清空路线', 'clear') + h.button(s.showGraph ? '收起连接图' : '看看连接图', 'graph') + '</div>' +
      (s.showGraph ? '<div class="soft-panel"><h3>连线表示两张牌可以相邻</h3>' + connectionGraph(s.cards) + '</div>' : '') +
      (s.level === 4 ? '<div class="soft-panel"><h3>环形图鉴：' + s.found.length + ' / ' + s.total + '</h3><p class="small-text">换起点或反向走，仍是同一条环。</p>' + s.found.map((key, i) => '<p class="small-text">' + (i + 1) + '：' + key.split('|').map(name).join(' → ') + '</p>').join('') + '</div>' : '');
  },
  act(s, a) {
    if (a.type === 'graph') { s.showGraph = !s.showGraph; return s; }
    if (a.type === 'pick' && s.cards.includes(a.value)) {
      if (s.route.includes(a.value)) return feedback(s, '这张牌已经经过了，不能再用一次。', 'error');
      if (!s.route.length && s.start && a.value !== s.start) return feedback(s, '本关要从' + name(s.start) + '出发。', 'error');
      if (s.route.length && !adjacent(s.route.at(-1), a.value)) return feedback(s, name(s.route.at(-1)) + '和' + name(a.value) + '既不同花色，也不同数字，不能相接。', 'error');
      if (s.end === a.value && s.route.length < s.cards.length - 1) return feedback(s, '这是指定终点，先给其余的牌留好路线。');
      s.route.push(a.value); s.complete = false; s.progress.current = s.route.length;
      return feedback(s, s.route.length === s.cards.length ? '全部牌都已接入，检查一下完整条件。' : '这一步连接成立，继续接下一张。');
    }
    if (a.type === 'back' || a.type === 'remove') {
      if (a.type === 'remove' && Number(a.value) !== s.route.length - 1) return feedback(s, '先从路线末尾撤回，保留前面的顺序。');
      s.route.pop(); s.complete = false; s.progress.current = s.route.length; return feedback(s, '已撤回末张，试试另一条路。');
    }
    if (a.type === 'clear') { s.route = []; s.complete = false; s.progress.current = 0; return feedback(s, '路线已清空，图鉴继续保留。'); }
    if (a.type === 'check') {
      if (s.route.length !== s.cards.length) return feedback(s, '还剩' + (s.cards.length - s.route.length) + '张牌没有接入。');
      if (!routeValid(s.cards, s.route, s)) return feedback(s, s.ring ? '途中可以相接，但首尾还不能相接。撤回几步，给首尾留下同花色或同数字。' : '检查指定起点、终点和相邻关系。', 'error');
      const key = canonicalRoute(s.route, { ring: s.ring, directed: !!(s.start || s.end) });
      if (s.found.includes(key)) return feedback(s, '这条路线已收录；换起点或反向不算新环。');
      s.found.push(key); s.complete = s.found.length >= s.total;
      if (s.level === 4 && !s.complete) { s.route = []; s.progress.current = 0; }
      return feedback(s, s.complete ? '完整路线成立！每张恰好经过一次，所有相邻关系都满足。' : '新环已收录，继续研究下一种。', 'success');
    }
    return s;
  },
  hints(s) { const left = s.cards.filter(id => !s.route.includes(id)); const next = s.route.length ? left.filter(id => adjacent(s.route.at(-1), id)) : left; return ['先为连接选择少的牌留位置。', s.ring ? '环的首尾也要同花色或同数字，不能只看中间。' : '先看每张牌有哪些伙伴，再决定起点和终点。', next.length ? '当前末尾能接：' + next.map(name).join('、') + '。也要想接完以后怎样继续。' : '现在走进了死路，撤回末张再试。']; },
  explain(s) { return '可以相邻是一种“关系”：同花色或同数字就连一条线。走遍所有牌叫完整路径；还可以回到起点，就形成环。' + (s.level === 4 ? '同一条环换起点或反向，图鉴只记一次。' : '每一步能接上，不一定代表剩下的牌也能接完。'); }
};

export const gamesB = [g06, g07, g08, g09, g10];
