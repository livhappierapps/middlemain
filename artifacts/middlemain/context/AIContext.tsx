import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetch } from 'expo/fetch';

export type AIProvider = 'xai' | 'openai' | 'anthropic' | 'custom';

export interface AIConnection {
  id: string;
  name: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  isActive: boolean;
  lastTested?: string;
  testStatus?: 'ok' | 'error' | 'untested';
}

export const PROVIDER_DEFAULTS: Record<AIProvider, { baseUrl: string; model: string; label: string }> = {
  xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-3', label: 'Grok (xAI)' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', label: 'OpenAI' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022', label: 'Anthropic' },
  custom: { baseUrl: '', model: '', label: 'Custom API' },
};

interface AIContextValue {
  connections: AIConnection[];
  activeConnection: AIConnection | null;
  addConnection: (conn: Omit<AIConnection, 'id'>) => string;
  updateConnection: (id: string, updates: Partial<AIConnection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  sendMessage: (
    connectionId: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) => Promise<void>;
}

const STORAGE_KEY = '@middlemain_connections';

const AIContext = createContext<AIContextValue>({
  connections: [],
  activeConnection: null,
  addConnection: () => '',
  updateConnection: () => {},
  deleteConnection: () => {},
  setActiveConnection: () => {},
  testConnection: async () => false,
  sendMessage: async () => {},
});

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function callAI(
  conn: AIConnection,
  messages: { role: string; content: string }[],
  stream: boolean,
): Promise<Response> {
  const baseUrl = conn.baseUrl || PROVIDER_DEFAULTS[conn.provider].baseUrl;

  if (conn.provider === 'anthropic') {
    return fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': conn.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: conn.model,
        max_tokens: 1024,
        stream,
        messages,
      }),
    });
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${conn.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: conn.model,
      messages: [
        ...(conn.systemPrompt ? [{ role: 'system', content: conn.systemPrompt }] : []),
        ...messages,
      ],
      stream,
    }),
  });
}

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<AIConnection[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          setConnections(JSON.parse(data));
        } catch {}
      }
    });
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
    (id: string, updates: Partial<AIConnection>) => {
      persist(connections.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    },
    [connections, persist],
  );

  const deleteConnection = useCallback(
    (id: string) => {
      persist(connections.filter((c) => c.id !== id));
    },
    [connections, persist],
  );

  const setActiveConnection = useCallback(
    (id: string) => {
      persist(connections.map((c) => ({ ...c, isActive: c.id === id })));
    },
    [connections, persist],
  );

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
      messages: { role: string; content: string }[],
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) {
        onError('Connection not found');
        return;
      }
      try {
        const resp = await callAI(conn, messages, true);
        if (!resp.ok) {
          const text = await resp.text();
          onError(`API error ${resp.status}: ${text.slice(0, 200)}`);
          return;
        }
        const reader = resp.body?.getReader();
        if (!reader) {
          onError('Streaming not supported');
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
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
              const content =
                json.choices?.[0]?.delta?.content ||
                json.delta?.text ||
                '';
              if (content) onChunk(content);
            } catch {}
          }
        }
        onDone();
      } catch (e: any) {
        onError(e?.message ?? 'Unknown error');
      }
    },
    [connections],
  );

  const activeConnection = connections.find((c) => c.isActive) ?? connections[0] ?? null;

  return (
    <AIContext.Provider
      value={{
        connections,
        activeConnection,
        addConnection,
        updateConnection,
        deleteConnection,
        setActiveConnection,
        testConnection,
        sendMessage,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAI(): AIContextValue {
  return useContext(AIContext);
}
