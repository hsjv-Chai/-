"use client";

import { ArrowUpRight, Plus } from "lucide-react";
import { Link, icons } from "./display";
import type { Category, User } from "./types";
import Garden from "../garden";

export function Welcome({
  categories,
  activeCategory,
  user,
  ready,
  login,
  compose,
}: {
  categories: Category[];
  activeCategory: string;
  user: User | null;
  ready: boolean;
  login: () => void;
  compose: () => void;
}) {
  return (
    <>
      <section className="community-intro">
        <div>
          <div className="intro-eyebrow">一个有趣的互联网角落</div>
          <h1>
            好瓜，一起聊<span>。</span>
          </h1>
          <p>分享新鲜见闻，也听听不一样的声音。</p>
        </div>
        <div className="intro-melon" aria-hidden="true">
          <span>🍉</span>
          <i>新鲜事，切一块聊聊</i>
        </div>
      </section>
      <nav className="section-cards" aria-label="探索话题分区">
        {categories.map((category) => {
          const Icon = icons[category.id];
          return (
            <Link
              className={
                "section-card section-" +
                category.id +
                (activeCategory === category.id ? " is-active" : "")
              }
              aria-current={activeCategory === category.id ? "page" : undefined}
              key={category.id}
              href={"/?category=" + category.id}
            >
              <span className="section-card-icon">
                {Icon && <Icon size={21} />}
              </span>
              <span>
                <strong>{category.name}</strong>
                <small>{category.count} 个话题</small>
              </span>
              <ArrowUpRight size={15} className="section-card-arrow" />
            </Link>
          );
        })}
      </nav>
      <div className="home-tools">
        <button className="quick-compose" onClick={compose}>
          <span className="compose-avatar" aria-hidden="true">
            🍉
          </span>
          <span>今天有什么新鲜事？</span>
          <span className="compose-plus">
            <Plus size={20} />
          </span>
        </button>
        <Garden
          key={user?.id ?? "guest"}
          user={user}
          ready={ready}
          login={login}
          compact
        />
      </div>
    </>
  );
}
