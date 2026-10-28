import test from 'node:test';
import assert from 'node:assert/strict';
import {layouts,createGame,isFree,blockedReason,getFreeTiles,getMatches,matchKey,removePair,shuffleRemaining,reshuffleGame,validateSavedGame} from '../src/solitaire-engine.js';

const tile=(id,x,y,z=0,face='dots_01')=>({id,x,y,z,face,removed:false});
const counts=tiles=>Object.fromEntries([...new Set(tiles.map(t=>t.face))].sort().map(face=>[face,tiles.filter(t=>t.face===face).length]));
function replay(tiles,solution){
  let board=tiles;
  for(const [a,b] of solution){assert.ok(isFree(board,a),`${a} is free`);assert.ok(isFree(board,b),`${b} is free`);assert.equal(matchKey(board.find(t=>t.id===a).face),matchKey(board.find(t=>t.id===b).face));board=removePair(board,a,b);assert.ok(board);}
  assert.equal(board.filter(t=>!t.removed).length,0);return board;
}

test('classic rule checks half-overlap from above and same-level side obstruction',()=>{
  const line=[tile('a',0,0),tile('b',1,0),tile('c',2,0),tile('top',.5,.5,1)];
  assert.equal(blockedReason(line,'a'),'covered');assert.equal(blockedReason(line,'b'),'covered');assert.equal(isFree(line,'c'),true);
  const open=line.filter(t=>t.id!=='top');assert.equal(blockedReason(open,'b'),'sides');assert.equal(isFree(open,'a'),true);
  assert.equal(isFree([tile('a',0,0),tile('touch',0,1,1)],'a'),true,'only touching at an edge does not cover');
  assert.equal(blockedReason([tile('center',0,0),tile('left',-1,-.5),tile('right',1,.5)],'center'),'sides');
  assert.equal(isFree([tile('a',0,0),tile('not-peer',1,0,1)],'a'),true,'higher side neighbor is not a same-level blocker');
});
test('flowers and seasons match within their own family; all other faces require identity',()=>{
  const board=[tile('a',0,0,0,'flower_plum'),tile('b',2,0,0,'flower_orchid'),tile('c',4,0,0,'season_spring'),tile('d',6,0,0,'season_winter'),tile('e',8,0,0,'bamboo_01'),tile('f',10,0,0,'bamboo_02')];
  assert.deepEqual(getMatches(board),[['a','b'],['c','d']]);assert.ok(removePair(board,'a','b'));assert.equal(removePair(board,'a','c'),null);assert.equal(removePair(board,'e','f'),null);assert.equal(removePair(board,'a','a'),null);
});
test('a pair cannot remove a blocked tile or the same card twice, and legal moves are immutable',()=>{
  const board=[tile('a',0,0),tile('b',1,0),tile('c',2,0)];const before=JSON.stringify(board);
  assert.equal(removePair(board,'a','b'),null);assert.equal(removePair(board,'missing','c'),null);
  const moved=removePair(board,'a','c');assert.ok(moved);assert.equal(moved.filter(t=>t.removed).length,2);assert.equal(JSON.stringify(board),before);assert.equal(isFree(moved,'b'),true);
});
test('three layouts have valid nonintersecting stacks and genuine 144/72 tile inventories',()=>{
  assert.equal(layouts.length,3);
  for(const layout of layouts){const game=createGame(layout.id,28);assert.equal(game.tiles.length,layout.count);assert.equal(Math.max(...game.tiles.map(t=>t.z))+1,layout.layers);assert.ok(validateSavedGame(game));
    for(let i=0;i<game.tiles.length;i++)for(let j=i+1;j<game.tiles.length;j++){const a=game.tiles[i],b=game.tiles[j];assert.ok(a.z!==b.z||Math.abs(a.x-b.x)>=1||Math.abs(a.y-b.y)>=1,`same layer tiles overlap in ${layout.id}`);}
    const inventory=counts(game.tiles);for(const [face,n] of Object.entries(inventory))assert.equal(n,face.startsWith('flower_')||face.startsWith('season_')?1:4);
    assert.ok(getFreeTiles(game.tiles).length>=2);assert.ok(getMatches(game.tiles).length>0);
  }
});
test('300 seeded deals replay to a completely empty board, with seed reproducibility',()=>{
  for(const layout of layouts)for(let seed=0;seed<100;seed++){
    const game=createGame(layout.id,seed);replay(game.tiles,game.solution);
    if(seed<3)assert.deepEqual(createGame(layout.id,seed),game);
  }
  assert.notDeepEqual(createGame('turtle',1).tiles.map(t=>t.face),createGame('turtle',2).tiles.map(t=>t.face));
});
test('shuffle preserves both exact face inventory and removed positions, with a fresh complete witness',()=>{
  for(const layout of layouts){const game=createGame(layout.id,961);let partial=game.tiles;
    for(const pair of game.solution.slice(0,12))partial=removePair(partial,...pair);
    const before=JSON.stringify(partial),mixed=shuffleRemaining(partial,191);
    assert.ok(mixed);assert.equal(JSON.stringify(partial),before);assert.deepEqual(counts(mixed.tiles),counts(partial));
    assert.deepEqual(mixed.tiles.map(t=>[t.id,t.x,t.y,t.z,t.removed]),partial.map(t=>[t.id,t.x,t.y,t.z,t.removed]));
    assert.deepEqual(mixed.tiles.filter(t=>t.removed),partial.filter(t=>t.removed));replay(mixed.tiles,mixed.solution);
    assert.ok(validateSavedGame({...game,tiles:mixed.tiles}));
  }
});
test('a geometrically locked remainder returns null instead of silently changing positions',()=>{
  const stack=[tile('low',0,0),tile('high',0,0,1)];assert.equal(shuffleRemaining(stack,1),null);
  assert.equal(shuffleRemaining([tile('odd',0,0)],1),null);
  assert.equal(shuffleRemaining([tile('a',0,0,0,'dots_01'),tile('b',2,0,0,'dots_02')],1),null);
  assert.deepEqual(shuffleRemaining([],1),{tiles:[],solution:[]});
});
test('save validation rejects corrupted coordinates, duplicate IDs, wrong faces, and illegal removal parity',()=>{
  const game=createGame('turtle',53);const copy=()=>JSON.parse(JSON.stringify(game));
  const cases=[null,{}, {...game,layoutId:'injected'}, {...game,seed:NaN},
    {layoutId:'constructor',seed:1,tiles:[{}]},
    {layoutId:'toString',seed:1,tiles:[]},
    {layoutId:'__proto__',seed:1,tiles:[]}];
  let value=copy();value.tiles[0].x=.1;cases.push(value);
  value=copy();value.tiles[0].id=value.tiles[1].id;cases.push(value);
  value=copy();value.tiles[0].face='not_a_tile';cases.push(value);
  value=copy();value.tiles[0].removed=true;cases.push(value);
  value=copy();value.tiles.pop();cases.push(value);
  value=copy();value.tiles[0].face='dots_01';value.tiles[1].face='dots_01';cases.push(value);
  for(const bad of cases)assert.equal(validateSavedGame(bad),false);
  assert.throws(()=>createGame('constructor',1),RangeError);
  assert.equal(validateSavedGame(game),true);assert.equal(validateSavedGame({...game,tiles:removePair(game.tiles,...game.solution[0])}),true);
});

function lockedGame(count=4){
  const game=createGame('turtle',53),activeIds=Array.from({length:count},(_,z)=>game.tiles.find(t=>t.x===5&&t.y===3&&t.z===z).id);
  const remainingFaces=count===2?['dots_01','dots_01']:['dots_01','dots_01','bamboo_01','bamboo_01'];
  const rest=game.tiles.map(t=>t.face);for(const face of remainingFaces)rest.splice(rest.indexOf(face),1);
  let next=0;game.tiles=game.tiles.map(t=>({...t,removed:!activeIds.includes(t.id),face:activeIds.includes(t.id)?remainingFaces[activeIds.indexOf(t.id)]:rest[next++]}));
  assert.ok(validateSavedGame(game));assert.equal(getFreeTiles(game.tiles).length,1);return game;
}
test('deadlock recovery separates the last vertical pair instead of requiring a restart',()=>{
  const game=lockedGame(2),before=JSON.stringify(game);
  assert.equal(shuffleRemaining(game.tiles,11),null);
  const rescued=reshuffleGame(game,11);assert.ok(rescued);assert.equal(rescued.rearranged,true);assert.equal(rescued.boardMode,'open');
  assert.equal(getFreeTiles(rescued.tiles).length,2);assert.equal(getMatches(rescued.tiles).length,1);
  assert.equal(JSON.stringify(game),before);assert.deepEqual(counts(rescued.tiles),counts(game.tiles));
  assert.deepEqual(rescued.tiles.filter(t=>t.removed),game.tiles.filter(t=>t.removed));replay(rescued.tiles,rescued.solution);
});
test('recovery keeps exact inventory and removed cards, is repeatable, and supplies a complete solution',()=>{
  const game=lockedGame(4),before=JSON.stringify(game);
  for(let seed=1;seed<=40;seed++){
    const rescued=reshuffleGame(game,seed);assert.ok(rescued);assert.equal(rescued.rearranged,true);
    assert.deepEqual(counts(rescued.tiles),counts(game.tiles));assert.equal(rescued.tiles.filter(t=>!t.removed).length,4);
    assert.deepEqual(rescued.tiles.filter(t=>t.removed),game.tiles.filter(t=>t.removed));
    assert.deepEqual(reshuffleGame(game,seed),rescued);replay(rescued.tiles,rescued.solution);
  }
  assert.equal(JSON.stringify(game),before);
});
test('ordinary reshuffle keeps positions and does not unnecessarily open the board',()=>{
  for(const layout of layouts){
    const game=createGame(layout.id,20261027),result=reshuffleGame(game,77);
    assert.ok(result);assert.equal(result.rearranged,false);assert.equal(result.boardMode,'original');
    assert.deepEqual(result.tiles.map(t=>[t.id,t.x,t.y,t.z,t.removed]),game.tiles.map(t=>[t.id,t.x,t.y,t.z,t.removed]));
    replay(result.tiles,result.solution);
  }
});
test('open-board saves survive JSON reload, later moves and further shuffles',()=>{
  const original=lockedGame(4),result=reshuffleGame(original,81),game={...original,...result};
  assert.ok(validateSavedGame(JSON.parse(JSON.stringify(game))));
  assert.ok(validateSavedGame({...game,tiles:createGame('turtle',53).tiles}),'canonical initial tiles remain valid for restart under open metadata');
  game.tiles=removePair(game.tiles,...game.solution[0]);assert.ok(validateSavedGame(JSON.parse(JSON.stringify(game))));
  const shuffled=reshuffleGame(game,2);assert.equal(shuffled.rearranged,false);assert.equal(shuffled.boardMode,'open');
  assert.deepEqual(shuffled.tiles.map(t=>[t.x,t.y,t.z,t.removed]),game.tiles.map(t=>[t.x,t.y,t.z,t.removed]));
  assert.ok(validateSavedGame({...game,...shuffled}));replay(shuffled.tiles,shuffled.solution);
});
test('open-board save validation rejects unsafe coordinates, overlap and unknown modes',()=>{
  const original=lockedGame(4),game={...original,...reshuffleGame(original,21)},copy=()=>JSON.parse(JSON.stringify(game));
  const live=game.tiles.map((t,i)=>t.removed?-1:i).filter(i=>i>=0),bad=[];
  let value=copy();value.tiles[live[0]].x=NaN;bad.push(value);
  value=copy();value.tiles[live[0]].y=33;bad.push(value);
  value=copy();value.tiles[live[0]].z=1;bad.push(value);
  value=copy();value.tiles[live[0]].x=value.tiles[live[1]].x;value.tiles[live[0]].y=value.tiles[live[1]].y;bad.push(value);
  value=copy();value.boardMode='other';bad.push(value);
  value=copy();value.boardMode=null;bad.push(value);
  value=copy();delete value.boardMode;bad.push(value);
  for(const item of bad)assert.equal(validateSavedGame(item),false);
  assert.equal(reshuffleGame({tiles:[tile('odd',0,0)]},1),null);
  assert.equal(reshuffleGame({tiles:[tile('a',0,0),tile('b',0,0,1,'dots_02')]},1),null);
});
