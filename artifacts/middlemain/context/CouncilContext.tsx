import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AIProvider, AIConnection, ChatMessage, PROVIDER_DEFAULTS } from '@/context/AIContext';
import { useAI } from '@/context/AIContext';
import { useAisAndEars } from '@/context/AisAndEarsContext';
import { fetch } from 'expo/fetch';

// ─── Storage keys ────────────────────────────────────────────────────────────
const STORAGE_MESSAGES_KEY = 'council_messages_v1';
const STORAGE_MANUAL_PARTICIPANTS_KEY = 'council_manual_participants_v1';

// Shape stored for each manual participant (no transient session/sense state)
interface PersistedParticipant {
  id: string;
  connectionId?: string;
  displayName: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  color: string;
}

// ─── Participant colors palette ──────────────────────────────────────────────
export const COUNCIL_COLORS = [
  '#00ff88',
  '#7b61ff',
  '#ff6b35',
  '#00d4ff',
  '#ff4081',
  '#ffd700',
  '#00e5ff',
  '#ff8a65',
];

// ─── Types ───────────────────────────────────────────────────────────────────
export interface CouncilParticipant {
  id: string;
  connectionId?: string;
  displayName: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  color: string;
  isAutoLoaded: boolean;
  session: { sessionId: string; wsUrl: string; visionUrl: string } | null;
  sessionLoading: boolean;
  hearingOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  sessionError?: string;
}

export interface CouncilMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  participantId?: string;
  participantName?: string;
  participantColor?: string;
  content: string;
  timestamp: string;
  streaming?: boolean;
}

interface CouncilContextValue {
  participants: CouncilParticipant[];
  messages: CouncilMessage[];
  isSending: boolean;
  addParticipant: (data: Omit<CouncilParticipant, 'id' | 'session' | 'sessionLoading' | 'hearingOn' | 'cameraOn' | 'screenOn' | 'isAutoLoaded' | 'sessionError'>) => void;
  removeParticipant: (id: string) => void;
  sendUserMessage: (text: string, mentionedIds: string[]) => Promise<void>;
  toggleHearing: (participantId: string) => Promise<void>;
  toggleCamera: (participantId: string) => void;
  toggleScreen: (participantId: string) => void;
  sendVisionFrameToAll: (imageData: string, source: 'camera' | 'screen', participantIds?: string[]) => Promise<void>;
  clearMessages: () => void;
}

const CouncilCtx = createContext<CouncilContextValue | null>(null);

export function useCouncil() {
  const ctx = useContext(CouncilCtx);
  if (!ctx) throw new Error('useCouncil must be inside CouncilProvider');
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getServerBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return '/api';
}

const CHUNK_MS = 2500;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_BASE_RECONNECT_DELAY_MS = 1000;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 24000,
    numberOfChannels: 1,
    bitRate: 384000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 24000,
    numberOfChannels: 1,
    bitRate: 384000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

async function streamSSE(
  resp: Response,
  onChunk: (c: string) => void,
  onDone: () => void,
  onError: (e: string) => void,
) {
  const reader = resp.body?.getReader();
  if (!reader) { onError('Streaming not supported'); return; }
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const raw = trimmed.slice(6);
        if (raw === '[DONE]') continue;
        try {
          const json = JSON.parse(raw);
          const content = json.choices?.[0]?.delta?.content || json.delta?.text || '';
          if (content) onChunk(content);
        } catch {}
      }
    }
    onDone();
  } catch (e: any) {
    onError(e?.message ?? 'Stream error');
  }
}

async function callParticipantAI(
  participant: CouncilParticipant,
  messages: ChatMessage[],
): Promise<Response> {
  if (participant.provider === 'anthropic') {
    const baseUrl = participant.baseUrl || PROVIDER_DEFAULTS.anthropic.baseUrl;
    return fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': participant.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: participant.model,
        max_tokens: 2048,
        stream: true,
        messages,
      }),
    });
  }
  if (participant.provider === 'server') {
    const base = participant.baseUrl || getServerBase();
    return fetch(`${base}/grok/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: participant.model || 'grok-3',
        messages: [
          ...(participant.systemPrompt ? [{ role: 'system', content: participant.systemPrompt }] : []),
          ...messages,
        ],
        stream: true,
        systemPrompt: participant.systemPrompt,
      }),
    });
  }
  const baseUrl = participant.baseUrl || PROVIDER_DEFAULTS[participant.provider]?.baseUrl || '';
  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${participant.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: participant.model,
      messages: [
        ...(participant.systemPrompt ? [{ role: 'system', content: participant.systemPrompt }] : []),
        ...messages,
      ],
      stream: true,
    }),
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function CouncilProvider({ children }: { children: React.ReactNode }) {
  const { connections } = useAI();
  const { config: bridgeConfig } = useAisAndEars();

  const [participants, setParticipants] = useState<CouncilParticipant[]>([]);
  const [messages, setMessages] = useState<CouncilMessage[]>([
    {
      id: genId(),
      role: 'system',
      content: 'Council session started. @mention an AI to send them a message.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [isSending, setIsSending] = useState(false);

  // Tracks whether we've finished loading from AsyncStorage; gates saves so
  // we don't overwrite stored data before hydration completes.
  const hydratedRef = useRef(false);

  const wsMap = useRef<Map<string, WebSocket>>(new Map());
  const recordingRef = useRef<Audio.Recording | null>(null);
  const hearingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mirror participants into a ref so WS reconnect closures always see current state
  const participantsRef = useRef<CouncilParticipant[]>([]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  // Track which participants should auto-reconnect (hearing is ON) and reconnect attempts
  const shouldReconnectRef = useRef<Set<string>>(new Set());
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const reconnectTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Hydrate from AsyncStorage on mount ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedMessages, storedParticipants] = await Promise.all([
          AsyncStorage.getItem(STORAGE_MESSAGES_KEY),
          AsyncStorage.getItem(STORAGE_MANUAL_PARTICIPANTS_KEY),
        ]);

        if (cancelled) return;

        if (storedMessages) {
          const parsed: CouncilMessage[] = JSON.parse(storedMessages);
          // Drop any messages that were mid-stream when the app closed
          const cleaned = parsed.map((m) => ({ ...m, streaming: false }));
          if (cleaned.length > 0) {
            setMessages(cleaned);
          }
        }

        if (storedParticipants) {
          const persisted: PersistedParticipant[] = JSON.parse(storedParticipants);
          if (persisted.length > 0) {
            setParticipants((prev) => {
              const autoLoaded = prev.filter((p) => p.isAutoLoaded);
              const restored: CouncilParticipant[] = persisted.map((p) => ({
                ...p,
                isAutoLoaded: false,
                session: null,
                sessionLoading: false,
                hearingOn: false,
                cameraOn: false,
                screenOn: false,
              }));
              return [...autoLoaded, ...restored];
            });
          }
        }
      } catch {}
      if (!cancelled) {
        hydratedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Persist messages to AsyncStorage whenever they change ───────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    // Don't persist any actively-streaming placeholders
    const toSave = messages.map((m) => ({ ...m, streaming: false }));
    AsyncStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [messages]);

  // ── Persist manual participants whenever they change ────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    const manualParticipants = participants.filter((p) => !p.isAutoLoaded);
    const toSave: PersistedParticipant[] = manualParticipants.map(({ id, connectionId, displayName, provider, apiKey, model, baseUrl, systemPrompt, color }) => ({
      id, connectionId, displayName, provider, apiKey, model, baseUrl, systemPrompt, color,
    }));
    AsyncStorage.setItem(STORAGE_MANUAL_PARTICIPANTS_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [participants]);

  // ── Auto-load connected AIs ─────────────────────────────────────────────
  // This effect is intentionally NOT guarded by an initializedRef so it always
  // re-syncs when connections change or when the provider remounts (e.g. hot
  // reload or navigation stack reset). It only touches auto-loaded participants,
  // so manually-added ones are preserved.
  useEffect(() => {
    if (connections.length === 0) return;

    setParticipants((prev) => {
      // Keep manually-added participants
      const manual = prev.filter((p) => !p.isAutoLoaded);

      // Build the new auto-loaded list from current connections, preserving
      // existing participant IDs so bridge sessions / WS refs are not orphaned.
      const autoParticipants: CouncilParticipant[] = connections.map((conn, idx) => {
        const existing = prev.find((p) => p.isAutoLoaded && p.connectionId === conn.id);
        if (existing) return existing;
        return {
          id: genId(),
          connectionId: conn.id,
          displayName: conn.name,
          provider: conn.provider,
          apiKey: conn.apiKey,
          model: conn.model,
          baseUrl: conn.baseUrl,
          systemPrompt: conn.systemPrompt || 'You are a helpful AI assistant.',
          color: COUNCIL_COLORS[idx % COUNCIL_COLORS.length],
          isAutoLoaded: true,
          session: null,
          sessionLoading: false,
          hearingOn: false,
          cameraOn: false,
          screenOn: false,
        };
      });

      return [...autoParticipants, ...manual];
    });
  }, [connections]);

  // ── WebSocket management ────────────────────────────────────────────────
  const connectParticipantWs = useCallback((participantId: string, wsUrl: string): WebSocket => {
    const ws = new WebSocket(wsUrl);

    ws.onerror = () => {};

    ws.onclose = () => {
      wsMap.current.delete(participantId);

      if (!shouldReconnectRef.current.has(participantId)) return;

      const attempts = (reconnectAttemptsRef.current.get(participantId) ?? 0) + 1;
      reconnectAttemptsRef.current.set(participantId, attempts);

      if (attempts >= WS_MAX_RECONNECT_ATTEMPTS) {
        shouldReconnectRef.current.delete(participantId);
        reconnectAttemptsRef.current.delete(participantId);
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === participantId
              ? { ...p, hearingOn: false, sessionError: 'Connection lost. Tap the mic to retry.' }
              : p,
          ),
        );
        return;
      }

      const delay = Math.min(WS_BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts - 1), 16000);
      const timeout = setTimeout(() => {
        reconnectTimeoutsRef.current.delete(participantId);
        if (!shouldReconnectRef.current.has(participantId)) return;
        const current = participantsRef.current.find((p) => p.id === participantId);
        if (!current?.session?.wsUrl) return;
        const newWs = connectParticipantWs(participantId, current.session.wsUrl);
        wsMap.current.set(participantId, newWs);
      }, delay);
      reconnectTimeoutsRef.current.set(participantId, timeout);
    };

    return ws;
  }, []);

  const cancelReconnect = useCallback((participantId: string) => {
    shouldReconnectRef.current.delete(participantId);
    reconnectAttemptsRef.current.delete(participantId);
    const timeout = reconnectTimeoutsRef.current.get(participantId);
    if (timeout) { clearTimeout(timeout); reconnectTimeoutsRef.current.delete(participantId); }
  }, []);

  // ── Bridge session per participant ──────────────────────────────────────
  const initBridgeSession = useCallback(async (participantId: string) => {
    const domain = bridgeConfig.domain.trim().replace(/\/$/, '');
    if (!domain) return;

    setParticipants((prev) =>
      prev.map((p) => (p.id === participantId ? { ...p, sessionLoading: true, sessionError: undefined } : p)),
    );

    try {
      const res = await globalThis.fetch(`${domain}/api/bridge/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: bridgeConfig.apiKey,
          tier: 'full-session',
          durationMinutes: bridgeConfig.durationMinutes,
        }),
      });
      if (!res.ok) throw new Error(`Session failed: ${res.status}`);
      const data = await res.json();
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === participantId
            ? { ...p, session: { sessionId: data.sessionId, wsUrl: data.wsUrl, visionUrl: data.visionUrl }, sessionLoading: false }
            : p,
        ),
      );
      return data;
    } catch {
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? { ...p, sessionLoading: false } : p)),
      );
      return null;
    }
  }, [bridgeConfig]);

  const teardownParticipantSession = useCallback((participantId: string) => {
    cancelReconnect(participantId);
    const ws = wsMap.current.get(participantId);
    if (ws) { ws.close(); wsMap.current.delete(participantId); }
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === participantId
          ? { ...p, session: null, hearingOn: false, cameraOn: false, screenOn: false, sessionError: undefined }
          : p,
      ),
    );
  }, [cancelReconnect]);

  // ── Participant management ──────────────────────────────────────────────
  const addParticipant = useCallback((data: Omit<CouncilParticipant, 'id' | 'session' | 'sessionLoading' | 'hearingOn' | 'cameraOn' | 'screenOn' | 'isAutoLoaded' | 'sessionError'>) => {
    setParticipants((prev) => {
      const usedColors = new Set(prev.map((p) => p.color));
      const color = data.color || COUNCIL_COLORS.find((c) => !usedColors.has(c)) || COUNCIL_COLORS[prev.length % COUNCIL_COLORS.length];
      const newParticipant: CouncilParticipant = {
        ...data,
        color,
        id: genId(),
        isAutoLoaded: false,
        session: null,
        sessionLoading: false,
        hearingOn: false,
        cameraOn: false,
        screenOn: false,
      };
      return [...prev, newParticipant];
    });
  }, []);

  const removeParticipant = useCallback((id: string) => {
    teardownParticipantSession(id);
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        role: 'system',
        content: 'A participant left the council.',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, [teardownParticipantSession]);

  // ── Audio (shared recording, distributed) ──────────────────────────────
  const stopAudio = useCallback(async () => {
    if (hearingIntervalRef.current) {
      clearInterval(hearingIntervalRef.current);
      hearingIntervalRef.current = null;
    }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
  }, []);

  const startSharedAudio = useCallback(async (activeParticipants: CouncilParticipant[]) => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const recordChunk = async () => {
      const openWs = activeParticipants
        .map((p) => wsMap.current.get(p.id))
        .filter((ws): ws is WebSocket => !!ws && ws.readyState === WebSocket.OPEN);
      if (openWs.length === 0) return;

      const rec = new Audio.Recording();
      try {
        await rec.prepareToRecordAsync(RECORDING_OPTIONS);
        await rec.startAsync();
        recordingRef.current = rec;
        await new Promise((r) => setTimeout(r, CHUNK_MS));
        await rec.stopAndUnloadAsync();
        recordingRef.current = null;
        const uri = rec.getURI();
        if (uri) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
          openWs.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
            }
          });
          try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
        }
      } catch {
        recordingRef.current = null;
      }
    };

    recordChunk();
    hearingIntervalRef.current = setInterval(recordChunk, CHUNK_MS + 200);
  }, []);

  const restartAudioIfNeeded = useCallback(async (nextParticipants: CouncilParticipant[]) => {
    const hearingOnes = nextParticipants.filter((p) => p.hearingOn);
    await stopAudio();
    if (hearingOnes.length > 0) {
      await startSharedAudio(hearingOnes);
    }
  }, [stopAudio, startSharedAudio]);

  // ── Toggle senses ──────────────────────────────────────────────────────
  const toggleHearing = useCallback(async (participantId: string) => {
    let currentParticipant = participants.find((p) => p.id === participantId);
    if (!currentParticipant) return;

    // Clear any prior error when the user manually retries
    if (currentParticipant.sessionError) {
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? { ...p, sessionError: undefined } : p)),
      );
      currentParticipant = { ...currentParticipant, sessionError: undefined };
    }

    let session = currentParticipant.session;
    if (!session && !currentParticipant.hearingOn) {
      session = await initBridgeSession(participantId);
      if (!session) return;
      currentParticipant = { ...currentParticipant, session };
    }

    const nextOn = !currentParticipant.hearingOn;

    if (nextOn && session) {
      shouldReconnectRef.current.add(participantId);
      reconnectAttemptsRef.current.delete(participantId);
      const ws = connectParticipantWs(participantId, session.wsUrl);
      wsMap.current.set(participantId, ws);
    } else {
      cancelReconnect(participantId);
      const ws = wsMap.current.get(participantId);
      if (ws) { ws.close(); wsMap.current.delete(participantId); }
    }

    const nextParticipants = participants.map((p) =>
      p.id === participantId ? { ...p, session: session ?? p.session, hearingOn: nextOn, sessionError: undefined } : p,
    );
    setParticipants(nextParticipants);
    await restartAudioIfNeeded(nextParticipants);
  }, [participants, initBridgeSession, connectParticipantWs, cancelReconnect, restartAudioIfNeeded]);

  const toggleCamera = useCallback(async (participantId: string) => {
    const p = participants.find((x) => x.id === participantId);
    if (!p) return;
    let session = p.session;
    if (!session && !p.cameraOn) {
      session = await initBridgeSession(participantId);
    }
    setParticipants((prev) =>
      prev.map((x) =>
        x.id === participantId ? { ...x, session: session ?? x.session, cameraOn: !x.cameraOn } : x,
      ),
    );
  }, [participants, initBridgeSession]);

  const toggleScreen = useCallback(async (participantId: string) => {
    const p = participants.find((x) => x.id === participantId);
    if (!p) return;
    let session = p.session;
    if (!session && !p.screenOn) {
      session = await initBridgeSession(participantId);
    }
    setParticipants((prev) =>
      prev.map((x) =>
        x.id === participantId ? { ...x, session: session ?? x.session, screenOn: !x.screenOn } : x,
      ),
    );
  }, [participants, initBridgeSession]);

  // ── Vision frames ──────────────────────────────────────────────────────
  const sendVisionFrameToAll = useCallback(async (
    imageData: string,
    source: 'camera' | 'screen',
    participantIds?: string[],
  ) => {
    const targets = participants.filter((p) => {
      if (participantIds && !participantIds.includes(p.id)) return false;
      return source === 'camera' ? p.cameraOn : p.screenOn;
    });
    await Promise.all(
      targets.map(async (p) => {
        if (!p.session) return;
        try {
          await globalThis.fetch(p.session.visionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: p.session.sessionId,
              imageData,
              prompt: source === 'screen' ? 'Describe what you see on this screen.' : 'What do you observe?',
              isFirstFrame: false,
            }),
          });
        } catch {}
      }),
    );
  }, [participants]);

  // ── Message sending ─────────────────────────────────────────────────────
  const sendUserMessage = useCallback(async (text: string, mentionedIds: string[]) => {
    if (!text.trim()) return;

    const userMsg: CouncilMessage = {
      id: genId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    const targets = mentionedIds.length > 0
      ? participants.filter((p) => mentionedIds.includes(p.id))
      : [];

    if (targets.length === 0) {
      setIsSending(false);
      return;
    }

    await Promise.all(
      targets.map(async (participant) => {
        const streamId = genId();
        setMessages((prev) => [
          ...prev,
          {
            id: streamId,
            role: 'ai',
            participantId: participant.id,
            participantName: participant.displayName,
            participantColor: participant.color,
            content: '',
            timestamp: new Date().toLocaleTimeString(),
            streaming: true,
          },
        ]);

        const historyMessages: ChatMessage[] = messages
          .filter((m) => m.role === 'user' || (m.role === 'ai' && m.participantId === participant.id))
          .map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          }));
        historyMessages.push({ role: 'user', content: text.trim() });

        let accumulated = '';

        try {
          const resp = await callParticipantAI(participant, historyMessages);
          if (!resp.ok) {
            const errHint =
              resp.status === 401 || resp.status === 403
                ? 'API key invalid or unauthorized — check your key in Connect settings.'
                : resp.status === 404
                ? 'Endpoint not found — check the base URL in Connect settings.'
                : resp.status === 429
                ? 'Rate limited — slow down or check your quota.'
                : resp.status >= 500
                ? `Server error (${resp.status}) — the AI provider is having issues, try again.`
                : `Request failed (${resp.status}) — check your connection settings.`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamId
                  ? { ...m, content: `⚠️ ${errHint}`, streaming: false }
                  : m,
              ),
            );
            return;
          }

          await streamSSE(
            resp,
            (chunk) => {
              accumulated += chunk;
              setMessages((prev) =>
                prev.map((m) => (m.id === streamId ? { ...m, content: accumulated } : m)),
              );
            },
            () => {
              setMessages((prev) =>
                prev.map((m) => (m.id === streamId ? { ...m, streaming: false } : m)),
              );
            },
            (err) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamId ? { ...m, content: `Error: ${err}`, streaming: false } : m,
                ),
              );
            },
          );
        } catch (e: any) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId
                ? { ...m, content: `Error: ${e?.message ?? 'Unknown'}`, streaming: false }
                : m,
            ),
          );
        }
      }),
    );

    setIsSending(false);
  }, [participants, messages]);

  const clearMessages = useCallback(() => {
    const cleared: CouncilMessage[] = [{
      id: genId(),
      role: 'system',
      content: 'Council session cleared.',
      timestamp: new Date().toLocaleTimeString(),
    }];
    setMessages(cleared);
    AsyncStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(cleared)).catch(() => {});
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAudio();
      // Cancel all pending reconnects
      reconnectTimeoutsRef.current.forEach((t) => clearTimeout(t));
      reconnectTimeoutsRef.current.clear();
      shouldReconnectRef.current.clear();
      reconnectAttemptsRef.current.clear();
      wsMap.current.forEach((ws) => ws.close());
      wsMap.current.clear();
    };
  }, []);

  return (
    <CouncilCtx.Provider value={{
      participants,
      messages,
      isSending,
      addParticipant,
      removeParticipant,
      sendUserMessage,
      toggleHearing,
      toggleCamera,
      toggleScreen,
      sendVisionFrameToAll,
      clearMessages,
    }}>
      {children}
    </CouncilCtx.Provider>
  );
}
