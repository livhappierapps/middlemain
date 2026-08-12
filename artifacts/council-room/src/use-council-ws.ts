import { useEffect, useRef, useState, useCallback } from 'react';

export type RoomMessage = {
  id: string;
  role: 'user' | 'ai' | 'system';
  participantName?: string;
  participantColor?: string;
  content: string;
  timestamp: string;
};

export function useCouncilWs(roomId: string, name: string | null) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [roomName, setRoomName] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!name) return;

    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;
      setStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/api/council/ws/${roomId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmounted) {
          ws.close();
          return;
        }
        setStatus('connected');
        ws.send(JSON.stringify({ type: 'join', name }));
      };

      ws.onmessage = (event) => {
        if (isUnmounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'history') {
            setMessages(data.messages || []);
            setParticipantCount(data.participantCount || 0);
            if (data.roomName) setRoomName(data.roomName);
          } else if (data.type === 'message') {
            setMessages((prev) => [...prev, data.message]);
          } else if (data.type === 'join') {
            setParticipantCount(data.participantCount);
            setMessages((prev) => [...prev, {
              id: Math.random().toString(),
              role: 'system',
              content: `${data.name} joined the council`,
              timestamp: new Date().toISOString()
            }]);
          } else if (data.type === 'leave') {
            setParticipantCount(data.participantCount);
            setMessages((prev) => [...prev, {
              id: Math.random().toString(),
              role: 'system',
              content: `${data.name} left the council`,
              timestamp: new Date().toISOString()
            }]);
          } else if (data.type === 'presence') {
            setParticipantCount(data.participantCount);
          }
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setStatus('disconnected');
        // Auto reconnect
        reconnectTimeout.current = setTimeout(connect, 3000);
      };
      
      ws.onerror = () => {
         // onclose will handle the reconnect
         ws.close();
      };
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [roomId, name]);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', content }));
    }
  }, []);

  return { messages, participantCount, roomName, status, sendMessage };
}
