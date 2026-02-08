'use client';
import { useEffect, useState } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Clock, AlertCircle, CheckCircle2, LayoutDashboard, Workflow } from "lucide-react";
import Link from 'next/link';
import { fetchWorkflows, fetchExecutions } from '@/lib/api';

export default function Home() {
  const [data, setData] = useState({
    workflows: [] as any[],
    executions: [] as any[],
    loading: true
  });

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [wfs, execs] = await Promise.all([
          fetchWorkflows(),
          fetchExecutions()
        ]);
        setData({ workflows: wfs, executions: execs, loading: false });
      } catch (err) {
        console.error("Dashboard Load Error:", err);
        setData(prev => ({ ...prev, loading: false }));
      }
    }
    loadDashboardData();
  }, []);

  const successful = data.executions.filter(e => e.status === 'success');
  const failed = data.executions.filter(e => e.status === 'failed');
  const waiting = data.executions.filter(e => e.status === 'waiting');
  const avgDurationMs = successful.length > 0
    ? Math.round(successful.reduce((sum, e) => sum + (e.durationMs || 0), 0) / successful.length)
    : 0;
  const stats = {
    prodExecutions: successful.length,
    failedExecutions: failed.length,
    failureRate: data.executions.length > 0
      ? Math.round((failed.length / data.executions.length) * 100)
      : 0,
    avgDuration: avgDurationMs > 0 ? `${(avgDurationMs / 1000).toFixed(1)}s` : '—',
    hitlWait: waiting.length > 0 ? `${waiting.length} waiting` : '—'
  };

  return (
    <div style={{ padding: '40px 48px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
              <LayoutDashboard size={20} />
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Overview</h1>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Monitor and manage your autonomous workforce.</p>
        </div>
        <div>
          <Link href="/workflows" className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: '8px' }}>
            <Plus size={16} />
            <span>Create Workflow</span>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '20px',
        marginBottom: '48px'
      }}>
        <StatItem label="Prod. Executions" value={stats.prodExecutions} />
        <StatItem label="Failed Executions" value={stats.failedExecutions} />
        <StatItem label="Failure Rate" value={`${stats.failureRate}%`} />
        <StatItem label="Avg. Duration" value={stats.avgDuration} />
        <StatItem label="HITL Wait" value={stats.hitlWait} />
      </div>

      {/* Content Section */}
      <div className="card" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 10px 20px -12px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '32px' }}>
            <TabItem label="Workflows" active count={data.workflows.length} />
            <TabItem label="Credentials" />
            <TabItem label="Executions" />
            <TabItem label="Variables" />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-tertiary)' }} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="input" 
                style={{ paddingLeft: '36px', height: '36px', width: '240px', borderRadius: '8px' }} 
              />
            </div>
            <button className="btn btn-secondary" style={{ height: '36px', borderRadius: '8px' }}>
              <Filter size={14} />
              <span>Filter</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {data.loading ? (
            <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 500 }}>Initializing system data...</div>
          ) : data.workflows.length === 0 ? (
            <div style={{ padding: '100px 0', textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-tertiary)' }}>
                <Clock size={28} />
              </div>
              <h3 style={{ marginBottom: '8px', fontSize: '18px' }}>No workflows found</h3>
              <p style={{ color: 'var(--text-tertiary)', marginBottom: '32px' }}>Start by creating your first autonomous agent flow.</p>
              <Link href="/workflows" className="btn btn-primary">Get Started</Link>
            </div>
          ) : (
            data.workflows.map((wf) => (
              <WorkflowRow
                key={wf.id}
                name={wf.name || 'Untitled Workflow'}
                status={wf.status}
                updatedAt={new Date(wf.updatedAt).toLocaleDateString()}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: any) {
  return (
    <div className="card" style={{ padding: '24px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em' }}>{value}</div>
    </div>
  );
}

function TabItem({ label, active, count }: any) {
  return (
    <div style={{ 
      paddingBottom: '24px', 
      marginBottom: '-25px',
      borderBottom: active ? '2px solid #000' : '2px solid transparent',
      color: active ? '#000' : 'var(--text-tertiary)',
      fontWeight: active ? 700 : 500,
      fontSize: '14px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      {label}
      {count !== undefined && (
        <span style={{ fontSize: '11px', background: active ? '#000' : 'var(--bg-app)', color: active ? '#fff' : 'var(--text-tertiary)', padding: '2px 6px', borderRadius: '6px' }}>{count}</span>
      )}
    </div>
  );
}

function WorkflowRow({ name, status, updatedAt }: any) {
  return (
    <div style={{
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-subtle)',
      cursor: 'pointer',
      transition: 'all 0.2s'
    }}
      className="hover:bg-[var(--bg-app)]"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: '#f8fafc',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <Workflow size={20} />
        </div>
        <div>
          <div style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 700, marginBottom: '2px' }}>{name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500 }}>Modified {updatedAt} • Manual Trigger</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <span className={`badge ${status === 'published' ? 'badge-success' : 'badge-warning'}`} style={{ minWidth: '80px', justifyContent: 'center' }}>
          {status === 'published' ? 'Active' : 'Draft'}
        </span>
        <button className="btn-ghost" style={{ padding: '8px', borderRadius: '8px' }}><MoreHorizontal size={18} /></button>
      </div>
    </div>
  );
}
