"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Check,Copy,DoorOpen,LoaderCircle,Plus,RefreshCw,Spade,Users} from 'lucide-react';
import {appPath} from '@/lib/paths';
import {type Card,type GameKind,cardName,rankName,suits,patterns,beats,isWild} from '@/lib/games/cards';
import type {PublicState} from '@/lib/games/engine';
type User={id:string;nickname:string};
type Room=PublicState&{id:string;version:number;serverTime:number;accountEnded?:boolean};
type Summary={id:string;game:GameKind;phase:string;seats:({id:string;nickname:string}|null)[];round:number;mine:boolean;updatedAt:number};
const gameName=(game:GameKind)=>game==='doudizhu'?'斗地主':'掼蛋';
const phases:Record<string,string>={waiting:'等待入座',bidding:'叫地主',tribute:'进贡',return:'还贡',playing:'对局中',roundEnd:'本副结束',finished:'本场结束',closed:'已关闭'};
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(appPath('/api/games'+path),{cache:'no-store',...init,headers:{'Content-Type':'application/json',...init?.headers}});
  const data=await response.json() as T & {error?:string};if(!response.ok)throw Object.assign(new Error(data.error||'请求失败'),{status:response.status});return data;
}
function CardFace({card,selected,onClick,wild=false,small=false,disabled=false}:{card:Card;selected?:boolean;onClick?:()=>void;wild?:boolean;small?:boolean;disabled?:boolean}){
  const inner=<><span className="card-rank">{rankName(card.rank)}</span><span className="card-suit">{card.rank>14?'✦':suits[card.suit]}</span>{wild&&<span className="wild-tag">配</span>}</>;
  const cls=`playing-card ${card.suit===1||card.suit===3||card.rank===17?'red-card':''} ${selected?'picked':''} ${small?'compact-card':''} ${card.rank>14?'joker-card':''}`;
  return onClick?<button type="button" className={cls} aria-label={cardName(card)+(wild?'，逢人配':'')} aria-pressed={!!selected} onClick={onClick} disabled={disabled}>{inner}</button>:<span className={cls} aria-label={cardName(card)}>{inner}</span>;
}
function Rules(){return <details className="game-rules"><summary>怎么玩 · 本牌室规则</summary><div>
  <h3>斗地主 · 3 人</h3><p>每人 17 张，3 张底牌归地主。依次叫 1–3 分或不叫，最高者为地主；全不叫时首叫者以 1 分当地主。地主先出，任一方先出完即胜。支持顺子、连对、飞机带单/带对、四带二、炸弹和王炸。顺子不含 2 和王，飞机单翅不含炸弹、三张或双王。</p>
  <h3>掼蛋 · 4 人，隔座为队友</h3><p>两副牌，每人 27 张。一、三号座一队，二、四号座一队；双方从 2 打起，头二升 3 级、头三升 2 级、头末升 1 级，最多升到 A。打本方 A 时取得头二或头三即赢得整场；未过 A 保留级别，不采用三次掉级。</p>
  <p>红心级牌可配任意非王牌；选牌后可选择牌型声明。顺子固定 5 张、三连对固定 6 张、钢板固定两组三张。A 可作顺子、连对、钢板中的最小点数。四王 ＞ 六张及以上炸弹 ＞ 同花顺 ＞ 五炸 ＞ 四炸。领出者出完后无人再压，由队友接风。</p>
  <p>下一副：末游向头游进贡；双下时两人都进贡，大贡给头游，同点贡随机对应。贡牌为红心级牌外最大牌，按收贡对象还一张 ≤10 的非级牌，没有则还最小牌。单贡方有两大王，或双贡方合计两大王时抗贡，头游先出；否则大贡方先出。</p>
  <h3>房间与操作</h3><p>全部玩家准备后自动开局，每次操作限时 60 秒。超时自动不叫、过牌；领出时出最小单张，贡还时选合法牌。至少一位玩家打开牌桌时自动推进；全员离线保留牌局，重进后恢复。刷新页面不会退出，点击“退出房间”会提前结束正在进行的本场。7 天未活动的房间失效。正常结算后，全桌可见未出完的剩余手牌；下一副开始后恢复保密。牌室只记录本场结果。</p>
</div></details>}
export default function CardRoom({roomId,user,ready,login,onSessionEnded}:{roomId?:string;user:User|null;ready:boolean;login:()=>void;onSessionEnded?:()=>void}) {
  const [rooms,setRooms]=useState<Summary[]>([]),[room,setRoom]=useState<Room|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<number[]>([]),[declaration,setDeclaration]=useState(''),[copied,setCopied]=useState(false),[clock,setClock]=useState(Date.now()),[offset,setOffset]=useState(0),[confirmLeave,setConfirmLeave]=useState(false);
  const current=useRef<Room|null>(null),inflight=useRef(false);
  const accept=useCallback((r:Room)=>{if(!current.current||r.version>=current.current.version){current.current=r;setRoom(r);setOffset(r.serverTime-Date.now());}},[]);
  useEffect(()=>{if(current.current?.accountEnded)return;current.current=null;setRoom(null);setSelected([]);setError('');setLoading(true);if(!user){setLoading(false);return;}
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    async function poll(){if(current.current?.accountEnded){setLoading(false);return;}try{
      if(roomId){const r=await request<Room>('/'+roomId);if(stopped)return;accept(r);
        if(r.seat>=0&&r.deadline&&r.serverTime>=r.deadline&&!inflight.current){
          try{const next=await request<Room>('/'+roomId,{method:'POST',body:JSON.stringify({type:'tick',version:r.version})});if(!stopped)accept(next);}catch(e){if((e as {status?:number}).status!==409&&(e as {status?:number}).status!==400)throw e;}
        }
      }else {const data=await request<{rooms:Summary[]}>('');if(!stopped)setRooms(data.rooms);}
      if(!stopped)setError('');
      if(current.current?.accountEnded)return;
    }catch(e){if(!stopped)setError((e as Error).message);}finally{if(!stopped){setLoading(false);if(!current.current?.accountEnded)timer=setTimeout(poll,document.hidden?5000:1800);}}}
    void poll();return()=>{stopped=true;clearTimeout(timer);};
  },[roomId,user?.id,accept]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(room?.accountEnded)onSessionEnded?.();},[room?.accountEnded,onSessionEnded]);
  useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(room)setSelected(prev=>prev.filter(id=>room.hand.some(c=>c.id===id)));},[room]);
  const options=useMemo(()=>room?patterns(room.hand.filter(c=>selected.includes(c.id)),room.game,room.level).filter(p=>beats(p,room.last?.pattern||null)):[],[room,selected]);
  const choice=options.find(p=>p.key===declaration)?.key||options[0]?.key||'';
  async function act(type:string,extra:Record<string,unknown>={}){
    if(inflight.current||!current.current)return;inflight.current=true;setBusy(true);setError('');
    try{const r=await request<Room>('/'+roomId,{method:'POST',body:JSON.stringify({type,version:current.current.version,...extra})});accept(r);if(type==='play'||type==='exchange')setSelected([]);if(type==='leave')window.location.assign(appPath('/games'));}
    catch(e){setError((e as Error).message);try{accept(await request<Room>('/'+roomId));}catch{ /* Keep the original error and retry on the next poll. */ }}
    finally{inflight.current=false;setBusy(false);}
  }
  async function create(game:GameKind){if(!user)return login();if(inflight.current)return;inflight.current=true;setBusy(true);setError('');try{const r=await request<Room>('',{method:'POST',body:JSON.stringify({game})});window.location.assign(appPath('/games/'+r.id));}catch(e){setError((e as Error).message);inflight.current=false;setBusy(false);}}
  async function copy(){try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{setError('无法自动复制，请复制下方邀请链接。');}}
  const myTurn=!!room&&room.seat>=0&&room.turn===room.seat;
  const seconds=room?Math.min(60,Math.max(0,Math.ceil((room.deadline-clock-offset)/1000))):0;
  const playing=room&&['playing','bidding','tribute','return'].includes(room.phase);
  return <div className="card-room">
    <div className="game-breadcrumb"><a href={appPath(roomId?'/games':'/')}><ArrowLeft size={15}/>{roomId?'返回牌室':'回到广场'}</a><span>🍉 / 牌室{roomId?' / '+(room?gameName(room.game):'房间'):''}</span></div>
    {error&&<div className="game-error" role="alert">{error}<button onClick={()=>window.location.reload()} aria-label="重新连接"><RefreshCw size={16}/></button></div>}
    {room?.accountEnded&&<div className="game-error" role="status">本场已结束，账号封禁已生效并退出登录。下方保留本场结算结果。</div>}
    {!roomId?<>
      <section className="games-hero"><div><div className="eyebrow">THE CARD CLUB <span className="game-live">好友局</span></div><h1>话题聊尽兴，<br/>再来一手好牌<span>。</span></h1><p>把朋友叫上，牌桌已经备好。<br/>一边吃瓜，一边过招。</p><div className="hero-game-note"><Users size={15}/> 社区账号通用 · 真人联机</div></div><div className="hero-playing-cards" aria-hidden="true"><div className="decor-card decor-left"><b>A</b><span>♠</span></div><div className="decor-card decor-right"><b>2</b><span>♥</span><small>GOOD HAND,<br/>GOOD COMPANY.</small></div><span className="game-spark">✳</span></div></section>
      <div className="game-choices">{(['doudizhu','guandan'] as GameKind[]).map((game,i)=><section className={'game-choice choice-'+i} key={game}><div className="game-choice-top"><span className="game-number">0{i+1}</span><span>{i?'4 人 · 双人搭档':'3 人 · 经典叫分'}</span></div><div className="game-choice-title"><div><h2>{gameName(game)}</h2><p>{i?'对家默契，从 2 一路打到 A。':'一位地主，两位农民。好牌见真章。'}</p></div><span className="choice-symbol">{i?'♥':'♠'}</span></div><div className="game-choice-bottom"><span>{i?'升级 / 贡还 / 逢人配':'叫分 / 飞机 / 王炸'}</span><button className="button" disabled={busy||!ready} onClick={()=>create(game)}><Plus size={17}/>开一桌</button></div></section>)}</div>
      <section className="game-lobby"><div className="lobby-heading"><h2>正在等你的牌桌 <span>{rooms.filter(r=>r.phase==='waiting').length}</span></h2><small>选择空位入座，或返回自己的牌局</small></div>
      {!ready||loading?<div className="game-empty"><LoaderCircle className="spin"/>正在查看牌桌…</div>:!user?<div className="game-empty"><Spade size={30}/><h3>登录，让朋友认出你</h3><p>使用社区昵称入座，创建自己的好友牌局。</p><button className="button" onClick={login}>登录 / 注册<ArrowUpRight size={16}/></button></div>:rooms.filter(r=>r.mine||r.phase==='waiting').length===0?<div className="game-empty"><Spade size={30}/><h3>好牌局，从你开桌开始</h3><p>暂时没有等待中的房间，选个玩法邀请朋友吧。</p></div>:<div className="room-list">{rooms.filter(r=>r.mine||r.phase==='waiting').map(r=><a key={r.id} href={appPath('/games/'+r.id)} className="room-list-item"><div className="room-game-icon">{r.game==='doudizhu'?'♠':'♥'}</div><div><strong>{gameName(r.game)} <span>#{r.id.slice(0,6)}</span></strong><p>{r.seats.filter(Boolean).map(p=>p!.nickname).join('、')}</p></div><span className="room-occupancy">{r.seats.filter(Boolean).length}/{r.seats.length} 人<br/><small>{phases[r.phase]}</small></span><span className="room-enter">{r.mine?'回到牌桌':'入座'}<ArrowUpRight size={16}/></span></a>)}</div>}</section>
      <Rules/>
    </>:!ready||loading?<div className="game-empty"><LoaderCircle className="spin"/>正在连接牌桌…</div>:!user&&!room?.accountEnded?<div className="game-empty"><h2>朋友正在牌桌等你</h2><p>登录后即可查看房间和入座。</p><button className="button" onClick={login}>登录 / 注册</button></div>:!room?<div className="game-empty"><h2>暂时无法进入房间</h2><a href={appPath('/games')}>返回牌室</a></div>:<>
      <div className="room-heading"><div><div className="eyebrow">FRIENDS AT THE TABLE · #{room.id.slice(0,6)}</div><h1>{gameName(room.game)}<span>{phases[room.phase]}</span></h1></div><div className="room-heading-actions"><button className="button secondary" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/ >}{copied?'已复制':'邀请朋友'}</button>{room.seat>=0&&<button className="icon-button" aria-label="退出房间" title="退出房间" onClick={()=>setConfirmLeave(true)}><DoorOpen size={21}/></button>}</div></div>
      <label className="invite-url">邀请链接<input readOnly aria-label="房间邀请链接" value={typeof window!=='undefined'?window.location.origin+appPath('/games/'+room.id):''} onFocus={e=>e.target.select()}/></label>
      {confirmLeave&&<div className="leave-confirm" role="alert"><span>{playing||room.phase==='roundEnd'?'退出会提前结束本场，刷新或关闭页面则保留座位。确认退出？':'确认离开这个房间？'}</span><button className="button secondary" onClick={()=>setConfirmLeave(false)}>留下</button><button className="button" disabled={busy} onClick={()=>act('leave')}>退出房间</button></div>}
      <div className="table-score"><span>第 {room.round||1} 副</span>{room.game==='guandan'?<><span className={room.activeTeam===0?'score-active':''}>一队 · {rankName(room.levels[0])}</span><span className={room.activeTeam===1?'score-active':''}>二队 · {rankName(room.levels[1])}</span><strong>级牌 ♥{rankName(room.level)}</strong></>:<span>底分 {room.highBid||'—'}{room.landlord>=0&&room.phase!=='bidding'?' · 地主 '+room.seats[room.landlord]?.nickname:''}</span>}</div>
      <div className={'poker-table table-'+room.game}>
        <div className="table-watermark" aria-hidden="true">🍉<span>THE CARD CLUB</span></div>
        <div className="table-seats">{room.seats.map((p,i)=><div key={i} className={'table-seat '+(playing&&room.turn===i?'seat-turn ':'')+(i===room.seat?'seat-self':'')}><div className="seat-avatar">{p?p.nickname.slice(0,1):<Plus size={22}/>}</div><strong>{p?.nickname||'等待瓜友'} {p?.id===room.host&&<small>房主</small>}</strong><span>{i+1} 号座{room.game==='guandan'?` · ${i%2===0?'一':'二'}队`:i===room.landlord&&room.phase!=='bidding'?' · 地主':''}{i===room.seat?' · 你':''}</span>{p?<><div className="seat-status">{room.phase==='waiting'||room.phase==='roundEnd'?(p.ready?'✓ 已准备':'尚未准备'):room.finish.includes(i)?`第 ${room.finish.indexOf(i)+1} 名`:room.phase==='bidding'?(room.bids[i]===null?'待叫分':room.bids[i]===0?'不叫':`${room.bids[i]} 分`):`${p.count} 张`}</div>{room.passes.includes(i)&&<small>过牌</small>}</>:room.phase==='waiting'?<button className="seat-join" disabled={busy} onClick={()=>act('join',{value:i})}>坐这里</button>:<span>空座</span>}</div>)}</div>
        <div className="table-center" aria-live="polite">
          {room.phase==='waiting'?<><span className="table-center-icon">✧</span><h2>人齐了，就开牌</h2><p>邀请 {room.seats.length} 位玩家入座，全员准备后开始。</p></>:room.phase==='finished'||room.phase==='roundEnd'?<><span className="table-center-icon">✦</span><h2>{room.result}</h2><p>{room.phase==='roundEnd'?'所有人准备后进入下一副，自动进入贡还牌流程。':'这一场聊得来，也打得痛快。'}</p></>:room.phase==='closed'?<h2>房间已关闭</h2>:<>
            <div className="turn-indicator"><span className="live-dot"/>{myTurn?'轮到你':`${room.seats[room.turn]?.nickname}的回合`}<b className={seconds<10?'time-low':''}>{seconds}s</b></div>
            {room.phase==='bidding'?<><p>叫分越高，越有机会成为地主</p><div className="bottom-cards">{[0,1,2].map(i=><span className="card-back" key={i}>🍉</span>)}</div></>:room.phase==='tribute'||room.phase==='return'?<><h2>{room.phase==='tribute'?'请选一张牌进贡':'请选一张牌还贡'}</h2><p>{myTurn?'手牌中标记的牌可以选择':'等候玩家完成贡还牌'}</p></>:room.last?<><p>{room.seats[room.last.seat]?.nickname} · {room.last.pattern.label}</p><div className="table-played">{room.last.cards.map(c=><CardFace key={c.id} card={c} small/>)}</div></>:<><h2>领出一手好牌</h2><p>{myTurn?'选择手牌，再点击“出牌”':'等待领出'}</p></>}
          </>}
        </div>
        {room.game==='doudizhu'&&room.bottom.length>0&&<div className="table-bottom"><span>底牌</span>{room.bottom.map(c=><CardFace key={c.id} card={c} small/>)}</div>}
      </div>
      {(room.phase==='roundEnd'||room.phase==='finished')&&!!room.revealedHands?.length&&<section className="revealed-hands" aria-labelledby="reveal-heading">
        <div className="reveal-heading"><h2 id="reveal-heading">本副剩余手牌</h2><p>本副已结束，未出完的手牌向全桌公开。</p></div>
        {room.revealedHands.map(({seat,nickname,cards})=><div className="revealed-player" key={seat}>
          <div className="revealed-player-label"><strong>{nickname}{seat===room.seat?'（你）':''}</strong><span>{seat+1} 号座 · 剩 {cards.length} 张</span></div>
          <div className="revealed-cards" aria-label={`${nickname}剩余 ${cards.length} 张牌`}>{cards.map(c=><CardFace key={c.id} card={c} wild={room.game==='guandan'&&isWild(c,room.level)}/>)}</div>
        </div>)}
      </section>}
      {room.seat>=0&&!room.accountEnded&&<section className="my-hand"><div className="hand-heading"><strong>我的手牌 <span>{room.hand.length} 张</span></strong><span>{room.game==='guandan'?`♥${rankName(room.level)} 为逢人配`:'点击选牌，再点击可取消'}</span></div>
        {room.hand.length>0&&<div className="hand-cards">{room.hand.map(c=><div key={c.id} className={room.exchangeAllowed.includes(c.id)&&myTurn?'exchange-option':''}><CardFace card={c} wild={room.game==='guandan'&&isWild(c,room.level)} selected={selected.includes(c.id)} onClick={()=>{setSelected(prev=>prev.includes(c.id)?prev.filter(x=>x!==c.id):[...prev,c.id]);setDeclaration('');}} disabled={busy||!playing}/></div>)}</div>}
        <div className="hand-controls">
          {room.phase==='waiting'||room.phase==='roundEnd'?<button className="button" disabled={busy} onClick={()=>act('ready')}><Check size={17}/>{room.seats[room.seat]?.ready?'取消准备':room.phase==='roundEnd'?'准备下一副':'准备开局'}</button>:room.phase==='finished'?room.host===user?.id?<button className="button" disabled={busy} onClick={()=>act('rematch')}><RefreshCw size={16}/>再开一场</button>:<p>等待房主再开一场，或返回牌室。</p>:room.phase==='bidding'?<>{[0,1,2,3].map(v=><button className={'button '+(v===0?'secondary':'')} key={v} disabled={busy||!myTurn||(v!==0&&v<=room.highBid)} onClick={()=>act('bid',{value:v})}>{v?`叫 ${v} 分`:'不叫'}</button>)}</>:room.phase==='playing'?<><button className="button secondary" disabled={busy||!myTurn||!room.last} onClick={()=>act('pass')}>过牌</button><button className="button secondary" disabled={!selected.length||busy} onClick={()=>setSelected([])}>重选</button>{options.length>1&&<select aria-label="声明出牌牌型" value={choice} onChange={e=>setDeclaration(e.target.value)}>{options.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select>}<button className="button" disabled={busy||!myTurn||!choice} onClick={()=>act('play',{cards:selected,pattern:choice})}>出牌{selected.length?`（${selected.length}）`:''}</button><span className="selection-note">{selected.length?(choice?options.find(p=>p.key===choice)?.label:'不能组成合法压牌'):myTurn?'轮到你了，选一手牌吧':'等待其他玩家出牌'}</span></>:room.phase==='tribute'||room.phase==='return'?<><button className="button secondary" onClick={()=>setSelected([])}>重选</button><button className="button" disabled={busy||!myTurn||selected.length!==1||!room.exchangeAllowed.includes(selected[0])} onClick={()=>act('exchange',{cards:selected})}>{room.phase==='tribute'?'确认进贡':'确认还贡'}</button></>:null}
          {busy&&<LoaderCircle size={18} className="spin"/>}
        </div>
      </section>}
      {room.seat<0&&room.phase!=='waiting'&&<p className="spectator-note">本桌已开局。你可以查看公开牌面，或返回牌室开一桌。</p>}
      <details className="game-log"><summary>牌局记录 · 最近 {room.log.length} 条</summary><ol>{room.log.map((line,i)=><li key={i}>{line}</li>)}</ol></details><Rules/>
    </>}
  </div>;
}
