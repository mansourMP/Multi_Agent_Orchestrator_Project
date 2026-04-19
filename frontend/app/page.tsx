import Link from 'next/link';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { loadAccountShellSessionSafely } from '@/lib/server/load-account-shell-session';
import './landing.css';

export const metadata: Metadata = {
  title: 'Empyralis — Your AI Agent Workspace',
  description: 'One workspace. Multiple channels. Infinite agents. Deploy AI agents across web chat, Telegram, WhatsApp, Discord, and more.',
};

export default async function LandingPage() {
  const session = await loadAccountShellSessionSafely();
  if (session) {
    redirect('/onboarding');
  }

  return (
    <div className="landing-root">
      <header className="landing-header">
        <div className="landing-container">
          <div className="landing-nav">
            <span className="landing-logo">Empyralis</span>
            <nav className="landing-nav-links">
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <Link href="/login" className="landing-nav-cta">Sign in</Link>
            </nav>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="landing-hero">
          <div className="landing-container">
            <div className="landing-hero-content">
              <h1 className="landing-hero-title">
                Your AI agents.<br />
                Every channel.<br />
                One workspace.
              </h1>
              <p className="landing-hero-subtitle">
                Deploy intelligent agents across web chat, Telegram, WhatsApp, Discord,
                and more. Let Sage — your master AI — orchestrate specialists that handle
                customer support, research, and automation.
              </p>
              <div className="landing-hero-ctas">
                <Link href="/signup" className="landing-btn landing-btn-primary">
                  Start free
                </Link>
                <Link href="/login" className="landing-btn landing-btn-secondary">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="landing-features">
          <div className="landing-container">
            <h2 className="landing-section-title">Everything you need</h2>
            <div className="landing-features-grid">
              <div className="landing-feature">
                <div className="landing-feature-icon">🎯</div>
                <h3>Multi-Channel Deployment</h3>
                <p>Deploy one agent to web chat, Telegram, WhatsApp, Discord, Slack, and more. Unified memory across all channels.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-icon">🧠</div>
                <h3>Sage Master Orchestrator</h3>
                <p>A master AI that routes work to specialist agents, manages approvals, and keeps everything running smoothly.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-icon">⚡</div>
                <h3>Specialist Agents</h3>
                <p>Create purpose-built agents for support, research, sales, or operations. Each with their own skills and tools.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-icon">🔒</div>
                <h3>Multi-Tenant Workspaces</h3>
                <p>Separate workspaces for different teams or clients. Role-based access control built in.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-icon">💾</div>
                <h3>Persistent Memory</h3>
                <p>Agents remember conversations, user preferences, and context across sessions. No starting over.</p>
              </div>
              <div className="landing-feature">
                <div className="landing-feature-icon">🔧</div>
                <h3>Tool Integrations</h3>
                <p>Connect to GitHub, Linear, Notion, S3, Dropbox, and more. Agents can read, write, and trigger actions.</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="landing-steps">
          <div className="landing-container">
            <h2 className="landing-section-title">How it works</h2>
            <div className="landing-steps-list">
              <div className="landing-step">
                <span className="landing-step-number">1</span>
                <h3>Create your workspace</h3>
                <p>Set up your team workspace with the channels you need — web chat, Telegram, Discord, and more.</p>
              </div>
              <div className="landing-step">
                <span className="landing-step-number">2</span>
                <h3>Configure your agents</h3>
                <p>Design specialist agents with specific skills, tools, and access controls. Let Sage manage the orchestration.</p>
              </div>
              <div className="landing-step">
                <span className="landing-step-number">3</span>
                <h3>Deploy and monitor</h3>
                <p>Deploy to your channels and watch as your agents handle conversations, escalate when needed, and complete tasks.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="landing-pricing">
          <div className="landing-container">
            <h2 className="landing-section-title">Simple pricing</h2>
            <div className="landing-pricing-grid">
              <div className="landing-pricing-card">
                <h3>Starter</h3>
                <div className="landing-price">Free</div>
                <ul>
                  <li>1 workspace</li>
                  <li>3 agents</li>
                  <li>Web chat channel</li>
                  <li>1,000 messages/month</li>
                </ul>
                <Link href="/signup" className="landing-btn landing-btn-secondary">Get started</Link>
              </div>
              <div className="landing-pricing-card landing-pricing-highlight">
                <div className="landing-pricing-badge">Popular</div>
                <h3>Pro</h3>
                <div className="landing-price">$49<span>/month</span></div>
                <ul>
                  <li>Unlimited workspaces</li>
                  <li>Unlimited agents</li>
                  <li>All channels included</li>
                  <li>10,000 messages/month</li>
                  <li>Priority support</li>
                </ul>
                <Link href="/signup" className="landing-btn landing-btn-primary">Get started</Link>
              </div>
              <div className="landing-pricing-card">
                <h3>Enterprise</h3>
                <div className="landing-price">Custom</div>
                <ul>
                  <li>Everything in Pro</li>
                  <li>Unlimited messages</li>
                  <li>Custom integrations</li>
                  <li>Dedicated support</li>
                  <li>SLA guarantees</li>
                </ul>
                <a href="mailto:hello@empyralis.io" className="landing-btn landing-btn-secondary">Contact sales</a>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="landing-cta">
          <div className="landing-container">
            <h2>Ready to deploy your first agent?</h2>
            <p>Join teams using Empyralis to automate support, research, and operations.</p>
            <Link href="/signup" className="landing-btn landing-btn-primary landing-btn-large">
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-content">
            <span className="landing-logo">Empyralis</span>
            <p>© 2026 Empyralis. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
