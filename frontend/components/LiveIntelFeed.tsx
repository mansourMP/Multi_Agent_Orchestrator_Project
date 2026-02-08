'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Activity, Lock, Cpu } from 'lucide-react';

export interface IntelLog {
    id: string;
    agentName: string;
    message: string;
    timestamp: Date;
    type: 'info' | 'success' | 'warning' | 'error' | 'thought';
}

interface LiveIntelFeedProps {
    logs: IntelLog[];
}

export const LiveIntelFeed: React.FC<LiveIntelFeedProps> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const getTypeStyle = (type: IntelLog['type']) => {
        switch (type) {
            case 'success': return 'text-emerald-400 border-l-2 border-emerald-500/50 pl-2 bg-emerald-900/10';
            case 'warning': return 'text-amber-400 border-l-2 border-amber-500/50 pl-2 bg-amber-900/10';
            case 'error': return 'text-red-400 border-l-2 border-red-500/50 pl-2 bg-red-900/10';
            case 'thought': return 'text-cyan-300/70 italic border-l-2 border-cyan-500/30 pl-2'; // Ghost thoughts
            default: return 'text-slate-400 border-l-2 border-transparent pl-2';
        }
    };

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-[#020408] border-l border-white/5">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-300 tracking-widest uppercase">System Event Log</span>
                </div>
                <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>
            </div>

            {/* Feed Content */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto font-mono text-[10px] leading-relaxed p-3 bg-[#050505]/80 backdrop-blur-md border border-slate-800 rounded-b-lg shadow-2xl pointer-events-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent hover:scrollbar-thumb-slate-600 transition-colors"
                onScroll={(e) => {
                    const target = e.target as HTMLDivElement;
                    const isBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 10;
                    setAutoScroll(isBottom);
                }}
            >
                {/* Empty State */}
                {logs.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center gap-2">
                        <Cpu className="w-8 h-8 text-cyan-500" />
                        <span>Awaiting Intelligence...</span>
                    </div>
                )}

                {/* Logs */}
                <div className="flex flex-col gap-2.5">
                    {logs.map((log) => (
                        <div key={log.id} className={`flex flex-col gap-1 transition-all duration-300 animate-in fade-in slide-in-from-right-2`}>
                            <div className="flex items-center justify-between opacity-50">
                                <span className="uppercase text-[9px] font-semibold tracking-wider text-slate-500">{log.agentName}</span>
                                <span className="text-[9px] text-slate-600">{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            </div>
                            <div className={`${getTypeStyle(log.type)} py-0.5 break-words`}>
                                {log.type === 'thought' && <span className="opacity-50 mr-1">//</span>}
                                {log.message}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Decals */}
            <div className="h-4 border-t border-white/5 bg-black/40 text-[9px] text-slate-600 flex items-center justify-between px-2 uppercase tracking-wider">
                <span>System.log</span>
                <span>Active</span>
            </div>
        </div>
    );
};
