'use client';

import React from 'react';
import { Users, Shield, Activity, Lock, UserCircle } from 'lucide-react';

export default function AdminPage() {
    return (
        <div style={{ padding: '40px 48px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
                            <Users size={20} />
                        </div>
                        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Admin Panel</h1>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Global system administration and security controls.</p>
                </div>
            </div>

            <div className="card" style={{ padding: '100px 0', textAlign: 'center', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{
                    width: '64px', height: '64px', borderRadius: '20px', background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#ef4444'
                }}>
                    <Lock size={32} />
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#000', marginBottom: '12px' }}>Access Restricted</h2>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 32px', fontWeight: 500, lineHeight: 1.6 }}>
                    Your current session is authorized for <strong>Standard Workspace</strong> operations.
                    To access administrative modules (Identity, Billing, Infrastructure), please escalate your permissions.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button className="btn btn-secondary" style={{ padding: '10px 24px', borderRadius: '8px' }}>
                        Request Access
                    </button>
                    <button className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: '8px' }}>
                        <UserCircle size={16} />
                        Switch to Root
                    </button>
                </div>
            </div>
        </div>
    );
}