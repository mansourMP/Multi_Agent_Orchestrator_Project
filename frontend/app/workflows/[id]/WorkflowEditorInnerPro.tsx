'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    NodeProps,
    EdgeProps,
    getBezierPath,
    Handle,
    Position,
    ReactFlowProvider,
    useReactFlow,
    ConnectionLineType,
    ViewportPortal,
    BaseEdge,
    EdgeLabelRenderer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    Activity, Play, Cpu, Sparkles, Brain, Zap,
    BarChart3, Image as ImageIcon,
    ChevronsLeft, ChevronsRight, Minus, Plus,
    UserPlus, Key, AlertTriangle, AlertOctagon, Terminal, Info,
    ShieldCheck, X
} from 'lucide-react';
import { getWorkflow, updateWorkflow, publishWorkflow, startSquadSession } from '@/lib/api';
import { SquadCastingModal } from '@/components/SquadCastingModal';
import { KeyboardShortcutsModal, useKeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { AgentProfile } from '@/lib/agent.types';
import { useToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import dagre from 'dagre';

const THEME_PRESETS = {
    dark: {
        bg: '#0c0e14',
        desk: '#050505', // Deepest black for the desk
        paper: '#0c0e14', // The "Page" itself
        shell: '#171616',
        panel: '#12151c',
        sidebar: '#121212',
        border: '#1f2430',
        textMain: '#f8fafc',
        textDim: '#94a3b8',
        accent: '#9D4EDD',
        gold: '#00D9FF',
        matrix: '#1F1F1F',
        neon: '#1A1918',
        violet: '#9D4EDD',
        warning: '#FFB800',
        danger: '#FF2E63',
        success: '#00F5A0',
        cardBg: 'linear-gradient(180deg, #10131a, #090b10)',
        cardBorder: '#1f2430',
        nodeShadow: (color: string, active: boolean) => active 
            ? `0 0 0 1px ${color}55, 0 0 28px ${color}55` 
            : '0 12px 25px -12px rgba(0,0,0,0.7)',
        stripeOpacity: 0.1
    },
    light: {
        bg: '#FBFBFA',
        desk: '#F3F4F6', // Light gray desk
        paper: '#FFFFFF', // Pure white paper
        shell: '#F4F3EE',
        panel: '#FFFFFF',
        sidebar: '#F4F3EE',
        border: '#E2E2D9',
        textMain: '#2D2B28',
        textDim: '#7C786A',
        accent: '#C15F3C',
        gold: '#8B4228',
        matrix: '#E8E6DD',
        neon: '#B1ADA1',
        violet: '#6B4EAD',
        warning: '#D97706',
        danger: '#DC2626',
        success: '#059669',
        cardBg: '#FFFFFF',
        cardBorder: '#E2E2D9',
        nodeShadow: (color: string, active: boolean) => active
            ? `0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 0 0 2px ${color}22`
            : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        stripeOpacity: 1
    }
};

// --- THEME CONTEXT ---
const ThemeContext = React.createContext({
    theme: THEME_PRESETS.dark,
    mode: 'dark',
    setMode: (mode: 'light' | 'dark' | 'system') => {}
});

const useTheme = () => React.useContext(ThemeContext);

const CREW_API_URL = process.env.NEXT_PUBLIC_CREW_API_URL || 'http://127.0.0.1:8001';
const CREW_API_KEY = process.env.NEXT_PUBLIC_CREW_API_KEY || '';
const TOP_BAR_HEIGHT = 48;
const OVERLAY_RIGHT_WIDTH = 320;
const OVERLAY_LEFT_WIDTH = 280;
const GRID_SIZE = 20;
const NODE_GAP_X = 280;
const NODE_GAP_Y = 200;

// --- HELPER COMPONENTS ---
const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

const getRoleColor = (role: string) => {
    const r = role.toLowerCase();
    if (r.includes('ceo') || r.includes('executive')) return '#9D4EDD';
    if (r.includes('code') || r.includes('engineer')) return '#00D9FF';
    if (r.includes('design') || r.includes('creative')) return '#00F5A0';
    if (r.includes('market') || r.includes('social')) return '#FFB800';
    return '#9D4EDD';
};

type ApprovalEntry = { id: string; type: string; message: string; timestamp: string };

const TOOL_PRESETS: Record<string, string[]> = {
    CEO: ['Mission Console', 'Deployment API'],
    Marketing: ['Research API', 'Campaign Planner'],
    Coder: ['Deploy Pipeline', 'GitOps Interface'],
    Designer: ['Render Engine', 'Image Generator'],
    default: ['Research API', 'Knowledge Base']
};

const getToolsForRole = (role: string) => TOOL_PRESETS[role] || TOOL_PRESETS.default;

const enrichNodeData = (data: any) => {
    const role = (data?.role as string) || '';
    return {
        ...data,
        color: data?.color || getRoleColor(role)
    };
};

const colorizeNode = (node: Node) => ({
    ...node,
    data: enrichNodeData(node.data || {})
});

const AgentStatusCard = ({ role, model, color, icon, active }: any) => {
    const { theme } = useTheme();
    return (
    <div style={{
        position: 'relative',
        padding: '12px',
        borderRadius: '10px',
        border: `1px solid ${theme.border}`,
        backgroundColor: '#151821',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 0.2s ease',
        boxShadow: active ? `0 0 0 1px ${color}55, 0 0 18px ${color}55` : 'none',
        animation: active ? 'agentPulse 2.5s ease-in-out infinite' : 'none'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: active ? theme.accent : '#1b2030',
                color: active ? '#0b0d12' : theme.textDim,
                display: 'flex'
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: theme.textMain }}>{role.toUpperCase()}</div>
                <div style={{ fontSize: '9px', color: theme.textDim, fontFamily: 'monospace' }}>{model.toUpperCase()}</div>
            </div>
        </div>
        <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            backgroundColor: color
        }} />
        <style>{`
            @keyframes agentPulse {
                0% { box-shadow: 0 0 0 1px ${color}44, 0 0 12px ${color}44; }
                50% { box-shadow: 0 0 0 1px ${color}88, 0 0 22px ${color}88; }
                100% { box-shadow: 0 0 0 1px ${color}44, 0 0 12px ${color}44; }
            }
        `}</style>
    </div>
    );
};

const paletteItems = [
    { label: 'CEO', type: 'agent-ceo', Icon: Brain },
    { label: 'Marketing', type: 'agent-marketing', Icon: BarChart3 },
    { label: 'Coder', type: 'agent-coder', Icon: Cpu },
    { label: 'Designer', type: 'agent-designer', Icon: ImageIcon },
    { label: 'Logic', type: 'logic', Icon: Zap }
];

const WorkflowToolSidebar = ({
    activeAgents,
    isRunning,
    onReset,
    onDragStart,
    collapsed,
    onToggleCollapse,
    onRunCrew,
    crewStatus,
    onAddAgent
}: {
    activeAgents: AgentProfile[];
    isRunning: boolean;
    onReset: () => void;
    onDragStart: (event: React.DragEvent, type: string) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onRunCrew: () => void;
    crewStatus: 'idle' | 'running' | 'waiting' | 'error';
    onAddAgent: (type?: string) => void;
}) => {
        const { theme } = useTheme();
        if (collapsed) return null;
        return (
        <div style={{
            width: '280px',
            height: '100%',
            margin: '0 12px 0 16px',
            padding: '20px',
            borderRadius: '16px',
            background: 'rgba(20, 20, 20, 0.7)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            boxShadow: 'none'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.3em', color: theme.textDim }}>TOOLBOX</div>
                <button
                    onClick={onToggleCollapse}
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        border: `1px solid ${theme.border}`,
                        background: '#0f1115',
                        color: theme.textDim,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <ChevronsLeft size={16} />
                </button>
            </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? '6px' : '10px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: theme.textDim }}>NODE LIBRARY</div>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                {paletteItems.map(item => (
                    <button
                        key={item.type}
                        draggable
                        onDragStart={(event) => onDragStart(event, item.type)}
                        onClick={() => onAddAgent(item.type)}
                        style={{
                            padding: '12px',
                            borderRadius: '10px',
                            border: `1px solid ${theme.border}`,
                            background: '#151821',
                            color: theme.textMain,
                            fontWeight: 600,
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        gap: '10px',
                            justifyContent: 'flex-start',
                            transition: 'all 0.2s ease'
                        }}
                        className="hover:border-[#2e2e2e] hover:bg-[#1f2430]"
                        title="Click to add or drag to canvas"
                    >
                        <item.Icon size={16} color={item.type.startsWith('agent') ? theme.accent : theme.textDim} />
                        {item.label}
                    </button>
                ))}
            </div>
            <div style={{ marginTop: 'auto', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: '10px', color: theme.textDim, lineHeight: 1.4 }}>
                    Click to add nodes instantly, or drag them onto the blueprint.
                </span>
            </div>
        </div>
    </div>
);
};

// 2. Bottom Bar: Resource Budget
const ResourceBudgetBar = ({ running }: { running: boolean }) => {
    const { theme } = useTheme();
    return (
    <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '560px',
        height: '64px',
        backgroundColor: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        zIndex: 50,
        pointerEvents: 'none'
    }}>
            <div style={{ flex: 1, marginRight: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '9px', color: theme.textDim, fontWeight: 700 }}>SYSTEM_UTILIZATION</div>
                    <div style={{ fontSize: '9px', color: theme.success, fontWeight: 800 }}>$42.50_AVAIL</div>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#1b2030', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ height: '100%', backgroundColor: theme.accent, width: '65%' }} />
                </div>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '8px', color: theme.textDim, fontWeight: 700 }}>BURN_RATE</div>
                <div style={{ fontSize: '14px', color: theme.textMain, fontWeight: 900 }}>$0.15<span style={{ fontSize: '10px' }}>/hr</span></div>
            </div>
        </div>
    );
};

const WorkflowTopBar = ({
    workflowName,
    crewStatus,
    onRunCrew,
    onSave,
    onPublish,
    onAutoArrange,
    onToggleLogs,
    onOpenVersions,
    isLogsOpen,
    isSaving,
    lastSavedAt,
    lastSaveError,
    onRetrySave,
    onSquadCast
}: {
    workflowName: string;
    crewStatus: 'idle' | 'running' | 'waiting' | 'error';
    onRunCrew: () => void;
    onSave: () => void;
    onPublish: () => void;
    onAutoArrange: () => void;
    onToggleLogs: () => void;
    onOpenVersions: () => void;
    isLogsOpen: boolean;
    isSaving: boolean;
    lastSavedAt: string | null;
    lastSaveError: string | null;
    onRetrySave: () => void;
    onSquadCast: () => void;
}) => {
    const { theme, mode, setMode } = useTheme();
    return (
    <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'rgba(5,5,5,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 20
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>Personal</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>/</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>{workflowName}</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>+ Add tag</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
                display: 'flex',
                gap: '6px',
                padding: '4px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.04)'
            }}>
                {['Editor', 'Executions', 'Evaluations'].map(label => (
                    <div key={label} style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        color: label === 'Editor' ? '#f8fafc' : '#9ca3af',
                        background: label === 'Editor' ? 'rgba(255,255,255,0.1)' : 'transparent'
                    }}>
                        {label}
                    </div>
                ))}
            </div>
            <div style={{ fontSize: '10px', color: lastSaveError ? '#FF2E63' : '#A0A0A0', minWidth: '90px' }}>
                {isSaving
                    ? 'SAVING…'
                    : lastSaveError
                        ? 'SAVE FAILED'
                        : (lastSavedAt ? `SAVED ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'NOT SAVED')}
            </div>
            {lastSaveError && (
                <button
                    onClick={onRetrySave}
                    style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#f8fafc',
                        fontWeight: 600,
                        fontSize: '11px',
                        cursor: 'pointer'
                    }}
                >
                    Retry
                </button>
            )}
            <button
                onClick={onPublish}
                style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent',
                    color: '#e5e7eb',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer'
                }}
            >
                Publish
            </button>
            <button
                onClick={onSave}
                style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--primary-base)',
                    color: '#020617',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                }}
            >
                Save
            </button>
            <button
                onClick={onOpenVersions}
                style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#f8fafc',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer'
                }}
            >
                Versions
            </button>
            <button
                onClick={onSquadCast}
                style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.violet} 100%)`,
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: `0 0 15px ${theme.accent}44`
                }}
            >
                <Sparkles size={14} />
                Squad Cast
            </button>
            <button
                onClick={onRunCrew}
                style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(157, 78, 221, 0.6)',
                    background: 'rgba(157, 78, 221, 0.15)',
                    color: '#f8fafc',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                }}
            >
                {crewStatus === 'running' ? 'Restart' : 'Run'}
            </button>
            <div style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '2px',
                border: `1px solid ${theme.border}`,
                marginRight: '8px'
            }}>
                {(['light', 'system', 'dark'] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: mode === m ? theme.accent : 'transparent',
                            color: mode === m ? '#fff' : theme.textDim,
                            border: 'none',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                        }}
                    >
                        {m}
                    </button>
                ))}
            </div>
            <button
                onClick={onToggleLogs}
                style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: isLogsOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: '#e5e7eb',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer'
                }}
            >
                Logs
            </button>
        </div>
    </div>
    );
};

// 3. Right Sidebar: Terminal Log
const TerminalLog = ({ logs, style }: { logs: any[]; style?: React.CSSProperties }) => {
    const { theme } = useTheme();
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <div style={{
            flex: 1,
            margin: '0 12px 12px 0',
            background: 'rgba(20, 20, 20, 0.7)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: '"Space Mono", monospace',
            zIndex: 20,
            flexShrink: 0,
            boxSizing: 'border-box',
            boxShadow: '0 8px 20px -12px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            ...style
        }}>
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: '10px', fontWeight: 700, color: theme.textDim, letterSpacing: '0.1em',
                display: 'flex', alignItems: 'center', gap: '8px'
            }}>
                <Terminal size={12} />
                MISSION_LOG
            </div>
            <div ref={scrollRef} style={{
                flex: 1, overflowY: 'auto', padding: '16px', fontSize: '11px',
                display: 'flex', flexDirection: 'column', gap: '12px'
            }}>
                {logs.length === 0 && (
                    <div style={{ color: theme.textDim, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Awaiting telemetry...
                    </div>
                )}
                {logs.map((log, i) => {
                    const msg = log.message || '';
                    let type = 'info';
                    let Icon = Info;
                    let color = theme.textDim;

                    if (msg.includes('HIRE:')) { type = 'hiring'; Icon = UserPlus; color = theme.neon; }
                    else if (msg.includes('REQUEST_RESOURCE:')) { type = 'resource'; Icon = Key; color = theme.matrix; }
                    else if (msg.includes('ACTION:')) { type = 'action'; Icon = AlertTriangle; color = theme.gold; }
                    else if (msg.includes('ESCALATE')) { type = 'escalate'; Icon = AlertOctagon; color = theme.warning; }
                    else if (msg.includes('CEO:')) { type = 'ceo'; Icon = Brain; color = theme.gold; }
                    else if (log.type === 'error') { type = 'error'; Icon = AlertOctagon; color = theme.danger; }

                    return (
                        <div key={i} style={{ 
                            display: 'flex', gap: '10px', 
                            animation: 'logFade 0.35s ease-out',
                            opacity: 0.9
                        }}>
                            <div style={{ 
                                marginTop: '2px', flexShrink: 0,
                                color: color
                            }}>
                                <Icon size={12} />
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 700, color: color, opacity: 0.8 }}>
                                        {type.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '9px', color: '#4b5563' }}>
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                                <div style={{ 
                                    lineHeight: '1.4', 
                                    color: type === 'info' ? theme.textDim : '#f3f4f6',
                                    wordBreak: 'break-word'
                                }}>
                                    {msg}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <style>{`
                    @keyframes logFade {
                        from { opacity: 0; transform: translateY(4px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        </div>
    );
};

type TrustLevel = 'full_auto' | 'cost_guard' | 'sensitive_guard' | 'review';

const ApprovalsModal = ({
    open,
    onClose,
    bindings,
    pending,
    trustLevel,
    onTrustLevelChange,
    onAction
}: {
    open: boolean;
    onClose: () => void;
    bindings: { id: string; name: string; tools: string[]; status: string }[];
    pending: ApprovalEntry[];
    trustLevel: TrustLevel;
    onTrustLevelChange: (level: TrustLevel) => void;
    onAction: (entry: ApprovalEntry, decision: 'Proceed' | 'Hold') => void;
}) => {
    const { theme } = useTheme();
    if (!open) return null;
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(18px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            <div style={{
                width: '520px',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: '#03050a',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: theme.border,
                borderRadius: '18px',
                padding: '24px',
                boxShadow: '0 30px 60px -20px rgba(0,0,0,0.9)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <div style={{ fontSize: '10px', letterSpacing: '0.4em', color: '#94a3b8' }}>APPROVALS</div>
                        <div style={{ fontSize: '18px', fontWeight: 800 }}>CEO Control Panel</div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#f8fafc',
                        cursor: 'pointer'
                    }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{
                    padding: '16px',
                    borderRadius: '14px',
                    border: `1px solid rgba(255,255,255,0.1)`,
                    background: trustLevel === 'full_auto' ? '#0f241a' : '#120f1a',
                    marginBottom: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={16} color={trustLevel === 'full_auto' ? '#10b981' : '#f59e0b'} />
                        <div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>AUTO APPROVAL</div>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                {trustLevel === 'full_auto'
                                    ? 'CEO acting autonomously'
                                    : trustLevel === 'cost_guard'
                                        ? 'Auto-approve unless cost is high'
                                        : trustLevel === 'sensitive_guard'
                                            ? 'Auto-approve unless sensitive action'
                                            : 'Human approval required'}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                        {[
                            { id: 'full_auto', label: 'Full Auto', desc: 'No approvals required.' },
                            { id: 'cost_guard', label: 'Cost Guard', desc: 'Pause on cost/resource spikes.' },
                            { id: 'sensitive_guard', label: 'Sensitive Guard', desc: 'Pause on external actions.' },
                            { id: 'review', label: 'Review Mode', desc: 'Approve every step.' }
                        ].map((level) => (
                            <button
                                key={level.id}
                                onClick={() => onTrustLevelChange(level.id as TrustLevel)}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    border: trustLevel === level.id ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.2)',
                                    background: trustLevel === level.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                                    color: '#f8fafc',
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '12px' }}>{level.label}</div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{level.desc}</div>
                                </div>
                                {trustLevel === level.id && <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>ACTIVE</span>}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', letterSpacing: '0.3em', color: '#94a3b8', marginBottom: '8px' }}>TOOL BELTS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {bindings.length === 0 && (
                            <div style={{ fontSize: '12px', color: '#8b94a6' }}>No agents configured yet.</div>
                        )}
                        {bindings.map(binding => (
                            <div key={binding.id} style={{
                                display: 'flex', flexDirection: 'column',
                                padding: '12px', borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: '#06090f'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700 }}>{binding.name}</span>
                                    <span style={{ fontSize: '10px', color: '#8b94a6' }}>{binding.status.toUpperCase()}</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                    {binding.tools.map(tool => (
                                        <span key={tool} style={{
                                            fontSize: '10px',
                                            padding: '4px 10px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#cbd5f5'
                                        }}>{tool}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.3em', color: '#94a3b8', marginBottom: '8px' }}>PENDING ESCALATIONS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {pending.length === 0 ? (
                            <div style={{ fontSize: '12px', color: '#8b94a6' }}>All clear. CEO is synced.</div>
                        ) : pending.map(entry => (
                            <div key={entry.id} style={{
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: '#06090f',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                            }}>
                                <div style={{ fontSize: '10px', color: '#a5b4fc' }}>{entry.type}</div>
                                <div style={{ fontSize: '12px', color: '#f8fafc' }}>{entry.message}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '10px', color: '#6b7280' }}>
                                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => onAction(entry, 'Proceed')} style={{
                                            padding: '6px 12px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.3)',
                                            background: '#0f172a',
                                            color: '#f8fafc',
                                            cursor: 'pointer',
                                            fontSize: '11px'
                                        }}>Approve</button>
                                        <button onClick={() => onAction(entry, 'Hold')} style={{
                                            padding: '6px 12px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.3)',
                                            background: 'transparent',
                                            color: '#f8fafc',
                                            cursor: 'pointer',
                                            fontSize: '11px'
                                        }}>Hold</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const OnboardingHelper = ({ onClose }: { onClose: () => void }) => (
    <div style={{
        padding: '16px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontSize: '12px',
        color: '#e2e8f0'
    }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.3em', color: '#94a3b8' }}>ONBOARDING</div>
        <div style={{ fontWeight: 700 }}>Transparency is live</div>
        <div style={{ color: '#b8c1d3', lineHeight: 1.4 }}>
            Select an agent to reveal its duty, prompt, and the work it has been delivering. Attach your BYOK credential via the Settings panel before running Crew.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <button
                onClick={onClose}
                style={{
                    flex: 1,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '10px',
                    color: '#cbd5f5',
                    padding: '8px 14px',
                    cursor: 'pointer'
                }}
            >
                Got it
            </button>
            <button
                onClick={() => window.open('/settings', '_blank')}
                style={{
                    flex: 1,
                    borderRadius: '10px',
                    border: 'none',
                    background: '#1c1c1c',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                }}
            >
                Open Settings
            </button>
        </div>
    </div>
);


const AgentDetailPanel = ({
    node,
    logs,
    onDutyChange,
    onPromptChange,
    onMetaChange,
    promptSearch,
    setPromptSearch
}: {
    node: Node | null;
    logs: any[];
    onDutyChange: (value: string) => void;
    onPromptChange: (value: string) => void;
    onMetaChange: (field: string, value: any) => void;
    promptSearch: string;
    setPromptSearch: (value: string) => void;
}) => {
    const { theme } = useTheme();
    if (!node) {
        return (
            <div style={{
                padding: '16px',
                borderRadius: '14px',
                border: `1px solid ${theme.border}`,
                background: '#0f1115',
                color: '#cbd5f5',
                fontSize: '12px',
                minHeight: '140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                Click an agent on the canvas to expose its duty, prompt, and executive summary.
            </div>
        );
    }

    const role = (node.data.role as string) || 'Worker';
    const model = (node.data.modelId as string) || 'gpt-4o';
    const provider = (node.data.provider as string) || 'OpenAI';
    const temperature = (node.data.temperature as number) ?? 0.2;
    const maxTokens = (node.data.maxTokens as number) ?? 1200;
    const tokenUsed = (node.data.tokenUsed as number) ?? 0;
    const duty = (node.data.duty as string) || 'Define mission duty here.';
    const prompt = (node.data.prompt as string) || 'Prompt instructions are empty.';
    const summary = (node.data.summary as string) || 'No summary captured yet.';
    const summaryUpdatedAt = (node.data.summaryUpdatedAt as string) || '';
    const tools = (node.data.tools as string[]) || [];
    const promptHistory = (node.data.promptHistory as string[]) || [];
    const filteredHistory = promptSearch
        ? promptHistory.filter(item => item.toLowerCase().includes(promptSearch.toLowerCase()))
        : promptHistory;

    return (
        <div style={{
            padding: '16px',
            borderRadius: '14px',
            border: `1px solid ${theme.border}`,
            background: '#0f1115',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.2em' }}>AGENT PROFILE</div>
                    <div style={{ fontSize: '18px', fontWeight: 800 }}>{role}</div>
                    <div style={{ fontSize: '10px', color: '#a5b4fc' }}>{model} • {provider}</div>
                </div>
                <div style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    background: '#020617',
                    border: `1px solid rgba(255,255,255,0.08)`,
                    fontSize: '10px',
                    color: '#22c55e'
                }}>
                    {node.data.status?.toUpperCase() || 'IDLE'}
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px'
            }}>
                <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>PROVIDER</div>
                    <input
                        value={provider}
                        onChange={(event) => onMetaChange('provider', event.target.value)}
                        style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#0b0d14',
                            color: '#f8fafc',
                            fontFamily: '"Space Mono", monospace',
                            padding: '8px'
                        }}
                    />
                </div>
                <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>MODEL</div>
                    <select
                        value={model}
                        onChange={(event) => onMetaChange('modelId', event.target.value)}
                        style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#0b0d14',
                            color: '#f8fafc',
                            fontFamily: '"Space Mono", monospace',
                            padding: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="gpt-4o">GPT-4o (Omni)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                        <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        <option value="deepseek-r1">DeepSeek R1</option>
                        <option value="llama-3.3-70b">Llama 3.3 70B</option>
                    </select>
                </div>
                <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>TEMPERATURE</div>
                    <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(event) => onMetaChange('temperature', Number(event.target.value))}
                        style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#0b0d14',
                            color: '#f8fafc',
                            fontFamily: '"Space Mono", monospace',
                            padding: '8px'
                        }}
                    />
                </div>
                <div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>MAX TOKENS</div>
                    <input
                        type="number"
                        min={128}
                        step={64}
                        value={maxTokens}
                        onChange={(event) => onMetaChange('maxTokens', Number(event.target.value))}
                        style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#0b0d14',
                            color: '#f8fafc',
                            fontFamily: '"Space Mono", monospace',
                            padding: '8px'
                        }}
                    />
                </div>
            </div>

            <div style={{
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#0b0d14'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                    <span>TOKEN USAGE (EST.)</span>
                    <span>{tokenUsed} / {maxTokens}</span>
                </div>
                <div style={{ marginTop: '6px', height: '6px', background: '#1c222e', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${Math.min(100, (tokenUsed / maxTokens) * 100)}%`,
                        background: tokenUsed > maxTokens ? theme.warning : theme.accent
                    }} />
                </div>
            </div>

            <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>CURRENT DUTY</div>
                <textarea
                    value={duty}
                    onChange={(event) => onDutyChange(event.target.value)}
                    placeholder="State what you expect this agent to own (include do/don't)."
                    style={{
                        width: '100%',
                        minHeight: '68px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: '#0b0d14',
                        color: '#f8fafc',
                        fontFamily: '"Space Mono", monospace',
                        padding: '10px',
                        resize: 'vertical'
                    }}
                />
            </div>

            <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>PROMPT INSIGHTS</div>
                <textarea
                    value={prompt}
                    onChange={(event) => onPromptChange(event.target.value)}
                    placeholder="Paste the system prompt, instructions, or summary for this agent."
                    style={{
                        width: '100%',
                        minHeight: '90px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: '#0b0d14',
                        color: '#f8fafc',
                        fontFamily: '"Space Mono", monospace',
                        padding: '10px',
                        resize: 'vertical'
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button
                        type="button"
                        onClick={() => {
                            if (!prompt.trim()) return;
                            const next = [prompt, ...promptHistory].slice(0, 20);
                            onMetaChange('promptHistory', next);
                        }}
                        style={{
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.04)',
                            color: '#f8fafc',
                            borderRadius: '10px',
                            padding: '8px 12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Save to Library
                    </button>
                </div>
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>EXECUTIVE SUMMARY</div>
                    {summaryUpdatedAt && (
                        <div style={{ fontSize: '9px', color: '#6b7280' }}>
                            Updated {new Date(summaryUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </div>
                <textarea
                    value={summary}
                    onChange={(event) => onMetaChange('summary', event.target.value)}
                    placeholder="Short summary of what this agent has done so far."
                    style={{
                        width: '100%',
                        minHeight: '70px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: '#0b0d14',
                        color: '#f8fafc',
                        fontFamily: '"Space Mono", monospace',
                        padding: '10px',
                        resize: 'vertical'
                    }}
                />
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>PROMPT LIBRARY</div>
                    <span style={{ fontSize: '9px', color: '#a5b4fc' }}>Searchable history</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input
                        value={promptSearch}
                        onChange={(event) => setPromptSearch(event.target.value)}
                        placeholder="e.g., Draft compliance pitch"
                        style={{
                            flex: 1,
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: '#0b0d14',
                            color: '#f8fafc',
                            fontFamily: '"Space Mono", monospace',
                            padding: '10px'
                        }}
                    />
                </div>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {filteredHistory.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#8b94a6' }}>No saved prompts yet.</div>
                    ) : filteredHistory.map((item, index) => (
                        <button
                            key={`${item}-${index}`}
                            type="button"
                            onClick={() => onPromptChange(item)}
                            style={{
                                textAlign: 'left',
                                fontSize: '11px',
                                color: '#e2e8f0',
                                background: '#01040a',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                cursor: 'pointer'
                            }}
                        >
                            {item.length > 120 ? `${item.slice(0, 120)}…` : item}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>LIVE THOUGHT STREAM</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {logs.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#8b94a6' }}>No recent activity yet.</div>
                    ) : logs.map((log, index) => (
                        <div key={`${log.timestamp}-${index}`} style={{
                            fontSize: '11px',
                            color: '#e2e8f0',
                            background: '#01040a',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.03)'
                        }}>
                            <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>
                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </div>
                            <div>{log.message}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>TOOLS</div>
                {tools.length === 0 ? (
                    <div style={{ fontSize: '11px', color: '#8b94a6' }}>
                        No tools attached. Use the CEO panel to attach tools.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {tools.map((tool) => (
                            <span key={tool} style={{
                                fontSize: '10px',
                                padding: '4px 8px',
                                borderRadius: '999px',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: '#e5e7eb',
                                background: 'rgba(255,255,255,0.04)'
                            }}>
                                {tool}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- CUSTOM NODES ---

const DepartmentNode = ({ data }: NodeProps) => {
    const { theme } = useTheme();
    const label = (data.label as string) || 'Department';
    const isPublished = !!data.isPublished;
    const onAddWorker = data.onAddWorker as () => void;
    const stats = (data.stats as { count: number, cost: number }) || { count: 0, cost: 0 };

    return (
        <div style={{
            padding: '10px 16px',
            borderRadius: '12px',
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            color: theme.textMain,
            minWidth: '180px',
            boxShadow: '0 4px 12px -2px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em' }}>
                    {label.toUpperCase()}
                </div>
                {!isPublished && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onAddWorker) onAddWorker();
                        }}
                        style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            background: theme.bg,
                            color: theme.textMain,
                            border: `1px solid ${theme.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Plus size={12} />
                    </button>
                )}
            </div>
            
            {/* Stats Row */}
            <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: theme.textDim }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontWeight: 700, color: theme.textMain }}>{stats.count || 3}</span>
                    <span>agents</span>
                </div>
                <div style={{ width: '1px', height: '100%', background: theme.border }} />
                <div>${(stats.cost || 0.45).toFixed(2)}/hr</div>
            </div>

            <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
        </div>
    );
};

const DashboardNode = ({ data, selected }: NodeProps) => {
    const { theme } = useTheme();
    const role = (data.role as string) || 'Agent';
    const isRunning = !!data.isRunning;
    const status = (data.status as string) || 'idle'; 
    const currentTask = (data.task as string) || 'Awaiting command...';
    const cost = (data.cost as number) || 0.15;

    let activeColor = getRoleColor(role);
    if (status === 'escalating') activeColor = theme.warning;
    if (status === 'alert') activeColor = theme.danger;
    
    // Icon Selection
    let RoleIcon = Brain;
    if (role.toLowerCase().includes('code')) RoleIcon = Cpu;
    if (role.toLowerCase().includes('design')) RoleIcon = ImageIcon;
    if (role.toLowerCase().includes('market')) RoleIcon = BarChart3;

    return (
        <div style={{
            width: '280px',
            background: theme.cardBg,
            borderRadius: '12px',
            border: selected ? `2px solid ${activeColor}` : `1px solid ${theme.border}`,
            boxShadow: isRunning ? `0 0 30px ${activeColor}33` : '0 10px 30px -10px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            fontFamily: '"Space Mono", monospace'
        }}>
            {/* HEADER: Identity */}
            <div style={{
                padding: '12px',
                background: theme.bg.includes('#0c') ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: isRunning ? `${activeColor}22` : theme.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isRunning ? activeColor : theme.textDim
                    }}>
                        <RoleIcon size={18} className={isRunning ? 'animate-pulse' : ''} />
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textMain }}>{role}</div>
                        <div style={{ fontSize: '9px', color: theme.textDim }}>{(data.label as string) || 'Worker'}</div>
                    </div>
                </div>
                {/* Status Dot */}
                <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: isRunning ? theme.success : theme.textDim,
                    boxShadow: isRunning ? `0 0 10px ${theme.success}` : 'none'
                }} />
            </div>

            {/* BODY: The "Thought Bubble" / Live Terminal */}
            <div style={{
                height: '100px',
                background: theme.bg.includes('#0c') ? '#000' : '#f8f9fa',
                padding: '12px',
                fontSize: '10px',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <AnimatePresence mode="wait">
                    {isRunning ? (
                        <motion.div
                            key="working"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ color: theme.success, lineHeight: '1.5' }}
                        >
                            <span style={{ marginRight: '6px' }}>&gt;</span>
                            {currentTask}
                            <motion.span
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                                style={{ marginLeft: '2px' }}
                            >_</motion.span>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ 
                                color: theme.textDim, 
                                fontStyle: 'italic', 
                                height: '100%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                            }}
                        >
                            System Standby...
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Burn Rate Overlay */}
                <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '12px',
                    fontSize: '9px',
                    color: theme.textDim,
                    background: theme.bg.includes('#0c') ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                }}>
                    ${cost}/hr
                </div>
            </div>

            <Handle type="target" position={Position.Top} style={{ background: theme.textDim, width: 8, height: 8 }} />
            <Handle type="source" position={Position.Bottom} style={{ background: theme.textDim, width: 8, height: 8 }} />
        </div>
    );
};

const CenterHubNode = ({ data }: NodeProps) => {
    const { theme } = useTheme();
    return (
        <div style={{
            width: '220px',
            height: '220px',
            borderRadius: '12px',
            backgroundColor: theme.panel,
            border: `2px solid ${theme.accent}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)'
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: theme.textDim, letterSpacing: '0.3em', marginBottom: '8px', fontWeight: 800 }}>ORCHESTRATOR</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: theme.textMain, maxWidth: '160px', lineHeight: 1.1 }}>{data.label as string}</div>
                <div style={{ 
                    marginTop: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0b0d12',
                    backgroundColor: theme.accent,
                    padding: '6px 12px',
                    borderRadius: '4px'
                }}>
                    STABLE
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        </div>
    );
};

const NeonEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) => {
    const { theme } = useTheme();
    const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    const isRunning = !!data?.isRunning;
    const packetType = (data?.packetType as string) || "DATA";
    const payloadPreview = (data?.payloadPreview as string) || "Waiting for stream...";
    const [isHovered, setIsHovered] = useState(false);

    return (
        <>
            <BaseEdge path={edgePath} style={{ stroke: theme.border, strokeWidth: isRunning ? 2 : 1, opacity: 0.6 }} />
            
            {isRunning && (
                <circle r="4" fill={theme.accent}>
                    <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
                </circle>
            )}

            <EdgeLabelRenderer>
                <div
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${sourceX + (targetX - sourceX) / 2}px, ${sourceY + (targetY - sourceY) / 2}px)`,
                        pointerEvents: 'auto',
                        zIndex: 10
                    }}
                    className="nodrag nopan"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <div style={{
                        background: theme.bg,
                        border: `1px solid ${theme.border}`,
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        color: theme.textDim,
                        fontWeight: 700,
                        cursor: 'help',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        {packetType}
                    </div>
                    
                    {isHovered && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginTop: '8px',
                            background: theme.panel,
                            border: `1px solid ${theme.accent}`,
                            padding: '12px',
                            borderRadius: '8px',
                            width: '200px',
                            color: theme.textMain,
                            zIndex: 50,
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: theme.accent, marginBottom: '4px', letterSpacing: '0.1em' }}>LIVE PAYLOAD</div>
                            <div style={{ fontFamily: '"Space Mono", monospace', fontSize: '10px', lineHeight: 1.4, wordBreak: 'break-all' }}>
                                {payloadPreview}
                            </div>
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

const nodeTypes = {
    department: DepartmentNode,
    dashboard: DashboardNode,
    hub: CenterHubNode,
    default: DashboardNode
};
const edgeTypes = {
    neon: NeonEdge,
    default: NeonEdge
};

// --- MAIN PAGE COMPONENT ---

const NodeHUD = ({ node, isRunning }: { node: Node | null, isRunning: boolean }) => {
    const { theme } = useTheme();
    if (!node) return null;

    return (
        <div style={{
            position: 'absolute',
            top: node.position.y - 100,
            left: node.position.x + 300,
            width: '240px',
            backgroundColor: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '12px',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 10px 20px -12px rgba(0,0,0,0.45)',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                <Activity size={12} color={theme.accent} />
                <span style={{ fontSize: '10px', fontWeight: 800, color: theme.textMain, letterSpacing: '0.05em' }}>LIVE_TELEMETRY</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', color: theme.textDim }}>AGENT_ID</span>
                    <span style={{ fontSize: '9px', color: theme.textMain, fontFamily: 'monospace' }}>{node.id.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', color: theme.textDim }}>MODEL</span>
                    <span style={{ fontSize: '9px', color: theme.textMain, fontWeight: 700, fontFamily: 'monospace' }}>{node.data.modelId as string}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '9px', color: theme.textDim }}>MEM_SYNC</span>
                    <span style={{ fontSize: '9px', color: theme.success, fontFamily: 'monospace' }}>ACTIVE</span>
                </div>
            </div>

            <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '8px', color: theme.textDim, marginBottom: '4px', fontWeight: 700 }}>CURRENT_TASK</div>
                <div style={{ 
                    fontSize: '9px', 
                    color: theme.textMain, 
                    lineHeight: '1.4',
                    fontStyle: 'italic',
                    backgroundColor: '#12151c',
                    padding: '6px',
                    borderRadius: '4px',
                    border: `1px solid ${theme.border}`
                }}>
                    {isRunning ? "Synthesizing market data for high-conversion strategy..." : "Awaiting command sequence..."}
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

function WorkflowEditorInnerPro({ workflowId }: { workflowId?: string }) {
    console.log('[PRO_EDITOR] Rendering component...', { workflowId });

    // --- THEME STATE ---
    const [mode, setMode] = useState<'light' | 'dark' | 'system'>('system');
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const media = window.matchMedia('(prefers-color-scheme: dark)');
            setSystemTheme(media.matches ? 'dark' : 'light');
            const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
            media.addEventListener('change', handler);
            return () => media.removeEventListener('change', handler);
        }
    }, []);

    const theme = useMemo(() => {
        const effective = mode === 'system' ? systemTheme : mode;
        return THEME_PRESETS[effective] || THEME_PRESETS.dark;
    }, [mode, systemTheme]);
    
    // Standard React Flow State
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [workflow, setWorkflow] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [paperHeight, setPaperHeight] = useState('100%');

    // Calculate Paper Height based on content
    useEffect(() => {
        if (nodes.length === 0) return;
        // Use a default height estimate if measured is not ready
        const maxY = Math.max(...nodes.map(n => n.position.y + 300)); 
        const newHeight = Math.max(1200, maxY + 200);
        setPaperHeight(`${newHeight}px`);
    }, [nodes]);

    // UI State
    const [isCastingOpen, setIsCastingOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [activeSquad, setActiveSquad] = useState<AgentProfile[]>([]);
    const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [crewRunId, setCrewRunId] = useState<string | null>(null);
    const [crewStatus, setCrewStatus] = useState<'idle' | 'running' | 'waiting' | 'error'>('idle');
    const [trustLevel, setTrustLevel] = useState<TrustLevel>('review');
    const [isApprovalsOpen, setIsApprovalsOpen] = useState(false);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [showOnboardingHelper, setShowOnboardingHelper] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [lastSaveError, setLastSaveError] = useState<string | null>(null);
    const [versionHistory, setVersionHistory] = useState<any[]>([]);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSnapshotRef = useRef<string>('');
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddQuery, setQuickAddQuery] = useState('');
    const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
    const { addToast } = useToast();
    const [promptSearch, setPromptSearch] = useState('');
    const [bottomLogsOpen, setBottomLogsOpen] = useState(false);
    const [bottomTab, setBottomTab] = useState<'logs' | 'worklog'>('logs');
    const [workLogContent, setWorkLogContent] = useState<string>('');
    const [workLogError, setWorkLogError] = useState<string | null>(null);
    const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
    const selectedAgentNode = useMemo(() => {
        if (!selectedAgentId) return null;
        return nodes.find(n => n.id === selectedAgentId);
    }, [nodes, selectedAgentId]);

    const isCanvasEmpty = useMemo(() => {
        const nonHubNodes = nodes.filter((n) => n.type !== 'hub');
        return nonHubNodes.length === 0 && edges.length === 0;
    }, [nodes, edges]);

    const updateSelectedAgentField = useCallback((field: string, value: any) => {
        if (!selectedAgentId) return;
        setNodes(prev => prev.map(node => node.id === selectedAgentId ? {
            ...node,
            data: {
                ...node.data,
                [field]: value,
                ...(field === 'summary' ? { summaryUpdatedAt: new Date().toISOString() } : {})
            }
        } : node));
    }, [selectedAgentId, setNodes]);

    const getNextNodePosition = useCallback(() => {
        const index = nodes.length;
        const cols = 4;
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
            x: 120 + col * NODE_GAP_X,
            y: TOP_BAR_HEIGHT + 120 + row * NODE_GAP_Y
        };
    }, [nodes.length]);

    const selectedAgentLogs = useMemo(() => {
        if (!selectedAgentNode) return [];
        const rawRole = selectedAgentNode.data.role;
        const role = typeof rawRole === 'string' ? rawRole.toLowerCase() : '';
        if (!role) return [];
        return logs
            .filter(log => log.message?.toLowerCase().includes(role))
            .slice(-4)
            .reverse();
    }, [logs, selectedAgentNode]);

    const agentToolBindings = useMemo(() => {
        return nodes
            .filter(node => node.type === 'dashboard' && node.data.role)
            .map(node => ({
                id: node.id,
                name: node.data.role || node.data.label || 'Agent',
                tools: node.data.tools || ['Core Toolkit'],
                status: node.data.status || 'ready'
            }));
    }, [nodes]);

    const pendingApprovals = useMemo(() => {
        return logs
            .map((log, index) => {
                const msg = (log.message || '').toString();
                if (msg.includes('ESCALATE') || msg.includes('REQUEST_RESOURCE') || msg.includes('ACTION')) {
                    const type = msg.includes('REQUEST_RESOURCE') ? 'Resource' : msg.includes('ACTION') ? 'Action' : 'Escalation';
                    return {
                        id: `pending-${index}`,
                        type,
                        message: msg,
                        timestamp: log.timestamp || new Date().toISOString()
                    };
                }
                return null;
            })
            .filter(Boolean) as ApprovalEntry[];
    }, [logs]);

    const shouldAutoApprove = useCallback((entry: ApprovalEntry | null) => {
        if (trustLevel === 'full_auto') return true;
        if (!entry) return false;
        if (trustLevel === 'review') return false;
        const msg = `${entry.type} ${entry.message}`.toLowerCase();
        if (trustLevel === 'sensitive_guard') {
            return !(msg.includes('request_resource') || msg.includes('action') || msg.includes('webhook') || msg.includes('tool'));
        }
        if (trustLevel === 'cost_guard') {
            return !(msg.includes('cost') || msg.includes('token') || msg.includes('request_resource') || msg.includes('action'));
        }
        return false;
    }, [trustLevel]);

    const crewStreamRef = useRef<EventSource | null>(null);
    const [rfInstance, setRfInstance] = useState<any>(null);

    useEffect(() => {
        console.log('[PRO_EDITOR] Initial Mount complete.');
    }, []);

    useEffect(() => {
        if (!workflowId) return;
        console.log(`[PRO_EDITOR] Loading workflow data for: ${workflowId}`);
        getWorkflow(workflowId).then(wf => {
            console.log('[PRO_EDITOR] Workflow fetched successfully:', wf.name);
            setWorkflow(wf);

            if (wf.definition?.nodes?.length > 0) {
                console.log(`[PRO_EDITOR] Initializing with ${wf.definition.nodes.length} saved nodes.`);
                const isLegacy = !wf.definition.nodes.some((n: any) => n.type === 'dashboard');
                if (isLegacy) {
                    setNodes(wf.definition.nodes.map((n: any) => colorizeNode({ ...n, type: 'dashboard' })));
                    setEdges(wf.definition.edges || []);
                } else {
                    setNodes(wf.definition.nodes.map((n: any) => colorizeNode(n)));
                    setEdges(wf.definition.edges || []);
                }
                setVersionHistory(wf.definition?.meta?.versions || []);
                lastSnapshotRef.current = JSON.stringify({ nodes: wf.definition.nodes || [], edges: wf.definition.edges || [] });
            } else {
                console.log('[PRO_EDITOR] Empty workflow - placing CEO.');
                setNodes([
                    {
                        id: 'ceo',
                        type: 'dashboard',
                        position: { x: 400, y: 100 },
                        data: {
                            label: 'Chief Executive',
                            role: 'CEO',
                            modelId: 'gpt-4o',
                            task: 'Awaiting directives...',
                            description: 'Mission Commander',
                            tools: ['Strategy', 'Planning'],
                            cost: 0.50
                        }
                    }
                ]);
            }
        }).catch(err => {
            console.error('[PRO_EDITOR] Load failure:', err);
            setLogs(prev => [...prev, { 
                timestamp: new Date().toISOString(), 
                message: `CRITICAL: Workflow load failed - ${err.message}`, 
                type: 'error' 
            }]);
        });
    }, [workflowId]);

    const persistWorkflow = useCallback(async (silent: boolean = false) => {
        if (!workflowId) return;
        setIsSaving(true);
        try {
            const snapshotKey = JSON.stringify({ nodes, edges });
            let nextVersions = versionHistory;
            if (snapshotKey !== lastSnapshotRef.current) {
                const snapshot = { ts: new Date().toISOString(), nodes, edges };
                nextVersions = [...versionHistory, snapshot].slice(-10);
                lastSnapshotRef.current = snapshotKey;
                setVersionHistory(nextVersions);
            }
            await updateWorkflow(workflowId, { nodes, edges, meta: { versions: nextVersions } });
            const now = new Date().toISOString();
            setLastSavedAt(now);
            setLastSaveError(null);
            if (!silent) {
                addToast({ type: 'success', title: 'Saved', message: 'Workflow changes saved.' });
            }
        } catch (err: any) {
            setLastSaveError(err?.message || 'Unable to save workflow.');
            if (!silent) {
                addToast({ type: 'error', title: 'Save Failed', message: err?.message || 'Unable to save workflow.' });
            }
        } finally {
            setIsSaving(false);
        }
    }, [workflowId, nodes, edges, addToast]);

    useEffect(() => {
        if (!workflowId) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            persistWorkflow(true);
        }, 1200);
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [workflowId, nodes, edges, persistWorkflow]);

    useEffect(() => {
        if (!bottomLogsOpen) return;
        if (workLogContent || workLogError) return;
        fetch('/api/work-log-summary')
            .then((res) => {
                if (!res.ok) throw new Error('Unable to load work log.');
                return res.text();
            })
            .then((text) => setWorkLogContent(text))
            .catch((err) => setWorkLogError(err?.message || 'Unable to load work log.'));
    }, [bottomLogsOpen, workLogContent, workLogError]);

    // Ensure we fit the view whenever nodes are loaded or updated
    useEffect(() => {
        if (rfInstance && nodes.length > 0) {
            console.log('[PRO_EDITOR] Viewport adjustment triggered.');
            const timer = setTimeout(() => {
                rfInstance.fitView({ padding: 0.2, duration: 400 });
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [rfInstance, nodes.length]);

    const deploySquadLayout = (squad: AgentProfile[]) => {
        const center = { x: 400, y: 350 };
        const radius = 320;

        // 1. Central Hub
        const nodesList: Node[] = [
            {
                id: 'hub', type: 'hub', position: center,
                data: { label: workflow?.name || 'SQUAD MISSION', target: 'ACTIVE' }
            }
        ];

        // 2. Map Squad to Radial Positions
        const positions = [
            { x: center.x, y: center.y - radius }, // Top
            { x: center.x + radius, y: center.y }, // Right
            { x: center.x, y: center.y + radius }, // Bottom
            { x: center.x - radius, y: center.y }  // Left
        ];

        squad.forEach((agent, index) => {
            const pos = positions[index % positions.length];
                const taskMap: Record<string, string> = {
                    CEO: 'Coordinating mission directives...',
                    Marketing: 'Synthesizing go-to-market copy...',
                    Coder: 'Generating orchestration logic...',
                    Designer: 'Composing visual intelligence...'
                };
                nodesList.push({
                id: agent.role.toLowerCase(),
                type: 'dashboard',
                position: pos,
            data: {
                    label: agent.modelId.toUpperCase(),
                    subLabel: agent.role,
                    role: agent.role,
                    modelId: agent.modelId,
                    isRunning: true,
                    task: taskMap[agent.role] || 'Processing workflows...',
                    description: `Optimizing ${agent.role} stream.`,
                    tools: getToolsForRole(agent.role),
                    color: getRoleColor(agent.role)
                }
                });
        });

        // 3. Create Star Edges
        const edgesList: Edge[] = nodesList
            .filter(n => n.id !== 'hub')
            .map(n => {
                let edgeColor = theme.accent;
                if (n.data.role === 'CEO') edgeColor = theme.gold;
                if (n.data.role === 'Marketing') edgeColor = theme.violet;
                if (n.data.role === 'Designer') edgeColor = theme.neon;

                return {
                    id: `e-hub-${n.id}`,
                    source: 'hub',
                    target: n.id,
                    type: 'neon',
                    data: { color: edgeColor, isRunning: true }
                };
            });

        setNodes(nodesList.map(colorizeNode));
        setEdges(edgesList);
    };

    const handleCastConfirm = async (squadConfig: AgentProfile[]) => {
        setIsCastingOpen(false);
        setActiveSquad(squadConfig);
        setIsRunning(true);
        setCrewStatus('running');

        deploySquadLayout(squadConfig);

        try {
            setLogs(prev => [...prev, { 
                timestamp: new Date().toISOString(), 
                message: 'Engaging squad via mission protocol...', 
                type: 'info' 
            }]);

            const stream = await startSquadSession({
                userGoal: "Execute squad configuration",
                agents: squadConfig
            });

            if (!stream) throw new Error("No stream returned");

            const reader = stream.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const msg = typeof data === 'string' ? data : (data.message || JSON.stringify(data));
                            setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: msg, type: 'info' }]);
                        } catch (e) { }
                    }
                }
            }
            setCrewStatus('idle');
        } catch (e: any) { 
            console.error(e);
            setCrewStatus('error');
            setLogs(prev => [...prev, { 
                timestamp: new Date().toISOString(), 
                message: `Squad engagement failed: ${e.message}`, 
                type: 'error' 
            }]);
        }
    };

    const resetCanvas = () => {
        setNodes([]);
        setEdges([]);
        setLogs([]);
        setActiveSquad([]);
    };

    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed((prev) => !prev);
    }, []);

    // --- KEYBOARD SHORTCUTS & CLIPBOARD ---
    const shortcuts = useKeyboardShortcuts();
    const [clipboard, setClipboard] = useState<Node[] | null>(null);
    const [decisionRequest, setDecisionRequest] = useState<{ runId: string } | null>(null);

    const submitDecision = useCallback(async (runId: string, decision: string) => {
        await fetch(`${CREW_API_URL}/submit-decision`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(CREW_API_KEY ? { 'X-API-Key': CREW_API_KEY } : {})
            },
            body: JSON.stringify({ run_id: runId, decision })
        });
    }, []);

    const handleDecision = async (decision: string) => {
        if (!decisionRequest) return;
        try {
            await submitDecision(decisionRequest.runId, decision);
            setDecisionRequest(null);
            setCrewStatus('running');
            addToast({ type: 'success', title: 'Decision Sent', message: `Executive order: ${decision}` });
        } catch (e) {
            addToast({ type: 'error', title: 'Error', message: 'Failed to submit decision' });
        }
    };

    const handlePublish = useCallback(async () => {
        if (!workflowId) return;
        await persistWorkflow(true);
        try {
            await publishWorkflow(workflowId);
            addToast({ type: 'success', title: 'Published', message: 'Workflow published successfully.' });
        } catch (err: any) {
            addToast({ type: 'error', title: 'Publish Failed', message: err?.message || 'Unable to publish workflow.' });
        }
    }, [workflowId, persistWorkflow, addToast]);

    const autoApproveDecision = useCallback(async (runId: string) => {
        try {
            await submitDecision(runId, 'Proceed');
            setCrewStatus('running');
            addToast({ type: 'success', title: 'Auto Approved', message: 'Trust policy approved the pause.' });
        } catch (e) {
            setCrewStatus('error');
            addToast({ type: 'error', title: 'Auto-approval Failed', message: 'Unable to submit trust decision.' });
        }
    }, [submitDecision, addToast]);

    const handleApprovalAction = useCallback((entry: ApprovalEntry, decision: 'Proceed' | 'Hold') => {
        addToast({
            type: 'info',
            title: decision === 'Proceed' ? 'Escalation Approved' : 'Marked for Review',
            message: `${entry.type} • ${entry.message}`
        });
    }, [addToast]);

    // Handle Copy/Paste & Delete
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!rfInstance) return;

            // Delete
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = nodes.filter(n => n.selected);
                if (selected.length > 0) {
                    setNodes(nds => nds.filter(n => !n.selected));
                    setEdges(eds => eds.filter(e => !selected.some(n => n.id === e.source || n.id === e.target)));
                    addToast({ type: 'info', title: 'Deleted', message: `${selected.length} nodes removed` });
                }
            }

            // Copy (Cmd+C)
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                const selected = nodes.filter(n => n.selected);
                if (selected.length > 0) {
                    setClipboard(selected);
                    addToast({ type: 'success', title: 'Copied', message: `${selected.length} nodes to clipboard` });
                }
            }

            // Paste (Cmd+V)
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                if (clipboard && clipboard.length > 0) {
                    const newNodes = clipboard.map(n => {
                        const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                        return {
                            ...n,
                            id,
                            position: { x: n.position.x + 50, y: n.position.y + 50 },
                            selected: true
                        };
                    });
                    setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(newNodes));
                    addToast({ type: 'success', title: 'Pasted', message: `${newNodes.length} nodes added` });
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, clipboard, rfInstance, setNodes, setEdges, addToast]);


    const addAgentNode = useCallback((type?: string, positionOverride?: { x: number; y: number }) => {
        if (!rfInstance || !reactFlowWrapper.current) return;
        const position = positionOverride || getNextNodePosition();

        // Determine node data based on type
        let nodeData: any = {
            isRunning: false,
            task: 'Idle • ready to receive input',
            description: 'Drag connections between nodes to define the path.',
            provider: 'OpenAI',
            temperature: 0.2,
            maxTokens: 1200,
            tokenUsed: 0,
            duty: 'Define mission duty here and keep logs transparent.',
            prompt: 'You operate inside Orion. Stay factual, never touch secrets directly.',
            summary: 'No summary captured yet.',
            promptHistory: []
        };

        let nodeType = type || 'agent-coder'; // Default
        if (nodeType === 'tool') {
            addToast({ type: 'info', title: 'Tools Attach to Agents', message: 'Tools are managed inside agent detail panels.' });
            return;
        }
        
        if (nodeType.startsWith('agent-')) {
            const role = nodeType.split('-')[1];
            const roleName = role.charAt(0).toUpperCase() + role.slice(1);
            nodeData = {
                ...nodeData,
                label: 'GPT-4O',
                subLabel: roleName,
                role: roleName === 'Designer' ? 'Designer' : roleName === 'Coder' ? 'Coder' : roleName === 'Marketing' ? 'Marketing' : 'CEO',
                modelId: 'gpt-4o',
                description: `Specialized ${roleName} agent.`,
                duty: `${roleName} duty: stay focused; no unauthorized deployments.`,
                prompt: `System prompt for ${roleName}: execute with clarity and mention the duty before each response.`,
                tools: getToolsForRole(roleName)
            };
        } else {
            nodeData = {
                ...nodeData,
                label: 'Logic Gate',
                subLabel: nodeType.toUpperCase(),
                modelId: 'system-v1',
                description: `Utility ${nodeType} for workflow extension.`,
                duty: `Tool node: orchestrates ${nodeType} interactions.`,
                prompt: `Invoke ${nodeType} with parameterized inputs from the CEO.`,
                tools: ['System Toolset']
            };
        }

        nodeData.color = nodeData.color || getRoleColor(nodeData.role || '');

        setNodes((nds) => nds.concat(colorizeNode({
            id: `node-${Date.now()}`,
            type: 'dashboard',
            position,
            data: nodeData
        })));
    }, [rfInstance, setNodes, addToast, getNextNodePosition]);

    const addWorkerToDepartment = useCallback((key: string) => {
        let type = 'agent-coder';
        if (key === 'marketing') type = 'agent-marketing';
        if (key === 'design') type = 'agent-designer';
        if (key === 'engineering') type = 'agent-coder';
        addAgentNode(type);
    }, [addAgentNode]);

    const autoArrangeNodes = useCallback(() => {
        // 1. Identify Logic & Hierarchy
        const roleOf = (node: Node) => (node.data?.role || '').toString().toLowerCase();
        const isCEO = (node: Node) => roleOf(node).includes('ceo');
        const deptKey = (node: Node) => {
            const role = roleOf(node);
            if (role.includes('market')) return 'marketing';
            if (role.includes('code') || role.includes('engineer') || role.includes('developer')) return 'engineering';
            if (role.includes('design') || role.includes('creative')) return 'design';
            if (role.includes('sales')) return 'sales';
            if (role.includes('finance')) return 'finance';
            return 'general';
        };

        const hub = nodes.find((n) => n.type === 'hub');
        const ceo = nodes.find((n) => n.type === 'dashboard' && isCEO(n));
        const agents = nodes.filter((n) => n.type === 'dashboard' && n.id !== ceo?.id);
        const otherNodes = nodes.filter((n) => n.type !== 'dashboard' && n.type !== 'hub' && n.type !== 'department');

        const groups = new Map<string, Node[]>();
        agents.forEach((n) => {
            const key = deptKey(n);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(n);
        });

        const deptOrder = ['marketing', 'engineering', 'design', 'sales', 'finance', 'general'];
        const activeDepts = deptOrder.filter((k) => groups.has(k));
        if (activeDepts.length === 0 && agents.length > 0) activeDepts.push('general');

        // 2. Build Graph for Dagre
        const g = new dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
        g.setDefaultEdgeLabel(() => ({}));

        const finalNodes: Node[] = [];
        const finalEdges: Edge[] = [];

        // Add CEO
        if (ceo) {
            g.setNode(ceo.id, { width: 280, height: 160 });
            finalNodes.push(ceo);
        } else if (hub) {
            g.setNode(hub.id, { width: 220, height: 220 });
            finalNodes.push(hub);
        }

        // Add Departments & Edges
        activeDepts.forEach((key) => {
            const deptId = `dept-${key}`;
            const label = key;
            
            // Add Dept Node
            g.setNode(deptId, { width: 180, height: 80 });
            finalNodes.push({
                id: deptId,
                type: 'department',
                position: { x: 0, y: 0 }, // placeholder
                data: { 
                    label: key, 
                    isPublished: workflow?.status === 'published',
                    onAddWorker: () => addWorkerToDepartment(key),
                    stats: { count: groups.get(key)?.length || 0, cost: 0.45 }
                }
            });

            // Edge: CEO -> Dept
            const rootId = ceo ? ceo.id : hub?.id;
            if (rootId) {
                g.setEdge(rootId, deptId);
                finalEdges.push({
                    id: `e-${rootId}-${deptId}`,
                    source: rootId,
                    target: deptId,
                    type: 'smoothstep',
                    data: { color: theme.accent },
                    style: { stroke: theme.accent, strokeWidth: 1, opacity: 0.5 }
                });
            }

            // Add Agents
            const deptAgents = groups.get(key) || [];
            deptAgents.forEach((agent) => {
                g.setNode(agent.id, { width: 280, height: 160 });
                finalNodes.push(agent);

                // Edge: Dept -> Agent
                g.setEdge(deptId, agent.id);
                finalEdges.push({
                    id: `e-${deptId}-${agent.id}`,
                    source: deptId,
                    target: agent.id,
                    type: 'smoothstep',
                    data: { color: theme.border },
                    style: { stroke: theme.border, strokeWidth: 1, opacity: 0.4 }
                });
            });
        });

        // Add Layout for others (unconnected)
        otherNodes.forEach((node) => {
            g.setNode(node.id, { width: 200, height: 100 });
            finalNodes.push(node);
        });

        // 3. Compute Layout
        dagre.layout(g);

        // 4. Apply Positions
        const positionedNodes = finalNodes.map((node) => {
            const nodeWithPos = g.node(node.id);
            return {
                ...node,
                position: {
                    x: nodeWithPos.x - nodeWithPos.width / 2,
                    y: nodeWithPos.y - nodeWithPos.height / 2,
                },
            };
        });

        setNodes(positionedNodes);
        setEdges(finalEdges);

        setTimeout(() => {
            rfInstance?.fitView({ padding: 0.1, duration: 600 });
        }, 50);

    }, [nodes, rfInstance, theme, workflow?.status, addWorkerToDepartment, setNodes, setEdges]);

    // Live Grid Enforcer: Trigger layout when structure changes
    useEffect(() => {
        const timer = setTimeout(() => {
            autoArrangeNodes();
        }, 50);
        return () => clearTimeout(timer);
    }, [nodes.length]); // REMOVED autoArrangeNodes to stop the infinite loop

    // Keep Document Fitted on Resize
    useEffect(() => {
        const handleResize = () => {
            rfInstance?.fitView({ padding: 0.1, duration: 200 });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [rfInstance]);

    const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.type === 'dashboard') {
            setSelectedAgentId(node.id);
            setRightCollapsed(false);
        }
    }, []);

    const handlePaneClick = useCallback(() => {
        setSelectedAgentId(null);
        setQuickAddOpen(false);
    }, []);

    const startCrewRun = useCallback(async () => {
        try {
            // Find all agent nodes currently on the canvas
            const canvasAgents = nodes
                .filter(n => n.type === 'dashboard' && n.data.role)
                .map(n => ({
                    role: n.data.role,
                    modelId: n.data.modelId,
                    provider: 'openai' // default
                }));

            if (canvasAgents.length === 0) {
                alert('No agents on the canvas. Drag some agents from the library first!');
                return;
            }

            // AUTO-EXPAND: Open the right panel when run starts
            setRightCollapsed(false);
            
            setCrewStatus('running');
            setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), message: `Mission started with ${canvasAgents.length} agents.`, type: 'info' }]);
            
            // --- PYTHON ENGINE API (Port 8001) ---
            const res = await fetch(`${CREW_API_URL}/start-mission`, {
                method: 'POST',
                headers: CREW_API_KEY ? { 'X-API-Key': CREW_API_KEY } : {}
            });
            if (!res.ok) throw new Error('Failed to start mission on Python engine');
            
            const { run_id } = await res.json();
            setCrewRunId(run_id);

            if (crewStreamRef.current) crewStreamRef.current.close();
            const streamUrl = `${CREW_API_URL}/stream-logs/${run_id}` + (CREW_API_KEY ? `?api_key=${encodeURIComponent(CREW_API_KEY)}` : '');
            const eventSource = new EventSource(streamUrl);
            crewStreamRef.current = eventSource;

            eventSource.addEventListener('log', (event: MessageEvent) => {
                let msg = event.data;
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed && typeof parsed.message === 'string') {
                        msg = parsed.message;
                    } else {
                        msg = event.data;
                    }
                } catch (e) {
                    msg = event.data;
                }
                // --- NODE STATE UPDATES ---
                setNodes(prevNodes => prevNodes.map(node => {
                    const role = node.data.role?.toString().toLowerCase();
                    if (role && msg.toLowerCase().startsWith(role)) {
                        let status = 'working';
                        if (msg.includes('ESCALATE')) status = 'escalating';
                        if (msg.includes('HIRE') || msg.includes('REQUEST')) status = 'alert';
                        const tokenUsed = (node.data.tokenUsed as number) ?? 0;
                        
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                task: msg.substring(0, 60) + '...',
                                status: status,
                                tokenUsed: tokenUsed + estimateTokens(msg)
                            }
                        };
                    }
                    return node;
                }));

                // --- CEO COMMAND INTERCEPTION ---
                if (msg.includes('HIRE:')) {
                    const role = msg.split('HIRE:')[1].trim();
                    addToast({ type: 'info', title: 'Hiring Request', message: `CEO wants to hire: ${role}` });
                }
                if (msg.includes('REQUEST_RESOURCE:')) {
                    const resource = msg.split('REQUEST_RESOURCE:')[1].trim();
                    addToast({ type: 'warning', title: 'Resource Needed', message: `CEO needs: ${resource}` });
                }
                if (msg.includes('ACTION:')) {
                    const action = msg.split('ACTION:')[1].trim();
                    addToast({ type: 'error', title: 'CRITICAL ACTION', message: `CEO Trigger: ${action}` });
                }

                setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: msg, type: 'info' }]);
            });

            eventSource.addEventListener('pause', () => {
                setCrewStatus('waiting');
                const latestApproval = pendingApprovals.length > 0 ? pendingApprovals[pendingApprovals.length - 1] : null;
                if (shouldAutoApprove(latestApproval)) {
                    autoApproveDecision(run_id);
                    return;
                }
                setDecisionRequest({ runId: run_id });
                addToast({ type: 'warning', title: 'Input Required', message: 'Crew is waiting for executive decision.' });
            });

            eventSource.onerror = () => {
                setCrewStatus('error');
                eventSource.close();
            };
            
        } catch (e: any) {
            setCrewStatus('error');
            setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), message: e?.message || 'Crew run failed.', type: 'error' }]);
        }
    }, [nodes, addToast, rfInstance, setNodes, pendingApprovals, shouldAutoApprove, autoApproveDecision]);

    useEffect(() => {
        return () => {
            if (crewStreamRef.current) crewStreamRef.current.close();
        };
    }, []);

    // Drag & Drop palette helpers
    const onDragStart = useCallback((event: React.DragEvent, type: string) => {
        event.dataTransfer.setData('application/reactflow', type);
        event.dataTransfer.effectAllowed = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        if (!rfInstance || !reactFlowWrapper.current) return;
        const type = event.dataTransfer.getData('application/reactflow');
        if (!type) return;
        if (type === 'tool') {
            addToast({ type: 'info', title: 'Tools Attach to Agents', message: 'Open an agent panel to attach tools.' });
            return;
        }

        const position = rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY
        });

        const id = `node-${Date.now()}`;
        
        // Define role and data based on drop type
        let nodeData: any = {
            isRunning: false,
            task: 'Awaiting command...',
            description: 'Autonomous worker node.',
            provider: 'OpenAI',
            temperature: 0.2,
            maxTokens: 1200,
            tokenUsed: 0,
            duty: 'Define your duty and avoid unauthorized actions.',
            prompt: 'Start each message by referencing the duty and clearly log escalations.',
            summary: 'No summary captured yet.',
            promptHistory: []
        };

        if (type.startsWith('agent-')) {
            const role = type.split('-')[1];
            const roleName = role.charAt(0).toUpperCase() + role.slice(1);
            nodeData = {
                ...nodeData,
                label: 'GPT-4O',
                subLabel: roleName,
                role: roleName === 'Designer' ? 'Designer' : roleName === 'Coder' ? 'Coder' : roleName === 'Marketing' ? 'Marketing' : 'CEO',
                modelId: 'gpt-4o',
                description: `Specialized ${roleName} agent.`,
                duty: `${roleName} duties are distilled from the CEO briefing.`,
                prompt: `Prompt for ${roleName}: stay brief, mention duty, avoid secrets.`,
                tools: getToolsForRole(roleName)
            };
        } else {
            nodeData = {
                ...nodeData,
                label: 'Logic Gate',
                subLabel: type.toUpperCase(),
                modelId: 'system-v1',
                description: `Utility ${type} for workflow extension.`,
                duty: `Gateway node: routes data between workers.`,
                prompt: `Let the CEO authorize all ${type} interactions.`,
                tools: ['System Toolset']
            };
        }

        setNodes((nds) => nds.concat({
            id,
            type: 'dashboard',
            position,
            data: nodeData
        }));
    }, [rfInstance, setNodes, addToast]);

    const onConnect = useCallback((connection: Connection) => {
        setEdges((eds) => addEdge({
            ...connection,
            type: 'neon',
            data: { color: '#00D9FF', isRunning: false },
            style: { stroke: '#00D9FF', strokeWidth: 2 }
        }, eds));
    }, [setEdges]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, mode, setMode }}>
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100%',
            backgroundColor: theme.shell,
            overflow: 'hidden',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: theme.textMain
        }}>
            <SquadCastingModal
                isOpen={isCastingOpen}
                onClose={() => setIsCastingOpen(false)}
                onConfirm={handleCastConfirm}
            />
            
            <KeyboardShortcutsModal
                isOpen={shortcuts.isOpen}
                onClose={shortcuts.close}
            />

            {/* Main Workspace */}
            <div style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute',
                    top: `${TOP_BAR_HEIGHT + 12}px`,
                    left: '18px',
                    zIndex: 12
                }}>
                    <WorkflowToolSidebar
                        activeAgents={activeSquad}
                        isRunning={isRunning}
                        onReset={resetCanvas}
                        onDragStart={onDragStart}
                        collapsed={sidebarCollapsed}
                        onToggleCollapse={toggleSidebar}
                        onRunCrew={startCrewRun}
                        crewStatus={crewStatus}
                        onAddAgent={addAgentNode}
                    />
                </div>
                {sidebarCollapsed && (
                    <button
                        onClick={() => {
                            setSidebarCollapsed(false);
                            setQuickAddOpen(false);
                        }}
                        style={{
                            position: 'absolute',
                            top: `${TOP_BAR_HEIGHT + 12}px`,
                            left: '18px',
                            width: '36px',
                            height: '36px',
                            borderRadius: '12px',
                            border: `1px solid ${theme.border}`,
                            background: theme.panel,
                            color: theme.textMain,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 12,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                        title="Open node library"
                    >
                        <Plus size={16} />
                    </button>
                )}
                <div style={{
                    position: 'absolute',
                    top: `${TOP_BAR_HEIGHT + 56}px`,
                    left: '18px',
                    zIndex: 13
                }}>
                    <button
                        onClick={() => setQuickAddOpen((prev) => !prev)}
                        style={{
                            height: '32px',
                            padding: '0 12px',
                            borderRadius: '999px',
                            border: `1px solid ${theme.border}`,
                            background: theme.panel,
                            color: theme.textMain,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Plus size={12} />
                        Quick Add
                    </button>
                    {quickAddOpen && (
                        <div style={{
                            marginTop: '8px',
                            width: '220px',
                            background: theme.panel,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '12px',
                            padding: '10px',
                            boxShadow: '0 12px 40px rgba(0,0,0,0.08)'
                        }}>
                            <input
                                value={quickAddQuery}
                                onChange={(e) => setQuickAddQuery(e.target.value)}
                                placeholder="Search nodes..."
                                style={{
                                    width: '100%',
                                    borderRadius: '10px',
                                    border: `1px solid ${theme.border}`,
                                    background: '#FBFBFA',
                                    color: theme.textMain,
                                    padding: '8px 10px',
                                    fontSize: '11px',
                                    marginBottom: '8px'
                                }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                                {paletteItems
                                    .filter((item) => item.label.toLowerCase().includes(quickAddQuery.toLowerCase()))
                                    .map((item) => (
                                        <button
                                            key={item.type}
                                            onClick={() => {
                                                const flowPos = (rfInstance && lastPointer)
                                                    ? rfInstance.screenToFlowPosition({ x: lastPointer.x, y: lastPointer.y })
                                                    : undefined;
                                                addAgentNode(item.type, flowPos);
                                                setQuickAddOpen(false);
                                                setQuickAddQuery('');
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 10px',
                                                borderRadius: '10px',
                                                border: `1px solid ${theme.border}`,
                                                background: '#FFFFFF',
                                                color: theme.textMain,
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                textAlign: 'left'
                                            }}
                                        >
                                            <item.Icon size={14} color={theme.accent} />
                                            {item.label}
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{
                    flex: 1,
                    position: 'relative',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    margin: 0,
                    height: '100%',
                    backgroundColor: theme.desk,
                    paddingTop: `${TOP_BAR_HEIGHT}px`
                }}>
                    <WorkflowTopBar
                        workflowName={workflow?.name || 'Untitled Workflow'}
                        crewStatus={crewStatus}
                        onRunCrew={startCrewRun}
                        onSave={() => persistWorkflow(false)}
                        onPublish={handlePublish}
                        onAutoArrange={autoArrangeNodes}
                        onOpenVersions={() => setShowVersionModal(true)}
                        onToggleLogs={() => setBottomLogsOpen((prev) => !prev)}
                        isLogsOpen={bottomLogsOpen}
                        isSaving={isSaving}
                        lastSavedAt={lastSavedAt}
                        lastSaveError={lastSaveError}
                        onRetrySave={() => persistWorkflow(false)}
                        onSquadCast={() => setIsCastingOpen(true)}
                    />
                    <ReactFlowProvider>
                        <div
                            ref={reactFlowWrapper}
                            style={{
                                width: '1000px',
                                minHeight: '100%',
                                height: paperHeight,
                                margin: '40px auto',
                                backgroundColor: theme.paper,
                                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                borderRadius: '4px',
                                position: 'relative',
                                zIndex: 2,
                                boxSizing: 'border-box'
                            }}
                            onMouseMove={(event) => {
                                setLastPointer({ x: event.clientX, y: event.clientY });
                            }}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                        >
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodesDraggable={false}
                                nodesConnectable={false}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onNodeMouseEnter={(_, node) => setHoveredNode(node)}
                                onNodeMouseLeave={() => setHoveredNode(null)}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                minZoom={0.1}
                                maxZoom={1.5}
                                proOptions={{ hideAttribution: true }}
                                style={{ width: '100%', height: '100%', zIndex: 2, background: 'transparent' }}
                                snapToGrid
                                snapGrid={[GRID_SIZE, GRID_SIZE]}
                                connectionLineType={ConnectionLineType.SmoothStep}
                                connectionLineStyle={{ stroke: theme.textDim, strokeWidth: 1.5 }}
                                defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: theme.border, strokeWidth: 1.5 } }}
                                onInit={setRfInstance}
                                onDrop={onDrop}
                                onDragOver={onDragOver}
                                panOnDrag={false}
                                zoomOnScroll={false}
                                panOnScroll={false}
                                zoomOnPinch={false}
                                zoomOnDoubleClick={false}
                                preventScrolling={false}
                                onNodeClick={handleNodeClick}
                                onPaneClick={handlePaneClick}
                            >
                            </ReactFlow>
                        </div>

                            <NodeHUD node={hoveredNode} isRunning={isRunning} />
                    </ReactFlowProvider>

                    {!bottomLogsOpen && <ResourceBudgetBar running={isRunning} />}

                    {bottomLogsOpen ? (
                        <div style={{
                            position: 'absolute',
                            left: '12px',
                            right: '12px',
                            bottom: '12px',
                            height: '260px',
                            background: 'rgba(8, 8, 8, 0.96)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 40
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderBottom: '1px solid rgba(255,255,255,0.06)'
                            }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {['logs', 'worklog'].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setBottomTab(tab as 'logs' | 'worklog')}
                                            style={{
                                                padding: '6px 10px',
                                                borderRadius: '999px',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                background: bottomTab === tab ? 'rgba(255,255,255,0.12)' : 'transparent',
                                                color: '#e5e7eb',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {tab === 'logs' ? 'Logs' : 'Work Log'}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setBottomLogsOpen(false)}
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: '#f8fafc',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    aria-label="Collapse logs"
                                >
                                    <Minus size={14} />
                                </button>
                            </div>
                            <div style={{ flex: 1, minHeight: 0, padding: '12px' }}>
                                {bottomTab === 'logs' ? (
                                    <TerminalLog logs={logs} style={{
                                        margin: 0,
                                        height: '100%',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(10,10,10,0.9)',
                                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)'
                                    }} />
                                ) : (
                                    <div style={{
                                        height: '100%',
                                        overflowY: 'auto',
                                        padding: '12px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(10,10,10,0.9)',
                                        color: '#e5e7eb',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {workLogError && `ERROR: ${workLogError}`}
                                        {!workLogError && (workLogContent || 'Loading work log...')}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setBottomLogsOpen(true)}
                            style={{
                                position: 'absolute',
                                left: '18px',
                                bottom: '18px',
                                height: '32px',
                                padding: '0 14px',
                                borderRadius: '999px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(8,8,8,0.8)',
                                color: '#e5e7eb',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                zIndex: 30
                            }}
                        >
                            Logs
                        </button>
                    )}

                    {!rightCollapsed && (
                        <div style={{
                            position: 'absolute',
                            top: `${TOP_BAR_HEIGHT + 32}px`,
                            right: '18px',
                            width: '320px',
                            maxHeight: 'calc(100% - 100px)',
                            padding: '16px',
                            borderRadius: '14px',
                            background: 'rgba(5, 5, 5, 0.85)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            zIndex: 15
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: '#94a3b8' }}>AGENT / LOG</div>
                                <button
                                    onClick={() => setRightCollapsed(true)}
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '8px',
                                        border: `1px solid rgba(255,255,255,0.2)`,
                                        background: 'transparent',
                                        color: '#f8fafc',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Minus size={14} />
                                </button>
                            </div>
                            {showOnboardingHelper && (
                                <OnboardingHelper onClose={() => setShowOnboardingHelper(false)} />
                            )}
                            <AgentDetailPanel
                                node={selectedAgentNode}
                                logs={selectedAgentLogs}
                                onDutyChange={(value) => updateSelectedAgentField('duty', value)}
                                onPromptChange={(value) => updateSelectedAgentField('prompt', value)}
                                onMetaChange={(field, value) => updateSelectedAgentField(field, value)}
                                promptSearch={promptSearch}
                                setPromptSearch={setPromptSearch}
                            />
                            <TerminalLog logs={logs} style={{
                                margin: 0,
                                height: '180px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(10,10,10,0.9)',
                                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)'
                            }} />
                        </div>
                    )}
                    {rightCollapsed && (
                        <button
                            onClick={() => setRightCollapsed(false)}
                            style={{
                                position: 'absolute',
                                top: `${TOP_BAR_HEIGHT + 8}px`,
                                right: '18px',
                                width: '36px',
                                height: '36px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'rgba(5,5,5,0.7)',
                                color: '#f8fafc',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 15
                            }}
                        >
                            <Plus size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* --- EXECUTIVE DECISION MODAL --- */}
            {decisionRequest && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <div style={{
                        width: '440px', background: '#0a0c12', 
                        border: `2px solid ${theme.gold}`,
                        borderRadius: '20px', padding: '32px', 
                        boxShadow: `0 0 60px ${theme.gold}33`,
                        display: 'flex', flexDirection: 'column', gap: '20px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ padding: '10px', background: `${theme.gold}15`, borderRadius: '12px', color: theme.gold }}>
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <div style={{ color: theme.gold, fontSize: '11px', letterSpacing: '0.25em', fontWeight: 900 }}>
                                    EXECUTIVE ACTION REQUIRED
                                </div>
                                <div style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>
                                    Mission Authorization
                                </div>
                            </div>
                        </div>

                        <div style={{ 
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '12px', padding: '16px', color: theme.textDim, fontSize: '13px', lineHeight: 1.5
                        }}>
                            The Conductor Crew has hit a critical decision point. Your authorization is required to proceed with the current operation.
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                onClick={() => handleDecision('Proceed')}
                                style={{ 
                                    flex: 1, padding: '14px', 
                                    background: `linear-gradient(135deg, ${theme.gold} 0%, #b48a00 100%)`, 
                                    color: '#000', fontWeight: 800, borderRadius: '12px', border: 'none',
                                    cursor: 'pointer', fontSize: '14px', letterSpacing: '0.05em'
                                }}
                            >
                                AUTHORIZE
                            </button>
                            <button
                                onClick={() => handleDecision('Reject')}
                                style={{ 
                                    flex: 1, padding: '14px', 
                                    background: 'transparent', border: '1px solid #2c3342', 
                                    color: theme.textDim, borderRadius: '12px',
                                    cursor: 'pointer', fontSize: '14px'
                                }}
                            >
                                ABORT
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isApprovalsOpen && (
                <ApprovalsModal
                    open={isApprovalsOpen}
                    onClose={() => setIsApprovalsOpen(false)}
                    bindings={agentToolBindings}
                    pending={pendingApprovals}
                    trustLevel={trustLevel}
                    onTrustLevelChange={setTrustLevel}
                    onAction={handleApprovalAction}
                />
            )}

            {showVersionModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(12, 14, 20, 0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 120
                    }}
                    onClick={() => setShowVersionModal(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '640px',
                            maxHeight: '80vh',
                            overflow: 'hidden',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 16,
                            boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Version History</h2>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Restore a previous snapshot</div>
                            </div>
                            <button className="btn" onClick={() => setShowVersionModal(false)}>Close</button>
                        </div>
                        <div style={{ overflowY: 'auto', paddingRight: 6 }}>
                            {versionHistory.length === 0 ? (
                                <div style={{ color: 'var(--text-tertiary)' }}>No saved snapshots yet.</div>
                            ) : (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {[...versionHistory].reverse().map((snapshot, index) => (
                                        <div
                                            key={`${snapshot.ts}-${index}`}
                                            style={{
                                                borderRadius: 12,
                                                border: '1px solid var(--border-default)',
                                                padding: 12,
                                                background: 'var(--bg-app)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{new Date(snapshot.ts).toLocaleString()}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                    {snapshot.nodes?.length || 0} nodes • {snapshot.edges?.length || 0} edges
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => {
                                                    setNodes(snapshot.nodes || []);
                                                    setEdges(snapshot.edges || []);
                                                    setShowVersionModal(false);
                                                    addToast({ type: 'info', title: 'Version Restored', message: 'Canvas updated to selected snapshot.' });
                                                }}
                                            >
                                                Restore
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        </ThemeContext.Provider>
    );
}

export default WorkflowEditorInnerPro;
