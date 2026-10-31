'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, LoaderCircle, Sprout } from 'lucide-react';
import { appPath } from '@/lib/paths';
import { GROWTH_STAGES, type GardenState } from '@/lib/garden/model';
import { MelonPlant } from './garden/plant';

type Props = { user: { id: string; nickname: string } | null; ready: boolean; login: () => void; compact?: boolean };
type Result = GardenState & { harvested?: boolean; alreadyCheckedIn?: boolean };
async function request(path: string, method = 'GET'): Promise<Result> {
  const response = await fetch(appPath('/api/garden' + path), { method, credentials: 'same-origin', cache: 'no-store',
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
  const value = await response.json() as Result & { error?: string };
  if (!response.ok) throw new Error(value.error || '暂时没能照料瓜苗，请重试。');
  return value;
}


export default function Garden({ user, ready, login, compact = false }: Props) {
  const [data, setData] = useState<Result | null>(null), [loading, setLoading] = useState(!!user), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [celebrate, setCelebrate] = useState(false);
  const sequence = useRef(0), writing = useRef(false);
  const load = useCallback(async (page = 1) => {
    if (!user || writing.current) return;
    const seq = ++sequence.current;
    setLoading(true); setError('');
    try { const next = await request('?page=' + page); if (seq === sequence.current) setData(next); }
    catch (e) { if (seq === sequence.current) setError((e as Error).message); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [user?.id]); // Account changes remount this component, clearing private state.
  useEffect(() => {
    void load();
    const focus = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { sequence.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [load]);
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => void load(), Math.max(500, data.nextResetAt - data.serverNow + 100));
    return () => clearTimeout(timer);
  }, [data, load]);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 2400);
    return () => clearTimeout(timer);
  }, [celebrate]);
  async function checkIn() {
    if (!user) { login(); return; }
    if (writing.current || loading || data?.checkedIn) return;
    writing.current = true; setBusy(true); setError(''); setMessage('');
    const seq = ++sequence.current;
    try {
      const next = await request('/check-in', 'POST');
      if (seq !== sequence.current) return;
      setData(next); setCelebrate(!!next.harvested);
      setMessage(next.harvested ? '收获一颗西瓜！下一次签到，种下新的期待。' : next.alreadyCheckedIn ? '今天已经种过瓜啦，明天再来。' : `今日已种瓜，瓜苗进入${GROWTH_STAGES[next.stage]}阶段。`);
    } catch (e) { if (seq === sequence.current) setError((e as Error).message); }
    finally { writing.current = false; if (seq === sequence.current) setBusy(false); }
  }
  const button = <button className="button garden-check" onClick={checkIn} disabled={!ready || busy || loading || !!data?.checkedIn || (!!user && !data)}>
    {busy || loading ? <LoaderCircle size={17} className="garden-spin" /> : data?.checkedIn ? <Check size={17} /> : <Sprout size={17} />}
    {!ready || loading ? '正在看看瓜田…' : busy ? '正在种瓜…' : data?.checkedIn ? '今日已种瓜' : user ? '种下今日的期待' : '登录后种瓜'}
  </button>;
  const feedback = <><div className="garden-message" role="status" aria-live="polite">{message}</div>{error && <div className="garden-error" role="alert">{error} <button className="text-link" onClick={() => void load()}>重新加载</button></div>}</>;
  if (compact) return <section className={"garden-home" + (celebrate ? " garden-celebrate" : "")} aria-label="每日种瓜">
    <span className="garden-home-icon" aria-hidden="true">{celebrate ? "🍉" : "🌱"}</span><div><a href={appPath('/garden/')}><strong>种瓜 · 每日签到</strong><ArrowUpRight size={15}/></a><a className="garden-coop-entry" href={appPath('/garden/coops')}>和瓜友一起合种 →</a><p>{data ? `已种 ${data.totalDays} 天 · 收获 ${data.harvestCount} 颗西瓜` : '累计种瓜 7 天，收获一颗小西瓜。'}</p></div>
    {button}{(error || message) && <div className="garden-home-feedback">{feedback}</div>}
  </section>;
  return <div className={'garden-page' + (celebrate ? ' garden-celebrate' : '')}>
    <div className="garden-heading"><span className="garden-eyebrow"><Sprout size={15}/> A LITTLE EVERY DAY</span><h1>种瓜<span>。</span></h1><p>来这里歇一会儿，照料一点小小的期待。</p></div>
    <section className="garden-grow" aria-label="我的瓜苗">
      <div className="garden-grow-copy"><span className="garden-tag">{data?.checkedIn ? '今日已照料' : '每日签到 · 慢慢长大'}</span><h2>{data?.stage === 7 ? '这一颗甜，属于你。' : data?.stage ? '你的瓜苗，又长大一点。' : '从一颗种子开始。'}</h2><p>{data?.stage === 7 ? '西瓜已自动收进篮子。下次种瓜，开启新的成长。' : '不必每天都赶上。漏签也没关系，已经长大的，都为你留着。'}</p>{button}<small>北京时间每日 00:00 更新 · 无需连续签到</small></div>
      <div className="garden-art"><MelonPlant stage={data?.stage ?? 0}/><span className="garden-art-label">{GROWTH_STAGES[data?.stage ?? 0]} <i>·</i> {data?.stage ?? 0} / 7</span>{celebrate && <span className="garden-harvest-pop" aria-hidden="true">🍉 +1</span>}</div>
    </section>
    {feedback}
    <ol className="garden-stages" aria-label="七天成长进度">{GROWTH_STAGES.slice(1).map((stage, i) => <li key={stage} className={(data?.stage ?? 0) >= i + 1 ? 'is-grown' : ''} aria-current={data?.stage === i + 1 ? 'step' : undefined}><span>{(data?.stage ?? 0) > i + 1 ? <Check size={13}/> : i + 1}</span><b>{stage}</b></li>)}</ol>
    <section className="garden-stats" aria-label="种瓜统计">{[[data?.totalDays, '累计种瓜 / 天'], [data?.streak, '连续种瓜 / 天'], [data?.harvestCount, '已收获 / 颗']].map(([value, label]) => <div key={label}><strong>{value ?? (user ? '—' : '0')}</strong><span>{label}</span></div>)}</section>
    <section className="garden-basket"><div className="garden-section-heading"><h2>我的西瓜篮</h2><span>只属于你的收获记录</span></div>
      {!user ? <div className="garden-empty"><span aria-hidden="true">🌱</span><h3>登录，把期待种下来。</h3><p>每次来，都离下一颗西瓜近一点。</p><button className="text-link" onClick={login} disabled={!ready}>登录后开启我的瓜田 →</button></div> : !data ? <div className="garden-empty">{loading ? '正在查看收获记录…' : '暂时无法读取瓜田，请重新加载。'}</div> : !data.harvests.length ? <div className="garden-empty"><span aria-hidden="true">🧺</span><h3>篮子空着，期待满着。</h3><p>再种 {7 - data.stage} 天，就能收获第一颗西瓜。</p></div> : <><ul className="garden-harvests">{data.harvests.map(h => <li key={h.number}><span aria-hidden="true">🍉</span><div><b>第 {h.number} 颗西瓜</b><small>{h.day.replaceAll('-', '.')} 收获</small></div><span className="garden-harvest-badge">成熟收获</span></li>)}</ul>{data.totalPages > 1 && <div className="garden-pagination"><button aria-label="上一页收获" disabled={loading || data.page <= 1} onClick={() => void load(data.page - 1)}><ChevronLeft size={18}/></button><span>{data.page} / {data.totalPages}</span><button aria-label="下一页收获" disabled={loading || data.page >= data.totalPages} onClick={() => void load(data.page + 1)}><ChevronRight size={18}/></button></div>}</>}
    </section>
    <p className="garden-footnote">每天照料一次，累计七天自动收获。漏签不枯萎，也无需补签。<br/>西瓜是你的成长收藏，不用于兑换或牌室奖励。</p>
  </div>;
}
