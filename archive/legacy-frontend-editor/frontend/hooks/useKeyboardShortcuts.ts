import { useEffect } from 'react';

interface KeyboardShortcut {
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
    callback: () => void;
    description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            for (const shortcut of shortcuts) {
                const metaPressed = event.metaKey || event.ctrlKey;

                const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
                const metaMatches = shortcut.meta ? metaPressed : !metaPressed;
                const ctrlMatches = shortcut.ctrl ? event.ctrlKey : !shortcut.ctrl;
                const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
                const altMatches = shortcut.alt ? event.altKey : !event.altKey;

                if (keyMatches && metaMatches && ctrlMatches && shiftMatches && altMatches) {
                    event.preventDefault();
                    shortcut.callback();
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts, enabled]);
}

export const WORKFLOW_SHORTCUTS: Omit<KeyboardShortcut, 'callback'>[] = [
    { key: 's', meta: true, description: 'Save workflow' },
    { key: 'enter', meta: true, description: 'Run workflow' },
    { key: 'k', meta: true, description: 'Open command palette' },
    { key: 'n', meta: true, description: 'Add new node' },
    { key: 'z', meta: true, description: 'Undo' },
    { key: 'z', meta: true, shift: true, description: 'Redo' },
    { key: '/', description: 'Focus search' },
    { key: '?', shift: true, description: 'Show keyboard shortcuts' },
    { key: 'Escape', description: 'Close modals / Deselect' },
];
