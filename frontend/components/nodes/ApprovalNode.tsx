'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { UserCheck, Hand } from 'lucide-react';

const ApprovalNode = ({ data, selected }: { data: any; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#f59e0b'; // Amber for approval (needs attention)

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
                background: `linear-gradient(90deg, ${accentColor}, #fbbf24)`,
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
                    background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}10 100%)`,
                    border: `1px solid ${accentColor}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}>
                    <UserCheck size={24} color={accentColor} strokeWidth={1.5} />
                    {/* Human indicator */}
                    <div style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        background: accentColor,
                        borderRadius: '50%',
                        width: 16,
                        height: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #fff',
                    }}>
                        <Hand size={8} color="#fff" />
                    </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#1e293b',
                    }}>
                        {data.label || 'Approval'}
                    </div>
                    <div style={{
                        fontSize: '10px',
                        color: accentColor,
                        marginTop: '3px',
                        fontWeight: 500,
                    }}>
                        Human Required
                    </div>
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                style={{
                    background: '#fff',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />
        </div>
    );
};

export default memo(ApprovalNode);
