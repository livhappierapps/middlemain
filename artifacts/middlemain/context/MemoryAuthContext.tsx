import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { useSignInWithApple } from '@clerk/expo/apple';
import { tokenCache } from '@clerk/expo/token-cache';
import { setMemoryTokenGetter } from '@/utils/memoryToken';
import { syncMemoryConfigOnLaunch } from '@/utils/memoryMachineSettings';

/**
 * Sign in with Apple -> Clerk, only for Memory Machine. Optional: without
 * EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY the app runs exactly as before.
 * Clerk keeps the session in SecureStore (tokenCache) and refreshes the
 * short-lived JWT silently, so there are no re-auth prompts mid-chat.
 */
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';

export interface MemoryAuthValue {
  /** Clerk is configured in this build. */
  available: boolean;
  /** Native Sign in with Apple is possible here (iOS + configured). */
  appleAvailable: boolean;
  loaded: boolean;
  signedIn: boolean;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DISABLED: MemoryAuthValue = {
  available: false,
  appleAvailable: false,
  loaded: true,
  signedIn: false,
  signInWithApple: async () => {
    throw new Error('Sign in with Apple is not set up in this build yet.');
  },
  signOut: async () => {},
};

const Ctx = createContext<MemoryAuthValue>(DISABLED);

export function useMemoryAuth(): MemoryAuthValue {
  return useContext(Ctx);
}

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { startAppleAuthenticationFlow } = useSignInWithApple();

  useEffect(() => {
    setMemoryTokenGetter(isLoaded && isSignedIn ? () => getToken() : null);
    return () => setMemoryTokenGetter(null);
  }, [isLoaded, isSignedIn, getToken]);

  const signInWithApple = useCallback(async () => {
    const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
    if (createdSessionId && setActive) await setActive({ session: createdSessionId });
  }, [startAppleAuthenticationFlow]);

  const value = useMemo<MemoryAuthValue>(() => ({
    available: true,
    appleAvailable: Platform.OS === 'ios',
    loaded: isLoaded,
    signedIn: !!isSignedIn,
    signInWithApple,
    signOut: async () => { await signOut(); },
  }), [isLoaded, isSignedIn, signInWithApple, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function MemoryAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { void syncMemoryConfigOnLaunch(); }, []);
  if (!PUBLISHABLE_KEY) return <Ctx.Provider value={DISABLED}>{children}</Ctx.Provider>;
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
