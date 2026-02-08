'use client';
import { useEffect, useState } from 'react';
import { ChevronRight, Sun, Moon } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function Topbar() {
    const pathname = usePathname();
    const paths = pathname.split('/').filter(p => p);

    // Build breadcrumb
    const breadcrumbs = ['Home'];
    if (paths.length > 0) {
        breadcrumbs.push(paths[0].charAt(0).toUpperCase() + paths[0].slice(1));
    }
    if (paths.length > 1) {
        breadcrumbs.push(paths[1]);
    }

    if (pathname.startsWith('/workflows/') && paths.length >= 2) {
        return null;
    }

    return (
        <header className="topbar" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                {breadcrumbs.map((crumb, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {index > 0 && <ChevronRight size={14} color="var(--text-tertiary)" />}
                        <span style={{
                            fontSize: '13px',
                            fontWeight: index === breadcrumbs.length - 1 ? 700 : 500,
                            color: index === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)'
                        }}>
                            {crumb}
                        </span>
                    </div>
                ))}
            </div>
        </header>
    );
}
