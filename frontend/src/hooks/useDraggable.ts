import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

// Unterhalb der fixen Navbar (h-14 = 56px) bleiben, damit der Griff erreichbar ist
const MIN_TOP = 60;
const EDGE_MARGIN = 8;
const HANDLE_VISIBLE = 48;

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  baseX: number;
  baseY: number;
  /** Panel-Rect beim Drag-Start (inkl. aktuellem Offset) */
  rect: DOMRect;
}

/**
 * Macht ein Element per Griff verschiebbar (Maus/Touch/Stift via Pointer Capture).
 * `panelRef` + `style` aufs Panel, `handleProps` auf den Griff.
 * Der Offset lebt im State — unmountet das Panel, ist die Position zurückgesetzt.
 */
export function useDraggable() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    const panel = panelRef.current;
    if (!panel) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      rect: panel.getBoundingClientRect(),
    };
    setDragging(true);
  }, [offset]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    let x = drag.baseX + (e.clientX - drag.startClientX);
    let y = drag.baseY + (e.clientY - drag.startClientY);

    // Clamping: horizontal ganz im Viewport, vertikal muss der Griff sichtbar bleiben
    const left = drag.rect.left + (x - drag.baseX);
    const top = drag.rect.top + (y - drag.baseY);
    const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - drag.rect.width - EDGE_MARGIN);
    const maxTop = Math.max(MIN_TOP, window.innerHeight - HANDLE_VISIBLE);
    x += Math.min(Math.max(left, EDGE_MARGIN), maxLeft) - left;
    y += Math.min(Math.max(top, MIN_TOP), maxTop) - top;

    setOffset({ x, y });
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }, []);

  const style: CSSProperties =
    offset.x === 0 && offset.y === 0
      ? {}
      : { transform: `translate(${offset.x}px, ${offset.y}px)` };

  return {
    panelRef,
    style,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
