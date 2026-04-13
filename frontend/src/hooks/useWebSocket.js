import { useEffect, useRef, useCallback } from 'react';

const RUNTIME_WS_URL = (typeof window !== 'undefined' && window.__TRADEFLOW_CONFIG__ && window.__TRADEFLOW_CONFIG__.WS_URL) || '';
const defaultWsUrl = () => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
};
const WS_URL = RUNTIME_WS_URL || process.env.REACT_APP_WS_URL || defaultWsUrl();

export function useWebSocket({ tenantId, firmId, onMessage, enabled = true }) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!enabled || !tenantId || !firmId) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      ws.send(JSON.stringify({ type: 'auth', token, tenantId, firmId }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'auth_ok' && onMessage) onMessage(msg);
      } catch (_) {}
    };

    ws.onclose = () => {
      if (attemptsRef.current < 5) {
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
        attemptsRef.current++;
        reconnectRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => ws.close();
  }, [enabled, tenantId, firmId, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);
}
