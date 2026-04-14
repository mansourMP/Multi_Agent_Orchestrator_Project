'use client';

import type { HTMLAttributes, PropsWithChildren } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';

export function AppEyebrow({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  return (
    <p {...props} className={joinClassNames('app-typography-eyebrow', className)}>
      {children}
    </p>
  );
}

export function AppHeading({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h1 {...props} className={joinClassNames('app-typography-heading', className)}>
      {children}
    </h1>
  );
}

export function AppBody({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  return (
    <p {...props} className={joinClassNames('app-typography-body', className)}>
      {children}
    </p>
  );
}

export function AppMetric({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>>) {
  return (
    <span {...props} className={joinClassNames('app-typography-metric', className)}>
      {children}
    </span>
  );
}
