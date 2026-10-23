import {all,one,run,requireUser,body,json,fail,id,now} from '@/lib/server';
import {createState,applyAction,publicState,type GameState} from './engine';
type Row={id:string;game:string;phase:string;state:string;version:number;created_at:number;updated_at:number};
const lifetime=7*86400000;
// This predicate is part of the write itself: a read-then-write check would
// allow simultaneous requests to put the same account in different rooms.
// Finished rooms still reserve seats because the host can start a rematch.
const seatsAvailable = `NOT EXISTS (
  SELECT 1 FROM game_rooms AS occupied, json_each(occupied.state, '$.seats') AS seat
  WHERE occupied.id<>? AND occupied.phase<>'closed' AND occupied.updated_at>?
    AND json_extract(seat.value, '$.id') IN (
      SELECT json_extract(value, '$.id') FROM json_each(?, '$.seats')
      WHERE value IS NOT NULL
    )
)`;
export async function gamesAPI(req:Request,key?:string) {
  const user=await requireUser(req);
  if(req.method==='GET'&&!key) {
    const rows=await all<Row>("SELECT * FROM game_rooms WHERE phase<>'closed' AND updated_at>? ORDER BY updated_at DESC LIMIT 60",now()-lifetime);
    return json({rooms:rows.map(row=>{
      const s=JSON.parse(row.state) as GameState;
      return {id:row.id,game:s.game,phase:s.phase,seats:s.seats.map(p=>p?{id:p.id,nickname:p.nickname}:null),round:s.round,mine:s.seats.some(p=>p?.id===user.id),updatedAt:row.updated_at};
    })});
  }
  if(req.method==='POST'&&!key) {
    const b=await body(req);if(b.game!=='doudizhu'&&b.game!=='guandan')fail('请选择斗地主或掼蛋');
    const roomId=id(),time=now(),s=createState(b.game,{id:user.id,nickname:user.nickname,ready:false});
    // Atomic per-account creation cap, including concurrent create requests.
    const state=JSON.stringify(s);
    const inserted=await run(`INSERT INTO game_rooms(id,owner_id,game,phase,state,version,created_at,updated_at) SELECT ?,?,?,?,?,0,?,? WHERE (SELECT COUNT(*) FROM game_rooms WHERE owner_id=? AND created_at>?)<10 AND ${seatsAvailable}`,roomId,user.id,b.game,'waiting',state,time,time,user.id,time-3600000,roomId,time-lifetime,state);
    if(!inserted.meta.changes) {
      const occupied=await one<{id:string}>(`SELECT r.id FROM game_rooms r, json_each(r.state, '$.seats') seat WHERE r.phase<>'closed' AND r.updated_at>? AND json_extract(seat.value, '$.id')=? LIMIT 1`,time-lifetime,user.id);
      if(occupied)fail('你已在其他房间入座，请先退出原房间再开桌',409);
      fail('每小时最多创建 10 个房间，请先使用已有房间',429);
    }
    return json({id:roomId,version:0,serverTime:time,...publicState(s,user.id)},201);
  }
  if(!key||!/^[a-f0-9-]{36}$/.test(key))fail('房间不存在',404);
  const row=await one<Row>('SELECT * FROM game_rooms WHERE id=?',key);
  if(!row||row.updated_at<=now()-lifetime)fail('房间不存在或已超过 7 天未活动',404);
  const s=JSON.parse(row.state) as GameState;
  if(req.method==='GET')return json({id:row.id,version:row.version,serverTime:now(),...publicState(s,user.id)});
  if(req.method==='POST') {
    const b=await body(req);
    if(!Number.isInteger(b.version)||b.version!==row.version)fail('牌桌状态已更新，请重试',409);
    if(typeof b.type!=='string')fail('请选择有效操作');
    const time=now(),next=applyAction(s,user,b,time);
    const state=JSON.stringify(next);
    // Leaving must remain possible for accounts affected by the old bug.
    // All other writes validate every retained seat, including rematches.
    const updated=b.type==='leave'
      ? await run('UPDATE game_rooms SET state=?,phase=?,version=version+1,updated_at=? WHERE id=? AND version=?',state,next.phase,time,key,row.version)
      : await run(`UPDATE game_rooms SET state=?,phase=?,version=version+1,updated_at=? WHERE id=? AND version=? AND ${seatsAvailable}`,state,next.phase,time,key,row.version,key,time-lifetime,state);
    if(!updated.meta.changes) {
      const latest=await one<{version:number}>('SELECT version FROM game_rooms WHERE id=?',key);
      if(latest?.version!==row.version)fail('其他玩家刚刚操作，请重试',409);
      fail('你或同桌玩家已在其他房间入座，请先退出多余的房间',409);
    }
    return json({id:row.id,version:row.version+1,serverTime:time,...publicState(next,user.id)});
  }
  return json({error:'不支持的牌室操作'},405);
}
