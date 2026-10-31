"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, LoaderCircle, Sprout, Users } from "lucide-react";
import { appPath } from "@/lib/paths";
import { GROWTH_STAGES } from "@/lib/garden/model";
import type { CoopCard, CoopMe } from "@/lib/garden/cooperative-model";
import { MelonPlant } from "./plant";
export const coopLink = (id: string) =>
  appPath("/garden/coops/" + encodeURIComponent(id));

export function Progress({ value }: { value: number }) {
  return (
    <div className="coop-progress">
      <div className="coop-progress-caption">
        <strong>
          {value}
          <span> / 35 次浇水</span>
        </strong>
        <span>{value === 35 ? "这一颗，成熟了" : `还差 ${35 - value} 次`}</span>
      </div>
      <progress
        max={35}
        value={value}
        aria-label={`成长进度：${value} / 35 次浇水`}
      />
    </div>
  );
}
export function Card({ garden }: { garden: CoopCard }) {
  return (
    <a className="coop-card" href={coopLink(garden.id)}>
      <div className="coop-card-art">
        <MelonPlant stage={garden.stage} small />
        <span>{garden.mature ? "🍉 已成熟" : GROWTH_STAGES[garden.stage]}</span>
      </div>
      <div className="coop-card-copy">
        <h3>
          {garden.name}
          <ArrowUpRight size={18} />
        </h3>
        <p>{garden.intro || "一块公开的小瓜田，等你一起照料。"}</p>
        <Progress value={garden.growth} />
        <div className="coop-card-meta">
          <span>
            <Users size={14} />
            {garden.memberCount} / 10 人
          </span>
          <span>{garden.harvestCount} 颗共同收获</span>
        </div>
      </div>
    </a>
  );
}
export function Skeleton() {
  return (
    <div className="coop-skeleton" role="status" aria-label="正在加载瓜田">
      <span />
      <span />
      <span />
    </div>
  );
}
export function Failure({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return message ? (
    <div className="coop-error" role="alert">
      {message}
      <button className="text-link" onClick={retry}>
        重新加载
      </button>
    </div>
  ) : null;
}
export function Pagination({
  page,
  totalPages,
  onPage,
  link,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  onPage?: (n: number) => void;
  link?: (n: number) => string;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="coop-pagination" aria-label="分页">
      {link ? (
        page > 1 ? (
          <a href={link(page - 1)}>上一页</a>
        ) : (
          <span aria-disabled="true">上一页</span>
        )
      ) : (
        <button
          disabled={disabled || page <= 1}
          onClick={() => onPage?.(page - 1)}
        >
          上一页
        </button>
      )}
      <span aria-live="polite">
        {page} / {totalPages}
      </span>
      {link ? (
        page < totalPages ? (
          <a href={link(page + 1)}>下一页</a>
        ) : (
          <span aria-disabled="true">下一页</span>
        )
      ) : (
        <button
          disabled={disabled || page >= totalPages}
          onClick={() => onPage?.(page + 1)}
        >
          下一页
        </button>
      )}
    </nav>
  );
}
export function GardenForm({
  garden,
  busy,
  error = "",
  allowed = true,
  onSave,
  onCancel,
}: {
  garden?: CoopCard;
  busy: boolean;
  error?: string;
  allowed?: boolean;
  onSave: (data: {
    name: string;
    intro: string;
    requestId?: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(garden?.name || ""),
    [intro, setIntro] = useState(garden?.intro || "");
  const requestId = useRef("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !allowed) return;
    if (!garden && !requestId.current) requestId.current = crypto.randomUUID();
    const saved = await onSave({
      name,
      intro,
      ...(!garden ? { requestId: requestId.current } : {}),
    });
    if (saved && garden) onCancel();
  }
  return (
    <form
      className="coop-form"
      onSubmit={submit}
      aria-label={garden ? "编辑瓜田" : "创建瓜田"}
    >
      <h2>{garden ? "给瓜田写一点介绍" : "给共同的期待，起个名字。"}</h2>
      <label>
        瓜田名称
        <input
          name="coop-name"
          autoFocus
          required
          minLength={2}
          maxLength={24}
          placeholder="2–24 个字符"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        瓜田简介 <span>选填</span>
        <textarea
          name="coop-intro"
          rows={3}
          maxLength={160}
          placeholder="想和大家一起种下什么期待？"
          value={intro}
          disabled={busy}
          onChange={(e) => setIntro(e.target.value)}
        />
      </label>
      <p>
        {garden
          ? "负责人只编辑名称与简介，不移除成员。"
          : "公开加入 · 最多 10 人 · 创建后自动成为第一位成员"}
      </p>
      {!allowed && (
        <p role="status">负责人已变更，你填写的内容仍保留，但暂时不能保存。</p>
      )}
      {error && (
        <p className="coop-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="coop-actions">
        <button className="button" disabled={busy || !allowed}>
          {busy ? (
            <LoaderCircle size={17} className="garden-spin" />
          ) : (
            <Sprout size={17} />
          )}{" "}
          {garden ? "保存介绍" : "创建并加入"}
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </form>
  );
}
export function Memories({
  me,
  busy,
  onPage,
}: {
  me: CoopMe;
  busy: boolean;
  onPage: (p: number) => void;
}) {
  return (
    <section className="coop-section" aria-label="我的合种纪念">
      <div className="coop-section-heading">
        <h2>我的合种纪念</h2>
        <span>与个人西瓜分开收藏 · {me.total} 次</span>
      </div>
      {!me.memories.length ? (
        <div className="coop-empty">
          <span aria-hidden="true">🧺</span>
          <h3>一起种的甜，会留在这里。</h3>
          <p>本轮浇过水，就会在成熟时收到纪念，退出后也保留资格。</p>
        </div>
      ) : (
        <>
          <ul className="coop-records">
            {me.memories.map((h) => (
              <li key={h.coopId + ":" + h.round}>
                <span className="coop-record-icon" aria-hidden="true">
                  🍉
                </span>
                <div>
                  <a href={coopLink(h.coopId)}>{h.name}</a>
                  <p>
                    第 {h.round} 轮 · 我浇了 {h.contribution} 次水
                  </p>
                </div>
                <time>{h.day}</time>
              </li>
            ))}
          </ul>
          <Pagination
            page={me.page}
            totalPages={me.totalPages}
            onPage={onPage}
            disabled={busy}
          />
        </>
      )}
    </section>
  );
}
