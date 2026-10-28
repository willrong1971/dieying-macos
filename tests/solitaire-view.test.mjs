import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SolitaireRenderer} from '../src/solitaire-renderer.js';
import {createGame,layouts} from '../src/solitaire-engine.js';

const INITIAL_POLAR=Math.atan(.31),EPS=1e-7;
function makeRenderer(tiles=createGame('turtle',42).tiles,width=1200,height=800){
  const captures=new Set(),listeners=new Map(),clicks=[];
  const canvas={style:{touchAction:'',cursor:''},
    getBoundingClientRect:()=>({left:13,top:17,width,height}),
    setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),
    addEventListener:(type,handler,options)=>listeners.set(type,{handler,options}),removeEventListener:type=>listeners.delete(type)};
  const value=Object.create(SolitaireRenderer.prototype);
  Object.assign(value,{canvas,renderer:{},tiles:structuredClone(tiles),entries:new Map(tiles.map(tile=>[tile.id,tile])),
    camera:new THREE.OrthographicCamera(-.3,.3,.2,-.2,.001,5),azimuth:0,polar:INITIAL_POLAR,zoom:1,
    pan:new THREE.Vector2(),origin:new THREE.Vector2(),raycaster:new THREE.Raycaster(),pointer:new THREE.Vector2(),
    library:new Map(),hovered:null,free:new Set(tiles.map(tile=>tile.id)),paused:false,disposed:false,
    board:new THREE.Group(),shadowPlane:{visible:true},layoutSignature:'',requestRender(){},syncTiles(){},
    setHover(id){this.hovered=id;},onHover(){},onStatus(){},onViewChange(){},onTileClick:id=>clicks.push(id)});
  value.camera.up.set(0,0,1);
  if(tiles.length){const xs=tiles.map(tile=>tile.x),ys=tiles.map(tile=>tile.y);value.origin.set((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2);}
  value.fitView();
  return{value,canvas,captures,listeners,clicks,emit(type,options={}){
    const event={button:0,pointerId:1,pointerType:'mouse',isPrimary:true,shiftKey:false,clientX:100,clientY:100,deltaY:0,deltaMode:0,
      preventDefault(){this.prevented=true;},...options};
    listeners.get(type)?.handler(event);return event;
  }};
}
function corners(value){
  const out=[];
  for(const tile of value.tiles)for(const x of [-.0145,.0145])for(const y of [-.020,.020])for(const z of [-.010,.010])out.push(value.position(tile).add(new THREE.Vector3(x,y,z)));
  return out;
}

test('all three boards remain fully framed through orbit angles and narrow/wide viewports',()=>{
  for(const layout of layouts)for(const [width,height] of [[1512,949],[390,844]]){
    const {value}=makeRenderer(createGame(layout.id,63).tiles,width,height),before=JSON.stringify(value.tiles);
    for(const azimuth of [0,.37,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.7,Math.PI*2])for(const polar of [.08,INITIAL_POLAR,1.18]){
      value.azimuth=azimuth;value.polar=polar;value.fitView();
      for(const point of corners(value)){const projected=point.project(value.camera);assert.ok(Math.abs(projected.x)<=1+EPS,`${layout.id}: horizontal clipping`);assert.ok(Math.abs(projected.y)<=1+EPS,`${layout.id}: vertical clipping`);assert.ok(projected.z>=-1&&projected.z<=1,'tile remains between camera clipping planes');}
      assert.ok(value.camera.position.z>0,'camera stays above the table');
    }
    assert.equal(JSON.stringify(value.tiles),before,'view changes cannot alter a deal');
  }
});

test('orbit works before zooming and clamps pitch without looking underneath the table',()=>{
  const {value}=makeRenderer();const before=value.camera.matrixWorld.clone();
  value.orbitBy(120,80);assert.equal(value.zoom,1);assert.notEqual(value.azimuth,0);assert.notDeepEqual(value.camera.matrixWorld.elements,before.elements);
  value.orbitBy(0,1e6);assert.ok(value.polar<=1.18+EPS);assert.ok(value.polar>INITIAL_POLAR);
  value.orbitBy(0,-2e6);assert.ok(value.polar>=.08-EPS);assert.ok(value.polar<INITIAL_POLAR);
});

test('reset view restores the initial elevation, heading and scale and releases a drag',()=>{
  const env=makeRenderer();env.value.bindEvents();env.emit('pointerdown');env.value.orbitBy(150,100);env.value.zoomBy(1.8);env.value.panBy(30,20);
  env.value.resetView();assert.equal(env.value.azimuth,0);assert.ok(Math.abs(env.value.polar-INITIAL_POLAR)<EPS);assert.equal(env.value.zoom,1);assert.equal(env.value.pan.length(),0);assert.equal(env.captures.size,0);
});

test('removals, repeated layout updates and an already loaded material preserve the view',async()=>{
  const {value}=makeRenderer();value.setTiles(value.tiles);value.orbitBy(170,75);value.zoomBy(1.2);value.panBy(15,-9);
  const before={azimuth:value.azimuth,polar:value.polar,zoom:value.zoom,pan:value.pan.toArray()};
  value.setTiles(value.tiles.map((tile,i)=>({...tile,removed:i<2})));value.theme='ivory';await value.setMaterial('ivory');
  assert.deepEqual({azimuth:value.azimuth,polar:value.polar,zoom:value.zoom,pan:value.pan.toArray()},before);
});

test('ray picking still identifies original tile IDs after orbiting, including fractional slots',()=>{
  const tiles=[{id:'left',x:-3,y:0,z:0,face:'dots_01',removed:false},{id:'right',x:3,y:0,z:0,face:'dots_02',removed:false},{id:'upper',x:.5,y:3.5,z:2,face:'bamboo_01',removed:false}];
  const {value}=makeRenderer(tiles);const geometry=new THREE.BoxGeometry(.029,.040,.020),material=new THREE.MeshBasicMaterial();
  value.picking=new THREE.InstancedMesh(geometry,material,tiles.length);value.picking.userData.solitaireIds=tiles.map(tile=>tile.id);
  tiles.forEach((tile,i)=>{const p=value.position(tile);value.picking.setMatrixAt(i,new THREE.Matrix4().makeTranslation(p.x,p.y,p.z));});value.picking.updateMatrixWorld(true);
  try{for(const azimuth of [0,.7,Math.PI/2,Math.PI,Math.PI*1.7])for(const polar of [.08,.6,1.18]){
    value.azimuth=azimuth;value.polar=polar;value.fitView();
    for(const tile of tiles){const screen=value.getTileScreenPosition(tile.id);assert.equal(value.pick(screen.x,screen.y),tile.id);}
  }}finally{value.picking.dispose();geometry.dispose();material.dispose();}
});

test('screen bounds follow orbit and zoom and enclose all tile corners plus the selected frame',()=>{
  const tile={id:'chosen',x:.5,y:3.5,z:2,face:'bamboo_01',removed:false};
  const {value}=makeRenderer([tile]);
  const widths=new Set();
  for(const azimuth of [0,.8,Math.PI/2])for(const polar of [.08,.6,1.18])for(const zoom of [1,1.7]){
    value.azimuth=azimuth;value.polar=polar;value.zoom=zoom;value.fitView();
    const bounds=value.getTileScreenBounds(tile.id),center=value.getTileScreenPosition(tile.id);
    assert.equal(bounds.x,bounds.left);assert.equal(bounds.y,bounds.top);
    assert.ok(bounds.width>0&&bounds.height>0);widths.add(bounds.width.toFixed(3));
    assert.ok(center.x>=bounds.left&&center.x<=bounds.right&&center.y>=bounds.top&&center.y<=bounds.bottom);
    let tileLeft=Infinity,tileRight=-Infinity;
    for(const x of [-.0145,.0145])for(const y of [-.020,.020])for(const z of [-.010,.010]){
      const projected=value.position(tile).add(new THREE.Vector3(x,y,z)).project(value.camera);
      const clientX=13+(projected.x+1)*600,clientY=17+(1-projected.y)*400;
      tileLeft=Math.min(tileLeft,clientX);tileRight=Math.max(tileRight,clientX);
      assert.ok(clientX>=bounds.left-EPS&&clientX<=bounds.right+EPS);
      assert.ok(clientY>=bounds.top-EPS&&clientY<=bounds.bottom+EPS);
    }
    assert.ok(bounds.width>tileRight-tileLeft,'the outer gold frame is part of the returned bounds');
  }
  assert.ok(widths.size>3,'bounds are recomputed from the current camera, not a fixed badge rectangle');
});

test('screen bounds disappear for paused, removed and missing tiles or a zero-size canvas',()=>{
  const tile={id:'chosen',x:0,y:0,z:0,face:'dots_01',removed:false};
  const {value}=makeRenderer([tile]);assert.equal(value.getTileScreenBounds('missing'),null);
  value.paused=true;assert.equal(value.getTileScreenBounds(tile.id),null);value.paused=false;
  value.entries.get(tile.id).removed=true;assert.equal(value.getTileScreenBounds(tile.id),null);
  assert.equal(makeRenderer([{...tile,removed:false}],0,0).value.getTileScreenBounds(tile.id),null);
});

test('a short unmodified left click picks once while a drag rotates without selecting',()=>{
  const env=makeRenderer();env.value.pick=()=> 'original-tile';env.value.bindEvents();
  env.emit('pointerdown');env.emit('pointerup',{clientX:103,clientY:104});assert.deepEqual(env.clicks,['original-tile']);assert.equal(env.captures.size,0);
  const before=JSON.stringify(env.value.tiles);env.emit('pointerdown');env.emit('pointermove',{clientX:150,clientY:130});env.emit('pointerup',{clientX:150,clientY:130});
  assert.notEqual(env.value.azimuth,0);assert.deepEqual(env.clicks,['original-tile']);assert.equal(env.captures.size,0);assert.equal(JSON.stringify(env.value.tiles),before);
});

test('a small out-and-back wobble over a tile remains a click without moving the view',()=>{
  const env=makeRenderer();env.value.pick=()=> 'wobble-tile';env.value.bindEvents();
  const before={azimuth:env.value.azimuth,polar:env.value.polar};
  env.emit('pointerdown');env.emit('pointermove',{clientX:109});env.emit('pointermove',{clientX:100});env.emit('pointerup');
  assert.deepEqual(env.clicks,['wobble-tile']);
  assert.deepEqual({azimuth:env.value.azimuth,polar:env.value.polar},before,'a click wobble must not orbit even briefly');
});

test('a release 9px from the press still selects the pressed tile without a move event',()=>{
  const env=makeRenderer();env.value.pick=()=> 'release-tile';env.value.bindEvents();
  env.emit('pointerdown');env.emit('pointerup',{clientX:109});
  assert.deepEqual(env.clicks,['release-tile']);assert.equal(env.value.azimuth,0);
});

test('small edge slip keeps the tile hit on press even when release misses all tiles',()=>{
  const env=makeRenderer();env.value.pick=x=>x<=108?'edge-tile':null;env.value.bindEvents();
  env.emit('pointerdown',{clientX:106});env.emit('pointerup',{clientX:113});
  assert.deepEqual(env.clicks,['edge-tile']);
});

test('mouse movement through the full 16px tile tolerance never rotates or changes the target',()=>{
  for(const distance of [9,12,15,16]){
    const env=makeRenderer();env.value.pick=x=>x===100?'pressed-tile':'neighbor-tile';env.value.bindEvents();
    env.emit('pointerdown');env.emit('pointermove',{clientX:100+distance});env.emit('pointerup',{clientX:100+distance});
    assert.deepEqual(env.clicks,['pressed-tile'],`${distance}px click keeps its pressed target`);
    assert.equal(env.value.azimuth,0);assert.equal(env.value.polar,INITIAL_POLAR);
  }
});

test('a touch press on a tile tolerates 22px of motion before committing to orbit',()=>{
  const env=makeRenderer();env.value.pick=()=> 'touch-tile';env.value.bindEvents();
  env.emit('pointerdown',{pointerType:'touch'});env.emit('pointermove',{pointerType:'touch',clientX:122});env.emit('pointerup',{pointerType:'touch',clientX:122});
  assert.deepEqual(env.clicks,['touch-tile']);assert.equal(env.value.azimuth,0);
});

test('committed tile drags orbit only beyond the click tolerance and cannot become a click',()=>{
  const env=makeRenderer();env.value.pick=()=> 'drag-tile';env.value.bindEvents();
  env.emit('pointerdown');env.emit('pointermove',{clientX:120});
  const sensitivity=Math.PI*2*.65/800;
  assert.ok(Math.abs(env.value.azimuth+4*sensitivity)<EPS,'the first 16px is an intentional dead zone, not a sudden rotation');
  env.emit('pointermove',{clientX:100});env.emit('pointerup');
  assert.deepEqual(env.clicks,[],'returning to the start cannot select after an actual drag');
});

test('an empty-table drag retains the smaller 8px orbit threshold',()=>{
  const env=makeRenderer();env.value.pick=()=>null;env.value.bindEvents();
  env.emit('pointerdown');env.emit('pointermove',{clientX:112});env.emit('pointerup',{clientX:112});
  assert.notEqual(env.value.azimuth,0);assert.deepEqual(env.clicks,[]);
});

test('one empty-table click clears selection exactly once without changing the view',()=>{
  const env=makeRenderer();env.value.pick=()=>null;env.value.bindEvents();
  const before={azimuth:env.value.azimuth,polar:env.value.polar};
  env.emit('pointerdown');env.emit('pointerup',{clientX:103,clientY:102});
  assert.deepEqual(env.clicks,[null]);assert.equal(env.captures.size,0);
  assert.deepEqual({azimuth:env.value.azimuth,polar:env.value.polar},before);
});

test('a tiny press beside a tile can still resolve a release hit when the press had no target',()=>{
  const env=makeRenderer();env.value.pick=x=>x>=106?'release-edge':null;env.value.bindEvents();
  env.emit('pointerdown');env.emit('pointerup',{clientX:106});
  assert.deepEqual(env.clicks,['release-edge']);assert.equal(env.value.azimuth,0);
});

test('Shift, right and middle gestures pan and can never become a tile click',()=>{
  for(const options of [{shiftKey:true},{button:1},{button:2}]){
    const env=makeRenderer();env.value.pick=()=> 'should-not-pick';env.value.bindEvents();
    env.emit('pointerdown',options);env.emit('pointerup',{...options,clientX:102});assert.deepEqual(env.clicks,[]);
    env.emit('pointerdown',options);env.emit('pointermove',{...options,clientX:160,clientY:120});env.emit('pointerup',{...options,clientX:160,clientY:120});
    assert.ok(env.value.pan.length()>0);assert.equal(env.value.azimuth,0);assert.equal(env.value.polar,INITIAL_POLAR);assert.deepEqual(env.clicks,[]);
  }
});

test('cancelled, lost-capture and paused gestures release ownership without accidental picks',()=>{
  for(const cancel of ['pointercancel','lostpointercapture','pause']){
    const env=makeRenderer();env.value.pick=()=> 'should-not-pick';env.value.bindEvents();env.emit('pointerdown');env.emit('pointermove',{clientX:140});
    if(cancel==='pause')env.value.setPaused(true);else if(cancel==='lostpointercapture'){env.captures.clear();env.emit(cancel);}else env.emit(cancel);
    env.emit('pointerup',{clientX:140});assert.equal(env.captures.size,0);assert.equal(env.value.down,null);assert.deepEqual(env.clicks,[]);
  }
});

test('capture and cancel events from another pointer cannot erase the current click',()=>{
  for(const type of ['pointercancel','lostpointercapture']){
    const env=makeRenderer();env.value.pick=()=> 'owned-tile';env.value.bindEvents();
    env.emit('pointerdown');env.emit(type,{pointerId:2});
    assert.equal(env.value.down?.id,1,`${type} must keep the current pointer`);
    env.emit('pointerup');assert.deepEqual(env.clicks,['owned-tile']);assert.equal(env.captures.size,0);
  }
});

test('a delayed capture-loss notification is ignored while the active press still owns capture',()=>{
  const env=makeRenderer();env.value.pick=()=> 'captured-tile';env.value.bindEvents();
  env.emit('pointerdown');env.emit('lostpointercapture');
  assert.equal(env.value.down?.id,1);assert.equal(env.captures.has(1),true);
  env.emit('pointerup');assert.deepEqual(env.clicks,['captured-tile']);
});

test('an ordinary app refresh with unchanged tiles and playing state cannot cancel a click',()=>{
  const env=makeRenderer();env.value.setTiles(env.value.tiles);env.value.pick=()=> 'refresh-tile';env.value.bindEvents();
  env.emit('pointerdown');env.value.setTiles(env.value.tiles);env.value.setPaused(false);env.emit('pointerup');
  assert.deepEqual(env.clicks,['refresh-tile']);assert.equal(env.captures.size,0);
});

test('unchanged tile content skips instance and shadow rebuilding while face changes still sync',()=>{
  const env=makeRenderer();let syncs=0;env.value.syncTiles=()=>syncs++;
  env.value.setTiles(env.value.tiles);assert.equal(syncs,1);
  env.value.setTiles(structuredClone(env.value.tiles));assert.equal(syncs,1,'selection-only refresh must not rewrite the board');
  const changed=structuredClone(env.value.tiles);[changed[0].face,changed[1].face]=[changed[1].face,changed[0].face];
  if(changed[0].face===env.value.tiles[0].face)changed[0].face='dragon_white';
  env.value.setTiles(changed);assert.equal(syncs,2,'a shuffled face really changes what is rendered');
});

test('wheel zoom is scoped to the canvas and paused boards ignore it',()=>{
  const env=makeRenderer();env.value.bindEvents();const wheel=env.emit('wheel',{deltaY:-120});assert.ok(env.value.zoom>1);assert.equal(wheel.prevented,true);assert.equal(env.listeners.get('wheel').options?.passive,false);
  const context=env.emit('contextmenu');assert.equal(context.prevented,true);
  env.value.setPaused(true);const before=env.value.zoom;env.emit('wheel',{deltaY:120});assert.equal(env.value.zoom,before);
});

function recoveredTiles(original){
  return original.map((tile,i)=>i<6?{...tile,x:(i%3)*1.35-1.35,y:Math.floor(i/3)*1.35-.675,z:0,removed:false}:{...tile,removed:true});
}
test('recovered remaining tiles frame compactly without hidden old slots and preserve orbit',()=>{
  const original=createGame('turtle',11).tiles,{value}=makeRenderer(original);
  value.setTiles(original);value.orbitBy(140,55);value.zoomBy(1.5);value.panBy(40,20);
  const pose={azimuth:value.azimuth,polar:value.polar},repacked=recoveredTiles(original);
  value.setTiles(repacked,{frameRemaining:true});
  assert.deepEqual({azimuth:value.azimuth,polar:value.polar},pose);
  assert.equal(value.zoom,1);assert.equal(value.pan.length(),0);assert.equal(value.framingTiles.length,6);
  assert.ok(value.origin.length()<EPS,'hidden original slots do not shift the center');
  assert.ok(value.camera.top-value.camera.bottom<.18,'the camera fits the small remaining grid');
  for(const tile of repacked.filter(tile=>!tile.removed))for(const x of [-.0145,.0145])for(const y of [-.020,.020])for(const z of [-.010,.010]){
    const projected=value.position(tile).add(new THREE.Vector3(x,y,z)).project(value.camera);
    assert.ok(Math.abs(projected.x)<=1+EPS&&Math.abs(projected.y)<=1+EPS);
  }
});
test('removing recovered pairs keeps the cached frame and camera still',()=>{
  const original=createGame('turtle',17).tiles,{value}=makeRenderer(original);
  value.setTiles(original);const repacked=recoveredTiles(original);value.setTiles(repacked,{frameRemaining:true});value.orbitBy(30,35);
  const cached=value.framingTiles,origin=value.origin.toArray(),matrix=value.camera.matrixWorld.elements.slice(),projection=value.camera.projectionMatrix.elements.slice();
  value.setTiles(repacked.map((tile,i)=>({...tile,removed:tile.removed||i<2})),{frameRemaining:true});value.fitView();
  assert.equal(value.framingTiles,cached);assert.deepEqual(value.origin.toArray(),origin);
  assert.deepEqual(value.camera.matrixWorld.elements,matrix);assert.deepEqual(value.camera.projectionMatrix.elements,projection);
});
test('undoing a recovered layout restores original framing without changing orbit',()=>{
  const original=createGame('turtle',23).tiles,{value}=makeRenderer(original);
  value.setTiles(original);value.orbitBy(-90,50);const pose={azimuth:value.azimuth,polar:value.polar};
  value.setTiles(recoveredTiles(original),{frameRemaining:true});value.setTiles(original,{frameRemaining:false});
  assert.equal(value.framingTiles.length,original.length);assert.deepEqual(value.origin.toArray(),[6,3.5]);
  assert.deepEqual({azimuth:value.azimuth,polar:value.polar},pose);
  value.setTiles(createGame('garden',23).tiles);assert.equal(value.azimuth,0);assert.equal(value.polar,INITIAL_POLAR);
});
