'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Command, X, Play, Save, Plus, Settings, Zap, Eye, Code2 } from 'lucide-react';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectCommand: (command: string) => void;
}

const COMMANDS = [
    { id: 'run', label: 'Run Workflow', icon: Play, kbd: ['Cmd', 'Enter'], group: 'Actions' },
    { id: 'save', label: 'Save Workflow', icon: Save, kbd: ['Cmd', 'S'], group: 'Actions' },
    { id: 'new-node', label: 'Add New Node', icon: Plus, kbd: ['Cmd', 'N'], group: 'Edit' },
    { id: 'add-vision', label: 'Add Vision Agent', icon: Eye, group: 'Nodes' },
    { id: 'add-coding', label: 'Add Coding Agent', icon: Code2, group: 'Nodes' },
    { id: 'add-research', label: 'Add Research Agent', icon: Search, group: 'Nodes' },
    { id: 'settings', label: 'Open Settings', icon: Settings, group: 'Navigation' },
    { id: 'shortcuts', label: 'Show Keyboard Shortcuts', icon: Command, kbd: ['?'], group: 'Help' },
];

export default function CommandPalette({ isOpen, onClose, onSelectCommand }: CommandPaletteProps) {
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredCommands = COMMANDS.filter(cmd =>
        cmd.label.toLowerCase().includes(search.toLowerCase())
    );

    const groupedCommands = filteredCommands.reduce((acc, cmd) => {
        if (!acc[cmd.group]) acc[cmd.group] = [];
        acc[cmd.group].push(cmd);
        return acc;
    }, {} as Record<string, typeof COMMANDS>);

    useEffect(() => {
        if (!isOpen) {
            setSearch('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredCommands[selectedIndex]) {
                    onSelectCommand(filteredCommands[selectedIndex].id);
                    onClose();
                }
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredCommands, selectedIndex, onSelectCommand, onClose]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingTop: '15vh',
                zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '600px',
                    background: 'var(--bg-surface)',
                    border: '2px solid var(--pcb-trace, #00d4ff)',
                    borderRadius: '8px',
                    boxShadow: '0 0 20px rgba(0, 212, 255, 0.3), 0 20px 60px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }}
            >
                {/* Search Input */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    borderBottom: '1px solid var(--border-default)'
                }}>
                    <Search size={20} color="var(--electric-cyan, #00d4ff)" />
                    <input
                        autoFocus
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Type a command or search..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: '15px',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-sans)'
                        }}
                    />
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            display: 'flex',
                            padding: '4px'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Commands List */}
                <div style={{
                    maxHeight: '400px',
                    overflowY: 'auto',
                    padding: '8px'
                }}>
                    {Object.entries(groupedCommands).map(([group, commands]) => (
                        <div key={group} style={{ marginBottom: '12px' }}>
                            <div style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                padding: '8px 12px 4px'
                            }}>
                                {group}
                            </div>
                            {commands.map((cmd, idx) => {
                                const globalIndex = filteredCommands.indexOf(cmd);
                                const isSelected = globalIndex === selectedIndex;
                                const Icon = cmd.icon;

                                return (
                                    <button
                                        key={cmd.id}
                                        onClick={() => {
                                            onSelectCommand(cmd.id);
                                            onClose();
                                        }}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '10px 12px',
                                            background: isSelected ? 'var(--bg-hover)' : 'transparent',
                                            border: '1px solid',
                                            borderColor: isSelected ? 'var(--pcb-trace)' : 'transparent',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            transition: 'all 100ms ease',
                                            marginBottom: '2px',
                                            textAlign: 'left'
                                        }}
                                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                                    >
                                        <Icon size={16} color="var(--electric-cyan, #00d4ff)" />
                                        <span style={{
                                            flex: 1,
                                            fontSize: '13px',
                                            color: 'var(--text-primary)',
                                            fontWeight: 500
                                        }}>
                                            {cmd.label}
                                        </span>
                                        {cmd.kbd && (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {cmd.kbd.map((key, i) => (
                                                    <kbd key={i} style={{
                                                        padding: '2px 6px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        color: 'var(--text-tertiary)',
                                                        background: 'var(--bg-surface)',
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: '3px',
                                                        fontFamily: 'var(--font-mono)'
                                                    }}>
                                                        {key}
                                                    </kbd>
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}

                    {filteredCommands.length === 0 && (
                        <div style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                            fontSize: '13px'
                        }}>
                            No commands found
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '10px 16px',
                    borderTop: '1px solid var(--border-default)',
                    display: 'flex',
                    gap: '16px',
                    fontSize: '11px',
                    color: 'var(--text-tertiary)'
                }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <kbd style={{
                            padding: '2px 4px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '2px',
                            fontFamily: 'var(--font-mono)'
                        }}>↑↓</kbd>
                        <span>Navigate</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <kbd style={{
                            padding: '2px 4px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '2px',
                            fontFamily: 'var(--font-mono)'
                        }}>↵</kbd>
                        <span>Select</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <kbd style={{
                            padding: '2px 4px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '2px',
                            fontFamily: 'var(--font-mono)'
                        }}>Esc</kbd>
                        <span>Close</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
