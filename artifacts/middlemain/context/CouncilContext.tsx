import AsyncStorage from '@react-native-async-storage/async-storage';
import { serverAuthHeaders } from '@/utils/serverAuth';
import { streamSSE } from '@/utils/streamSSE';
import { appHelpContext } from '@/utils/appHelp';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
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
const MAX_STORED_MESSAGES = 200;
const STORAGE_MANUAL_PARTICIPANTS_KEY = 'council_manual_participants_v1';
const STORAGE_WEBHOOK_URL_KEY = 'council_webhook_url_v1';
const STORAGE_HISTORY_LIMIT_KEY = 'council_history_limit_v1';
const STORAGE_API_URL_KEY = '@middlemain/apiUrl';

// Module-level cache kept in sync by CouncilProvider so async callbacks
// (which capture stale closures) always see the current API base URL.
let _cachedApiUrl = '';

// Number of AI exchanges between webhook digests
const WEBHOOK_EXCHANGE_INTERVAL = 5;
// Max messages included in each digest payload
const WEBHOOK_DIGEST_MAX_MESSAGES = 30;

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
  replyToId?: string;
}

interface CouncilContextValue {
  participants: CouncilParticipant[];
  messages: CouncilMessage[];
  isSending: boolean;
  isAutoRunning: boolean;
  autoRound: number;
  /** Configured webhook URL for outbound council digests. */
  webhookUrl: string;
  /** Update and persist the webhook URL. */
  setWebhookUrl: (url: string) => Promise<void>;
  /** Fire a test digest to the configured webhook URL. Returns success flag + optional error. */
  testWebhook: () => Promise<{ ok: boolean; error?: string }>;
  addParticipant: (data: Omit<CouncilParticipant, 'id' | 'session' | 'sessionLoading' | 'hearingOn' | 'cameraOn' | 'screenOn' | 'isAutoLoaded' | 'sessionError'>) => void;
  removeParticipant: (id: string) => void;
  sendUserMessage: (text: string, mentionedIds: string[], replyToId?: string) => Promise<void>;
  startAutonomousSession: (kickoff: string, maxRounds?: number) => Promise<void>;
  stopAutonomousSession: () => void;
  toggleHearing: (participantId: string) => Promise<void>;
  toggleCamera: (participantId: string) => void;
  toggleScreen: (participantId: string) => void;
  sendVisionFrameToAll: (imageData: string, source: 'camera' | 'screen', participantIds?: string[]) => Promise<void>;
  historyLimit: number;
  setHistoryLimit: (limit: number) => Promise<void>;
  /** The base API URL (e.g. https://xxx.replit.dev/api). Persisted in AsyncStorage. */
  apiUrl: string;
  setApiUrl: (url: string) => Promise<void>;
  clearMessages: () => void;
  /** Inject a system message directly into the council feed (no AI response triggered). */
  injectSystemMessage: (content: string) => void;
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
  if (_cachedApiUrl) return _cachedApiUrl;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return '/api';
}

async function getParticipantErrorHint(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  const errorCode = payload?.error?.code ?? payload?.code;

  if (errorCode === 'XAI_KEY_MISSING') {
    return 'Server Grok is not set up yet. Add your xAI key in Settings → Middlemain Executive API.';
  }
  if (errorCode === 'XAI_KEY_REJECTED') {
    return 'The server xAI key was rejected. Update it in Settings → Middlemain Executive API.';
  }
  if (response.status === 401 || response.status === 403) {
    return 'API key invalid or unauthorized — check your key in Connect settings.';
  }
  if (response.status === 404) return 'Endpoint not found — check the base URL in Connect settings.';
  if (response.status === 429) return 'Rate limited — slow down or check your quota.';
  if (response.status >= 500) return 'The AI provider is temporarily unavailable. Try again shortly.';
  return 'The request failed. Check your connection settings and try again.';
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

function buildAutonomousHistory(
  participant: CouncilParticipant,
  allMessages: CouncilMessage[],
  round: number,
  allParticipants: CouncilParticipant[],
): ChatMessage[] {
  const raw: ChatMessage[] = [];

  for (const m of allMessages) {
    if (m.role === 'system') continue;
    if (m.streaming) continue;
    if (!m.content.trim()) continue;

    if (m.role === 'user') {
      raw.push({ role: 'user', content: m.content });
    } else if (m.role === 'ai') {
      if (m.participantId === participant.id) {
        raw.push({ role: 'assistant', content: m.content });
      } else {
        raw.push({ role: 'user', content: `[${m.participantName ?? 'Agent'}]: ${m.content}` });
      }
    }
  }

  const otherNames = allParticipants
    .filter((p) => p.id !== participant.id)
    .map((p) => p.displayName)
    .join(', ');

  raw.push({
    role: 'user',
    content: `[Auto Round ${round} — your turn, ${participant.displayName}] You are collaborating with ${otherNames}. Build on what's been shared above. Be specific and actionable. Ask follow-up questions by name if you need more detail from another agent.`,
  });

  // Merge consecutive same-role messages (Anthropic requires strict alternation)
  const merged: ChatMessage[] = [];
  for (const msg of raw) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1] = {
        ...merged[merged.length - 1],
        content: merged[merged.length - 1].content + '\n\n' + msg.content,
      };
    } else {
      merged.push({ ...msg });
    }
  }

  return merged;
}

async function callParticipantAI(
  participant: CouncilParticipant,
  messages: ChatMessage[],
): Promise<Response> {
  const question = messages[messages.length - 1]?.content;
  const help = typeof question === 'string' ? appHelpContext(question) : '';
  if (help) participant = { ...participant, systemPrompt: [participant.systemPrompt, help].filter(Boolean).join('\n\n') };
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
        ...(participant.systemPrompt ? { system: participant.systemPrompt } : {}),
        messages,
      }),
    });
  }
  if (participant.provider === 'server') {
    const base = participant.baseUrl || getServerBase();
    return fetch(`${base}/grok/chat`, {
      method: 'POST',
      headers: await serverAuthHeaders(base, participant.apiKey),
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
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoRound, setAutoRound] = useState(0);
  const [webhookUrl, setWebhookUrlState] = useState('');
  const [historyLimit, setHistoryLimitState] = useState(MAX_STORED_MESSAGES);
  const [apiUrl, setApiUrlState] = useState('');
  const hasWarnedTrimRef = useRef(false);

  // Tracks whether we've finished loading from AsyncStorage; gates saves so
  // we don't overwrite stored data before hydration completes.
  const hydratedRef = useRef(false);

  // Counts completed AI exchanges since the last webhook digest was fired
  const exchangeCountRef = useRef(0);

  const wsMap = useRef<Map<string, WebSocket>>(new Map());
  const recordingRef = useRef<Audio.Recording | null>(null);
  const hearingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef(false);

  // Mirror participants + messages into refs so async closures always see current state
  const participantsRef = useRef<CouncilParticipant[]>([]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  const messagesRef = useRef<CouncilMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Track which participants should auto-reconnect (hearing is ON) and reconnect attempts
  const shouldReconnectRef = useRef<Set<string>>(new Set());
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const reconnectTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Hydrate from AsyncStorage on mount ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedMessages, storedParticipants, storedWebhookUrl, storedHistoryLimit, storedApiUrl] = await Promise.all([
          AsyncStorage.getItem(STORAGE_MESSAGES_KEY),
          AsyncStorage.getItem(STORAGE_MANUAL_PARTICIPANTS_KEY),
          AsyncStorage.getItem(STORAGE_WEBHOOK_URL_KEY),
          AsyncStorage.getItem(STORAGE_HISTORY_LIMIT_KEY),
          AsyncStorage.getItem(STORAGE_API_URL_KEY),
        ]);

        if (cancelled) return;

        if (storedMessages) {
          const parsed: CouncilMessage[] = JSON.parse(storedMessages);
          // Drop mid-stream placeholders; cap legacy oversized storage
          const cleaned = parsed
            .slice(-MAX_STORED_MESSAGES)
            .map((m) => ({ ...m, streaming: false }));
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

        if (storedWebhookUrl) {
          setWebhookUrlState(storedWebhookUrl);
        }

        if (storedHistoryLimit !== null) {
          const parsed = parseInt(storedHistoryLimit, 10);
          if (!isNaN(parsed)) setHistoryLimitState(parsed);
        }

        if (storedApiUrl) {
          _cachedApiUrl = storedApiUrl;
          setApiUrlState(storedApiUrl);
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
    const limit = historyLimit > 0 ? historyLimit : undefined;
    const toSave = messages
      .filter((m) => !m.streaming)
      .slice(limit ? -limit : undefined)
      .map((m) => ({ ...m, streaming: false }));
    AsyncStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [messages, historyLimit]);

  // ── Warn once when history limit is reached ──────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current || historyLimit === 0) return;
    const realCount = messages.filter((m) => !m.streaming && m.id !== 'trim-warning').length;
    if (realCount >= historyLimit && !hasWarnedTrimRef.current) {
      hasWarnedTrimRef.current = true;
      setMessages((prev) => {
        if (prev.some((m) => m.id === 'trim-warning')) return prev;
        return [
          ...prev,
          {
            id: 'trim-warning',
            role: 'system' as const,
            content: `⚠️ History limit reached (${historyLimit} messages). Older messages will be dropped when you close the app. Change this in Settings → Council History.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ];
      });
    }
  }, [messages.length, historyLimit]);

  // ── Persist manual participants whenever they change ────────────────────
  useEffect(() => {
    if (!hydratedRef.current) return;
    const manualParticipants = participants.filter((p) => !p.isAutoLoaded);
    const toSave: PersistedParticipant[] = manualParticipants.map(({ id, connectionId, displayName, provider, apiKey, model, baseUrl, systemPrompt, color }) => ({
      id, connectionId, displayName, provider, apiKey, model, baseUrl, systemPrompt, color,
    }));
    AsyncStorage.setItem(STORAGE_MANUAL_PARTICIPANTS_KEY, JSON.stringify(toSave)).catch(() => {});
  }, [participants]);

  // cancelReconnect is declared here (before the auto-load effect) so the effect
  // can reference it without hitting the temporal dead zone. It only touches refs
  // so it has no ordering dependency on connectParticipantWs.
  const cancelReconnect = useCallback((participantId: string) => {
    shouldReconnectRef.current.delete(participantId);
    reconnectAttemptsRef.current.delete(participantId);
    const timeout = reconnectTimeoutsRef.current.get(participantId);
    if (timeout) { clearTimeout(timeout); reconnectTimeoutsRef.current.delete(participantId); }
  }, []);

  // ── Webhook helpers ─────────────────────────────────────────────────────

  /** Persist a new webhook URL to state + AsyncStorage. */
  const setWebhookUrl = useCallback(async (url: string) => {
    setWebhookUrlState(url);
    await AsyncStorage.setItem(STORAGE_WEBHOOK_URL_KEY, url).catch(() => {});
  }, []);

  /** Update and persist the history limit. Resets the trim warning so it can fire again if needed. */
  const setHistoryLimit = useCallback(async (limit: number) => {
    hasWarnedTrimRef.current = false;
    setHistoryLimitState(limit);
    await AsyncStorage.setItem(STORAGE_HISTORY_LIMIT_KEY, String(limit)).catch(() => {});
  }, []);

  /** Update and persist the API base URL. */
  const setApiUrl = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/$/, '');
    _cachedApiUrl = trimmed;
    setApiUrlState(trimmed);
    await AsyncStorage.setItem(STORAGE_API_URL_KEY, trimmed).catch(() => {});
  }, []);

  /**
   * Build and POST a digest to the configured webhook URL.
   * `trigger` describes what caused the fire.
   */
  const fireWebhookDigest = useCallback(async (
    trigger: 'interval' | 'auto-session-end' | 'test',
    currentMessages: CouncilMessage[],
    currentParticipants: CouncilParticipant[],
    overrideUrl?: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const url = (overrideUrl ?? webhookUrl).trim();
    if (!url) return { ok: false, error: 'No webhook URL configured' };

    const nonStreaming = currentMessages.filter((m) => !m.streaming);
    const digest = {
      trigger,
      exchangeCount: exchangeCountRef.current,
      sentAt: new Date().toISOString(),
      participants: currentParticipants.map((p) => ({
        name: p.displayName,
        model: p.model,
        provider: p.provider,
      })),
      messages: nonStreaming
        .slice(-WEBHOOK_DIGEST_MAX_MESSAGES)
        .map((m) => ({
          role: m.role,
          participantName: m.participantName,
          content: m.content,
          timestamp: m.timestamp,
        })),
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: /\/executive\/webhook\/(?:council|test)$/.test(url)
          ? await serverAuthHeaders(url.replace(/\/executive\/webhook\/(?:council|test)$/, ''))
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify(digest),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { ok: false, error: `HTTP ${resp.status}${text ? ': ' + text.slice(0, 120) : ''}` };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Network error' };
    }
  }, [webhookUrl]);

  /** Send a test ping to the configured webhook URL. */
  const testWebhook = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    return fireWebhookDigest('test', messagesRef.current, participantsRef.current);
  }, [fireWebhookDigest]);

  // ── Auto-load connected AIs ─────────────────────────────────────────────
  // This effect is intentionally NOT guarded by an initializedRef so it always
  // re-syncs when connections change or when the provider remounts (e.g. hot
  // reload or navigation stack reset). It only touches auto-loaded participants,
  // so manually-added ones are preserved.
  useEffect(() => {
    // Tear down bridge sessions for auto-loaded participants whose connection
    // was deleted. We read from the ref so we don't need participants as a dep.
    const connectionIds = new Set(connections.map((c) => c.id));
    participantsRef.current
      .filter((p) => p.isAutoLoaded && p.connectionId && !connectionIds.has(p.connectionId))
      .forEach((p) => {
        cancelReconnect(p.id);
        const ws = wsMap.current.get(p.id);
        if (ws) { ws.close(); wsMap.current.delete(p.id); }
      });

    setParticipants((prev) => {
      // Keep manually-added participants
      const manual = prev.filter((p) => !p.isAutoLoaded);

      // Build the new auto-loaded list from current connections, preserving
      // existing participant IDs so bridge sessions / WS refs are not orphaned.
      // Mutable connection fields (name, model, apiKey, etc.) are always synced
      // from the latest connection so edits are immediately reflected.
      const autoParticipants: CouncilParticipant[] = connections.map((conn, idx) => {
        const existing = prev.find((p) => p.isAutoLoaded && p.connectionId === conn.id);
        if (existing) {
          return {
            ...existing,
            displayName: conn.name,
            provider: conn.provider,
            apiKey: conn.apiKey,
            model: conn.model,
            baseUrl: conn.baseUrl,
            systemPrompt: conn.systemPrompt || 'You are a helpful AI assistant.',
          };
        }
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
  }, [connections, cancelReconnect]);

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
        const displayName =
          participantsRef.current.find((p) => p.id === participantId)?.displayName ?? 'A participant';
        setMessages((prev) => [
          ...prev,
          {
            id: genId(),
            role: 'system',
            content: `${displayName} lost connection. Tap the mic to retry.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
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
          apiKey: bridgeConfig.apiKey.trim(),
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
  const sendUserMessage = useCallback(async (text: string, mentionedIds: string[], replyToId?: string) => {
    if (!text.trim()) return;

    const userMsg: CouncilMessage = {
      id: genId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString(),
      replyToId,
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
            replyToId,
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
            const errHint = await getParticipantErrorHint(resp);
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

    // Count this as one exchange (user message + all AI replies = 1)
    exchangeCountRef.current += 1;

    // Fire a webhook digest every WEBHOOK_EXCHANGE_INTERVAL exchanges
    if (
      webhookUrl.trim() &&
      exchangeCountRef.current > 0 &&
      exchangeCountRef.current % WEBHOOK_EXCHANGE_INTERVAL === 0
    ) {
      // Fire and forget — don't block the UI
      const snap = messagesRef.current;
      const parts = participantsRef.current;
      fireWebhookDigest('interval', snap, parts).catch(() => {});
    }

    setIsSending(false);
  }, [participants, messages, webhookUrl, fireWebhookDigest]);

  // ── Autonomous participant turn ──────────────────────────────────────────────
  const sendParticipantAutonomousTurn = useCallback(async (
    participant: CouncilParticipant,
    round: number,
  ) => {
    const streamId = genId();
    const snapshot = messagesRef.current;
    const allParts = participantsRef.current;

    const historyMessages = buildAutonomousHistory(participant, snapshot, round, allParts);

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

    let accumulated = '';
    try {
      const resp = await callParticipantAI(participant, historyMessages);
      if (!resp.ok) {
        const hint = await getParticipantErrorHint(resp);
        setMessages((prev) =>
          prev.map((m) => m.id === streamId ? { ...m, content: `⚠️ ${hint}`, streaming: false } : m),
        );
        return;
      }
      await streamSSE(
        resp,
        (chunk) => {
          accumulated += chunk;
          setMessages((prev) =>
            prev.map((m) => m.id === streamId ? { ...m, content: accumulated } : m),
          );
        },
        () => {
          setMessages((prev) =>
            prev.map((m) => m.id === streamId ? { ...m, streaming: false } : m),
          );
        },
        (err) => {
          setMessages((prev) =>
            prev.map((m) => m.id === streamId ? { ...m, content: `Error: ${err}`, streaming: false } : m),
          );
        },
      );
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId ? { ...m, content: `Error: ${e?.message ?? 'Unknown'}`, streaming: false } : m,
        ),
      );
    }
  }, []);

  // ── Autonomous session orchestrator ─────────────────────────────────────────
  const startAutonomousSession = useCallback(async (kickoff: string, maxRounds = 4) => {
    const pts = participantsRef.current;
    if (pts.length === 0) return;

    autoStopRef.current = false;
    setIsAutoRunning(true);
    setAutoRound(0);

    // Round 0 — send kickoff to all participants simultaneously
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        role: 'system',
        content: `⚡ AUTO SESSION STARTED — ${maxRounds} rounds · ${pts.length} agents`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    await sendUserMessage(kickoff, pts.map((p) => p.id));

    // Give React time to flush streaming completions to messagesRef
    await new Promise((r) => setTimeout(r, 1200));

    // Autonomous rounds — sequential per participant
    for (let round = 1; round <= maxRounds; round++) {
      if (autoStopRef.current) break;
      setAutoRound(round);

      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: 'system',
          content: `⚡ ROUND ${round} / ${maxRounds}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      for (const participant of participantsRef.current) {
        if (autoStopRef.current) break;
        await sendParticipantAutonomousTurn(participant, round);
        if (!autoStopRef.current) await new Promise((r) => setTimeout(r, 900));
      }
    }

    if (!autoStopRef.current) {
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: 'system',
          content: `✅ AUTO SESSION COMPLETE — ${maxRounds} rounds finished`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      // Fire webhook digest at end of auto session
      if (webhookUrl.trim()) {
        const snap = messagesRef.current;
        const parts = participantsRef.current;
        fireWebhookDigest('auto-session-end', snap, parts).catch(() => {});
      }
    }

    setIsAutoRunning(false);
    setAutoRound(0);
  }, [sendUserMessage, sendParticipantAutonomousTurn, webhookUrl, fireWebhookDigest]);

  const stopAutonomousSession = useCallback(() => {
    autoStopRef.current = true;
    setIsAutoRunning(false);
    setAutoRound(0);
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        role: 'system',
        content: '⏹ Auto session stopped.',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

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

  const injectSystemMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        role: 'system',
        content,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
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
      isAutoRunning,
      autoRound,
      webhookUrl,
      setWebhookUrl,
      testWebhook,
      historyLimit,
      setHistoryLimit,
      apiUrl,
      setApiUrl,
      addParticipant,
      removeParticipant,
      sendUserMessage,
      startAutonomousSession,
      stopAutonomousSession,
      toggleHearing,
      toggleCamera,
      toggleScreen,
      sendVisionFrameToAll,
      clearMessages,
      injectSystemMessage,
    }}>
      {children}
    </CouncilCtx.Provider>
  );
}
