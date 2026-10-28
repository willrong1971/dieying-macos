import test from 'node:test';
import assert from 'node:assert/strict';
import {SolitaireRenderer} from '../src/solitaire-renderer.js';

function environment(enabled){
  const saved={flag:globalThis.__dieyingNativeDiagnostics,webkit:globalThis.webkit,raf:globalThis.requestAnimationFrame};
  const events=[],messages=[],frames=[];
  const gl={drawingBufferWidth:400,drawingBufferHeight:200,RGBA:6408,UNSIGNED_BYTE:5121,
    getError(){return 0;},isContextLost(){return false;},getContextAttributes(){return{preserveDrawingBuffer:false};},
    readPixels(x,y,w,h,format,type,pixel){events.push('read');pixel.set([210,190,155,255]);},
  };
  const value=Object.create(SolitaireRenderer.prototype);
  const tiles=Array.from({length:6},(_,i)=>({id:`tile-${i}`,removed:false}));
  Object.assign(value,{theme:'ivory',library:new Map(),tiles,free:new Set(['tile-2','tile-3']),batches:new Map([['dots_01',[]]]),
    board:{visible:true},paused:false,disposed:false,frame:0,scene:{},camera:{},
    canvas:{width:400,height:200,getBoundingClientRect:()=>({left:10,right:210,top:20,bottom:120,width:200,height:100})},
    renderer:{shadowMap:{needsUpdate:false},info:{render:{calls:3,triangles:100}},render(){events.push('render');},getContext(){events.push('context');return gl;}},
    getTileScreenPosition:()=>({x:110,y:70}),
  });
  globalThis.__dieyingNativeDiagnostics=enabled;
  globalThis.webkit={messageHandlers:{gameLog:{postMessage:message=>messages.push(JSON.parse(message))}}};
  globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
  return{value,gl,events,messages,draw(){value.requestRender();frames.shift()();},restore(){
    for(const [key,val] of [['__dieyingNativeDiagnostics',saved.flag],['webkit',saved.webkit],['requestAnimationFrame',saved.raf]]){
      if(val===undefined)delete globalThis[key];else globalThis[key]=val;
    }
  }};
}

test('ordinary browser frames do not query GL or emit native diagnostics',()=>{
  const env=environment(false);try{
    env.draw();assert.deepEqual(env.events,['render']);assert.deepEqual(env.messages,[]);
  }finally{env.restore();}
});

test('native readback follows the draw and reports free tile pixels only once per material and size',()=>{
  const env=environment(true);try{
    env.draw();
    assert.deepEqual(env.events,['render','context','read','read']);
    assert.equal(env.messages.length,1);
    const first=env.messages[0];
    assert.equal(first.type,'native-render-frame');assert.equal(first.calls,3);assert.equal(first.triangles,100);
    assert.deepEqual(first.samples.map(sample=>sample.id),['tile-2','tile-3']);
    assert.ok(first.samples.every(sample=>sample.x===200&&sample.y===100&&sample.rgba[3]===255&&sample.error===0));
    assert.equal(first.contextAttributes.preserveDrawingBuffer,false);
    env.draw();assert.equal(env.messages.length,1,'same material/size does not sample again');
    env.value.theme='bamboo';env.draw();assert.equal(env.messages.length,2);
    env.gl.drawingBufferWidth=800;env.draw();assert.equal(env.messages.length,3);
  }finally{env.restore();}
});

test('loading frames wait for a material and library before reading pixels',()=>{
  const env=environment(true);try{
    env.value.theme=undefined;env.draw();
    env.value.theme='ivory';env.value.library=null;env.draw();
    assert.deepEqual(env.events,['render','render']);assert.deepEqual(env.messages,[]);
  }finally{env.restore();}
});
