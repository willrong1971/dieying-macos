import test from 'node:test';
import assert from 'node:assert/strict';
import {ImmersiveMode} from '../src/solitaire-immersive.js';

class Surface{
  constructor(){this.listeners=new Map();this.attributes={};this.hidden=false;this.inert=false;this.isConnected=true;const classes=new Set();this.classList={add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v)),contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)};}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  dispatch(type,event={}){for(const handler of this.listeners.get(type)||[])handler(event);}
  setAttribute(name,value){this.attributes[name]=value;}
  focus(options){this.focusOptions=options;this.focused=true;}
}
function environment(mode='supported'){
  const document=new Surface(),root=new Surface(),button=new Surface(),exitButton=new Surface(),changes=[],timers=new Map(),frames=new Map();
  let serial=0,resizes=0,requests=0,exits=0;
  const window={scrollX:9,scrollY:321,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),scrollTo(value){this.restoredScroll=value;}};
  root.ownerDocument=document;document.defaultView=window;document.fullscreenElement=null;document.activeElement=button;document.querySelector=()=>null;
  if(mode!=='unsupported')root.requestFullscreen=()=>{requests++;if(mode==='rejected')return Promise.reject(new Error('Unavailable'));document.fullscreenElement=root;document.dispatch('fullscreenchange');return Promise.resolve();};
  document.exitFullscreen=()=>{exits++;document.fullscreenElement=null;document.dispatch('fullscreenchange');return Promise.resolve();};
  const controller=new ImmersiveMode({root,button,exitButton,onChange:on=>changes.push(on),onResize:()=>resizes++});
  return{controller,document,root,button,exitButton,window,changes,timers,frames,get requests(){return requests;},get exits(){return exits;},get resizes(){return resizes;},flush(){for(const [id,fn] of frames){frames.delete(id);fn();}}};
}
function key(value){return{key:value,target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};}

test('one click enters owned native fullscreen and returns focus and scroll on exit',async()=>{
  const env=environment();try{
    const entering=env.controller.enter();assert.equal(env.requests,1,'request starts within the enter gesture');assert.equal(env.controller.active,true);await entering;
    assert.equal(env.document.fullscreenElement,env.root);assert.equal(env.root.classList.contains('is-immersive'),true);assert.equal(env.exitButton.hidden,false);assert.equal(env.button.attributes['aria-pressed'],'true');
    env.flush();assert.ok(env.resizes>0);await env.controller.exit();assert.equal(env.exits,1);assert.equal(env.controller.active,false);assert.equal(env.exitButton.hidden,true);assert.equal(env.exitButton.inert,true);assert.deepEqual(env.window.restoredScroll,{left:9,top:321,behavior:'auto'});assert.deepEqual(env.button.focusOptions,{preventScroll:true});
  }finally{env.controller.dispose();}
});
test('unsupported and rejected fullscreen retain page immersion until Escape',async()=>{
  for(const mode of ['unsupported','rejected']){const env=environment(mode);try{
    await env.controller.enter();assert.equal(env.controller.active,true);assert.equal(env.root.classList.contains('is-immersive'),true);
    const event=key('Escape');env.document.dispatch('keydown',event);assert.equal(env.controller.active,false);assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  }finally{env.controller.dispose();}}
});
test('native fullscreen exit restores the ordinary layout without a second browser exit',async()=>{
  const env=environment();try{await env.controller.enter();env.document.fullscreenElement=null;env.document.dispatch('fullscreenchange');assert.equal(env.controller.active,false);assert.equal(env.exits,0);assert.deepEqual(env.changes,[true,false]);}finally{env.controller.dispose();}
});
test('late fullscreen acceptance after a quick exit cannot re-enter immersion',async()=>{
  const env=environment();let accept;env.root.requestFullscreen=()=>new Promise(resolve=>{accept=resolve;});
  try{
    const entering=env.controller.enter();await env.controller.exit();assert.equal(env.controller.active,false);
    env.document.fullscreenElement=env.root;env.document.dispatch('fullscreenchange');accept();await entering;
    assert.equal(env.controller.active,false);assert.equal(env.document.fullscreenElement,null);assert.equal(env.exits,1);assert.equal(env.root.classList.contains('is-immersive'),false);
  }finally{env.controller.dispose();}
});
test('existing fullscreen owned by another action is never closed by immersion',async()=>{
  for(const full of ['other','root']){const env=environment();try{
    const existing=full==='root'?env.root:new Surface();env.document.fullscreenElement=existing;await env.controller.enter();assert.equal(env.requests,0);await env.controller.exit();assert.equal(env.document.fullscreenElement,existing);assert.equal(env.exits,0);
  }finally{env.controller.dispose();}}
});
test('controls reveal on input and fade, while dialogs and editing keep their own keys',async()=>{
  const env=environment('unsupported');try{
    env.document.dispatch('keydown',key('i'));assert.equal(env.controller.active,true);assert.equal(env.root.classList.contains('immersive-controls-visible'),true);
    for(const fn of env.timers.values())fn();env.timers.clear();assert.equal(env.root.classList.contains('immersive-controls-visible'),false);
    env.document.dispatch('pointermove');assert.equal(env.root.classList.contains('immersive-controls-visible'),true);
    env.document.querySelector=()=>({open:true});env.document.dispatch('keydown',key('Escape'));assert.equal(env.controller.active,true);
    env.document.querySelector=()=>null;const editing=key('Escape');editing.target={closest:()=>({tagName:'INPUT'})};env.document.dispatch('keydown',editing);assert.equal(env.controller.active,true);
    await env.controller.exit();env.controller.dispose();env.document.dispatch('keydown',key('i'));assert.equal(env.controller.active,false);assert.equal(env.root.classList.contains('is-immersive'),false);
  }finally{env.controller.dispose();}
});
