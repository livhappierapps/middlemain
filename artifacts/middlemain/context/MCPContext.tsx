import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = '@middlemain_mcp_v1';

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
}

export type MCPStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface MCPContextValue {
  config: MCPConfig;
  updateConfig: (patch: Partial<MCPConfig>) => void;
  status: MCPStatus;
  errorMsg: string | null;
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
    const text = await resp.text().catch(() => '');
    throw new Error(`MCP ${resp.status}${text ? ': ' + text.slice(0, 160) : ''}`);
  }
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? 'MCP error');
  return json.result;
}

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<MCPConfig>({ url: '', token: '' });
  const [status, setStatus] = useState<MCPStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tools, setTools] = useState<MCPTool[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setConfigState(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const updateConfig = useCallback((patch: Partial<MCPConfig>) => {
    setConfigState((prev) => {
      const next = {
        ...prev,
        ...patch,
        ...(patch.url !== undefined ? { url: patch.url.trim() } : {}),
        ...(patch.token !== undefined ? { token: patch.token.trim().replace(/^Bearer\s+/i, '') } : {}),
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    const url = config.url.trim().replace(/\/$/, '');
    const token = config.token.trim().replace(/^Bearer\s+/i, '');
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
  }, [config]);

  const disconnect = useCallback(() => {
    setStatus('idle');
    setErrorMsg(null);
    setTools([]);
  }, []);

  const callTool = useCallback(async (name: string, args: Record<string, any>): Promise<string> => {
    const url = config.url.trim().replace(/\/$/, '');
    const token = config.token.trim().replace(/^Bearer\s+/i, '');
    const result = await mcpRequest(url, token, 'tools/call', { name, arguments: args });
    if (Array.isArray(result?.content)) {
      return result.content.map((c: any) => (c.text ?? JSON.stringify(c))).join('\n');
    }
    if (typeof result === 'string') return result;
    return JSON.stringify(result);
  }, [config]);

  return (
    <MCPCtx.Provider value={{ config, updateConfig, status, errorMsg, tools, connect, disconnect, callTool }}>
      {children}
    </MCPCtx.Provider>
  );
}
