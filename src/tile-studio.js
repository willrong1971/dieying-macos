import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The studio shares only model assets with the teaching app. It never reads or
// writes lesson records, so close inspection leaves children's progress alone.
const numerals='一二三四五六七八九';
const groups=[
  ['萬子',Array.from({length:9},(_,i)=>[`characters_${String(i+1).padStart(2,'0')}`,numerals[i]+'萬'])],
  ['条子',Array.from({length:9},(_,i)=>[`bamboo_${String(i+1).padStart(2,'0')}`,i===0?'一条（幺鸡）':numerals[i]+'条'])],
  ['筒子',Array.from({length:9},(_,i)=>[`dots_${String(i+1).padStart(2,'0')}`,numerals[i]+'筒'])],
  ['风牌',[['wind_east','東'],['wind_south','南'],['wind_west','西'],['wind_north','北']]],
  ['三元牌',[['dragon_red','中'],['dragon_green','發'],['dragon_white','白板']]],
  ['花牌',[['flower_plum','梅'],['flower_orchid','蘭'],['flower_chrysanthemum','菊'],['flower_bamboo','竹']]],
  ['季牌',[['season_spring','春'],['season_summer','夏'],['season_autumn','秋'],['season_winter','冬']]],
];
const labels=new Map(groups.flatMap(([,faces])=>faces));
const themes={ivory:'象牙质感',bamboo:'竹制',porcelain:'白瓷'};
const params=new URLSearchParams(location.search);
let theme=Object.hasOwn(themes,params.get('material'))?params.get('material'):'ivory';
let selected=labels.has(params.get('face'))?params.get('face'):'characters_09';
let mode=params.has('face')&&labels.has(params.get('face'))?'single':'compare';
let sourceScene=null,library=null,requestToken=0,frame=0,renderer=null,controls=null;
let environmentTarget=null,disposed=false,viewDirection='reset';
const stage=document.querySelector('#stage');
const canvas=document.querySelector('#studio-canvas');
const select=document.querySelector('#face-select');
const loading=document.querySelector('#studio-loading');
const progress=document.querySelector('#loading-progress');
const errorPanel=document.querySelector('#studio-error');
const status=document.querySelector('#studio-status');
const modelGroup=new THREE.Group();
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xeeeee5);
const camera=new THREE.PerspectiveCamera(35,1,.001,2);

for(const [title,faces] of groups){
  const optgroup=document.createElement('optgroup');optgroup.label=title;
  for(const [value,label] of faces){const option=document.createElement('option');option.value=value;option.textContent=label;optgroup.append(option);}
  select.append(optgroup);
}
select.value=selected;

function render(){if(renderer&&!disposed)renderer.render(scene,camera);}
function requestRender(){
  if(frame||disposed)return;
  frame=requestAnimationFrame(()=>{frame=0;render();});
}
function updateLabels(){
  document.querySelectorAll('[data-theme]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.theme===theme)));
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  document.querySelector('#view-title').textContent=mode==='compare'?'九萬 · 幺鸡 · 一筒':labels.get(selected);
  document.querySelector('#view-subtitle').textContent=themes[theme]+' · '+(mode==='compare'?'三张对照':'单张近看');
  canvas.setAttribute('aria-label',(mode==='compare'?'九萬、幺鸡、一筒':labels.get(selected))+'的三维模型，可用拖动或右侧按钮调整视角');
}
function fitView(direction='reset'){
  if(!controls)return;
  viewDirection=direction;
  const horizontal=mode==='compare'?.119:.034;
  const vertical=.047;
  const halfAngle=THREE.MathUtils.degToRad(camera.fov/2);
  const distance=Math.max(vertical/(2*Math.tan(halfAngle)),horizontal/(2*Math.tan(halfAngle)*camera.aspect))*1.20+.01;
  const vector=direction==='front'?new THREE.Vector3(0,.045,1):direction==='back'?new THREE.Vector3(0,.09,-1):new THREE.Vector3(.26,.22,1);
  camera.position.copy(vector.normalize().multiplyScalar(distance));
  controls.target.set(0,0,0);controls.minDistance=.044;controls.maxDistance=.65;controls.update();requestRender();
}
function resize(){
  if(!renderer)return;
  const {width,height}=stage.getBoundingClientRect();
  if(width<=0||height<=0)return;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  fitView(viewDirection);
}
function showFaces(){
  if(!library)return;
  modelGroup.clear();
  const faces=mode==='compare'?['characters_09','bamboo_01','dots_01']:[selected];
  faces.forEach((face,index)=>{
    const tile=library.get(face).clone(true);
    tile.position.set((index-(faces.length-1)/2)*.042,0,0);
    // glTF is Y-up with face +Y and tile top -Z. This turns the face toward
    // the viewer (+Z), while the tile top becomes +Y. Dimensions stay in metres.
    tile.rotation.set(Math.PI/2,0,0);tile.scale.set(1,1,1);
    tile.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    modelGroup.add(tile);
  });
  updateLabels();fitView();requestRender();
}
function disposeModels(root){
  if(!root)return;
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());
}
async function loadTheme(nextTheme){
  if(!renderer)return;
  const token=++requestToken;
  theme=nextTheme;updateLabels();
  loading.hidden=false;errorPanel.hidden=true;progress.hidden=true;
  document.querySelector('#loading-copy').textContent='正在准备'+themes[nextTheme]+'牌面……';
  status.textContent='正在准备'+themes[nextTheme];
  try{
    const gltf=await new GLTFLoader().loadAsync(`/exports/v2/game/mahjong_42_${nextTheme}_lod1.glb?art=${nextTheme==='ivory'?'20261027e':'20261027d'}`,event=>{
      if(token!==requestToken)return;
      if(event.total){progress.hidden=false;progress.value=Math.round(event.loaded/event.total*100);}
    });
    if(token!==requestToken||disposed){disposeModels(gltf.scene);return;}
    const nextLibrary=new Map();
    // Multi-colour Body/Enamel exports are Groups containing material meshes;
    // the original Blender empty is identified by tile_id, not child.isMesh.
    gltf.scene.traverse(object=>{if(object.userData.tile_id&&!object.isMesh&&object.children.length){object.position.set(0,0,0);nextLibrary.set(object.userData.tile_id,object);}});
    if(nextLibrary.size!==42||[...labels.keys()].some(face=>!nextLibrary.has(face))){disposeModels(gltf.scene);throw new Error('Incomplete traditional face library');}
    modelGroup.clear();disposeModels(sourceScene);
    sourceScene=gltf.scene;library=nextLibrary;theme=nextTheme;
    showFaces();loading.hidden=true;status.textContent='42种立体牌面已就绪';
    document.body.dataset.material=theme;document.body.dataset.modelsReady='true';requestRender();
  }catch(error){
    if(token!==requestToken||disposed)return;
    loading.hidden=true;errorPanel.hidden=false;
    status.textContent='牌面暂时未能加载';
    document.querySelector('#error-copy').textContent='请确认已经通过启动文件进入工坊，稍后点“重新载入”再试。';
    console.error('Tile studio models:',error);
  }
}

try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
  environmentTarget=pmrem.fromScene(room,.035,.1,100);scene.environment=environmentTarget.texture;scene.environmentIntensity=.85;scene.environmentRotation.set(.12,.34,-.20);room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfffcf5,0x6d746b,.25));
  const key=new THREE.DirectionalLight(0xfff5e7,1.8);key.position.set(-.12,.16,.18);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-.14,right:.14,top:.11,bottom:-.10,near:.05,far:1});key.shadow.bias=-.00008;key.shadow.normalBias=.0001;scene.add(key);
  const fill=new THREE.DirectionalLight(0xe8f0ff,.35);fill.position.set(.16,.06,.13);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(.6,.6),new THREE.MeshStandardMaterial({color:0xe1e2d6,roughness:.92}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02015;floor.receiveShadow=true;scene.add(floor,modelGroup);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.autoRotate=false;controls.enablePan=false;controls.rotateSpeed=.6;controls.zoomSpeed=.7;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI*.49;controls.addEventListener('change',requestRender);
  new ResizeObserver(resize).observe(stage);
  updateLabels();resize();loadTheme(theme);
}catch(error){
  renderer=null;loading.hidden=true;errorPanel.hidden=false;status.textContent='当前浏览器未能开启立体画面';
  document.querySelector('#error-copy').textContent='请使用支持WebGL的浏览器，再刷新页面。';console.error('Tile studio renderer:',error);
}

document.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.theme!==theme||!library)loadTheme(button.dataset.theme);}));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;updateLabels();showFaces();}));
select.addEventListener('change',()=>{selected=select.value;mode='single';updateLabels();showFaces();});
document.querySelector('#view-front').addEventListener('click',()=>fitView('front'));
document.querySelector('#view-back').addEventListener('click',()=>fitView('back'));
document.querySelector('#view-reset').addEventListener('click',()=>fitView());
for(const [id,factor] of [['zoom-in',.82],['zoom-out',1.22]])document.querySelector('#'+id).addEventListener('click',()=>{
  if(!controls)return;
  const direction=camera.position.clone().sub(controls.target);direction.setLength(THREE.MathUtils.clamp(direction.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(direction);controls.update();requestRender();
});
document.querySelector('#retry-load').addEventListener('click',()=>{if(renderer)loadTheme(theme);else location.reload();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();loading.hidden=true;errorPanel.hidden=false;status.textContent='立体画面已暂停';document.querySelector('#error-copy').textContent='图形画面已暂停，请重新载入页面后继续鉴赏。';renderer=null;});
window.addEventListener('pagehide',event=>{
  if(event.persisted)return;
  disposed=true;requestToken++;if(frame)cancelAnimationFrame(frame);controls?.dispose();modelGroup.clear();disposeModels(sourceScene);environmentTarget?.dispose();
  scene.traverse(object=>{if(object.isMesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material?.dispose();}});renderer?.dispose();
});
