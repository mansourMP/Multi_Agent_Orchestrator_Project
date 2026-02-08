'use client';

import React from 'react';
import { Fuel, AlertTriangle, Zap } from 'lucide-react';

interface ResourceCoreProps {
    currentCost: number;
    dailyLimit?: number;
    burnRate?: number; // $/hr
    currency?: string;
}

export const ResourceCore: React.FC<ResourceCoreProps> = ({
    currentCost = 0.0,
    dailyLimit = 5.00,
    burnRate = 0.0,
    currency = '$'
}) => {
    const percentage = Math.min((currentCost / dailyLimit) * 100, 100);

    // Determine color based on usage
    let colorClass = 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'; // Green
    let textClass = 'text-emerald-400';

    if (percentage > 75) {
        colorClass = 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'; // Orange
        textClass = 'text-amber-400';
    }
    if (percentage > 90) {
        colorClass = 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'; // Red
        textClass = 'text-red-400';
    }

    return (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 min-w-[400px] z-50">
            {/* Main HUD Container */}
            <div className="bg-[#0a0a0a]/90 backdrop-blur-md border border-slate-800 rounded-xl p-4 shadow-2xl relative overflow-hidden group">

                {/* Glossy Overlay */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"></div>

                {/* Header / Title */}
                <div className="flex items-center justify-between mb-2 opacity-80">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 tracking-wider uppercase">
                        <Fuel className="w-3 h-3 text-slate-500" />
                        Resource Core
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Daily Limit: {currency}{dailyLimit.toFixed(2)}</span>
                    </div>
                </div>

                {/* The Fuel Bar */}
                <div className="relative h-4 bg-slate-900/50 rounded-full border border-slate-700/50 overflow-hidden backdrop-blur-sm">
                    {/* Background Grid Pattern in Bar */}
                    <div className="absolute inset-0 w-full h-full opacity-20"
                        style={{ backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(255,255,255,0.1) 50%)', backgroundSize: '10px 10px' }}>
                    </div>

                    {/* The Fills */}
                    <div
                        className={`h-full transition-all duration-700 ease-out relative ${colorClass}`}
                        style={{ width: `${percentage}%` }}
                    >
                        {/* Animated Shine */}
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/20 to-transparent"></div>
                    </div>
                </div>

                {/* Readouts */}
                <div className="flex items-end justify-between mt-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-0.5">Budget Remaining</span>
                        <span className={`text-xl font-mono font-bold ${textClass} drop-shadow-sm`}>
                            {currency}{(dailyLimit - currentCost).toFixed(2)}
                        </span>
                    </div>

                    {/* Burn Rate Indicator */}
                    <div className="flex items-center gap-3 bg-slate-900/50 px-3 py-1 rounded-lg border border-white/5">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Current Burn</span>
                            <div className="flex items-center gap-1.5">
                                <Zap className={`w-3 h-3 ${burnRate > 0.5 ? 'text-amber-400 animate-pulse' : 'text-slate-600'}`} />
                                <span className="text-sm font-mono text-slate-300">
                                    {currency}{burnRate.toFixed(2)}<span className="text-slate-600 text-[10px]">/hr</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Warning Indicator (Only if high usage) */}
                {percentage > 90 && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-red-400 font-bold bg-red-900/20 px-2 py-0.5 rounded border border-red-900/50 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        CRITICAL LIMIT
                    </div>
                )}
            </div>

            {/* Decorative HUD Lines */}
            <div className="absolute -bottom-2 -left-4 w-2 h-8 border-l border-b border-slate-700/50 rounded-bl-xl opacity-50"></div>
            <div className="absolute -bottom-2 -right-4 w-2 h-8 border-r border-b border-slate-700/50 rounded-br-xl opacity-50"></div>
        </div>
    );
};
