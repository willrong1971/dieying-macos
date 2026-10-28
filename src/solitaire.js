import {layouts,createGame,isFree,getFreeTiles,getMatches,matchKey,reshuffleGame,validateSavedGame} from './solitaire-engine.js';
import {SolitaireRenderer} from './solitaire-renderer.js';
import {escape,tileLabel} from './ui.js';
import {SolitaireVoice} from './solitaire-voice.js';
import {TileSounds} from './solitaire-sounds.js';
import {ImmersiveMode} from './solitaire-immersive.js';
import {selectTile} from './solitaire-selection.js';

const KEY='mahjong-solitaire:v1',THEMES=['ivory','bamboo','porcelain'];
const $=selector=>document.querySelector(selector),copy=value=>JSON.parse(JSON.stringify(value));
const extraNames={flower_plum:'梅',flower_orchid:'兰',flower_chrysanthemum:'菊',flower_bamboo:'竹',season_spring:'春',season_summer:'夏',season_autumn:'秋',season_winter:'冬'};
const label=face=>extraNames[face]||tileLabel(face);
const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0]||1;
const timeText=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
const preview=face=>`/public/tiles/${theme==='ivory'?'ivory-warm':'v2'}/${face}.png`;
let game,initialTiles,theme='ivory',history=[],elapsed=0,hints=0,shuffles=0,started=false,paused=false,selected=null,hint=[],showFree=false,keyboard=false,ready=false,fallback=false;
let renderer=null,lastTick=Date.now(),dialogKind='',dialogLayout='turtle',hintCursor=0,finishedShown=false;
const dialog=$('#game-dialog');
const voice=new SolitaireVoice(status=>{
  $('#voice-button').setAttribute('aria-pressed',String(status.enabled));$('#voice-button').textContent=status.enabled?'♪ 配音已开':'♪ 开启配音';
  $('#voice-button').title=status.error||(status.enabled?'点击关闭配音':'开启本地模型生成的普通话配音');
  $('#voice-caption').hidden=!status.playing;$('#voice-subtitle').textContent=status.text;
},$('#voice-audio'));
const sounds=new TileSounds(status=>{
  $('#tile-sound-button').setAttribute('aria-pressed',String(status.enabled));$('#tile-sound-button').setAttribute('aria-label',status.enabled?'关闭碰牌声':'开启碰牌声');
  $('#tile-sound-button').dataset.playing=String(status.playing);$('#tile-sound-button').dataset.clip=status.clip;
  $('#tile-sound-button').dataset.kind=status.kind;
  $('#tile-sound-button').title=status.error||(status.enabled?'碰牌声已开':'碰牌声已关');
});
function fresh(layout,seed){game=createGame(layout,seed);initialTiles=copy(game.tiles);history=[];elapsed=0;hints=0;shuffles=0;started=false;paused=false;selected=null;hint=[];hintCursor=0;finishedShown=false;}
function restore(){
  try{
    const saved=JSON.parse(localStorage.getItem(KEY));
    if(!saved||saved.schema!==1||!validateSavedGame(saved.game)||!validateSavedGame({...saved.game,tiles:saved.initialTiles})||saved.initialTiles.some(tile=>tile.removed)||!THEMES.includes(saved.theme)||!Number.isInteger(saved.elapsed)||saved.elapsed<0||saved.elapsed>31536000||!Number.isInteger(saved.hints)||saved.hints<0||!Number.isInteger(saved.shuffles)||saved.shuffles<0)return false;
    game=saved.game;initialTiles=saved.initialTiles;theme=saved.theme;elapsed=saved.elapsed;hints=saved.hints;shuffles=saved.shuffles;started=!!saved.started;
    // Every undo state is checked before it may replace the current board.
    history=Array.isArray(saved.history)?saved.history.slice(-80).filter(item=>item&&validateSavedGame({...game,tiles:item.tiles,boardMode:item.boardMode||'original'})&&(!item.attempt||['elapsed','hints','shuffles'].every(key=>Number.isInteger(item.attempt[key])&&item.attempt[key]>=0))):[];
    return true;
  }catch{return false;}
}
const params=new URLSearchParams(location.search);
const requestedLayout=params.get('layout'),requestedSeed=params.get('seed');
const validRequest=layouts.some(item=>item.id===requestedLayout)&&/^\d{1,10}$/.test(requestedSeed||'')&&Number(requestedSeed)>0&&Number(requestedSeed)<=4294967295;
const restored=restore();
const resumed=restored&&(!validRequest||(game.layoutId===requestedLayout&&game.seed===Number(requestedSeed)));
if(!resumed)fresh(validRequest?requestedLayout:'turtle',validRequest?Number(requestedSeed):randomSeed());
sounds.preload(theme);
function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({schema:1,game,initialTiles,theme,history,elapsed,hints,shuffles,started}));$('#save-status').textContent='本机自动续局';}
  catch{$('#save-status').textContent='暂未保存，请留在本页';}
}
let feedbackTimer;
function message(text,{notify=false,tone='info'}={}){
  // Only one live region announces a move; the visual on-table copy is used
  // for immersive play, where the regular status line is hidden.
  $('#message').setAttribute('aria-live',notify?'off':'polite');$('#message').textContent=text;
  const notice=$('#board-feedback');clearTimeout(feedbackTimer);notice.hidden=true;
  if(notify){notice.textContent=text;notice.dataset.kind=tone;notice.hidden=false;feedbackTimer=setTimeout(()=>{notice.hidden=true;},2400);}
}
function remaining(){return game.tiles.filter(tile=>!tile.removed);}
function snapshot(){return {tiles:copy(game.tiles),solution:copy(game.solution||[]),boardMode:game.boardMode||'original'};}
function pushHistory(){history.push(snapshot());if(history.length>80)history.shift();}
function interactionAllowed(){return !paused&&ready&&!dialog.open&&remaining().length>0;}
function startClock(){if(!started){started=true;lastTick=Date.now();}}
function highlight(){renderer?.setHighlights({selected,hint,free:getFreeTiles(game.tiles).map(tile=>tile.id),showFree});if(fallback)renderFallback();}
function updateSelection(){
  const choice=game.tiles.find(tile=>tile.id===selected);
  $('#selected-preview').className=choice?'':'selection-empty';
  $('#selected-preview').innerHTML=choice?`<img src="${preview(choice.face)}" alt=""><strong>${escape(label(choice.face))}<small>第 ${choice.z+1} 层</small></strong>`:'<span>两张相配，一起移开。</span>';
  $('#selection-caption').textContent=choice?'保留这张牌，再选配对牌；再点它或桌面空白处取消。':'先观察高处和两侧的牌。';
  highlight();renderKeyboard();updateSelectionMarker();
}
function updateSelectionMarker(){
  const marker=$('#selected-tile-marker');if(!marker)return;
  if(selected===null||paused||!ready){marker.hidden=true;return;}
  const bounds=fallback?$('#fallback-board')?.querySelector(`[data-board-id="${CSS.escape(selected)}"]`)?.getBoundingClientRect():renderer?.getTileScreenBounds?.(selected);
  const stage=$('#board-stage').getBoundingClientRect();
  if(!bounds||bounds.right<stage.left||bounds.left>stage.right||bounds.bottom<stage.top||bounds.top>stage.bottom){marker.hidden=true;return;}
  marker.hidden=false;
  const half=marker.offsetWidth/2+5;
  marker.style.left=`${Math.max(half,Math.min(stage.width-half,bounds.right-stage.left-4))}px`;
  marker.style.top=`${Math.max(marker.offsetHeight+7,bounds.top-stage.top+3)}px`;
}
function stopRejectionVoice(){if(['mismatch','blocked-top','blocked-sides'].includes(voice.current))voice.stop();}
function update(){
  const layout=layouts.find(item=>item.id===game.layoutId),alive=remaining(),pairs=getMatches(game.tiles);
  document.body.dataset.layout=game.layoutId;document.body.dataset.seed=String(game.seed);document.body.dataset.remaining=String(alive.length);document.body.dataset.material=theme;
  $('#layout-title').textContent=layout.name;$('#layout-description').textContent=layout.description;
  $('#deal-number').textContent=String(game.seed).padStart(8,'0');$('#remaining-count').textContent=alive.length;$('#total-count').textContent=` / ${game.tiles.length}`;$('#pair-count').textContent=String(pairs.length);$('#timer').textContent=timeText(elapsed);
  $('#assist-count').textContent=`提示 ${hints} · 洗牌 ${shuffles}`;
  $('#undo-button').disabled=!history.length||paused||!ready;$('#hint-button').disabled=!pairs.length||paused||!ready;$('#shuffle-button').disabled=!alive.length||paused||!ready;
  $('#deadlock-panel').hidden=!alive.length||pairs.length>0||paused||!ready;
  $('#deadlock-shuffle').disabled=paused||!ready;
  $('#deadlock-undo').disabled=!history.length||paused||!ready;
  $('#free-button').setAttribute('aria-pressed',String(showFree));
  document.querySelectorAll('[data-material]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.material===theme)));
  $('#pause-panel').hidden=!paused;$('#pause-button').setAttribute('aria-label',paused?'继续游戏':'暂停游戏');$('#pause-button').textContent=paused?'▷':'Ⅱ';
  $('#solitaire-canvas').setAttribute('aria-hidden',String(paused));$('#keyboard-panel').hidden=!keyboard||paused;
  renderer?.setTiles(game.tiles,{frameRemaining:game.boardMode==='open'});renderer?.setPaused(paused);updateSelection();
  if(!alive.length&&!finishedShown){finishedShown=true;window.setTimeout(showWin,250);}
}
function chooseTile(id){
  if(!interactionAllowed())return;
  const result=selectTile(game.tiles,selected,id);
  if(result.kind==='ignored'){if(selected!==result.selected){selected=result.selected;updateSelection();}return;}
  if(result.kind==='clear'){
    selected=null;hint=[];updateSelection();stopRejectionVoice();message('已取消选择。');return;
  }
  startClock();
  if(result.kind==='blocked'){
    selected=result.selected;
    const covered=result.reason==='covered';
    sounds.play(theme,'mismatch');
    message(covered?'这张牌上方还有牌。先移开覆盖它的牌。':'这张牌左右两侧都被挡住了。先打开一侧。',{notify:true,tone:'blocked'});
    voice.play(covered?'blocked-top':'blocked-sides');return;
  }
  if(result.kind==='mismatch'){
    // Keep the first tile as the anchor. There is no delay or pending second
    // selection, so the very next click can try another partner immediately.
    selected=result.selected;hint=[];updateSelection();
    const anchor=game.tiles.find(tile=>tile.id===selected);
    sounds.play(theme,'mismatch');
    message(`这两张不相配，仍保留${label(anchor.face)}。继续为它选一张配对牌。`,{notify:true,tone:'mismatch'});
    voice.play('mismatch');return;
  }
  const tile=game.tiles.find(item=>item.id===id);
  if(result.kind==='pair'){
    stopRejectionVoice();
    sounds.play(theme,'pair');
    const name=label(tile.face);pushHistory();game.tiles=result.tiles;selected=null;hint=[];hintCursor=0;
    update();persist();
    const count=remaining().length,pairs=getMatches(game.tiles).length;
    message(count===0?'整座牌阵已清空。':pairs===0?'暂时没有可配对的牌。可以撤销，换一种次序，或洗牌继续。':`已移开一对${matchKey(tile.face)==='flowers'?'花牌':matchKey(tile.face)==='seasons'?'季牌':name}。还剩 ${count} 张。`);
    if(count===0)voice.play('win');else if(pairs===0)voice.play('no-moves');return;
  }
  selected=result.selected;hint=[];updateSelection();
  stopRejectionVoice();sounds.play(theme,'pick');message(`已选${label(tile.face)}。寻找另一张相配的可取牌。`);persist();
}
function renderKeyboard(){
  if(!keyboard)return;
  const focused=document.activeElement?.dataset.tileId;
  const tiles=getFreeTiles(game.tiles).sort((a,b)=>b.z-a.z||a.y-b.y||a.x-b.x);
  $('#free-tiles').innerHTML=tiles.map(tile=>`<button data-tile-id="${escape(tile.id)}" data-face="${escape(tile.face)}" data-hint="${hint.includes(tile.id)}" aria-pressed="${selected===tile.id}" aria-label="${escape(label(tile.face))}，第${tile.z+1}层，位置${game.tiles.indexOf(tile)+1}"><img src="${preview(tile.face)}" alt=""><span>${escape(label(tile.face))} · ${tile.z+1}层</span></button>`).join('');
  if(focused)document.querySelector(`[data-tile-id="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
}
function renderFallback(){
  if(!fallback)return;
  const framing=game.boardMode==='open'&&remaining().length?remaining():game.tiles;
  const xs=framing.map(tile=>tile.x),ys=framing.map(tile=>tile.y),minX=Math.min(...xs),minY=Math.min(...ys),cols=Math.max(...xs)-minX+1,rows=Math.max(...ys)-minY+1;
  const width=$('#board-stage').clientWidth,height=$('#board-stage').clientHeight,unit=Math.min((width-42)/(cols+.6),(height-45)/(rows*40/29+.9));
  const left=(width-cols*unit)/2,top=(height-rows*unit*40/29)/2;
  $('#fallback-board').innerHTML=remaining().map(tile=>`<button data-board-id="${escape(tile.id)}" data-selected="${selected===tile.id}" aria-pressed="${selected===tile.id}" data-hint="${hint.includes(tile.id)}" data-free="${showFree&&isFree(game.tiles,tile.id)}" aria-label="${escape(label(tile.face))}" style="left:${left+(tile.x-minX)*unit-tile.z*unit*.045}px;top:${top+(tile.y-minY)*unit*40/29-tile.z*unit*.12}px;width:${unit*.98}px;height:${unit*40/29*.98}px;z-index:${Math.round(tile.z*1000+tile.y*20+tile.x)}"><img src="${preview(tile.face)}" alt=""></button>`).join('');
}
function setFallback(){fallback=true;ready=true;$('#fallback-board').hidden=false;$('#solitaire-canvas').hidden=true;$('#loading-panel').hidden=true;$('#render-status').textContent='轻巧牌面模式';update();}
function statusChanged(status){
  if(status.state==='ready'){
    ready=true;fallback=false;$('#fallback-board').hidden=true;$('#solitaire-canvas').hidden=false;$('#loading-panel').hidden=true;$('#render-status').textContent='42 种立体牌面已就绪';document.body.dataset.modelsReady='true';update();
  }else if(status.state==='loading'){
    ready=false;$('#loading-panel').hidden=false;$('#loading-copy').textContent=`正在准备${theme==='ivory'?'暖象牙':theme==='bamboo'?'竹制':'白瓷'}牌面…`;$('#load-progress').hidden=!status.percent;$('#load-progress').value=status.percent||0;$('#render-status').textContent='立体牌面准备中';
    for(const id of ['hint-button','undo-button','shuffle-button','deadlock-shuffle','deadlock-undo'])$('#'+id).disabled=true;
    $('#deadlock-panel').hidden=true;
  }else{setFallback();message('当前采用轻巧牌面，玩法与存档照常可用。');}
}
try{
  renderer=new SolitaireRenderer({
    canvas:$('#solitaire-canvas'),onTileClick:chooseTile,onStatus:statusChanged,
    onViewChange:view=>{
      const canvas=$('#solitaire-canvas');
      canvas.dataset.azimuth=(view.azimuth*180/Math.PI).toFixed(1);
      canvas.dataset.elevation=(90-view.polar*180/Math.PI).toFixed(1);
      canvas.dataset.zoom=view.zoom.toFixed(3);updateSelectionMarker();
    },
  });
  renderer.setTiles(game.tiles);renderer.setMaterial(theme).catch(()=>setFallback());
}catch(error){console.error('Solitaire renderer:',error);setFallback();}
function modal(title,body,actions='',kind='info'){
  dialogKind=kind;dialog.innerHTML=`<div class="dialog-top"><h2>${escape(title)}</h2><button data-close aria-label="关闭对话框">×</button></div>${body}${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
  if(!dialog.open)dialog.showModal();lastTick=Date.now();
}
function closeDialog(){dialog.close();dialogKind='';lastTick=Date.now();}
function showNewGame(){
  dialogLayout=game.layoutId;
  modal('换一座牌阵',`<p class="dialog-copy">新牌局均可解。相同布局与编号，会得到相同的初始牌面。</p><div class="layout-options">${layouts.map(layout=>`<button class="layout-option" data-layout="${layout.id}" aria-pressed="${layout.id===dialogLayout}"><b>${escape(layout.name)}</b><small>${layout.count} 张 · ${layout.layers} 层</small></button>`).join('')}</div><label class="seed-label" for="seed-input">牌局编号（留空随机）<input id="seed-input" inputmode="numeric" pattern="[0-9]*" maxlength="10" placeholder="例如 20261027"><small>1 至 4294967295。当前进度将被新牌局替换。</small></label><p id="seed-error" class="dialog-error" role="alert"></p>`,`<button class="dialog-secondary" data-close>继续当前局</button><button class="dialog-primary" data-start>开始新局 →</button>`,'new');
}
function beginNew(){
  const text=$('#seed-input').value.trim();
  if(text&&!/^\d{1,10}$/.test(text)||text&&(Number(text)<1||Number(text)>4294967295)){$('#seed-error').textContent='请输入 1 至 4294967295 的整数，或留空随机。';return;}
  fresh(dialogLayout,text?Number(text):randomSeed());closeDialog();window.history.replaceState(null,'',location.pathname);update();renderer?.resetView();persist();message('新牌阵已摆好。从高处和边缘，找第一对。');voice.play('new-game');
}
function showRules(){
  modal('拆开一座牌阵',`<div class="dialog-copy"><p>这是经典的单人麻将消除，玩法参照 <a href="https://apps.gnome.org/Mahjongg/" target="_blank" rel="noopener">GNOME Mahjongg</a>。</p><ol><li>点选<strong>两张相配的可取牌</strong>，将它们一起移走。不相配时保留第一张，继续为它找配对牌。再点第一张或桌面空白处，即可取消选择。</li><li>一张牌必须<strong>上方没有任何牌覆盖</strong>，并且<strong>同层左、右至少一侧空出</strong>。上下方向空出不算。</li><li>萬、条、筒、风牌和三元牌须<strong>牌面完全相同</strong>。梅兰竹菊可互配，春夏秋冬可互配；花与季不能互配。</li><li>全部清空即完成。初始牌局有解，但不同取牌次序可能进入死局。洗牌优先保留剩余位置与牌种；如果位置本身已无法拆开，会把剩余牌重新摆成可解的牌阵，已消除的牌不会回来。</li></ol><p><strong>快捷键：</strong>I 沉浸牌桌 · Esc 退出沉浸（普通界面取消选择）· H 提示 · S 洗牌 · Z 撤销 · F 标出可取牌 · P 暂停 · ＋/－ 缩放 · 0 视角复位。提示只指出当前合法的一对，不保证后续能全部消完。</p><p><strong>视角操作：</strong>左键拖动可环绕牌阵，上下拖动调整俯仰；滚轮缩放，Shift加左键或右键、中键拖动平移。点击仍用于选牌，按0恢复初始视角。转动只改变观察方向，不改变可取牌规则。</p><p>计时从第一次取牌或提示开始，暂停、切换页面、查看对话框及载入模型时不计时。进度只保存在本浏览器，自动续局。</p><p>普通话配音由本机 Qwen3-TTS 生成，音频已保存在项目内。首次点“开启配音”后播报；关闭即静音。无需在线语音服务。</p></div>`,'<button class="dialog-secondary" data-voice-rules>▶ 听规则</button><button class="dialog-primary" data-close>回到牌桌</button>');
}
function showWin(){
  if(remaining().length)return;
  modal('一桌清净。',`<span class="winning-mark" aria-hidden="true">清</span><p class="dialog-copy" style="text-align:center">${escape(layouts.find(layout=>layout.id===game.layoutId).name)} · ${game.tiles.length} 张，全部移开。</p><div class="win-stats"><div><strong>${timeText(elapsed)}</strong>用时</div><div><strong>${hints}</strong>提示</div><div><strong>${shuffles}</strong>洗牌</div></div><p class="dialog-copy" style="text-align:center">牌局编号 ${game.seed} · ${hints||shuffles?'借助工具完成':'未使用提示与洗牌'}</p>`,'<button class="dialog-secondary" data-close>看看空桌</button><button class="dialog-primary" data-another>再开一局 →</button>','win');
}
function undo(){
  if(!history.length||paused||!ready)return;
  const previous=history.pop();game.tiles=previous.tiles;game.solution=previous.solution||[];game.boardMode=previous.boardMode||'original';
  if(previous.attempt){elapsed=previous.attempt.elapsed;hints=previous.attempt.hints;shuffles=previous.attempt.shuffles;started=!!previous.attempt.started;}
  selected=null;hint=[];finishedShown=false;lastTick=Date.now();update();persist();message(previous.attempt?'已回到重玩之前的牌局与计时。':'已撤销上一步。提示与洗牌次数保留。');
}
function showHint(){
  if(!interactionAllowed())return;
  const pairs=getMatches(game.tiles);if(!pairs.length)return;
  startClock();hint=pairs[hintCursor++%pairs.length];selected=null;hints++;update();persist();message('蓝色轮廓标出当前可配的一对。也可以继续寻找其他选择。');voice.play('hint');
}
function shuffle(){
  if(!interactionAllowed())return;
  const result=reshuffleGame(game,randomSeed());
  if(!result){message('这次洗牌没有完成，原牌局已保留，请再试一次。');return;}
  startClock();pushHistory();game.tiles=result.tiles;game.solution=result.solution;game.boardMode=result.boardMode;shuffles++;selected=null;hint=[];hintCursor=0;update();persist();
  message(result.rearranged?'剩余牌已重新摆成可解的牌阵，牌种与进度保留；也可以撤销。':'剩余牌已重新排面，位置与牌种保留。这次排列有解，也可以撤销。');voice.play('shuffle');
}
function pause(){if(!ready||!remaining().length)return;paused=!paused;if(paused){voice.stop();sounds.stop();}lastTick=Date.now();update();persist();}
$('#voice-button').addEventListener('click',()=>voice.toggle());$('#voice-stop').addEventListener('click',()=>voice.stop());
$('#tile-sound-button').addEventListener('click',()=>{sounds.toggle();if(sounds.enabled&&!paused)sounds.play(theme,'pair');});
$('#hint-button').addEventListener('click',showHint);$('#undo-button').addEventListener('click',undo);$('#shuffle-button').addEventListener('click',shuffle);
$('#deadlock-shuffle').addEventListener('click',shuffle);$('#deadlock-undo').addEventListener('click',undo);
$('#new-button').addEventListener('click',showNewGame);$('#deal-button').addEventListener('click',()=>{showNewGame();$('#seed-input').value=String(game.seed);});$('#rules-button').addEventListener('click',showRules);
$('#restart-button').addEventListener('click',()=>modal('重玩这一局',`<p class="dialog-copy">恢复编号 ${game.seed} 的初始牌面，并重新计时。当前走法将保留为一步撤销。</p>`,'<button class="dialog-secondary" data-close>继续当前局</button><button class="dialog-primary" data-restart>重玩本局</button>','restart'));
$('#pause-button').addEventListener('click',pause);$('#resume-button').addEventListener('click',pause);
$('#free-button').addEventListener('click',()=>{showFree=!showFree;highlight();$('#free-button').setAttribute('aria-pressed',String(showFree));});
$('#keyboard-button').addEventListener('click',()=>{keyboard=!keyboard;$('#keyboard-button').setAttribute('aria-expanded',String(keyboard));$('#keyboard-panel').hidden=!keyboard||paused;renderKeyboard();});
$('#free-tiles').addEventListener('click',event=>{const button=event.target.closest('[data-tile-id]');if(button)chooseTile(button.dataset.tileId);});
$('#fallback-board').addEventListener('click',event=>{const button=event.target.closest('[data-board-id]');if(button)chooseTile(button.dataset.boardId);else chooseTile(null);});
document.querySelectorAll('[data-material]').forEach(button=>button.addEventListener('click',()=>{
  if(theme===button.dataset.material)return;theme=button.dataset.material;sounds.preload(theme);persist();update();if(renderer)renderer.setMaterial(theme).catch(()=>setFallback());else setFallback();
}));
$('#zoom-in').addEventListener('click',()=>renderer?.zoomBy(1.15));$('#zoom-out').addEventListener('click',()=>renderer?.zoomBy(1/1.15));$('#reset-view').addEventListener('click',()=>renderer?.resetView());
const immersive=new ImmersiveMode({
  button:$('#immersive-button'),exitButton:$('#exit-immersive'),
  onChange:active=>{document.body.dataset.immersive=String(active);},
  onResize:()=>{renderer?.resize();if(fallback)renderFallback();},
});
$('#fullscreen-button').addEventListener('click',()=>immersive.toggle());
dialog.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-close'))closeDialog();
  else if(button.hasAttribute('data-voice-rules')){voice.setEnabled(true);voice.play('rules');}
  else if(button.dataset.layout){dialogLayout=button.dataset.layout;dialog.querySelectorAll('[data-layout]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.layout===dialogLayout)));}
  else if(button.hasAttribute('data-start'))beginNew();
  else if(button.hasAttribute('data-another'))showNewGame();
  else if(button.hasAttribute('data-restart')){
    const previous={...snapshot(),attempt:{elapsed,hints,shuffles,started}};game=createGame(game.layoutId,game.seed);initialTiles=copy(game.tiles);history=[previous];elapsed=0;hints=0;shuffles=0;started=false;paused=false;selected=null;hint=[];finishedShown=false;closeDialog();update();persist();message('已恢复初始牌面。试试另一条拆解路线。');
  }
});
dialog.addEventListener('cancel',()=>{dialogKind='';lastTick=Date.now();});
dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&dialogKind==='new'&&event.target.id==='seed-input'){event.preventDefault();beginNew();}});
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.repeat||dialog.open||['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(event.target.tagName)&&event.key==='Enter')return;
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
  const key=event.key.toLowerCase();
  if(key==='h'){event.preventDefault();showHint();}else if(key==='s'){event.preventDefault();shuffle();}else if(key==='z'){event.preventDefault();undo();}else if(key==='f'){event.preventDefault();$('#free-button').click();}else if(key==='p'){event.preventDefault();pause();}else if(['+','='].includes(key)){event.preventDefault();renderer?.zoomBy(1.15);}else if(['-','_'].includes(key)){event.preventDefault();renderer?.zoomBy(1/1.15);}else if(key==='0'){event.preventDefault();renderer?.resetView();}else if(key==='escape'){selected=null;hint=[];updateSelection();stopRejectionVoice();message('已取消选择。');}
});
setInterval(()=>{
  const now=Date.now(),seconds=Math.floor((now-lastTick)/1000);
  if(seconds>0){lastTick+=seconds*1000;if(started&&!paused&&!document.hidden&&!dialog.open&&ready&&remaining().length){elapsed+=seconds;$('#timer').textContent=timeText(elapsed);if(elapsed%10===0)persist();}}
},250);
document.addEventListener('visibilitychange',()=>{lastTick=Date.now();if(document.hidden){voice.stop();sounds.stop();}persist();});window.addEventListener('pagehide',()=>{voice.stop();sounds.stop();persist();});window.addEventListener('resize',()=>{if(fallback)renderFallback();});
update();persist();
if(resumed&&remaining().length)message('已续上本机保存的牌局。慢慢看，再走下一步。');
