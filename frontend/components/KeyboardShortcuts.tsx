'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { X, Command, Keyboard } from 'lucide-react';

interface KeyboardShortcut {
    keys: string[];
    description: string;
    category: string;
}

const SHORTCUTS: KeyboardShortcut[] = [
    // Canvas Navigation
    { keys: ['⌘', '+'], description: 'Zoom in', category: 'Canvas' },
    { keys: ['⌘', '-'], description: 'Zoom out', category: 'Canvas' },
    { keys: ['⌘', '0'], description: 'Reset zoom', category: 'Canvas' },
    { keys: ['Space', 'Drag'], description: 'Pan canvas', category: 'Canvas' },
    { keys: ['⌘', 'A'], description: 'Select all nodes', category: 'Canvas' },

    // Node Operations
    { keys: ['Delete'], description: 'Delete selected node', category: 'Nodes' },
    { keys: ['⌘', 'C'], description: 'Copy node', category: 'Nodes' },
    { keys: ['⌘', 'V'], description: 'Paste node', category: 'Nodes' },
    { keys: ['⌘', 'D'], description: 'Duplicate node', category: 'Nodes' },
    { keys: ['Escape'], description: 'Deselect all', category: 'Nodes' },

    // Workflow Actions
    { keys: ['⌘', 'S'], description: 'Save workflow', category: 'Workflow' },
    { keys: ['⌘', 'Enter'], description: 'Execute workflow', category: 'Workflow' },
    { keys: ['⌘', 'Shift', 'P'], description: 'Open command palette', category: 'Workflow' },
    { keys: ['⌘', 'K'], description: 'Quick search', category: 'Workflow' },

    // General
    { keys: ['?'], description: 'Show keyboard shortcuts', category: 'General' },
    { keys: ['⌘', '/'], description: 'Toggle node palette', category: 'General' },
];

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Group shortcuts by category
    const groupedShortcuts = SHORTCUTS.reduce((acc, shortcut) => {
        if (!acc[shortcut.category]) acc[shortcut.category] = [];
        acc[shortcut.category].push(shortcut);
        return acc;
    }, {} as Record<string, KeyboardShortcut[]>);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '520px',
                    maxHeight: '80vh',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-subtle)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Keyboard size={18} color="var(--text-tertiary)" />
                        <h2 style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            margin: 0
                        }}>
                            Keyboard Shortcuts
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        className="hover:bg-[var(--bg-hover)]"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    padding: '16px 20px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px'
                }}>
                    {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
                        <div key={category}>
                            <h3 style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                marginBottom: '12px'
                            }}>
                                {category}
                            </h3>
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                {shortcuts.map((shortcut, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            background: 'var(--bg-element)'
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '13px',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            {shortcut.description}
                                        </span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {shortcut.keys.map((key, keyIdx) => (
                                                <kbd
                                                    key={keyIdx}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: '24px',
                                                        height: '24px',
                                                        padding: '0 6px',
                                                        background: 'var(--bg-surface)',
                                                        border: '1px solid var(--border-default)',
                                                        borderRadius: '4px',
                                                        fontSize: '11px',
                                                        fontFamily: 'var(--font-mono)',
                                                        color: 'var(--text-primary)',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    textAlign: 'center'
                }}>
                    Press <kbd style={{
                        background: 'var(--bg-element)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '3px',
                        padding: '1px 4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)'
                    }}>Esc</kbd> or click outside to close
                </div>
            </div>
        </div>
    );
}

// Hook to manage keyboard shortcuts modal
export function useKeyboardShortcuts() {
    const [isOpen, setIsOpen] = useState(false);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Show modal on "?" key (without any modifiers)
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setIsOpen(true);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false)
    };
}
