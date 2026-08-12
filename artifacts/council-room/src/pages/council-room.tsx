import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  participantName?: string;
  participantColor?: string;
  content: string;
  timestamp: string;
  streaming?: boolean;
}

type WsEvent =
  | { type: 'history'; roomName: string; messages: RoomMessage[]; participantCount: number }
  | { type: 'message'; message: RoomMessage }
  | { type: 'join'; name: string; participantCount: number }
  | { type: 'leave'; name: string; participantCount: number }
  | { type: 'presence'; participantCount: number }
  | { type: 'streaming_start'; messageId: string; participantName?: string; participantColor?: string; timestamp: string }
  | { type: 'streaming_chunk'; messageId: string; content: string }
  | { type: 'streaming_end'; messageId: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWsUrl(roomId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/council/ws/${roomId}`;
}

function getRoomIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

// ─── Typing dots ─────────────────────────────────────────────────────────────

function TypingDots({ color }: { color: string }) {
  return (
    <span className="inline-flex gap-1 items-center py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
          style={{
            backgroundColor: color,
            animationDelay: `${i * 0.15}s`,
            animationDuration: '0.9s',
          }}
        />
      ))}
    </span>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: RoomMessage }) {
  if (msg.role === 'system') {
    return (
      <div className="flex justify-center my-3">
        <span className="text-xs text-muted-foreground italic px-3 py-1 rounded-full border border-border/50 bg-card/50">
          {msg.content}
        </span>
      </div>
    );
  }

  const isUser = msg.role === 'user';
  const accentColor = msg.participantColor ?? (isUser ? '#00ff88' : '#7b61ff');
  const label = (msg.participantName ?? (isUser ? 'Guest' : 'AI')).toUpperCase();
  const initials = label.slice(0, 2);

  return (
    <div
      className={`flex gap-2.5 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end`}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border mb-0.5"
        style={{
          backgroundColor: accentColor + '22',
          borderColor: accentColor,
          color: accentColor,
        }}
      >
        {initials}
      </div>

      <div className={`flex-1 max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Sender + time */}
        <div className={`flex gap-2 items-center mb-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span
            className="text-[10px] font-bold tracking-wider"
            style={{
              color: accentColor,
              textShadow: `0 0 6px ${accentColor}66`,
            }}
          >
            {label}
          </span>
          <span className="text-[9px] text-muted-foreground">{msg.timestamp}</span>
        </div>

        {/* Bubble */}
        <div
          className="rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            backgroundColor: isUser ? accentColor + '18' : 'hsl(var(--card))',
            border: `1px solid ${accentColor}44`,
            borderTopLeftRadius: isUser ? undefined : 4,
            borderTopRightRadius: isUser ? 4 : undefined,
            color: 'hsl(var(--foreground))',
            wordBreak: 'break-word',
          }}
        >
          {msg.streaming && msg.content === '' ? (
            <TypingDots color={accentColor} />
          ) : (
            <>
              {msg.content}
              {msg.streaming && (
                <span style={{ color: accentColor }} className="animate-pulse">▍</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Landing / Join form ─────────────────────────────────────────────────────

function LandingPage({ onJoin }: { onJoin: (roomId: string) => void }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    // Support full URLs — extract just the room param
    try {
      const url = new URL(trimmed);
      const r = url.searchParams.get('room');
      if (r) { onJoin(r); return; }
    } catch {}
    onJoin(trimmed);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      {/* Logo / title */}
      <div className="mb-10 text-center">
        <h1
          className="text-4xl font-bold tracking-widest mb-2"
          style={{ color: '#00ff88', textShadow: '0 0 30px #00ff8866' }}
        >
          COUNCIL ROOM
        </h1>
        <p className="text-sm text-muted-foreground tracking-wide">
          Join a live Middlemain council session
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm flex flex-col gap-4"
      >
        <div>
          <label className="block text-[10px] font-semibold tracking-widest text-muted-foreground mb-2 uppercase">
            Room ID or Link
          </label>
          <input
            className="w-full rounded-lg px-4 py-3 text-sm bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a room ID or full URL…"
            autoFocus
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-full py-3 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: input.trim() ? '#00ff8822' : undefined,
            color: '#00ff88',
            border: '1px solid #00ff88',
          }}
        >
          Join Session
        </button>
      </form>

      <p className="mt-12 text-[11px] text-muted-foreground text-center max-w-xs">
        Room IDs are created in the Middlemain app. Tap{' '}
        <span className="text-primary">🔴 Go Live</span> to generate a shareable link.
      </p>
    </div>
  );
}

// ─── Name picker ─────────────────────────────────────────────────────────────

function NamePicker({ onConfirm }: { onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}
      className="flex gap-2 items-center"
    >
      <input
        className="flex-1 rounded-lg px-3 py-2 text-sm bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors min-w-0"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your display name…"
        autoFocus
        maxLength={32}
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="px-4 py-2 rounded-lg text-sm font-semibold tracking-wider transition-all disabled:opacity-40"
        style={{ color: '#00ff88', border: '1px solid #00ff88', backgroundColor: '#00ff8818' }}
      >
        Join
      </button>
    </form>
  );
}

// ─── Main room view ───────────────────────────────────────────────────────────

const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

function RoomView({ roomId }: { roomId: string }) {
  const [roomName, setRoomName] = useState('Council Session');
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [myName, setMyName] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myNameRef = useRef<string | null>(null);
  const unmountedRef = useRef(false);

  // Keep ref in sync so ws callbacks always see latest name
  useEffect(() => { myNameRef.current = myName; }, [myName]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 60);
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    setStatus('connecting');
    const url = getWsUrl(roomId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      reconnectAttemptRef.current = 0;
      setStatus('connected');
      setErrorMsg('');
      // Send join with current name if we have one
      if (myNameRef.current) {
        ws.send(JSON.stringify({ type: 'join', name: myNameRef.current }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as WsEvent;
        if (data.type === 'history') {
          setRoomName(data.roomName);
          setMessages(data.messages);
          setParticipantCount(data.participantCount);
          scrollToBottom();
        } else if (data.type === 'message') {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === data.message.id);
            return exists ? prev : [...prev, data.message];
          });
          scrollToBottom();
        } else if (data.type === 'join') {
          setParticipantCount(data.participantCount);
          setMessages((prev) => [
            ...prev,
            {
              id: `join-${Date.now()}`,
              role: 'system',
              content: `${data.name} joined the session`,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
          scrollToBottom();
        } else if (data.type === 'leave') {
          setParticipantCount(data.participantCount);
          setMessages((prev) => [
            ...prev,
            {
              id: `leave-${Date.now()}`,
              role: 'system',
              content: `${data.name} left the session`,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        } else if (data.type === 'presence') {
          setParticipantCount(data.participantCount);
        } else if (data.type === 'streaming_start') {
          setMessages((prev) => [
            ...prev,
            {
              id: data.messageId,
              role: 'ai',
              participantName: data.participantName,
              participantColor: data.participantColor,
              content: '',
              timestamp: data.timestamp,
              streaming: true,
            },
          ]);
          scrollToBottom();
        } else if (data.type === 'streaming_chunk') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId
                ? { ...m, content: m.content + data.content }
                : m
            )
          );
          scrollToBottom();
        } else if (data.type === 'streaming_end') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId ? { ...m, streaming: false } : m
            )
          );
        }
      } catch {}
    };

    ws.onerror = () => {
      if (!unmountedRef.current) setStatus('reconnecting');
    };

    ws.onclose = (ev) => {
      if (unmountedRef.current) return;
      if (ev.code === 1008) {
        // Policy violation — room not found
        setStatus('error');
        setErrorMsg('Room not found or has expired.');
        return;
      }
      const attempt = reconnectAttemptRef.current;
      if (attempt >= WS_RECONNECT_DELAYS.length) {
        setStatus('error');
        setErrorMsg('Could not reconnect to the room. Please refresh.');
        return;
      }
      setStatus('reconnecting');
      const delay = WS_RECONNECT_DELAYS[attempt];
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [roomId, scrollToBottom]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const handleJoinWithName = useCallback((name: string) => {
    setMyName(name);
    myNameRef.current = name;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'join', name }));
    }
  }, []);

  const sendMessage = useCallback(() => {
    const content = input.trim();
    if (!content || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'message', content }));
    setInput('');
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Status pill color
  const statusColor = status === 'connected'
    ? '#00ff88'
    : status === 'error'
      ? '#ff4444'
      : '#ffd700';

  const statusLabel = status === 'connected'
    ? 'Live'
    : status === 'reconnecting'
      ? 'Reconnecting…'
      : status === 'error'
        ? 'Disconnected'
        : 'Connecting…';

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-center gap-4">
        <div className="text-5xl mb-2">⚡</div>
        <h2 className="text-xl font-bold text-foreground">Can't reach room</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
        <button
          className="mt-4 px-6 py-2.5 rounded-lg text-sm font-semibold tracking-wider"
          style={{ color: '#00ff88', border: '1px solid #00ff88', backgroundColor: '#00ff8818' }}
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0"
        style={{ backgroundColor: 'hsl(var(--card))' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Status dot */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
            style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
          />
          <span className="text-[10px] font-semibold tracking-widest" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="text-sm font-bold tracking-widest text-foreground truncate uppercase">
            {roomName}
          </h1>
          <p className="text-[9px] text-muted-foreground tracking-wider font-mono">
            {roomId}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#00ff88' }} />
          <span className="text-[11px] text-muted-foreground font-medium">
            {participantCount}
          </span>
        </div>
      </div>

      {/* ── Message feed ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
      >
        {messages.length === 0 && status === 'connected' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground italic">Waiting for messages…</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {/* ── Input area ── */}
      <div
        className="border-t border-border px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: 'hsl(var(--card))' }}
      >
        {myName === null ? (
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 tracking-wide">
              Enter your name to join the conversation:
            </p>
            <NamePicker onConfirm={handleJoinWithName} />
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              className="flex-1 rounded-lg px-3 py-2.5 text-sm bg-card/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none min-h-[44px] max-h-32"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={status === 'connected' ? 'Send a message…' : statusLabel}
              disabled={status !== 'connected'}
              rows={1}
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || status !== 'connected'}
              className="w-11 h-11 flex items-center justify-center rounded-lg border transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: input.trim() && status === 'connected' ? '#00ff88' : 'hsl(var(--border))',
                backgroundColor: input.trim() && status === 'connected' ? '#00ff8820' : 'transparent',
                color: input.trim() && status === 'connected' ? '#00ff88' : 'hsl(var(--muted-foreground))',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}

        {/* Watching note (if named) */}
        {myName !== null && (
          <p className="text-[9px] text-muted-foreground mt-1.5 text-right tracking-wide">
            You are <span className="text-primary">{myName}</span> · Enter to send
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Exported page ────────────────────────────────────────────────────────────

export default function CouncilRoomPage() {
  const [roomId, setRoomId] = useState<string | null>(() => getRoomIdFromUrl());

  const handleJoin = (id: string) => {
    // Update URL so the link can be shared / bookmarked
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    window.history.pushState({}, '', url.toString());
    setRoomId(id);
  };

  if (!roomId) return <LandingPage onJoin={handleJoin} />;
  return <RoomView key={roomId} roomId={roomId} />;
}
