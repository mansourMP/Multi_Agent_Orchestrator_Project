'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, ArrowRight } from 'lucide-react';

const LogicNode = ({ data, selected }: { data: any; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#C15F3C'; // Terracotta logic accent

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: '#fff',
                borderRadius: '16px',
                boxShadow: selected
                    ? `0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20`
                    : isHovered
                        ? '0 12px 32px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)'
                        : '0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
                minWidth: '150px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : 'none',
            }}
        >
            <div style={{
                height: '4px',
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)`,
            }} />

            <Handle
                type="target"
                position={Position.Left}
                style={{
                    background: '#fff',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />

            <div style={{
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
            }}>
                <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '14px',
                    background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
                    border: `1px solid ${accentColor}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <GitBranch size={24} color={accentColor} strokeWidth={1.5} />
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#F4F3EE',
                    }}>
                        {data.label || 'Condition'}
                    </div>
                    <div style={{
                    fontSize: '10px',
                    color: '#C1BDB6',
                        marginTop: '3px',
                    }}>
                        Branch Logic
                    </div>
                </div>

                {/* Branch indicators */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '4px',
                }}>
                    <div style={{
                        padding: '3px 8px',
                        background: '#dcfce7',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: '#16a34a',
                    }}>
                        TRUE
                    </div>
                    <div style={{
                        padding: '3px 8px',
                        background: '#fee2e2',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: '#dc2626',
                    }}>
                        FALSE
                    </div>
                </div>
            </div>

            {/* Two output handles */}
            <Handle
                type="source"
                position={Position.Right}
                id="true"
                style={{
                    background: '#16a34a',
                    width: 10,
                    height: 10,
                    border: '2px solid #fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    top: '40%',
                }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="false"
                style={{
                    background: '#dc2626',
                    width: 10,
                    height: 10,
                    border: '2px solid #fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    top: '60%',
                }}
            />
        </div>
    );
};

export default memo(LogicNode);
