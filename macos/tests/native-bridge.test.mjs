import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const bridgeSource=readFileSync(new URL('../Resources/NativeBridge.js',import.meta.url),'utf8');
const GAME='mahjong-solitaire:v1';
const VOICE='mahjong-solitaire:voice';
const WORKSHOP_SOUNDS='mahjong-math-workshop:sounds';
const ALLOWED=[GAME,VOICE,'mahjong-solitaire:tile-sounds','mahjong-math-workshop:v1','mahjong-math-workshop:v1:recovery',WORKSHOP_SOUNDS];
const normalize=value=>JSON.parse(JSON.stringify(value));

// A WKWebView navigation creates a new JS global/Storage prototype, while its
// origin's backing data and the browsing-context window.name survive.
function document({backing=new Map(),names={value:''},initial={},token='launch-1',fallback=false,protocol='mahjong:',hostname='app'}={}){
  class Storage{
    constructor(data=new Map()){this.data=data;}
    getItem(key){return this.data.get(String(key))??null;}
    setItem(key,value){this.data.set(String(key),String(value));}
    removeItem(key){this.data.delete(String(key));}
    clear(){this.data.clear();}
    key(index){return [...this.data.keys()][Number(index)]??null;}
    get length(){return this.data.size;}
  }
  const local=new Storage(backing),session=new Storage(),messages=[],logs=[],listeners=new Map();
  const window={
    location:{protocol,hostname},
    webkit:{messageHandlers:{gameStore:{postMessage:value=>messages.push(normalize(value))},gameLog:{postMessage:value=>logs.push(String(value))}}},
    addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);},
  };
  Object.defineProperty(window,'name',{configurable:true,get:()=>names.value,set:value=>{names.value=String(value);}});
  Object.defineProperty(window,'localStorage',{configurable:true,get:()=>{if(fallback)throw new Error('Storage unavailable');return local;}});
  const source=bridgeSource.replaceAll('__INITIAL_STORAGE__',Buffer.from(JSON.stringify(initial)).toString('base64')).replaceAll('__RESTORE_TOKEN__',token);
  vm.runInNewContext(source,{window,Storage,TextDecoder,atob},{filename:'NativeBridge.js'});
  return {window,storage:window.localStorage,session,backing,names,messages,logs,
    snapshot:()=>normalize(window.__dieyingSaveSnapshot()),
    dispatch(type,event={}){for(const handler of listeners.get(type)||[])handler(event);}};
}

test('an initial about:blank document cannot consume native launch recovery',()=>{
  const backing=new Map([[GAME,'old']]),names={value:''};
  const blank=document({backing,names,initial:{[GAME]:'latest'},protocol:'about:',hostname:''});
  assert.equal(names.value,'');assert.equal(blank.storage.getItem(GAME),'old');assert.deepEqual(blank.messages,[]);
  const actual=document({backing,names,initial:{[GAME]:'latest'}});
  assert.equal(actual.storage.getItem(GAME),'latest');
});

test('the first document restores only allowed native values without sending them back as new edits',()=>{
  const backing=new Map([[GAME,'stale-webkit-copy'],['web-only','keep']]);
  const names={value:''};
  const env=document({backing,names,token:'first-launch',initial:{[GAME]:'100',[VOICE]:'on','native-unrelated':'do not restore'}});
  assert.equal(env.storage.getItem(GAME),'100');
  assert.equal(env.storage.getItem(VOICE),'on');
  assert.equal(env.storage.getItem('web-only'),'keep');
  assert.equal(env.storage.getItem('native-unrelated'),null);
  assert.deepEqual(env.messages,[]);
  assert.equal(names.value,'dieying:first-launch');
});

test('allowed edits are forwarded immediately as strings, while other Storage instances and keys are local',()=>{
  const env=document();
  env.storage.setItem(GAME,'98');
  assert.deepEqual(env.messages,[{key:GAME,value:'98'}]);
  env.storage.setItem(new String(VOICE),123);
  assert.deepEqual(env.messages.at(-1),{key:VOICE,value:'123'});
  const count=env.messages.length;
  env.storage.setItem('unrelated','private local value');
  env.session.setItem(GAME,'different session');
  assert.equal(env.messages.length,count);
  assert.equal(env.storage.getItem('unrelated'),'private local value');
  assert.equal(env.session.getItem(GAME),'different session');
  assert.equal(env.storage.getItem(GAME),'98');
});

test('remove and clear synchronize allowed deletions without forwarding unrelated key names',()=>{
  const env=document({initial:{[GAME]:'100',[VOICE]:'on'}});
  env.storage.removeItem(GAME);
  assert.equal(env.storage.getItem(GAME),null);
  assert.deepEqual(env.messages,[{key:GAME,value:null}]);
  env.storage.setItem('unrelated','value');
  env.storage.removeItem('unrelated');
  assert.equal(env.messages.length,1);
  env.storage.clear();
  assert.equal(env.storage.length,0);
  assert.deepEqual(env.messages.slice(1).map(value=>value.key).sort(),[...ALLOWED].sort());
  assert.ok(env.messages.slice(1).every(value=>value.value===null));
});

test('snapshot and pagehide save the newest allowed values and omit missing or unrelated data',()=>{
  const env=document({initial:{[GAME]:'100'}});
  env.storage.setItem(GAME,'98');
  env.storage.setItem(VOICE,'on');
  env.storage.setItem('unrelated','exclude');
  assert.deepEqual(env.snapshot(),{[GAME]:'98',[VOICE]:'on'});
  env.messages.length=0;
  env.dispatch('pagehide');
  assert.deepEqual(env.messages,[{snapshot:{[GAME]:'98',[VOICE]:'on'}}]);
  assert.equal(env.storage.getItem('unrelated'),'exclude');
});

test('same-launch navigation cannot roll a current game back to the startup snapshot',()=>{
  const backing=new Map(),names={value:''},initial={[GAME]:'100'};
  const first=document({backing,names,initial,token:'navigation-launch'});
  assert.equal(first.storage.getItem(GAME),'100');
  first.storage.setItem(GAME,'98');
  first.storage.setItem(VOICE,'off');
  const next=document({backing,names,initial,token:'navigation-launch'});
  assert.equal(next.storage.getItem(GAME),'98');
  assert.equal(next.storage.getItem(VOICE),'off');
  assert.deepEqual(next.snapshot(),{[GAME]:'98',[VOICE]:'off'});
  next.storage.setItem(GAME,'96');
  assert.deepEqual(next.messages,[{key:GAME,value:'96'}]);
});

test('a new WKWebView launch restores the latest native snapshot once with its new token',()=>{
  const backing=new Map(),firstNames={value:''};
  const first=document({backing,names:firstNames,initial:{[GAME]:'100'},token:'old-launch'});
  first.storage.setItem(GAME,'98');
  first.storage.setItem(WORKSHOP_SOUNDS,'off');
  const latest=first.snapshot();
  // Simulate an outdated WebKit disk cache after a process interruption.
  backing.set(GAME,'100');
  const newNames={value:''};
  const relaunched=document({backing,names:newNames,initial:latest,token:'new-launch'});
  assert.equal(relaunched.storage.getItem(GAME),'98');
  assert.equal(relaunched.storage.getItem(WORKSHOP_SOUNDS),'off');
  assert.equal(newNames.value,'dieying:new-launch');
  relaunched.storage.setItem(GAME,'96');
  const navigated=document({backing,names:newNames,initial:latest,token:'new-launch'});
  assert.equal(navigated.storage.getItem(GAME),'96');
});

test('the fallback Storage supports read, write, enumeration, deletion, snapshots and native synchronization',()=>{
  const env=document({fallback:true,initial:{[GAME]:'100',[VOICE]:'on'}});
  assert.equal(env.storage.getItem(GAME),'100');
  assert.equal(env.storage.getItem('absent'),null);
  assert.equal(env.storage.length,2);
  assert.equal(env.storage.key(0),GAME);
  assert.equal(env.storage.key(99),null);
  env.storage.setItem(GAME,'98');
  env.storage.setItem('unrelated',17);
  assert.equal(env.storage.getItem('unrelated'),'17');
  assert.equal(env.storage.length,3);
  assert.deepEqual(env.messages,[{key:GAME,value:'98'}]);
  assert.deepEqual(env.snapshot(),{[GAME]:'98',[VOICE]:'on'});
  env.storage.removeItem(VOICE);
  assert.deepEqual(env.messages.at(-1),{key:VOICE,value:null});
  assert.equal(env.storage.getItem(VOICE),null);
  env.storage.clear();
  assert.equal(env.storage.length,0);
  assert.deepEqual(env.snapshot(),{});
  assert.deepEqual(env.messages.slice(-ALLOWED.length).map(value=>value.key).sort(),[...ALLOWED].sort());
  env.messages.length=0;env.dispatch('pagehide');
  assert.deepEqual(env.messages,[{snapshot:{}}]);
});
