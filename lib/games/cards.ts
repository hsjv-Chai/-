export type GameKind = 'doudizhu' | 'guandan';
export type Card = { id: number; rank: number; suit: number };
export type Pattern = { key: string; kind: string; size: number; rank: number; power: number; label: string };
export const rankName = (rank: number) => ({11:'J',12:'Q',13:'K',14:'A',16:'小王',17:'大王'}[rank] || String(rank));
export const suits = ['♠','♥','♣','♦'];
export const cardName = (c: Card) => c.rank > 14 ? rankName(c.rank) : suits[c.suit] + rankName(c.rank);
export const isWild = (c: Card, level: number) => c.rank === level && c.suit === 1;
export const weight = (rank: number, game: GameKind, level = 2) => rank > 14 ? rank : game === 'doudizhu' ? (rank === 2 ? 15 : rank) : rank === level ? 15 : rank;
export const sortCards = (cards: Card[], game: GameKind, level = 2) => [...cards].sort((a,b) => weight(b.rank,game,level)-weight(a.rank,game,level) || a.suit-b.suit || a.id-b.id);
export function randomInt(max: number) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}
export function deck(game: GameKind): Card[] {
  const cards: Card[] = [];
  for (let d=0;d<(game==='guandan'?2:1);d++) {
    for(let rank=2;rank<=14;rank++) for(let suit=0;suit<4;suit++) cards.push({id:cards.length,rank,suit});
    for(const rank of [16,17]) cards.push({id:cards.length,rank,suit:4});
  }
  for(let i=cards.length-1;i>0;i--) {const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
  return cards;
}
const labels: Record<string,string> = {single:'单张',pair:'对子',triple:'三张',tripleOne:'三带一',triplePair:'三带二',straight:'顺子',pairs:'连对',triples:'飞机',planeOne:'飞机带单',planePair:'飞机带对',fourTwo:'四带二',fourPairs:'四带两对',bomb:'炸弹',rocket:'王炸',flush:'同花顺'};
// All interpretations are returned: a wildcard combination may have more than one legal declaration.
export function patterns(cards: Card[], game: GameKind, level = 2): Pattern[] {
  const n=cards.length;
  if(!n || n>27 || new Set(cards.map(c=>c.id)).size!==n) return [];
  const result = new Map<string,Pattern>();
  const add=(kind:string,rank:number,power=0)=>{
    const key=`${kind}:${n}:${rank}`;
    result.set(key,{key,kind,size:n,rank,power,label:`${game==='guandan'&&kind==='triples'?'钢板':game==='guandan'&&kind==='pairs'?'三连对':labels[kind]} · ${rankName(rank===15?(game==='guandan'?level:2):rank)}${kind==='bomb'?`（${n}张）`:''}`});
  };
  const wild = game==='guandan' && n>1 && !cards.every(c=>isWild(c,level)) ? cards.filter(c=>isWild(c,level)) : [];
  const wildIDs=new Set(wild.map(c=>c.id));
  const base=cards.filter(c=>!wildIDs.has(c.id)).map(c=>c.rank);
  function evaluate(ranks: number[]) {
    const counts=new Map<number,number>();
    ranks.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
    const entries=[...counts];
    const w=(r:number)=>weight(r,game,level);
    if(n===1) add('single',w(ranks[0]));
    if(entries.length===1) {
      const r=entries[0][0];
      if(n===2 && (r<=14 || !wild.length)) add('pair',w(r));
      if(n===3 && r<=14) add('triple',w(r));
      if(r<=14 && (game==='doudizhu'?n===4:n>=4&&n<=10)) add('bomb',w(r),game==='doudizhu'?100:100+n*10);
    }
    if(game==='doudizhu' && n===2 && counts.has(16)&&counts.has(17)) add('rocket',17,1000);
    if(game==='guandan' && n===4 && counts.get(16)===2&&counts.get(17)===2) add('rocket',17,1000);
    for(const [r,c] of entries) {
      const rest=entries.filter(([q])=>q!==r);
      if(c===3 && n===4 && game==='doudizhu') add('tripleOne',w(r));
      if(c===3 && n===5 && rest.length===1&&rest[0][1]===2) add('triplePair',w(r));
      if(game==='doudizhu'&&c===4) {
        if(n===6) add('fourTwo',w(r));
        if(n===8&&rest.length===2&&rest.every(([,v])=>v===2)) add('fourPairs',w(r));
      }
    }
    const sequences = game==='doudizhu' ? [Array.from({length:12},(_,i)=>i+3)] : [[14,2,3,4,5,6,7,8,9,10,11,12,13],Array.from({length:13},(_,i)=>i+2)];
    for(const seq of sequences) for(let length=2;length<=seq.length;length++) for(let start=0;start+length<=seq.length;start++) {
      const run=seq.slice(start,start+length), high=run.at(-1)!;
      if(run.some(r=>!counts.has(r))) continue;
      if(n===length && (game==='doudizhu'?length>=5:length===5)&&run.every(r=>counts.get(r)===1)) {
        add('straight',high);
        const natural=cards.filter(c=>!wildIDs.has(c.id));
        if(game==='guandan'&&natural.every(c=>c.suit===natural[0]?.suit)) add('flush',high,155);
      }
      if(n===length*2&&(game==='doudizhu'?length>=3:length===3)&&run.every(r=>counts.get(r)===2)) add('pairs',high);
      if(run.every(r=>counts.get(r)===3)) {
        if(n===length*3&&(game==='doudizhu'||length===2)) add('triples',high);
        if(game==='doudizhu') {
          const rest=entries.filter(([r])=>!run.includes(r));
          if(n===length*4&&rest.every(([,c])=>c<=2)&&!(counts.has(16)&&counts.has(17))) add('planeOne',high);
          if(n===length*5&&rest.length===length&&rest.every(([,c])=>c===2)) add('planePair',high);
        }
      }
    }
  }
  function expand(ranks:number[],left:number) {
    if(!left) return evaluate(ranks);
    for(let r=2;r<=14;r++) expand([...ranks,r],left-1);
  }
  expand(base,wild.length);
  return [...result.values()].sort((a,b)=>a.power-b.power||a.rank-b.rank||a.kind.localeCompare(b.kind));
}
export function beats(next: Pattern, previous: Pattern | null) {
  if(!previous) return true;
  if(next.power!==previous.power) return next.power>previous.power;
  return next.kind===previous.kind&&next.size===previous.size&&next.rank>previous.rank;
}
