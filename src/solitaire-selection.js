import {blockedReason,isFree,removePair} from './solitaire-engine.js';

// An unmatched attempt leaves the first tile as the pairing anchor.
export function selectTile(tiles,selected,id){
  if(id===null)return {kind:'clear',selected:null};
  const tile=tiles.find(item=>item.id===id);
  if(!tile||tile.removed)return {kind:'ignored',selected};
  if(selected===id)return {kind:'clear',selected:null};
  const anchor=selected!==null&&isFree(tiles,selected)?selected:null;
  const reason=blockedReason(tiles,id);
  if(reason)return {kind:'blocked',selected:anchor,reason};
  if(anchor===null)return {kind:'select',selected:id};
  const next=removePair(tiles,anchor,id);
  return next?{kind:'pair',selected:null,tiles:next,pair:[anchor,id]}:{kind:'mismatch',selected:anchor};
}
