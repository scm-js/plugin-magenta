/**
 * A small box anchored to an element, over everything: the chips' pickers, the ⋯ menu,
 * the add row's hits. A `menu` one is a column of items that scrolls when it is taller
 * than the window, instead of the pickers' fixed height. One at a time; it closes on Escape, a click outside, or `close()`,
 * and gives focus back to the anchor.
 */
let current: { close: () => void } | null = null;

export interface PopoverHandle {
  close(): void;
  readonly root: HTMLElement;
}

export function closePopover(): void {
  current?.close();
}

export function openPopover(anchor: HTMLElement, build: (handle: PopoverHandle) => HTMLElement | HTMLElement[], options: { width?: number; menu?: boolean; returnFocus?: boolean; onClose?: () => void } = {}): PopoverHandle {
  closePopover();
  const root = document.createElement("div");
  root.className = options.menu ? "mg-pop menu" : "mg-pop";
  if (options.width) root.style.width = `${options.width}px`;
  let closed = false;
  const handle: PopoverHandle = {
    root,
    close() {
      if (closed) return;
      closed = true;
      root.remove();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      if (current?.close === handle.close) current = null;
      options.onClose?.();
      if (options.returnFocus !== false && document.contains(anchor)) anchor.focus();
    },
  };
  const content = build(handle);
  for (const c of Array.isArray(content) ? content : [content]) root.append(c);
  document.body.append(root);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const w = root.offsetWidth, h = root.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    root.style.left = `${Math.max(8, left)}px`;
    root.style.top = `${top}px`;
  };
  place();
  const onDown = (e: PointerEvent) => {
    if (root.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
    handle.close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); handle.close(); }
  };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  current = handle;
  const first = root.querySelector<HTMLElement>("input, textarea, [tabindex], button");
  first?.focus();
  return handle;
}
