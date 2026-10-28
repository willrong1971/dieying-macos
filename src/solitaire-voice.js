// Recorded with the local Qwen3-TTS model; no live synthesis or remote service.
const KEY='mahjong-solitaire:voice';
export const voiceLines={
  welcome:'欢迎来到叠影。找出两张相配的牌，慢慢拆开这座牌阵。',
  rules:'只有上方没有牌覆盖，而且左边或右边空出的牌，才能取走。万、条、筒和字牌要完全相同。花牌之间可以互配，季节牌之间也可以互配。',
  'new-game':'新牌局已摆好。先看看高处和两侧。',
  hint:'这一对可以取走。也可以再看看，有没有更好的选择。',
  'blocked-top':'上面还有牌覆盖，先打开上面这一层。',
  'blocked-sides':'左右两侧都被挡住了。先移开一侧的牌。',
  mismatch:'这两张不相配，再看一看。',
  'no-moves':'暂时没有可配对的牌。可以撤销几步，换一种次序，也可以洗牌。',
  shuffle:'剩余牌已重新排列。这次的排列有解。',
  win:'整座牌阵已经清空。这一局，拆得漂亮。',
};
export class SolitaireVoice{
  constructor(onChange=()=>{},audioElement=null){
    this.onChange=onChange;this.enabled=false;this.current=null;this.lastKey=null;this.lastTime=0;
    try{this.enabled=localStorage.getItem(KEY)==='on';}catch{}
    this.audio=audioElement||new Audio();this.audio.preload='none';this.audio.volume=.85;
    this.audio.addEventListener('ended',()=>{this.current=null;this.notify();});
    this.audio.addEventListener('error',()=>{this.current=null;this.notify('配音暂未载入，可稍后重试。');});
    this.notify();
  }
  notify(error=''){this.onChange({enabled:this.enabled,playing:this.current,text:voiceLines[this.current]||'',error});}
  setEnabled(enabled){this.enabled=!!enabled;try{localStorage.setItem(KEY,this.enabled?'on':'off');}catch{}if(!this.enabled)this.stop();this.notify();}
  toggle(){this.setEnabled(!this.enabled);if(this.enabled)this.play('welcome');}
  play(key){
    if(!this.enabled||!Object.hasOwn(voiceLines,key))return;
    const now=Date.now();if(this.current===key||(this.lastKey===key&&now-this.lastTime<1800))return;
    this.stop();this.lastKey=key;this.lastTime=now;this.current=key;
    this.audio.src=`/public/audio/solitaire/${key}.m4a`;this.notify();
    const promise=this.audio.play();
    promise?.catch(()=>{if(this.current===key){this.current=null;this.notify('点击“配音”按钮后再试。');}});
  }
  stop(){this.audio.pause();this.audio.currentTime=0;this.current=null;this.notify();}
}
