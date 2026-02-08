'use client';

import React, { useState, useEffect } from 'react';
import {
    Terminal, Activity, Cpu, Zap, Eye, Globe, Share2, Database, Brain, Shield, Clock, ShieldCheck
} from 'lucide-react';
import io from 'socket.io-client';

interface AgentStatus {
    id: string;
    name: string;
    role: string;
    archetype: string;
    status: 'IDLE' | 'THINKING' | 'EXECUTING' | 'BLOCKED' | 'ERROR';
    lastLog: string;
    cost: number;
    uptime: string;
    coreMotivation: string;
    color: string;
    icon: any;
}

const MOCK_AGENTS: AgentStatus[] = [
    {
        id: 'agt_strategist',
        name: 'STRATEGIST',
        role: 'Planning Lead',
        archetype: 'Strategic Reasoning',
        status: 'THINKING',
        lastLog: 'Calculating optimal execution path for content deployment...',
        cost: 15.20,
        uptime: '48h 12m',
        coreMotivation: 'Efficiency',
        color: '#d97706',
        icon: Brain
    },
    {
        id: 'agt_executor',
        name: 'EXECUTOR',
        role: 'Operations',
        archetype: 'Execution Expert',
        status: 'EXECUTING',
        lastLog: 'Deploying isolated containers via E2B cluster...',
        cost: 45.20,
        uptime: '12h 00m',
        coreMotivation: 'Speed',
        color: '#3b82f6',
        icon: Cpu
    },
    {
        id: 'agt_visionary',
        name: 'VISIONARY',
        role: 'Creative Dir.',
        archetype: 'Fluid Intelligence',
        status: 'IDLE',
        lastLog: 'Waiting for brand style guide assets.',
        cost: 8.50,
        uptime: '24h 30m',
        coreMotivation: 'Novelty',
        color: '#db2777',
        icon: Eye
    },
    {
        id: 'agt_critic',
        name: 'CRITIC',
        role: 'Compliance',
        archetype: 'Critical Analysis',
        status: 'IDLE',
        lastLog: 'Security protocol initialized. 0 vulnerabilities found.',
        cost: 2.10,
        uptime: '168h 00m',
        coreMotivation: 'Safety',
        color: '#10b981',
        icon: Shield
    },
];

export default function AeskCommandCenter() {
    const [agents, setAgents] = useState<AgentStatus[]>(MOCK_AGENTS);
    const [logs, setLogs] = useState<string[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const socket = io('http://localhost:4000/executions', { withCredentials: true });
        socket.on('log', (data: any) => {
            const logMsg = data.log.replace(/\[.*?\] /, '');
            setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${logMsg}`, ...prev].slice(0, 100));
        });
        return () => { socket.disconnect(); };
    }, []);

    return (
        <div className="h-screen w-screen bg-[#f1f5f9] text-[#0f172a] font-sans flex overflow-hidden relative">
            {/* GRID BACKGROUND */}
            <div className="absolute inset-0 opacity-20" style={{ 
                backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', 
                backgroundSize: '32px 32px' 
            }}></div>

            {/* HEADER */}
            <div className="absolute top-0 left-0 right-0 h-16 z-50 flex justify-between items-center px-8 border-b border-[#e2e8f0] bg-white/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-black rounded-lg text-white">
                        <Globe size={18} />
                    </div>
                    <span className="font-extrabold tracking-tight text-lg">CONDUCTOR <span className="text-[#64748b] font-medium">COMMAND_CENTER</span></span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 px-3 py-1 bg-[#f0fdf4] border border-[#dcfce7] rounded-full text-[#10b981] text-xs font-bold">
                        <ShieldCheck size={14} />
                        SYSTEM_OPERATIONAL
                    </div>
                    <div className="text-sm font-bold font-mono text-[#64748b]">{currentTime.toLocaleTimeString()}</div>
                </div>
            </div>

            {/* MAIN HUB */}
            <div className="flex-1 relative flex items-center justify-center">
                {/* CONNECTIONS */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <circle cx="50%" cy="50%" r="300" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="8 8" />
                    <line x1="50%" y1="50%" x2="20%" y2="25%" stroke="#cbd5e1" strokeWidth="1" />
                    <line x1="50%" y1="50%" x2="80%" y2="25%" stroke="#cbd5e1" strokeWidth="1" />
                    <line x1="50%" y1="50%" x2="20%" y2="75%" stroke="#cbd5e1" strokeWidth="1" />
                    <line x1="50%" y1="50%" x2="80%" y2="75%" stroke="#cbd5e1" strokeWidth="1" />
                </svg>

                {/* CENTRAL HUB */}
                <div className="relative z-20 flex flex-col items-center justify-center w-72 h-72 rounded-full bg-white border-4 border-black shadow-2xl">
                    <div className="absolute inset-[-12px] rounded-full border border-black/5 animate-[spin_20s_linear_infinite]"></div>
                    <div className="absolute inset-[-4px] rounded-full border-2 border-black border-t-transparent animate-[spin_3s_linear_infinite]"></div>
                    <h2 className="text-[10px] text-[#64748b] font-black tracking-[0.3em] mb-2 uppercase">Core Intelligence</h2>
                    <div className="text-4xl font-black text-black tracking-tighter">AGI_OS</div>
                    <div className="mt-6 flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="w-1.5 h-1.5 bg-black rounded-full opacity-20"></div>
                        ))}
                    </div>
                </div>

                {/* NODES */}
                {agents.map((agent, idx) => {
                    const positions = [
                        { top: '15%', left: '10%' },
                        { top: '15%', right: '10%' },
                        { bottom: '15%', left: '10%' },
                        { bottom: '15%', right: '10%' }
                    ];
                    const pos = positions[idx];
                    const Icon = agent.icon;

                    return (
                        <div key={agent.id} className="absolute w-80 bg-white border border-[#e2e8f0] rounded-2xl p-5 shadow-lg z-10 transition-all hover:translate-y-[-4px] hover:shadow-2xl" style={pos}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-black">
                                        <Icon size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-black tracking-tight">{agent.name}</div>
                                        <div className="text-[10px] text-[#64748b] font-bold uppercase letter-spacing-1">{agent.role}</div>
                                    </div>
                                </div>
                                <div className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                    agent.status === 'THINKING' ? 'bg-[#eff6ff] text-[#3b82f6]' :
                                    agent.status === 'EXECUTING' ? 'bg-[#f0fdf4] text-[#10b981]' : 'bg-[#f1f5f9] text-[#64748b]'
                                }`}>
                                    {agent.status}
                                </div>
                            </div>
                            <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-3 font-mono text-[11px] text-[#475569] min-height-[80px] leading-relaxed italic">
                                "{agent.lastLog}"
                            </div>
                            <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex justify-between items-center">
                                <div className="text-[10px] font-bold text-[#94a3b8]">UPTIME: {agent.uptime}</div>
                                <div className="text-[10px] font-bold text-black bg-[#f1f5f9] px-2 py-1 rounded">COST: ${agent.cost.toFixed(2)}</div>
                            </div>
                        </div>
                    );
                })}

                {/* BUDGET BAR */}
                <div className="absolute bottom-10 bg-black text-white rounded-2xl px-8 py-4 flex items-center gap-8 shadow-2xl z-30">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/10 rounded-lg"><Zap size={18} className="text-[#10b981]" /></div>
                        <div>
                            <div className="text-xl font-black tracking-tighter">$42.50</div>
                            <div className="text-[9px] font-black text-white/40 tracking-widest">CREDITS_REMAINING</div>
                        </div>
                    </div>
                    <div className="w-40 h-2.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#10b981] w-[65%]"></div>
                    </div>
                    <div className="text-[10px] font-black font-mono text-[#10b981]">0.15_USD/HR</div>
                </div>
            </div>

            {/* LOG SIDEBAR */}
            <div className="w-96 bg-white border-l border-[#e2e8f0] flex flex-col z-30 shadow-2xl">
                <div className="h-16 flex items-center px-6 border-b border-[#f1f5f9] bg-[#f8fafc] gap-3">
                    <Terminal size={16} className="text-black" />
                    <span className="font-black tracking-widest text-[11px] text-black uppercase">Mission_Logs</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-3 font-mono text-[11px]">
                    {logs.map((log, i) => (
                        <div key={i} className="text-[#64748b] border-l-2 border-[#f1f5f9] pl-3 py-1 hover:bg-[#f8fafc] rounded-r-lg transition-colors">
                            <span className="text-black font-bold mr-2">{log.substring(1, 9)}</span>
                            {log.substring(10)}
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="text-[#cbd5e1] italic">Waiting for signal transmission...</div>
                    )}
                </div>
            </div>
        </div>
    );
}