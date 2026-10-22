import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createCredentialStore,
  parseMCPCredentialMetadata,
  readOrMigrateCredential,
  serializeMCPCredentialMetadata,
  type CredentialState,
} from '@/utils/secureCredentialStore';

const STORAGE_KEY = '@middlemain_mcp_v1';
const MCP_CREDENTIAL_STORAGE_ERROR =
  'Could not protect the saved Memory Machine token in device secure storage. Existing settings were preserved; keep the app installed and try again.';
const credentialStore = createCredentialStore(
  Platform.OS,
  () => import('expo-secure-store'),
);

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPConfig {
  url: string;
  token: string;
  credentialState?: CredentialState;
}

export type MCPStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface MCPContextValue {
  config: MCPConfig;
  updateConfig: (patch: Partial<MCPConfig>) => void;
  status: MCPStatus;
  errorMsg: string | null;
  credentialStorageReady: boolean;
  credentialStorageError: string | null;
  tools: MCPTool[];
  connect: () => Promise<void>;
  disconnect: () => void;
  callTool: (name: string, args: Record<string, any>) => Promise<string>;
}

const MCPCtx = createContext<MCPContextValue | null>(null);

export function useMCP() {
  const ctx = useContext(MCPCtx);
  if (!ctx) throw new Error('useMCP must be inside MCPProvider');
  return ctx;
}

async function mcpRequest(url: string, token: string, method: string, params?: any): Promise<any> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {}, id: 1 }),
  });
  if (!resp.ok) {
    throw new Error(`MCP request failed with HTTP ${resp.status}.`);
  }
  const json = await resp.json();
  if (json.error) throw new Error('Memory Machine returned a JSON-RPC error.');
  return json.result;
}

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<MCPConfig>({ url: '', token: '', credentialState: 'cleared' });
  const configRef = useRef<MCPConfig>({ url: '', token: '', credentialState: 'cleared' });
  const [status, setStatus] = useState<MCPStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [credentialStorageReady, setCredentialStorageReady] = useState(false);
  const [credentialStorageError, setCredentialStorageError] = useState<string | null>(null);
  const credentialStorageErrorRef = useRef<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());

  const reportCredentialStorageError = useCallback((message: string | null) => {
    credentialStorageErrorRef.current = message;
    setCredentialStorageError(message);
  }, []);

  const queueCredentialStorage = useCallback((operation: () => Promise<void>) => {
    const next = persistenceQueue.current.then(operation, operation);
    persistenceQueue.current = next.then(
      () => reportCredentialStorageError(null),
      () => reportCredentialStorageError(MCP_CREDENTIAL_STORAGE_ERROR),
    );
  }, [reportCredentialStorageError]);

  useEffect(() => {
    let cancelled = false;
    queueCredentialStorage(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = parseMCPCredentialMetadata(raw);
      const credential = await readOrMigrateCredential(
        credentialStore,
        'memory-mcp',
        'primary',
        saved.legacyToken,
        saved.credentialState,
      );
      const hydrated: MCPConfig = {
        url: saved.url,
        token: credential.value,
        credentialState: credential.state,
      };

      // Persist only non-secret settings after the secure credential is available.
      await AsyncStorage.setItem(
        STORAGE_KEY,
        serializeMCPCredentialMetadata(hydrated.url, credential.state),
      );
      if (!cancelled) {
        configRef.current = hydrated;
        setConfigState(hydrated);
        setCredentialStorageReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [queueCredentialStorage]);

  const updateConfig = useCallback((patch: Partial<MCPConfig>) => {
    if (!credentialStorageReady) return;
    const previous = configRef.current;
    const next: MCPConfig = {
      ...previous,
      ...patch,
      ...(patch.url !== undefined ? { url: patch.url.trim() } : {}),
      ...(patch.token !== undefined ? { token: patch.token.trim().replace(/^Bearer\s+/i, '') } : {}),
    };
    if (patch.token !== undefined) {
      next.credentialState = next.token ? 'secure' : 'cleared';
    }
    configRef.current = next;
    setConfigState(next);

    queueCredentialStorage(async () => {
      const token = next.token.trim();
      const state = next.credentialState ?? (token ? 'secure' : 'cleared');
      if (patch.token !== undefined && !token) {
        // Save the tombstone before deleting so an old value cannot be restored.
        await AsyncStorage.setItem(STORAGE_KEY, serializeMCPCredentialMetadata(next.url, 'cleared'));
        await credentialStore.delete('memory-mcp', 'primary');
        return;
      }
      if (patch.token !== undefined && token) {
        await credentialStore.set('memory-mcp', 'primary', token);
      }
      await AsyncStorage.setItem(STORAGE_KEY, serializeMCPCredentialMetadata(next.url, state));
    });
  }, [credentialStorageReady, queueCredentialStorage]);

  const connect = useCallback(async () => {
    if (!credentialStorageReady) {
      setErrorMsg(credentialStorageErrorRef.current ?? 'Memory Machine settings are still being secured. Please wait and try again.');
      setStatus('error');
      return;
    }
    await persistenceQueue.current;
    if (credentialStorageErrorRef.current) {
      setErrorMsg(MCP_CREDENTIAL_STORAGE_ERROR);
      setStatus('error');
      return;
    }
    const current = configRef.current;
    const url = current.url.trim().replace(/\/$/, '');
    const token = current.token.trim().replace(/^Bearer\s+/i, '');
    if (!url) { setErrorMsg('Enter the Memory Machine URL first.'); setStatus('error'); return; }
    if (!token) { setErrorMsg('Enter the MCP token first.'); setStatus('error'); return; }
    setStatus('connecting');
    setErrorMsg(null);
    try {
      const result = await mcpRequest(url, token, 'tools/list');
      const toolList: MCPTool[] = (result?.tools ?? []).map((t: any) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
      }));
      setTools(toolList);
      setStatus('connected');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Connection failed');
    }
  }, [credentialStorageReady]);

  const disconnect = useCallback(() => {
    setStatus('idle');
    setErrorMsg(null);
    setTools([]);
  }, []);

  const callTool = useCallback(async (name: string, args: Record<string, any>): Promise<string> => {
    if (!credentialStorageReady) throw new Error('Memory Machine settings are still being secured.');
    await persistenceQueue.current;
    if (credentialStorageErrorRef.current) throw new Error(MCP_CREDENTIAL_STORAGE_ERROR);
    const current = configRef.current;
    const url = current.url.trim().replace(/\/$/, '');
    const token = current.token.trim().replace(/^Bearer\s+/i, '');
    const result = await mcpRequest(url, token, 'tools/call', { name, arguments: args });
    if (Array.isArray(result?.content)) {
      return result.content.map((c: any) => (c.text ?? JSON.stringify(c))).join('\n');
    }
    if (typeof result === 'string') return result;
    return JSON.stringify(result);
  }, [credentialStorageReady]);

  return (
    <MCPCtx.Provider value={{
      config, updateConfig, status, errorMsg, credentialStorageReady, credentialStorageError,
      tools, connect, disconnect, callTool,
    }}>
      {children}
    </MCPCtx.Provider>
  );
}
