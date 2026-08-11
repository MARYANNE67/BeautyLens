/**
 * Auth state for the whole app.
 *
 * Responsibilities:
 *  - track the Firebase user across restarts (persistence is set up in
 *    src/config/firebase.ts)
 *  - expose sign-up / sign-in / sign-out / password-reset actions with
 *    human-readable errors instead of raw Firebase codes
 *  - exchange the signed-in identity for a backend profile via POST /auth/session,
 *    claiming this device's pre-auth profile so existing scans aren't orphaned
 *  - hand api.ts a token getter so authenticated requests carry a fresh ID token
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseProfile,
  type User,
} from 'firebase/auth';

import {
  FIREBASE_SETUP_HINT,
  getFirebaseAuth,
  isFirebaseConfigured,
  requireFirebaseAuth,
} from '../config/firebase';
import { AppConfig } from '../config/featureFlags';
import { createSession } from '../services/api';
import { registerTokenGetter } from '../services/authToken';
import {
  clearLocalProfile,
  getLocalProfileId,
  setLocalProfileId,
} from '../utils/profileStorage';
import type { AuthSession, ProfileOrigin } from '../types';

const API_BASE_URL = __DEV__ ? AppConfig.API_BASE_URL_DEV : AppConfig.API_BASE_URL_PROD;

interface AuthContextValue {
  user: User | null;
  /** True until the persisted session has been restored -- render a splash, not the login screen. */
  initializing: boolean;
  /** Backend profile id for the signed-in account, once /auth/session has run. */
  profileId: number | null;
  /** Whether this account's profile is brand new (needs onboarding) or already has history. */
  profileOrigin: ProfileOrigin | null;
  /** Set when /auth/session failed (e.g. backend down); the app can still retry. */
  sessionError: string | null;

  isConfigured: boolean;

  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Firebase surfaces machine-readable codes; users need sentences. Anything
 * unmapped falls through to the raw message so we never swallow a real error.
 */
function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email. Try signing in instead.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in your Firebase project yet.';
    default:
      return (error as Error)?.message || 'Something went wrong. Please try again.';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileOrigin, setProfileOrigin] = useState<ProfileOrigin | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Guards against two concurrent /auth/session calls (e.g. auth state fires
  // while a manual refresh is already in flight) creating duplicate profiles.
  const syncingRef = useRef(false);

  const syncSession = useCallback(async (): Promise<void> => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      // Only offer the local id as a claim candidate; the backend ignores it
      // unless that profile is genuinely unowned.
      const localProfileId = await getLocalProfileId();
      const session: AuthSession = await createSession(API_BASE_URL, localProfileId);

      if (session.profile_origin === 'created') {
        // Nothing was claimed, so any cached scan id belongs to a profile this
        // account doesn't own (or one that no longer exists). Drop it, or the
        // tabs would try to load a scan that resolves to 404.
        await clearLocalProfile();
      }

      await setLocalProfileId(session.profile_id);
      setProfileId(session.profile_id);
      setProfileOrigin(session.profile_origin);
      setSessionError(null);
    } catch (e) {
      setSessionError((e as Error).message || 'Could not reach the server.');
    } finally {
      syncingRef.current = false;
    }
  }, []);

  // Restore the persisted session and keep `user` in step with Firebase.
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setInitializing(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setInitializing(false);

      if (!nextUser) {
        setProfileId(null);
        setProfileOrigin(null);
        setSessionError(null);
      }
    });

    return unsubscribe;
  }, []);

  // Give api.ts a way to fetch a fresh token. getIdToken() serves the cached
  // token and auto-refreshes it near expiry, so this stays cheap per request.
  useEffect(() => {
    registerTokenGetter(user ? () => user.getIdToken() : null);
    return () => registerTokenGetter(null);
  }, [user]);

  // Exchange the identity for a backend profile once signed in.
  useEffect(() => {
    if (user && profileId == null) {
      void syncSession();
    }
  }, [user, profileId, syncSession]);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const auth = requireFirebaseAuth();
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        if (displayName?.trim()) {
          await updateFirebaseProfile(credential.user, { displayName: displayName.trim() });
        }
      } catch (e) {
        throw new Error(friendlyAuthError(e));
      }
    },
    []
  );

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = requireFirebaseAuth();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const auth = requireFirebaseAuth();
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    // Clear device state first: if the network call hiccups, the next account
    // still starts clean rather than inheriting stale ids.
    await clearLocalProfile();
    setProfileId(null);
    setProfileOrigin(null);
    setSessionError(null);
    if (auth) await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      profileId,
      profileOrigin,
      sessionError,
      isConfigured: isFirebaseConfigured,
      signUpWithEmail,
      signInWithEmail,
      sendPasswordReset,
      signOut,
      refreshSession: syncSession,
    }),
    [
      user,
      initializing,
      profileId,
      profileOrigin,
      sessionError,
      signUpWithEmail,
      signInWithEmail,
      sendPasswordReset,
      signOut,
      syncSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>. Check src/app/_layout.tsx.');
  }
  return context;
}

export { FIREBASE_SETUP_HINT };
