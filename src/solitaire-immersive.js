// Layout-only state: entering or leaving immersion never changes the deal.
export class ImmersiveMode {
  constructor({root=document.documentElement,button,exitButton,onChange=()=>{},onResize=()=>{}}={}) {
    this.root=root;this.document=root.ownerDocument;this.window=this.document.defaultView;
    this.button=button;this.exitButton=exitButton;this.onChange=onChange;this.onResize=onResize;
    this.active=false;this.disposed=false;this.ownedFullscreen=false;this.pending=null;this.leaving=null;
    this.generation=0;this.fadeTimer=null;this.resizeFrame=null;this.saved=null;
    this.handleToggle=()=>{void this.toggle();};this.handleExit=()=>{void this.exit();};
    this.handleReveal=()=>this.revealControls();
    this.handleKey=event=>{
      if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||this.document.querySelector('dialog[open]'))return;
      const target=event.target;
      if(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      const key=String(event.key).toLowerCase();
      if((key==='escape'&&this.active)||key==='i'){
        event.preventDefault();event.stopImmediatePropagation?.();
        if(key==='escape')void this.exit();else void this.toggle();
      }else if(this.active)this.revealControls();
    };
    this.handleFullscreen=()=>{
      const full=this.document.fullscreenElement;
      if(full===this.root&&this.pending){
        if(this.active&&this.pending.generation===this.generation)this.ownedFullscreen=true;
        else{this.ownedFullscreen=true;void this.leaveNative();}
      }else if(this.ownedFullscreen&&full!==this.root){
        this.ownedFullscreen=false;
        if(this.active)this.deactivate();
      }
      this.resize();
    };
    this.button?.addEventListener('click',this.handleToggle);
    this.exitButton?.addEventListener('click',this.handleExit);
    this.document.addEventListener('keydown',this.handleKey,true);
    this.document.addEventListener('fullscreenchange',this.handleFullscreen);
    for(const type of ['pointermove','pointerdown','touchstart'])this.document.addEventListener(type,this.handleReveal,{passive:true});
    this.syncControls();
  }

  syncControls(){
    this.root.classList.toggle('is-immersive',this.active);
    this.button?.setAttribute('aria-pressed',String(this.active));
    this.button?.setAttribute('aria-label',this.active?'退出沉浸模式':'进入沉浸模式');
    if(this.exitButton){this.exitButton.hidden=!this.active;this.exitButton.inert=!this.active;this.exitButton.setAttribute('aria-hidden',String(!this.active));}
  }

  resize(){
    if(this.disposed)return;
    const request=this.window.requestAnimationFrame?.bind(this.window);
    if(!request){this.onResize();return;}
    if(this.resizeFrame!==null)return;
    this.resizeFrame=request(()=>{this.resizeFrame=null;if(!this.disposed)this.onResize();});
  }

  revealControls(){
    if(!this.active||this.disposed)return;
    this.root.classList.add('immersive-controls-visible');
    if(this.fadeTimer!==null)this.window.clearTimeout(this.fadeTimer);
    this.fadeTimer=this.window.setTimeout(()=>{this.fadeTimer=null;this.root.classList.remove('immersive-controls-visible');},1800);
  }

  restore(saved=this.saved){
    if(!saved)return;
    const target=this.button||saved.focus;
    if(target?.isConnected!==false)target?.focus?.({preventScroll:true});
    this.window.scrollTo?.({left:saved.x,top:saved.y,behavior:'auto'});
  }

  deactivate(){
    if(!this.active)return;
    this.active=false;this.generation++;
    if(this.fadeTimer!==null)this.window.clearTimeout(this.fadeTimer);
    this.fadeTimer=null;this.root.classList.remove('immersive-controls-visible');
    this.syncControls();this.onChange(false);this.restore();this.resize();
  }

  async enter(){
    if(this.disposed||this.active)return;
    this.saved={x:this.window.scrollX||0,y:this.window.scrollY||0,focus:this.document.activeElement};
    this.active=true;const generation=++this.generation;
    this.syncControls();this.onChange(true);this.revealControls();this.resize();
    // Request within the original click, before any await. Unsupported or
    // refused native fullscreen still leaves a complete window-filling layout.
    if(this.document.fullscreenElement||!this.root.requestFullscreen||this.pending)return;
    const pending={generation,promise:null};this.pending=pending;
    try{
      pending.promise=this.root.requestFullscreen();
      await pending.promise;
      if(this.document.fullscreenElement===this.root){
        this.ownedFullscreen=true;
        if(this.disposed||!this.active||generation!==this.generation)await this.leaveNative();
      }
    }catch{
      // A denied fullscreen request must not undo page immersion.
    }finally{
      if(this.pending===pending)this.pending=null;
      this.resize();
    }
  }

  async leaveNative(){
    if(this.leaving)return this.leaving;
    if(!this.ownedFullscreen||this.document.fullscreenElement!==this.root){this.ownedFullscreen=false;return;}
    this.ownedFullscreen=false;
    try{
      this.leaving=Promise.resolve(this.document.exitFullscreen?.());
      await this.leaving;
    }catch{
      // The page layout remains restored even if the browser owns the exit UI.
    }finally{this.leaving=null;this.resize();}
  }

  async exit(){
    const saved=this.saved;
    this.deactivate();const generation=this.generation;
    await this.leaveNative();
    if(!this.active&&generation===this.generation)this.restore(saved);
  }

  async toggle(){return this.active?this.exit():this.enter();}

  dispose(){
    if(this.disposed)return;
    this.deactivate();this.disposed=true;
    this.button?.removeEventListener('click',this.handleToggle);
    this.exitButton?.removeEventListener('click',this.handleExit);
    this.document.removeEventListener('keydown',this.handleKey,true);
    this.document.removeEventListener('fullscreenchange',this.handleFullscreen);
    for(const type of ['pointermove','pointerdown','touchstart'])this.document.removeEventListener(type,this.handleReveal);
    if(this.fadeTimer!==null)this.window.clearTimeout(this.fadeTimer);
    if(this.resizeFrame!==null)this.window.cancelAnimationFrame?.(this.resizeFrame);
    this.root.classList.remove('is-immersive','immersive-controls-visible');
    void this.leaveNative();
  }
}
