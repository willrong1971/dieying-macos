import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SolitaireRenderer} from '../src/solitaire-renderer.js';

const tile=(id,x=0,y=0,z=0)=>({id,x,y,z,face:'dots_01',removed:false});

// Use the actual box picking mesh and actual gold frame geometry. No WebGL or
// rendered frame is needed to verify which painted regions accept a click.
function fixture(tiles=[tile('A')]){
  const value=Object.create(SolitaireRenderer.prototype);
  Object.assign(value,{
    canvas:{getBoundingClientRect:()=>({left:13,top:17,width:1200,height:800})},
    renderer:{},library:new Map(),tiles,entries:new Map(tiles.map(item=>[item.id,item])),
    selected:'A',paused:false,disposed:false,origin:new THREE.Vector2(),board:new THREE.Group(),
    camera:new THREE.OrthographicCamera(-.1,.1,.08,-.08,.001,5),
    pointer:new THREE.Vector2(),raycaster:new THREE.Raycaster(),
  });
  value.camera.up.set(0,0,1);
  value.camera.position.set(0,-.31,1);value.camera.lookAt(0,0,0);value.camera.updateMatrixWorld(true);
  const geometry=new THREE.BoxGeometry(.029,.040,.020),material=new THREE.MeshBasicMaterial();
  value.picking=new THREE.InstancedMesh(geometry,material,tiles.length);
  value.picking.userData.solitaireIds=tiles.map(item=>item.id);
  tiles.forEach((item,index)=>{
    const point=value.position(item);
    value.picking.setMatrixAt(index,new THREE.Matrix4().makeTranslation(point.x,point.y,point.z));
  });
  value.picking.instanceMatrix.needsUpdate=true;value.picking.updateMatrixWorld(true);
  value.updateSelectedOutline();
  function project(point){
    const projected=point.clone().project(value.camera);
    return{x:13+(projected.x+1)*600,y:17+(1-projected.y)*400};
  }
  function pointAtGold(item=tiles[0]){return project(value.position(item).add(new THREE.Vector3(.016,0,.0107)));}
  function pick(point){return value.pick(point.x,point.y);}
  function dispose(){
    value.picking.dispose();geometry.dispose();material.dispose();
    value.selectionGeometry?.dispose();value.selectionMaterial?.dispose();
  }
  return{value,project,pointAtGold,pick,dispose};
}

test('the visible selected gold rim outside the original tile box accepts the tile click',()=>{
  const env=fixture();try{
    const point=env.pointAtGold();
    assert.equal(env.pick(point),'A');
    assert.equal(env.value.selected,'A','hit testing does not change selection itself');
  }finally{env.dispose();}
});

test('empty space beyond the actual selected frame remains empty',()=>{
  const env=fixture();try{
    const point=env.project(new THREE.Vector3(.019,0,.0107));
    assert.equal(env.pick(point),null);
  }finally{env.dispose();}
});

test('a selected screen bounding rectangle does not steal its empty rotated corner',()=>{
  const env=fixture();try{
    env.value.camera.position.set(.55,-.55,.4);env.value.camera.lookAt(0,0,0);env.value.camera.updateMatrixWorld(true);
    const bounds=env.value.getTileScreenBounds('A');
    assert.ok(bounds.width>0&&bounds.height>0);
    assert.equal(env.pick({x:bounds.left+.5,y:bounds.top+.5}),null);
  }finally{env.dispose();}
});

test('an exact neighboring tile hit takes precedence over the selected gold rim',()=>{
  const env=fixture([tile('A'),tile('B',1)]);try{
    const point=env.pointAtGold();
    assert.equal(env.pick(point),'B');
    assert.equal(env.value.selected,'A');
  }finally{env.dispose();}
});

test('a fresh moved selected frame is clickable before any render updates its world matrix',()=>{
  const chosen=tile('A',2,1.5,2),env=fixture([chosen]);try{
    // updateSelectedOutline has set local position but no renderer.render or
    // outline.updateMatrixWorld has run. The hit path must refresh it itself.
    assert.equal(env.pick(env.pointAtGold(chosen)),'A');
  }finally{env.dispose();}
});

test('paused, removed or invisible selected frames do not turn empty space into a tile',()=>{
  for(const state of ['paused','removed','invisible']){
    const env=fixture();try{
      const point=env.pointAtGold();
      if(state==='paused')env.value.paused=true;
      else if(state==='removed')env.value.entries.get('A').removed=true;
      else env.value.selectionOutline.visible=false;
      assert.equal(env.pick(point),null,state);
    }finally{env.dispose();}
  }
});

test('clearing selection does not leave the previous frame clickable',()=>{
  const env=fixture();try{
    const point=env.pointAtGold();env.value.selected=null;env.value.updateSelectedOutline();
    assert.equal(env.value.selectionOutline.visible,false);
    assert.equal(env.pick(point),null);
  }finally{env.dispose();}
});
