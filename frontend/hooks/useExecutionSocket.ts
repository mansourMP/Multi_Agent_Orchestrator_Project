'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_BASE } from '@/lib/config';

interface ExecutionLog {
    executionId: string;
    log: string;
    timestamp: string;
}

interface ExecutionStatus {
    executionId: string;
    status: string;
    data?: any;
    timestamp: string;
}

interface ExecutionComplete {
    executionId: string;
    result: {
        status: string;
        logs: string[];
        finalResult?: string;
    };
    timestamp: string;
}

interface UseExecutionSocketOptions {
    executionId?: string;
    onLog?: (log: ExecutionLog) => void;
    onStatus?: (status: ExecutionStatus) => void;
    onComplete?: (complete: ExecutionComplete) => void;
}

export function useExecutionSocket(options: UseExecutionSocketOptions = {}) {
    const { executionId } = options;
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<string>('idle');

    // Store callbacks in refs to avoid useEffect dependency loops
    const callbacksRef = useRef(options);

    useEffect(() => {
        callbacksRef.current = options;
    });

    // Connect to socket
    useEffect(() => {
        socketRef.current = io(`${WS_BASE}/executions`, {
            transports: ['websocket'],
            autoConnect: true,
        });

        socketRef.current.on('connect', () => {
            console.log('[Socket] Connected to executions namespace');
            setIsConnected(true);
        });

        socketRef.current.on('disconnect', () => {
            console.log('[Socket] Disconnected');
            setIsConnected(false);
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error.message);
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    // Subscribe to execution when executionId changes
    useEffect(() => {
        if (!socketRef.current || !executionId || !isConnected) return;

        // Subscribe to this execution
        socketRef.current.emit('subscribe', { executionId });
        setStatus('running');
        setLogs([]);

        // Listen for logs
        const handleLog = (data: ExecutionLog) => {
            if (data.executionId === executionId) {
                setLogs(prev => [...prev, data.log]);
                callbacksRef.current.onLog?.(data);
            }
        };

        // Listen for status updates
        const handleStatus = (data: ExecutionStatus) => {
            if (data.executionId === executionId) {
                setStatus(data.status);
                callbacksRef.current.onStatus?.(data);
            }
        };

        // Listen for completion
        const handleComplete = (data: ExecutionComplete) => {
            if (data.executionId === executionId) {
                setStatus(data.result.status);
                callbacksRef.current.onComplete?.(data);
            }
        };

        socketRef.current.on('log', handleLog);
        socketRef.current.on('status', handleStatus);
        socketRef.current.on('complete', handleComplete);

        return () => {
            if (socketRef.current) {
                socketRef.current.emit('unsubscribe', { executionId });
                socketRef.current.off('log', handleLog);
                socketRef.current.off('status', handleStatus);
                socketRef.current.off('complete', handleComplete);
            }
        };
    }, [executionId, isConnected]);

    // Manual subscribe function
    const subscribe = useCallback((execId: string) => {
        if (socketRef.current && isConnected) {
            socketRef.current.emit('subscribe', { executionId: execId });
            setStatus('running');
            setLogs([]);
        }
    }, [isConnected]);

    // Manual unsubscribe function
    const unsubscribe = useCallback((execId: string) => {
        if (socketRef.current) {
            socketRef.current.emit('unsubscribe', { executionId: execId });
            setStatus('idle');
        }
    }, []);

    return {
        isConnected,
        logs,
        status,
        subscribe,
        unsubscribe,
    };
}
