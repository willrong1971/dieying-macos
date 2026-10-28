import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTile} from '../src/solitaire-selection.js';

const tile=(id,x,face='dots_01',y=0,z=0)=>({id,x,y,z,face,removed:false});
const freeze=tiles=>Object.freeze(tiles.map(item=>Object.freeze(item)));

test('one-click attempts keep the first anchor through two mismatches and remove its matching partner',()=>{
  const tiles=freeze([tile('A',0),tile('B',2,'dots_02'),tile('C',4,'bamboo_01'),tile('D',6)]);
  const before=structuredClone(tiles);
  const first=selectTile(tiles,null,'A');
  assert.deepEqual(first,{kind:'select',selected:'A'});
  const second=selectTile(tiles,first.selected,'B');
  assert.deepEqual(second,{kind:'mismatch',selected:'A'});
  const third=selectTile(tiles,second.selected,'C');
  assert.deepEqual(third,{kind:'mismatch',selected:'A'});
  const match=selectTile(tiles,third.selected,'D');
  assert.equal(match.kind,'pair');assert.equal(match.selected,null);
  assert.deepEqual(match.pair,['A','D']);
  assert.deepEqual(match.tiles.filter(item=>item.removed).map(item=>item.id),['A','D']);
  assert.deepEqual(tiles,before,'selection and matching never mutate the original board');
});

test('clicking the anchor again or clicking blank table space immediately clears selection',()=>{
  const tiles=freeze([tile('A',0),tile('B',2)]);
  assert.deepEqual(selectTile(tiles,'A','A'),{kind:'clear',selected:null});
  assert.deepEqual(selectTile(tiles,'A',null),{kind:'clear',selected:null});
  assert.deepEqual(selectTile(tiles,null,null),{kind:'clear',selected:null});
  assert.deepEqual(selectTile(tiles,null,'B'),{kind:'select',selected:'B'});
});

test('covered and side-blocked attempts retain the anchor and report the actual rule',()=>{
  const covered=freeze([tile('A',5),tile('covered',0),tile('top',0,'dots_02',0,1)]);
  assert.deepEqual(selectTile(covered,'A','covered'),{kind:'blocked',selected:'A',reason:'covered'});
  const sided=freeze([tile('A',5),tile('left',-1),tile('center',0),tile('right',1)]);
  assert.deepEqual(selectTile(sided,'A','center'),{kind:'blocked',selected:'A',reason:'sides'});
  assert.deepEqual(selectTile(sided,null,'center'),{kind:'blocked',selected:null,reason:'sides'});
});

test('missing and removed targets cannot steal or cancel the current anchor',()=>{
  const tiles=freeze([tile('A',0),{...tile('gone',2),removed:true}]);
  for(const id of ['missing','gone',undefined]){
    assert.deepEqual(selectTile(tiles,'A',id),{kind:'ignored',selected:'A'});
  }
});

test('a stale missing, removed or newly blocked anchor is discarded before a fresh selection',()=>{
  const tiles=freeze([tile('D',5),{...tile('gone',7),removed:true},tile('covered',0),tile('top',0,'dots_02',0,1)]);
  for(const anchor of ['missing','gone','covered']){
    assert.deepEqual(selectTile(tiles,anchor,'D'),{kind:'select',selected:'D'});
  }
});

test('four identical physical tiles still remove only the two clicked legal tiles',()=>{
  const tiles=freeze([tile('A',0),tile('B',2),tile('C',4),tile('D',6)]);
  const result=selectTile(tiles,'C','A');
  assert.equal(result.kind,'pair');assert.deepEqual(result.pair,['C','A']);
  assert.deepEqual(result.tiles.filter(item=>item.removed).map(item=>item.id),['A','C']);
  assert.deepEqual(result.tiles.filter(item=>!item.removed).map(item=>item.id),['B','D']);
  assert.ok(result.tiles.every(item=>!tiles.includes(item)),'the resulting board has its own records');
});

test('flower and season families match internally while attempts across families keep the anchor',()=>{
  const tiles=freeze([tile('plum',0,'flower_plum'),tile('orchid',2,'flower_orchid'),tile('spring',4,'season_spring'),tile('winter',6,'season_winter')]);
  assert.deepEqual(selectTile(tiles,'plum','spring'),{kind:'mismatch',selected:'plum'});
  const flowers=selectTile(tiles,'plum','orchid');
  assert.equal(flowers.kind,'pair');assert.deepEqual(flowers.pair,['plum','orchid']);
  const seasons=selectTile(flowers.tiles,'spring','winter');
  assert.equal(seasons.kind,'pair');assert.equal(seasons.tiles.filter(item=>!item.removed).length,0);
});
