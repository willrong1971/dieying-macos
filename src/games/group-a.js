// Counting and arrangement games. All state is JSON data; the shared shell owns
// persistence, undo, focus, the 3D tile renderer and routing.
const SUITS = ['dots', 'bamboo', 'characters'];
const SUIT_NAMES = { dots: '筒', bamboo: '条', characters: '万' };
const NUMS = '一二三四五六七八九';
const face = (rank, suit = 'dots') => `${suit}_${String(rank).padStart(2, '0')}`;
const rankOf = key => Number(key.split('_').at(-1));
const label = key => `${NUMS[rankOf(key) - 1]}${SUIT_NAMES[key.split('_')[0]]}`;
const message = (s, text, kind = 'info') => { s.feedback = { text, kind }; return s; };
const base = (level, seed) => ({ level, seed, complete: false, feedback: { text: '先摆一摆，再检查你的发现。', kind: 'info' } });
const encode = list => list.join('|');
const safeIndex = (x, length) => Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) < length;

function shuffled(items, seed) {
  let x = 2166136261;
  for (const c of String(seed)) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    const j = (x >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function combinations(values, count) {
  const out = [];
  function visit(start, picked) {
    if (picked.length === count) { out.push(picked); return; }
    for (let i = start; i <= values.length - (count - picked.length); i++) visit(i + 1, [...picked, values[i]]);
  }
  visit(0, []); return out;
}

export function uniquePermutations(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
  const result = [];
  function visit(current) {
    if (current.length === values.length) { result.push(current); return; }
    for (const key of keys) if (counts.get(key)) {
      counts.set(key, counts.get(key) - 1); visit([...current, key]); counts.set(key, counts.get(key) + 1);
    }
  }
  visit([]); return result;
}

export function sumRecipes(ranks, copies, count, total) {
  const out = [];
  function visit(start, current, used, sum) {
    if (current.length === count) { if (sum === total) out.push(current); return; }
    for (let i = start; i < ranks.length; i++) {
      const n = ranks[i];
      if ((used[n] || 0) >= copies || sum + n > total) continue;
      visit(i, [...current, n], { ...used, [n]: (used[n] || 0) + 1 }, sum + n);
    }
  }
  visit(0, [], {}, 0); return out;
}

export function boxDistributions(total, boxes, { min = 0, max = total, first = null } = {}) {
  const out = [];
  function visit(counts, left) {
    if (counts.length === boxes) { if (!left && (first === null || counts[0] === first)) out.push(counts); return; }
    for (let n = min; n <= Math.min(max, left); n++) visit([...counts, n], left - n);
  }
  visit([], total); return out;
}

function collectionHTML(found, render) {
  const cards = found.map((entry, i) => `<div class="collection-card"><span class="small-text">${i + 1}</span>${render(entry)}</div>`).join('');
  return `<section class="counting-collection">
    <h3 class="subheading">发现图鉴 <span class="small-text">${found.length} 项</span></h3>
    ${cards ? `<div class="collection-grid">${cards}</div>` : '<p class="small-text">每找到一种新办法，就把它收进来。相同的办法只记一次。</p>'}
  </section>`;
}

function inventoryHTML(content, count, columns) {
  return `<div class="tile-pool counting-inventory" style="--inventory-cols:${columns};--inventory-rows:${Math.ceil(count / columns)}">${content}</div>`;
}

function slotHTML(h, chosen, count, { ordered = true } = {}) {
  const slots = Array.from({ length: count }, (_, i) => `<div class="slot ${chosen[i] ? 'filled' : 'empty'}">
    <span class="slot-label">${ordered ? `第${i + 1}位` : '选牌托盘'}</span>
    ${chosen[i] ? h.tile(chosen[i].face, { action: 'remove', value: String(i), tag: chosen[i].tag || '', label: `${label(chosen[i].face)}，点击取回` }) : `<span class="counting-tray-empty small-text">${ordered ? i + 1 : '放一张'}</span>`}
  </div>`).join('');
  return `<div class="tile-pool counting-tray" style="--tray-slots:${count}">${slots}</div>`;
}

const museumConfigs = [
  { ranks: 3, missing: 0, label: '一起学 · 九张牌' },
  { ranks: 9, missing: 0, label: '练一练 · 完整展柜' },
  { ranks: 9, missing: 2, label: '找缺牌 · 两个空位' },
  { ranks: 6, missing: 3, label: '挑战 · 换个方向' },
];

export const museum = {
  id: 'G01', title: '牌面博物馆', kicker: '分类与对应', description: '给每张牌一个家，让缺少的牌自己显出来。', grade: '小学低段起', category: 'count', tags: ['分类', '二维表', '乘法原理'],
  intro: '先在散牌中选一张，再点展柜里的位置。每一行收同一种花色，每一列收同一个数字。点已摆好的牌可以取回。缺牌关要先整理现有牌，再点空位标出缺失牌。', levels: museumConfigs,
  create(level = 0, seed = 1) {
    level = Math.max(0, Math.min(museumConfigs.length - 1, Number(level) || 0));
    const cfg = museumConfigs[level];
    const all = SUITS.flatMap(s => Array.from({ length: cfg.ranks }, (_, i) => face(i + 1, s)));
    const missing = cfg.missing ? (level === 2 ? ['dots_03', 'characters_07'] : shuffled(all, seed).slice(0, cfg.missing)) : [];
    const goal = missing.length ? `先把现有牌按花色与数字放好，再标出缺少的${missing.length}种牌面。` : `把${all.length}张牌按花色与数字放进展柜，每张牌都要找到对应的位置。`;
    return { ...base(level, seed), goal, all, missing, order: shuffled(all.filter(k => !missing.includes(k)), seed), cells: {}, selected: null, guesses: [], transpose: level === 3, progress: { current: 0, total: all.length - missing.length, label: '已整理' } };
  },
  view(s, h) {
    const cfg = museumConfigs[s.level], placed = Object.values(s.cells), pool = s.order.filter(k => !placed.includes(k));
    const keys = s.transpose ? Array.from({ length: cfg.ranks }, (_, i) => SUITS.map(suit => face(i + 1, suit))).flat() : s.all;
    const cols = s.transpose ? 3 : cfg.ranks;
    const slots = keys.map(key => {
      const current = s.cells[key], guessed = s.guesses.includes(key);
      const slotLabel = `${rankOf(key)} · ${SUIT_NAMES[key.split('_')[0]]}`;
      const tile = current ? h.tile(current, { action: 'return', value: key, label: `${label(current)}，取回展柜外` }) : h.button(guessed ? '已标为缺牌' : s.selected ? '放这里' : '空位', 'place', key, { primary: guessed });
      return `<div class="slot museum-slot ${current ? 'filled' : 'empty'}${guessed ? ' selected' : ''}"><span class="slot-label">${slotLabel}</span>${tile}</div>`;
    }).join('');
    const inventory = inventoryHTML(pool.map(key => h.tile(key, { action: 'pick', value: key, selected: s.selected === key })).join(''), s.order.length, s.order.length > 18 ? 7 : s.order.length > 9 ? 5 : 3);
    return `<div class="lesson-layout counting-layout museum-layout${cfg.ranks > 3 && !s.transpose ? ' museum-wide-cabinet' : ''}">
      <section class="lesson-board museum-cabinet">
        <div class="museum-cabinet-heading"><p class="small-text">${s.missing.length ? `本关少了${s.missing.length}张牌。先整理，再点空位标记缺牌。` : '点选散牌，再点对应的位置。点已放入的牌可以取回。'}</p>${h.button('行列换个方向', 'transpose')}</div>
        <div class="board-grid museum-grid${s.transpose && cfg.ranks > 3 ? ' museum-many-rows' : ''}" style="--cols:${cols};--cabinet-rows:${keys.length / cols}">${slots}</div>
      </section>
      <section class="lesson-side counting-side museum-stock">
        <h3 class="subheading">待整理的牌 <span class="small-text">${pool.length} 张</span></h3>
        ${inventory}
        <div class="action-row">${h.button('检查展柜', 'check', '', { primary: true })}${s.selected ? h.button('取消选牌', 'cancel') : ''}</div>
      </section>
    </div>`;
  },
  act(s, a) {
    if (a.type === 'pick' && s.order.includes(a.value) && !Object.values(s.cells).includes(a.value)) s.selected = s.selected === a.value ? null : a.value;
    if (a.type === 'cancel') s.selected = null;
    if (a.type === 'transpose') s.transpose = !s.transpose;
    if (a.type === 'return' && s.cells[a.value]) { s.selected = s.cells[a.value]; delete s.cells[a.value]; s.complete = false; }
    if (a.type === 'place' && s.all.includes(a.value) && !s.cells[a.value]) {
      if (s.selected && !Object.values(s.cells).includes(s.selected)) { s.cells[a.value] = s.selected; s.selected = null; s.guesses = s.guesses.filter(k => k !== a.value); }
      else if (s.missing.length) { s.guesses = s.guesses.includes(a.value) ? s.guesses.filter(k => k !== a.value) : [...s.guesses, a.value]; s.complete = false; }
      else return message(s, '先在待整理区点选一张牌。');
    }
    s.progress.current = Object.entries(s.cells).filter(([target, actual]) => target === actual).length;
    if (a.type === 'check') {
      const wrong = Object.entries(s.cells).find(([target, actual]) => target !== actual);
      if (wrong) return message(s, `这格收${label(wrong[0])}，现在放的是${label(wrong[1])}。点它取回，再换个位置。`, 'error');
      if (Object.keys(s.cells).length !== s.order.length) return message(s, `还有${s.order.length - Object.keys(s.cells).length}张牌没有整理好。`, 'error');
      if (encode([...s.guesses].sort()) !== encode([...s.missing].sort())) return message(s, `展柜已经整理好，再把${s.missing.length}个缺牌位置完整标出来。`, 'error');
      s.complete = true; return message(s, `你整理出了${SUITS.length}种花色、每种${museumConfigs[s.level].ranks}个数字。${s.missing.length ? '缺失牌也全部找到了！' : '每张牌都有自己的位置！'}`, 'success');
    }
    return s;
  },
  hints(s) { return ['先只看花色，把同一类牌放在一行。', '再看数字：同一列的数字应当相同。', s.missing.length ? '先把现有牌全部摆对，剩下的空位就告诉你缺了什么。' : '逐行检查：一到最后一个数字，是否各有一张？']; },
  explain(s) { return `每张牌同时回答两个问题：什么花色、哪个数字。三种花色，每种${museumConfigs[s.level].ranks}种数字，共有3×${museumConfigs[s.level].ranks}＝${s.all.length}种不同牌面。调换行列的方向，总数仍然一样。`; },
};

const recipeConfigs = [
  { label: '一起学 · 凑成六', ranks: [1, 2, 3, 4, 5], copies: 2, count: 2, sum: 6 },
  { label: '练一练 · 凑成十', ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9], copies: 2, count: 2, sum: 10 },
  { label: '库存变了 · 只有一张五', ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9], copies: 1, count: 2, sum: 10 },
  { label: '挑战 · 三张凑十二', ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9], copies: 1, count: 3, sum: 12 },
];

export const recipes = {
  id: 'G02', title: '凑数图鉴', kicker: '把所有可能找齐', description: '找到一个配方以后，还能找到哪些不同的配方？', grade: '小学低中段起', category: 'count', tags: ['数的分解', '有序枚举'],
  intro: '从备牌中点选指定张数，使数字相加等于目标。点槽位中的牌可以取回。收录成功后牌会全部返回备牌区，继续找下一种。基础图鉴只比较数字，左右交换算同一种。', levels: recipeConfigs,
  create(level = 0, seed = 1) {
    level = Math.max(0, Math.min(recipeConfigs.length - 1, Number(level) || 0)); const cfg = recipeConfigs[level];
    const cards = cfg.ranks.flatMap(n => Array.from({ length: cfg.copies }, (_, i) => ({ id: `${n}-${i}`, rank: n, face: face(n) })));
    const answers = sumRecipes(cfg.ranks, cfg.copies, cfg.count, cfg.sum);
    const goal = `每次选${cfg.count}张牌，让数字相加等于${cfg.sum}，收齐${answers.length}种不同的数字配方。`;
    return { ...base(level, seed), goal, cards: shuffled(cards, seed), chosen: [], found: [], answers, progress: { current: 0, total: answers.length, label: '不同配方' } };
  },
  view(s, h) {
    const cfg = recipeConfigs[s.level], selected = s.chosen.map(id => s.cards.find(c => c.id === id));
    const tiles = s.cards.map(c => h.tile(c.face, { action: 'pick', value: c.id, disabled: s.chosen.includes(c.id), label: `${label(c.face)}，备牌${c.id.split('-')[1] === '0' ? '甲' : '乙'}` })).join('');
    return `<div class="lesson-layout counting-layout recipe-layout">
      <section class="lesson-board counting-board">
        <h3 class="subheading">备牌区</h3>
        ${inventoryHTML(tiles, s.cards.length, s.cards.length > 10 ? 6 : s.cards.length === 10 ? 5 : 3)}
      </section>
      <div class="lesson-side counting-side">
        <section class="counting-task">
          <div class="formula">用${cfg.count}张牌，凑成 <strong>${cfg.sum}</strong></div>
          <p class="small-text">每个数字${cfg.copies}张 · 左右交换是同一个配方</p>
          ${slotHTML(h, selected, cfg.count, { ordered: false })}
          <div class="action-row">${h.button('收入图鉴', 'submit', '', { primary: true })}${h.button('取回所选', 'clear')}</div>
        </section>
        ${collectionHTML(s.found, entry => `<span class="formula">${entry.join('＋')}＝${cfg.sum}</span>`)}
      </div>
    </div>`;
  },
  act(s, a) {
    const cfg = recipeConfigs[s.level];
    if (a.type === 'pick') {
      if (!s.cards.some(c => c.id === a.value) || s.chosen.includes(a.value)) return message(s, '一张实体牌不能同时占两个位置。', 'error');
      if (s.chosen.length >= cfg.count) return message(s, '槽位已满。点一下槽位里的牌，可以取回重选。');
      s.chosen.push(a.value);
    }
    if (a.type === 'remove' && safeIndex(a.value, s.chosen.length)) s.chosen.splice(Number(a.value), 1);
    if (a.type === 'clear') s.chosen = [];
    if (a.type === 'submit' || a.type === 'check') {
      if (s.chosen.length !== cfg.count) return message(s, `先选满${cfg.count}张牌。`, 'error');
      const nums = s.chosen.map(id => s.cards.find(c => c.id === id).rank), sum = nums.reduce((a, b) => a + b, 0);
      if (sum !== cfg.sum) return message(s, `合起来是${sum}，${sum < cfg.sum ? `还差${cfg.sum - sum}` : `多了${sum - cfg.sum}`}。可以保留一张，只换另一张。`, 'error');
      const key = encode([...nums].sort((a, b) => a - b));
      if (s.found.some(x => encode(x) === key)) return message(s, '这个配方已经收录。换了左右顺序，仍然是同一种。');
      s.found.push([...nums].sort((a, b) => a - b)); s.chosen = [];
      s.progress.current = s.found.length; s.complete = s.found.length === s.answers.length;
      return message(s, s.complete ? `全部${s.answers.length}种配方找齐了！你可以按较小数字的顺序检查有没有遗漏。` : '收进一个新配方！牌已返回备牌区，再找一种。', 'success');
    }
    return s;
  },
  hints(s) { const cfg = recipeConfigs[s.level]; return ['先固定最小的一张，寻找它的伙伴。', '按较小的数字从一往后找，交换左右不增加新配方。', cfg.copies === 1 ? '五只有一张，不能独自占据两个槽位。' : `相同数字也可能相加，但要有足够的实体牌。目标是${cfg.sum}。`]; },
  explain(s) { return `本关共${s.answers.length}种数字配方：${s.answers.map(a => a.join('＋')).join('、')}。把每个配方从小到大整理，可以避免把倒序重复计算；库存变化时，配方总数也会变化。`; },
};

export function selectionSolutions(n, k, forbidFirst = null) {
  const values = Array.from({ length: n }, (_, i) => i + 1), groups = combinations(values, k);
  return { choose: groups, queue: groups.flatMap(g => uniquePermutations(g)).filter(p => forbidFirst === null || p[0] !== forbidFirst) };
}

const selectionConfigs = [
  { label: '一起学 · 三取二', n: 3, k: 2 },
  { label: '练一练 · 四取二', n: 4, k: 2 },
  { label: '全部出场 · 三张排队', n: 3, k: 3 },
  { label: '挑战 · 一不站队首', n: 3, k: 2, forbidFirst: 1 },
];

export const selections = {
  id: 'G03', title: '选牌还是排队', kicker: '顺序改变了什么', description: '同样两张牌，选在一起和排成队，有多少种不同？', grade: '小学中段起', category: 'count', tags: ['选择', '排列', '顺序'],
  intro: '先在“选在一起”模式收集选法，再切换“排成队”收集队列。选牌时只看是哪几张；排队时还要看第一位、第二位。提交后牌归还，两册图鉴分别保留。', levels: selectionConfigs,
  create(level = 0, seed = 1) {
    level = Math.max(0, Math.min(selectionConfigs.length - 1, Number(level) || 0)); const cfg = selectionConfigs[level];
    const answers = selectionSolutions(cfg.n, cfg.k, cfg.forbidFirst ?? null);
    const goal = cfg.forbidFirst ? `选牌收齐${answers.choose.length}种，排队收齐${answers.queue.length}种；一筒不能站队首，注意两册规则不同。` : `分别收齐${answers.choose.length}种选牌和${answers.queue.length}种队列，比较顺序怎样改变结果。`;
    return { ...base(level, seed), goal, mode: 'choose', chosen: [], found: { choose: [], queue: [] }, answers, order: shuffled(Array.from({ length: cfg.n }, (_, i) => i + 1), seed), progress: { current: 0, total: answers.choose.length + answers.queue.length, label: '两册图鉴' } };
  },
  view(s, h) {
    const cfg = selectionConfigs[s.level];
    const choosing = s.mode === 'choose';
    const tiles = s.order.map(n => h.tile(face(n), { action: 'pick', value: String(n), disabled: s.chosen.includes(n) })).join('');
    const guidance = !choosing && cfg.forbidFirst ? '本关排队另有条件：一筒不能站在第一位。' : `从${cfg.n}张不同牌中选${cfg.k}张。${choosing ? '交换位置不产生新选法。' : '第一位变了，队列就可能不同。'}`;
    return `<div class="lesson-layout counting-layout selection-layout">
      <section class="lesson-board counting-board">
        <div class="choice-row">${h.button(`选在一起 ${s.found.choose.length}/${s.answers.choose.length}`, 'mode', 'choose', { primary: choosing })}${h.button(`排成队 ${s.found.queue.length}/${s.answers.queue.length}`, 'mode', 'queue', { primary: !choosing })}</div>
        ${inventoryHTML(tiles, cfg.n, cfg.n)}
      </section>
      <div class="lesson-side counting-side">
        <section class="counting-task">
          <h3 class="subheading">${choosing ? '只看选中了哪些牌' : '每一个位置都有意义'}</h3>
          <p class="small-text">${guidance}</p>
          ${slotHTML(h, s.chosen.map(n => ({ face: face(n) })), cfg.k, { ordered: !choosing })}
          <div class="action-row">${h.button('收入这册图鉴', 'submit', '', { primary: true })}${h.button('交换前两张', 'swap', '', { disabled: s.chosen.length < 2 })}${h.button('取回所选', 'clear')}</div>
        </section>
        ${collectionHTML(s.found[s.mode], entry => `<span class="formula">${choosing ? `｛${entry.join('、')}｝` : entry.join(' → ')}</span>`)}
      </div>
    </div>`;
  },
  act(s, a) {
    const cfg = selectionConfigs[s.level];
    if (a.type === 'mode' && ['choose', 'queue'].includes(a.value)) { s.mode = a.value; s.chosen = []; return message(s, s.mode === 'choose' ? '这一册只比较选中了哪几张牌。' : '这一册还比较每张牌站在哪个位置。'); }
    if (a.type === 'pick' && s.order.includes(Number(a.value))) {
      const n = Number(a.value);
      if (s.chosen.includes(n)) return message(s, '同一张牌不能使用两次。', 'error');
      if (s.chosen.length >= cfg.k) return message(s, '位置已经选满，点槽位中的牌可以取回。');
      s.chosen.push(n);
    }
    if (a.type === 'remove' && safeIndex(a.value, s.chosen.length)) s.chosen.splice(Number(a.value), 1);
    if (a.type === 'clear') s.chosen = [];
    if (a.type === 'swap' && s.chosen.length >= 2) [s.chosen[0], s.chosen[1]] = [s.chosen[1], s.chosen[0]];
    if (a.type === 'submit' || a.type === 'check') {
      if (s.chosen.length !== cfg.k) return message(s, `本关要选${cfg.k}张不同的牌。`, 'error');
      if (s.mode === 'queue' && cfg.forbidFirst === s.chosen[0]) return message(s, '这关一筒不能站队首。请交换位置，或换一张牌。', 'error');
      const answer = s.mode === 'choose' ? [...s.chosen].sort((a, b) => a - b) : [...s.chosen];
      if (s.found[s.mode].some(x => encode(x) === encode(answer))) return message(s, s.mode === 'choose' ? '这些牌已经选过了。交换左右，选中的仍是同一组。' : '这个位置顺序已经收录了。');
      s.found[s.mode].push(answer); s.chosen = [];
      s.progress.current = s.found.choose.length + s.found.queue.length;
      s.complete = s.progress.current === s.progress.total;
      return message(s, s.complete ? '两册图鉴都找齐了！比较一下：每组选牌可以排成多少个队列？' : `发现一种新${s.mode === 'choose' ? '选法' : '队列'}。另一册图鉴也会保留。`, 'success');
    }
    return s;
  },
  hints(s) { return ['先固定第一张，再依次换伙伴。', '同样两张牌，交换前后：选牌图鉴不变，队列图鉴会改变。', s.level === 3 ? '排队时，把以一筒开头的队列排除；选牌册仍只比较哪些牌。' : '把所有队列按“选中了哪些牌”分组，看看每组有几个。']; },
  explain(s) { return `本关选牌有${s.answers.choose.length}种，排队有${s.answers.queue.length}种。选牌不考虑顺序，排队考虑位置。${s.level === 3 ? '队首限制只作用于排队，不能混到选牌规则里。' : '基础三取二时，每组选牌都有两种左右次序，因此3种选法对应6种队列。'}`; },
};

const repeatConfigs = [
  { label: '一起学 · 112', values: [1, 1, 2] },
  { label: '练一练 · 1112', values: [1, 1, 1, 2] },
  { label: '挑战 · 1122', values: [1, 1, 2, 2] },
  { label: '研究 · 1123', values: [1, 1, 2, 3] },
  { label: '身份实验 · 甲乙可见', values: [1, 1, 2], tagged: true },
];
function repeatKey(s) { return encode(s.arrangement.map(id => s.config.tagged ? id : s.cards.find(c => c.id === id).rank)); }
const repeatCards = s => s.arrangement.map(id => s.cards.find(c => c.id === id));

export const repetitions = {
  id: 'G04', title: '相同牌也排队', kicker: '哪些交换算新的', description: '交换了两张牌，眼前的图案一定会改变吗？', grade: '小学中高段起', category: 'count', tags: ['重复元素', '排列', '等价'],
  intro: '所有牌已经站成一行。点选两个位置，交换它们，再把当前队列收进图鉴。普通关只看正面图案，交换相同牌不算新队列；左右方向固定，镜像算不同。身份实验中甲乙标记可见，规则另行说明。', levels: repeatConfigs,
  create(level = 0, seed = 1) {
    level = Math.max(0, Math.min(repeatConfigs.length - 1, Number(level) || 0)); const config = repeatConfigs[level];
    const cards = config.values.map((n, i) => ({ id: `card-${i}`, rank: n, face: face(n), tag: config.tagged ? '甲乙丙丁'[i] : '' }));
    const answers = uniquePermutations(config.tagged ? cards.map(c => c.id) : config.values);
    const goal = config.tagged ? `甲乙标记也算身份差别，交换牌的位置，收齐${answers.length}种不同的身份队列。` : `交换所有${cards.length}张牌的位置，收齐${answers.length}种不同图案的队列，相同牌互换不另计。`;
    return { ...base(level, seed), goal, config, cards, arrangement: shuffled(cards.map(c => c.id), seed), selected: null, found: [], answers, progress: { current: 0, total: answers.length, label: '不同队列' } };
  },
  view(s, h) {
    const tiles = repeatCards(s).map((c, i) => `<div class="repeat-position"><span class="slot-label">第${i + 1}位</span>${h.tile(c.face, { action: 'swap-pick', value: String(i), selected: s.selected === i, tag: c.tag })}</div>`).join('');
    return `<div class="lesson-layout counting-layout repeat-layout">
      <section class="lesson-board counting-board repeat-board">
        <h3 class="subheading">点两张牌，交换位置</h3>
        <p class="small-text">${s.config.tagged ? '甲、乙、丙标记可见，本关把身份也算作区别；这册图鉴与普通图案图鉴分开。' : '只看正面图案 · 同牌交换不增加答案 · 左右镜像算不同'}</p>
        ${inventoryHTML(tiles, s.cards.length, s.cards.length)}
        <div class="action-row">${h.button('收入当前队列', 'submit', '', { primary: true })}${h.button('取消选中', 'cancel', '', { disabled: s.selected === null })}</div>
      </section>
      <div class="lesson-side counting-side">${collectionHTML(s.found, entry => `<span class="formula">${entry.display.join(' → ')}</span>`)}</div>
    </div>`;
  },
  act(s, a) {
    if (a.type === 'cancel') s.selected = null;
    if (a.type === 'swap-pick' && safeIndex(a.value, s.arrangement.length)) {
      const i = Number(a.value);
      if (s.selected === null) { s.selected = i; return message(s, '再选另一张，与它交换位置。'); }
      if (s.selected === i) { s.selected = null; return message(s, '已取消选中。'); }
      const previous = repeatKey(s);
      [s.arrangement[s.selected], s.arrangement[i]] = [s.arrangement[i], s.arrangement[s.selected]];
      s.selected = null;
      return message(s, previous === repeatKey(s) ? '两张实体牌交换了，但正面图案没有改变。' : '队列换了。检查一下，它是不是新的图案？');
    }
    if (a.type === 'submit' || a.type === 'check') {
      const key = repeatKey(s);
      if (s.found.some(entry => entry.key === key)) return message(s, '这个可见队列已经收录。再让不一样的牌换个位置。');
      s.found.push({ key, display: repeatCards(s).map(c => s.config.tagged ? `${c.rank}${c.tag}` : String(c.rank)) });
      s.progress.current = s.found.length; s.complete = s.found.length === s.answers.length;
      return message(s, s.complete ? `全部${s.answers.length}种队列找齐了！交换相同图案，不会增加普通关的答案。` : '新队列已收录，牌留在桌上，可以继续交换。', 'success');
    }
    return s;
  },
  hints(s) { return ['盯住那张不一样的牌：它还能站在哪个位置？', '先固定第一张，再整理后面的位置，避免来回重复。', s.config.tagged ? '本关甲乙可见，交换甲乙会改变身份顺序。' : '把两张相同牌当成同一种图案，不用分别给它们取名字。']; },
  explain(s) { return s.config.tagged ? '甲乙标记可见时，三张牌都能区分，因此有6种身份队列。遮住甲乙后，交换两张一筒不改变图案，只剩112、121、211三种。' : `本关共有${s.answers.length}种可见队列。${s.config.values.filter(n => n === 2).length === 1 && s.config.values.every(n => n <= 2) ? '让唯一的二筒依次站过每个位置，就能找齐。' : '按不一样的图案选择位置，同面牌互换不另计。'}左右顺序仍然重要，所以反向不自动合并。`; },
};

const boxConfigs = [
  { label: '一起学 · 两间房', total: 2, boxes: 2, min: 0 },
  { label: '练一练 · 四牌三房', total: 4, boxes: 3, min: 0 },
  { label: '每间都有人', total: 4, boxes: 3, min: 1 },
  { label: '挑战 · 每间至多两张', total: 4, boxes: 3, min: 0, max: 2 },
  { label: '研究 · 甲恰好一张', total: 4, boxes: 3, min: 0, first: 1 },
];

export const houses = {
  id: 'G05', title: '四张牌住三间房', kicker: '把分配办法整理清楚', description: '房间有名字，牌长得一样。怎样分配才不会遗漏？', grade: '小学高段起', category: 'count', tags: ['分配', '分类计数', '整数分拆'],
  intro: '点“放一张”，把一张牌搬进相应房间。点房里的牌可取回。所有牌分完以后收录这一种分法，牌会回到起点。甲乙丙是不同房间，盒内顺序与相同牌身份不计。', levels: boxConfigs,
  create(level = 0, seed = 1) {
    level = Math.max(0, Math.min(boxConfigs.length - 1, Number(level) || 0)); const config = boxConfigs[level];
    const answers = boxDistributions(config.total, config.boxes, config);
    const rule = config.first !== undefined ? '甲房恰好一张' : config.min ? '每房至少一张' : config.max ? '每房至多两张' : '允许空房';
    const goal = `把${config.total}张同牌分进${config.boxes}间有名字的房间，${rule}，收齐${answers.length}种分法。`;
    return { ...base(level, seed), goal, config, counts: Array(config.boxes).fill(0), found: [], answers, progress: { current: 0, total: answers.length, label: '不同分法' } };
  },
  view(s, h) {
    const cfg = s.config, left = cfg.total - s.counts.reduce((a, b) => a + b, 0);
    const rule = cfg.first === 1 ? '甲必须恰好一张，其他房间可以空。' : cfg.min ? '每间房至少住一张牌。' : cfg.max === 2 ? '可以空房，但每间最多两张。' : '可以空房，房间按名字区分。';
    const capacity = cfg.max ?? cfg.total;
    const rooms = s.counts.map((count, i) => `<section class="slot room-slot ${count ? 'filled' : 'empty'}">
      <h3 class="subheading">${'甲乙丙'[i]}房 <span class="small-text">${count} 张</span></h3>
      <div class="tile-pool room-tray">${Array.from({ length: count }, () => h.tile('dots_01', { action: 'remove', value: String(i), small: true, label: `从${'甲乙丙'[i]}房取回一张` })).join('')}</div>
      ${h.button('放一张', 'add', String(i), { disabled: left === 0 || count >= capacity })}
    </section>`).join('');
    const unassigned = Array.from({ length: left }, () => h.tile('dots_01', { disabled: true, small: true, label: '还没分配的一筒' })).join('');
    return `<div class="lesson-layout counting-layout houses-layout">
      <section class="lesson-board counting-board houses-board">
        <p class="small-text">${rule}</p>
        <div class="board-grid room-grid" style="--cols:${cfg.boxes};--room-rows:${Math.ceil(capacity / 2)}">${rooms}</div>
        <div class="action-row">${h.button('收录这次分法', 'submit', '', { primary: true })}${h.button('全部取回', 'clear')}</div>
      </section>
      <div class="lesson-side counting-side">
        <section class="house-stock"><h3 class="subheading">还没分配 <span class="small-text">${left} 张</span></h3>
          ${unassigned ? inventoryHTML(unassigned, cfg.total, cfg.total) : '<p class="small-text">都住进房间了，检查后收录吧。</p>'}
        </section>
        ${collectionHTML(s.found, entry => `<span class="formula">${entry.map((n, i) => `${'甲乙丙'[i]}${n}`).join(' · ')}</span>`)}
      </div>
    </div>`;
  },
  act(s, a) {
    const cfg = s.config, placed = s.counts.reduce((a, b) => a + b, 0);
    if (a.type === 'clear') s.counts.fill(0);
    if (a.type === 'add' && safeIndex(a.value, cfg.boxes)) {
      const i = Number(a.value);
      if (placed >= cfg.total) return message(s, '牌已经分完了，可以点房里的牌取回重分。');
      if (s.counts[i] >= (cfg.max ?? cfg.total)) return message(s, `这间房最多${cfg.max ?? cfg.total}张。`, 'error');
      s.counts[i]++;
    }
    if (a.type === 'remove' && safeIndex(a.value, cfg.boxes) && s.counts[Number(a.value)] > 0) s.counts[Number(a.value)]--;
    if (a.type === 'submit' || a.type === 'check') {
      if (s.counts.reduce((a, b) => a + b, 0) !== cfg.total) return message(s, '还有牌没有住进房间。全部分完后再收录。', 'error');
      if (s.counts.some(n => n < cfg.min)) return message(s, '这一关每间房都要至少有一张。', 'error');
      if (s.counts.some(n => n > (cfg.max ?? cfg.total))) return message(s, `这一关每间房最多${cfg.max ?? cfg.total}张。`, 'error');
      if (cfg.first !== undefined && s.counts[0] !== cfg.first) return message(s, `甲房这一关必须恰好${cfg.first}张。`, 'error');
      if (s.found.some(entry => encode(entry) === encode(s.counts))) return message(s, '这份数量分配已经收录，房内同牌换位置仍是同一种。');
      s.found.push([...s.counts]); s.counts.fill(0); s.progress.current = s.found.length; s.complete = s.found.length === s.answers.length;
      return message(s, s.complete ? `全部${s.answers.length}种分法找齐了！试着按甲房的数量把它们分成几类。` : '新分法已收录。牌已取回，可以再分一次。', 'success');
    }
    return s;
  },
  hints(s) { return ['先固定甲房的张数，暂时不要改变它。', '让乙房从最少开始逐张增加，丙房接收剩下的牌。', s.config.min ? '先给每间房一张，再看剩下的一张能去哪里。' : '四牌三房可空时，甲为0、1、2、3、4张，分别有5、4、3、2、1种。']; },
  explain(s) { return `本关有${s.answers.length}种符合规则的分法。${s.level === 1 ? '按甲房张数分组，可以数成5＋4＋3＋2＋1＝15。' : s.level === 2 ? '先给每间一张，剩下一张有甲乙丙三种去处。' : '先固定一个房间，再依次整理其他房间的数量。'}甲乙丙有固定名字，所以(2,1,1)与(1,2,1)属于不同分法。`; },
};

export const gamesA = [museum, recipes, selections, repetitions, houses];
