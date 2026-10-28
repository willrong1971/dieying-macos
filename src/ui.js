export const suitNames={dots:'筒',bamboo:'条',characters:'万',winds:'风牌',dragons:'三元牌'};
export let tilePreviewBase='/public/tiles/ivory-warm/';
export function setTilePreviewTheme(theme){tilePreviewBase=theme==='ivory'?'/public/tiles/ivory-warm/':'/public/tiles/v2/';}
const numerals=['一','二','三','四','五','六','七','八','九'];
const honours={wind_east:'东风',wind_south:'南风',wind_west:'西风',wind_north:'北风',dragon_red:'红中',dragon_green:'发财',dragon_white:'白板'};
export function tileLabel(face){
  if(honours[face])return honours[face];
  const [suit,rank]=String(face).split('_');
  return numerals[Number(rank)-1]?(numerals[Number(rank)-1]+(suitNames[suit]||'')):String(face);
}
export function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
let count=0;
export function resetTileCount(){count=0;}
export function tile(face,opts={}){
  const label=opts.label||tileLabel(face);
  const action=opts.action==='none'?'':opts.action||'';const value=opts.value??face;const tag=action?'button':'span';
  const disabled=!!opts.disabled&&!!action;const fixed=disabled&&['线索','固定'].includes(opts.tag);
  const id=opts.id??`${action}:${value}:${count++}`;
  return `<${tag} ${action?'type="button"':'role="img"'} class="tile ${!action?'tile-static':''} ${fixed?'tile-fixed':''} ${opts.small?'tile-small':''} ${opts.selected?'selected':''} ${opts.back?'is-back':''} ${disabled?'tile-disabled':''}" data-face="${escape(face)}" data-model-id="${escape(id)}" data-back="${opts.back?'1':'0'}" data-angle="${opts.angle||0}" ${action?`data-action="${escape(action)}" data-value="${escape(value)}" draggable="false"`:''} aria-label="${escape(opts.back?label+'，背面':label)}" ${action?`aria-pressed="${!!opts.selected}"`:''} ${disabled?'disabled':''}><span class="tile-fallback" aria-hidden="true">${opts.back?'<span class="tile-back-face"></span>':`<img src="${tilePreviewBase}${escape(face)}.png" alt="" draggable="false" loading="lazy">`}</span>${opts.tag?`<span class="tile-tag">${escape(opts.tag)}</span>`:''}<span class="tile-caption">${escape(label)}</span></${tag}>`;
}
export function button(text,action,value='',opts={}){return `<button type="button" class="${opts.primary?'btn-primary':'btn-secondary'} ${escape(opts.className||'')}" data-action="${escape(action)}" data-value="${escape(value)}" ${opts.disabled?'disabled':''}>${escape(text)}</button>`;}
export function progress(current,total){const ratio=total?Math.min(1,current/total):0;return `<div class="mini-progress" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${total}"><span style="width:${ratio*100}%"></span></div><span class="progress-copy">${current} / ${total}</span>`;}
export const h={tile,button,escape,progress};
export function storageRead(key,fallback){try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback;}catch{return fallback;}}
export function storageWrite(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
