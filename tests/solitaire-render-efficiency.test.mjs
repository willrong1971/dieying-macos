import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SolitaireRenderer} from '../src/solitaire-renderer.js';
import {createGame} from '../src/solitaire-engine.js';

// Exercise renderer state transitions without a WebGL context. Geometry syncing
// is counted at its boundary; halo construction still uses the real method.
function fixture(){
  const tiles=createGame('turtle',1027).tiles,captures=new Set();
  const calls={sync:0,release:0,renders:[],disposals:0};
  const value=Object.create(SolitaireRenderer.prototype);
  Object.assign(value,{
    canvas:{style:{},getBoundingClientRect:()=>({left:0,top:0,width:1200,height:800}),
      hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)},
    renderer:{shadowMap:{needsUpdate:false},dispose(){calls.disposals++;}},camera:new THREE.OrthographicCamera(-.3,.3,.2,-.2,.001,5),
    tiles:[],entries:new Map(),library:new Map(Array.from({length:42},(_,i)=>[String(i),[]])),
    theme:'ivory',board:new THREE.Group(),batches:new Map(),shadowPlane:{visible:true},
    origin:new THREE.Vector2(),pan:new THREE.Vector2(),azimuth:0,polar:Math.atan(.31),zoom:1,
    translation:new THREE.Matrix4(),layoutSignature:'',tileIdSignature:'',tileContentSignature:'',
    frameRemaining:false,framingTiles:null,paused:false,disposed:false,down:null,
    selected:null,hovered:null,hints:new Set(),free:new Set(),showFree:false,
    haloGeometry:new THREE.PlaneGeometry(.03,.04),haloMaterial:new THREE.MeshBasicMaterial(),
    onViewChange(){},onHover(){},onStatus(){},
    syncTiles(){calls.sync++;this.requestRender(true);},
    releasePointer(){calls.release++;SolitaireRenderer.prototype.releasePointer.call(this);},
    requestRender(shadows=false){calls.renders.push(shadows);if(shadows)this.renderer.shadowMap.needsUpdate=true;},
  });
  value.camera.up.set(0,0,1);
  function clear(){calls.sync=0;calls.release=0;calls.renders.length=0;value.renderer.shadowMap.needsUpdate=false;}
  function dispose(){if(value.disposed)return;value.halos?.dispose();value.haloGeometry.dispose();value.haloMaterial.dispose();value.selectionOutline?.removeFromParent();value.selectionGeometry?.dispose();value.selectionMaterial?.dispose();}
  return{value,tiles,calls,captures,clear,dispose};
}

test('equal tile content in a fresh object copy does not rebuild matrices or shadows',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.clear();
    env.value.setTiles(structuredClone(env.tiles));
    assert.equal(env.calls.sync,0);
    assert.deepEqual(env.calls.renders,[]);
    assert.equal(env.value.renderer.shadowMap.needsUpdate,false);
  }finally{env.dispose();}
});

test('face, removal, coordinates and framing mode still synchronize real board changes',()=>{
  for(const change of ['face','removed','coordinates','framing']){
    const env=fixture();try{
      env.value.setTiles(env.tiles);env.value.orbitBy(100,50);
      const pose={azimuth:env.value.azimuth,polar:env.value.polar};env.clear();
      const next=structuredClone(env.tiles);let options;
      if(change==='face')next[0].face=next[0].face==='dots_01'?'dots_02':'dots_01';
      else if(change==='removed')next[0].removed=true;
      else if(change==='coordinates')next[0].x+=.25;
      else options={frameRemaining:true};
      env.value.setTiles(next,options);
      assert.equal(env.calls.sync,1,change);
      assert.equal(env.value.renderer.shadowMap.needsUpdate,true,change);
      assert.deepEqual({azimuth:env.value.azimuth,polar:env.value.polar},pose,change+' keeps orbit');
      env.clear();env.value.setTiles(structuredClone(next),options);
      assert.equal(env.calls.sync,0,change+' subsequent equal copy');
    }finally{env.dispose();}
  }
});

test('an already loaded material ready callback cannot make unchanged tiles synchronize',async()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.clear();let notifications=0;
    env.value.onStatus=status=>{
      assert.equal(status.state,'ready');assert.equal(status.count,42);notifications++;
      env.value.setTiles(structuredClone(env.tiles));env.value.setPaused(false);
    };
    await env.value.setMaterial('ivory');
    assert.equal(notifications,1);assert.equal(env.calls.sync,0);
    assert.equal(env.calls.release,0);assert.equal(env.value.renderer.shadowMap.needsUpdate,false);
  }finally{env.dispose();}
});

test('repeating the unpaused state preserves an active pointer and does no render work',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.clear();env.captures.add(7);env.value.down={id:7,dragging:false};
    env.value.setPaused(false);env.value.setPaused(false);
    assert.equal(env.calls.release,0);assert.deepEqual(env.calls.renders,[]);
    assert.equal(env.value.down?.id,7);assert.equal(env.captures.has(7),true);
    assert.equal(env.value.renderer.shadowMap.needsUpdate,false);
  }finally{env.dispose();}
});

test('actual pause and resume each release input and update board and shadow visibility once',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.clear();env.captures.add(7);env.value.down={id:7,dragging:false};
    env.value.setPaused(true);
    assert.equal(env.calls.release,1);assert.equal(env.value.down,null);assert.equal(env.captures.size,0);
    assert.equal(env.value.board.visible,false);assert.equal(env.value.shadowPlane.visible,false);
    assert.deepEqual(env.calls.renders,[true]);
    env.clear();env.value.setPaused(true);
    assert.equal(env.calls.release,0);assert.deepEqual(env.calls.renders,[]);
    env.value.setPaused(false);
    assert.equal(env.calls.release,1);assert.equal(env.value.board.visible,true);assert.equal(env.value.shadowPlane.visible,true);
    assert.deepEqual(env.calls.renders,[true]);
  }finally{env.dispose();}
});

test('a normal selection refresh requests only a halo render and leaves shadows clean',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.clear();
    env.value.setTiles(structuredClone(env.tiles));env.value.setPaused(false);
    env.value.setHighlights({selected:env.tiles[0].id,free:[env.tiles[0].id]});
    assert.equal(env.calls.sync,0);assert.equal(env.calls.release,0);
    assert.equal(env.value.halos.count,1);assert.deepEqual(env.calls.renders,[false]);
    assert.equal(env.value.renderer.shadowMap.needsUpdate,false);
  }finally{env.dispose();}
});

test('selection has a broad opaque gold frame while hover stays cold and cannot replace it',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.clear();const before=JSON.stringify(env.value.tiles);
    const selected=env.tiles[0].id,hovered=env.tiles[1].id;
    env.value.setHighlights({selected,free:[selected,hovered]});
    const outline=env.value.selectionOutline,geometry=outline.geometry,material=outline.material;
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.max.x-geometry.boundingBox.min.x>.033);
    assert.ok(geometry.boundingBox.max.y-geometry.boundingBox.min.y>.044);
    assert.equal(material.color.getHex(),0xffd34f);assert.equal(material.opacity,1);
    assert.equal(material.transparent,false);assert.equal(material.toneMapped,false);
    assert.equal(outline.castShadow,false);assert.equal(outline.receiveShadow,false);
    const position=outline.position.clone();env.value.setHover(hovered);
    assert.equal(env.value.selected,selected);assert.equal(env.value.selectionOutline,outline);
    assert.equal(outline.geometry,geometry);assert.equal(outline.material,material);
    assert.deepEqual(outline.position.toArray(),position.toArray());
    const hoverIndex=env.value.tiles.filter(tile=>tile.id===selected||tile.id===hovered).findIndex(tile=>tile.id===hovered);
    const hoverColor=new THREE.Color();env.value.halos.getColorAt(hoverIndex,hoverColor);
    assert.ok(hoverColor.b>hoverColor.r,'hover has a cold color rather than the selected gold');
    assert.equal(JSON.stringify(env.value.tiles),before);
    assert.equal(env.calls.sync,0);assert.equal(env.value.renderer.shadowMap.needsUpdate,false);
    assert.deepEqual(env.calls.renders,[false,false]);
  }finally{env.dispose();}
});

test('cancelling and removing the selected tile hide its reusable frame without rebuilding tiles',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);const id=env.tiles[0].id;
    env.value.setHighlights({selected:id});const outline=env.value.selectionOutline;env.clear();
    env.value.setHighlights({selected:null});assert.equal(outline.visible,false);
    env.value.setHighlights({selected:id});assert.equal(env.value.selectionOutline,outline);assert.equal(outline.visible,true);
    assert.equal(env.calls.sync,0);assert.equal(env.value.renderer.shadowMap.needsUpdate,false);
    const next=structuredClone(env.tiles);next[0].removed=true;env.value.setTiles(next);
    env.clear();env.value.updateHighlights();assert.equal(outline.visible,false);
    assert.deepEqual(env.calls.renders,[false]);assert.equal(env.calls.sync,0);
  }finally{env.dispose();}
});

test('pause hides the selected frame and resume restores it without changing selection or geometry',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);const id=env.tiles[0].id;env.value.setHighlights({selected:id});
    const outline=env.value.selectionOutline;env.clear();
    env.value.setPaused(true);assert.equal(outline.visible,false);assert.equal(env.value.selected,id);
    assert.equal(env.value.getTileScreenBounds(id),null);
    env.value.setPaused(false);assert.equal(outline.visible,true);assert.equal(env.value.selectionOutline,outline);
    assert.equal(env.value.selected,id);assert.equal(env.calls.sync,0);
    assert.deepEqual(env.calls.renders,[true,true]);
  }finally{env.dispose();}
});

test('disposing the renderer releases the dedicated selection geometry and material exactly once',()=>{
  const env=fixture();try{
    env.value.setTiles(env.tiles);env.value.setHighlights({selected:env.tiles[0].id});
    const outline=env.value.selectionOutline;let geometries=0,materials=0;
    outline.geometry.addEventListener('dispose',()=>geometries++);
    outline.material.addEventListener('dispose',()=>materials++);
    env.value.dispose();env.value.dispose();
    assert.equal(geometries,1);assert.equal(materials,1);assert.equal(env.calls.disposals,1);
    assert.equal(outline.parent,null);
  }finally{env.dispose();}
});
