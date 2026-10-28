const KEY='mahjong-solitaire:tile-sounds';
const themes=new Set(['ivory','bamboo','porcelain']);
export class TileSounds{
  constructor(onChange=()=>{}){
    this.enabled=true;this.onChange=onChange;this.context=null;this.data=new Map();this.buffers=new Map();this.sources=new Set();this.counter=0;this.lastPlay=0;
    try{this.enabled=localStorage.getItem(KEY)!=='off';}catch{}
    this.notify();
  }
  notify(error=''){this.onChange({enabled:this.enabled,error,playing:this.sources.size>0,clip:this.lastClip||'',kind:this.lastKind||''});}
  setEnabled(enabled){this.enabled=!!enabled;try{localStorage.setItem(KEY,this.enabled?'on':'off');}catch{}if(!this.enabled)this.stop();this.notify();}
  toggle(){this.setEnabled(!this.enabled);}
  preload(theme){
    if(!themes.has(theme))return;
    for(const kind of ['pick','pair'])for(const variant of [1,2])this.load(`${theme}-${kind}-${variant}`).catch(()=>{});
  }
  load(key){
    if(!this.data.has(key))this.data.set(key,fetch(`/public/audio/tiles/${key}.wav`).then(response=>{if(!response.ok)throw new Error('Tile sound unavailable');return response.arrayBuffer();}).catch(error=>{this.data.delete(key);throw error;}));
    return this.data.get(key);
  }
  async play(theme,kind='pick'){
    if(!this.enabled||!themes.has(theme)||!['pick','pair','mismatch'].includes(kind))return;
    const now=Date.now();if(now-this.lastPlay<35&&this.lastRequestKind===kind)return;this.lastPlay=now;this.lastRequestKind=kind;
    try{
      if(!this.context){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;this.context=new Context();}
      // Resume synchronously in the click handler, before fetching/decoding.
      const resumed=this.context.resume();
      // A lower, softer contact marks a rejected partner without speech or a
      // new asset download. The ordinary pair contact remains bright and clear.
      const key=`${theme}-${kind==='pair'?'pair':'pick'}-${++this.counter%2+1}`;
      if(!this.buffers.has(key))this.buffers.set(key,this.load(key).then(data=>this.context.decodeAudioData(data.slice(0))).catch(error=>{this.buffers.delete(key);throw error;}));
      const [buffer]=await Promise.all([this.buffers.get(key),resumed]);
      if(!this.enabled||Date.now()-now>700||this.context.state!=='running')return;
      while(this.sources.size>=6){const oldest=this.sources.values().next().value;oldest.stop();this.sources.delete(oldest);}
      const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;gain.gain.value=kind==='pair'?.66:kind==='mismatch'?.4:.45;
      if(kind==='mismatch')source.playbackRate.value=.7;
      source.connect(gain).connect(this.context.destination);this.sources.add(source);
      source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();this.notify();};this.lastClip=key;this.lastKind=kind;source.start();this.notify();
    }catch{this.notify('牌声暂未载入，下一次操作会重试。');}
  }
  stop(){for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();this.notify();}
}
