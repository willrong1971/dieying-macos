import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gamesA} from '../src/games/group-a.js';
import {gamesB} from '../src/games/group-b.js';
import {gamesC} from '../src/games/group-c.js';
import {h,tile,resetTileCount} from '../src/ui.js';
import {validateProfile} from '../src/records.js';
const games=[...gamesA,...gamesB,...gamesC];
const fresh=()=>({schema:1,material:'ivory',states:{},notes:{},discoveries:[],lastGame:'G08'});
test('all sixteen games and their published levels use real existing tile assets',()=>{
  assert.equal(new Set(games.map(g=>g.id)).size,16);
  assert.ok(games.reduce((n,g)=>n+g.levels.length,0)>=64);
  for(const g of games)for(let level=0;level<g.levels.length;level++){
    resetTileCount();const state=g.create(level,42);const html=g.view(state,h);
    assert.ok(!html.includes('NaN'),g.id);
    for(const [,path] of html.matchAll(/<img src="([^"]+)"/g))assert.ok(existsSync(new URL('..'+path,import.meta.url)),`${g.id} missing ${path}`);
    const copy=JSON.parse(JSON.stringify(state));assert.equal(g.view(copy,h).replace(/data-model-id="[^"]*"/g,''),html.replace(/data-model-id="[^"]*"/g,''));
  }
});
test('a complete record round-trip preserves all games without mutation',()=>{
  const profile=fresh();for(const g of games)profile.states[g.id+':0']={state:g.create(0,123),hintIndex:-1,explanation:false};
  const before=JSON.stringify(profile);const restored=validateProfile(profile,games,h);
  assert.equal(JSON.stringify(profile),before);assert.deepEqual(restored,profile);assert.notEqual(restored,profile);
});
test('corrupt discovery entries fail atomically and cannot poison the good record',()=>{
  const good=fresh();const before=JSON.stringify(good);
  const corrupt={...good,discoveries:[null]};assert.throws(()=>validateProfile(corrupt,games,h));
  assert.equal(JSON.stringify(good),before);
  assert.throws(()=>validateProfile({...good,notes:{'G08:0':{text:'bad'}}},games,h));
  assert.throws(()=>validateProfile({...good,material:'missing'},games,h));
});
test('record validation rejects unknown, mismatched and negative level states',()=>{
  const p=fresh();p.states['G99:0']={state:{level:0,complete:false},hintIndex:-1,explanation:false};assert.throws(()=>validateProfile(p,games,h));
  p.states={'G08:1':{state:gamesB.find(g=>g.id==='G08').create(0,1),hintIndex:-1,explanation:false}};assert.throws(()=>validateProfile(p,games,h));
});
test('imported game fields cannot inject markup or attribute handlers',()=>{
  const p=fresh();const state=gamesC.find(g=>g.id==='G13').create(0,1);
  state.operationValue='1" autofocus onfocus="alert(1)';p.states['G13:0']={state,hintIndex:-1,explanation:false};
  assert.throws(()=>validateProfile(p,games,h));
});
test('tiles distinguish static art, locked clues and unavailable physical cards',()=>{
  const staticTile=tile('dots_01',{disabled:true});assert.match(staticTile,/^<span/);assert.ok(!staticTile.includes('data-action='));assert.ok(!staticTile.includes('tile-disabled'));
  const unavailable=tile('dots_01',{action:'pick',disabled:true});assert.match(unavailable,/tile-disabled/);assert.match(unavailable,/disabled/);
  const locked=tile('dots_01',{action:'cell',disabled:true,tag:'线索'});assert.match(locked,/tile-fixed/);
  assert.ok(tile('dots_01',{label:'<script>"'}).includes('&lt;script&gt;&quot;'));
});
test('every relative import in the vendored browser runtime is present',()=>{
  const files=['build/three.module.js','build/three.core.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/environments/RoomEnvironment.js','examples/jsm/controls/OrbitControls.js','examples/jsm/utils/BufferGeometryUtils.js','examples/jsm/utils/SkeletonUtils.js'];
  for(const file of files){
    const url=new URL('../vendor/three/'+file,import.meta.url);const source=readFileSync(url,'utf8');
    for(const [,relative] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))assert.ok(existsSync(new URL(relative,url)),relative);
  }
});
