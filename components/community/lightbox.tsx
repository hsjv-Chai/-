"use client";

import { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { appPath } from "@/lib/paths";

export function Lightbox({ id, close }: { id: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="lightbox" ref={ref} onCancel={close} onClick={close}>
      <button aria-label="关闭图片" className="icon-button">
        <X />
      </button>
      <img src={appPath("/api/uploads/" + id)} alt="放大的帖子配图" />
    </dialog>
  );
}
