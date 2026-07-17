import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { resilientFetch } from '@/utils/resilientFetch';

const WS_PING_INTERVAL_MS = 15_000;
const WS_PING_TIMEOUT_MS = 10_000;
const WS_MAX_RECONNECT_ATTEMPTS = 8;
const WS_RECONNECT_BASE_MS = 1_000;

const DEFAULT_API_KEY = 'bridge_ffeb0d255c586c5dd0be421fd4813f38253c2de106291bc9';
const CONFIG_KEY = '@aie_bridge_config';
const CHUNK_MS = 2500;
const VISION_INTERVAL_MS = 3000;

export type BridgeStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface BridgeMessage {
  type: 'vision_response' | 'transcript' | 'bridge_status' | 'bridge_error';
  content: string;
  source?: 'camera' | 'screen';
}

interface Session {
  sessionId: string;
  wsUrl: string;
  visionUrl: string;
  expiresAt: string;
}

interface Config {
  domain: string;
  apiKey: string;
  durationMinutes: number;
}

interface AisAndEarsContextValue {
  config: Config;
  updateConfig: (patch: Partial<Config>) => void;
  session: Session | null;
  status: BridgeStatus;
  errorMsg: string | null;
  hearingOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleHearing: () => void;
  toggleCamera: () => void;
  toggleScreen: () => void;
  sendVisionFrame: (imageData: string, source: 'camera' | 'screen') => Promise<string | null>;
  subscribe: (cb: (msg: BridgeMessage) => void) => () => void;
}

const AisAndEarsCtx = createContext<AisAndEarsContextValue | null>(null);

export function useAisAndEars() {
  const ctx = useContext(AisAndEarsCtx);
  if (!ctx) throw new Error('useAisAndEars must be inside AisAndEarsProvider');
  return ctx;
}

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

export function AisAndEarsProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<Config>({
    domain: '',
    apiKey: DEFAULT_API_KEY,
    durationMinutes: 30,
  });
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hearingOn, setHearingOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const wsUrlRef = useRef<string | null>(null);
  const wsReconnectAttemptsRef = useRef(0);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsPingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsPingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const hearingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listeners = useRef<Set<(msg: BridgeMessage) => void>>(new Set());

  const emit = useCallback((msg: BridgeMessage) => {
    listeners.current.forEach((cb) => cb(msg));
  }, []);

  const subscribe = useCallback((cb: (msg: BridgeMessage) => void) => {
    listeners.current.add(cb);
    return () => { listeners.current.delete(cb); };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(CONFIG_KEY).then((raw) => {
      if (raw) {
        try { setConfigState((prev) => ({ ...prev, ...JSON.parse(raw) })); } catch {}
      }
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<Config>) => {
    setConfigState((prev) => {
      const next = {
        ...prev,
        ...patch,
        ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey.trim() } : {}),
        ...(patch.domain !== undefined ? { domain: patch.domain.trim() } : {}),
      };
      AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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

  const stopWsPing = useCallback(() => {
    if (wsPingIntervalRef.current) { clearInterval(wsPingIntervalRef.current); wsPingIntervalRef.current = null; }
    if (wsPingTimeoutRef.current) { clearTimeout(wsPingTimeoutRef.current); wsPingTimeoutRef.current = null; }
  }, []);

  const setupWebSocket = useCallback((wsUrl: string) => {
    if (!shouldReconnectRef.current) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      wsReconnectAttemptsRef.current = 0;
      // Keepalive ping every 15s
      stopWsPing();
      wsPingIntervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
        wsPingTimeoutRef.current = setTimeout(() => {
          emit({ type: 'bridge_status', content: '⚠ Bridge ping timeout — reconnecting…' });
          ws.close();
        }, WS_PING_TIMEOUT_MS);
      }, WS_PING_INTERVAL_MS);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'pong') {
          if (wsPingTimeoutRef.current) { clearTimeout(wsPingTimeoutRef.current); wsPingTimeoutRef.current = null; }
          return;
        }
        if (msg.type === 'response.audio_transcript.done' && msg.transcript) {
          emit({ type: 'transcript', content: msg.transcript });
        }
      } catch {}
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      stopWsPing();
      if (!shouldReconnectRef.current) return;
      const attempts = wsReconnectAttemptsRef.current;
      if (attempts >= WS_MAX_RECONNECT_ATTEMPTS) {
        emit({ type: 'bridge_error', content: 'Bridge audio stream: max reconnect attempts reached.' });
        shouldReconnectRef.current = false;
        return;
      }
      const delay = Math.min(WS_RECONNECT_BASE_MS * Math.pow(2, attempts), 30_000);
      wsReconnectAttemptsRef.current = attempts + 1;
      emit({ type: 'bridge_status', content: `↺ Audio stream dropped — reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${attempts + 1})…` });
      wsReconnectTimerRef.current = setTimeout(() => setupWebSocket(wsUrl), delay);
    };
  }, [emit, stopWsPing]);

  const disconnect = useCallback(async () => {
    shouldReconnectRef.current = false;
    stopWsPing();
    if (wsReconnectTimerRef.current) { clearTimeout(wsReconnectTimerRef.current); wsReconnectTimerRef.current = null; }
    await stopAudio();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    wsUrlRef.current = null;
    wsReconnectAttemptsRef.current = 0;
    setSession(null);
    setStatus('idle');
    setHearingOn(false);
    setCameraOn(false);
    setScreenOn(false);
    emit({ type: 'bridge_status', content: 'Disconnected from AIs & Ears.' });
  }, [stopAudio, stopWsPing, emit]);

  const connect = useCallback(async () => {
    const domain = config.domain.trim().replace(/\/$/, '');
    if (!domain) {
      setErrorMsg('Enter the AIs & Ears app URL first.');
      setStatus('error');
      return;
    }
    setStatus('connecting');
    setErrorMsg(null);
    try {
      const res = await resilientFetch(
        `${domain}/api/bridge/session`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: config.apiKey.trim(),
            tier: 'full-session',
            durationMinutes: config.durationMinutes,
          }),
        },
        { timeoutMs: 12_000, retries: 3, retryBaseMs: 1_000 },
      );
      if (!res.ok) throw new Error(`Session failed: ${res.status}`);
      const data: Session = await res.json();
      setSession(data);
      setStatus('connected');
      wsUrlRef.current = data.wsUrl;
      shouldReconnectRef.current = true;
      wsReconnectAttemptsRef.current = 0;
      emit({ type: 'bridge_status', content: `✓ AIs & Ears bridge active · session ${data.sessionId.slice(0, 8)}…` });
      setupWebSocket(data.wsUrl);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Connection failed');
      emit({ type: 'bridge_error', content: `Bridge error: ${err.message}` });
    }
  }, [config, emit, setupWebSocket]);

  const sendVisionFrame = useCallback(async (imageData: string, source: 'camera' | 'screen'): Promise<string | null> => {
    if (!session) return null;
    try {
      const res = await resilientFetch(
        session.visionUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            imageData,
            prompt: source === 'screen' ? 'Describe what you see on this screen.' : 'What do you observe?',
            isFirstFrame: false,
          }),
        },
        { timeoutMs: 12_000, retries: 2, retryBaseMs: 800 },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const msg = data.message ?? null;
      if (msg) emit({ type: 'vision_response', content: msg, source });
      return msg;
    } catch {
      return null;
    }
  }, [session, emit]);

  const startAudioChunks = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const { status: permStatus } = await Audio.requestPermissionsAsync();
    if (permStatus !== 'granted') {
      emit({ type: 'bridge_error', content: 'Microphone permission denied.' });
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const recordChunk = async () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const rec = new Audio.Recording();
      try {
        await rec.prepareToRecordAsync(RECORDING_OPTIONS);
        await rec.startAsync();
        recordingRef.current = rec;
        await new Promise((r) => setTimeout(r, CHUNK_MS));
        await rec.stopAndUnloadAsync();
        recordingRef.current = null;
        const uri = rec.getURI();
        if (uri && wsRef.current?.readyState === WebSocket.OPEN) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
          wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
          try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
        }
      } catch {
        recordingRef.current = null;
      }
    };

    recordChunk();
    hearingIntervalRef.current = setInterval(recordChunk, CHUNK_MS + 200);
  }, [emit]);

  const toggleHearing = useCallback(async () => {
    if (!session) { emit({ type: 'bridge_error', content: 'Connect to AIs & Ears first.' }); return; }
    if (hearingOn) {
      await stopAudio();
      setHearingOn(false);
      emit({ type: 'bridge_status', content: '🎤 Hearing off.' });
    } else {
      setHearingOn(true);
      emit({ type: 'bridge_status', content: '🎤 Hearing on — sending audio to Leo.' });
      await startAudioChunks();
    }
  }, [hearingOn, session, stopAudio, startAudioChunks, emit]);

  const toggleCamera = useCallback(() => {
    if (!session) { emit({ type: 'bridge_error', content: 'Connect to AIs & Ears first.' }); return; }
    setCameraOn((v) => {
      const next = !v;
      emit({ type: 'bridge_status', content: next ? '👁 Camera on — Leo can see you.' : '👁 Camera off.' });
      return next;
    });
  }, [session, emit]);

  const toggleScreen = useCallback(() => {
    if (!session) { emit({ type: 'bridge_error', content: 'Connect to AIs & Ears first.' }); return; }
    setScreenOn((v) => {
      const next = !v;
      emit({ type: 'bridge_status', content: next ? '🖥 Screen share on — Leo can see your screen.' : '🖥 Screen share off.' });
      return next;
    });
  }, [session, emit]);

  useEffect(() => {
    return () => { disconnect(); };
  }, []);

  return (
    <AisAndEarsCtx.Provider value={{
      config, updateConfig,
      session, status, errorMsg,
      hearingOn, cameraOn, screenOn,
      connect, disconnect,
      toggleHearing, toggleCamera, toggleScreen,
      sendVisionFrame, subscribe,
    }}>
      {children}
    </AisAndEarsCtx.Provider>
  );
}
