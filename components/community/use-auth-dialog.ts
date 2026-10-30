"use client";
import { useEffect, useRef } from "react";

/** Native dialog focus handling, with a stationary page and keyboard-sized viewport. */
export function useAuthDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement;
    const { body, documentElement: root } = document;
    const position = { x: window.scrollX, y: window.scrollY };
    const properties = [
      "position", "top", "left", "width", "overflow", "padding-right",
    ];
    const saved = properties.map((name) => ({
      name,
      value: body.style.getPropertyValue(name),
      priority: body.style.getPropertyPriority(name),
    }));
    const overflow = root.style.getPropertyValue("overflow");
    const overflowPriority = root.style.getPropertyPriority("overflow");
    const scrollbar = window.innerWidth - root.clientWidth;
    const paddingRight = getComputedStyle(body).paddingRight;
    body.style.position = "fixed";
    body.style.top = `-${position.y}px`;
    body.style.left = `-${position.x}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbar > 0)
      body.style.paddingRight = `calc(${paddingRight} + ${scrollbar}px)`;
    root.style.overflow = "hidden";

    const viewport = window.visualViewport;
    let frame = 0;
    function updateViewport(event?: Event) {
      element!.style.setProperty(
        "--auth-viewport-height", `${viewport?.height ?? window.innerHeight}px`,
      );
      element!.style.setProperty(
        "--auth-viewport-top", `${viewport?.offsetTop ?? 0}px`,
      );
      if (event?.type !== "resize") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        const content = element!.querySelector(".auth-modal-content");
        if (!(active instanceof HTMLElement) || !content?.contains(active))
          return;
        const bounds = content.getBoundingClientRect();
        const field = active.getBoundingClientRect();
        if (field.top < bounds.top || field.bottom > bounds.bottom)
          active.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
    updateViewport();
    element.showModal();
    window.addEventListener("resize", updateViewport);
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      // Close before restoring focus; also makes the effect safe to remount in Strict Mode.
      element.close();
      for (const { name, value, priority } of saved)
        if (value) body.style.setProperty(name, value, priority);
        else body.style.removeProperty(name);
      if (overflow) root.style.setProperty("overflow", overflow, overflowPriority);
      else root.style.removeProperty("overflow");
      window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return dialog;
}
