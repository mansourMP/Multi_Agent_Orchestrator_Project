'use client';
import React, { useState, useEffect } from 'react';
import {
    Activity,
    DollarSign,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    Pause,
    Wifi,
    WifiOff,
    ChevronRight,
    BarChart3
} from 'lucide-react';

interface ExecutionStatusBarProps {
    isRunning: boolean;
    isWaiting: boolean;
    isConnected: boolean;
    executionId?: string | null;
    startTime?: Date | null;
    nodeCount?: number;
    completedNodes?: number;
}

export default function ExecutionStatusBar({
    isRunning,
    isWaiting,
    isConnected,
    executionId,
    startTime,
    nodeCount = 0,
    completedNodes = 0
}: ExecutionStatusBarProps) {
    const [elapsedTime, setElapsedTime] = useState(0);
    const [estimatedCost, setEstimatedCost] = useState(0);

    // Timer effect
    useEffect(() => {
        if (!isRunning || !startTime) {
            setElapsedTime(0);
            return;
        }

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
            setElapsedTime(elapsed);

            // Rough cost estimate based on time (average $0.01 per 10 seconds)
            setEstimatedCost(elapsed * 0.001);
        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning, startTime]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusDisplay = () => {
        if (isWaiting) {
            return {
                icon: Pause,
                label: 'Waiting for Approval',
                color: '#f59e0b',
                bgColor: 'rgba(245, 158, 11, 0.1)'
            };
        }
        if (isRunning) {
            return {
                icon: Loader2,
                label: 'Executing...',
                color: '#3b82f6',
                bgColor: 'rgba(59, 130, 246, 0.1)'
            };
        }
        return {
            icon: CheckCircle2,
            label: 'Ready',
            color: '#10b981',
            bgColor: 'rgba(16, 185, 129, 0.1)'
        };
    };

    const status = getStatusDisplay();
    const StatusIcon = status.icon;

    return (
        <div style={{
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: 'var(--bg-surface)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            gap: '24px'
        }}>
            {/* Left section - Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* Connection indicator */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                }}>
                    {isConnected ? (
                        <Wifi size={12} color="#10b981" />
                    ) : (
                        <WifiOff size={12} color="#ef4444" />
                    )}
                    <span style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>

                {/* Execution status */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: status.bgColor
                }}>
                    <StatusIcon
                        size={12}
                        color={status.color}
                        className={isRunning ? 'animate-spin' : ''}
                    />
                    <span style={{ color: status.color, fontWeight: 500 }}>
                        {status.label}
                    </span>
                </div>

                {/* Progress indicator */}
                {isRunning && nodeCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <BarChart3 size={12} color="var(--text-tertiary)" />
                        <span>
                            {completedNodes}/{nodeCount} nodes
                        </span>
                        <div style={{
                            width: '60px',
                            height: '4px',
                            background: 'var(--bg-element)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${(completedNodes / nodeCount) * 100}%`,
                                height: '100%',
                                background: '#3b82f6',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Center section - Execution ID */}
            {executionId && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px'
                }}>
                    <span>ID:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                        {executionId.slice(0, 8)}...
                    </span>
                </div>
            )}

            {/* Right section - Metrics */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* Duration */}
                {(isRunning || elapsedTime > 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} color="var(--text-tertiary)" />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                            {formatTime(elapsedTime)}
                        </span>
                    </div>
                )}

                {/* Estimated Cost */}
                {(isRunning || estimatedCost > 0) && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.1)'
                    }}>
                        <DollarSign size={12} color="#10b981" />
                        <span style={{
                            fontFamily: 'var(--font-mono)',
                            color: '#10b981',
                            fontWeight: 500
                        }}>
                            ${estimatedCost.toFixed(4)}
                        </span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                            est.
                        </span>
                    </div>
                )}

                {/* Keyboard shortcut hint */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--text-tertiary)',
                    fontSize: '10px'
                }}>
                    <kbd style={{
                        background: 'var(--bg-element)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '3px',
                        padding: '1px 4px',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)'
                    }}>?</kbd>
                    <span>for shortcuts</span>
                </div>
            </div>
        </div>
    );
}
