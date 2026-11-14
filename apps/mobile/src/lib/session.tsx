import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session state for the app.
 *
 * PREVIEW: there is no server verification yet. Phase 1 replaces `verifyCode` with
 * POST /v1/auth/email/verify and stores short-lived access + rotating refresh tokens here
 * (SecureStore = iOS Keychain / Android Keystore). Nothing sensitive is stored today.
 */
export type SessionStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'ready';

export interface SearchArea {
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
}

interface StoredSession {
  email: string;
  area?: SearchArea;
}

interface SessionContextValue {
  status: SessionStatus;
  email: string | null;
  pendingEmail: string | null;
  area: SearchArea | null;
  startEmailSignIn: (email: string) => void;
  verifyCode: (code: string) => Promise<void>;
  completeOnboarding: (area: SearchArea) => Promise<void>;
  signOut: () => Promise<void>;
}

const KEY = 'bgym.session.v1';
const SessionContext = createContext<SessionContextValue | null>(null);

// SecureStore is native-only; on web (dev preview) fall back to memory.
const storage = {
  get: () => (Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(KEY)),
  set: (v: string) => (Platform.OS === 'web' ? Promise.resolve() : SecureStore.setItemAsync(KEY, v)),
  clear: () => (Platform.OS === 'web' ? Promise.resolve() : SecureStore.deleteItemAsync(KEY)),
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [area, setArea] = useState<SearchArea | null>(null);

  useEffect(() => {
    storage
      .get()
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as StoredSession) : null;
        if (!saved?.email) return setStatus('signedOut');
        setEmail(saved.email);
        setArea(saved.area ?? null);
        setStatus(saved.area ? 'ready' : 'needsOnboarding');
      })
      .catch(() => setStatus('signedOut'));
  }, []);

  const startEmailSignIn = useCallback((value: string) => setPendingEmail(value), []);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!pendingEmail || !/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code');
      await storage.set(JSON.stringify({ email: pendingEmail } satisfies StoredSession));
      setEmail(pendingEmail);
      setPendingEmail(null);
      setStatus('needsOnboarding');
    },
    [pendingEmail],
  );

  const completeOnboarding = useCallback(
    async (next: SearchArea) => {
      if (!email) return;
      await storage.set(JSON.stringify({ email, area: next } satisfies StoredSession));
      setArea(next);
      setStatus('ready');
    },
    [email],
  );

  const signOut = useCallback(async () => {
    await storage.clear();
    setEmail(null);
    setArea(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({ status, email, pendingEmail, area, startEmailSignIn, verifyCode, completeOnboarding, signOut }),
    [status, email, pendingEmail, area, startEmailSignIn, verifyCode, completeOnboarding, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
