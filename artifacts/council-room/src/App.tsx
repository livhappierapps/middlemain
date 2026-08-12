import { useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Router as WouterRouter, useSearch } from 'wouter';
import { Terminal, Users, ShieldAlert, ArrowLeft, Send } from 'lucide-react';
import { useCouncilWs, type RoomMessage } from './use-council-ws';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const queryClient = new QueryClient();

// ==========================================
// MAIN ROUTER
// ==========================================

function Main() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const roomId = params.get('room');

  if (roomId) {
    return <Room roomId={roomId} />;
  }
  return <Join />;
}

// ==========================================
// JOIN STATE
// ==========================================

function Join() {
  const [roomId, setRoomId] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = roomId.trim();
    if (!trimmed) return;
    // Support pasting a full URL — extract the room param
    try {
      const url = new URL(trimmed);
      const r = url.searchParams.get('room');
      if (r) { window.location.search = `?room=${r}`; return; }
    } catch {}
    window.location.search = `?room=${trimmed}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md border border-primary/30 bg-black/60 p-8 shadow-[0_0_25px_rgba(0,255,136,0.05)] backdrop-blur-sm">
        <div className="flex flex-col items-center mb-10">
          <Terminal className="w-16 h-16 text-primary mb-6 drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]" />
          <h1 className="text-3xl font-bold tracking-widest text-primary uppercase drop-shadow-[0_0_8px_rgba(0,255,136,0.3)]">Council Room</h1>
          <p className="text-muted-foreground text-sm mt-3 text-center uppercase tracking-wider">Secure connection protocol</p>
        </div>
        
        <form onSubmit={onSubmit} className="space-y-8">
          <div className="space-y-3">
            <label className="text-xs text-primary/70 uppercase tracking-widest block font-bold">Session ID or Link</label>
            <input 
              type="text" 
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
              placeholder="Enter Room ID or paste link"
              autoFocus
              className="w-full bg-primary/5 border-b-2 border-primary/30 px-3 py-4 text-white focus:outline-none focus:border-primary focus:bg-primary/10 transition-colors placeholder:text-muted-foreground/40 font-mono text-lg"
            />
          </div>
          <button 
            type="submit"
            disabled={!roomId.trim()}
            className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(0,255,136,0.2)] hover:shadow-[0_0_25px_rgba(0,255,136,0.4)]"
          >
            Initialize Connection
          </button>
        </form>
      </div>
      <p className="mt-10 text-[11px] text-muted-foreground text-center max-w-xs uppercase tracking-wider">
        Room IDs are created in the Middlemain app. Tap 🔴 Go Live to generate a shareable link.
      </p>
    </div>
  );
}

// ==========================================
// ROOM STATE
// ==========================================

function Room({ roomId }: { roomId: string }) {
  const [name, setName] = useState<string | null>(null);
  
  const { data: roomInfo, error, isLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      const res = await fetch(`/api/council/rooms/${roomId}`);
      if (!res.ok) throw new Error('Room not found');
      return res.json();
    },
    retry: false
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background text-primary flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <div className="uppercase tracking-widest text-sm animate-pulse">Establishing secure link...</div>
      </div>
    );
  }

  if (error || !roomInfo) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md border border-destructive/30 bg-black/60 p-8 shadow-[0_0_25px_rgba(255,0,0,0.1)] backdrop-blur-sm text-center">
          <ShieldAlert className="w-16 h-16 text-destructive mb-6 mx-auto drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]" />
          <h1 className="text-2xl font-bold tracking-widest text-destructive uppercase mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-8">Session ID <span className="text-white">{roomId}</span> not found or terminated.</p>
          <a href="?" className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground transition-colors uppercase tracking-widest text-sm font-bold w-full">
            <ArrowLeft className="w-4 h-4" /> Return to Gateway
          </a>
        </div>
      </div>
    );
  }

  if (!name) {
    return <NamePrompt onJoin={setName} roomName={roomInfo.name || roomId} />;
  }

  return <ActiveRoom roomId={roomId} name={name} initialRoomName={roomInfo.name || roomId} />;
}

// ==========================================
// NAME PROMPT
// ==========================================

function NamePrompt({ onJoin, roomName }: { onJoin: (name: string) => void, roomName: string }) {
  const [inputName, setInputName] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputName.trim()) {
      onJoin(inputName.trim());
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md border border-primary/30 bg-black/60 p-8 shadow-[0_0_25px_rgba(0,255,136,0.05)] backdrop-blur-sm">
        <h1 className="text-2xl font-bold tracking-widest text-primary uppercase mb-2">Identify</h1>
        <p className="text-muted-foreground text-sm mb-8 uppercase tracking-wider">Target: <span className="text-white">{roomName}</span></p>
        
        <form onSubmit={onSubmit} className="space-y-8">
          <div className="space-y-3">
            <label className="text-xs text-primary/70 uppercase tracking-widest block font-bold">Operative Alias</label>
            <input 
              type="text" 
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              placeholder="Enter display name"
              autoFocus
              className="w-full bg-primary/5 border-b-2 border-primary/30 px-3 py-4 text-white focus:outline-none focus:border-primary focus:bg-primary/10 transition-colors placeholder:text-muted-foreground/40 font-mono text-lg"
            />
          </div>
          <button 
            type="submit"
            disabled={!inputName.trim()}
            className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(0,255,136,0.2)] hover:shadow-[0_0_25px_rgba(0,255,136,0.4)]"
          >
            Join Session
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// ACTIVE CHAT
// ==========================================

function ActiveRoom({ roomId, name, initialRoomName }: { roomId: string, name: string, initialRoomName: string }) {
  const { messages, participantCount, viewers, roomName, status, sendMessage } = useCouncilWs(roomId, name);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const displayRoomName = roomName || initialRoomName;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="h-[100dvh] bg-background text-foreground flex flex-col max-w-5xl mx-auto border-x border-primary/20 relative shadow-[0_0_50px_rgba(0,255,136,0.03)] bg-black/80 backdrop-blur-md">
      {/* Header */}
      <header className="shrink-0 border-b border-primary/30 bg-black/90 p-4 px-6 flex items-center justify-between z-10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-3 h-3">
            <div className={`absolute inset-0 rounded-none ${
              status === 'connected' ? 'bg-primary shadow-[0_0_10px_rgba(0,255,136,1)] animate-pulse' : 
              status === 'connecting' ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,1)]' : 
              'bg-destructive shadow-[0_0_10px_rgba(255,0,0,1)]'
            }`} />
          </div>
          <h1 className="text-lg font-bold tracking-widest text-primary uppercase drop-shadow-[0_0_5px_rgba(0,255,136,0.4)]">{displayRoomName}</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-2 text-sm text-primary font-bold bg-primary/10 px-3 py-1 border border-primary/20 hover:bg-primary/20 hover:border-primary/40 transition-colors cursor-pointer"
                title="View watchers"
              >
                <Users className="w-4 h-4" />
                <span>{participantCount} watching</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-56 p-0 bg-black/95 border border-primary/30 shadow-[0_0_20px_rgba(0,255,136,0.1)] rounded-none"
            >
              <div className="px-4 py-2.5 border-b border-primary/20">
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Live Watchers</p>
              </div>
              <ul className="py-2 max-h-60 overflow-y-auto">
                {viewers.length === 0 ? (
                  <li className="px-4 py-2 text-xs text-muted-foreground italic">No names yet…</li>
                ) : (
                  viewers.map((v, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-white/90 hover:bg-primary/5"
                    >
                      <span className="w-1.5 h-1.5 rounded-none bg-primary shadow-[0_0_4px_rgba(0,255,136,0.8)] shrink-0" />
                      <span className="font-mono truncate">{v}</span>
                      {v === name && (
                        <span className="ml-auto text-[9px] text-primary/60 uppercase tracking-wider shrink-0">you</span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </PopoverContent>
          </Popover>
          <a href="?" title="Leave Session" className="text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
        </div>
      </header>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground uppercase tracking-widest text-xs mt-10">
            Waiting for transmissions...
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={`${msg.id}-${i}`} msg={msg} />
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 p-4 md:p-6 border-t border-primary/30 bg-black/95 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] z-10">
        <form onSubmit={onSubmit} className="flex items-stretch gap-3 relative">
          <div className="relative flex-1">
            <span className="text-primary absolute left-4 top-1/2 -translate-y-1/2 font-bold select-none">&gt;</span>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Transmit message..."
              disabled={status !== 'connected'}
              className="w-full h-full bg-primary/5 border border-primary/30 pl-10 pr-4 py-4 text-white focus:outline-none focus:border-primary focus:bg-primary/10 transition-colors placeholder:text-muted-foreground/40 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || status !== 'connected'}
            className="bg-primary text-primary-foreground px-6 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(0,255,136,0.1)] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] flex items-center justify-center"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: RoomMessage }) {
  const isSystem = msg.role === 'system';
  const isAi = msg.role === 'ai';
  // msg.timestamp may be a locale display string (e.g. "4:12 PM") or an ISO string;
  // render it directly to avoid "Invalid Date" when Middlemain sends display strings.
  const parsedDate = new Date(msg.timestamp);
  const timeStr = isNaN(parsedDate.getTime())
    ? msg.timestamp
    : parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  if (isSystem) {
    return (
      <div className="text-xs text-muted-foreground italic pl-3 border-l border-muted-foreground/30 py-1">
        [{timeStr}] {msg.content}
      </div>
    );
  }

  // AI color mapping (fallback to electric purple)
  const aiColor = msg.participantColor || '#b026ff';
  
  return (
    <div className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-baseline gap-3 mb-1.5">
        <span className="text-[10px] text-muted-foreground/70 tracking-wider">[{timeStr}]</span>
        
        <span 
          className="text-xs font-bold uppercase tracking-widest" 
          style={{ color: isAi ? aiColor : 'var(--color-primary)' }}
        >
          {msg.participantName || (isAi ? 'SYS.AI' : 'OPERATIVE')}
        </span>
        
        {isAi && (
          <span 
            className="text-[9px] px-1.5 py-0.5 border border-current bg-current/10 tracking-widest uppercase"
            style={{ color: aiColor }}
          >
            AI
          </span>
        )}
      </div>
      
      <div 
        className="pl-4 border-l-2 py-1.5 text-[15px] leading-relaxed relative"
        style={{ 
          borderColor: isAi ? aiColor : 'hsl(var(--primary))',
          backgroundColor: isAi ? `${aiColor}10` : 'transparent' 
        }}
      >
        <div 
          className="absolute left-[-2px] top-0 bottom-0 w-[2px] opacity-50 blur-[2px]"
          style={{ backgroundColor: isAi ? aiColor : 'hsl(var(--primary))' }}
        />
        
        <div 
          className="whitespace-pre-wrap break-words"
          style={{ 
            color: isAi ? aiColor : 'rgba(255,255,255,0.9)',
            textShadow: isAi ? `0 0 8px ${aiColor}40` : 'none'
          }}
        >
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ROOT COMPONENT
// ==========================================

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ErrorBoundary>
          <Main />
        </ErrorBoundary>
      </WouterRouter>
    </QueryClientProvider>
  );
}
