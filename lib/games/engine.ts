import {type Card,type GameKind,type Pattern,deck,randomInt,sortCards,patterns,beats,weight,isWild,cardName,rankName} from './cards.ts';
export type Seat = { id:string; nickname:string; ready:boolean };
export type Phase = 'waiting'|'bidding'|'tribute'|'return'|'playing'|'roundEnd'|'finished'|'closed';
export type Tribute = {from:number;to:number;card:Card|null;returned:Card|null};
export type RevealedHand = {seat:number; nickname:string; cards:Card[]};
export type GameState = {
  game:GameKind; host:string; seats:(Seat|null)[]; phase:Phase; hands:Card[][];
  turn:number; deadline:number; round:number; bottom:Card[]; landlord:number;
  bids:(number|null)[]; bidStart:number; highBid:number;
  last:{seat:number;cards:Card[];pattern:Pattern}|null; passes:number[];
  finish:number[]; previousFinish:number[]; levels:number[]; level:number; activeTeam:number;
  tributes:Tribute[]; leadAfterTribute:number; matchWinner:number|null;
  result:string; log:string[]; revealedHands?:RevealedHand[];
};
export type GameAction = {type:string; cards?:unknown; pattern?:unknown; value?:unknown};
export function check(condition:unknown,message:string):asserts condition { if(!condition) throw Object.assign(new Error(message),{status:400}); }
export const capacity=(game:GameKind)=>game==='doudizhu'?3:4;
export const activePhase=(phase:Phase)=>['bidding','tribute','return','playing'].includes(phase);
function note(s:GameState,text:string) { s.log=[...s.log.slice(-39),text]; }
function name(s:GameState,seat:number){return s.seats[seat]?.nickname||'玩家';}
export function createState(game:GameKind,host:Seat):GameState {
  return {game,host:host.id,seats:[host,...Array(capacity(game)-1).fill(null)],phase:'waiting',hands:[],turn:0,deadline:0,round:0,bottom:[],landlord:-1,bids:[],bidStart:0,highBid:0,last:null,passes:[],finish:[],previousFinish:[],levels:[2,2],level:2,activeTeam:0,tributes:[],leadAfterTribute:0,matchWinner:null,result:'',log:['房间已创建，邀请朋友入座吧。']};
}
function nextActive(s:GameState,seat:number) { for(let i=1;i<=s.seats.length;i++){const n=(seat+i)%s.seats.length;if(s.hands[n]?.length)return n;}return seat; }
function resetDeadline(s:GameState,time:number){s.deadline=activePhase(s.phase)?time+60000:0;}
function remainingHands(s:GameState):RevealedHand[] {
  return s.hands.flatMap((hand,seat)=>hand.length?[{seat,nickname:name(s,seat),cards:sortCards(hand,s.game,s.level)}]:[]);
}
function completedHands(s:GameState):RevealedHand[] {
  if(s.phase!=='roundEnd'&&s.phase!=='finished')return [];
  if(s.revealedHands)return s.revealedHands;
  // Existing completed rooms predate the snapshot field; interrupted rooms have no hands.
  return s.hands.length===capacity(s.game)&&s.finish.length===(s.game==='doudizhu'?1:4)?remainingHands(s):[];
}
function finishRound(s:GameState) {
  s.revealedHands=remainingHands(s);
  if(s.game==='doudizhu') {
    const win=s.finish[0]===s.landlord;
    s.phase='finished';s.matchWinner=win?s.landlord:-1;s.result=`${win?'地主':'农民'}获胜！`;
  } else {
    const team=s.finish[0]%2,partner=(s.finish[0]+2)%4;
    const place=s.finish.indexOf(partner);
    // A must actually be played by this team; reaching A via an upgrade is not a win.
    if(s.activeTeam===team&&s.level===14&&place<3) {
      s.phase='finished';s.matchWinner=team;s.result=`${team===0?'一':'二'}队成功过 A，赢得本场！`;
    } else {
      const advance=place===1?3:place===2?2:1;
      s.levels[team]=Math.min(14,s.levels[team]+advance);s.activeTeam=team;
      s.phase='roundEnd';s.result=`${team===0?'一':'二'}队获胜，${place===1?'双上':place===2?'头三':'头末'} · 下副打 ${rankName(s.levels[team])}`;
    }
  }
  s.seats.forEach(p=>{if(p)p.ready=false;});note(s,s.result);
}
function finishBidding(s:GameState) {
  if(s.landlord<0){s.landlord=s.bidStart;s.highBid=1;note(s,'无人叫分，首叫玩家以 1 分成为地主。');}
  s.hands[s.landlord].push(...s.bottom);s.turn=s.landlord;s.phase='playing';
  note(s,`${name(s,s.landlord)}成为地主（${s.highBid}分）。`);
}
function setupTribute(s:GameState) {
  const [first,second,,last]=s.previousFinish;
  const double=first%2===second%2;
  const donors=double?s.previousFinish.slice(2):[last];
  if(donors.flatMap(i=>s.hands[i]).filter(c=>c.rank===17).length===2) {
    note(s,`${donors.map(i=>name(s,i)).join('、')}持两张大王，抗贡；上游先出。`);
    s.phase='playing';s.turn=first;return;
  }
  s.tributes=donors.map(from=>({from,to:-1,card:null,returned:null}));s.phase='tribute';s.turn=donors[0];
  note(s,double?'本副双贡，请依次进贡。':'本副单贡，下游向上游进贡。');
}
export function dealRound(s:GameState,pile=deck(s.game)) {
  const n=capacity(s.game);
  s.revealedHands=[];s.previousFinish=[...s.finish];s.finish=[];s.last=null;s.passes=[];s.result='';s.tributes=[];
  s.round++;s.level=s.levels[s.activeTeam];s.hands=Array.from({length:n},()=>[]);
  const dealt=s.game==='doudizhu'?51:108;
  for(let i=0;i<dealt;i++)s.hands[i%n].push(pile[i]);
  s.bottom=pile.slice(dealt);s.turn=randomInt(n);
  s.seats.forEach(p=>{if(p)p.ready=false;});
  note(s,`第 ${s.round} 副开始${s.game==='guandan'?`，打 ${rankName(s.level)}`:''}。`);
  if(s.game==='doudizhu'){s.phase='bidding';s.bidStart=s.turn;s.bids=[null,null,null];s.highBid=0;s.landlord=-1;}
  else if(s.previousFinish.length===4) setupTribute(s);
  else s.phase='playing';
}
export function allowedExchange(s:GameState,seat:number):Card[] {
  const hand=s.hands[seat]||[];
  if(s.phase==='tribute') {
    const pool=hand.filter(c=>!isWild(c,s.level));
    const max=Math.max(...pool.map(c=>weight(c.rank,s.game,s.level)));
    return pool.filter(c=>weight(c.rank,s.game,s.level)===max);
  }
  if(s.phase==='return') {
    const small=hand.filter(c=>c.rank<=10&&c.rank!==s.level);
    if(small.length)return small;
    const min=Math.min(...hand.map(c=>weight(c.rank,s.game,s.level)));
    return hand.filter(c=>weight(c.rank,s.game,s.level)===min);
  }
  return [];
}
function exchange(s:GameState,seat:number,card:Card) {
  check(allowedExchange(s,seat).some(c=>c.id===card.id),s.phase==='tribute'?'请进贡除红心级牌外的最大牌':'还贡须选不大于 10 的非级牌；没有时还最小牌');
  if(s.phase==='tribute') {
    const item=s.tributes.find(t=>t.from===seat&&!t.card)!;item.card=card;
    const next=s.tributes.find(t=>!t.card);
    if(next){s.turn=next.from;return;}
    // Equal tributes are assigned in randomized order, fixed and persisted once.
    if(s.tributes.length===2&&weight(s.tributes[0].card!.rank,s.game,s.level)===weight(s.tributes[1].card!.rank,s.game,s.level)&&randomInt(2))s.tributes.reverse();
    s.tributes.sort((a,b)=>weight(b.card!.rank,s.game,s.level)-weight(a.card!.rank,s.game,s.level));
    s.tributes.forEach((t,i)=>{
      t.to=s.previousFinish[i];s.hands[t.from]=s.hands[t.from].filter(c=>c.id!==t.card!.id);s.hands[t.to].push(t.card!);
      note(s,`${name(s,t.from)}向${name(s,t.to)}进贡 ${cardName(t.card!)}。`);
    });
    s.leadAfterTribute=s.tributes[0].from;s.phase='return';s.turn=s.tributes[0].to;
  } else {
    const item=s.tributes.find(t=>t.to===seat&&!t.returned)!;item.returned=card;
    s.hands[seat]=s.hands[seat].filter(c=>c.id!==card.id);s.hands[item.from].push(card);
    note(s,`${name(s,seat)}向${name(s,item.from)}还贡 ${cardName(card)}。`);
    const next=s.tributes.find(t=>!t.returned);
    if(next)s.turn=next.to;else {s.phase='playing';s.turn=s.leadAfterTribute;}
  }
}
function endTrickIfPassed(s:GameState) {
  if(!s.last)return;
  const other=s.hands.map((h,i)=>h.length&&i!==s.last!.seat?i:-1).filter(i=>i>=0);
  if(other.every(i=>s.passes.includes(i))) {
    let lead=s.last.seat;
    if(!s.hands[lead].length) {
      const partner=(lead+2)%4;
      lead=s.game==='guandan'&&s.hands[partner].length?partner:nextActive(s,lead);
      note(s,`${name(s,lead)}接风，重新领出。`);
    }
    s.turn=lead;s.last=null;s.passes=[];
  }
}
export function applyAction(input:GameState,user:{id:string;nickname:string},action:GameAction,time=Date.now()):GameState {
  const s=structuredClone(input);let seat=s.seats.findIndex(p=>p?.id===user.id);
  if(action.type==='join') {
    check(s.phase==='waiting','牌局已经开始，请加入其他房间');
    const target=typeof action.value==='number'&&Number.isInteger(action.value)?action.value:s.seats.findIndex(p=>!p);
    if(seat>=0&&target===seat)return s;
    check(target>=0&&target<s.seats.length&&!s.seats[target],'座位已被占用或房间已满');
    if(seat>=0)s.seats[seat]=null;
    seat=target;s.seats[seat]={id:user.id,nickname:user.nickname,ready:false};note(s,`${user.nickname}入座。`);return s;
  }
  check(seat>=0,'你尚未加入这个房间');check(s.phase!=='closed','房间已关闭');
  if(action.type==='leave') {
    s.revealedHands=completedHands(s);
    if(activePhase(s.phase)||s.phase==='roundEnd') {
      // An explicit departure ends the match, preventing a permanently occupied seat.
      s.phase='finished';s.result=`${user.nickname}退出，本场提前结束。`;s.matchWinner=null;s.deadline=0;
      s.hands=[];s.last=null;note(s,s.result);
    }
    s.seats[seat]=null;
    if(s.host===user.id)s.host=s.seats.find(p=>p)?.id||'';
    if(!s.host)s.phase='closed';return s;
  }
  if(action.type==='ready') {
    check(['waiting','roundEnd'].includes(s.phase),'当前不能准备');
    s.seats[seat]!.ready=!s.seats[seat]!.ready;
    if(s.seats.every(p=>p?.ready)){dealRound(s);resetDeadline(s,time);}return s;
  }
  if(action.type==='rematch') {
    check(s.phase==='finished','本场尚未结束');check(s.host===user.id,'只有房主可以重开');
    const fresh=createState(s.game,{...s.seats[seat]!,ready:false});fresh.seats=s.seats.map(p=>p?{...p,ready:false}:null);return fresh;
  }
  if(action.type==='tick') {
    check(activePhase(s.phase)&&time>=s.deadline,'尚未到自动操作时间');
    const player=s.seats[s.turn]!;
    const auto:GameAction=s.phase==='bidding'?{type:'bid',value:0}:s.phase==='tribute'||s.phase==='return'?{type:'exchange',cards:[allowedExchange(s,s.turn)[0].id]}:s.last?{type:'pass'}:{type:'play',cards:[sortCards(s.hands[s.turn],s.game,s.level).at(-1)!.id]};
    const result=applyAction(s,player,auto,time);note(result,`${player.nickname}超时，已自动${auto.type==='pass'?'过牌':auto.type==='bid'?'不叫':auto.type==='exchange'?'贡还牌':'出牌'}。`);return result;
  }
  check(activePhase(s.phase),'当前不在出牌阶段');check(s.turn===seat,'还没有轮到你');
  if(action.type==='bid') {
    check(s.phase==='bidding','叫分阶段已结束');const v=action.value;
    check(typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=3&&(v===0||v>s.highBid),'叫分须高于当前最高分');
    s.bids[seat]=v;if(v){s.highBid=v;s.landlord=seat;}
    note(s,`${user.nickname}${v?`叫 ${v} 分`:'不叫'}。`);
    if(v===3||s.bids.every(v=>v!==null))finishBidding(s);else s.turn=(seat+1)%3;
  } else if(action.type==='pass') {
    check(s.phase==='playing'&&s.last,'你是本轮领出者，不能过牌');
    check(s.last.seat!==seat,'你是本轮领出者，不能过牌');
    s.passes.push(seat);note(s,`${user.nickname}过牌。`);s.turn=nextActive(s,seat);endTrickIfPassed(s);
  } else if(action.type==='play'||action.type==='exchange') {
    check(Array.isArray(action.cards)&&action.cards.length>0&&action.cards.length<=27&&action.cards.every(Number.isInteger),'请选择要出的牌');
    const ids=action.cards as number[];check(new Set(ids).size===ids.length,'不能重复选择同一张牌');
    const selected=ids.map(id=>s.hands[seat].find(c=>c.id===id));check(selected.every(Boolean),'所选牌不在你的手中');const cards=selected as Card[];
    if(action.type==='exchange') {
      check((s.phase==='tribute'||s.phase==='return')&&cards.length===1,'请选择一张贡还牌');exchange(s,seat,cards[0]);
    } else {
      check(s.phase==='playing','当前不能出牌');
      const options=patterns(cards,s.game,s.level).filter(p=>beats(p,s.last?.pattern||null));
      const pattern=action.pattern?options.find(p=>p.key===action.pattern):options[0];
      check(pattern,'牌型不合法，或未大过桌面上的牌');
      s.hands[seat]=s.hands[seat].filter(c=>!ids.includes(c.id));s.last={seat,cards,pattern};s.passes=[];
      note(s,`${user.nickname}：${cards.map(cardName).join(' ')}（${pattern.label}）`);
      if(!s.hands[seat].length) {
        s.finish.push(seat);note(s,`${user.nickname}出完了，第 ${s.finish.length} 名。`);
        if(s.game==='doudizhu')finishRound(s);
        else if(s.finish.length===3||(s.finish.length===2&&s.finish[0]%2===s.finish[1]%2)){
          s.finish.push(...s.seats.map((_,i)=>i).filter(i=>!s.finish.includes(i)));finishRound(s);
        }
      }
      if(s.phase==='playing')s.turn=nextActive(s,seat);
    }
  } else check(false,'未知的牌室操作');
  resetDeadline(s,time);return s;
}
// Whitelist output fields. Other hands are public only after a completed round.
export function publicState(s:GameState,userId:string) {
  const seat=s.seats.findIndex(p=>p?.id===userId);
  return {game:s.game,host:s.host,seats:s.seats.map((p,i)=>p?{...p,count:s.hands[i]?.length||0}:null),phase:s.phase,turn:s.turn,deadline:s.deadline,round:s.round,
    hand:seat>=0?sortCards(s.hands[seat]||[],s.game,s.level):[],seat,
    bottom:s.game==='doudizhu'&&s.landlord>=0&&s.phase!=='bidding'?s.bottom:[],landlord:s.landlord,bids:s.bids,highBid:s.highBid,
    last:s.last,passes:s.passes,finish:s.finish,levels:s.levels,level:s.level,activeTeam:s.activeTeam,matchWinner:s.matchWinner,result:s.result,
    revealedHands:completedHands(s),log:s.log,exchangeAllowed:seat===s.turn?allowedExchange(s,seat).map(c=>c.id):[]};
}
export type PublicState=ReturnType<typeof publicState>;
