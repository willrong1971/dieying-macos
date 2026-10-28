// Mahjong solitaire rules and dealing are independent of the renderer and storage.
// Coordinates describe one-tile rectangles, with z denoting the stack level.
const EPSILON=1e-6;
const suits=['characters','bamboo','dots'];
const standardFaces=[...suits.flatMap(suit=>Array.from({length:9},(_,i)=>`${suit}_${String(i+1).padStart(2,'0')}`)),
  'wind_east','wind_south','wind_west','wind_north','dragon_red','dragon_green','dragon_white'];
const flowers=['flower_plum','flower_orchid','flower_chrysanthemum','flower_bamboo'];
const seasons=['season_spring','season_summer','season_autumn','season_winter'];
const allFaces=new Set([...standardFaces,...flowers,...seasons]);

function rectangle(out,x,y,w,h,z){for(let row=0;row<h;row++)for(let col=0;col<w;col++)out.push({x:x+col,y:y+row,z});}
function turtleSlots(){
  const out=[];
  [12,8,10,12,12,10,8,12].forEach((width,y)=>rectangle(out,(12-width)/2,y,width,1,0));
  out.push({x:-1,y:3.5,z:0},{x:12,y:3.5,z:0},{x:13,y:3.5,z:0});
  rectangle(out,3,1,6,6,1);rectangle(out,4,2,4,4,2);rectangle(out,5,3,2,2,3);
  out.push({x:5.5,y:3.5,z:4});return out;
}
function bridgeSlots(){
  const out=[];
  rectangle(out,0,0,12,8,0);rectangle(out,1,2,10,4,1);
  rectangle(out,2,3,2,2,2);rectangle(out,8,3,2,2,2);return out;
}
function gardenSlots(){
  const out=[];
  [6,8,10,10,8,6].forEach((width,y)=>rectangle(out,(10-width)/2,y,width,1,0));
  for(const x of [-1,10])for(const y of [2,3])out.push({x,y,z:0});
  rectangle(out,3,1,4,4,1);rectangle(out,4,2,2,2,2);return out;
}
export const layouts=Object.freeze([
  Object.freeze({id:'turtle',name:'经典龟形',description:'五层叠牌，144 张。先打开长边，再拆解中央的高塔。',count:144,layers:5}),
  Object.freeze({id:'bridge',name:'双桥',description:'三层长阵，144 张。两座桥头相互牵制，留意被压住的牌。',count:144,layers:3}),
  Object.freeze({id:'garden',name:'小花园',description:'三层短局，72 张。牌少一些，仍需安排拆牌次序。',count:72,layers:3})
]);
const slotFactories={turtle:turtleSlots,bridge:bridgeSlots,garden:gardenSlots};
const slotsByLayout=Object.fromEntries(layouts.map(layout=>[layout.id,slotFactories[layout.id]().map((slot,i)=>({...slot,id:`${layout.id}-${i}`}))]));

function rng(seed){let a=Number(seed)>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffled(items,random){const out=items.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function overlap(a,b,axis){return Math.min(a[axis]+1,b[axis]+1)-Math.max(a[axis],b[axis])>EPSILON;}
function adjacency(tiles){
  return tiles.map((tile,i)=>{
    const above=[],left=[],right=[];
    for(let j=0;j<tiles.length;j++)if(i!==j){
      const other=tiles[j];
      if(other.z>tile.z&&overlap(tile,other,'x')&&overlap(tile,other,'y'))above.push(j);
      if(other.z===tile.z&&overlap(tile,other,'y')){
        if(Math.abs(other.x+1-tile.x)<EPSILON)left.push(j);
        if(Math.abs(tile.x+1-other.x)<EPSILON)right.push(j);
      }
    }
    return{above,left,right};
  });
}
function freeIndices(graph,active){
  const out=[];
  for(let i=0;i<graph.length;i++)if(active[i]){
    const {above,left,right}=graph[i];
    if(!above.some(j=>active[j])&&(!left.some(j=>active[j])||!right.some(j=>active[j])))out.push(i);
  }
  return out;
}
export function blockedReason(tiles,id){
  const tile=tiles.find(t=>t.id===id);if(!tile||tile.removed)return'removed';
  const live=tiles.filter(t=>!t.removed&&t.id!==id);
  if(live.some(t=>t.z>tile.z&&overlap(tile,t,'x')&&overlap(tile,t,'y')))return'covered';
  const peers=live.filter(t=>t.z===tile.z&&overlap(tile,t,'y'));
  if(peers.some(t=>Math.abs(t.x+1-tile.x)<EPSILON)&&peers.some(t=>Math.abs(tile.x+1-t.x)<EPSILON))return'sides';
  return null;
}
export function isFree(tiles,id){return blockedReason(tiles,id)===null;}
export function getFreeTiles(tiles){const graph=adjacency(tiles),active=tiles.map(t=>!t.removed);return freeIndices(graph,active).map(i=>tiles[i]);}
export function matchKey(face){return flowers.includes(face)?'flowers':seasons.includes(face)?'seasons':face;}
export function getMatches(tiles){
  const byFace=new Map(),pairs=[];
  for(const tile of getFreeTiles(tiles)){const key=matchKey(tile.face);if(!byFace.has(key))byFace.set(key,[]);byFace.get(key).push(tile.id);}
  for(const ids of byFace.values())for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push([ids[i],ids[j]]);
  return pairs;
}
export function removePair(tiles,idA,idB){
  if(idA===idB)return null;
  const a=tiles.find(t=>t.id===idA),b=tiles.find(t=>t.id===idB);
  if(!a||!b||matchKey(a.face)!==matchKey(b.face)||!isFree(tiles,idA)||!isFree(tiles,idB))return null;
  return tiles.map(t=>t.id===idA||t.id===idB?{...t,removed:true}:{...t});
}

// Find an order in which the *positions* can be removed in pairs, then place
// matching faces along that order. This gives a complete solvability witness.
function positionSolution(tiles,random){
  const graph=adjacency(tiles),active=tiles.map(t=>!t.removed),solution=[],dead=new Set();
  const remaining=active.filter(Boolean).length;
  if(remaining%2)return null;
  let budget=18000;
  const signature=()=>active.map(v=>v?'1':'0').join('');
  function visit(left){
    if(!left)return true;
    if(--budget<=0)return false;
    const free=freeIndices(graph,active);if(free.length<2)return false;
    const key=signature();if(dead.has(key))return false;
    // Prefer opening the upper layers, while random tie-breaking varies deals.
    const candidates=[];
    for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++){
      const a=free[i],b=free[j];
      candidates.push({a,b,score:(tiles[a].z+tiles[b].z)*3+random()*4});
    }
    candidates.sort((a,b)=>b.score-a.score);
    for(const {a,b} of candidates){
      active[a]=false;active[b]=false;solution.push([tiles[a].id,tiles[b].id]);
      if(visit(left-2))return true;
      solution.pop();active[a]=true;active[b]=true;
      if(budget<=0)return false;
    }
    dead.add(key);return false;
  }
  return visit(remaining)?solution:null;
}
function inventory(layoutId){
  const standard=layoutId==='garden'?[...suits.flatMap(s=>[1,3,5,9].map(n=>`${s}_${String(n).padStart(2,'0')}`)),...standardFaces.filter(f=>f.startsWith('wind_'))]:standardFaces;
  return [...standard.flatMap(face=>[face,face,face,face]),...flowers,...seasons];
}
function facePairs(faces,random){
  const groups=new Map();
  for(const face of faces){const key=matchKey(face);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(face);}
  const pairs=[];
  for(const group of groups.values()){
    if(group.length%2)return null;
    const mixed=shuffled(group,random);for(let i=0;i<mixed.length;i+=2)pairs.push([mixed[i],mixed[i+1]]);
  }
  return shuffled(pairs,random);
}
export function shuffleRemaining(tiles,seed=1){
  const random=rng(seed),solution=positionSolution(tiles,random);if(!solution)return null;
  const pairs=facePairs(tiles.filter(t=>!t.removed).map(t=>t.face),random);if(!pairs)return null;
  const faces=new Map();solution.forEach(([a,b],i)=>{faces.set(a,pairs[i][0]);faces.set(b,pairs[i][1]);});
  return{tiles:tiles.map(t=>({...t,...(!t.removed?{face:faces.get(t.id)}:{})})),solution};
}

// Try the existing positions first. If the remaining stacks cannot physically
// be removed in pairs, open only those remaining tiles into a compact grid.
// This rescues the same game: no removed card returns and no face is replaced.
export function reshuffleGame(game,seed=1){
  if(!game||!Array.isArray(game.tiles)||(game.boardMode!==undefined&&!['original','open'].includes(game.boardMode)))return null;
  const tiles=game.tiles;
  const samePositions=shuffleRemaining(tiles,seed);
  if(samePositions)return{...samePositions,rearranged:false,boardMode:game.boardMode||'original'};
  const active=tiles.filter(t=>!t.removed),random=rng(seed);
  const pairs=facePairs(active.map(t=>t.face),random);
  if(!pairs||!active.length)return null;
  const ordered=shuffled(active,random),columns=Math.min(12,Math.ceil(Math.sqrt(active.length*1.65))),rows=Math.ceil(active.length/columns);
  const centerX=(Math.min(...active.map(t=>t.x))+Math.max(...active.map(t=>t.x)))/2;
  const centerY=(Math.min(...active.map(t=>t.y))+Math.max(...active.map(t=>t.y)))/2;
  const replacements=new Map(),solution=[];
  ordered.forEach((tile,index)=>{
    const row=Math.floor(index/columns),column=index%columns,rowLength=Math.min(columns,active.length-row*columns);
    replacements.set(tile.id,{...tile,x:centerX+(column-(rowLength-1)/2)*1.16,y:centerY+(row-(rows-1)/2)*1.12,z:0,face:pairs[Math.floor(index/2)][index%2]});
    if(index%2===1)solution.push([ordered[index-1].id,tile.id]);
  });
  return{tiles:tiles.map(t=>t.removed?{...t}:replacements.get(t.id)),solution,rearranged:true,boardMode:'open'};
}
export function createGame(layoutId='turtle',seed=1){
  if(!Object.hasOwn(slotsByLayout,layoutId))throw new RangeError('Unknown Mahjong solitaire layout');
  const faces=inventory(layoutId),tiles=slotsByLayout[layoutId].map((slot,i)=>({...slot,face:faces[i],removed:false}));
  const result=shuffleRemaining(tiles,seed);
  if(!result)throw new Error('Could not construct a solvable layout');
  return{layoutId,seed:Number(seed)>>>0,tiles:result.tiles,solution:result.solution};
}
function counts(items,key=t=>t){const result=new Map();for(const item of items){const k=key(item);result.set(k,(result.get(k)||0)+1);}return result;}
export function validateSavedGame(value){
  if(!value||typeof value!=='object'||!Object.hasOwn(slotsByLayout,value.layoutId)||!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff||!Array.isArray(value.tiles))return false;
  if(value.boardMode!==undefined&&!['original','open'].includes(value.boardMode))return false;
  const slots=slotsByLayout[value.layoutId];if(value.tiles.length!==slots.length)return false;
  const byId=new Map(value.tiles.map(t=>[t?.id,t]));if(byId.size!==slots.length)return false;
  let canonical=true;
  for(const slot of slots){
    const tile=byId.get(slot.id);
    if(!tile||!allFaces.has(tile.face)||typeof tile.removed!=='boolean')return false;
    if(tile.x!==slot.x||tile.y!==slot.y||tile.z!==slot.z)canonical=false;
  }
  if(!canonical){
    if(value.boardMode!=='open')return false;
    if(value.tiles.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)||Math.abs(t.x)>32||Math.abs(t.y)>32||!Number.isInteger(t.z)||t.z<0||t.z>4))return false;
    const active=value.tiles.filter(t=>!t.removed);
    if(active.some(t=>t.z!==0))return false;
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)if(overlap(active[i],active[j],'x')&&overlap(active[i],active[j],'y'))return false;
  }
  const actual=counts(value.tiles,t=>t.face),expected=counts(inventory(value.layoutId));
  if(actual.size!==expected.size||[...expected].some(([face,count])=>actual.get(face)!==count))return false;
  if([...counts(value.tiles.filter(t=>t.removed),t=>matchKey(t.face)).values()].some(n=>n%2))return false;
  return true;
}
