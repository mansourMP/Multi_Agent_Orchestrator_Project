'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import './continue.css';

const CONTINUE_INTENT_STORAGE_KEY = 'empyralis.continue-intent';
const UPGRADE_CLICK_SESSION_KEY_PREFIX = 'empyralis.upgrade-click::';
const IOS_DOWNLOAD_URL = 'https://apps.apple.com/app/id0000000000';
const ANDROID_DOWNLOAD_URL = 'https://play.google.com/store/apps/details?id=com.empyralis.app';

export default function ContinuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const source = searchParams.get('source');
  const agent = searchParams.get('agent');
  const channelAttribution = searchParams.get('channel_attribution') || searchParams.get('token');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
      return;
    }
    if (source !== 'telegram_limit_hit' || !agent || !channelAttribution) {
      return;
    }
    const storageKey = `${UPGRADE_CLICK_SESSION_KEY_PREFIX}${channelAttribution}`;
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/marketplace/upgrade-click', {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            channel_attribution: channelAttribution,
            source,
            agent_id: agent,
          }),
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json() as {
          ok?: boolean;
          duplicate?: boolean;
        };
        if (!cancelled && (payload.ok === true || payload.duplicate === true)) {
          window.sessionStorage.setItem(storageKey, '1');
        }
      } catch {
        // Allow refresh-driven retries when attribution fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent, channelAttribution, source]);

  function handleContinueOnWeb() {
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      window.sessionStorage.setItem(
        CONTINUE_INTENT_STORAGE_KEY,
        JSON.stringify({
          source,
          agent,
          channelAttribution,
          capturedAt: Date.now(),
        }),
      );
    }

    const nextSearchParams = new URLSearchParams();
    if (agent) {
      nextSearchParams.set('agent', agent);
    }
    if (channelAttribution) {
      nextSearchParams.set('channel_attribution', channelAttribution);
    }

    router.push(nextSearchParams.size > 0 ? `/login?${nextSearchParams.toString()}` : '/login');
  }

  return (
    <main className="continue-page">
      <section className="continue-page__shell">
        <div className="continue-page__brand" aria-label="Empyralis">
          <div className="continue-page__brand-mark" aria-hidden="true">E</div>
          <span className="continue-page__brand-name">Empyralis</span>
        </div>

        <div className="continue-page__copy">
          <h1 className="continue-page__title">Continue your conversation</h1>
          <p className="continue-page__subtitle">
            Download the app or sign in to unlock more messages and keep your history across all
            your devices.
          </p>
        </div>

        <div className="continue-page__actions">
          <a
            href={IOS_DOWNLOAD_URL}
            className="continue-page__button continue-page__button--primary"
          >
            Download for iOS
          </a>
          <a
            href={ANDROID_DOWNLOAD_URL}
            className="continue-page__button continue-page__button--secondary"
          >
            Download for Android
          </a>
          <button
            type="button"
            className="continue-page__button continue-page__button--ghost"
            onClick={handleContinueOnWeb}
          >
            Continue on web
          </button>
        </div>

        <footer className="continue-page__footer">Powered by Empyralis</footer>
      </section>
    </main>
  );
}
