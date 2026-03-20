'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Users, Crown, Code, PenTool, Search, Megaphone, Sparkles } from 'lucide-react';

type SquadMember = {
    role?: string;
    model?: string;
};

type SquadNodeData = {
    label?: string;
    members?: SquadMember[];
};

const SquadNode = ({ data, selected }: { data: SquadNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const members = data.members || [{ role: 'Lead', model: 'gpt-4' }];

    // Accent color for this node type
    const accentColor = '#8b5cf6'; // Purple for squads

    const getIcon = (role: string) => {
        const r = role.toLowerCase();
        if (r.includes('lead') || r.includes('ceo') || r.includes('manager')) return Crown;
        if (r.includes('code') || r.includes('engineer') || r.includes('tech')) return Code;
        if (r.includes('design') || r.includes('creative')) return PenTool;
        if (r.includes('search') || r.includes('research')) return Search;
        if (r.includes('market') || r.includes('content')) return Megaphone;
        return Sparkles;
    };

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                boxShadow: selected
                    ? `0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20`
                    : isHovered
                        ? '0 12px 32px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)'
                        : '0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
                minWidth: '180px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : 'none',
                animation: selected ? 'breathe 3s ease-in-out infinite' : 'none',
            }}
        >
            {/* Accent strip on top */}
            <div style={{
                height: '4px',
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)`,
            }} />

            <Handle
                type="target"
                position={Position.Left}
                style={{
                    background: 'var(--bg-surface)',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />

            {/* Header */}
            <div style={{
                padding: '16px 18px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
            }}>
                {/* Icon with gradient background */}
                <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
                    border: `1px solid ${accentColor}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}>
                    <Users size={20} color={accentColor} strokeWidth={1.5} />
                    {/* AI indicator dot */}
                    <div style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--success-fg)',
                        border: '2px solid var(--bg-surface)',
                        animation: selected ? 'pulse 2s ease-in-out infinite' : 'none',
                    }} />
                </div>

                <div style={{ flex: 1 }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        lineHeight: 1.2,
                    }}>
                        {data.label || 'Squad'}
                    </div>
                    <div style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        marginTop: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}>
                        <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: accentColor,
                        }} />
                        AI Department
                    </div>
                </div>
            </div>

            {/* Members */}
            <div style={{
                padding: '0 18px 14px',
            }}>
                {members.slice(0, 3).map((m: SquadMember, i: number) => {
                    const memberRole = typeof m.role === 'string' && m.role.trim() ? m.role : 'Specialist';
                    const MemberIcon = getIcon(memberRole);
                    return (
                        <div key={i} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            margin: '4px 0',
                            background: 'var(--bg-element)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                        }}>
                            <MemberIcon size={12} color="var(--text-tertiary)" strokeWidth={1.5} />
                            <span style={{
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                fontWeight: 500,
                                flex: 1,
                            }}>
                                {memberRole}
                            </span>
                            <span style={{
                                fontSize: '9px',
                                color: 'var(--text-tertiary)',
                                fontFamily: 'var(--font-mono)',
                            }}>
                                {m.model}
                            </span>
                        </div>
                    );
                })}
                {members.length > 3 && (
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        textAlign: 'center',
                        marginTop: '4px',
                    }}>
                        +{members.length - 3} more agents
                    </div>
                )}
            </div>

            <Handle
                type="source"
                position={Position.Right}
                style={{
                    background: 'var(--bg-surface)',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />

            <style jsx>{`
                @keyframes breathe {
                    0%, 100% { box-shadow: 0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20; }
                    50% { box-shadow: 0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 80px ${accentColor}30; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
};

export default memo(SquadNode);
