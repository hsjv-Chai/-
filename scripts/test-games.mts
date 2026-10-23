import test from 'node:test';
import assert from 'node:assert/strict';
import {patterns,beats,deck,type Card,type GameKind} from '../lib/games/cards.ts';
import {createState,applyAction,publicState,dealRound,allowedExchange,type GameState} from '../lib/games/engine.ts';
let cardId=200;
const cards=(ranks:number[],suit=0):Card[]=>ranks.map(rank=>({id:cardId++,rank,suit}));
const has=(ranks:number[],kind:string,game:GameKind='doudizhu',level=2)=>patterns(cards(ranks),game,level).find(p=>p.kind===kind);
const users=Array.from({length:4},(_,i)=>({id:'user-'+i,nickname:'玩家'+i}));
function seated(game:GameKind):GameState {let s=createState(game,{...users[0],ready:false});for(let i=1;i<s.seats.length;i++)s=applyAction(s,users[i],{type:'join'});return s;}
function begun(game:GameKind){let s=seated(game);for(let i=0;i<s.seats.length;i++)s=applyAction(s,users[i],{type:'ready'},100);return s;}
function playState(game:GameKind,hands:number[][]){const s=seated(game);s.phase='playing';s.hands=hands.map(h=>cards(h));s.round=1;s.turn=0;s.deadline=1000;s.landlord=0;return s;}
const play=(s:GameState,seat:number,indexes:number[])=>applyAction(s,users[seat],{type:'play',cards:indexes.map(i=>s.hands[seat][i].id)},200);
test('decks have unique physical cards and correct counts',()=>{for(const [game,n] of [['doudizhu',54],['guandan',108]] as const){const d=deck(game);assert.equal(d.length,n);assert.equal(new Set(d.map(c=>c.id)).size,n);assert.equal(d.filter(c=>c.rank===17).length,n/54);}});
test('Dou Dizhu all supported combination families and exclusions',()=>{
 for(const [r,k] of [[[3],'single'],[[4,4],'pair'],[[5,5,5],'triple'],[[6,6,6,7],'tripleOne'],[[6,6,6,7,7],'triplePair'],[[3,4,5,6,7],'straight'],[[3,3,4,4,5,5],'pairs'],[[3,3,3,4,4,4],'triples'],[[3,3,3,4,4,4,6,7],'planeOne'],[[3,3,3,4,4,4,6,6,7,7],'planePair'],[[6,6,6,6,7,8],'fourTwo'],[[6,6,6,6,7,7,8,8],'fourPairs'],[[6,6,6,6],'bomb'],[[16,17],'rocket']] as [number[],string][])assert.ok(has(r,k),k);
 assert.equal(has([11,12,13,14,2],'straight'),undefined);assert.equal(has([3,3,4,4],'pairs'),undefined);assert.equal(has([3,3,3,4,4,4,16,17],'planeOne'),undefined);
});
test('comparison enforces family and length; bombs and rockets override',()=>{assert.ok(beats(has([2],'single')!,has([14],'single')!));assert.ok(!beats(has([6,6],'pair')!,has([3],'single')!));assert.ok(!beats(has([4,5,6,7,8,9],'straight')!,has([3,4,5,6,7],'straight')!));assert.ok(beats(has([3,3,3,3],'bomb')!,has([2],'single')!));assert.ok(beats(has([16,17],'rocket')!,has([2,2,2,2],'bomb')!));});
test('Guandan level, exact sequence lengths, A low and high',()=>{assert.ok(beats(has([7],'single','guandan',7)!,has([14],'single','guandan',7)!));assert.ok(has([14,2,3,4,5],'straight','guandan'));assert.ok(has([10,11,12,13,14],'straight','guandan'));assert.ok(has([14,14,2,2,3,3],'pairs','guandan'));assert.ok(has([14,14,14,2,2,2],'triples','guandan'));assert.equal(has([2,3,4,5,6,7],'straight','guandan'),undefined);assert.equal(has([3,3,3,4],'tripleOne','guandan'),undefined);});
test('wildcards, flushes, bombs and joker boundaries',()=>{
 const w=cards([2],1);assert.ok(patterns([...cards([5,6,7,8]),...w],'guandan').some(p=>p.kind==='flush'&&p.rank===9));
 assert.ok(!patterns([...cards([16]),...w],'guandan').some(p=>p.kind==='pair'));
 assert.ok(patterns([...cards([7,7,7,7,7,7,7,7]),...cards([2,2],1)],'guandan').some(p=>p.kind==='bomb'&&p.size===10));
 const five=has([8,8,8,8,8],'bomb','guandan')!,six=has([3,3,3,3,3,3],'bomb','guandan')!,flush=has([3,4,5,6,7],'flush','guandan')!;
 assert.ok(beats(flush,five));assert.ok(beats(six,flush));assert.ok(beats(has([16,16,17,17],'rocket','guandan')!,six));
 const pair=patterns(cards([2,2],1),'guandan');assert.equal(pair.length,1);assert.equal(pair[0].rank,15);
});
test('join, seat selection, ownership, ready and dealing',()=>{let s=seated('guandan');assert.throws(()=>applyAction(s,{id:'fifth',nickname:'五'},{type:'join'}));assert.throws(()=>applyAction(s,users[0],{type:'join',value:1}));s=applyAction(s,users[1],{type:'leave'});s=applyAction(s,users[2],{type:'join',value:1});assert.equal(s.seats[1]?.id,users[2].id);assert.equal(s.seats[2],null);assert.equal(begun('guandan').hands[0].length,27);assert.equal(begun('doudizhu').hands[0].length,17);});
test('bidding validates turn, range, priority and keeps bottom secret',()=>{let s=begun('doudizhu');const first=s.turn;assert.throws(()=>applyAction(s,users[(first+1)%3],{type:'bid',value:3}));s=applyAction(s,users[first],{type:'bid',value:1});assert.equal(publicState(s,users[first].id).bottom.length,0);assert.throws(()=>applyAction(s,users[s.turn],{type:'bid',value:1}));s=applyAction(s,users[s.turn],{type:'bid',value:3});assert.equal(s.phase,'playing');assert.equal(s.hands[s.landlord].length,20);assert.equal(publicState(s,users[0].id).bottom.length,3);});
test('all pass bids select initial caller and play validation rejects forged cards',()=>{let s=begun('doudizhu');const first=s.turn;for(let i=0;i<3;i++)s=applyAction(s,users[s.turn],{type:'bid',value:0});assert.equal(s.landlord,first);assert.throws(()=>applyAction(s,users[s.turn],{type:'pass'}));assert.throws(()=>applyAction(s,users[s.turn],{type:'play',cards:[99999]}));const id=s.hands[s.turn][0].id;assert.throws(()=>applyAction(s,users[s.turn],{type:'play',cards:[id,id]}));});
test('pass cycle, winner and immutable input',()=>{const initial=playState('doudizhu',[[3,4],[5],[6]]);let s=play(initial,0,[0]);assert.equal(initial.hands[0].length,2);s=applyAction(s,users[1],{type:'pass'});s=applyAction(s,users[2],{type:'pass'});assert.equal(s.turn,0);assert.equal(s.last,null);s=play(s,0,[0]);assert.equal(s.phase,'finished');assert.match(s.result,/地主/);});
test('Guandan partner takes lead after finished leader, completed order upgrades',()=>{let s=playState('guandan',[[3],[4],[5,6],[7]]);s=play(s,0,[0]);for(const i of [1,2,3])s=applyAction(s,users[i],{type:'pass'});assert.equal(s.turn,2);assert.equal(s.last,null);s=play(s,2,[0]);s=applyAction(s,users[3],{type:'pass'});s=applyAction(s,users[1],{type:'pass'});s=play(s,2,[0]);assert.equal(s.phase,'roundEnd');assert.equal(s.levels[0],5);assert.deepEqual(s.finish.slice(0,2),[0,2]);});
test('A needs to be played, partner must not finish last',()=>{let s=playState('guandan',[[3],[4],[5],[6]]);s.levels=[14,2];s.level=14;s.finish=[0];s.hands[0]=[];s.turn=2;s=play(s,2,[0]);assert.equal(s.phase,'finished');assert.equal(s.matchWinner,0);
 let t=playState('guandan',[[3],[4],[5],[6]]);t.levels=[13,2];t.level=13;t.finish=[0];t.hands[0]=[];t.turn=2;t=play(t,2,[0]);assert.equal(t.phase,'roundEnd');assert.equal(t.levels[0],14);
 let u=playState('guandan',[[3],[4],[5],[6]]);u.levels=[14,2];u.level=14;u.finish=[0,1];u.hands[0]=[];u.hands[1]=[];u.turn=3;u=play(u,3,[0]);assert.equal(u.phase,'roundEnd');assert.equal(u.levels[0],14);
});
function nextWithHands(finish:number[],hands:Card[][]){const s=seated('guandan');s.finish=finish;s.round=1;const pile:Card[]=[];for(let j=0;j<27;j++)for(let i=0;i<4;i++)pile.push(hands[i][j]);dealRound(s,pile);return s;}
const fixtureHands=()=>Array.from({length:4},()=>cards(Array(27).fill(3)));
test('single tribute, legal max card, capped return and first lead',()=>{const hands=fixtureHands();hands[3][0]=cards([17])[0];let s=nextWithHands([0,1,2,3],hands);assert.equal(s.phase,'tribute');assert.equal(s.turn,3);assert.throws(()=>applyAction(s,users[3],{type:'exchange',cards:[s.hands[3][1].id]}));s=applyAction(s,users[3],{type:'exchange',cards:[s.hands[3][0].id]});assert.equal(s.phase,'return');assert.equal(s.hands[0].length,28);assert.throws(()=>applyAction(s,users[0],{type:'exchange',cards:[s.hands[0].find(c=>c.rank===17)!.id]}));s=applyAction(s,users[0],{type:'exchange',cards:[allowedExchange(s,0)[0].id]});assert.equal(s.phase,'playing');assert.equal(s.turn,3);assert.ok(s.hands.every(h=>h.length===27));});
test('double tribute routes higher tribute to winner; anti tribute works in both modes',()=>{const hands=fixtureHands();hands[1][0]=cards([16])[0];hands[3][0]=cards([17])[0];let s=nextWithHands([0,2,1,3],hands);for(let n=0;n<2;n++)s=applyAction(s,users[s.turn],{type:'exchange',cards:[allowedExchange(s,s.turn)[0].id]});assert.equal(s.tributes.find(t=>t.from===3)?.to,0);assert.equal(s.tributes.find(t=>t.from===1)?.to,2);for(let n=0;n<2;n++)s=applyAction(s,users[s.turn],{type:'exchange',cards:[allowedExchange(s,s.turn)[0].id]});assert.equal(s.turn,3);assert.ok(s.hands.every(h=>h.length===27));
 const double=fixtureHands();double[1][0]=cards([17])[0];double[3][0]=cards([17])[0];const d=nextWithHands([0,2,1,3],double);assert.equal(d.phase,'playing');assert.equal(d.turn,0);assert.match(d.log.at(-1)!,/抗贡/);
 const single=fixtureHands();single[3][0]=cards([17])[0];single[3][1]=cards([17])[0];assert.equal(nextWithHands([0,1,2,3],single).phase,'playing');
});
test('public snapshots reveal only own cards, no future deal or hidden tribute',()=>{const s=begun('doudizhu');const mine=publicState(s,users[0].id);assert.equal(mine.hand.length,17);assert.ok(!('hands' in mine));assert.ok(!('tributes' in mine));assert.equal(publicState(s,'outsider').hand.length,0);assert.equal(mine.bottom.length,0);});
test('timeouts require deadline and membership, reconnect snapshot, departure and rematch',()=>{let s=playState('doudizhu',[[3,4],[5],[6]]);assert.throws(()=>applyAction(s,users[1],{type:'tick'},999));assert.throws(()=>applyAction(s,{id:'outsider',nickname:'x'},{type:'tick'},1001));s=applyAction(s,users[1],{type:'tick'},1001);assert.equal(s.hands[0].length,1);assert.equal(s.turn,1);assert.equal(s.deadline,61001);assert.deepEqual(publicState(JSON.parse(JSON.stringify(s)),users[0].id),publicState(s,users[0].id));s=applyAction(s,users[1],{type:'leave'});assert.equal(s.phase,'finished');assert.equal(s.hands.length,0);assert.throws(()=>applyAction(s,users[2],{type:'rematch'}));s=applyAction(s,users[0],{type:'rematch'});assert.equal(s.phase,'waiting');assert.equal(s.round,0);});
test('both games reach an end with legal timeout play, conserving physical cards',()=>{for(const game of ['doudizhu','guandan'] as const){let s=begun(game);let count=0;while(!['roundEnd','finished'].includes(s.phase)&&count++<1000){s=applyAction(s,users[0],{type:'tick'},s.deadline);assert.equal(new Set(s.hands.flat().map(c=>c.id)).size,s.hands.flat().length);}assert.ok(count<1000);assert.ok(s.result);}});
test('completed Dou Dizhu reveals exactly the unfinished hands to players and spectators',()=>{
 const initial=playState('doudizhu',[[3],[5,4],[6,6]]);
 assert.deepEqual(publicState(initial,users[1].id).revealedHands,[]);
 const end=play(initial,0,[0]);const shown=publicState(end,users[0].id).revealedHands;
 assert.deepEqual(shown.map(h=>h.seat),[1,2]);assert.deepEqual(shown[0].cards.map(c=>c.rank),[5,4]);
 assert.deepEqual(shown[1].cards.map(c=>c.id),end.hands[2].map(c=>c.id));
 assert.deepEqual(publicState(end,'spectator').revealedHands,shown);
 assert.deepEqual(publicState(JSON.parse(JSON.stringify(end)),users[2].id).revealedHands,shown);
 const left=applyAction(end,users[1],{type:'leave'});assert.deepEqual(publicState(left,users[0].id).revealedHands,shown);
 const fresh=applyAction(left,users[0],{type:'rematch'});assert.deepEqual(publicState(fresh,users[0].id).revealedHands,[]);
 const legacy=structuredClone(end);delete legacy.revealedHands;assert.deepEqual(publicState(legacy,users[0].id).revealedHands,shown);
});
test('Guandan reveals on double-up, third finisher and match win; clears before next deal',()=>{
 for(const finalA of [false,true]){
  let s=playState('guandan',[[],[4,4],[5],[6,6]]);s.finish=[0];s.turn=2;
  if(finalA){s.level=14;s.levels=[14,2];}
  s=play(s,2,[0]);assert.equal(s.phase,finalA?'finished':'roundEnd');
  const shown=publicState(s,users[0].id).revealedHands;assert.deepEqual(shown.map(h=>h.seat),[1,3]);
  if(!finalA){const left=applyAction(s,users[1],{type:'leave'});assert.deepEqual(publicState(left,users[0].id).revealedHands,shown);
   for(const u of users)s=applyAction(s,u,{type:'ready'});
   assert.deepEqual(publicState(s,users[0].id).revealedHands,[]);assert.deepEqual(s.revealedHands,[]);
  }
 }
 let third=playState('guandan',[[],[],[7],[8,9]]);third.finish=[0,1];third.turn=2;third=play(third,2,[0]);assert.deepEqual(publicState(third,'spectator').revealedHands.map(h=>h.seat),[3]);
});
test('no remaining-hand disclosure during play, tribute, bidding, or aborted games',()=>{
 for(const game of ['guandan','doudizhu'] as const){const s=begun(game);assert.deepEqual(publicState(s,'spectator').revealedHands,[]);
  const left=applyAction(s,users[1],{type:'leave'});assert.deepEqual(publicState(left,users[0].id).revealedHands,[]);
  for(const phase of ['playing','bidding','tribute','return','waiting','closed'] as const){const stale=structuredClone(s);stale.phase=phase;stale.revealedHands=[{seat:1,nickname:'old',cards:s.hands[1]}];assert.deepEqual(publicState(stale,'spectator').revealedHands,[]);}
 }
});
