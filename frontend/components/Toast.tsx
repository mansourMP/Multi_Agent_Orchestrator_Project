'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextValue {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { ...toast, id }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
    return (
        <div className="orion-toast-stack" aria-live="polite" aria-atomic="true">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, toast.duration || 4000);
        return () => clearTimeout(timer);
    }, [toast.duration, onClose]);

    const icons = {
        success: <CheckCircle size={18} />,
        error: <XCircle size={18} />,
        warning: <AlertCircle size={18} />,
        info: <Info size={18} />,
    };

    return (
        <div className={`orion-toast is-${toast.type}`} role="status">
            <div className="orion-toast__icon">
                {icons[toast.type]}
            </div>

            <div className="orion-toast__body">
                <div className="orion-toast__title">
                    {toast.title}
                </div>
                {toast.message && (
                    <div className="orion-toast__message">
                        {toast.message}
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={onClose}
                className="orion-toast__dismiss"
                aria-label="Dismiss notification"
            >
                <X size={14} />
            </button>
        </div>
    );
}
