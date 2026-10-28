import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SolitaireVoice,voiceLines} from '../src/solitaire-voice.js';

class AudioDouble{
  constructor(){this.currentTime=0;this.paused=true;this.plays=[];this.handlers={};}
  addEventListener(name,callback){this.handlers[name]=callback;}
  pause(){this.paused=true;}
  play(){this.paused=false;this.plays.push(this.src);return Promise.resolve();}
}
test('local voice assets exactly match the spoken prompts and verified generation manifest',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/solitaire/manifest.json',import.meta.url)));
  assert.equal(manifest.network,'offline');assert.equal(manifest.model_load_count,1);
  assert.deepEqual(Object.keys(manifest.clips).sort(),Object.keys(voiceLines).sort());
  for(const [key,text] of Object.entries(voiceLines)){
    const clip=manifest.clips[key];assert.equal(clip.text,text);assert.equal(clip.sample_rate,24000);assert.ok(clip.duration>1&&clip.duration<40);
    for(const kind of ['wav','web']){const data=readFileSync(new URL('../'+clip[kind].path,import.meta.url));assert.equal(data.length,clip[kind].bytes);assert.equal(createHash('sha256').update(data).digest('hex'),clip[kind].sha256);}
  }
});
test('muting cancels narration; prompts replace rather than overlap or repeat',()=>{
  const audio=new AudioDouble(),changes=[];const voice=new SolitaireVoice(status=>changes.push(status),audio);
  voice.setEnabled(false);voice.play('welcome');assert.equal(audio.plays.length,0);
  voice.setEnabled(true);voice.play('welcome');assert.equal(audio.plays.length,1);assert.equal(voice.current,'welcome');
  audio.currentTime=1.5;voice.play('hint');assert.equal(audio.plays.length,2);assert.equal(audio.currentTime,0);assert.equal(voice.current,'hint');
  voice.play('hint');assert.equal(audio.plays.length,2,'same playing prompt does not stutter');
  voice.setEnabled(false);assert.equal(audio.paused,true);assert.equal(voice.current,null);assert.equal(changes.at(-1).enabled,false);
});
test('blocked autoplay leaves the game usable and clears the speaking caption',async()=>{
  const audio=new AudioDouble();audio.play=()=>Promise.reject(new Error('gesture required'));
  let last;const voice=new SolitaireVoice(status=>{last=status;},audio);voice.setEnabled(true);voice.play('rules');await Promise.resolve();
  assert.equal(voice.current,null);assert.match(last.error,/点击/);assert.equal(last.enabled,true);
});
