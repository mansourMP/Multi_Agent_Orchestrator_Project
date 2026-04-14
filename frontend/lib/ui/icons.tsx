'use client';

import type { ReactNode, SVGProps } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';

type AppIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function AppIcon({
  size = 16,
  className,
  children,
  ...props
}: AppIconProps & {
  children: ReactNode;
}) {
  return (
    <svg
      {...props}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={joinClassNames('app-icon', className)}
    >
      {children}
    </svg>
  );
}

export function SparkIcon(props: AppIconProps) {
  return (
    <AppIcon {...props}>
      <path d="M8 1.5 9.5 6 14 7.5 9.5 9 8 13.5 6.5 9 2 7.5 6.5 6 8 1.5Z" />
    </AppIcon>
  );
}

export function ActivityIcon(props: AppIconProps) {
  return (
    <AppIcon {...props}>
      <path d="M1.75 8h2.4l1.55-3.45L8.3 11l2.05-4h3.9" />
    </AppIcon>
  );
}

export function InboxIcon(props: AppIconProps) {
  return (
    <AppIcon {...props}>
      <path d="M2 4.25h12v7.5H10.5L8 14l-2.5-2.25H2v-7.5Z" />
      <path d="M5.25 7.75h5.5" />
    </AppIcon>
  );
}

export function SettingsIcon(props: AppIconProps) {
  return (
    <AppIcon {...props}>
      <circle cx="8" cy="8" r="2.15" />
      <path d="M8 1.75v1.5M8 12.75v1.5M12.25 3.75l-1.05 1.05M4.8 11.2 3.75 12.25M14.25 8h-1.5M3.25 8h-1.5M12.25 12.25 11.2 11.2M4.8 4.8 3.75 3.75" />
    </AppIcon>
  );
}
