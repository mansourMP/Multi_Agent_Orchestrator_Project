'use client';

import { Children, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { APP_MOTION, APP_RADIUS, APP_SPACING } from '@/lib/ui/tokens';

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
            ? `${normalizedSize}px ${APP_SPACING[3]} minmax(0, 1fr)`
            : `minmax(0, 1fr) ${APP_SPACING[3]} ${normalizedSize}px`,
      };
    }

    return {
      gridTemplateRows:
        primary === 'first'
          ? `${normalizedSize}px ${APP_SPACING[3]} minmax(0, 1fr)`
          : `minmax(0, 1fr) ${APP_SPACING[3]} ${normalizedSize}px`,
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
          minWidth: orientation === 'horizontal' ? APP_SPACING[3] : undefined,
          minHeight: orientation === 'vertical' ? APP_SPACING[3] : undefined,
          cursor: orientation === 'horizontal' ? 'col-resize' : 'row-resize',
          touchAction: 'none',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: orientation === 'horizontal' ? `0 ${APP_SPACING[1]}` : `${APP_SPACING[1]} 0`,
            borderRadius: APP_RADIUS.pill,
            background: 'var(--app-border-strong)',
            opacity: dragging ? 1 : 0.55,
            transition: `opacity ${APP_MOTION.fast} ease`,
          }}
        />
      </div>

      {primary === 'first' ? secondPane : firstPane}
    </div>
  );
}
