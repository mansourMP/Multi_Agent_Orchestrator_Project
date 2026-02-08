'use client';
import { History, Search, Clock } from 'lucide-react';

export default function HistoryPage() {
    return (
        <div style={{ padding: '40px 48px', maxWidth: '1400px', margin: '0 auto' }}>
            <header style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
                        <History size={20} />
                    </div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>System Archive</h1>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Full historical records of all agent execution sequences.</p>
            </header>

            <div style={{ position: 'relative', width: '320px', marginBottom: '32px' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-tertiary)' }} />
                <input
                    type="text"
                    placeholder="Search archives..."
                    className="input"
                    style={{ paddingLeft: '36px', height: '36px', borderRadius: '8px' }}
                />
            </div>

            <div className="card" style={{ padding: '100px 0', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', boxShadow: '0 10px 20px -12px rgba(0,0,0,0.5)' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-tertiary)' }}>
                    <Clock size={28} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Archive Empty</h3>
                <p style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>No historical records found for the current period.</p>
            </div>
        </div>
    );
}
