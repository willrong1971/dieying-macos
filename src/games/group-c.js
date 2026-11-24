// Probability, invariants, algebra, symmetry and strategy.  Pure state models;
// the shared application owns events, persistence, undo and 3D rendering.
const dot = n => `dots_${String(n).padStart(2, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value));
const feedback = (s, text, kind = 'info') => { s.feedback = {text, kind}; return s; };
const initial = (level, seed) => ({level, seed: Number(seed) >>> 0, complete: false, feedback: {text: '先观察桌面的材料，再动手试一试。', kind: 'info'}});
const levels = labels => labels.map(label => ({label}));
const sum = values => values.reduce((a, b) => a + b, 0);
const mod = (a, n) => ((a % n) + n) % n;
function nextRandom(s) {
  s.rng = ((s.rng ?? s.seed) + 0x6D2B79F5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function shuffled(values, seed) {
  const s = {seed, rng: seed >>> 0}; const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const actionRow = html => `<div class="action-row">${html}</div>`;
const choice = (h, text, type, value, selected) => `<button class="choice-btn${selected ? ' selected' : ''}" data-action="${type}" data-value="${h.escape(value)}" aria-pressed="${!!selected}">${h.escape(text)}</button>`;
const rules = text => `<p class="small-text">${text}</p>`;

// G11 — reachability under a move that toggles exactly two distinct positions.
export function flipReachable(from, to) {
  return from.length === to.length && from.filter((v, i) => !!v !== !!to[i]).length % 2 === 0;
}
export function flipMinimum(from, to) {
  if (!flipReachable(from, to)) return null;
  return from.filter((v, i) => !!v !== !!to[i]).length / 2;
}
function flipProgress(s) {
  if (s.mode === 'judge') {
    s.progress = {current: s.complete ? 1 : 0, total: 1, label: '判断与理由'};
    return;
  }
  s.progress = {current: s.bits.filter((v, i) => v === s.target[i]).length, total: s.bits.length, label: '与目标相同的位置'};
}
const G11 = {
  id: 'G11', title: '翻牌机关', kicker: '翻一翻，找不变的秘密', description: '每次翻两张，有些目标为什么永远到不了？',
  grade: '小学中高段 · 初中', category: 'explore', tags: ['奇偶', '不变量'],
  intro: '每一步先选两张位置不同的牌，再同时翻面。再次点击待选牌会取消，不计步。目标关要完成指定正背面；判断关还要说明能或不能的理由。牌的花色和数字不参与本关判定。',
  levels: levels(['翻出两张', '两步到达', '能做到吗', '八张挑战']),
  create(level = 0, seed = 1) {
    const s = initial(level, seed); const n = level === 3 ? 8 : 6;
    let indices = level === 0 ? [0, 2] : level === 1 ? [0, 1, 2, 3] : level === 2 ? [0] : shuffled([...Array(n).keys()], seed).slice(0, 4);
    Object.assign(s, {bits: Array(n).fill(false), target: Array.from({length: n}, (_, i) => indices.includes(i)), pending: null, moves: [], judgment: '', reason: '', mode: level === 2 ? 'judge' : 'reach'});
    s.goal = s.mode === 'judge' ? '判断能否只留一张背面，并用每一步保持的奇偶规律说明理由。' : `每步翻两张，把第${s.target.flatMap((back, i) => back ? [i + 1] : []).join('、')}张变成背面，其他朝正面。`;
    feedback(s, level === 2 ? '先自由尝试，再判断：只有一张背面朝上，能做到吗？' : '上排是目标，下排是你可以翻动的牌。');
    flipProgress(s); return s;
  },
  view(s, h) {
    const row = (bits, editable) => `<div class="tile-pool">${bits.map((back, i) => h.tile(dot(i % 9 + 1), {action: editable ? 'flip' : 'none', value: i, disabled: !editable, back, selected: editable && s.pending === i, tag: `第${i + 1}张`, label: `第${i + 1}张，${back ? '背面' : '正面'}`})).join('')}</div>`;
    return `<div class="lesson-layout flip-layout" style="--flip-count:${s.bits.length};--flip-narrow-count:${Math.ceil(s.bits.length / 2)}">
      <div class="lesson-board c-stack flip-board">
        <section class="c-panel c-stack"><h3 class="subheading">要到达的目标</h3>${row(s.target, false)}</section>
        <section class="c-stack"><h3 class="subheading">你的桌面 · 已走 ${s.moves.length} 步</h3>${row(s.bits, true)}</section>
      </div>
      <div class="lesson-side c-stack">
        <p class="formula">现在有 ${s.bits.filter(Boolean).length} 张背面朝上</p>
        ${s.pending !== null ? rules(`已选第${s.pending + 1}张，再选另一张才会翻面。`) : rules('每一步恰好翻两张，可反复翻同一张，两个位置不必相邻。')}
        ${s.mode === 'judge' ? `<section class="c-panel c-stack"><h3 class="subheading">我的判断</h3><div class="choice-row">${choice(h, '可以做到', 'judge', 'yes', s.judgment === 'yes')}${choice(h, '做不到', 'judge', 'no', s.judgment === 'no')}</div><p>我的理由是：</p><div class="choice-row c-list">${choice(h, '背面张数只会增加2、减少2或不变', 'reason', 'parity', s.reason === 'parity')}${choice(h, '我试了几次没有成功', 'reason', 'tried', s.reason === 'tried')}${choice(h, '因为这副牌有六张', 'reason', 'six', s.reason === 'six')}</div></section>` : ''}
        ${actionRow(h.button(s.mode === 'judge' ? '提交判断与理由' : '检查局面', 'check', '', {primary: true}))}
      </div>
      ${s.moves.length ? `<section class="lesson-wide c-panel c-stack"><h3 class="subheading">我的步骤</h3><ol class="c-history">${s.moves.map(m => `<li>翻第${m[0] + 1}、${m[1] + 1}张</li>`).join('')}</ol></section>` : ''}
    </div>`;
  },
  act(s, a) {
    if (a.type === 'flip') {
      const i = Number(a.value); if (!Number.isInteger(i) || i < 0 || i >= s.bits.length) return s;
      if (s.pending === i) { s.pending = null; return feedback(s, '取消待选，桌面和步数都没有改变。'); }
      if (s.pending === null) { s.pending = i; return feedback(s, `选好了第${i + 1}张，再选另一张。`); }
      const j = s.pending; s.pending = null; s.bits[i] = !s.bits[i]; s.bits[j] = !s.bits[j]; s.moves.push([j, i]); s.complete = false;
      flipProgress(s);
      if (s.mode === 'reach' && s.bits.every((v, k) => v === s.target[k])) {
        s.complete = true; const best = flipMinimum(Array(s.bits.length).fill(false), s.target);
        return feedback(s, `到达了！用了${s.moves.length}步；这个目标最少需要${best}步。`, 'success');
      }
      return feedback(s, `翻了第${j + 1}、${i + 1}张。留意：背面张数还是偶数吗？`);
    }
    if (a.type === 'judge') { s.judgment = String(a.value); s.complete = false; flipProgress(s); return feedback(s, '留下你的判断，再选择能始终成立的理由。'); }
    if (a.type === 'reason') { s.reason = String(a.value); s.complete = false; flipProgress(s); return feedback(s, '理由已选好，可以提交。'); }
    if (a.type === 'check') {
      s.complete = false;
      flipProgress(s);
      if (s.mode === 'judge') {
        if (s.judgment !== 'no') return feedback(s, '从零张背面出发，先看看每一步会改变几张背面。', 'error');
        if (s.reason !== 'parity') return feedback(s, '试不出来还不是证明。需要找出每一步都保持的性质。', 'error');
        s.complete = true; s.progress = {current: 1, total: 1, label: '判断与理由'};
        return feedback(s, '有依据地说明了做不到：背面张数始终为偶数，一张是奇数。', 'success');
      }
      const diff = s.bits.filter((v, i) => v !== s.target[i]).length;
      if (diff) return feedback(s, `还有${diff}个位置与目标不同。把不同的位置两两配起来想一想。`, 'error');
      s.complete = true; return feedback(s, '每个位置都与目标相同，完成！', 'success');
    }
    return s;
  },
  hints: s => ['先数一数背面朝上的张数。', '一次操作：两张正面变背面是加2；两张背面变正面是减2；各一张则不变。', s.mode === 'judge' ? '从0开始，偶数一直是偶数，不能变成1。' : '把当前与目标不同的位置找出，两两翻转。'],
  explain: s => `每次翻两张，背面数改变+2、0或−2，因此奇偶性不变。任意初态到目标，位置差异为偶数个时可两两配对，最少需要差异数的一半步；奇数个差异不能到达。本关${s.mode === 'judge' ? '目标有一个差异，无法到达' : `目标最少需要${flipMinimum(Array(s.bits.length).fill(false), s.target)}步`}。`
};

// G12 — sample physical identities first, then project to visible number pairs.
export function entityPairs(bag) {
  const out = [];
  for (let i = 0; i < bag.length; i++) for (let j = i + 1; j < bag.length; j++) {
    const entities = [bag[i].id, bag[j].id].sort();
    const values = [bag[i].value, bag[j].value].sort((a, b) => a - b);
    out.push({id: entities.join('|'), entities, values, key: values.join('')});
  }
  return out;
}
export function exactPairCounts(bag) {
  const counts = {}; const samples = entityPairs(bag);
  for (const p of samples) counts[p.key] = (counts[p.key] || 0) + 1;
  return {counts, total: samples.length, samples};
}
export function drawEntityPair(bag, random) {
  const first = Math.min(bag.length - 1, Math.floor(random() * bag.length));
  const remaining = bag.filter((_, i) => i !== first);
  const second = Math.min(remaining.length - 1, Math.floor(random() * remaining.length));
  return [bag[first], remaining[second]];
}
function labProgress(s) {
  const total = s.goalRounds + s.samples.length + 2;
  s.progress = {current: Math.min(s.rounds, s.goalRounds) + s.collected.length + (s.prediction ? 1 : 0) + (s.reason === 'entities' ? 1 : 0), total, label: '实验、样本与解释'};
}
const G12 = {
  id: 'G12', title: '牌袋实验室', kicker: '看起来一样，机会也一样吗', description: '亲手抽牌，给相同牌加上身份，发现概率从哪里来。', grade: '小学高段 · 初中', category: 'explore', tags: ['实验', '概率'],
  intro: '每轮从实体牌中随机取两张，本轮不放回；记下结果后全部放回，下一轮牌袋保持相同。先预测，再实验，最后列齐实体样本并归类。频率会波动，不需要“凑到”理论比例。',
  levels: levels(['四张牌的秘密', '多做一些实验', '三张相同的牌', '五张牌的挑战']),
  create(level = 0, seed = 1) {
    const s = initial(level, seed); const values = level === 2 ? [1, 1, 1, 2] : level === 3 ? [1, 2, 2, 3, 3] : [1, 1, 2, 3];
    const occurrences = {}; const bag = values.map((value, i) => {const k = occurrences[value] || 0; occurrences[value] = k + 1; return {id: `entity-${i}`, value, label: `${value}${'甲乙丙丁'[k]}`};});
    const exact = exactPairCounts(bag);
    Object.assign(s, {bag, samples: exact.samples, exact: exact.counts, rounds: 0, goalRounds: level === 0 ? 10 : level === 1 ? 30 : 20, counts: Object.fromEntries(Object.keys(exact.counts).map(k => [k, 0])), history: [], last: [], chosen: [], group: '', collected: [], prediction: '', reason: '', showLabels: false, rng: seed >>> 0});
    s.goal = `先预测，再完成${s.goalRounds}轮实验，列齐${s.samples.length}种实体组合，用计数解释机会大小。`;
    feedback(s, '先预测各类结果是否一样容易出现，再抽一轮看看。'); labProgress(s); return s;
  },
  view(s, h) {
    const known = new Map(s.bag.map(e => [e.id, e]));
    const pairHtml = ids => ids.map(id => {const e = known.get(id); return h.tile(dot(e.value), {disabled: true, small: true, tag: s.showLabels ? e.label : String(e.value), label: s.showLabels ? e.label : `数字${e.value}`});}).join('');
    const keys = Object.keys(s.exact).sort();
    return `<div class="lesson-layout lab-layout" style="--bag-count:${s.bag.length}">
      <div class="lesson-board c-stack">
        <section class="c-stack"><h3 class="subheading">先留下一个预测</h3><div class="choice-row">${choice(h, '每类都一样容易出现', 'predict', 'equal', s.prediction === 'equal')}${choice(h, '有些结果更容易出现', 'predict', 'different', s.prediction === 'different')}</div></section>
        <section class="c-panel c-stack"><h3 class="subheading">牌袋里的实体牌 · 每轮结束全部放回</h3>
          <div class="tile-pool lab-bag">${s.bag.map(e => h.tile(dot(e.value), {action: 'sample-pick', value: e.id, selected: s.chosen.includes(e.id), tag: s.showLabels ? e.label : String(e.value), label: `选择样本牌${e.label}`})).join('')}</div>
          ${actionRow(h.button('抽一轮', 'draw', '1', {primary: true}) + h.button('连续抽10轮', 'draw', '10') + h.button(s.showLabels ? '暂时隐藏甲乙' : '显示甲乙身份', 'labels'))}</section>
        <section class="c-stack"><h3 class="subheading">已经实验 ${s.rounds} 轮 · 本关至少 ${s.goalRounds} 轮</h3>
          <div class="collection-grid lab-frequencies">${keys.map(key => {
            const percent = s.rounds ? 100 * s.counts[key] / s.rounds : 0;
            return `<div class="collection-card"><strong>${h.escape(key.split('').join('＋'))}</strong><span class="lab-bar" style="--frequency:${percent}%" aria-hidden="true"></span><p>${s.counts[key]} 次 · ${s.rounds ? percent.toFixed(1) : '0'}%</p></div>`;
          }).join('')}</div>
          ${s.last.length ? `<div class="lab-latest"><div class="tile-pool">${pairHtml(s.last)}</div><div><h3 class="subheading">最近一轮</h3><p class="small-text">本轮结束，这两张已放回牌袋。</p></div></div>` : ''}
        </section>
      </div>
      <div class="lesson-side c-stack">
        <section class="c-panel c-stack"><h3 class="subheading">把实体样本列齐 · ${s.collected.length}/${s.samples.length}</h3><p>在牌袋里点选两张不同的牌，再选它属于哪一类。相同数字的甲、乙仍是不同实体。</p>
          <div class="choice-row lab-sample-options">${keys.map(key => choice(h, key.split('').join('与'), 'group', key, s.group === key)).join('')}</div>
          ${actionRow(h.button('收录这一个实体样本', 'sample-submit', '', {primary: true}))}
          ${s.collected.length ? `<div class="collection-grid lab-samples">${s.collected.map(id => {const sample = s.samples.find(p => p.id === id); return `<div class="collection-card"><p>${sample.entities.map(e => h.escape(known.get(e).label)).join(' ＋ ')} → ${h.escape(sample.key)}</p></div>`;}).join('')}</div>` : ''}
        </section>
        <section class="c-stack"><h3 class="subheading">为什么能说明机会大小？</h3><div class="choice-row c-list">${choice(h, '数等可能的实体组合，再归到数字结果', 'reason', 'entities', s.reason === 'entities')}${choice(h, '只看刚才哪类抽得多', 'reason', 'frequency', s.reason === 'frequency')}${choice(h, '有几类就平均分给每类', 'reason', 'classes', s.reason === 'classes')}</div>
          ${actionRow(h.button('整理实验发现', 'check', '', {primary: true}))}</section>
      </div>
    </div>`;
  },
  act(s, a) {
    if (a.type === 'predict') {s.prediction = String(a.value); s.complete = false; labProgress(s); return feedback(s, '预测已记录。即使后来改变看法，也保留这次思考。');}
    if (a.type === 'labels') {s.showLabels = !s.showLabels; return feedback(s, '只是改变身份标签的显示，实验记录没有变化。');}
    if (a.type === 'draw') {
      s.complete = false;
      const n = Math.min(10, Math.max(1, Number(a.value) || 1));
      for (let i = 0; i < n; i++) {
        const drawn = drawEntityPair(s.bag, () => nextRandom(s));
        const key = drawn.map(e => e.value).sort((a, b) => a - b).join('');
        s.last = drawn.map(e => e.id); s.counts[key]++; s.rounds++;
        s.history.push({round: s.rounds, ids: s.last.slice(), key});
      }
      labProgress(s); return feedback(s, `已记录${s.rounds}轮。频率是这批实验的结果，可以偏离理论比例。`);
    }
    if (a.type === 'sample-pick') {
      const id = String(a.value); if (!s.bag.some(e => e.id === id)) return s;
      s.complete = false;
      if (s.chosen.includes(id)) s.chosen = s.chosen.filter(x => x !== id);
      else if (s.chosen.length < 2) s.chosen.push(id);
      else return feedback(s, '每个实体样本只取两张。先取消一张，再换另一张。', 'error');
      return feedback(s, `已选${s.chosen.length}张实体牌。`);
    }
    if (a.type === 'group') {s.group = String(a.value); s.complete = false; return s;}
    if (a.type === 'sample-submit') {
      s.complete = false;
      if (s.chosen.length !== 2) return feedback(s, '先选两张不同的实体牌。', 'error');
      const id = [...s.chosen].sort().join('|'); const sample = s.samples.find(p => p.id === id);
      if (!sample) return feedback(s, '这个样本不符合本轮不放回取两张的规则。', 'error');
      if (s.group !== sample.key) return feedback(s, `这两张的数字是${sample.values.join('和')}，应归到${sample.key}这一类。`, 'error');
      if (s.collected.includes(id)) return feedback(s, '这一个实体组合已经收录，换换伙伴寻找新的组合。');
      s.collected.push(id); s.chosen = []; s.group = ''; labProgress(s);
      return feedback(s, '收录成功。实体组合不同，即使数字结果相同，也要分别计数。', 'success');
    }
    if (a.type === 'reason') {s.reason = String(a.value); s.complete = false; labProgress(s); return s;}
    if (a.type === 'check') {
      s.complete = false;
      if (!s.prediction) return feedback(s, '先留下你的预测，再比较实验与样本。', 'error');
      if (s.rounds < s.goalRounds) return feedback(s, `还可以继续实验${s.goalRounds - s.rounds}轮。`, 'info');
      if (s.collected.length < s.samples.length) return feedback(s, `还差${s.samples.length - s.collected.length}个实体组合。可以固定第一张，按顺序换伙伴。`, 'info');
      if (s.reason !== 'entities') return feedback(s, '实验能启发猜想；概率的依据是等可能实体组合的计数，不能只看这次抽得多少。', 'error');
      s.complete = true; labProgress(s);
      const eq = new Set(Object.values(s.exact)).size === 1;
      return feedback(s, `完成！一共${s.samples.length}种等可能实体组合，归类后${eq ? '各类组合数相同，所以等可能' : '各类组合数不全相同，所以不全等可能'}。`, 'success');
    }
    return s;
  },
  hints: s => ['给每张牌保留一个实体身份，两个数字1不是同一张牌。', '固定第一张，从后面的牌中逐个选伙伴；换第一张时不再重复前面的组合。', `本关共有${s.samples.length}个等可能实体组合。${Object.entries(s.exact).map(([k, v]) => `${k}有${v}个`).join('，')}。`],
  explain: s => `先在${s.bag.length}张实体牌中不放回选两张，再忽略次序归类，共${s.samples.length}个等可能样本。${Object.entries(s.exact).map(([k, v]) => `${k}的概率为${v}/${s.samples.length}`).join('；')}。每轮全放回，所以各轮使用同一牌袋。实验频率会波动，未出现不等于不可能。`
};

// G13 — linear expression models.  Transformations are verified separately
// from the final substitution into the original equation.
export function equationValue(equation, x) {return {left: equation.la * x + equation.lb, right: equation.ra * x + equation.rb};}
export function equationSolutions(equation, min = 1, max = 9) {return Array.from({length: max - min + 1}, (_, i) => min + i).filter(x => {const p = equationValue(equation, x); return p.left === p.right;});}
export function applyEquationOperation(equation, type, value) {
  const e = {...equation}; const k = Number(value);
  if (type === 'remove-x') {
    if (e.la < 1 || e.ra < 1) return {ok: false, message: '只有两边都有白板，才能同时各拿走一张。'};
    e.la--; e.ra--; return {ok: true, equation: e, message: '两边同时拿走一张白板。'};
  }
  if (!Number.isInteger(k) || k < 1 || k > 9) return {ok: false, message: '操作数使用一至九的整数。'};
  if (type === 'subtract') {
    if (e.lb < k || e.rb < k) return {ok: false, message: '本关先不引入负数，两边的已知数量都要足够拿走。'};
    e.lb -= k; e.rb -= k; return {ok: true, equation: e, message: `两边同时减去${k}。`};
  }
  if (type === 'divide') {
    if (k === 1) return {ok: false, message: '分成一份不会改变等式，试试两份或三份。'};
    if ([e.la, e.lb, e.ra, e.rb].some(n => n % k !== 0)) return {ok: false, message: `两边的每一部分都要能平均分成${k}份；本关暂不使用分数。`};
    for (const key of ['la', 'lb', 'ra', 'rb']) e[key] /= k;
    return {ok: true, equation: e, message: `两边同时平均分成${k}份，每边取一份。`};
  }
  return {ok: false, message: '这个操作没有同时、同样地改变两边，不能作为等价变形。'};
}
function expressionText(a, b) {return [a ? (a === 1 ? '白板' : `${a}×白板`) : '', b ? String(b) : ''].filter(Boolean).join('＋') || '0';}
function eqText(e) {return `${expressionText(e.la, e.lb)}＝${expressionText(e.ra, e.rb)}`;}
function sideTiles(a, b, h, split) {
  const parts = Array.from({length: a}, (_, i) => h.tile('dragon_white', {disabled: true, tag: '同一个数', label: `第${i + 1}张未知数白板`}));
  const numbers = [];
  if (split && b > split) {numbers.push(split); b -= split;}
  while (b > 0) {numbers.push(Math.min(9, b)); b -= Math.min(9, b);}
  parts.push(...numbers.map(n => h.tile(dot(n), {disabled: true, label: `数值${n}`})));
  return parts.length ? `<div class="tile-pool equation-terms" style="--term-count:${parts.length}">${parts.join('<span class="formula" aria-hidden="true">＋</span>')}</div>` : '<p class="formula">0</p>';
}
const G13 = {
  id: 'G13', title: '白板天平', kicker: '同一个符号，藏着同一个数', description: '同时改变等式两边，找出白板里的秘密。', grade: '小学高段 · 初中', category: 'explore', tags: ['未知数', '等式'],
  intro: '白板表示一至九中的同一个未知数。可以先猜，也可以把等式两边同时减去相同数量、拿走相同白板、或平均分份。最后必须代回原式验证；猜中与完成等价推理分别记录。',
  levels: levels(['一张白板', '两张白板', '平均分三份', '两边都有白板']),
  create(level = 0, seed = 1) {
    const e = level === 0 ? {la: 1, lb: 2, ra: 0, rb: 5} : level === 1 ? {la: 2, lb: 2, ra: 0, rb: 8} : level === 2 ? {la: 3, lb: 0, ra: 0, rb: 9} : {la: 2, lb: 1, ra: 1, rb: 3 + mod(seed, 5)};
    const s = initial(level, seed); Object.assign(s, {original: e, equation: {...e}, value: null, operationValue: level === 2 ? 3 : 2, splitRight: false, steps: [], verifiedBy: ''});
    s.goal = `在一至九中求出「${eqText(e)}」的白板数值，并代回原式。`;
    s.progress = {current: 0, total: 1, label: '代回原式验证'};
    return feedback(s, '同一关的每张白板都表示同一个数。先观察两边有什么相同。');
  },
  view(s, h) {
    const e = s.equation; const evaluated = s.value === null ? null : equationValue(s.original, s.value);
    return `<div class="lesson-layout equation-layout">
      <div class="lesson-board c-stack">
        <p class="small-text">原式：${h.escape(eqText(s.original))}</p>
        <div class="equation-scale">
          <section class="c-panel c-stack"><h3 class="subheading">左边</h3>${sideTiles(e.la, e.lb, h, 0)}</section>
          <span class="equation-equals" aria-hidden="true">＝</span>
          <section class="c-panel c-stack"><h3 class="subheading">右边</h3>${sideTiles(e.ra, e.rb, h, s.splitRight ? s.operationValue : 0)}</section>
        </div>
        <p class="formula">${h.escape(eqText(e))}</p>
        <section class="c-panel c-stack"><h3 class="subheading">我的猜想：白板＝${s.value === null ? '？' : s.value}</h3>
          <div class="tile-pool equation-guesses">${Array.from({length: 9}, (_, i) => h.tile(dot(i + 1), {action: 'assign', value: i + 1, selected: s.value === i + 1, small: true, label: `把所有白板设为${i + 1}`})).join('')}</div>
          ${evaluated ? `<p class="small-text">代回原式：左边 ${evaluated.left}，右边 ${evaluated.right}</p>` : rules('尚未赋值时，只展示等式关系，不把未知白板当作实测重量。')}
          ${actionRow(h.button('代回原式检查', 'check', '', {primary: true}))}
        </section>
      </div>
      <div class="lesson-side c-stack">
        <section class="c-panel c-stack"><h3 class="subheading">对两边做同样的操作</h3>
          <label class="equation-input">操作数 <input class="number-input" type="number" min="1" max="9" value="${s.operationValue}" data-action="op-number" aria-label="两边操作使用的数"></label>
          ${actionRow(h.button('两边都减这个数', 'subtract') + h.button('两边平均分这些份', 'divide') + h.button('两边各拿走一张白板', 'remove-x') + h.button('展开右边的数字', 'split') + h.button('为什么不能只减左边？', 'one-side'))}
        </section>
        <section class="c-panel c-stack"><h3 class="subheading">我的等价变形 · ${s.steps.length}步</h3>${s.steps.length ? `<ol class="c-history equation-steps">${s.steps.map(step => `<li>${h.escape(step.message)} <strong>${h.escape(step.equation)}</strong></li>`).join('')}</ol>` : '<p>可以先整理等式，也可以先提出一个猜想。</p>'}</section>
      </div>
    </div>`;
  },
  act(s, a) {
    if (a.type === 'op-number') {
      const n = Number(a.value); if (Number.isInteger(n) && n >= 1 && n <= 9) s.operationValue = n;
      return s;
    }
    if (a.type === 'split') {s.splitRight = !s.splitRight; return feedback(s, '拆分只改变数量的表示，两边的总量都保持不变。');}
    if (a.type === 'one-side') {s.complete = false; s.progress.current = 0; return feedback(s, `只减左边会改变两边的关系。例如左边减${s.operationValue}，右边也必须减${s.operationValue}。这次没有修改等式。`, 'error');}
    if (['subtract', 'divide', 'remove-x'].includes(a.type)) {
      s.complete = false;
      s.progress.current = 0;
      const result = applyEquationOperation(s.equation, a.type, s.operationValue);
      if (!result.ok) return feedback(s, result.message, 'error');
      s.equation = result.equation; s.splitRight = false; s.steps.push({type: a.type, amount: s.operationValue, message: result.message, equation: eqText(s.equation)});
      return feedback(s, result.message + ' 等式的解保持不变。', 'success');
    }
    if (a.type === 'assign') {
      const n = Number(a.value); if (!Number.isInteger(n) || n < 1 || n > 9) return s;
      s.value = n; s.complete = false; s.progress.current = 0; const p = equationValue(s.original, n);
      return feedback(s, p.left === p.right ? `两边都是${p.left}，可以代回原式正式验证。` : `左边是${p.left}，右边是${p.right}，左边${p.left > p.right ? '多' : '少'}${Math.abs(p.left - p.right)}。`);
    }
    if (a.type === 'check') {
      s.complete = false;
      s.progress.current = 0;
      if (s.value === null) return feedback(s, '先给所有白板同一个数值。', 'error');
      const p = equationValue(s.original, s.value);
      if (p.left !== p.right) return feedback(s, `代回原式还不相等：${p.left}和${p.right}相差${Math.abs(p.left - p.right)}。`, 'error');
      s.complete = true; s.verifiedBy = s.steps.length ? '等价变形后验证' : '试填后验证'; s.progress.current = 1;
      return feedback(s, `验证成立，白板是${s.value}！本次记录为“${s.verifiedBy}”。${s.steps.length ? `你还做了${s.steps.length}次合法变形。` : '也可以继续研究怎样一步步推出来。'}`, 'success');
    }
    return s;
  },
  hints: s => ['先找两边都能拿走的已知数量，或者两边都有的白板。', '相同的白板可以均分：两张白板合起来等于六，每张就是三。', `本关原式在一至九中只有一个解：${equationSolutions(s.original)[0]}。把它同时代入所有白板检查。`],
  explain: s => `原式${eqText(s.original)}的解是${equationSolutions(s.original)[0]}。两边同时减去相同量、同时拿走相同未知数，或除以同一个非零数，保持等式的解不变。数值拆分只是另一种表示。最后始终代回原式验证，不能只看变形后的盘面。`
};

// G14A — positional symmetry, not a mirrored drawing of an individual glyph.
export function mirrorIndex(index, axis, n = 3) {
  const row = Math.floor(index / n), col = index % n;
  return axis === 'horizontal' ? (n - 1 - row) * n + col : row * n + n - 1 - col;
}
export function symmetryValid(board, axes = ['vertical'], requireFull = true) {
  if (board.length !== 9 || (requireFull && board.some(v => !v))) return false;
  const face = v => v && (typeof v === 'string' ? v : v.face);
  return axes.every(axis => board.every((v, i) => face(v) === face(board[mirrorIndex(i, axis)])));
}
function symmetryProgress(s) {s.progress = {current: s.board.filter(Boolean).length - s.locked.length, total: 9 - s.locked.length, label: '补好的位置'};}
const G14A = {
  id: 'G14A', title: '对称工坊', kicker: '找一找，它的另一个位置', description: '沿着对称轴，给每张牌找到相同的伙伴。', grade: '小学低中段起', category: 'explore', tags: ['轴对称', '位置'],
  intro: '根据给出的对称轴补全九宫格。先点一张候选牌，再点空格放下；点已填的可动牌可以收回。线索牌不动，花色和数字都相同才是相同牌面。改变的是格子位置，不是把牌上的字翻成镜像。',
  levels: levels(['找一个伙伴', '补齐右半边', '换一条对称轴', '两条轴一起看']),
  create(level = 0, seed = 1) {
    const s = initial(level, seed); const palette = level === 3 ? shuffled(['dots_01', 'bamboo_02', 'characters_03', 'dots_04', 'bamboo_05', 'characters_06'], seed).slice(0, 3) : ['dots_01', 'bamboo_02', 'characters_03'];
    const solution = [palette[0], palette[1], palette[0], palette[2], 'dragon_white', palette[2], palette[0], palette[1], palette[0]];
    const blanks = level === 0 ? [2] : level === 1 ? [2, 5, 8] : level === 2 ? [6, 7, 8] : [2, 5, 6, 7, 8];
    const entities = solution.map((face, i) => ({id: `sym-${i}`, face}));
    Object.assign(s, {axes: level === 2 ? ['horizontal'] : level === 3 ? ['vertical', 'horizontal'] : ['vertical'], solution, locked: [...Array(9).keys()].filter(i => !blanks.includes(i)), board: entities.map((e, i) => blanks.includes(i) ? null : e), pool: shuffled(entities.filter((_, i) => blanks.includes(i)), seed), selected: null});
    s.goal = `补齐${blanks.length}个空格，让图案${s.axes.length === 2 ? '同时关于中间横线和竖线' : s.axes[0] === 'vertical' ? '关于中间竖线' : '关于中间横线'}对称，固定线索不动。`;
    feedback(s, `本关按${s.axes.length === 2 ? '竖直和水平两条轴' : s.axes[0] === 'vertical' ? '中间竖直轴' : '中间水平轴'}对称，线索牌不能移动。`); symmetryProgress(s); return s;
  },
  view(s, h) {
    const cells = s.board.map((e, i) => `<div class="slot ${e ? 'filled' : 'empty'}" data-action="sym-cell" data-value="${i}"><span class="slot-label">${Math.floor(i / 3) + 1}行${i % 3 + 1}列${s.locked.includes(i) ? ' · 线索' : ''}</span>${e ? h.tile(e.face, {action: 'sym-cell', value: i, disabled: s.locked.includes(i), tag: s.locked.includes(i) ? '固定' : '可收回'}) : `<button class="choice-btn" data-action="sym-cell" data-value="${i}" aria-label="放在第${Math.floor(i / 3) + 1}行第${i % 3 + 1}列">放在这里</button>`}</div>`).join('');
    return `<div class="lesson-layout square-layout symmetry-layout">
      <div class="lesson-board c-stack">
        <p class="formula square-rule">${s.axes.length === 2 ? '同时关于中间竖线、横线对称' : s.axes[0] === 'vertical' ? '关于中间竖线对称' : '关于中间横线对称'}</p>
        <div class="symmetry-grid"><div class="board-grid square-grid" style="--cols:3">${cells}</div>${s.axes.includes('vertical') ? '<span aria-hidden="true" class="symmetry-axis vertical"></span>' : ''}${s.axes.includes('horizontal') ? '<span aria-hidden="true" class="symmetry-axis horizontal"></span>' : ''}</div>
      </div>
      <div class="lesson-side c-panel c-stack"><h3 class="subheading">候选牌 · 先选牌，再点位置</h3><div class="tile-pool square-stock">${s.pool.map(e => h.tile(e.face, {action: 'sym-pick', value: e.id, selected: s.selected === e.id})).join('') || '<p>候选牌已全部放好，可以检查。</p>'}</div>${actionRow(h.button('检查对称', 'check', '', {primary: true}))}</div>
    </div>`;
  },
  act(s, a) {
    if (a.type === 'sym-pick') {const id = String(a.value); if (s.pool.some(e => e.id === id)) {s.selected = s.selected === id ? null : id; s.complete = false;} return s;}
    if (a.type === 'sym-cell') {
      const i = Number(a.value); if (!Number.isInteger(i) || i < 0 || i > 8) return s;
      if (s.locked.includes(i)) return feedback(s, '这是固定线索。可以观察它在轴另一边的伙伴。');
      if (s.selected) {
        const k = s.pool.findIndex(e => e.id === s.selected); if (k < 0) {s.selected = null; return s;}
        const e = s.pool.splice(k, 1)[0]; if (s.board[i]) s.pool.push(s.board[i]); s.board[i] = e; s.selected = null;
      } else if (s.board[i]) {s.pool.push(s.board[i]); s.board[i] = null;}
      else return feedback(s, '先在候选牌里选一张，再放到这里。');
      s.complete = false; symmetryProgress(s); return feedback(s, '放好了，看看轴两边对应的牌面是否相同。');
    }
    if (a.type === 'check') {
      s.complete = false;
      if (s.board.some(e => !e)) return feedback(s, '还有空格，先给空格找到对应位置的伙伴。', 'error');
      for (const axis of s.axes) for (let i = 0; i < 9; i++) {
        const j = mirrorIndex(i, axis);
        if (s.board[i].face !== s.board[j].face) return feedback(s, `第${Math.floor(i / 3) + 1}行第${i % 3 + 1}列与它的对称位置，花色或数字不同。`, 'error');
      }
      s.complete = true; symmetryProgress(s); return feedback(s, '对应位置的牌面全部相同，对称图案完成！', 'success');
    }
    return s;
  },
  hints: s => ['先找到中间的对称轴，再看一个空格离轴多远。', '竖直对称时，第一列对应第三列，行数不变；水平对称时，第一行对应第三行，列数不变。', s.axes.length === 2 ? '角上的四格是一组，上下中格是一组，左右中格是一组。中心格映射到自己。' : '在空格的轴另一边，找同样远的固定牌，花色和数字都要一致。'],
  explain: () => '轴对称把一个格子映射到轴另一边相同距离的位置。对应格的牌面相同，轴上的格子映射到自己。这里研究格盘布局，不要求汉字或鸟纹本身具有镜像对称。'
};

// G14B — exact eight-line magic squares, accepting all legal orientations.
const MAGIC_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const LINE_NAMES = ['第一行', '第二行', '第三行', '第一列', '第二列', '第三列', '左上对角线', '右上对角线'];
function rotate(board) {return Array.from({length: 9}, (_, i) => board[(2 - i % 3) * 3 + Math.floor(i / 3)]);}
function reflect(board) {return Array.from({length: 9}, (_, i) => board[Math.floor(i / 3) * 3 + 2 - i % 3]);}
export const magicSquares = (() => {const out = []; let b = [8, 1, 6, 3, 5, 7, 4, 9, 2]; for (let i = 0; i < 4; i++) {out.push([...b], reflect(b)); b = rotate(b);} return out;})();
export function magicValid(board) {return board.length === 9 && [...board].sort((a, b) => a - b).every((v, i) => v === i + 1) && MAGIC_LINES.every(line => sum(line.map(i => board[i])) === 15);}
export function magicCompletions(givens) {return magicSquares.filter(b => b.every((v, i) => !givens[i] || givens[i] === v));}
function magicProgress(s) {s.progress = {current: s.collection.length, total: s.goalCount, label: s.goalCount > 1 ? '已收录的不同完整摆法' : '已收录的完整幻方'};}
const G14B = {
  id: 'G14B', title: '十五幻方', kicker: '八条线，一个共同的和', description: '把一至九摆进九宫格，让行、列、对角线都合起来是十五。', grade: '小学高段 · 初中', category: 'explore', tags: ['幻方', '整体推理'],
  intro: '一至九各一张，每格一张，每张恰好用一次。三行、三列、两条对角线，共八条线，都必须合计十五。固定线索不能移动。先点候选牌，再点格子；点已填的可动牌可收回。',
  levels: levels(['补上最后一格', '角与中心', '从中心出发', '收齐两种摆法']),
  create(level = 0, seed = 1) {
    const s = initial(level, seed); const base = magicSquares[mod(seed, 8)];
    const indices = level === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : level === 1 ? [0, 2, 4, 6] : level === 2 ? [4] : [1];
    const givens = base.map((v, i) => indices.includes(i) ? v : null); const allowed = magicCompletions(givens);
    Object.assign(s, {givens, board: [...givens], selected: null, collection: [], goalCount: level === 3 ? allowed.length : 1, solutionCount: allowed.length});
    s.goal = level === 3 ? `一至九各用一次，收齐${allowed.length}种合法摆法；行、列和两条对角线都合计十五。` : `一至九各用一次，补好${9 - indices.length}个空格，让行、列、两条对角线的和都为十五。`;
    feedback(s, `八条线都要检查。本关线索有${allowed.length}种按固定方向区分的完整答案${level === 3 ? '，收齐它们' : '，找到一种即可'}。`); magicProgress(s); return s;
  },
  view(s, h) {
    const pool = Array.from({length: 9}, (_, i) => i + 1).filter(n => !s.board.includes(n));
    return `<div class="lesson-layout square-layout magic-layout">
      <div class="lesson-board c-stack">
        <p class="formula square-rule">每条线的和＝15</p>
        <div class="board-grid square-grid" style="--cols:3">${s.board.map((n, i) => `<div class="slot ${n ? 'filled' : 'empty'}"><span class="slot-label">${Math.floor(i / 3) + 1}行${i % 3 + 1}列${s.givens[i] ? ' · 固定' : ''}</span>${n ? h.tile(dot(n), {action: 'magic-cell', value: i, disabled: !!s.givens[i], tag: s.givens[i] ? '线索' : ''}) : `<button class="choice-btn" data-action="magic-cell" data-value="${i}" aria-label="放在第${Math.floor(i / 3) + 1}行第${i % 3 + 1}列">放在这里</button>`}</div>`).join('')}</div>
      </div>
      <div class="lesson-side c-stack">
        <section class="c-panel c-stack"><h3 class="subheading">还没放下的牌</h3><div class="tile-pool square-stock magic-stock">${pool.map(n => h.tile(dot(n), {action: 'magic-pick', value: n, selected: s.selected === n})).join('') || '<p>九张都摆好了，检查八条线。</p>'}</div>
          ${actionRow(h.button(s.goalCount > 1 ? '检查并收录' : '检查八条线', 'check', '', {primary: true}))}</section>
        <div class="collection-grid magic-lines" aria-label="八条线的数字和">${MAGIC_LINES.map((line, i) => {const values = line.map(k => s.board[k]); const full = values.every(Boolean); return `<div class="collection-card"><strong>${LINE_NAMES[i]}</strong><p>${values.map(n => n || '？').join('＋')}${full ? `＝${sum(values)}` : ''}${full && sum(values) === 15 ? ' ✓' : ''}</p></div>`;}).join('')}</div>
        ${s.collection.length ? `<section class="c-panel c-stack"><h3 class="subheading">我的完整摆法 ${s.collection.length}/${s.goalCount}</h3><div class="collection-grid magic-records">${s.collection.map((b, i) => `<div class="collection-card"><strong>第${i + 1}种</strong><p>${b.slice(0, 3).join(' ')}<br>${b.slice(3, 6).join(' ')}<br>${b.slice(6).join(' ')}</p></div>`).join('')}</div></section>` : ''}
      </div>
    </div>`;
  },
  act(s, a) {
    if (a.type === 'magic-pick') {const n = Number(a.value); if (n >= 1 && n <= 9 && !s.board.includes(n)) {s.selected = s.selected === n ? null : n; s.complete = false;} return s;}
    if (a.type === 'magic-cell') {
      const i = Number(a.value); if (!Number.isInteger(i) || i < 0 || i > 8) return s;
      if (s.givens[i]) return feedback(s, '这是固定线索，不能移动。');
      if (s.selected) {s.board[i] = s.selected; s.selected = null;}
      else if (s.board[i]) s.board[i] = null;
      else return feedback(s, '先在候选牌里选一个数，再点空格。');
      s.complete = false;
      return feedback(s, '已经更新这个格子，看看相关行、列和对角线。');
    }
    if (a.type === 'check') {
      s.complete = false;
      if (s.board.some(n => !n)) return feedback(s, '还有空格，每张牌都要用一次。', 'error');
      if (new Set(s.board).size !== 9 || s.board.some(n => !Number.isInteger(n) || n < 1 || n > 9)) return feedback(s, '一至九都要恰好使用一次，有数字重复或缺少。', 'error');
      if (s.givens.some((n, i) => n && s.board[i] !== n)) return feedback(s, '固定线索的位置和数字必须保留。', 'error');
      for (let i = 0; i < MAGIC_LINES.length; i++) {
        const total = sum(MAGIC_LINES[i].map(k => s.board[k]));
        if (total !== 15) return feedback(s, `${LINE_NAMES[i]}的和是${total}，与十五${total > 15 ? '多' : '少'}${Math.abs(total - 15)}。`, 'error');
      }
      const key = s.board.join(',');
      if (s.collection.some(b => b.join(',') === key)) {
        s.complete = s.collection.length >= s.goalCount;
        return feedback(s, s.complete ? '这个摆法已经收录，当前八条线也全部成立。' : '这一个方向的摆法已经收录，试试另一个不同的摆法。', s.complete ? 'success' : 'info');
      }
      s.collection.push([...s.board]); magicProgress(s);
      if (s.collection.length >= s.goalCount) {s.complete = true; return feedback(s, `八条线全部等于十五！${s.goalCount > 1 ? '本关不同方向的答案也找齐了。' : '这是一种成立的幻方。'}`, 'success');}
      s.board = [...s.givens]; s.selected = null;
      return feedback(s, '收录成功，恢复相同线索，继续找另一种。旋转或镜像在本关算不同方向，但仍须遵守固定线索。', 'success');
    }
    return s;
  },
  hints: () => ['一至九的总和是45，三行相等，因此每行都是15。', '四条经过中心的线合起来是60，等于45再加三次中心，所以中心是5。', '经过中心的一条线上，另外两个数必须合计10；记得还要检查两条对角线。'],
  explain: s => `三阶一至九幻方的中心必须是5，对面两数之和为10。完整验证包括三行、三列和两条对角线。无固定线索时有8个方向解，它们按正方形的旋转和镜像可归为一类；本关按固定坐标检查，线索允许${s.solutionCount}种完整答案。`
};

// G15 — last tile wins.  Dynamic programming supplies the exact optimal move.
export function winningTable(limit, maxTake = 3) {
  const wins = Array(limit + 1).fill(false);
  for (let n = 1; n <= limit; n++) wins[n] = Array.from({length: Math.min(maxTake, n)}, (_, i) => i + 1).some(k => !wins[n - k]);
  return wins;
}
export function optimalTake(remaining, maxTake = 3) {
  if (remaining <= 0) return 0;
  const wins = winningTable(remaining, maxTake);
  for (let k = 1; k <= Math.min(maxTake, remaining); k++) if (!wins[remaining - k]) return k;
  return 1;
}
function takeMove(s, amount, player) {
  if (s.remaining === 0 || !Number.isInteger(amount) || amount < 1 || amount > s.maxTake || amount > s.remaining) return false;
  const before = s.remaining; s.remaining -= amount;
  const wins = winningTable(before, s.maxTake);
  s.history.push({player, take: amount, before, after: s.remaining, optimal: !wins[before] || !wins[s.remaining], leavesLosing: !wins[s.remaining]});
  s.turn = 1 - player;
  if (s.remaining === 0) {s.phase = 'ended'; s.winner = player;}
  return true;
}
function strategyComplete(s) {
  const research = s.mode === 'two';
  const goal = s.phase === 'ended' && (research || s.winner === 0) && (s.level === 0 || s.reason === 'group') && (!research || s.prediction === 'second');
  s.complete = goal; s.progress = {current: s.start - s.remaining, total: s.start, label: '本局取走的牌'};
  return goal;
}
const G15 = {
  id: 'G15', title: '取牌策略', kicker: '看远一步，再拿一张', description: '轮流取牌，研究怎样把关键局面留给对方。', grade: '小学中高段 · 初中', category: 'explore', tags: ['策略', '逆推'],
  intro: '轮流取走一至三张，拿到最后一张的人获胜。只数张数，不计算牌面数字。先从最后四张倒推，再研究十三张。研究关是双人同屏；五张一组挑战会明确改为每次取一至四张。',
  levels: levels(['最后四张', '十三张的策略', '双人推演十二张', '五张一组']),
  create(level = 0, seed = 1) {
    const s = initial(level, seed); const start = level === 0 ? 5 : level === 1 ? 13 : level === 2 ? 12 : 16 + 5 * mod(seed, 2);
    Object.assign(s, {start, remaining: start, maxTake: level === 3 ? 4 : 3, mode: level === 2 ? 'two' : 'computer', ai: level === 0 ? 'practice' : 'optimal', turn: 0, phase: 'playing', winner: null, history: [], reason: '', prediction: '', rng: seed >>> 0});
    s.goal = s.mode === 'two' ? `两人轮流，每次取1—${s.maxTake}张，完成十二张对局，再说明双方最优时谁占优势。` : `从${s.start}张开始，你先手，每次取1—${s.maxTake}张；拿到最后一张获胜${level ? `，并解释凑${s.maxTake + 1}策略。` : '，试着给对手留下四张。'}`;
    strategyComplete(s); return feedback(s, level === 2 ? '双人同屏：甲先行动。双方先试一局，再解释十二张时谁占优势。' : `你先行动，每次取1—${s.maxTake}张，拿最后一张获胜。`);
  },
  view(s, h) {
    const name = player => s.mode === 'two' ? (player === 0 ? '玩家甲' : '玩家乙') : player === 0 ? '你' : '小竹';
    const pile = Array.from({length: s.remaining}, (_, i) => `${['dots', 'bamboo', 'characters'][Math.floor(i / 9) % 3]}_${String(i % 9 + 1).padStart(2, '0')}`);
    const group = s.maxTake + 1;
    const pileColumns = Math.min(s.start, 7);
    return `<div class="lesson-layout strategy-layout" style="--pile-cols:${pileColumns};--pile-rows:${Math.ceil(s.start / pileColumns)}">
      <div class="lesson-board c-stack strategy-board">
        <p class="formula">还剩 ${s.remaining} 张</p><p>${s.phase === 'ended' ? `${h.escape(name(s.winner))}拿到了最后一张，本局结束。` : `现在轮到${h.escape(name(s.turn))} · 每次取1—${s.maxTake}张`}</p>
        ${pile.length ? `<div class="tile-pool strategy-pile">${pile.map(face => h.tile(face, {disabled: true})).join('')}</div>` : '<p>桌面已经取空。</p>'}
        ${actionRow(Array.from({length: s.maxTake}, (_, i) => h.button(`取${i + 1}张`, 'take', i + 1, {primary: i === 0, disabled: s.phase !== 'playing' || i + 1 > s.remaining})).join(''))}
      </div>
      <div class="lesson-side c-stack">
        ${s.mode === 'two' ? `<section class="c-stack"><h3 class="subheading">如果双方都用最好的策略，谁占优势？</h3><div class="choice-row">${choice(h, '先手甲占优势', 'predict', 'first', s.prediction === 'first')}${choice(h, '后手乙占优势', 'predict', 'second', s.prediction === 'second')}</div></section>` : ''}
        <section class="c-panel c-stack"><h3 class="subheading">我的策略解释</h3><div class="choice-row c-list">${choice(h, `让相邻两次行动合计取${group}张`, 'reason', 'group', s.reason === 'group')}${choice(h, '每次都取最多的张数', 'reason', 'most', s.reason === 'most')}${choice(h, '挑牌面数字最大的牌', 'reason', 'rank', s.reason === 'rank')}</div>${rules(`本关按张数取牌，牌面数字不计分。${s.ai === 'optimal' && s.mode !== 'two' ? '小竹会使用最优策略。' : ''}`)}</section>
        ${actionRow(h.button('检查本局发现', 'check', '', {primary: true}) + h.button('再来一局', 'again'))}
      </div>
      ${s.history.length ? `<section class="lesson-wide c-panel c-stack"><h3 class="subheading">一起复盘</h3><ol class="c-history strategy-history">${s.history.map(m => `<li>${h.escape(name(m.player))}取${m.take}张：${m.before} → ${m.after}${m.after > 0 && m.after % group === 0 ? ` <small>留下${group}的倍数</small>` : ''}</li>`).join('')}</ol></section>` : ''}
    </div>`;
  },
  act(s, a) {
    if (a.type === 'again') return G15.create(s.level, (s.seed + 1) >>> 0);
    if (a.type === 'predict') {s.prediction = String(a.value); s.complete = false; return feedback(s, '判断已记录。结论要以双方都按最优策略为前提。');}
    if (a.type === 'reason') {s.reason = String(a.value); s.complete = false; return feedback(s, s.reason === 'group' ? `重点是给对方留下${s.maxTake + 1}的倍数，再补足一组。` : '可以继续对局，再从最后几张倒推这个理由。');}
    if (a.type === 'take') {
      const amount = Number(a.value);
      if (s.phase !== 'playing') return feedback(s, '本局已经结束，可以复盘或再来一局。');
      if (!takeMove(s, amount, s.turn)) return feedback(s, `这次只能取1—${Math.min(s.remaining, s.maxTake)}张，不能超过剩余数量。`, 'error');
      if (s.mode === 'computer' && s.phase === 'playing') {
        const k = s.ai === 'optimal' ? optimalTake(s.remaining, s.maxTake) : 1 + Math.floor(nextRandom(s) * Math.min(s.remaining, s.maxTake));
        takeMove(s, k, 1);
        if (s.phase === 'playing') feedback(s, `你取${amount}张，小竹取${k}张。现在剩${s.remaining}张，轮到你。`);
      } else if (s.phase === 'playing') feedback(s, `已取${amount}张，现在换${s.turn === 0 ? '甲' : '乙'}行动。`);
      strategyComplete(s);
      if (s.phase === 'ended') return feedback(s, s.mode === 'two' ? `本局${s.winner === 0 ? '甲' : '乙'}获胜。再研究双方最优时的结论，不用一次胜负代替证明。` : s.winner === 0 ? `你拿到了最后一张！${s.level > 0 && s.reason !== 'group' ? '选出你的策略解释，再整理发现。' : '可以回看每一轮留下的张数。'}` : '小竹拿到了最后一张。复盘看看哪一步可以给它留下关键倍数，再试一局。', s.winner === 0 ? 'success' : 'info');
      return s;
    }
    if (a.type === 'check') {
      s.complete = false;
      if (s.phase !== 'ended') return feedback(s, '先完成这一局，再把策略和结果一起整理。');
      if (s.mode === 'computer' && s.winner !== 0) return feedback(s, '先从最后四张倒推，换一局验证你的新方法。');
      if (s.mode === 'two' && s.prediction !== 'second') return feedback(s, '十二是四的倍数。无论先手取1、2或3，后手都能补足四，所以双方最优时后手占优势。', 'error');
      if (s.level > 0 && s.reason !== 'group') return feedback(s, `要解释怎样控制局面：让双方相邻两次行动合起来取${s.maxTake + 1}张。`, 'error');
      strategyComplete(s); return feedback(s, `发现整理好了！${s.mode === 'two' ? '最优行动下，十二张是先手的必败局面。' : `你用实战验证了控制${s.maxTake + 1}的倍数的方法。`}`, 'success');
    }
    return s;
  },
  hints: s => [`先看最后${s.maxTake + 1}张：当前行动者拿多少，对方都可以拿完。`, `给对手留下${s.maxTake + 1}的倍数；对手取k张，你补取${s.maxTake + 1}−k张。`, s.start % (s.maxTake + 1) ? `开头先取${s.start % (s.maxTake + 1)}张，就留下${s.maxTake + 1}的倍数。` : `开头是${s.maxTake + 1}的倍数，双方最优时先手必败；后手可以每轮补足一组。`],
  explain: s => `每次取1—${s.maxTake}张、末张获胜时，轮到行动者且剩余${s.maxTake + 1}的倍数，是必败局面：每种取法都能被对方补足一组。其他正整数局面可一步走到这样的倍数。${s.start}张${s.start % (s.maxTake + 1) ? `先手可先取${s.start % (s.maxTake + 1)}张` : '在双方最优时后手占优势'}。一次输赢不能代替对所有合法应手的解释。`
};

export const gamesC = [G11, G12, G13, G14A, G14B, G15];
