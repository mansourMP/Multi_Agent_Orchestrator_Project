'use client';

import type { WheelEvent as ReactWheelEvent } from 'react';

function isScrollableElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight;
  const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth;
  return canScrollY || canScrollX;
}

function findLocalScrollableAncestor(start: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  let current = start instanceof HTMLElement ? start : null;
  while (current && current !== boundary) {
    if (isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findMainScrollTarget(): HTMLElement | null {
  const selectors = [
    '.orion-page-shell.is-builder-page',
    '.orion-page-shell:not(.is-chat-home):not(.is-builder-page)',
    '.orion-main-shell',
  ];

  for (const selector of selectors) {
    const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
    for (const element of matches) {
      if (!element.isConnected) continue;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
        return element;
      }
    }
  }
  return null;
}

export function forwardWheelToMainScroll(event: ReactWheelEvent<HTMLElement>): void {
  const boundary = event.currentTarget;
  if (!(boundary instanceof HTMLElement)) return;
  if (findLocalScrollableAncestor(event.target, boundary)) {
    return;
  }
  const target = findMainScrollTarget();
  if (!target) return;

  const { deltaX, deltaY } = event;
  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
    return;
  }

  event.preventDefault();
  target.scrollBy({
    top: deltaY,
    left: deltaX,
    behavior: 'auto',
  });
}
