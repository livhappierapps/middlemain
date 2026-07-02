import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'offline';

interface NetworkState {
  isOnline: boolean;
  pingMs: number | null;
  quality: ConnectionQuality;
  lastChecked: Date | null;
  checkNow: () => void;
}

const PROBE_URL = 'https://1.1.1.1/dns-query?name=a.com&type=A';
const PROBE_INTERVAL_MS = 8_000;
const TIMEOUT_MS = 5_000;

function qualityFromPing(ping: number | null): ConnectionQuality {
  if (ping === null) return 'offline';
  if (ping < 300) return 'good';
  if (ping < 900) return 'fair';
  return 'poor';
}

const NetworkCtx = createContext<NetworkState>({
  isOnline: true,
  pingMs: null,
  quality: 'good',
  lastChecked: null,
  checkNow: () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const probe = useCallback(async () => {
    const start = Date.now();
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      await fetch(PROBE_URL, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' });
      clearTimeout(tid);
      const ms = Date.now() - start;
      setPingMs(ms);
      setIsOnline(true);
    } catch {
      clearTimeout(tid);
      setPingMs(null);
      setIsOnline(false);
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    probe();
    intervalRef.current = setInterval(probe, PROBE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [probe]);

  const quality = qualityFromPing(isOnline ? pingMs : null);

  return (
    <NetworkCtx.Provider value={{ isOnline, pingMs, quality, lastChecked, checkNow: probe }}>
      {children}
    </NetworkCtx.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkCtx);
}
