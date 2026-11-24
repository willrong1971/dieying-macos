import {h, escape, resetTileCount} from './ui.js';

const categories={all:'全部玩法',count:'整理与计数',logic:'摆阵与推理',explore:'实验与发现'};
const families={G01:'grid',G02:'arrange',G03:'arrange',G04:'arrange',G05:'classify',G06:'classify',G07:'classify',G08:'arrange',G09:'grid',G10:'arrange',G11:'compare',G12:'experiment',G13:'compare',G14A:'grid',G14B:'grid',G15:'strategy'};
const found=(profile,id,level)=>profile.discoveries.some(d=>d.gameId===id&&d.level===level);
const completed=(profile,id)=>new Set(profile.discoveries.filter(d=>d.gameId===id).map(d=>d.level)).size;

// The game's own view remains intact: the shell only arranges the surrounding UI.
export function renderWorkshop({current,level,state,profile,historyCount=0,futureCount=0,helpers=h}){
  resetTileCount();
  const board=current.view(state,helpers);
  const feedback=typeof state.feedback==='string'?{text:state.feedback,kind:'info'}:state.feedback;
  const progress=state.progress;
  const label=current.levels[level]?.label||'自由探索';
  return `<div class="workshop-shell">
    <header class="workshop-topbar">
      <button class="workshop-brand" data-global="catalog" aria-label="麻将数学工坊，打开玩法目录"><span class="brand-mark" aria-hidden="true">三</span><span><strong>数学工坊</strong><small>MAHJONG · MATHEMATICS</small></span></button>
      <button class="workshop-game-switch" data-global="catalog" aria-label="切换玩法，当前${escape(current.title)}"><small>${escape(categories[current.category]||'数学探索')}</small><strong>${escape(current.title)}</strong><span aria-hidden="true">⌄</span></button>
      <div class="workshop-top-actions">
        <a class="workshop-tool-button workshop-gallery-link" href="./tile-studio.html">认牌馆</a>
        <button class="workshop-tool-button level-switch" data-global="levels" aria-label="选择关卡，当前第${level+1}关"><span>${level+1} / ${current.levels.length}</span><span class="tool-label">${escape(label)}</span><span aria-hidden="true">⌄</span></button>
        <button class="workshop-tool-button task-switch" data-global="task" aria-label="目标与提示"><span aria-hidden="true">◇</span><span class="tool-label">目标与提示</span></button>
        <button class="workshop-tool-button primary" data-global="immersive" aria-pressed="false" title="沉浸模式（I）；Esc 返回"><span aria-hidden="true">⛶</span><span class="tool-label">沉浸</span></button>
        <button class="workshop-tool-button" data-global="settings" aria-label="材质、记录与设置" title="材质、记录与设置">•••</button>
      </div>
    </header>
    <main class="workshop-play play-page" data-game="${escape(current.id)}">
      <div class="play-header"><p class="play-goal">${escape(state.goal||current.levels[level]?.goal||current.intro)}</p><div class="play-progress">${progress?helpers.progress(progress.current,progress.total):''}<button class="play-context" data-global="instructions">怎么玩 <span aria-hidden="true">?</span></button></div></div>
      <div class="workspace"><section class="game-table" aria-label="${escape(current.title)}操作桌">
        <div class="game-surface" id="game-surface" data-family="${families[current.id]||'arrange'}">${board}</div>
        <div class="table-bottomstrip ${state.complete||['error','success'].includes(feedback?.kind)?'has-result':''}" data-feedback-kind="${escape(feedback?.kind||'info')}"><div class="feedback ${escape(feedback?.kind||'info')}" role="status" aria-live="polite"><span aria-hidden="true">${state.complete?'✓':feedback?.kind==='error'?'↺':'·'}</span><p>${escape(feedback?.text||'选一张牌，开始摆一摆。')}${state.complete?' <span class="completion-label">发现已记录</span>':''}</p>${state.complete&&level<current.levels.length-1?'<button class="btn-primary" data-global="next">下一关 →</button>':''}</div><div class="table-tools"><button data-global="undo" ${historyCount?'':'disabled'} title="撤销（⌘Z / Ctrl+Z）">↶ 撤销</button><button data-global="redo" ${futureCount?'':'disabled'} title="重做（⇧⌘Z / Ctrl+Shift+Z）">↷ 重做</button><button data-global="restart">↻ 重开</button></div></div>
      </section></div>
    </main>
  </div>`;
}

export function renderCatalog({games,profile,filter='all'}){
  return `<div class="catalog-intro"><p>选一种玩法，回到牌桌上探索。</p><span class="small-text">${games.length} 种玩法 · ${games.reduce((sum,g)=>sum+g.levels.length,0)} 个关卡</span></div><div class="category-tabs" role="group" aria-label="筛选玩法">${Object.entries(categories).map(([id,name])=>`<button data-global="filter" data-value="${id}" class="${filter===id?'active':''}" aria-pressed="${filter===id}">${name}</button>`).join('')}</div><div class="game-cards">${games.filter(g=>filter==='all'||g.category===filter).map(g=>`<button class="game-card" data-global="game" data-value="${escape(g.id)}"><div class="card-top"><span class="card-number">${escape(g.id.replace('G','').padStart(2,'0'))}</span><span class="card-grade">${escape(g.grade)}</span></div><h3>${escape(g.title)}</h3><p>${escape(g.description)}</p><div class="card-footer"><span>${escape((g.tags||[]).slice(0,2).join(' · '))}</span><span>${completed(profile,g.id)?`已发现 ${completed(profile,g.id)} / `:''}${g.levels.length} 关 ↗</span></div></button>`).join('')}</div><a class="solitaire-link" href="/solitaire.html"><span>疊</span><strong>经典麻将对对碰</strong><span>去另一张牌桌 ↗</span></a>`;
}

export function renderLevels({game,level,profile}){
  return `<p class="small-text">选择关卡会保留当前摆法，回来时可以接着玩。</p><div class="level-list">${game.levels.map((item,i)=>`<button class="level-option ${i===level?'active':''}" data-global="level" data-value="${i}" aria-current="${i===level?'step':'false'}"><span class="level-index">${String(i+1).padStart(2,'0')}</span><span class="level-copy"><strong>${escape(item.label)}</strong>${item.goal?`<small>${escape(item.goal)}</small>`:''}</span><span class="level-state">${i===level?'正在探索':found(profile,game.id,i)?'已发现 ✓':'→'}</span></button>`).join('')}</div>`;
}

export function renderTask({game,level,state,profile,hintIndex=-1,explanation=false,helpers=h}){
  const hints=game.hints?.(state)||[];
  return `<div class="goal-card"><span class="eyebrow">这一关的目标</span><p>${escape(state.goal||game.levels[level]?.goal||game.intro)}</p>${state.progress?helpers.progress(state.progress.current,state.progress.total):''}</div>
    ${state.complete?`<div class="completion-card"><h3>发现已记录</h3><p>${escape(state.discovery||'你的摆法已经通过这一关的规则检查。')}</p></div>`:''}
    <div class="hint-card"><div class="hint-heading"><h3>一点线索</h3><span>${hintIndex<0?'尚未查看':`${Math.min(hintIndex+1,hints.length)} / ${hints.length}`}</span></div><p>${escape(hintIndex<0?'卡住的时候，再打开一条线索。':hints[Math.min(hintIndex,hints.length-1)]||'整理已经摆出的结果，再看看条件。')}</p><button class="btn-secondary" data-global="hint">${hintIndex<0?'查看第一条线索':hintIndex<hints.length-1?'下一条线索':'回看第一条线索'} →</button></div>
    <div class="explanation-card"><button class="explain-toggle" data-global="explain" aria-expanded="${explanation}">${explanation?'收起思考方法 ↑':'看看一种思考方法 ↓'}</button>${explanation?`<p>${escape(game.explain?.(state)||game.intro)}</p>`:''}</div>
    <label class="note-label" for="discovery-note">记下自己的发现<textarea id="discovery-note" data-note-key="${escape(game.id)}:${level}" placeholder="我发现……" rows="4">${escape(profile.notes[`${game.id}:${level}`]||'')}</textarea></label><span class="autosave-note">自动保存在这台设备上</span>`;
}

export function renderSettings({profile,renderStatus={state:'loading'},soundEnabled=true}){
  const ready=renderStatus.state==='ready', loading=renderStatus.state==='loading';
  return `<section class="settings-group"><h3>牌的材质</h3><div class="material-picker" aria-label="牌的材质">${[['ivory','暖象牙'],['bamboo','竹制'],['porcelain','白瓷']].map(([id,label])=>`<button data-global="material" data-value="${id}" class="material-chip ${profile.material===id?'active':''}" aria-pressed="${profile.material===id}"><span class="swatch ${id}"></span><span>${label}</span></button>`).join('')}</div><button id="render-status" class="render-status" data-state="${escape(renderStatus.state)}" data-global="retry3d" ${ready?'disabled':''}>${ready?'42 种立体牌面已就绪':loading?'准备立体牌面…':'轻巧牌面模式 · 点击重试立体牌面'}</button></section>
    <section class="settings-group"><h3>声音反馈</h3><button type="button" class="btn-secondary" data-global="workshop-sound" aria-label="工坊音效" aria-pressed="${soundEnabled}">♪ 工坊音效${soundEnabled?'已开':'已关'}</button></section>
    <section class="settings-group"><h3>我的记录</h3><p class="small-text">摆法、关卡与发现会自动保存在这台设备上。</p><div class="settings-actions"><button class="btn-secondary" data-global="journal">发现集 · ${profile.discoveries.length}</button><button class="btn-secondary" data-global="export">导出记录 ↗</button><button class="btn-secondary" data-global="import">导入记录</button></div></section><section class="settings-group"><h3>操作</h3><p class="small-text">点击选牌，再点击位置；也可以用鼠标拖放。按 I 进入沉浸，Esc 返回。撤销：⌘Z / Ctrl+Z。</p><button class="explain-toggle" data-global="about">关于数学工坊 →</button></section>`;
}
