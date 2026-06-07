'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ReactLenis, useLenis } from 'lenis/react';
import {
  Activity,
  Brain,
  Cloud,
  CodeXml,
  Cpu,
  Database,
  FileStack,
  Globe2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Server,
  ShieldCheck,
  SquareTerminal,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

type SceneKey = 'origin' | 'channels' | 'agents' | 'execution' | 'memory' | 'governance';

type LandingClientProps = {
  accountHref: string;
  accountLabel: string;
  primaryHref: string;
  primaryLabel: string;
  finalCtaLabel: string;
};

type Scene = {
  key: SceneKey;
  eyebrow: string;
  title: string;
  body: string;
};

type FloatingNode = {
  label: string;
  detail?: string;
  icon: LucideIcon;
};

const scenes: Scene[] = [
  {
    key: 'origin',
    eyebrow: 'Sage starts instantly',
    title: 'An AI operator that works from chat first.',
    body: 'Ask Sage to reason, write, remember, upload files, and prepare work without installing anything.',
  },
  {
    key: 'channels',
    eyebrow: 'Connected Assistant',
    title: 'Connect the apps where work already lives.',
    body: 'Gmail, Calendar, Drive, GitHub, Notion, Slack, Telegram, WhatsApp, and web chat become one observable assistant surface.',
  },
  {
    key: 'agents',
    eyebrow: 'Recipes and MCP',
    title: 'Turn repeatable work into reliable operator recipes.',
    body: 'Morning briefs, email triage, meeting prep, weekly reports, custom MCP tools, and webhooks share the same memory, approvals, and proof log.',
  },
  {
    key: 'execution',
    eyebrow: 'Cloud first, computer when needed',
    title: 'Use APIs, hosted browser, cloud computers, then real hardware.',
    body: 'Sage routes work to connected apps first, hosted browsers for websites, cloud computers for heavier jobs, and Agent Computer only for local/private access.',
  },
  {
    key: 'memory',
    eyebrow: 'Permissioned memory',
    title: 'The platform remembers with boundaries.',
    body: 'Profile, episodic, operational, specialist, local-private, and cloud-synced memory stay scoped, inspectable, and useful.',
  },
  {
    key: 'governance',
    eyebrow: 'Trust controls',
    title: 'Autonomy stays visible and governed.',
    body: 'Approvals, policy modes, brokered secrets, diagnostics, run history, and audit streams make powerful agents understandable.',
  },
];

const channelNodes = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'discord', label: 'Discord' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'slack', label: 'Slack' },
  { key: 'email', label: 'Email' },
  { key: 'web', label: 'Web Chat' },
] as const;

const agentNodes: FloatingNode[] = [
  { label: 'Recipes', detail: 'workflows', icon: Workflow },
  { label: 'MCP', detail: 'servers', icon: CodeXml },
  { label: 'APIs', detail: 'connectors', icon: Globe2 },
  { label: 'Custom', detail: 'tools', icon: SquareTerminal },
];

const executionNodes: FloatingNode[] = [
  { label: 'Apps', detail: 'OAuth/API', icon: Cloud },
  { label: 'Browser', detail: 'hosted', icon: Globe2 },
  { label: 'Cloud PC', detail: 'isolated', icon: Server },
  { label: 'My Computer', detail: 'Gateway', icon: Cpu },
];

const memoryNodes: FloatingNode[] = [
  { label: 'Profile', detail: 'identity', icon: Database },
  { label: 'Episodic', detail: 'history', icon: Brain },
  { label: 'Local Private', detail: 'device only', icon: LockKeyhole },
  { label: 'Operational', detail: 'active work', icon: Activity },
];

const governanceNodes: FloatingNode[] = [
  { label: 'Approval', detail: 'gates', icon: ShieldCheck },
  { label: 'Audit', detail: 'stream', icon: Activity },
  { label: 'Sandbox', detail: 'runtime', icon: SquareTerminal },
  { label: 'Diagnostics', detail: 'export', icon: FileStack },
];

function BrandIcon({ name }: { name: (typeof channelNodes)[number]['key'] }) {
  if (name === 'telegram') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M34.8 8.1 6.2 19.3c-1.7.7-1.7 3.1.1 3.6l6.9 2.1 2.7 8.1c.5 1.6 2.6 1.8 3.5.5l4.2-5.9 7 5.1c1.4 1 3.2.2 3.6-1.5l4.2-21.1c.3-1.5-1.8-2.9-3.6-2.1Zm-18.9 15 13.5-8.5-10.5 11-.6 4.4-1.9-5.9-.5-1Z" />
      </svg>
    );
  }

  if (name === 'discord') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M12.4 11.2c4.9-2.3 10.1-2.3 15.2 0 3.5 5 4.7 10.4 4.2 15.7-3.2 2.4-6.2 3.8-9.3 4.2l-1.1-2.2c1.8-.5 3.4-1.3 4.8-2.3-4.2 2-8.2 2-12.4 0 1.4 1 3 1.8 4.8 2.3l-1.1 2.2c-3.1-.5-6.1-1.9-9.3-4.2-.5-6.1 1-11.3 4.2-15.7Zm4.1 10.6c1.1 0 2-1 2-2.2s-.9-2.2-2-2.2-2 1-2 2.2.9 2.2 2 2.2Zm7 0c1.1 0 2-1 2-2.2s-.9-2.2-2-2.2-2 1-2 2.2.9 2.2 2 2.2Z" />
      </svg>
    );
  }

  if (name === 'whatsapp') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M20 5.2A14 14 0 0 0 8.2 26.8l-1.9 7.8 8-1.9A14 14 0 1 0 20 5.2Zm8.1 20.2c-.4 1.1-2.2 2.1-3.2 2.3-.8.1-1.9.2-3-.2-2.7-.9-5.2-2.5-7.2-4.8-1.9-2-3.2-4.4-3.7-6.4-.4-1.4 0-2.6.6-3.4.5-.6 1-.8 1.4-.8h1c.4 0 .8.1 1 .8.3.9 1.1 2.7 1.2 2.9.2.3.2.6 0 1l-.8 1.1c-.3.3-.4.6-.1 1 .5 1 1.2 1.9 2.1 2.7 1 .9 2.1 1.5 3.2 1.9.4.1.8.1 1-.2l1.3-1.5c.3-.4.7-.4 1.1-.3.4.1 2.7 1.3 3.2 1.5.5.3.8.4.8.7.2.3.2 1-.1 1.7Z" />
      </svg>
    );
  }

  if (name === 'slack') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M15.4 6.3a3.1 3.1 0 0 1 6.2 0v6.4a3.1 3.1 0 0 1-6.2 0V6.3Zm9.1 9.1h6.4a3.1 3.1 0 0 1 0 6.2h-6.4a3.1 3.1 0 0 1 0-6.2Zm-9.1 11.9a3.1 3.1 0 1 1 6.2 0v6.4a3.1 3.1 0 0 1-6.2 0v-6.4ZM6.3 15.4h6.4a3.1 3.1 0 0 1 0 6.2H6.3a3.1 3.1 0 0 1 0-6.2Zm18.2-5.9A3.1 3.1 0 1 1 30.7 12v.7h-6.2V9.5Zm6.2 15v.7a3.1 3.1 0 1 1-6.2-3.1v-3.8h3.1a3.1 3.1 0 0 1 3.1 3.1v3.1ZM9.5 24.5h6.2v6.2H15a3.1 3.1 0 0 1-5.5-2v-4.2Zm0-9v-.5a3.1 3.1 0 1 1 6.2-2.3v2.8H9.5Z" />
      </svg>
    );
  }

  if (name === 'email') return <Mail aria-hidden="true" />;
  return <MessageCircle aria-hidden="true" />;
}

function SparkMark() {
  return (
    <svg className="spark-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 5 38.4 24.4 59 32 38.4 39.6 32 59 25.6 39.6 5 32 25.6 24.4 32 5Z" />
      <circle cx="32" cy="32" r="6.5" />
    </svg>
  );
}

function PlatformRoom({ activeScene }: { activeScene: SceneKey }) {
  return (
    <div className="cinema-stage__world" data-active-scene={activeScene} aria-hidden="true">
      <div className="room">
        <div className="room__back" />
        <div className="room__floor" />
        <div className="room__left" />
        <div className="room__right" />
        <div className="room__light room__light--blue" />
        <div className="room__light room__light--violet" />
      </div>

      <svg className="signal-web" viewBox="0 0 1200 760">
        <defs>
          <linearGradient id="signalGradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <ellipse className="signal-ring signal-ring--one" cx="600" cy="380" rx="236" ry="84" />
        <ellipse className="signal-ring signal-ring--two" cx="600" cy="380" rx="344" ry="132" />
        <ellipse className="signal-ring signal-ring--three" cx="600" cy="380" rx="462" ry="188" />
        <path id="pathA" className="signal-path" d="M160 402 C340 250 486 262 600 380 C732 516 894 540 1040 406" />
        <path id="pathB" className="signal-path signal-path--soft" d="M232 205 C426 252 496 316 600 380 C728 458 868 340 992 204" />
        <path id="pathC" className="signal-path signal-path--soft" d="M246 586 C406 450 500 420 600 380 C748 316 878 400 1030 570" />
        <circle className="signal-dot signal-dot--one" r="7">
          <animateMotion dur="6.4s" repeatCount="indefinite" href="#pathA" />
        </circle>
        <circle className="signal-dot signal-dot--two" r="5">
          <animateMotion dur="7.8s" begin="0.9s" repeatCount="indefinite" href="#pathB" />
        </circle>
        <circle className="signal-dot signal-dot--three" r="6">
          <animateMotion dur="8.2s" begin="1.7s" repeatCount="indefinite" href="#pathC" />
        </circle>
      </svg>

      <div className="sage-core">
        <div className="sage-core__halo" />
        <div className="sage-core__orb">
          <SparkMark />
          <strong>Sage</strong>
          <span>Main agent</span>
        </div>
        <div className="sage-core__shadow" />
      </div>

      <div className={`scene-layer scene-layer--channels ${activeScene === 'channels' ? 'is-active' : ''}`}>
        {channelNodes.map((node, index) => (
          <div className={`brand-orb brand-orb--${node.key}`} style={{ '--i': index } as CSSProperties} key={node.key}>
            <BrandIcon name={node.key} />
            <span>{node.label}</span>
          </div>
        ))}
      </div>

      <NodeLayer className="scene-layer--agents" active={activeScene === 'agents'} nodes={agentNodes} />
      <ExecutionLayer active={activeScene === 'execution'} />
      <NodeLayer className="scene-layer--memory" active={activeScene === 'memory'} nodes={memoryNodes} />
      <NodeLayer className="scene-layer--governance" active={activeScene === 'governance'} nodes={governanceNodes} />
    </div>
  );
}

function NodeLayer({ className, active, nodes }: { className: string; active: boolean; nodes: FloatingNode[] }) {
  return (
    <div className={`scene-layer ${className} ${active ? 'is-active' : ''}`}>
      {nodes.map((node, index) => {
        const Icon = node.icon;
        return (
          <div className="micro-node" style={{ '--i': index } as CSSProperties} key={node.label}>
            <Icon aria-hidden="true" />
            <span>{node.label}</span>
            {node.detail ? <small>{node.detail}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

function ExecutionLayer({ active }: { active: boolean }) {
  return (
    <div className={`scene-layer scene-layer--execution ${active ? 'is-active' : ''}`}>
      <div className="machine machine--mac">
        <div className="machine__screen">
          <i />
        </div>
        <div className="machine__base" />
        <span>Local Mac</span>
      </div>
      <div className="machine machine--vps">
        <div className="rack">
          <i />
          <i />
          <i />
        </div>
        <span>VPS Runner</span>
      </div>
      <div className="micro-node micro-node--cloud">
        <Cloud aria-hidden="true" />
        <span>Cloud</span>
        <small>control</small>
      </div>
      <div className="micro-node micro-node--terminal">
        <SquareTerminal aria-hidden="true" />
        <span>Terminal</span>
        <small>browser/files</small>
      </div>
    </div>
  );
}

function Caption({ activeScene }: { activeScene: SceneKey }) {
  const scene = scenes.find((item) => item.key === activeScene) ?? scenes[0];
  return (
    <div className="scene-caption" aria-live="polite">
      <p>{scene.eyebrow}</p>
      <h1>{scene.title}</h1>
      <span>{scene.body}</span>
    </div>
  );
}

function LandingExperience({ accountHref, accountLabel, primaryHref, primaryLabel, finalCtaLabel }: LandingClientProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [activeScene, setActiveScene] = useState<SceneKey>('origin');

  useLenis(() => ScrollTrigger.update());

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const root = rootRef.current;
    if (!root) return undefined;

    const context = gsap.context(() => {
      gsap.fromTo(
        '.scene-caption > *',
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out', stagger: 0.08 },
      );

      gsap.utils.toArray<HTMLElement>('[data-story-scene]').forEach((step) => {
        const scene = step.dataset.storyScene as SceneKey | undefined;
        if (!scene) return;
        ScrollTrigger.create({
          trigger: step,
          start: 'top center',
          end: 'bottom center',
          onEnter: () => setActiveScene(scene),
          onEnterBack: () => setActiveScene(scene),
        });
      });
    }, root);

    return () => context.revert();
  }, []);

  return (
    <main className="landing-root" data-scene={activeScene} ref={rootRef}>
      <nav className="landing-nav" aria-label="Empyralis public navigation">
        <Link className="nav-logo" href="/" aria-label="Empyralis home">
          <span className="nav-logo__mark">
            <SparkMark />
          </span>
          <span>Empyralis</span>
        </Link>
        <div className="landing-nav__actions">
          <Link className="landing-button landing-button--quiet" href={accountHref}>
            {accountLabel}
          </Link>
          <Link className="landing-button landing-button--solid" href={primaryHref}>
            {primaryLabel}
          </Link>
        </div>
      </nav>

      <section className="cinematic-landing" aria-label="Empyralis platform overview">
        <div className="cinema-stage">
          <PlatformRoom activeScene={activeScene} />
          <Caption activeScene={activeScene} />
          <div className="scroll-cue">Scroll to orbit the platform</div>
        </div>
        <div className="story-steps" aria-hidden="true">
          {scenes.map((scene) => (
            <article data-story-scene={scene.key} key={scene.key} />
          ))}
        </div>
      </section>

      <section className="landing-summary">
        <p>Cloud-first AI operator</p>
        <h2>Start in chat, connect apps, run recipes, and control real computers only when the task requires it.</h2>
        <Link className="landing-button landing-button--solid landing-button--large" href={primaryHref}>
          {finalCtaLabel}
        </Link>
      </section>
    </main>
  );
}

export function LandingClient(props: LandingClientProps) {
  return (
    <ReactLenis
      root
      options={{
        duration: 1.05,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      }}
    >
      <LandingExperience {...props} />
    </ReactLenis>
  );
}
