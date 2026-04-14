'use client';

import { Children, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

type SplitPaneOrientation = 'horizontal' | 'vertical';
type SplitPanePrimary = 'first' | 'second';

function clampSize(value: number, minSize: number, maxSize: number) {
  return Math.max(minSize, Math.min(maxSize, Math.round(value)));
}

function coordinateForEvent(event: MouseEvent | PointerEvent, orientation: SplitPaneOrientation) {
  return orientation === 'horizontal' ? event.clientX : event.clientY;
}

export function SplitPane({
  children,
  size,
  minSize,
  maxSize,
  onSizeChange,
  primary = 'first',
  orientation = 'horizontal',
  handleLabel = 'Resize panel',
}: {
  children: ReactNode;
  size: number;
  minSize: number;
  maxSize: number;
  onSizeChange: (nextSize: number) => void;
  primary?: SplitPanePrimary;
  orientation?: SplitPaneOrientation;
  handleLabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ origin: number; size: number } | null>(null);

  const normalizedSize = clampSize(size, minSize, maxSize);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const onPointerMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      const delta = coordinateForEvent(event, orientation) - dragState.origin;
      const nextSize =
        primary === 'first'
          ? clampSize(dragState.size + delta, minSize, maxSize)
          : clampSize(dragState.size - delta, minSize, maxSize);
      onSizeChange(nextSize);
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('mouseleave', onPointerUp);

    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('mouseleave', onPointerUp);
    };
  }, [dragging, maxSize, minSize, onSizeChange, orientation, primary]);

  const templateStyle = useMemo(() => {
    if (orientation === 'horizontal') {
      return {
        gridTemplateColumns:
          primary === 'first'
            ? `${normalizedSize}px 0.8rem minmax(0, 1fr)`
            : `minmax(0, 1fr) 0.8rem ${normalizedSize}px`,
      };
    }

    return {
      gridTemplateRows:
        primary === 'first'
          ? `${normalizedSize}px 0.8rem minmax(0, 1fr)`
          : `minmax(0, 1fr) 0.8rem ${normalizedSize}px`,
    };
  }, [normalizedSize, orientation, primary]);

  const [firstPane, secondPane] = Children.toArray(children);

  return (
    <div
      data-split-pane={orientation}
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        ...templateStyle,
      }}
    >
      {primary === 'first' ? firstPane : secondPane}

      <div
        role="separator"
        aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-label={handleLabel}
        onMouseDown={(event) => {
          event.preventDefault();
          dragStateRef.current = {
            origin: coordinateForEvent(event.nativeEvent, orientation),
            size: normalizedSize,
          };
          setDragging(true);
        }}
        style={{
          position: 'relative',
          minWidth: orientation === 'horizontal' ? '0.8rem' : undefined,
          minHeight: orientation === 'vertical' ? '0.8rem' : undefined,
          cursor: orientation === 'horizontal' ? 'col-resize' : 'row-resize',
          touchAction: 'none',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: orientation === 'horizontal' ? '0 0.25rem' : '0.25rem 0',
            borderRadius: '999px',
            background: 'var(--app-border-strong)',
            opacity: dragging ? 1 : 0.55,
            transition: 'opacity var(--app-motion-fast) ease',
          }}
        />
      </div>

      {primary === 'first' ? secondPane : firstPane}
    </div>
  );
}
