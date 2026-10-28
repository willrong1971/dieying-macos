import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** One transparent WebGL surface renders the original Blender models over
 * accessible DOM buttons. All game input remains usable with mouse, touch,
 * keyboard, or the lightweight original-image fallback. */
export class TileRenderer {
  constructor(canvas,onStatus=()=>{}) {
    this.canvas=canvas;this.onStatus=onStatus;this.theme='ivory';this.entries=new Map();this.cache=new Map();this.library=null;this.frames=0;this.raf=0;this.token=0;
    try {
      this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:globalThis.__dieyingNativeApp===true});
      this.renderer.setClearColor(0x000000,0);this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
      this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(0,1,1,0,-2000,2000);this.camera.position.z=900;
      // A locally generated photographic room gives polished bone, lacquer and
      // glaze broad reflections. Direct lamps alone flatten these PBR finishes.
      const room=new RoomEnvironment();
      const pmrem=new THREE.PMREMGenerator(this.renderer);
      this.environmentTarget=pmrem.fromScene(room,.035,.1,100);
      this.scene.environment=this.environmentTarget.texture;
      this.scene.environmentIntensity=.82;
      this.scene.environmentRotation.set(.12,.34,-.20);
      room.dispose();pmrem.dispose();
      this.scene.add(new THREE.HemisphereLight(0xfffcf5,0x6d746b,.30));
      const key=new THREE.DirectionalLight(0xfff5e7,2.0);key.position.set(-380,300,650);this.scene.add(key);
      const fill=new THREE.DirectionalLight(0xe8f0ff,.55);fill.position.set(420,-80,500);this.scene.add(fill);
      this.resize();
      addEventListener('resize',()=>{this.resize();this.refresh();});
      document.addEventListener('scroll',()=>this.refresh(),true);
      document.addEventListener('pointerover',e=>{if(e.target.closest('.tile'))this.refresh(14);});
      document.addEventListener('pointerout',e=>{if(e.target.closest('.tile'))this.refresh(14);});
      new MutationObserver(()=>this.refresh(2)).observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-back','data-angle']});
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();document.body.classList.remove('models-ready');this.onStatus({state:'fallback'});});
    } catch(error) {this.onStatus({state:'fallback',error});this.renderer=null;}
  }
  resize(){
    if(!this.renderer)return;
    const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h,false);
    Object.assign(this.camera,{left:-w/2,right:w/2,top:h/2,bottom:-h/2});this.camera.updateProjectionMatrix();
  }
  async setTheme(theme) {
    this.theme=theme;const token=++this.token;
    document.body.dataset.material=theme;
    if(!this.renderer)return;
    this.onStatus({state:'loading',percent:0});
    try {
      if(!this.cache.has(theme)) {
        const promise=new GLTFLoader().loadAsync(`/exports/v2/game/mahjong_42_${theme}_lod1.glb?art=${theme==='ivory'?'20261027e':'20261027d'}`,e=>{
          if(token===this.token)this.onStatus({state:'loading',percent:e.total?Math.round(e.loaded/e.total*100):0});
        }).then(gltf=>{
          const library=new Map();
          gltf.scene.traverse(o=>{if(o.userData.tile_id&&o.type==='Object3D')library.set(o.userData.tile_id,o);});
          // Blender empties can also be represented as Groups by loader versions.
          if(library.size<42)gltf.scene.traverse(o=>{if(o.userData.tile_id&&o.children.some(c=>c.isMesh))library.set(o.userData.tile_id,o);});
          if(library.size!==42)throw new Error('Expected 42 original tile assets, received '+library.size);
          return library;
        });
        this.cache.set(theme,promise);
      }
      const library=await this.cache.get(theme);if(token!==this.token)return;
      for(const entry of this.entries.values())this.scene.remove(entry.object);
      this.entries.clear();this.library=library;
      document.body.classList.add('models-ready');
      this.onStatus({state:'ready',count:library.size});this.refresh(3);
    } catch(error) {
      this.cache.delete(theme);document.body.classList.remove('models-ready');
      this.onStatus({state:'fallback',error});console.error('Tile library:',error);
    }
  }
  refresh(frames=1) {
    this.frames=Math.max(this.frames,frames);
    if(!this.raf)this.raf=requestAnimationFrame(()=>this.draw());
  }
  draw() {
    this.raf=0;if(!this.renderer||!this.library)return;
    const elements=[...document.querySelectorAll('.tile[data-face]')];const active=new Set();let animate=false;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    elements.forEach((el,index)=>{
      const rect=el.getBoundingClientRect();
      if(rect.width<2||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth||el.closest('[hidden]'))return;
      // Let the DOM clip the original-image fallback at scroll boundaries.
      // Fully visible tiles retain their genuine 3D model; a clipped tile must
      // never float across the surrounding journal or navigation.
      let clipped=false;
      for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
        const style=getComputedStyle(parent);const bounds=parent.getBoundingClientRect();
        if(/auto|scroll|hidden|clip/.test(style.overflowX)&&(rect.left<bounds.left-.5||rect.right>bounds.right+.5))clipped=true;
        if(/auto|scroll|hidden|clip/.test(style.overflowY)&&(rect.top<bounds.top-.5||rect.bottom>bounds.bottom+.5))clipped=true;
      }
      const fallback=clipped||(el.disabled&&!el.classList.contains('tile-fixed'));
      if(el.classList.contains('model-fallback')!==fallback)el.classList.toggle('model-fallback',fallback);
      if(fallback)return;
      const id=(el.dataset.modelId||'')+'|'+index;const face=el.dataset.face;
      const source=this.library.get(face);if(!source)return;
      active.add(id);let entry=this.entries.get(id);
      if(entry&&entry.face!==face){this.scene.remove(entry.object);this.entries.delete(id);entry=null;}
      if(!entry){
        const object=source.clone(true);object.position.set(0,0,0);object.scale.setScalar(1);this.scene.add(object);
        entry={object,face,angle:el.dataset.back==='1'?-Math.PI/2+.18:Math.PI/2+.18};this.entries.set(id,entry);
      }
      const target=el.dataset.back==='1'?-Math.PI/2+.18:Math.PI/2+.18;
      entry.angle=reduce?target:entry.angle+(target-entry.angle)*.22;
      if(Math.abs(target-entry.angle)>.001)animate=true;
      const scale=Math.min(rect.width*.92/.029,rect.height*.90/.040);
      entry.object.position.set(rect.left+rect.width/2-innerWidth/2,innerHeight/2-rect.top-rect.height/2,0);
      entry.object.rotation.set(entry.angle,0,(Number(el.dataset.angle)||0)*Math.PI/180);
      entry.object.scale.setScalar(scale);
    });
    for(const [id,entry] of this.entries){if(!active.has(id)){this.scene.remove(entry.object);this.entries.delete(id);}}
    this.renderer.render(this.scene,this.camera);
    this.frames--;if(animate||this.frames>0)this.refresh();
  }
}
