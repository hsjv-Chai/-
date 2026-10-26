"use client";

import Markdown from "../markdown";
import { type User, type Category, type Detail } from "./types";
import { useData } from "./use-data";
import { useState, useEffect, type FormEvent } from "react";
import { api } from "./client";
import { Loading, Empty, ErrorBox, Link } from "./display";
import {
  ArrowLeft,
  Eye,
  ImagePlus,
  X,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import { appPath } from "@/lib/paths";

export function Editor({
  id,
  user,
  ready,
  categories,
  login,
  done,
}: {
  id?: string;
  user: User | null;
  ready: boolean;
  categories: Category[];
  login: () => void;
  done: (id: string) => void;
}) {
  const detail = useData<Detail>(id ? "posts/" + id : null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [category, setCategory] = useState("hot"),
    [images, setImages] = useState<string[]>([]),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (detail.data) {
      setTitle(detail.data.post.title);
      setBody(detail.data.post.body);
      setCategory(detail.data.post.category_id);
      setImages(detail.data.images.map((i) => i.id));
    }
  }, [detail.data]);
  async function upload(files: FileList | null) {
    if (!files) return;
    setError("");
    if (files.length + images.length > 9) {
      setError("每篇帖子最多上传 9 张图片");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("每张图片不能超过 5 MB");
        const form = new FormData();
        form.append("file", file);
        const image = await api<{ id: string }>("uploads", {
          method: "POST",
          body: form,
        });
        setImages((prev) => [...prev, image.id]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("posts" + (id ? "/" + id : ""), {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({ title, body, category_id: category, images }),
      });
      done(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready || (id && detail.loading)) return <Loading />;
  if (!user)
    return (
      <section className="editor-card">
        <Empty title="分享之前，先认识一下">
          <button className="button" onClick={login}>
            登录 / 注册
          </button>
        </Empty>
      </section>
    );
  if (detail.error) return <ErrorBox message={detail.error} />;
  if (id && detail.data?.post.user_id !== user.id)
    return <ErrorBox message="只能编辑自己的帖子" />;
  return (
    <>
      <Link className="back-link" href={id ? "/p/" + id : "/"}>
        <ArrowLeft size={16} />
        返回
      </Link>
      <section className="editor-card">
        <div className="eyebrow">A NEW CONVERSATION</div>
        <h1>{id ? "让想法更完整。" : "今天，分享什么新鲜事？"}</h1>
        <p className="muted">一个好话题，就是一场好讨论的开始。</p>
        <form onSubmit={save}>
          <label>
            选择分区
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            话题标题
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={100}
              placeholder="用一句话，让大家想点进来"
            />
          </label>
          <div className="editor-toolbar">
            <span>
              正文 <small>支持 Markdown</small>
            </span>
            <button
              className={preview ? "active" : ""}
              type="button"
              onClick={() => setPreview(!preview)}
            >
              <Eye size={15} />
              {preview ? "继续编辑" : "预览排版"}
            </button>
          </div>
          {preview ? (
            <div className="editor-preview">
              <Markdown text={body || "你的想法，会在这里变成文字。"} />
            </div>
          ) : (
            <textarea
              aria-label="帖子正文"
              className="body-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={5}
              maxLength={20000}
              placeholder={
                "说说发生了什么，或者分享你的观察…\n\n支持 **加粗**、列表、引用、代码和链接。"
              }
            />
          )}
          <div className="upload-area">
            <label className={"upload-button " + (uploading ? "disabled" : "")}>
              <ImagePlus size={20} />
              {uploading ? "上传中…" : "添加图片"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={uploading || busy || images.length >= 9}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span>{images.length}/9 · 每张不超过 5 MB</span>
          </div>
          {images.length > 0 && (
            <div className="upload-thumbs">
              {images.map((image, i) => (
                <div key={image}>
                  <img
                    src={appPath("/api/uploads/" + image)}
                    alt={"已上传图片 " + (i + 1)}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={"移除图片 " + (i + 1)}
                    onClick={() => setImages(images.filter((x) => x !== image))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <ErrorBox message={error} />
          <div className="editor-bottom">
            <small>分享有依据的信息，保持善意与好奇。</small>
            <button
              className="button"
              disabled={
                busy ||
                uploading ||
                body.trim().length < 5 ||
                title.trim().length < 3
              }
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowUpRight size={17} />
              )}{" "}
              {id ? "保存修改" : "发布话题"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
