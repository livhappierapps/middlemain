import AsyncStorage from '@react-native-async-storage/async-storage';
import { resilientFetch } from '@/utils/resilientFetch';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetch } from 'expo/fetch';

export type AIProvider = 'xai' | 'openai' | 'anthropic' | 'custom' | 'server';

export interface AIConnection {
  id: string;
  name: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  visionModel?: string;
  baseUrl?: string;
  systemPrompt: string;
  isActive: boolean;
  lastTested?: string;
  testStatus?: 'ok' | 'error' | 'untested';
}

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: string;
  content: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string; visionModel: string; label: string }> = {
  xai:       { baseUrl: 'https://api.x.ai/v1',             model: 'grok-3',                       visionModel: 'grok-2-vision-1212',      label: 'Grok (xAI)' },
  openai:    { baseUrl: 'https://api.openai.com/v1',       model: 'gpt-4o',                       visionModel: 'gpt-4o',                  label: 'OpenAI' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1',    model: 'claude-3-5-sonnet-20241022',   visionModel: 'claude-3-5-sonnet-20241022', label: 'Anthropic' },
  custom:    { baseUrl: '',                                 model: '',                             visionModel: '',                        label: 'Custom API' },
  server:    { baseUrl: '',                                 model: 'grok-3',                       visionModel: 'grok-2-vision-1212',      label: 'Dev Server (Grok)' },
};

function getServerBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return '/api';
}

function pickModel(conn: AIConnection, hasImage: boolean): string {
  if (!hasImage) return conn.model;
  return conn.visionModel
    || PROVIDER_DEFAULTS[conn.provider]?.visionModel
    || conn.model;
}

interface AIContextValue {
  connections: AIConnection[];
  activeConnection: AIConnection | null;
  serverGrokAvailable: boolean;
  addConnection: (conn: Omit<AIConnection, 'id'>) => string;
  updateConnection: (id: string, updates: Partial<AIConnection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  addServerGrokConnection: () => string;
  testConnection: (id: string) => Promise<boolean>;
  sendMessage: (
    connectionId: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    imageBase64?: string,
    systemPromptOverride?: string,
  ) => Promise<void>;
  sendMessageWithTools: (
    connectionId: string,
    messages: ChatMessage[],
    tools: OpenAITool[],
    mcpCallTool: (name: string, args: Record<string, any>) => Promise<string>,
    onStatus: (msg: string) => void,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    imageBase64?: string,
    systemPromptOverride?: string,
  ) => Promise<void>;
}

const STORAGE_KEY = '@middlemain_connections';

const AIContext = createContext<AIContextValue>({
  connections: [],
  activeConnection: null,
  serverGrokAvailable: false,
  addConnection: () => '',
  updateConnection: () => {},
  deleteConnection: () => {},
  setActiveConnection: () => {},
  addServerGrokConnection: () => '',
  testConnection: async () => false,
  sendMessage: async () => {},
  sendMessageWithTools: async () => {},
});

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Build a multimodal user message when an image is present */
function buildUserMessage(textContent: string, imageBase64?: string): ChatMessage {
  if (!imageBase64) return { role: 'user', content: textContent };
  return {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      { type: 'text', text: textContent || 'Analyze this image.' },
    ],
  };
}

async function callOpenAICompat(
  conn: AIConnection,
  messages: ChatMessage[],
  stream: boolean,
  imageBase64?: string,
): Promise<Response> {
  const baseUrl = conn.baseUrl || PROVIDER_DEFAULTS[conn.provider].baseUrl;
  const model = pickModel(conn, !!imageBase64);
  const last = messages[messages.length - 1];
  const augmented: ChatMessage[] = [
    ...messages.slice(0, -1),
    buildUserMessage(typeof last.content === 'string' ? last.content : '', imageBase64),
  ];
  return resilientFetch(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          ...(conn.systemPrompt ? [{ role: 'system', content: conn.systemPrompt }] : []),
          ...augmented,
        ],
        stream,
      }),
    },
    { timeoutMs: stream ? 60_000 : 30_000, retries: 3, retryBaseMs: 1_200 },
  );
}

async function callAnthropic(
  conn: AIConnection,
  messages: ChatMessage[],
  stream: boolean,
  imageBase64?: string,
): Promise<Response> {
  const baseUrl = conn.baseUrl || PROVIDER_DEFAULTS.anthropic.baseUrl;
  const last = messages[messages.length - 1];
  const augmentedLast: ChatMessage = imageBase64
    ? {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
        ],
      }
    : last;
  return resilientFetch(
    `${baseUrl}/messages`,
    {
      method: 'POST',
      headers: { 'x-api-key': conn.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: pickModel(conn, !!imageBase64),
        max_tokens: 2048,
        stream,
        messages: [...messages.slice(0, -1), augmentedLast],
      }),
    },
    { timeoutMs: stream ? 60_000 : 30_000, retries: 3, retryBaseMs: 1_200 },
  );
}

async function callServerProxy(
  conn: AIConnection,
  messages: ChatMessage[],
  stream: boolean,
  imageBase64?: string,
): Promise<Response> {
  const base = conn.baseUrl || getServerBase();
  const last = messages[messages.length - 1];
  return resilientFetch(
    `${base}/grok/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: imageBase64 ? (conn.visionModel || 'grok-2-vision-1212') : (conn.model || 'grok-3'),
        messages: [...messages.slice(0, -1), buildUserMessage(
          typeof last.content === 'string' ? last.content : '',
          imageBase64,
        )],
        stream,
        systemPrompt: conn.systemPrompt,
      }),
    },
    { timeoutMs: stream ? 60_000 : 30_000, retries: 3, retryBaseMs: 1_200 },
  );
}

async function callAI(
  conn: AIConnection,
  messages: ChatMessage[],
  stream: boolean,
  imageBase64?: string,
): Promise<Response> {
  if (conn.provider === 'anthropic') return callAnthropic(conn, messages, stream, imageBase64);
  if (conn.provider === 'server') return callServerProxy(conn, messages, stream, imageBase64);
  return callOpenAICompat(conn, messages, stream, imageBase64);
}

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

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [serverGrokAvailable, setServerGrokAvailable] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) { try { setConnections(JSON.parse(data)); } catch {} }
    });
    fetch(`${getServerBase()}/grok/status`)
      .then((r) => r.json())
      .then((json: any) => setServerGrokAvailable(json?.configured === true))
      .catch(() => setServerGrokAvailable(false));
  }, []);

  const persist = useCallback((conns: AIConnection[]) => {
    setConnections(conns);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(conns));
  }, []);

  const addConnection = useCallback(
    (conn: Omit<AIConnection, 'id'>): string => {
      const id = genId();
      persist([...connections, { ...conn, id }]);
      return id;
    },
    [connections, persist],
  );

  const updateConnection = useCallback(
    (id: string, updates: Partial<AIConnection>) =>
      persist(connections.map((c) => (c.id === id ? { ...c, ...updates } : c))),
    [connections, persist],
  );

  const deleteConnection = useCallback(
    (id: string) => persist(connections.filter((c) => c.id !== id)),
    [connections, persist],
  );

  const setActiveConnection = useCallback(
    (id: string) => persist(connections.map((c) => ({ ...c, isActive: c.id === id }))),
    [connections, persist],
  );

  const addServerGrokConnection = useCallback((): string => {
    const existing = connections.find((c) => c.provider === 'server');
    if (existing) {
      persist(connections.map((c) => ({ ...c, isActive: c.id === existing.id })));
      return existing.id;
    }
    const id = genId();
    persist([
      ...connections.map((c) => ({ ...c, isActive: false })),
      {
        id, name: "Dev's Grok (Server)", provider: 'server', apiKey: '',
        model: 'grok-3', visionModel: 'grok-2-vision-1212',
        baseUrl: getServerBase(),
        systemPrompt: 'You are a helpful AI development assistant.',
        isActive: true, testStatus: 'untested',
      },
    ]);
    return id;
  }, [connections, persist]);

  const testConnection = useCallback(
    async (id: string): Promise<boolean> => {
      const conn = connections.find((c) => c.id === id);
      if (!conn) return false;
      try {
        const resp = await callAI(conn, [{ role: 'user', content: 'Reply with one word: online' }], false);
        const ok = resp.ok;
        updateConnection(id, { testStatus: ok ? 'ok' : 'error', lastTested: new Date().toISOString() });
        return ok;
      } catch {
        updateConnection(id, { testStatus: 'error', lastTested: new Date().toISOString() });
        return false;
      }
    },
    [connections, updateConnection],
  );

  const sendMessage = useCallback(
    async (
      connectionId: string,
      messages: ChatMessage[],
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
      imageBase64?: string,
      systemPromptOverride?: string,
    ) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) { onError('Connection not found'); return; }
      const effectiveConn = systemPromptOverride
        ? { ...conn, systemPrompt: systemPromptOverride }
        : conn;
      try {
        const resp = await callAI(effectiveConn, messages, true, imageBase64);
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
          onError(errHint);
          return;
        }
        await streamSSE(resp, onChunk, onDone, onError);
      } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
      }
    },
    [connections],
  );

  const sendMessageWithTools = useCallback(
    async (
      connectionId: string,
      messages: ChatMessage[],
      tools: OpenAITool[],
      mcpCallTool: (name: string, args: Record<string, any>) => Promise<string>,
      onStatus: (msg: string) => void,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
      imageBase64?: string,
      systemPromptOverride?: string,
    ) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) { onError('Connection not found'); return; }
      const effectiveConn = systemPromptOverride ? { ...conn, systemPrompt: systemPromptOverride } : conn;

      const baseUrl = effectiveConn.baseUrl || PROVIDER_DEFAULTS[effectiveConn.provider]?.baseUrl || '';
      const model = effectiveConn.model;
      const sysMessages: ChatMessage[] = effectiveConn.systemPrompt
        ? [{ role: 'system', content: effectiveConn.systemPrompt }]
        : [];

      const MAX_ROUNDS = 5;
      let workingMessages: ChatMessage[] = [...messages];

      for (let round = 0; round < MAX_ROUNDS; round++) {
        try {
          const resp = await resilientFetch(
            `${baseUrl}/chat/completions`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${effectiveConn.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [...sysMessages, ...workingMessages],
                tools: tools.length > 0 ? tools : undefined,
                tool_choice: tools.length > 0 ? 'auto' : undefined,
                stream: false,
              }),
            },
            { timeoutMs: 30_000, retries: 2, retryBaseMs: 1_000 },
          );

          if (!resp.ok) {
            const hint =
              resp.status === 401 || resp.status === 403
                ? 'API key invalid — check your connection settings.'
                : resp.status === 429
                ? 'Rate limited — try again shortly.'
                : `AI error (${resp.status})`;
            onError(hint);
            return;
          }

          const json = await resp.json();
          const choice = json.choices?.[0];
          if (!choice) { onError('No response from AI'); return; }

          const assistantMsg: ChatMessage = choice.message;

          if (choice.finish_reason === 'tool_calls' && assistantMsg?.tool_calls?.length) {
            workingMessages = [...workingMessages, assistantMsg];
            for (const tc of assistantMsg.tool_calls) {
              const toolName = tc.function?.name ?? '';
              const argsStr = tc.function?.arguments ?? '{}';
              onStatus(`🧠 ${toolName}…`);
              try {
                const args = JSON.parse(argsStr);
                const result = await mcpCallTool(toolName, args);
                workingMessages = [
                  ...workingMessages,
                  { role: 'tool', tool_call_id: tc.id, content: result },
                ];
              } catch (err: any) {
                workingMessages = [
                  ...workingMessages,
                  { role: 'tool', tool_call_id: tc.id, content: `Error: ${err.message}` },
                ];
              }
            }
            continue;
          }

          // Final answer — stream it for the streaming UX feel
          onStatus('');
          const streamResp = await resilientFetch(
            `${baseUrl}/chat/completions`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${effectiveConn.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [...sysMessages, ...workingMessages],
                stream: true,
              }),
            },
            { timeoutMs: 60_000, retries: 2, retryBaseMs: 1_000 },
          );
          if (!streamResp.ok) {
            // Fall back to delivering the already-fetched content
            onChunk(typeof assistantMsg?.content === 'string' ? assistantMsg.content : '');
            onDone();
            return;
          }
          await streamSSE(streamResp, onChunk, onDone, onError);
          return;

        } catch (err: any) {
          onError(err?.message ?? 'Request failed');
          return;
        }
      }

      // Max rounds hit — stream final answer without tools
      try {
        const fallback = await callAI(effectiveConn, workingMessages, true, imageBase64);
        if (!fallback.ok) { onError(`Error ${fallback.status}`); return; }
        await streamSSE(fallback, onChunk, onDone, onError);
      } catch (err: any) {
        onError(err?.message ?? 'Fallback error');
      }
    },
    [connections],
  );

  const activeConnection = connections.find((c) => c.isActive) ?? connections[0] ?? null;

  return (
    <AIContext.Provider value={{
      connections, activeConnection, serverGrokAvailable,
      addConnection, updateConnection, deleteConnection,
      setActiveConnection, addServerGrokConnection,
      testConnection, sendMessage, sendMessageWithTools,
    }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI(): AIContextValue {
  return useContext(AIContext);
}
