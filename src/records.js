/** Validate an entire imported profile before committing any user data. */
export function validateProfile(profile,games,helpers){
  const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const safeState=(value,depth=0)=>{
    if(depth>30)throw new Error('关卡存档过深');
    if(typeof value==='string'&&/[<>"'`]/.test(value))throw new Error('关卡存档包含无效字符');
    if(value&&typeof value==='object')for(const child of Object.values(value))safeState(child,depth+1);
  };
  if(!isObject(profile)||profile.schema!==1||!isObject(profile.states)||!isObject(profile.notes)||!Array.isArray(profile.discoveries))throw new Error('记录结构不完整');
  const byId=new Map(games.map(g=>[g.id,g]));
  if(!['ivory','bamboo','porcelain'].includes(profile.material))throw new Error('材质记录无效');
  for(const [key,note] of Object.entries(profile.notes)){
    if(typeof note!=='string'||note.length>20000||!/^G\d+(A|B)?:\d+$/.test(key))throw new Error('发现文字无效');
  }
  for(const item of profile.discoveries){
    if(!isObject(item))throw new Error('发现条目无效');
    const game=byId.get(item.gameId);
    if(!game||!Number.isInteger(item.level)||item.level<0||item.level>=game.levels.length||!Number.isFinite(Date.parse(item.time)))throw new Error('发现关卡无效');
    if(typeof item.title!=='string'||typeof item.explanation!=='string'||typeof item.note!=='string')throw new Error('发现内容无效');
  }
  for(const [key,saved] of Object.entries(profile.states)){
    const match=key.match(/^(G\d+(?:A|B)?):(\d+)$/);const game=match&&byId.get(match[1]);
    if(!game||Number(match[2])>=game.levels.length||!isObject(saved)||!isObject(saved.state)||saved.state.level!==Number(match[2])||typeof saved.state.complete!=='boolean')throw new Error('关卡存档无效');
    if(!Number.isInteger(saved.hintIndex)||saved.hintIndex< -1||typeof saved.explanation!=='boolean')throw new Error('提示存档无效');
    safeState(saved.state);
    game.view(saved.state,helpers);
  }
  return JSON.parse(JSON.stringify(profile));
}
