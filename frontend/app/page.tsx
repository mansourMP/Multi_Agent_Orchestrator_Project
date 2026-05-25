import Link from 'next/link';
import { Metadata } from 'next';
import {
  Activity,
  ArrowRight,
  Bot,
  Cpu,
  KeyRound,
  Laptop,
  MessageSquare,
  Network,
  PlugZap,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { ShellRecoveryActions } from '@/app/(account)/ShellRecoveryActions';
import {
  isDegradedAccountShellSession,
  loadAccountShellSession,
} from '@/lib/server/load-account-shell-session';
import { resolvePrimaryProductWorkspaceId } from '@/lib/shell/workspace-membership-model';

import './landing.css';

export const metadata: Metadata = {
  title: 'Empyralis | Agent Studio for connected AI work',
  description:
    'A control surface for your main agent, worker agents, connected external agents, and dedicated agent computers.',
};

const operatingLayers = [
  {
    label: 'Main agent',
    title: 'The user-facing operator',
    body: 'One personal command surface for planning, delegation, approvals, and computer access.',
    icon: Bot,
  },
  {
    label: 'Agent Studio',
    title: 'Native and external workers',
    body: 'Create native workers, connect external runtimes, and keep ownership boundaries visible.',
    icon: Workflow,
  },
  {
    label: 'Agent computers',
    title: 'Hardware as a governed runtime',
    body: 'Attach a Mac mini, laptop, server, or cloud machine without pretending it is the brain.',
    icon: Laptop,
  },
];

const boundaries = [
  'Native agents stay platform-owned.',
  'OpenClaw, Hermes, NemoClaw, MCP, A2A, and custom agents connect as external-owned surfaces.',
  'Localhost and private-network agents route through a local connector or Agent Computer.',
  'Autonomous hardware keeps stop, revoke, audit, limits, and owner-visible state.',
];

const surfaces = [
  { label: 'Private owner chat', value: 'Main + workers', icon: MessageSquare },
  { label: 'External connectors', value: 'Manifest driven', icon: PlugZap },
  { label: 'Agent computers', value: 'Local or cloud', icon: Cpu },
  { label: 'Permission modes', value: 'Guarded to full access', icon: KeyRound },
];

const integrations = ['OpenClaw', 'Hermes', 'NemoClaw', 'MCP', 'A2A', 'Custom HTTP', 'Local connector'];

export default async function LandingPage() {
  const session = await loadAccountShellSession();
  if (isDegradedAccountShellSession(session)) {
    return (
      <main className="app-page-message">
        <div className="app-page-message__content">
          <h1 className="app-page-message__title">Workspace is warming up</h1>
          <p className="app-page-message__body">
            Empyralis could not confirm your workspace session yet. This usually clears after a restart or deploy.
          </p>
          <p className="app-page-message__meta">
            Reload the workspace, or sign in again if it keeps happening.
          </p>
          <ShellRecoveryActions label="Workspace recovery actions" />
        </div>
      </main>
    );
  }

  const workspaceId = session ? resolvePrimaryProductWorkspaceId(session.workspaceMemberships) : null;
  const platformHref = workspaceId ? `/w/${encodeURIComponent(workspaceId)}/sage` : '/workspaces/new';
  const isAuthenticated = Boolean(session);
  const accountHref = isAuthenticated ? platformHref : '/login';
  const accountLabel = isAuthenticated ? 'Open platform' : 'Log in';
  const primaryHref = isAuthenticated ? platformHref : '/signup';
  const primaryLabel = isAuthenticated ? 'Open platform' : 'Create account';
  const finalCtaLabel = isAuthenticated ? 'Open your main agent' : 'Start with your main agent';

  return (
    <main className="landing-root">
      <header className="landing-nav" aria-label="Empyralis public navigation">
        <Link href="/" className="landing-brand" aria-label="Empyralis home">
          <span className="landing-brand__mark">E</span>
          <span>Empyralis</span>
        </Link>
        <nav className="landing-nav__links" aria-label="Landing sections">
          <a href="#platform">Platform</a>
          <a href="#boundary">Boundary</a>
          <a href="#connect">Connect</a>
        </nav>
        <div className="landing-nav__actions">
          <Link href="/preview" className="landing-link-button">
            Preview
          </Link>
          <Link href={accountHref} className="landing-solid-button">
            {accountLabel}
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero__scene" aria-hidden="true">
          <ProductScene />
        </div>
        <div className="landing-hero__content">
          <p className="landing-eyebrow">Agent control surface</p>
          <h1 id="landing-hero-title">Run your agents, external runtimes, and real computers from one place.</h1>
          <p className="landing-hero__body">
            Empyralis is the workspace where a main agent, native Studio agents, connected external agents,
            and dedicated hardware share one governed operating surface.
          </p>
          <div className="landing-hero__actions">
            <Link href={primaryHref} className="landing-solid-button landing-solid-button--large">
              {primaryLabel}
              <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <Link href={accountHref} className="landing-outline-button landing-outline-button--large">
              Open workspace
            </Link>
          </div>
          <div className="landing-hero__proof" aria-label="Platform scope">
            {surfaces.map((item) => {
              const Icon = item.icon;
              return (
                <div className="landing-proof-item" key={item.label}>
                  <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="platform" className="landing-section landing-section--layers" aria-labelledby="platform-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">Product model</p>
          <h2 id="platform-title">Not one vague agent list. A clear operating model.</h2>
          <p>
            The platform can show every agent-related thing in one place while preserving the important difference
            between a brain, a worker, an external runtime, and a computer.
          </p>
        </div>
        <div className="landing-layer-grid">
          {operatingLayers.map((layer) => {
            const Icon = layer.icon;
            return (
              <article className="landing-layer" key={layer.label}>
                <span className="landing-layer__icon">
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="landing-layer__label">{layer.label}</span>
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="boundary" className="landing-section landing-section--boundary" aria-labelledby="boundary-title">
        <div className="landing-boundary-copy">
          <p className="landing-eyebrow">Trust boundary</p>
          <h2 id="boundary-title">The platform controls the connection. It does not fake ownership of every brain.</h2>
          <p>
            Native agents, connected agents, and agent computers can sit in one interface because the system keeps
            their permissions, health, provider, and ownership state explicit.
          </p>
        </div>
        <div className="landing-boundary-panel" aria-label="Boundary checklist">
          {boundaries.map((item, index) => (
            <div className="landing-boundary-row" key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="connect" className="landing-section landing-section--connect" aria-labelledby="connect-title">
        <div className="landing-section__header">
          <p className="landing-eyebrow">Connected agent network</p>
          <h2 id="connect-title">Bring your own agent systems without rebuilding them inside Empyralis.</h2>
          <p>
            External systems connect through manifests, endpoints, local connectors, and provider presets.
            The UI stays generic; the adapters carry the provider details.
          </p>
        </div>
        <div className="landing-connect-grid" aria-label="Supported connection families">
          {integrations.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section--final" aria-labelledby="final-title">
        <div>
          <p className="landing-eyebrow">Launch direction</p>
          <h2 id="final-title">Build the place people come back to when their agents start doing real work.</h2>
        </div>
        <Link href={primaryHref} className="landing-solid-button landing-solid-button--large">
          {finalCtaLabel}
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </section>

      <footer className="landing-footer">
        <span>Empyralis</span>
        <span>Main agent · Agent Studio · Connected agents · Agent computers</span>
      </footer>
    </main>
  );
}

function ProductScene() {
  const rail = [Bot, Workflow, Network, ShieldCheck, Activity];
  return (
    <div className="landing-product" aria-hidden="true">
      <div className="landing-product__topbar">
        <span>Agent Studio</span>
        <div>
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="landing-product__body">
        <aside className="landing-product__rail">
          {rail.map((Icon, index) => (
            <span key={index}>
              <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
            </span>
          ))}
        </aside>
        <section className="landing-product__sidebar">
          <div className="landing-product__sidebar-head">
            <span>Agents</span>
            <strong>4 surfaces</strong>
          </div>
          <div className="landing-product__search" />
          <div className="landing-product__list">
            <ProductListItem title="Main Agent" meta="Autonomous · guarded" active />
            <ProductListItem title="Native Studio Agent" meta="Platform-owned" />
            <ProductListItem title="OpenClaw Gateway" meta="External-owned" />
            <ProductListItem title="Agent Mac mini" meta="Dedicated computer" />
          </div>
        </section>
        <section className="landing-product__workspace">
          <div className="landing-product__workspace-head">
            <div>
              <span>Operating boundary</span>
              <strong>Main agent command center</strong>
            </div>
            <em>Verified</em>
          </div>
          <div className="landing-product__canvas">
            <div className="landing-product__node landing-product__node--primary">
              <span>Main Agent</span>
              <strong>Plan · delegate · approve</strong>
            </div>
            <div className="landing-product__lane" />
            <div className="landing-product__node">
              <span>Agent Studio</span>
              <strong>Native workers</strong>
            </div>
            <div className="landing-product__node">
              <span>Connected Agent</span>
              <strong>Hermes / OpenClaw</strong>
            </div>
            <div className="landing-product__node">
              <span>Agent Computer</span>
              <strong>Mac mini runtime</strong>
            </div>
          </div>
          <div className="landing-product__log">
            <span>Audit stream</span>
            <p>full_access granted · local connector online · external manifest verified</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ProductListItem({
  title,
  meta,
  active = false,
}: {
  title: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div className={active ? 'landing-product__item landing-product__item--active' : 'landing-product__item'}>
      <span>{title}</span>
      <small>{meta}</small>
    </div>
  );
}
