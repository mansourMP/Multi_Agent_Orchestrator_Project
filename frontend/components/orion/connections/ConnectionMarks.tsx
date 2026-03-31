'use client';

import type { ReactNode } from 'react';
import type { ConnectorId, ProviderId } from '@/app/page.catalog';

type ConnectorLogoId =
  | ConnectorId
  | 'discord'
  | 'x_twitter'
  | 'youtube'
  | 'tiktok_business'
  | 'custom_api';

function LogoTile({
  size,
  bg,
  border,
  children,
}: {
  size: number;
  bg: string;
  border?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.24)),
        background: bg,
        border: border ? `1px solid ${border}` : '1px solid transparent',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

function SvgMark({
  size,
  viewBox = '0 0 24 24',
  children,
}: {
  size: number;
  viewBox?: string;
  children: ReactNode;
}) {
  const inner = Math.round(size * 0.76);
  return (
    <svg
      width={inner}
      height={inner}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {children}
    </svg>
  );
}

export function ProviderLogoMark({
  provider,
  size = 28,
}: {
  provider: ProviderId;
  size?: number;
}) {
  if (provider === 'openai') {
    return (
      <LogoTile size={size} bg="#111111">
        <SvgMark size={size}>
          <circle cx="12" cy="12" r="10" fill="#111111" />
          <text x="12" y="15" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="700" fontFamily="Arial, sans-serif">
            AI
          </text>
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'anthropic' || provider === 'claude_code_cli') {
    return (
      <LogoTile size={size} bg="#FFFFFF" border="#E2E2E2">
        <SvgMark size={size}>
          <rect x="7" y="7" width="10" height="10" transform="rotate(45 12 12)" fill="#111111" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'gemini') {
    return (
      <LogoTile size={size} bg="#FFFFFF" border="#E2E2E2">
        <SvgMark size={size}>
          <path d="M12 3L15.8 8.2L12 12L8.2 8.2L12 3Z" fill="#4285F4" />
          <path d="M21 12L15.8 15.8L12 12L15.8 8.2L21 12Z" fill="#34A853" />
          <path d="M12 21L8.2 15.8L12 12L15.8 15.8L12 21Z" fill="#FBBC05" />
          <path d="M3 12L8.2 8.2L12 12L8.2 15.8L3 12Z" fill="#EA4335" />
          <circle cx="12" cy="12" r="2.2" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'vertex') {
    return (
      <LogoTile size={size} bg="#FFFFFF" border="#E2E2E2">
        <SvgMark size={size}>
          <circle cx="6" cy="17" r="2" fill="#34A853" />
          <circle cx="12" cy="7" r="2" fill="#4285F4" />
          <circle cx="18" cy="17" r="2" fill="#FBBC05" />
          <path d="M7.6 15.9L10.8 8.8M13.2 8.8L16.4 15.9M8.2 17H15.8" stroke="#EA4335" strokeWidth="1.8" strokeLinecap="round" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'qwen') {
    return (
      <LogoTile size={size} bg="#6B40F0">
        <SvgMark size={size}>
          <circle cx="12" cy="12" r="7" stroke="#FFFFFF" strokeWidth="2.2" />
          <path d="M15.8 15.8L19 19" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'deepseek') {
    return (
      <LogoTile size={size} bg="#4D6BFE">
        <SvgMark size={size}>
          <path d="M6 7H12.5C15.6 7 18 9.2 18 12C18 14.8 15.6 17 12.5 17H6V7Z" fill="#FFFFFF" opacity="0.95" />
          <path d="M9 10.2H13C14.2 10.2 15 11 15 12C15 13 14.2 13.8 13 13.8H9" stroke="#4D6BFE" strokeWidth="1.7" strokeLinecap="round" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'mistral') {
    return (
      <LogoTile size={size} bg="#FF7000">
        <SvgMark size={size}>
          <path d="M5.5 18V6L9 11L12 6L15 11L18.5 6V18" stroke="#FFFFFF" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (provider === 'ollama') {
    return (
      <LogoTile size={size} bg="#111111">
        <SvgMark size={size}>
          <circle cx="12" cy="12" r="9" fill="#111111" />
          <path d="M8 15.2V10.5C8 8.6 9.4 7.2 11.2 7.2H12.8C14.6 7.2 16 8.6 16 10.5V15.2" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10.1" cy="11" r="0.9" fill="#FFFFFF" />
          <circle cx="13.9" cy="11" r="0.9" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  return (
    <LogoTile size={size} bg="#FFFFFF" border="#E2E2E2">
      <SvgMark size={size}>
        <circle cx="12" cy="12" r="9" fill="#111111" />
      </SvgMark>
    </LogoTile>
  );
}

export function ConnectorLogoMark({
  id,
  size = 28,
}: {
  id: ConnectorLogoId;
  size?: number;
}) {
  if (id === 'google_workspace') {
    return (
      <LogoTile size={size} bg="#FFFFFF" border="#E2E2E2">
        <SvgMark size={size}>
          <path d="M4 7.5L8.8 4H15.2L20 7.5V16.5L15.2 20H8.8L4 16.5V7.5Z" fill="#4285F4" />
          <path d="M4 7.5L8.8 11.2V20L4 16.5V7.5Z" fill="#34A853" />
          <path d="M20 7.5L15.2 11.2V20L20 16.5V7.5Z" fill="#FBBC05" />
          <path d="M8.8 4L12 7L15.2 4H8.8Z" fill="#EA4335" />
          <rect x="8.1" y="8.7" width="7.8" height="6.6" rx="1.3" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'telegram_bot') {
    return (
      <LogoTile size={size} bg="#2AABEE">
        <SvgMark size={size}>
          <path d="M18.9 6.2L5.2 11.5L8.6 12.8L10.1 17.6L12.8 14.7L16.1 17.2L18.9 6.2Z" fill="#FFFFFF" />
          <path d="M8.6 12.8L18.1 7.2L10.1 17.6" stroke="#2AABEE" strokeWidth="1.2" strokeLinecap="round" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'wechat_work') {
    return (
      <LogoTile size={size} bg="#07C160">
        <SvgMark size={size}>
          <path d="M8.5 8.2C6.3 8.2 4.5 9.8 4.5 11.8C4.5 13 5.1 14.1 6.2 14.8L5.7 17L8 15.8H8.5C10.7 15.8 12.5 14.2 12.5 12.2C12.5 10.1 10.7 8.2 8.5 8.2Z" fill="#FFFFFF" />
          <path d="M15.5 6.8C18 6.8 20 8.5 20 10.8C20 12.9 18.3 14.6 16.1 14.8L16.6 17L14.4 15.8H13.9C11.7 15.8 10 14.3 10 12.2C10 9.9 12.5 6.8 15.5 6.8Z" fill="#D9FFE9" />
          <circle cx="7.3" cy="12" r="0.8" fill="#07C160" />
          <circle cx="10" cy="12" r="0.8" fill="#07C160" />
          <circle cx="14.1" cy="11.3" r="0.8" fill="#07C160" />
          <circle cx="16.8" cy="11.3" r="0.8" fill="#07C160" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'whatsapp_twilio') {
    return (
      <LogoTile size={size} bg="#25D366">
        <SvgMark size={size}>
          <path d="M12 4.5C8.1 4.5 5 7.5 5 11.2C5 12.7 5.5 14.1 6.4 15.3L5.4 19L9.2 18.1C10.1 18.6 11 18.9 12 18.9C15.9 18.9 19 15.9 19 12.2C19 8.5 15.9 4.5 12 4.5Z" fill="#FFFFFF" />
          <path d="M9.6 9.2C9.9 8.9 10.2 8.9 10.4 9.1L11.5 10.6C11.7 10.8 11.7 11.1 11.5 11.3L10.9 11.9C11.4 12.9 12.1 13.6 13.1 14.1L13.7 13.5C13.9 13.3 14.2 13.3 14.4 13.5L15.9 14.6C16.1 14.8 16.1 15.1 15.8 15.4C15.2 16 14.4 16.1 13.7 15.8C11.3 14.8 9.2 12.7 8.2 10.3C7.9 9.6 8 8.8 8.6 8.2L9.6 9.2Z" fill="#25D366" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'discord_bot' || id === 'discord') {
    return (
      <LogoTile size={size} bg="#5865F2">
        <SvgMark size={size}>
          <path d="M7 8.4C8.6 7.2 10.1 6.8 12 6.8C13.9 6.8 15.4 7.2 17 8.4C17.8 10 18.2 11.8 18.2 13.8C16.9 14.9 15.8 15.5 14.3 16L13.3 14.7C14 14.4 14.5 14.1 15 13.7C14.2 14.2 13.2 14.5 12 14.5C10.8 14.5 9.8 14.2 9 13.7C9.5 14.1 10 14.4 10.7 14.7L9.7 16C8.2 15.5 7.1 14.9 5.8 13.8C5.8 11.8 6.2 10 7 8.4Z" fill="#FFFFFF" />
          <circle cx="9.8" cy="11.8" r="1" fill="#5865F2" />
          <circle cx="14.2" cy="11.8" r="1" fill="#5865F2" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'instagram_business') {
    return (
      <LogoTile size={size} bg="linear-gradient(135deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)">
        <SvgMark size={size}>
          <rect x="6" y="6" width="12" height="12" rx="3.2" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="12" cy="12" r="3" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="15.8" cy="8.4" r="1" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'microsoft_365') {
    return (
      <LogoTile size={size} bg="#FFFFFF" border="#E2E2E2">
        <SvgMark size={size}>
          <path d="M4 5L9.2 3.8V10.2H4V5Z" fill="#F25022" />
          <path d="M10.4 3.6L20 4.8V10.2H10.4V3.6Z" fill="#7FBA00" />
          <path d="M4 11.8H9.2V18.2L4 17V11.8Z" fill="#00A4EF" />
          <path d="M10.4 11.8H20V17.2L10.4 18.4V11.8Z" fill="#FFB900" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'x_twitter') {
    return (
      <LogoTile size={size} bg="#111111">
        <SvgMark size={size}>
          <path d="M6 6H9.4L12.2 10.1L15.7 6H18L13.3 11.4L18 18H14.6L11.6 13.7L8 18H5.7L10.5 12.5L6 6Z" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'youtube') {
    return (
      <LogoTile size={size} bg="#FF0000">
        <SvgMark size={size}>
          <rect x="4.5" y="7" width="15" height="10" rx="3" fill="#FF0000" />
          <path d="M10 9.4L15.2 12L10 14.6V9.4Z" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'tiktok_business') {
    return (
      <LogoTile size={size} bg="#111111">
        <SvgMark size={size}>
          <path d="M12.5 6V13.4C12.5 15 11.3 16.2 9.7 16.2C8.7 16.2 7.8 15.7 7.3 14.9" stroke="#25F4EE" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M13.5 6C14 7.5 15.1 8.4 16.7 8.6V10.9C15.4 10.8 14.2 10.3 13.2 9.5V13.4C13.2 15.7 11.4 17.5 9.1 17.5C7.5 17.5 6.1 16.6 5.4 15.2C6.1 16 7 16.5 8 16.5C10 16.5 11.6 14.9 11.6 12.9V5.3H13.5V6Z" stroke="#FE2C55" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M12.9 5.6C13.3 7.1 14.4 8.2 16 8.5V10.1C14.6 9.9 13.5 9.3 12.6 8.4V12.8C12.6 15 10.9 16.7 8.7 16.7C8 16.7 7.4 16.6 6.8 16.3C7.4 16.8 8.2 17.1 9.1 17.1C11.4 17.1 13.2 15.3 13.2 13V8.6C14.1 9.4 15.2 10 16.6 10.2V8.6C15 8.3 13.9 7.2 13.5 5.7H12.9V5.6Z" fill="#FFFFFF" />
        </SvgMark>
      </LogoTile>
    );
  }

  if (id === 'custom_api') {
    return (
      <LogoTile size={size} bg="#F3F4F6" border="#E2E2E2">
        <SvgMark size={size}>
          <path d="M8.5 8L5 12L8.5 16" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.5 8L19 12L15.5 16" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.5 6L10.5 18" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" />
        </SvgMark>
      </LogoTile>
    );
  }

  return (
    <LogoTile size={size} bg="#F3F4F6" border="#E2E2E2">
      <SvgMark size={size}>
        <circle cx="12" cy="12" r="9" fill="#111111" />
      </SvgMark>
    </LogoTile>
  );
}
