'use client';

import Link from 'next/link';
import { CSSProperties, ReactNode, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  Bot,
  Compass,
  Cpu,
  Layers,
  Network,
  Package,
  PlugZap,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

type LandingClientProps = {
  accountHref: string;
  accountLabel: string;
  primaryHref: string;
  primaryLabel: string;
  finalCtaLabel: string;
};

type BentoTiltProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const BentoTilt = ({ children, className = '', style }: BentoTiltProps) => {
  const [transformStyle, setTransformStyle] = useState('');
  const itemRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!itemRef.current) return;
    const { left, top, width, height } = itemRef.current.getBoundingClientRect();
    const relativeX = (event.clientX - left) / width;
    const relativeY = (event.clientY - top) / height;
    const tiltX = (relativeY - 0.5) * 8;
    const tiltY = (relativeX - 0.5) * -8;

    setTransformStyle(`perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`);
  };

  return (
    <div
      ref={itemRef}
      className={`bento-tilt ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTransformStyle('')}
      style={{
        ...style,
        transform: transformStyle,
        transition: transformStyle ? 'none' : 'transform 0.5s ease',
      }}
    >
      {children}
    </div>
  );
};

export function LandingClient({
  accountHref,
  accountLabel,
  primaryHref,
  primaryLabel,
  finalCtaLabel,
}: LandingClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    const raf = (time: number) => lenis.raf(time * 1000);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    gsap.to('.hero-bg', {
      scrollTrigger: {
        trigger: '#hero-container',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
      clipPath: 'polygon(5% 5%, 95% 5%, 95% 95%, 5% 95%)',
      borderRadius: '40px',
      ease: 'none',
    });

    gsap.to('.hero-content', {
      scrollTrigger: {
        trigger: '#hero-container',
        start: 'top top',
        end: 'center top',
        scrub: true,
      },
      opacity: 0,
      y: -50,
      scale: 0.95,
    });

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: '#horizontal-pin-section',
        start: 'top top',
        end: '+=3000',
        scrub: 1,
        pin: true,
      },
    });

    timeline.to('.horizontal-track', {
      xPercent: -66.666,
      ease: 'none',
    });

    let lastScroll = 0;
    const nav = document.querySelector('.landing-nav');
    const handleScroll = () => {
      const currentScroll = window.scrollY;
      if (currentScroll <= 0) {
        nav?.classList.remove('scroll-up');
        lastScroll = currentScroll;
        return;
      }
      if (currentScroll > lastScroll && !nav?.classList.contains('scroll-down')) {
        nav?.classList.remove('scroll-up');
        nav?.classList.add('scroll-down');
      } else if (currentScroll < lastScroll && nav?.classList.contains('scroll-down')) {
        nav?.classList.remove('scroll-down');
        nav?.classList.add('scroll-up');
      }
      lastScroll = currentScroll;
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      lenis.destroy();
      gsap.ticker.remove(raf);
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <main className="landing-root" ref={containerRef}>
      <nav className="landing-nav" aria-label="Empyralis public navigation">
        <Link href="/" className="nav-logo" aria-label="Empyralis home">
          <span className="nav-logo__mark" />
          <span>Empyralis</span>
        </Link>
        <div className="landing-nav__actions">
          <Link href={accountHref} className="btn btn--secondary">
            {accountLabel}
          </Link>
          <Link href={primaryHref} className="btn btn--primary">
            {primaryLabel}
          </Link>
        </div>
      </nav>

      <section id="hero-container" aria-labelledby="landing-hero-title">
        <div className="hero-bg" />
        <div className="hero-content">
          <h1 id="landing-hero-title" className="hero-title">
            The Operating System <br />
            for <span>Serious Agents</span>
          </h1>
          <p className="hero-subtitle">
            A unified workspace for building, running, and governing your AI. One central command surface for your
            personal agent, and a dedicated studio for your workforce.
          </p>
        </div>
      </section>

      <section id="horizontal-pin-section">
        <div className="horizontal-track">
          <div className="h-panel h-panel--intro">
            <BentoTilt className="bento-card bento-card--centered">
              <h3>Two Core Pillars</h3>
              <p>Empyralis simplifies AI down to two powerful concepts. Scroll to unpack them.</p>
              <div className="pillar-pair">
                <div>
                  <Bot size={24} color="var(--landing-accent)" />
                  <strong>The Main Agent</strong>
                </div>
                <div>
                  <Workflow size={24} color="var(--landing-purple)" />
                  <strong>Agent Studio</strong>
                </div>
              </div>
            </BentoTilt>
          </div>

          <div className="h-panel h-panel--agent">
            <BentoTilt className="bento-card bento-card--split">
              <div>
                <span className="pillar-label pillar-label--main">PILLAR 01</span>
                <h3>The Main Agent</h3>
                <p>
                  The primary intelligence that owns the user relationship. It acts as your interface to the entire
                  platform, using layered memory to know how you work.
                </p>
                <div className="data-stack">
                  <div className="data-row"><Layers size={20} color="var(--landing-accent)" /> Total Context & Memory Awareness</div>
                  <div className="data-row"><Package size={20} color="var(--landing-accent)" /> Bring Your Own Hosted Apps</div>
                  <div className="data-row"><Network size={20} color="var(--landing-accent)" /> Omnichannel: WhatsApp, Slack, Telegram</div>
                </div>
              </div>
              <div className="feature-tile">
                <Cpu size={80} color="var(--landing-accent)" />
                <p>
                  <strong>Hardware Control</strong>
                  <span>Run agents securely on your own local Mac mini or cloud instance.</span>
                </p>
              </div>
            </BentoTilt>
          </div>

          <div className="h-panel h-panel--studio">
            <BentoTilt className="bento-card bento-card--split">
              <div>
                <span className="pillar-label pillar-label--studio">PILLAR 02</span>
                <h3>Agent Studio</h3>
                <p>
                  The control center for your workforce. Build native workers, connect external runtimes, and monitor
                  production behavior with full transparency.
                </p>
                <div className="data-stack">
                  <div className="data-row"><Workflow size={20} color="var(--landing-purple)" /> Build Native Platform Workers</div>
                  <div className="data-row"><PlugZap size={20} color="var(--landing-purple)" /> Connect External Agents: OpenClaw, Hermes</div>
                  <div className="data-row"><ShieldCheck size={20} color="var(--landing-purple)" /> Safety Control Plane & Approvals</div>
                </div>
              </div>
              <div className="feature-tile">
                <Compass size={80} color="var(--landing-purple)" />
                <p>
                  <strong>The Discover Marketplace</strong>
                  <span>Install pre-built templates, skills, and governed connectors.</span>
                </p>
              </div>
            </BentoTilt>
          </div>
        </div>
      </section>

      <section className="landing-final-cta">
        <div>
          <h2>Take control of your agents.</h2>
          <Link href={primaryHref} className="btn btn--primary btn--large">
            {finalCtaLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
