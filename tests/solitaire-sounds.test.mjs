import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TileSounds} from '../src/solitaire-sounds.js';

test('three materials have distinct, short, valid contact sound files',()=>{
  const hashes=new Set();
  for(const theme of ['ivory','bamboo','porcelain'])for(const kind of ['pick','pair'])for(const variant of [1,2]){
    const file=readFileSync(new URL(`../public/audio/tiles/${theme}-${kind}-${variant}.wav`,import.meta.url));
    assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE');
    let format,data;for(let offset=12;offset+8<=file.length;){const size=file.readUInt32LE(offset+4),name=file.toString('ascii',offset,offset+4);if(name==='fmt ')format=file.subarray(offset+8,offset+8+size);if(name==='data')data=file.subarray(offset+8,offset+8+size);offset+=8+size+(size%2);}
    assert.ok(format&&data);assert.equal(format.readUInt16LE(2),1);assert.equal(format.readUInt16LE(14),16);
    const duration=data.length/(format.readUInt32LE(4)*2);assert.ok(duration>.06&&duration<.5);
    let peak=0;for(let i=0;i<data.length;i+=2)peak=Math.max(peak,Math.abs(data.readInt16LE(i)));assert.ok(peak>1000&&peak<32760);
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  assert.equal(hashes.size,12);
});
test('contact sounds resume after a gesture, mute immediately and release ended sources',async()=>{
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch,events=[],sources=[];
  class Context{
    constructor(){this.state='suspended';this.destination={};}
    resume(){events.push('resume');this.state='running';return Promise.resolve();}
    decodeAudioData(){events.push('decode');return Promise.resolve({});}
    createBufferSource(){const source={connect:target=>target,disconnect(){},start(){events.push('start');},stop(){events.push('stop');}};sources.push(source);return source;}
    createGain(){return{gain:{value:0},connect(){},disconnect(){}};}
  }
  try{
    globalThis.window={AudioContext:Context};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(32)});
    const changes=[],sound=new TileSounds(status=>changes.push(status));sound.setEnabled(false);await sound.play('ivory','pick');assert.equal(sources.length,0);
    sound.setEnabled(true);await sound.play('ivory','pair');assert.deepEqual(events.slice(0,3),['resume','decode','start']);assert.equal(changes.at(-1).playing,true);
    sources[0].onended();assert.equal(changes.at(-1).playing,false);
    sound.lastPlay=0;await sound.play('bamboo','pick');sound.setEnabled(false);assert.ok(events.includes('stop'));assert.equal(sound.sources.size,0);assert.equal(changes.at(-1).enabled,false);
  }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});

test('a rejected partner has a distinct low contact and does not suppress an immediate pair sound',async()=>{
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch,sources=[],changes=[];
  class Context{
    constructor(){this.state='running';this.destination={};}
    resume(){return Promise.resolve();}
    decodeAudioData(){return Promise.resolve({});}
    createBufferSource(){const source={playbackRate:{value:1},connect:target=>target,disconnect(){},start(){},stop(){}};sources.push(source);return source;}
    createGain(){return{gain:{value:0},connect(){},disconnect(){}};}
  }
  try{
    globalThis.window={AudioContext:Context};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(32)});
    const sound=new TileSounds(status=>changes.push(status));sound.setEnabled(true);
    await sound.play('ivory','pick');
    await sound.play('ivory','mismatch');
    assert.equal(sources.length,2);assert.equal(sources[1].playbackRate.value,.7);
    assert.equal(changes.at(-1).kind,'mismatch');assert.match(changes.at(-1).clip,/^ivory-pick-/);
    await sound.play('ivory','pair');
    assert.equal(sources.length,3);assert.equal(sources[2].playbackRate.value,1);
    assert.equal(changes.at(-1).kind,'pair');assert.match(changes.at(-1).clip,/^ivory-pair-/);
    sound.setEnabled(false);assert.equal(sound.sources.size,0);
  }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
