import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@bgym/shared';
import { ApiError, authApi, hasStoredSession, refreshSession, saveTokens, setSessionEndedHandler } from './api';
import { secureStorage } from './secure-storage';

/**
 * Who is signed in, and where they search for gyms.
 * Tokens are handled by lib/api (access token in memory, refresh token in secure storage).
 */
export type SessionStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'ready';

export interface SearchArea {
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
}

interface SessionContextValue {
  status: SessionStatus;
  user: AuthUser | null;
  pendingEmail: string | null;
  area: SearchArea | null;
  /** Sends a sign-in code. Resolves with the seconds to wait before a resend. */
  startEmailSignIn: (email: string) => Promise<number>;
  resendCode: () => Promise<number>;
  /**
   * Checks the code with the server. Resolves with `activate`, which signs the person in;
   * the screen calls it after its success animation so navigation never cuts it short.
   */
  verifyCode: (code: string) => Promise<() => void>;
  completeOnboarding: (area: SearchArea) => Promise<void>;
  signOut: () => Promise<void>;
}

const USER_KEY = 'bgym.user.v1';
const AREA_KEY = 'bgym.area.v1';
const SessionContext = createContext<SessionContextValue | null>(null);

const readJson = async <T,>(key: string): Promise<T | null> => {
  const raw = await secureStorage.get(key).catch(() => null);
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [area, setArea] = useState<SearchArea | null>(null);

  const reset = useCallback(async () => {
    await Promise.all([secureStorage.remove(USER_KEY), secureStorage.remove(AREA_KEY)]).catch(() => undefined);
    setUser(null);
    setArea(null);
    setStatus('signedOut');
  }, []);

  // Restore on launch. Offline launches keep the cached profile so people aren't signed out
  // just because they have no signal; a rejected session signs them out.
  useEffect(() => {
    setSessionEndedHandler(() => void reset());
    (async () => {
      if (!(await hasStoredSession())) return setStatus('signedOut');
      const [cachedUser, savedArea] = await Promise.all([readJson<AuthUser>(USER_KEY), readJson<SearchArea>(AREA_KEY)]);
      try {
        if (!(await refreshSession())) return;
        const fresh = await authApi.me();
        await secureStorage.set(USER_KEY, JSON.stringify(fresh));
        setUser(fresh);
      } catch (err) {
        if (!(err instanceof ApiError && err.isNetwork) || !cachedUser) return void reset();
        setUser(cachedUser);
      }
      setArea(savedArea);
      setStatus(savedArea ? 'ready' : 'needsOnboarding');
    })().catch(() => void reset());
  }, [reset]);

  const startEmailSignIn = useCallback(async (email: string) => {
    const res = await authApi.requestEmailCode(email);
    setPendingEmail(email);
    return res.retryAfterSeconds;
  }, []);

  const resendCode = useCallback(async () => {
    if (!pendingEmail) throw new Error('Start again with your email');
    return (await authApi.requestEmailCode(pendingEmail)).retryAfterSeconds;
  }, [pendingEmail]);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!pendingEmail) throw new Error('Start again with your email');
      const session = await authApi.verifyEmailCode(pendingEmail, code);
      await saveTokens(session);
      await secureStorage.set(USER_KEY, JSON.stringify(session.user));
      const savedArea = session.isNewUser ? null : await readJson<SearchArea>(AREA_KEY);
      return () => {
        setUser(session.user);
        setArea(savedArea);
        setPendingEmail(null);
        setStatus(savedArea ? 'ready' : 'needsOnboarding');
      };
    },
    [pendingEmail],
  );

  const completeOnboarding = useCallback(async (next: SearchArea) => {
    await secureStorage.set(AREA_KEY, JSON.stringify(next));
    setArea(next);
    setStatus('ready');
  }, []);

  const signOut = useCallback(async () => {
    await authApi.signOut();
    await reset();
  }, [reset]);

  const value = useMemo(
    () => ({ status, user, pendingEmail, area, startEmailSignIn, resendCode, verifyCode, completeOnboarding, signOut }),
    [status, user, pendingEmail, area, startEmailSignIn, resendCode, verifyCode, completeOnboarding, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
