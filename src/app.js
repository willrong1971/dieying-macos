import { gamesA } from './games/group-a.js';
import { gamesB } from './games/group-b.js';
import { gamesC } from './games/group-c.js';
import { h,escape,storageRead,storageWrite,tilePreviewBase,setTilePreviewTheme } from './ui.js';
import { TileRenderer } from './tiles3d.js';
import { validateProfile } from './records.js';
import {renderWorkshop,renderCatalog,renderTask,renderLevels,renderSettings} from './workshop-view.js';
import {ImmersiveMode} from './solitaire-immersive.js';

const games=[...gamesA,...gamesB,...gamesC];
const byId=new Map(games.map(g=>[g.id,g]));
const KEY='mahjong-math-workshop:v1';
const fresh=()=>({schema:1,material:'ivory',states:{},notes:{},discoveries:[],lastGame:'G08'});
let profile=storageRead(KEY,fresh());
try{profile=validateProfile(profile,games,h);}catch{storageWrite(KEY+':recovery',profile);profile=fresh();}
if(!['ivory','bamboo','porcelain'].includes(profile.material))profile.material='ivory';
let current=null,level=0,state=null,history=[],future=[],hintIndex=-1,explanation=false,filter='all';
let toastTimer;const app=document.querySelector('#app'),dialog=document.querySelector('#dialog');
let dragGesture=null,suppressDragClick=false;
const cp=o=>JSON.parse(JSON.stringify(o));
const seed=()=>Math.floor(Math.random()*0x7fffffff);
let renderStatus={state:'loading'};
function showRenderStatus(status){
  renderStatus=status;
  const el=document.querySelector('#render-status');
  if(el){el.dataset.state=status.state;el.disabled=status.state==='ready';el.textContent=status.state==='ready'?'42 种立体牌面已就绪':status.state==='loading'?`准备立体牌面${status.percent?' · '+status.percent+'%':'…'}`:'轻巧牌面模式 · 点击重试立体牌面';}
  if(status.state==='ready')document.documentElement.dataset.modelCount=String(status.count);
}
const renderer=new TileRenderer(document.querySelector('#tile-canvas'),showRenderStatus);
const immersive=new ImmersiveMode({
  exitButton:document.querySelector('#workshop-immersive-exit'),
  onChange(active){
    document.documentElement.classList.toggle('is-workshop-immersive',active);
    syncImmersiveButton();
  },
  onResize(){renderer.resize();renderer.refresh(3);},
});
function syncImmersiveButton(){
  const button=app.querySelector('[data-global="immersive"]');
  button?.setAttribute('aria-pressed',String(immersive.active));
}
function persist(){if(!storageWrite(KEY,profile))toast('设备空间不足，可以先导出发现记录。');}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800);}
function stateKey(id=current?.id,l=level){return `${id}:${l}`;}
function remember(){if(current&&state){profile.states[stateKey()]={state:cp(state),hintIndex,explanation};profile.lastGame=current.id;}persist();}
function render({resetScroll=false}={}){
  setTilePreviewTheme(profile.material);
  const scrollYBefore=scrollY;
  // Larger collections and cabinets scroll within the table. Keep their place
  // when a move rebuilds the DOM, just as we keep the table's own scroll.
  const surface=app.querySelector('#game-surface');
  const scrollPositions=resetScroll||!surface?[]:[surface,...surface.querySelectorAll('*')].filter(el=>el.scrollLeft||el.scrollTop).map(el=>{
    const path=[];let node=el;
    while(node!==surface){path.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...node.parentElement.children].indexOf(node)+1})`);node=node.parentElement;}
    return {selector:'#game-surface'+(path.length?' > '+path.join(' > '):''),tag:el.tagName,kind:el.classList[0],left:el.scrollLeft,top:el.scrollTop};
  });
  const focus=document.activeElement;
  const marker=focus?.dataset?{global:focus.dataset.global,action:focus.dataset.action,value:focus.dataset.value,model:focus.dataset.modelId}:null;
  app.innerHTML=renderWorkshop({games,current,level,state,profile,historyCount:history.length,futureCount:future.length,helpers:h});
  syncImmersiveButton();
  for(const position of scrollPositions){const el=document.querySelector(position.selector);if(el&&el.tagName===position.tag&&(!position.kind||el.classList.contains(position.kind))){el.scrollLeft=position.left;el.scrollTop=position.top;}}
  scrollTo({top:scrollYBefore,behavior:'auto'});
  if(marker&&(marker.global||marker.action)){
    const controls=[...app.querySelectorAll('button:not(:disabled),input,select')];
    const match=controls.find(el=>marker.model?el.dataset.modelId===marker.model:el.dataset.global===marker.global&&el.dataset.action===marker.action&&el.dataset.value===marker.value)
      ||(marker.action&&controls.find(el=>el.dataset.action===marker.action&&el.dataset.value===marker.value))
      ||(marker.action&&app.querySelector('#game-surface button:not(:disabled)'));
    match?.focus({preventScroll:true});
  }
  document.body.dataset.view=current?.id||'home';renderer.refresh(3);
}
function openGame(id,l=0,{route=true,replace=false}={}){
  const g=byId.get(id);if(!g)return;
  if(dialog.open)dialog.close();
  if(current)remember();current=g;level=Math.max(0,Math.min(g.levels.length-1,Number(l)||0));
  const saved=profile.states[stateKey(id,level)];
  try{state=saved?.state?cp(saved.state):g.create(level,seed());}catch{state=g.create(level,seed());}
  if(typeof state.goal!=='string')state.goal=g.create(level,state.seed).goal||g.levels[level]?.goal||g.intro;
  hintIndex=saved?.hintIndex??-1;explanation=!!saved?.explanation;history=[];future=[];
  if(route&&location.hash!==`#${id}/${level+1}`)window.history[replace?'replaceState':'pushState'](null,'',`#${id}/${level+1}`);
  render({resetScroll:true});scrollTo({top:0});remember();
}
function commitTransition(next,before,options={}){
  state=next;history.push(before);if(history.length>60)history.shift();future=[];
  if(state.complete&&!profile.discoveries.some(d=>d.gameId===current.id&&d.level===level&&d.seed===state.seed)){
    profile.discoveries.push({gameId:current.id,title:current.title,level,seed:state.seed,time:new Date().toISOString(),hintsUsed:Math.max(0,hintIndex+1),viewedExplanation:explanation,explanation:current.explain?.(state)||'',note:profile.notes[stateKey()]||''});
  }
  remember();if(options.render!==false)render();
}
function takeAction(type,value,options={}){
  if(!current){if(type==='hero')toast('观察这张牌的花色与数字。到「三张成族」里试一试吧。');return;}
  const before=cp(state);
  try{
    const next=current.act(cp(state),{type,value});if(!next)return;
    commitTransition(next,before,options);
  }catch(error){console.error(current.id,type,error);toast('这一步暂时没有完成，原来的摆法已保留。');state=before;}
}
const dropActions=['place','cell','slot','put','box','assign','fill','sym-cell','magic-cell'];
function dropTarget(element){
  const target=element?.closest('[data-action]')||element?.closest('.slot')?.querySelector('[data-action]');
  return target&&dropActions.includes(target.dataset.action)?target:null;
}
function moveTile(from,target){
  if(!current||!target)return;const before=cp(state);
  try{let next=cp(state);if(String(next.selected)!==String(from.value))next=current.act(next,from);next=current.act(next,{type:target.dataset.action,value:target.dataset.value});commitTransition(next,before);}
  catch{state=before;toast('没有移动成功，原来的摆法已保留。');}
}
function modal(title,body,footer='',kind=''){
  const same=dialog.open&&dialog.className===`workshop-dialog ${kind}`;
  const previous=dialog.querySelector('.dialog-body')?.scrollTop||0;
  const action=same&&dialog.contains(document.activeElement)?document.activeElement.dataset.global:null;
  dialog.className=`workshop-dialog ${kind}`;
  dialog.setAttribute('aria-labelledby','dialog-title');
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${escape(title)}</h2><button data-close-dialog aria-label="关闭">×</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}`;
  if(!dialog.open)dialog.showModal();
  else if(same){
    const content=dialog.querySelector('.dialog-body');if(content)content.scrollTop=previous;
    if(action)[...dialog.querySelectorAll('[data-global]')].find(el=>el.dataset.global===action)?.focus({preventScroll:true});
  }
}
function catalog(){modal('选择玩法',renderCatalog({games,profile,filter}),'','catalog-dialog');}
function task(){modal('目标与提示',renderTask({game:current,level,state,profile,hintIndex,explanation,helpers:h}),'','task-dialog');}
function settings(){modal('材质与记录',renderSettings({profile,renderStatus}),'','settings-dialog');}
function journal(){modal('我的发现',profile.discoveries.length?`<p class="small-text">每一次新的尝试，都值得留下来。</p><div class="journal-list">${profile.discoveries.slice().reverse().map(d=>`<article><span>${escape(d.gameId)} · 第${d.level+1}关</span><h3>${escape(d.title)}</h3><p>${escape(d.explanation)}</p>${d.note?`<blockquote>${escape(d.note)}</blockquote>`:''}<small>${new Date(d.time).toLocaleDateString('zh-CN')} ${d.viewedExplanation?'· 看过思考方法':'· 自己动手的发现'}</small></article>`).join('')}</div>`:'<div class="empty-journal"><span>✧</span><h3>发现，从第一张牌开始。</h3><p>完成一关后，你的方法就会留在这里。</p></div>','<button class="btn-secondary" data-global="export">导出全部记录</button>');}
function download(){remember();const blob=new Blob([JSON.stringify({app:'mahjong-math-workshop',exportedAt:new Date().toISOString(),profile},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='麻将数学工坊_我的发现.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('发现记录已导出。');}
async function globalAction(action,value){
  switch(action){
    case 'home':case 'drawer':case 'browse':case 'catalog':catalog();break;
    case 'game':dialog.close();openGame(value);break;
    case 'filter':filter=value;catalog();break;
    case 'levels':modal('选择关卡',renderLevels({game:current,level,profile}),'','levels-dialog');break;
    case 'task':task();break;
    case 'settings':settings();break;
    case 'immersive':void immersive.toggle();break;
    case 'material':if(['ivory','bamboo','porcelain'].includes(value)){profile.material=value;persist();render();settings();renderer.setTheme(value);}break;
    case 'retry3d':renderer.setTheme(profile.material);break;
    case 'level':dialog.close();openGame(current.id,Number(value));break;
    case 'next':dialog.close();openGame(current.id,level+1);break;
    case 'undo':if(history.length){future.push(cp(state));state=history.pop();remember();render();}break;
    case 'redo':if(future.length){history.push(cp(state));state=future.pop();remember();render();}break;
    case 'restart':modal('重新摆这一关',`<p>这一关的摆法和图鉴会重新开始，已经写下的发现会保留。</p>`,`<button class="btn-secondary" data-close-dialog>继续想想</button><button class="btn-primary" data-global="confirm-restart">重新开始</button>`);break;
    case 'confirm-restart':dialog.close();history.push(cp(state));future=[];state=current.create(level,seed());hintIndex=-1;explanation=false;remember();render();break;
    case 'hint':{const list=current?.hints?.(state)||[];hintIndex=hintIndex>=list.length-1?0:hintIndex+1;remember();task();break;}
    case 'explain':explanation=!explanation;remember();task();break;
    case 'instructions':modal(current.title,`<p class="instruction-copy">${escape(current.intro)}</p><h3>先这样试一试</h3><p>${escape((current.hints?.(state)||[])[0]||'点选一张牌，再点它要去的位置。')}</p><div class="instruction-methods"><span>① 观察</span><span>② 动手</span><span>③ 整理</span><span>④ 说说为什么</span></div>`);break;
    case 'about':modal('一桌牌，许多种可能','<p>麻将数学工坊，把传统牌面的花色和数字变成可以动手研究的数学。</p><p>这里有分类、计数、摆阵、路线、实验和策略。你可以一个人探索，也可以和家人轮流操作、互相提问。</p><p>三套立体牌面来自本项目的原创 Blender 牌组。记录保存在本机，也可以导出带走。</p>');break;
    case 'journal':journal();break;
    case 'export':download();break;
    case 'import':document.querySelector('#import-file').click();break;
  }
}
document.addEventListener('click',e=>{
  if(suppressDragClick){e.preventDefault();e.stopPropagation();return;}
  if(e.target.closest('[data-close-dialog]')){dialog.close();return;}
  const global=e.target.closest('[data-global]');if(global){globalAction(global.dataset.global,global.dataset.value);return;}
  const target=e.target.closest('[data-action]');if(target&&!['INPUT','SELECT','TEXTAREA'].includes(target.tagName)){e.preventDefault();takeAction(target.dataset.action,target.dataset.value);}
});
app.addEventListener('change',e=>{const el=e.target;if(el.matches('input[data-action]:not([type="number"]),select[data-action]'))takeAction(el.dataset.action,el.type==='checkbox'?(el.checked?'1':'0'):el.value);});
document.addEventListener('input',e=>{
  if(e.target.matches('input[type="number"][data-action]'))takeAction(e.target.dataset.action,e.target.value,{render:false});
  if(e.target.id==='discovery-note'&&e.target.dataset.noteKey===stateKey()){profile.notes[stateKey()]=e.target.value;for(const d of profile.discoveries){if(d.gameId===current.id&&d.level===level)d.note=e.target.value;}persist();}
});
app.addEventListener('submit',e=>e.preventDefault());
app.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.tile[data-action]');
  if(!current||!el||el.disabled||e.button!==0||e.pointerType==='touch')return;
  dragGesture={from:{type:el.dataset.action,value:el.dataset.value},face:el.dataset.face,x:e.clientX,y:e.clientY,active:false};
});
document.addEventListener('pointermove',e=>{
  if(!dragGesture)return;
  if(!dragGesture.active&&Math.hypot(e.clientX-dragGesture.x,e.clientY-dragGesture.y)<9)return;
  dragGesture.active=true;e.preventDefault();
  let ghost=document.querySelector('#tile-ghost');
  if(!ghost){ghost=document.createElement('div');ghost.id='tile-ghost';const image=document.createElement('img');image.src=tilePreviewBase+dragGesture.face+'.png';ghost.append(image);document.body.append(ghost);}
  ghost.style.transform=`translate(${e.clientX-29}px,${e.clientY-43}px)`;
  document.querySelectorAll('.drag-target').forEach(el=>el.classList.remove('drag-target'));
  dropTarget(document.elementFromPoint(e.clientX,e.clientY))?.closest('.slot')?.classList.add('drag-target');
},{passive:false});
document.addEventListener('pointerup',e=>{
  if(!dragGesture)return;const gesture=dragGesture;dragGesture=null;
  document.querySelector('#tile-ghost')?.remove();document.querySelectorAll('.drag-target').forEach(el=>el.classList.remove('drag-target'));
  if(gesture.active){suppressDragClick=true;setTimeout(()=>{suppressDragClick=false;},0);moveTile(gesture.from,dropTarget(document.elementFromPoint(e.clientX,e.clientY)));}
});
document.addEventListener('pointercancel',()=>{dragGesture=null;document.querySelector('#tile-ghost')?.remove();document.querySelectorAll('.drag-target').forEach(el=>el.classList.remove('drag-target'));});
app.addEventListener('dragstart',e=>{const el=e.target.closest('.tile');if(el)e.dataTransfer.setData('application/json',JSON.stringify({type:el.dataset.action,value:el.dataset.value}));});
app.addEventListener('dragover',e=>{if(e.target.closest('.slot,[data-action="place"],[data-action="cell"],[data-action="sym-cell"],[data-action="magic-cell"]'))e.preventDefault();});
app.addEventListener('drop',e=>{
  const target=dropTarget(e.target);if(!current||!target)return;e.preventDefault();
  try{moveTile(JSON.parse(e.dataTransfer.getData('application/json')),target);}catch{}
});
document.querySelector('#import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>5_000_000)throw new Error('too large');const data=JSON.parse(await file.text());const p=data.profile;
    if(data.app!=='mahjong-math-workshop')throw new Error('format');
    const imported=validateProfile(p,games,h);
    profile=imported;current=null;state=null;persist();dialog.close();openGame(byId.has(profile.lastGame)?profile.lastGame:'G08',0,{replace:true});renderer.setTheme(profile.material);toast('发现记录已导入。');
  }catch{toast('这份记录无法导入，请选择工坊导出的完整 JSON 记录。');}
  e.target.value='';
});
addEventListener('keydown',e=>{
  if(e.defaultPrevented||dialog.open||e.target.isContentEditable||e.target.closest?.('input,textarea,select'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();globalAction(e.shiftKey?'redo':'undo');}
});
addEventListener('popstate',()=>{
  const m=location.hash.match(/^#(G\d+(?:A|B)?)(?:\/(\d+))?$/);
  if(m&&byId.has(m[1]))openGame(m[1],Number(m[2]||1)-1,{route:false});
  else{openGame(byId.has(profile.lastGame)?profile.lastGame:'G08',0,{route:false});catalog();}
});
const initial=location.hash.match(/^#(G\d+(?:A|B)?)(?:\/(\d+))?$/);
if(initial&&byId.has(initial[1]))openGame(initial[1],Number(initial[2]||1)-1,{route:false});
else openGame(byId.has(profile.lastGame)?profile.lastGame:'G08',0,{replace:true});
renderer.setTheme(profile.material);
